/* eslint-disable no-constant-condition */
import { fromBER, OctetString, Integer, Sequence } from "asn1js";
import * as pkijs from "pkijs";

// --- 辅助类型 ---
interface Env {
  STORE: R2Bucket;
  SITE_NAME?: string;
}

type RouteHandler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

// 初始化 PKIjs 的 WebCrypto 引擎（Cloudflare Workers 原生支持 crypto.subtle）
pkijs.setEngine(
  "cloudflare",
  new pkijs.CryptoEngine({ name: "cloudflare", crypto, subtle: crypto.subtle }),
);

// --- 工具函数 ---
const b2ab = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b.buffer : b);

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(data: ArrayBuffer | Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", b2ab(data));
  return toHex(d);
}

function parseCertificate(der: ArrayBuffer) {
  const asn1 = fromBER(der);
  if (asn1.offset === -1) throw new Error("Bad certificate DER");
  return new pkijs.Certificate({ schema: asn1.result });
}

function parseCRL(der: ArrayBuffer) {
  const asn1 = fromBER(der);
  if (asn1.offset === -1) throw new Error("Bad CRL DER");
  return new pkijs.CertificateRevocationList({ schema: asn1.result });
}

function getCN(cert: pkijs.Certificate): string | undefined {
  for (const rdn of cert.subject.typesAndValues) {
    if (rdn.type === "2.5.4.3") return rdn.value.valueBlock.value;
  }
  return undefined;
}

function getSKIHex(cert: pkijs.Certificate): string | undefined {
  const ext = cert.extensions?.find(e => e.extnID === "2.5.29.14"); // SKI
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const raw = asn1.result as OctetString;
  return toHex(raw.valueBlock.valueHex);
}

function getCRLAKIHex(crl: pkijs.CertificateRevocationList): string | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.35"); // AKI
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex); // SEQUENCE
  const seq = asn1.result as Sequence;
  const first = seq.valueBlock.value[0];
  if (!first || first.idBlock.tagClass !== 3 || first.idBlock.tagNumber !== 0) return undefined;
  // @ts-ignore implicit [0] OCTET STRING has valueHex
  return toHex(first.valueBlock.valueHex);
}

function getCRLNumber(crl: pkijs.CertificateRevocationList): bigint | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.20"); // CRLNumber
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const int = asn1.result as Integer;
  const bytes = new Uint8Array(int.valueBlock.valueHex);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

function friendlyNameFromCert(cert: pkijs.Certificate): string {
  const cn = getCN(cert);
  if (cn) return cn.replace(/[^\w.-]+/g, "").replace(/\s+/g, "");
  const ski = getSKIHex(cert);
  return ski ? `CA-${ski.slice(0, 16)}` : `CA-${Date.now()}`;
}

function contentTypeByKey(key: string) {
  if (key.endsWith(".crt")) return "application/pkix-cert";
  if (key.endsWith(".crl")) return "application/pkix-crl";
  if (key.endsWith(".pem") || key.endsWith(".crt.pem") || key.endsWith(".crl.pem"))
    return "application/x-pem-file";
  // 默认二进制
  return "application/octet-stream";
}

// 更安全地设置响应头（避免访问不存在的属性）
function httpHeadersForBinary(obj: R2ObjectBody | R2Object, key: string) {
  const h = new Headers();
  h.set("Content-Type", contentTypeByKey(key));

  // R2ObjectBody / R2Object 里有 etag（不是 httpEtag）
  // 某些情况下可能没有：要检查是 string 再设置
  const anyObj = obj as any;
  const etag: unknown = anyObj?.etag ?? anyObj?.httpEtag;
  if (typeof etag === "string" && etag.length > 0) h.set("ETag", etag);

  const uploaded: unknown = anyObj?.uploaded;
  if (uploaded instanceof Date) h.set("Last-Modified", uploaded.toUTCString());

  // 缓存策略：证书长缓存；CRL 短缓存需重验证；PEM 沿用对应类型策略
  if (key.endsWith(".crt") || key.endsWith(".crt.pem"))
    h.set("Cache-Control", "public, max-age=31536000, immutable");
  else if (key.endsWith(".crl") || key.endsWith(".crl.pem"))
    h.set("Cache-Control", "public, max-age=3600, must-revalidate");
  else h.set("Cache-Control", "public, max-age=300");
  return h;
}

async function listCACandidates(env: Env): Promise<Array<{ key: string; der: ArrayBuffer; cert: pkijs.Certificate }>> {
  const out: Array<{ key: string; der: ArrayBuffer; cert: pkijs.Certificate }> = [];
  let cursor: string | undefined;
  do {
    const listing = await env.STORE.list({ prefix: "ca/", cursor });
    cursor = listing.truncated ? listing.cursor : undefined;
    for (const obj of listing.objects) {
      if (!obj.key.endsWith(".crt")) continue; // 只从 DER 证书中解析
      const file = await env.STORE.get(obj.key);
      if (!file) continue;
      const der = await file.arrayBuffer();
      try {
        const cert = parseCertificate(der);
        out.push({ key: obj.key, der, cert });
      } catch (e) {
        console.warn("Skip bad cert:", obj.key, String(e));
      }
    }
  } while (cursor);
  console.log("CA candidates:", out.map(c => ({ key: c.key, cn: getCN(c.cert), ski: getSKIHex(c.cert) })));
  return out;
}

async function findIssuerCertForCRL(env: Env, crl: pkijs.CertificateRevocationList) {
  const akiHex = getCRLAKIHex(crl);
  console.log("CRL AKI:", akiHex);
  const candidates = await listCACandidates(env);
  if (akiHex) {
    for (const c of candidates) {
      const ski = getSKIHex(c.cert);
      if (ski && ski.toLowerCase() === akiHex.toLowerCase()) {
        console.log("Issuer matched by AKI/SKI:", c.key);
        return c;
      }
    }
  }
  const issuerDN = crl.issuer.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(",");
  for (const c of candidates) {
    const subjDN = c.cert.subject.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(",");
    if (issuerDN === subjDN) {
      console.log("Issuer matched by DN:", c.key);
      return c;
    }
  }
  console.warn("Issuer not found. issuerDN =", issuerDN);
  return undefined;
}

async function verifyCRLWithIssuer(crl: pkijs.CertificateRevocationList, issuer: pkijs.Certificate) {
  try {
    const ok = await crl.verify({ issuerCertificate: issuer });
    return ok === true;
  } catch (e) {
    console.error("crl.verify threw:", e);
    return false;
  }
}

async function getExistingCRL(env: Env, key: string) {
  const obj = await env.STORE.get(key);
  if (!obj) return undefined;
  const der = await obj.arrayBuffer();
  const parsed = parseCRL(der);
  return { obj, der, parsed };
}

function isNewerCRL(incoming: pkijs.CertificateRevocationList, existing?: pkijs.CertificateRevocationList) {
  if (!existing) return true;
  const nNew = getCRLNumber(incoming);
  const nOld = getCRLNumber(existing);
  if (nNew !== undefined && nOld !== undefined) {
    if (nNew > nOld) return true;
    if (nNew < nOld) return false;
  }
  const tNew = incoming.thisUpdate?.toDate();
  const tOld = existing.thisUpdate?.toDate();
  if (tNew && tOld) return tNew.getTime() > tOld.getTime();
  return false; // 保守：非严格更新则拒绝
}

async function putBinary(env: Env, key: string, data: ArrayBuffer | Uint8Array, meta?: Record<string, string>) {
  console.log("PUT", key, "meta:", meta);
  return env.STORE.put(key, data, { httpMetadata: {}, customMetadata: meta });
}

// 解析 PEM（不做 GET 转换，仅 POST 用于验签/落盘）
function extractPEMBlock(pemText: string, begin: string, end: string): Uint8Array {
  const re = new RegExp(`${begin}[\\s\\S]*?${end}`, "g");
  const match = pemText.match(re);
  if (!match || match.length === 0) throw new Error(`PEM block not found: ${begin} ... ${end}`);
  const block = match[0];
  const base64Body = block
    .replace(begin, "")
    .replace(end, "")
    .replace(/[\r\n\s]/g, "");
  const bin = atob(base64Body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// --- 路由实现 ---
const getFile: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  // 仅允许 /ca/* 与 /crl/*
  if (!/^\/(ca|crl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 });

  const key = url.pathname.replace(/^\/+/, "");
  console.log("GET", key);

  // 禁止 GET 上的 DER/PEM 转换：严格按对象后缀直出
  const obj = await env.STORE.get(key);
  if (!obj) {
    console.warn("R2 object NOT FOUND:", key);
    return new Response("Not Found", { status: 404 });
  }

  const hdr = httpHeadersForBinary(obj, key);
  return new Response(await obj.arrayBuffer(), { status: 200, headers: hdr });
};

const postCRL: RouteHandler = async (req, env) => {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  // 现在按你的新要求：POST 上传 PEM（不再要求 application/pkix-crl）
  if (!ct.includes("pem") && !ct.includes("text") && !ct.includes("plain") && !ct.includes("x-pem-file")) {
    return new Response(
      JSON.stringify({ error: "Expect PEM CRL. Content-Type should be text/plain or application/x-pem-file" }),
      { status: 415, headers: { "Content-Type": "application/json" } },
    );
  }

  let pemText = "";
  try {
    pemText = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "Bad request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let derBytes: Uint8Array;
  try {
    derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
  } catch (e) {
    console.error("PEM parse error:", e);
    return new Response(JSON.stringify({ error: "Invalid CRL PEM" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let crl: pkijs.CertificateRevocationList;
  try {
    crl = parseCRL(derBytes.buffer);
  } catch (e) {
    console.error("CRL parse error:", e);
    return new Response(JSON.stringify({ error: "Bad CRL DER after PEM decode" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 找发行者证书
  const issuer = await findIssuerCertForCRL(env, crl);
  if (!issuer) {
    return new Response(JSON.stringify({ error: "Issuer certificate not found (by AKI/SKI or DN)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 校验签名
  const ok = await verifyCRLWithIssuer(crl, issuer.cert);
  if (!ok) {
    return new Response(JSON.stringify({ error: "CRL signature invalid for resolved issuer" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 生成逻辑名：基于 Issuer CN（清理字符），并保留你的 Issuing/Root 兼容逻辑
  const friendly = friendlyNameFromCert(issuer.cert)
    .replace(/IssuingCA/gi, "IssuingCA")
    .replace(/RootCA/gi, "RootCA");
  const logicalBase = /Issuing/i.test(friendly) ? "AchaIssuingCA01" : "AchaRootCA";

  const logicalDERKey = `crl/${logicalBase}.crl`;
  const logicalPEMKey = `crl/${logicalBase}.crl.pem`;
  const byAkiKey = (() => {
    const aki = getCRLAKIHex(crl);
    return aki ? `crl/by-keyid/${aki}.crl` : undefined;
  })();

  // 现存 CRL 比较版本
  const existing = await getExistingCRL(env, logicalDERKey);
  if (!isNewerCRL(crl, existing?.parsed)) {
    return new Response(JSON.stringify({ status: "ignored", reason: "CRL not newer" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 归档旧版本
  if (existing) {
    const oldNum = getCRLNumber(existing.parsed);
    const oldTag = oldNum !== undefined ? oldNum.toString() : (await sha256Hex(existing.der)).slice(0, 16);
    await putBinary(env, `crl/archive/${friendly}-${oldTag}.crl`, existing.der, {
      issuerCN: getCN(issuer.cert) || "",
      archivedAt: new Date().toISOString(),
    });
  }

  // 写入新 CRL（同时保存 PEM 与 DER）
  const crlNum = getCRLNumber(crl);
  const meta: Record<string, string> = {
    issuerCN: getCN(issuer.cert) || "",
    issuerKeyId: getSKIHex(issuer.cert) || "",
    crlNumber: crlNum !== undefined ? crlNum.toString() : "",
    thisUpdate: crl.thisUpdate?.toDate()?.toISOString() || "",
    nextUpdate: crl.nextUpdate?.toDate()?.toISOString() || "",
  };
  await putBinary(env, logicalDERKey, derBytes, meta);
  await putBinary(env, logicalPEMKey, new TextEncoder().encode(pemText), meta);
  if (byAkiKey) await putBinary(env, byAkiKey, derBytes, meta);

  return new Response(
    JSON.stringify({
      status: "ok",
      stored: { der: logicalDERKey, pem: logicalPEMKey },
      byAki: byAkiKey || null,
      crlNumber: meta.crlNumber || null,
      thisUpdate: meta.thisUpdate || null,
      nextUpdate: meta.nextUpdate || null,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};

const indexPage: RouteHandler = async (_req, env) => {
  const title = env.SITE_NAME || "Acha PKI AIA/CDP";
  const html = `<!doctype html><meta charset="utf-8">
<title>${title}</title>
<h1>${title}</h1>
<ul>
<li><a href="/ca/AchaRootCA_ECC-P384.crt">Root CA (DER)</a> | <a href="/ca/AchaRootCA_ECC-P384.crt.pem">PEM</a></li>
<li><a href="/ca/AchaIssuingCA01_RSA-4096.crt">Issuing CA 01 (DER)</a> | <a href="/ca/AchaIssuingCA01_RSA-4096.crt.pem">PEM</a></li>
<li><a href="/crl/AchaRootCA.crl">Root CRL (DER)</a> | <a href="/crl/AchaRootCA.crl.pem">PEM</a></li>
<li><a href="/crl/AchaIssuingCA01.crl">Issuing CRL (DER)</a> | <a href="/crl/AchaIssuingCA01.crl.pem">PEM</a></li>
</ul>
<p>POST new CRL (PEM) to <code>/crl</code> with <code>Content-Type: application/x-pem-file</code> or <code>text/plain</code>.</p>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
};

// --- 主入口 ---
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = req;
    const url = new URL(req.url);

    try {
      if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return indexPage(req, env, ctx);
      }
      if (method === "GET" && /^\/(ca|crl)\//.test(url.pathname)) {
        return getFile(req, env, ctx);
      }
      if (method === "POST" && url.pathname === "/crl") {
        return postCRL(req, env, ctx);
      }
      if (method === "HEAD" && /^\/(ca|crl)\//.test(url.pathname)) {
        // 通过 GET 取元信息并回头
        const r = await getFile(new Request(req, { method: "GET" }), env, ctx);
        return new Response(null, { status: r.status, headers: r.headers });
      }
      return new Response("Not Found", { status: 404 });
    } catch (e) {
      console.error("Unhandled error:", e);
      return new Response(JSON.stringify({ error: "internal_error", detail: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
