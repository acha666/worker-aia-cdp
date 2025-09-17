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
    // ext.extnValue is OctetString (containing raw keyIdentifier bytes)
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    const raw = asn1.result; // OctetString
    return toHex((raw as OctetString).valueBlock.valueHex);
}

function getCRLAKIHex(crl: pkijs.CertificateRevocationList): string | undefined {
    const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.35"); // AKI
    if (!ext) return undefined;
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex); // SEQUENCE
    const seq = asn1.result as Sequence;
    // AuthorityKeyIdentifier ::= SEQUENCE { keyIdentifier [0] IMPLICIT OCTET STRING OPTIONAL, ... }
    const first = seq.valueBlock.value[0];
    // Context-specific [0] with OctetString inside (IMPLICIT)
    if (!first || first.idBlock.tagClass !== 3 || first.idBlock.tagNumber !== 0) return undefined;
    const keyOctets = first; // already raw octets under implicit tagging
    // @ts-ignore valueHex exists
    return toHex(keyOctets.valueBlock.valueHex);
}

function getCRLNumber(crl: pkijs.CertificateRevocationList): bigint | undefined {
    const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.20"); // CRLNumber
    if (!ext) return undefined;
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex); // Integer
    const int = asn1.result as Integer;
    // to bigInt
    const bytes = new Uint8Array(int.valueBlock.valueHex);
    let n = 0n;
    for (const b of bytes) n = (n << 8n) + BigInt(b);
    return n;
}

function friendlyNameFromCert(cert: pkijs.Certificate): string {
    const cn = getCN(cert);
    if (cn) {
        return cn.replace(/[^\w.-]+/g, "").replace(/\s+/g, "");
    }
    const ski = getSKIHex(cert);
    return ski ? `CA-${ski.slice(0, 16)}` : `CA-${Date.now()}`;
}

function httpHeadersForBinary(obj: R2ObjectBody | R2Object, type: "cert" | "crl") {
    const h = new Headers();
    h.set("Content-Type", type === "cert" ? "application/pkix-cert" : "application/pkix-crl");
    if ("httpEtag" in obj && obj.httpEtag) h.set("ETag", obj.httpEtag);
    if (obj.uploaded) h.set("Last-Modified", new Date(obj.uploaded).toUTCString());
    // 证书几乎不变：长缓存；CRL 可缓存短时且要求重验证
    if (type === "cert") h.set("Cache-Control", "public, max-age=31536000, immutable");
    else h.set("Cache-Control", "public, max-age=3600, must-revalidate");
    return h;
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
            } catch { /* ignore bad */ }
        }
    } while (cursor);
    return out;
}

async function findIssuerCertForCRL(env: Env, crl: pkijs.CertificateRevocationList) {
    const akiHex = getCRLAKIHex(crl);
    const candidates = await listCACandidates(env);
    if (akiHex) {
        for (const c of candidates) {
            const ski = getSKIHex(c.cert);
            if (ski && ski.toLowerCase() === akiHex.toLowerCase()) return c;
        }
    }
    // 回退：比对 Issuer DN 精确匹配
    const issuerDN = crl.issuer.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(",");
    for (const c of candidates) {
        const subjDN = c.cert.subject.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(",");
        if (issuerDN === subjDN) return c;
    }
    return undefined;
}

async function verifyCRLWithIssuer(crl: pkijs.CertificateRevocationList, issuer: pkijs.Certificate) {
    const ok = await crl.verify({ issuerCertificate: issuer });
    return ok === true;
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
    // conservatively reject if not strictly newer
    return false;
}

async function putBinary(env: Env, key: string, data: ArrayBuffer, meta?: Record<string, string>) {
    return env.STORE.put(key, data, { httpMetadata: {}, customMetadata: meta });
}

// --- 路由实现 ---
const getFile: RouteHandler = async (req, env) => {
    const url = new URL(req.url);
    // 仅允许 /ca/*.crt 与 /crl/*.crl
    if (!/^\/(ca|crl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 });
    const key = url.pathname.replace(/^\/+/, "");
    const obj = await env.STORE.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });
    const type = key.endsWith(".crt") ? "cert" : "crl";
    const hdr = httpHeadersForBinary(obj, type);
    // 可选：?pem=1 转 PEM
    if (url.searchParams.get("pem") === "1") {
        const der = await obj.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
        const pem =
            type === "cert"
                ? `-----BEGIN CERTIFICATE-----\n${b64.replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----\n`
                : `-----BEGIN X509 CRL-----\n${b64.replace(/(.{64})/g, "$1\n")}\n-----END X509 CRL-----\n`;
        hdr.set("Content-Type", "application/x-pem-file");
        return new Response(pem, { status: 200, headers: hdr });
    }
    return new Response(await obj.arrayBuffer(), { status: 200, headers: hdr });
};

const postCRL: RouteHandler = async (req, env) => {
    const ct = req.headers.get("content-type") || "";
    if (!/application\/(pkix-crl|octet-stream)/i.test(ct)) {
        return new Response(JSON.stringify({ error: "Expect DER CRL with Content-Type: application/pkix-crl" }), {
            status: 415,
            headers: { "Content-Type": "application/json" },
        });
    }
    const der = await req.arrayBuffer();
    const crl = parseCRL(der);

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
    // 选择存储文件名：优先 CN，回退 SKI
    const friendly = friendlyNameFromCert(issuer.cert)
        // 便于与你示例对齐：把 Issuing CA 名称里的空格/括号清理
        .replace(/IssuingCA/gi, "IssuingCA")
        .replace(/RootCA/gi, "RootCA");

    const logicalKey = `crl/${/Issuing/i.test(friendly) ? "AchaIssuingCA01" : "AchaRootCA"}.crl`;
    const byAkiKey = (() => {
        const aki = getCRLAKIHex(crl);
        return aki ? `crl/by-keyid/${aki}.crl` : undefined;
    })();

    // 现存 CRL 比较版本
    const existing = await getExistingCRL(env, logicalKey);
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

    // 写入新 CRL
    const crlNum = getCRLNumber(crl);
    const meta: Record<string, string> = {
        issuerCN: getCN(issuer.cert) || "",
        issuerKeyId: getSKIHex(issuer.cert) || "",
        crlNumber: crlNum !== undefined ? crlNum.toString() : "",
        thisUpdate: crl.thisUpdate?.toDate()?.toISOString() || "",
        nextUpdate: crl.nextUpdate?.toDate()?.toISOString() || "",
    };
    await putBinary(env, logicalKey, der, meta);
    if (byAkiKey) await putBinary(env, byAkiKey, der, meta);

    return new Response(
        JSON.stringify({
            status: "ok",
            stored: logicalKey,
            crlNumber: meta.crlNumber || null,
            thisUpdate: meta.thisUpdate || null,
            nextUpdate: meta.nextUpdate || null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
    );
};

const indexPage: RouteHandler = async (_req, env) => {
    const title = env.SITE_NAME || "AIA/CDP";
    return new Response(
        `<!doctype html><meta charset="utf-8">
<title>${title}</title>
<h1>${title}</h1>
<ul>
<li><a href="/ca/AchaRootCA_ECC-P384.crt">Root CA (DER)</a> | <a href="/ca/AchaRootCA_ECC-P384.crt?pem=1">PEM</a></li>
<li><a href="/ca/AchaIssuingCA01_RSA-4096.crt">Issuing CA 01 (DER)</a> | <a href="/ca/AchaIssuingCA01_RSA-4096.crt?pem=1">PEM</a></li>
<li><a href="/crl/AchaRootCA.crl">Root CRL (DER)</a> | <a href="/crl/AchaRootCA.crl?pem=1">PEM</a></li>
<li><a href="/crl/AchaIssuingCA01.crl">Issuing CRL (DER)</a> | <a href="/crl/AchaIssuingCA01.crl?pem=1">PEM</a></li>
</ul>
<p>POST new CRL (DER) to <code>/crl</code> with <code>Content-Type: application/pkix-crl</code>.</p>`,
        {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=60",
            },
        },
    );
};

// --- 主入口 ---
export default {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const { method } = req;
        const url = new URL(req.url);
        // 只允许 HTTP/HTTPS 访问，不做任何 https 跳转（交由域名侧配置）
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
            // 简化：用 GET 获取 meta，再只回头
            const r = await getFile(new Request(req, { method: "GET" }), env, ctx);
            return new Response(null, { status: r.status, headers: r.headers });
        }
        return new Response("Not Found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;
