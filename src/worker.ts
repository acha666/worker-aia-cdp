/* eslint-disable no-constant-condition */
import { fromBER, OctetString, Integer, Sequence } from "asn1js";
import * as pkijs from "pkijs";

/** ---------- Env / Types ---------- */
interface Env {
  STORE: R2Bucket;
  SITE_NAME?: string;
}
type RouteHandler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** ---------- PKIjs 引擎 ---------- */
pkijs.setEngine(
  "cloudflare",
  new pkijs.CryptoEngine({ name: "cloudflare", crypto, subtle: crypto.subtle }),
);

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
    if (maybeTime.value instanceof Date) return maybeTime.value;
    if (maybeTime.valueBlock?.value instanceof Date) return maybeTime.valueBlock.value;
    if (typeof maybeTime === "string" || typeof maybeTime?.value === "string") {
      const s = typeof maybeTime === "string" ? maybeTime : maybeTime.value;
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
  // PEM 按文本直出，便于浏览器内联展示
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
    h.set("Cache-Control", "public, max-age=31536000, immutable");
  else if (key.endsWith(".crl") || key.endsWith(".crl.pem"))
    h.set("Cache-Control", "public, max-age=3600, must-revalidate");
  else h.set("Cache-Control", "public, max-age=300");
  return h;
}

/** ---------- R2 列表/读写 ---------- */
async function listAllWithPrefix(env: Env, prefix: string) {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await env.STORE.list({ prefix, cursor });
    cursor = listing.truncated ? listing.cursor : undefined;
    for (const obj of listing.objects) out.push(obj);
  } while (cursor);
  return out;
}

async function listCACandidates(env: Env): Promise<Array<{ key: string; der: ArrayBuffer; cert: pkijs.Certificate }>> {
  const out: Array<{ key: string; der: ArrayBuffer; cert: pkijs.Certificate }> = [];
  let cursor: string | undefined;
  do {
    const listing = await env.STORE.list({ prefix: "ca/", cursor });
    cursor = listing.truncated ? listing.cursor : undefined;
    for (const obj of listing.objects) {
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
  } while (cursor);
  console.log("CA candidates:", out.map(c => ({ key: c.key, cn: getCN(c.cert), ski: getSKIHex(c.cert) })));
  return out;
}

async function putBinary(env: Env, key: string, data: ArrayBuffer | Uint8Array, meta?: Record<string, string>) {
  console.log("PUT", key, "meta:", meta);
  return env.STORE.put(key, data, { httpMetadata: {}, customMetadata: meta });
}

/** ---------- CRL 发行者定位/验证 ---------- */
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

/** ---------- 路由：文件 GET/HEAD（PEM 直接文本） ---------- */
const getBinaryOrText: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  if (!/^\/(ca|crl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 });

  const key = url.pathname.replace(/^\/+/, "");
  console.log("GET", key);

  const obj = await env.STORE.get(key);
  if (!obj) {
    console.warn("R2 object NOT FOUND:", key);
    return new Response("Not Found", { status: 404 });
  }

  const hdr = httpHeadersForBinaryLike(obj, key);

  // 对 .pem：以文本直出（避免下载）
  if (key.endsWith(".pem")) {
    const text = await obj.text();
    return new Response(text, { status: 200, headers: hdr });
  }

  // 其它按二进制直出
  return new Response(await obj.arrayBuffer(), { status: 200, headers: hdr });
};

/** ---------- 路由：CRL 上传（PEM） ---------- */
const postCRL: RouteHandler = async (req, env) => {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
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

  const issuer = await findIssuerCertForCRL(env, crl);
  if (!issuer) {
    return new Response(JSON.stringify({ error: "Issuer certificate not found (by AKI/SKI or DN)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ok = await verifyCRLWithIssuer(crl, issuer.cert);
  if (!ok) {
    return new Response(JSON.stringify({ error: "CRL signature invalid for resolved issuer" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
    return new Response(JSON.stringify({ status: "ignored", reason: "CRL not newer" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (existing) {
    const oldNum = getCRLNumber(existing.parsed);
    const oldTag = oldNum !== undefined ? oldNum.toString() : (await sha256Hex(existing.der)).slice(0, 16);
    await putBinary(env, `crl/archive/${friendly}-${oldTag}.crl`, existing.der, {
      issuerCN: getCN(issuer.cert) || "",
      archivedAt: new Date().toISOString(),
    });
  }

  console.log("CRL times raw:", { thisUpdate: crl.thisUpdate, nextUpdate: crl.nextUpdate });

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

/** ---------- 首页（动态生成 AIA/CDP 列表） ---------- */
function groupPairs(keys: string[]) {
  // 将 *.crt / *.crt.pem、*.crl / *.crl.pem 成对归并
  const map = new Map<string, { der?: string; pem?: string }>();
  for (const k of keys) {
    if (k.endsWith(".crt") || k.endsWith(".crl")) {
      map.set(k, { ...(map.get(k) || {}), der: k });
    } else if (k.endsWith(".crt.pem") || k.endsWith(".crl.pem")) {
      const base = k.replace(/\.pem$/, ""); // *.crt.pem -> *.crt / *.crl.pem -> *.crl
      map.set(base, { ...(map.get(base) || {}), pem: k });
    }
  }
  return map;
}

function shortName(key: string) {
  return key.split("/").slice(1).join("/"); // 去掉前缀目录
}

function humanLabel(key: string) {
  // 显示更友好的标题：去扩展名、保留算法/位数
  return shortName(key).replace(/\.(crt|crl)(\.pem)?$/i, "");
}

function indexHtml(title: string, caPairs: Map<string, { der?: string; pem?: string }>, crlPairs: Map<string, { der?: string; pem?: string }>) {
  const css =
    `:root{--fg:#24292f;--muted:#57606a;--link:#0969da;--link-hover:#1f6feb;--bg:#fff;--card:#f6f8fa;--border:#d0d7de;
--shadow:0 1px 0 rgba(27,31,36,0.04),0 8px 24px rgba(140,149,159,0.2);--code-bg:#f6f8fa;--kbd-bg:#f6f8fa;--kbd-border:#d0d7de;
--header-bg:#f6f8fa;--h2-bg:#eaeef2;--focus:#0969da}:root[data-theme="dark"]{--fg:#c9d1d9;--muted:#8b949e;--link:#58a6ff;
--link-hover:#79c0ff;--bg:#0d1117;--card:#161b22;--border:#30363d;--shadow:0 0 0 rgba(0,0,0,0),0 8px 24px rgba(1,4,9,0.6);
--code-bg:#0b0f14;--kbd-bg:#161b22;--kbd-border:#30363d;--focus:#58a6ff}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--fg:#c9d1d9;--muted:#8b949e;--link:#58a6ff;--link-hover:#79c0ff;
--bg:#0d1117;--card:#161b22;--border:#30363d;--shadow:0 0 0 rgba(0,0,0,0),0 8px 24px rgba(1,4,9,0.6);--code-bg:#0b0f14;
--kbd-bg:#161b22;--kbd-border:#30363d;--header-bg:#21262d;--h2-bg:#2d333b;--focus:#58a6ff}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
"Helvetica Neue",Arial,"Noto Sans","Apple Color Emoji","Segoe UI Emoji";background:var(--bg);color:var(--fg);
-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}header{position:sticky;top:0;z-index:10;padding:28px 16px;
background:var(--header-bg);border-bottom:1px solid var(--border);box-shadow:0 1px 0 rgba(255,255,255,0.03) inset}
h1{margin:0;font-size:20px;font-weight:600}h2{margin:0;font-size:16px;font-weight:600}main{max-width:900px;margin:24px auto;padding:0 16px}
section{margin:18px 0;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:var(--shadow)}
section>h2{padding:12px 14px;background:var(--h2-bg);border-bottom:1px solid var(--border)}
ul.files{list-style:none;margin:0;padding:0}ul.files li{display:flex;justify-content:space-between;align-items:center;gap:12px;
padding:12px 14px;border-top:1px solid var(--border)}ul.files li:first-child{border-top:none}ul.files strong{font-weight:600}
.meta{color:var(--muted);font-size:12px}a{color:var(--link);text-decoration:none}a:hover{color:var(--link-hover);text-decoration:underline}
a:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
code,pre,kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:12.5px}
code{background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:0 6px}
pre{margin:0;padding:12px 14px;background:var(--code-bg);border-top:1px solid var(--border)}
kbd{background:var(--kbd-bg);border:1px solid var(--kbd-border);border-bottom-width:2px;border-radius:6px;padding:2px 6px}
footer{max-width:900px;margin:24px auto 40px;padding:0 16px;color:var(--muted);font-size:12px}
@media(max-width:640px){ul.files li{flex-direction:column;align-items:flex-start}}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;
transition-duration:.01ms!important;scroll-behavior:auto!important}}`;

  function renderPairs(pairs: Map<string, { der?: string; pem?: string }>, kind: "crt" | "crl") {
    const items = [...pairs.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (items.length === 0) return `<p class="meta" style="padding:12px 14px;">无可用 ${kind.toUpperCase()} 文件</p>`;
    return `<ul class="files">` + items.map(([base, v]) => {
      const label = humanLabel(base);
      const left = `<strong>${label}</strong>`;
      const right = [
        v.der ? `<a href="/${v.der}">DER</a>` : "",
        v.pem ? `<a href="/${v.pem}">PEM</a>` : ""
      ].filter(Boolean).join(" | ");
      return `<li><div>${left}</div><div>${right}</div></li>`;
    }).join("") + `</ul>`;
  }

  return `<!doctype html><meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
<header><h1>${title}</h1></header>
<main>
  <section>
    <h2>Certificates (AIA)</h2>
    ${renderPairs(caPairs, "crt")}
  </section>
  <section>
    <h2>CRLs (CDP)</h2>
    ${renderPairs(crlPairs, "crl")}
  </section>
  <section>
    <h2>Upload CRL</h2>
    <div style="padding:12px 14px">
      <p>POST PEM (X509 CRL) to <code>/crl</code> , with Content-Type <code>text/plain</code> or <code>application/x-pem-file</code>.</p>
    </div>
  </section>
</main>
<footer>Generated from R2 at ${new Date().toISOString()}</footer>`;
}

const indexPage: RouteHandler = async (_req, env) => {
  const title = env.SITE_NAME || "Acha PKI AIA/CDP";

  // 动态读取 ca/ 与 crl/ 目录
  const [caObjs, crlObjs] = await Promise.all([
    listAllWithPrefix(env, "ca/"),
    listAllWithPrefix(env, "crl/"),
  ]);

  const caKeys = caObjs
    .map(o => o.key)
    .filter(k => k.endsWith(".crt") || k.endsWith(".crt.pem"));

  const crlKeys = crlObjs
    .map(o => o.key)
    // 首页只展示主 CRL/CRL.pem 与 archive/by-keyid 可选：这里过滤 archive 与 by-keyid，保持简洁
    .filter(k => !k.startsWith("crl/archive/") && !k.startsWith("crl/by-keyid/"))
    .filter(k => k.endsWith(".crl") || k.endsWith(".crl.pem"));

  const html = indexHtml(title, groupPairs(caKeys), groupPairs(crlKeys));
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
};

/** ---------- 主入口 ---------- */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = req;
    const url = new URL(req.url);

    try {
      if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return indexPage(req, env, ctx);
      }
      if (method === "GET" && /^\/(ca|crl)\//.test(url.pathname)) {
        return getBinaryOrText(req, env, ctx);
      }
      if (method === "POST" && url.pathname === "/crl") {
        return postCRL(req, env, ctx);
      }
      if (method === "HEAD" && /^\/(ca|crl)\//.test(url.pathname)) {
        // 复用 GET 的 header，返回空体
        const r = await getBinaryOrText(new Request(req, { method: "GET" }), env, ctx);
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
