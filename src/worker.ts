/* eslint-disable no-constant-condition */
import { fromBER, OctetString, Integer, Sequence } from "asn1js";
import * as pkijs from "pkijs";

/** ---------- Env / Types ---------- */
interface Env {
  STORE: R2Bucket;
  SITE_NAME?: string;
  ASSETS: Fetcher; // Workers Sites/Static asset binding
}
type RouteHandler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** ---------- PKIjs engine ---------- */
pkijs.setEngine(
  "cloudflare",
  new pkijs.CryptoEngine({ name: "cloudflare", crypto, subtle: crypto.subtle }),
);

/** ---------- Cache parameters ---------- */
const LIST_CACHE_TTL = 60; // seconds: client cache for /api/v1/objects responses
const LIST_CACHE_SMAXAGE = 300; // seconds: edge cache duration
const LIST_CACHE_SWR = 86400; // seconds: stale-while-revalidate window
const META_CACHE_TTL = 60; // seconds: metadata cache TTL

const LIST_CACHE_KEYS = {
  CA: new Request("https://r2cache.internal/list?prefix=ca/&delimiter=/"),
  CRL: new Request("https://r2cache.internal/list?prefix=crl/&delimiter=/"),
  DCRL: new Request("https://r2cache.internal/list?prefix=dcrl/&delimiter=/"),
};

function metaCacheKey(key: string) {
  return new Request(`https://r2cache.internal/meta?key=${encodeURIComponent(key)}`);
}

/** ---------- API helpers ---------- */
const DEFAULT_JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

type JsonHeaders = Headers | Record<string, string> | [string, string][];

interface SuccessOptions {
  status?: number;
  meta?: Record<string, unknown> | null;
  headers?: JsonHeaders;
}

interface ErrorOptions {
  headers?: JsonHeaders;
  details?: unknown;
}

function mergeJsonHeaders(extra?: JsonHeaders) {
  const headers = new Headers(DEFAULT_JSON_HEADERS);
  if (extra) {
    const additional = new Headers(extra);
    additional.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

function jsonSuccess<T>(data: T, options: SuccessOptions = {}) {
  const { status = 200, meta = null, headers } = options;
  const payload = {
    data,
    meta,
    error: null as null,
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: mergeJsonHeaders(headers),
  });
}

function jsonError(status: number, code: string, message: string, options: ErrorOptions = {}) {
  const { headers, details } = options;
  const errorPayload: Record<string, unknown> = { code, message };
  if (details !== undefined) errorPayload.details = details;
  const payload = {
    data: null,
    meta: null,
    error: errorPayload,
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: mergeJsonHeaders(headers),
  });
}

/** ---------- Utility helpers ---------- */
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

/** Delta CRL detection and BaseCRLNumber parsing (2.5.29.27). */
function getDeltaBaseCRLNumber(crl: pkijs.CertificateRevocationList): bigint | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.27");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const int = asn1.result as Integer;
  const bytes = new Uint8Array(int.valueBlock.valueHex);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}
function isDeltaCRL(crl: pkijs.CertificateRevocationList): boolean {
  return getDeltaBaseCRLNumber(crl) !== undefined;
}

function friendlyNameFromCert(cert: pkijs.Certificate): string {
  const cn = getCN(cert);
  if (cn) return cn.replace(/[^\w.-]+/g, "").replace(/\s+/g, "");
  const ski = getSKIHex(cert);
  return ski ? `CA-${ski.slice(0, 16)}` : `CA-${Date.now()}`;
}

/** ---------- Content-Type and caching ---------- */
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

  // Cache strategy: long cache for DER, shorter for CRL, PEM follows matching type
  if (key.endsWith(".crt") || key.endsWith(".crt.pem"))
    h.set("Cache-Control", "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=604800");
  else if (key.endsWith(".crl") || key.endsWith(".crl.pem"))
    h.set("Cache-Control", "public, max-age=3600, must-revalidate, s-maxage=86400, stale-while-revalidate=604800");
  else h.set("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
  return h;
}

/** ---------- R2 list/read helpers + caching ---------- */
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

// Extend support to the "dcrl/" namespace
async function cachedListAllWithPrefix(env: Env, prefix: "ca/" | "crl/" | "dcrl/"): Promise<R2Object[]> {
  const cache = caches.default;
  const key =
    prefix === "ca/" ? LIST_CACHE_KEYS.CA :
      prefix === "crl/" ? LIST_CACHE_KEYS.CRL :
        LIST_CACHE_KEYS.DCRL;

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

/** ---------- Certificate candidates (reuse existing parsing logic) ---------- */
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

/** ---------- CRL association/verification ---------- */
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

/** ---------- PEM parsing helpers (for POST uploads) ---------- */
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

/** ---------- Object metadata (cached) ---------- */
interface ObjectMetadata {
  key: string;
  size: number | null;
  uploaded: string | null;
  etag: string | null;
  type: "certificate" | "crl" | "binary" | "unknown";
  details: Record<string, unknown>;
}

async function getMetaJSON(env: Env, key: string): Promise<ObjectMetadata | undefined> {
  if (!/^\/(ca|crl|dcrl)\//.test(key)) throw new Error("Unsupported key prefix");
  const r2key = key.replace(/^\/+/, "");
  const obj = await env.STORE.get(r2key);
  if (!obj) return undefined;

  const isCert = r2key.endsWith(".crt") || r2key.endsWith(".crt.pem");
  const isCRL = r2key.endsWith(".crl") || r2key.endsWith(".crl.pem");

  const base: ObjectMetadata = {
    key: r2key,
    size: (obj as any).size ?? null,
    uploaded: (obj as any).uploaded instanceof Date ? (obj as any).uploaded.toISOString() : null,
    etag: (obj as any).etag ?? (obj as any).httpEtag ?? null,
    type: isCert ? "certificate" : isCRL ? "crl" : "binary",
    details: {},
  };

  try {
    const decoder = new TextDecoder();
    if (isCert) {
      const raw = r2key.endsWith(".pem") ? extractPEMBlock(decoder.decode(await obj.arrayBuffer()), "-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----").buffer : await obj.arrayBuffer();
      const cert = parseCertificate(raw);
      base.details = {
        subject: cert.subject.typesAndValues.map(tv => ({ oid: tv.type, value: tv.value.valueBlock.value })),
        issuer: cert.issuer.typesAndValues.map(tv => ({ oid: tv.type, value: tv.value.valueBlock.value })),
        notBefore: toJSDate((cert as any).notBefore)?.toISOString() ?? null,
        notAfter: toJSDate((cert as any).notAfter)?.toISOString() ?? null,
        serialNumberHex: (cert.serialNumber.valueBlock.valueHex && toHex(cert.serialNumber.valueBlock.valueHex)) || null,
        signatureAlgorithm: cert.signatureAlgorithm.algorithmId,
        publicKeyAlgorithm: cert.subjectPublicKeyInfo.algorithm.algorithmId,
        subjectKeyIdentifier: getSKIHex(cert) || null,
        commonName: getCN(cert) || null,
      };
    } else if (isCRL) {
      const raw = r2key.endsWith(".pem") ? extractPEMBlock(decoder.decode(await obj.arrayBuffer()), "-----BEGIN X509 CRL-----", "-----END X509 CRL-----").buffer : await obj.arrayBuffer();
      const crl = parseCRL(raw);
      const baseNumber = getDeltaBaseCRLNumber(crl);
      base.details = {
        issuer: crl.issuer.typesAndValues.map(tv => ({ oid: tv.type, value: tv.value.valueBlock.value })),
        thisUpdate: toJSDate(crl.thisUpdate)?.toISOString() ?? null,
        nextUpdate: toJSDate(crl.nextUpdate)?.toISOString() ?? null,
        crlNumber: getCRLNumber(crl)?.toString() ?? null,
        authorityKeyIdentifier: getCRLAKIHex(crl) || null,
        signatureAlgorithm: crl.signatureAlgorithm.algorithmId,
        entryCount: (crl as any).revokedCertificates?.length ?? 0,
        isDelta: baseNumber !== undefined,
        baseCRLNumber: baseNumber !== undefined ? baseNumber.toString() : null,
      };
    } else {
      base.details = { size: base.size };
    }
  } catch (err) {
    base.type = "unknown";
    base.details = {
      parseError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return base;
}

const getObjectMetadata: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/v1\/objects\/(.+)\/metadata$/);
  if (!match) return jsonError(400, "invalid_path", "Metadata endpoint path is invalid.");

  let decodedKey: string;
  try {
    decodedKey = decodeURIComponent(match[1]);
  } catch (err) {
    return jsonError(400, "invalid_key", "Object key must be URL-encoded.", { details: { message: err instanceof Error ? err.message : String(err) } });
  }

  const normalizedKey = decodedKey.startsWith("/") ? decodedKey : `/${decodedKey}`;
  const cache = caches.default;
  const ck = metaCacheKey(normalizedKey);
  const cached = await cache.match(ck);
  if (cached) return cached;

  let metadata: ObjectMetadata | undefined;
  try {
    metadata = await getMetaJSON(env, normalizedKey);
  } catch (err) {
    return jsonError(400, "unsupported_key", "The provided key prefix is not supported.", {
      details: { key: normalizedKey, message: err instanceof Error ? err.message : String(err) },
    });
  }

  if (!metadata) {
    const notFound = jsonError(404, "not_found", "Object not found.", {
      headers: {
        "Cache-Control": `public, max-age=${META_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`,
      },
      details: { key: normalizedKey },
    });
    await cache.put(ck, notFound.clone());
    return notFound;
  }

  const response = jsonSuccess(metadata, {
    meta: {
      key: metadata.key,
      cachedAt: new Date().toISOString(),
    },
    headers: {
      "Cache-Control": `public, max-age=${META_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`,
    },
  });

  await cache.put(ck, response.clone());
  return response;
};

/** ---------- /file/* (serves binary/text with edge caching) ---------- */
const getBinaryOrText: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  if (!/^\/(ca|crl|dcrl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 }); // allow delta CRL namespace

  const key = url.pathname.replace(/^\/+/, "");
  const cache = caches.default;

  // Use the full request URL as the cache key
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const obj = await env.STORE.get(key);
  if (!obj) return new Response("Not Found", { status: 404 });

  const hdr = httpHeadersForBinaryLike(obj, key);
  const resp = key.endsWith(".pem")
    ? new Response(await obj.text(), { status: 200, headers: hdr })
    : new Response(await obj.arrayBuffer(), { status: 200, headers: hdr });

  // Store cacheable responses in the edge cache
  await cache.put(cacheKey, resp.clone());
  return resp;
};

/** ---------- CRL upload (creates or updates) ---------- */
const createCRL: RouteHandler = async (req, env) => {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("text/")) {
    return jsonError(415, "unsupported_media_type", "Only text/plain PEM is accepted for CRL uploads.", {
      details: { received: contentType || null },
    });
  }

  let pemText = "";
  try {
    pemText = await req.text();
  } catch (err) {
    return jsonError(400, "invalid_body", "Failed to read request body as text.", {
      details: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  let derBytes: Uint8Array;
  try {
    derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
  } catch (err) {
    console.error("PEM parse error:", err);
    return jsonError(400, "invalid_pem", "Request body must contain a valid X.509 CRL PEM block.");
  }

  let crl: pkijs.CertificateRevocationList;
  try {
    crl = parseCRL(derBytes.buffer as ArrayBuffer);
  } catch (err) {
    console.error("CRL parse error:", err);
    return jsonError(400, "invalid_der", "Failed to parse CRL after PEM decode.", {
      details: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  const issuer = await findIssuerCertForCRL(env, crl);
  if (!issuer) return jsonError(400, "issuer_not_found", "Issuer certificate could not be resolved for this CRL.");

  const signatureOk = await verifyCRLWithIssuer(crl, issuer.cert);
  if (!signatureOk) return jsonError(400, "invalid_signature", "CRL signature validation failed for resolved issuer.");

  const friendly = friendlyNameFromCert(issuer.cert)
    .replace(/IssuingCA/gi, "IssuingCA")
    .replace(/RootCA/gi, "RootCA");
  const logicalBase = /Issuing/i.test(friendly) ? "AchaIssuingCA01" : "AchaRootCA";

  const deltaBase = getDeltaBaseCRLNumber(crl);
  const isDelta = deltaBase !== undefined;

  const folder = isDelta ? "dcrl" : "crl";
  const logicalDERKey = `${folder}/${logicalBase}.crl`;
  const logicalPEMKey = `${folder}/${logicalBase}.crl.pem`;
  const byAkiKey = (() => {
    const aki = getCRLAKIHex(crl);
    return aki ? `${folder}/by-keyid/${aki}.crl` : undefined;
  })();

  const existing = await getExistingCRL(env, logicalDERKey);
  if (!isNewerCRL(crl, existing?.parsed)) {
    return jsonError(409, "stale_crl", isDelta ? "Delta CRL is not newer than the stored version." : "CRL is not newer than the stored version.");
  }

  if (existing) {
    const oldNum = getCRLNumber(existing.parsed);
    const oldTag = oldNum !== undefined ? oldNum.toString() : (await sha256Hex(existing.der)).slice(0, 16);
    await putBinary(env, `${folder}/archive/${friendly}-${oldTag}.crl`, existing.der, {
      issuerCN: getCN(issuer.cert) || "",
      archivedAt: new Date().toISOString(),
      kind: isDelta ? "delta" : "full",
    });
  }

  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl);
  const meta: Record<string, string> = {
    issuerCN: getCN(issuer.cert) || "",
    issuerKeyId: getSKIHex(issuer.cert) || "",
    crlNumber: crlNumber !== undefined ? crlNumber.toString() : "",
    thisUpdate: thisUpdate ? thisUpdate.toISOString() : "",
    nextUpdate: nextUpdate ? nextUpdate.toISOString() : "",
    isDelta: String(isDelta),
    baseCRLNumber: isDelta && deltaBase !== undefined ? deltaBase.toString() : "",
  };

  await putBinary(env, logicalDERKey, derBytes, meta);
  await putBinary(env, logicalPEMKey, new TextEncoder().encode(pemText), meta);
  if (byAkiKey) await putBinary(env, byAkiKey, derBytes, meta);

  const cache = caches.default;
  await Promise.allSettled([
    cache.delete(LIST_CACHE_KEYS.CRL),
    cache.delete(LIST_CACHE_KEYS.DCRL),
    cache.delete(LIST_CACHE_KEYS.CA),
    cache.delete(metaCacheKey(`/${logicalDERKey}`)),
    cache.delete(metaCacheKey(`/${logicalPEMKey}`)),
    ...(byAkiKey ? [cache.delete(metaCacheKey(`/${byAkiKey}`))] : []),
  cache.delete(new Request("https://r2cache.internal/collections/crl/items?prefix=crl/&delimiter=/")),
  cache.delete(new Request("https://r2cache.internal/collections/dcrl/items?prefix=dcrl/&delimiter=/")),
  cache.delete(new Request("https://r2cache.internal/collections/ca/items?prefix=ca/&delimiter=/")),
  cache.delete(new Request("https://r2cache.internal/objects?prefix=crl/&delimiter=/")),
  cache.delete(new Request("https://r2cache.internal/objects?prefix=dcrl/&delimiter=/")),
  ]);

  const responsePayload = {
    kind: isDelta ? "delta" : "full",
    stored: { der: logicalDERKey, pem: logicalPEMKey },
    byAki: byAkiKey || null,
    crlNumber: meta.crlNumber || null,
    baseCRLNumber: meta.baseCRLNumber || null,
    thisUpdate: meta.thisUpdate || null,
    nextUpdate: meta.nextUpdate || null,
  };

  return jsonSuccess(responsePayload, { status: 201 });
};

/** ---------- Object listing (REST + edge cache) ---------- */
const listObjects: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const collectionMatch = pathname.match(/^\/api\/v1\/collections\/(ca|crl|dcrl)\/items$/);

  let prefix = url.searchParams.get("prefix") ?? "";
  let collection: string | null = null;
  if (collectionMatch) {
    collection = collectionMatch[1];
    prefix = `${collection}/`;
  } else if (pathname !== "/api/v1/objects") {
    return jsonError(404, "not_found", "Endpoint not found.");
  }

  const delimiter = url.searchParams.get("delimiter") ?? "/";
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(1000, Number(limitParam))) : undefined;

  const cacheUrl = new URL(`https://r2cache.internal${collection ? `/collections/${collection}/items` : "/objects"}`);
  const cacheParams = new URLSearchParams();
  if (prefix) cacheParams.set("prefix", prefix);
  if (delimiter) cacheParams.set("delimiter", delimiter);
  if (cursor) cacheParams.set("cursor", cursor);
  if (limit) cacheParams.set("limit", String(limit));
  cacheUrl.search = cacheParams.toString();
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const list = await env.STORE.list({ prefix, delimiter, cursor, limit });

  const items = list.objects.map(o => ({
    key: o.key,
    size: (o as any).size ?? 0,
    etag: (o as any).etag ?? (o as any).httpEtag ?? null,
    uploaded: (o as any).uploaded instanceof Date ? (o as any).uploaded.toISOString() : null,
  }));

  const nextCursor = list.truncated ? list.cursor ?? null : null;
  const links: Record<string, string> = {
    self: url.origin + pathname + (url.search ? url.search : ""),
  };
  if (nextCursor) {
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.set("cursor", nextCursor);
    if (collectionMatch) nextParams.delete("prefix");
    else if (!nextParams.has("prefix") && prefix) nextParams.set("prefix", prefix);
    links.next = url.origin + pathname + `?${nextParams.toString()}`;
  }

  const response = jsonSuccess(
    {
      items,
      prefixes: list.delimitedPrefixes ?? [],
    },
    {
      meta: {
        prefix,
        delimiter,
        truncated: list.truncated,
        cursor: nextCursor,
        collection,
        count: items.length,
        links,
      },
      headers: {
        "Cache-Control": `public, max-age=${LIST_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`,
      },
    },
  );

  await cache.put(cacheKey, response.clone());
  return response;
};

/** ---------- Entry point ---------- */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = req;
    const url = new URL(req.url);

    try {
      // REST: object listing
      if (method === "GET" && (url.pathname === "/api/v1/objects" || /^\/api\/v1\/collections\/(ca|crl|dcrl)\/items$/.test(url.pathname))) {
        return listObjects(req, env, ctx);
      }

      // REST: object metadata
      if (method === "GET" && /^\/api\/v1\/objects\/.+\/metadata$/.test(url.pathname)) {
        return getObjectMetadata(req, env, ctx);
      }

      // Binary file GET/HEAD (edge cached)
  if ((method === "GET" || method === "HEAD") && /^\/(ca|crl|dcrl)\//.test(url.pathname)) {
        if (method === "HEAD") {
          const r = await getBinaryOrText(new Request(req, { method: "GET" }), env, ctx);
          return new Response(null, { status: r.status, headers: r.headers });
        }
        return getBinaryOrText(req, env, ctx);
      }

      // REST: CRL / delta CRL upload
      if (method === "POST" && url.pathname === "/api/v1/crls") {
        return createCRL(req, env, ctx);
      }

      // Legacy endpoints -> helpful error
      if (url.pathname === "/api/list" || url.pathname === "/meta" || url.pathname === "/crl") {
        return jsonError(410, "deprecated_endpoint", "This endpoint has moved. Use /api/v1/* equivalents instead.", {
          details: {
            list: "/api/v1/objects",
            collections: "/api/v1/collections/{ca|crl|dcrl}/items",
            metadata: "/api/v1/objects/{objectKey}/metadata",
            upload: "/api/v1/crls",
          },
        });
      }

  // Static assets (HTML, CSS, JS)
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
