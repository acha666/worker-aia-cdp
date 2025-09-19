/* eslint-disable no-constant-condition */
import { fromBER, OctetString, Integer, Sequence } from "asn1js";
import * as pkijs from "pkijs";

/** ---------- Env / Types ---------- */
interface Env {
  STORE: R2Bucket;
  SITE_NAME?: string;
  ASSETS: Fetcher;          // ★ 新增：Assets 绑定
}
type RouteHandler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** ---------- PKIjs 引擎 ---------- */
pkijs.setEngine(
  "cloudflare",
  new pkijs.CryptoEngine({ name: "cloudflare", crypto, subtle: crypto.subtle }),
);

/** ---------- 缓存参数 ---------- */
const LIST_CACHE_TTL = 60;                   // 秒：/api/list 的客户端强缓存
const LIST_CACHE_SMAXAGE = 300;              // 秒：边缘缓存
const LIST_CACHE_SWR = 86400;                // 秒：陈旧可用
const META_CACHE_TTL = 60;

const LIST_CACHE_KEYS = {
  CA: new Request("https://r2cache.internal/list?prefix=ca/&delimiter=/"),
  CRL: new Request("https://r2cache.internal/list?prefix=crl/&delimiter=/"),
};

function metaCacheKey(key: string) {
  return new Request(`https://r2cache.internal/meta?key=${encodeURIComponent(key)}`);
}

/** ---------- 小工具 ---------- */
const b2ab = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b.buffer : b);
const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(data: ArrayBuffer | Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", b2ab(data));
  return toHex(d);
}

function toJSDate(maybeTime: any): Date | undefined {
  try {
    if (!maybeTime) return undefined;
    if (maybeTime instanceof Date) return maybeTime;
    if (typeof maybeTime.toDate === "function") return maybeTime.toDate();
    if ((maybeTime as any).value instanceof Date) return (maybeTime as any).value;
    if ((maybeTime as any).valueBlock?.value instanceof Date) return (maybeTime as any).valueBlock.value;
    const s = typeof maybeTime === "string" ? maybeTime : (maybeTime as any)?.value;
    if (typeof s === "string") {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
    }
  } catch (e) {
    console.warn("toJSDate error:", e, "input:", maybeTime);
  }
  console.warn("toJSDate could not normalize input:", maybeTime);
  return undefined;
}

/** ---------- ASN.1 / X.509 ---------- */
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
  const ext = cert.extensions?.find(e => e.extnID === "2.5.29.14");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const raw = asn1.result as OctetString;
  return toHex(raw.valueBlock.valueHex);
}

function getCRLAKIHex(crl: pkijs.CertificateRevocationList): string | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.35");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const seq = asn1.result as Sequence;
  const first = seq.valueBlock.value[0];
  if (!first || first.idBlock.tagClass !== 3 || first.idBlock.tagNumber !== 0) return undefined;
  // @ts-ignore implicit [0] OCTET STRING has valueHex
  return toHex(first.valueBlock.valueHex);
}

function getCRLNumber(crl: pkijs.CertificateRevocationList): bigint | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.20");
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

/** ---------- Content-Type 与缓存 ---------- */
function contentTypeByKey(key: string) {
  if (key.endsWith(".pem") || key.endsWith(".crt.pem") || key.endsWith(".crl.pem"))
    return "text/plain; charset=utf-8";
  if (key.endsWith(".crt")) return "application/pkix-cert";
  if (key.endsWith(".crl")) return "application/pkix-crl";
  return "application/octet-stream";
}

function httpHeadersForBinaryLike(obj: R2ObjectBody | R2Object, key: string) {
  const h = new Headers();
  h.set("Content-Type", contentTypeByKey(key));

  const anyObj = obj as any;
  const etag: unknown = anyObj?.etag ?? anyObj?.httpEtag;
  if (typeof etag === "string" && etag.length > 0) h.set("ETag", etag);
  const uploaded: unknown = anyObj?.uploaded;
  if (uploaded instanceof Date) h.set("Last-Modified", uploaded.toUTCString());

  // 缓存策略：DER 长缓存、CRL 短缓存、PEM 参照对应类型
  if (key.endsWith(".crt") || key.endsWith(".crt.pem"))
    h.set("Cache-Control", "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=604800");
  else if (key.endsWith(".crl") || key.endsWith(".crl.pem"))
    h.set("Cache-Control", "public, max-age=3600, must-revalidate, s-maxage=86400, stale-while-revalidate=604800");
  else h.set("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
  return h;
}

/** ---------- R2 列表/读写 + 列表缓存 ---------- */
async function listAllWithPrefix(env: Env, prefix: string) {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await env.STORE.list({ prefix, cursor, delimiter: undefined });
    cursor = listing.truncated ? listing.cursor : undefined;
    for (const obj of listing.objects) out.push(obj);
  } while (cursor);
  return out;
}

// 你已有：只对 ca/ 与 crl/ 的汇总缓存（用于首页/元数据解析）
async function cachedListAllWithPrefix(env: Env, prefix: "ca/" | "crl/"): Promise<R2Object[]> {
  const cache = caches.default;
  const key = prefix === "ca/" ? LIST_CACHE_KEYS.CA : LIST_CACHE_KEYS.CRL;

  const hit = await cache.match(key);
  if (hit) {
    const j = await hit.json();
    return (j.items as Array<{ key: string; size: number; uploaded?: string }>).map(x => ({
      key: x.key,
      size: x.size,
      uploaded: x.uploaded ? new Date(x.uploaded) : undefined,
    } as unknown as R2Object));
  }

  const objs = await listAllWithPrefix(env, prefix);
  const payload = JSON.stringify({
    items: objs.map(o => ({
      key: o.key,
      size: (o as any).size ?? 0,
      uploaded: (o as any).uploaded instanceof Date ? (o as any).uploaded.toISOString() : undefined,
    })),
    cachedAt: new Date().toISOString(),
  });

  const res = new Response(payload, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${LIST_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`,
    },
  });
  await cache.put(key, res.clone());
  return objs;
}

/** ---------- 证书候选（沿用你的解析逻辑） ---------- */
async function listCACandidates(env: Env): Promise<Array<{ key: string; der: ArrayBuffer; cert: pkijs.Certificate }>> {
  const out: Array<{ key: string; der: ArrayBuffer; cert: pkijs.Certificate }> = [];
  const caObjs = await cachedListAllWithPrefix(env, "ca/");
  for (const obj of caObjs) {
    if (!obj.key.endsWith(".crt")) continue;
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
  return out;
}

async function putBinary(env: Env, key: string, data: ArrayBuffer | Uint8Array, meta?: Record<string, string>) {
  console.log("PUT", key, "meta:", meta);
  return env.STORE.put(key, data, { httpMetadata: {}, customMetadata: meta });
}

/** ---------- CRL 关联/校验 ---------- */
async function findIssuerCertForCRL(env: Env, crl: pkijs.CertificateRevocationList) {
  const akiHex = getCRLAKIHex(crl);
  const candidates = await listCACandidates(env);
  if (akiHex) {
    for (const c of candidates) {
      const ski = getSKIHex(c.cert);
      if (ski && ski.toLowerCase() === akiHex.toLowerCase()) return c;
    }
  }
  const issuerDN = crl.issuer.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(",");
  for (const c of candidates) {
    const subjDN = c.cert.subject.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(",");
    if (issuerDN === subjDN) return c;
  }
  return undefined;
}

async function verifyCRLWithIssuer(crl: pkijs.CertificateRevocationList, issuer: pkijs.Certificate) {
  try { return (await crl.verify({ issuerCertificate: issuer })) === true; }
  catch (e) { console.error("crl.verify threw:", e); return false; }
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
  const tNew = toJSDate(incoming.thisUpdate);
  const tOld = toJSDate(existing.thisUpdate);
  if (tNew && tOld) return tNew.getTime() > tOld.getTime();
  console.warn("isNewerCRL: cannot determine freshness", { tNew: incoming.thisUpdate, tOld: existing?.thisUpdate });
  return false;
}

/** ---------- PEM 解析（POST 用） ---------- */
function extractPEMBlock(pemText: string, begin: string, end: string): Uint8Array {
  const re = new RegExp(`${begin}[\\s\\S]*?${end}`, "g");
  const match = pemText.match(re);
  if (!match || match.length === 0) throw new Error(`PEM block not found: ${begin} ... ${end}`);
  const block = match[0];
  const base64Body = block.replace(begin, "").replace(end, "").replace(/[\r\n\s]/g, "");
  const bin = atob(base64Body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** ---------- /meta（带缓存） ---------- */
async function getMetaJSON(env: Env, key: string) {
  if (!/^\/(ca|crl)\//.test(key)) throw new Error("Bad key");
  const r2key = key.replace(/^\/+/, "");
  const obj = await env.STORE.get(r2key);
  if (!obj) return { error: "Not Found" };

  const isCert = r2key.endsWith(".crt") || r2key.endsWith(".crt.pem");
  const isCRL = r2key.endsWith(".crl") || r2key.endsWith(".crl.pem");

  const raw = r2key.endsWith(".pem") ? new TextEncoder().encode(await obj.text()).buffer : await obj.arrayBuffer();
  let body: any = {};
  try {
    if (isCert) {
      const der = r2key.endsWith(".pem") ? extractPEMBlock(new TextDecoder().decode(raw), "-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----").buffer : raw;
      const cert = parseCertificate(der);
      body = {
        type: "certificate",
        subject: cert.subject.typesAndValues.map(tv => ({ oid: tv.type, value: tv.value.valueBlock.value })),
        issuer: cert.issuer.typesAndValues.map(tv => ({ oid: tv.type, value: tv.value.valueBlock.value })),
        notBefore: toJSDate((cert as any).notBefore)?.toISOString() ?? null,
        notAfter: toJSDate((cert as any).notAfter)?.toISOString() ?? null,
        serialNumberHex: (cert.serialNumber.valueBlock.valueHex && toHex(cert.serialNumber.valueBlock.valueHex)) || null,
        signatureAlg: cert.signatureAlgorithm.algorithmId,
        publicKeyAlg: cert.subjectPublicKeyInfo.algorithm.algorithmId,
        ski: getSKIHex(cert) || null,
        cn: getCN(cert) || null,
      };
    } else if (isCRL) {
      const der = r2key.endsWith(".pem") ? extractPEMBlock(new TextDecoder().decode(raw), "-----BEGIN X509 CRL-----", "-----END X509 CRL-----").buffer : raw;
      const crl = parseCRL(der);
      body = {
        type: "crl",
        issuer: crl.issuer.typesAndValues.map(tv => ({ oid: tv.type, value: tv.value.valueBlock.value })),
        thisUpdate: toJSDate(crl.thisUpdate)?.toISOString() ?? null,
        nextUpdate: toJSDate(crl.nextUpdate)?.toISOString() ?? null,
        crlNumber: getCRLNumber(crl)?.toString() ?? null,
        aki: getCRLAKIHex(crl) || null,
        signatureAlg: crl.signatureAlgorithm.algorithmId,
        entryCount: (crl as any).revokedCertificates?.length ?? 0,
      };
    } else {
      body = { type: "binary", size: (obj as any).size ?? null };
    }
  } catch (e) {
    body = { error: "parse_error", detail: String(e) };
  }

  const meta = {
    key: r2key,
    size: (obj as any).size ?? null,
    uploaded: (obj as any).uploaded instanceof Date ? (obj as any).uploaded.toISOString() : null,
    etag: (obj as any).etag ?? (obj as any).httpEtag ?? null,
  };

  return { meta, body };
}

const getMeta: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!key) return new Response(JSON.stringify({ error: "missing key" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const cache = caches.default;
  const ck = metaCacheKey(key);
  const cached = await cache.match(ck);
  if (cached) return cached;

  const data = await getMetaJSON(env, key);
  const res = new Response(JSON.stringify(data), {
    status: data && !(data as any).error ? 200 : (data as any).error === "Not Found" ? 404 : 500,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${META_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`,
    },
  });
  await cache.put(ck, res.clone());
  return res;
};

/** ---------- /file/* （新增边缘缓存命中） ---------- */
const getBinaryOrText: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  if (!/^\/(ca|crl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 });

  const key = url.pathname.replace(/^\/+/, "");
  const cache = caches.default;

  // 以完整 URL 作为缓存键
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const obj = await env.STORE.get(key);
  if (!obj) return new Response("Not Found", { status: 404 });

  const hdr = httpHeadersForBinaryLike(obj, key);
  const resp = key.endsWith(".pem")
    ? new Response(await obj.text(), { status: 200, headers: hdr })
    : new Response(await obj.arrayBuffer(), { status: 200, headers: hdr });

  // 可缓存响应写入边缘缓存
  await cache.put(cacheKey, resp.clone());
  return resp;
};

/** ---------- /crl（上传 + 缓存失效） ---------- */
const postCRL: RouteHandler = async (req, env) => {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("pem") && !ct.includes("text") && !ct.includes("plain") && !ct.includes("x-pem-file")) {
    return new Response(
      JSON.stringify({ error: "Expect PEM CRL. Content-Type should be text/plain or application/x-pem-file" }),
      { status: 415, headers: { "Content-Type": "application/json" } },
    );
  }

  let pemText = "";
  try { pemText = await req.text(); }
  catch { return new Response(JSON.stringify({ error: "Bad request body" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  let derBytes: Uint8Array;
  try { derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----"); }
  catch (e) {
    console.error("PEM parse error:", e);
    return new Response(JSON.stringify({ error: "Invalid CRL PEM" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  let crl: pkijs.CertificateRevocationList;
  try { crl = parseCRL(derBytes.buffer); }
  catch (e) {
    console.error("CRL parse error:", e);
    return new Response(JSON.stringify({ error: "Bad CRL DER after PEM decode" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const issuer = await findIssuerCertForCRL(env, crl);
  if (!issuer) return new Response(JSON.stringify({ error: "Issuer certificate not found (by AKI/SKI or DN)" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const ok = await verifyCRLWithIssuer(crl, issuer.cert);
  if (!ok) return new Response(JSON.stringify({ error: "CRL signature invalid for resolved issuer" }), { status: 400, headers: { "Content-Type": "application/json" } });

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

  const existing = await getExistingCRL(env, logicalDERKey);
  if (!isNewerCRL(crl, existing?.parsed)) {
    return new Response(JSON.stringify({ status: "ignored", reason: "CRL not newer" }), { status: 409, headers: { "Content-Type": "application/json" } });
  }

  if (existing) {
    const oldNum = getCRLNumber(existing.parsed);
    const oldTag = oldNum !== undefined ? oldNum.toString() : (await sha256Hex(existing.der)).slice(0, 16);
    await putBinary(env, `crl/archive/${friendly}-${oldTag}.crl`, existing.der, {
      issuerCN: getCN(issuer.cert) || "",
      archivedAt: new Date().toISOString(),
    });
  }

  const thisUpd = toJSDate(crl.thisUpdate);
  const nextUpd = toJSDate(crl.nextUpdate);
  const crlNum = getCRLNumber(crl);
  const meta: Record<string, string> = {
    issuerCN: getCN(issuer.cert) || "",
    issuerKeyId: getSKIHex(issuer.cert) || "",
    crlNumber: crlNum !== undefined ? crlNum.toString() : "",
    thisUpdate: thisUpd ? thisUpd.toISOString() : "",
    nextUpdate: nextUpd ? nextUpd.toISOString() : "",
  };

  await putBinary(env, logicalDERKey, derBytes, meta);
  await putBinary(env, logicalPEMKey, new TextEncoder().encode(pemText), meta);
  if (byAkiKey) await putBinary(env, byAkiKey, derBytes, meta);

  // ---------- 失效缓存：目录列表 + 元数据 + 文件 ----------
  const cache = caches.default;
  await Promise.allSettled([
    cache.delete(LIST_CACHE_KEYS.CRL),
    cache.delete(LIST_CACHE_KEYS.CA),
    cache.delete(metaCacheKey("/" + logicalDERKey)),
    cache.delete(metaCacheKey("/" + logicalPEMKey)),
    ...(byAkiKey ? [cache.delete(metaCacheKey("/" + byAkiKey))] : []),
    // 失效 /api/list 通用键（如果前端用 /api/list?prefix=crl/&delimiter=/ 之类）
    cache.delete(new Request("https://r2cache.internal/api-list?prefix=crl/&delimiter=/")),
  ]);

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

/** ---------- /api/list （通用目录列出 + 边缘缓存） ---------- */
const apiList: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const prefix = url.searchParams.get("prefix") ?? "";
  const delimiter = url.searchParams.get("delimiter") ?? "/";
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = url.searchParams.get("limit") ? Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")))) : undefined;

  // 构造稳定的虚拟缓存键（不会跟其它路径冲突）
  const cacheKey = new Request(`https://r2cache.internal/api-list?prefix=${encodeURIComponent(prefix)}&delimiter=${encodeURIComponent(delimiter)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${limit ? `&limit=${limit}` : ""}`, { method: "GET" });

  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const list = await env.STORE.list({ prefix, delimiter, cursor, limit });

  const payload = {
    objects: list.objects.map(o => ({
      key: o.key,
      size: (o as any).size ?? 0,
      etag: (o as any).etag ?? (o as any).httpEtag ?? null,
      uploaded: (o as any).uploaded instanceof Date ? (o as any).uploaded.toISOString() : null,
    })),
    commonPrefixes: list.delimitedPrefixes ?? [],
    truncated: list.truncated,
    cursor: list.truncated ? list.cursor : null,
  };

  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${LIST_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`,
  });

  const resp = new Response(JSON.stringify(payload), { headers, status: 200 });
  // 放入边缘缓存
  await cache.put(cacheKey, resp.clone());
  return resp;
};

/** ---------- 主入口 ---------- */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = req;
    const url = new URL(req.url);

    try {
      // 1) API —— 目录列出（带缓存）
      if (method === "GET" && url.pathname === "/api/list") {
        return apiList(req, env, ctx);
      }

      // 2) 元数据（带缓存）
      if (method === "GET" && url.pathname === "/meta") {
        return getMeta(req, env, ctx);
      }

      // 3) 文件 GET/HEAD（带内容缓存）
      if ((method === "GET" || method === "HEAD") && /^\/(ca|crl)\//.test(url.pathname)) {
        if (method === "HEAD") {
          const r = await getBinaryOrText(new Request(req, { method: "GET" }), env, ctx);
          return new Response(null, { status: r.status, headers: r.headers });
        }
        return getBinaryOrText(req, env, ctx);
      }

      // 4) CRL 上传
      if (method === "POST" && url.pathname === "/crl") {
        return postCRL(req, env, ctx);
      }

      // 5) 静态资源（首页、CSS、JS）—— 不写死在 TS，交给 Assets
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error("Unhandled error:", e);
      return new Response(JSON.stringify({ error: "internal_error", detail: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
