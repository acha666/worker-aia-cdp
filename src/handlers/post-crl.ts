import type { RouteHandler } from "../env";
import { jsonError, jsonSuccess } from "../http/json-response";
import { extractPEMBlock } from "../crl/pem";
import {
  findIssuerCertForCRL,
  verifyCRLWithIssuer,
  classifyCRL,
  isNewerCRL,
  archiveExistingCRL,
} from "../crl/issuers";
import { parseCRL, getCRLNumber, getDeltaBaseCRLNumber, getCN, getSKIHex } from "../pki/parsers";
import { toJSDate } from "../pki/format";
import { putBinary, getExistingCRL } from "../r2/objects";
import { getEdgeCache, listCacheKeys, createMetaCacheKey } from "../config/cache";

export const createCRL: RouteHandler = async (req, env) => {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("text/")) {
    return jsonError(415, "unsupported_media_type", "Only text/plain PEM is accepted for CRL uploads.", {
      details: { received: contentType || null },
    });
  }

  let pemText = "";
  try {
    pemText = await req.text();
  } catch (error) {
    return jsonError(400, "invalid_body", "Failed to read request body as text.", {
      details: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  let derBytes: Uint8Array;
  try {
    derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
  } catch (error) {
    console.error("PEM parse error:", error);
    return jsonError(400, "invalid_pem", "Request body must contain a valid X.509 CRL PEM block.");
  }

  let crl;
  try {
    crl = parseCRL(derBytes.buffer as ArrayBuffer);
  } catch (error) {
    console.error("CRL parse error:", error);
    return jsonError(400, "invalid_der", "Failed to parse CRL after PEM decode.", {
      details: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  const issuer = await findIssuerCertForCRL(env, crl);
  if (!issuer) return jsonError(400, "issuer_not_found", "Issuer certificate could not be resolved for this CRL.");

  const signatureOk = await verifyCRLWithIssuer(crl, issuer.cert);
  if (!signatureOk) {
    return jsonError(400, "invalid_signature", "CRL signature validation failed for resolved issuer.");
  }

  const classification = classifyCRL(crl, issuer.cert);
  const existing = await getExistingCRL(env, classification.logicalDERKey);
  if (!isNewerCRL(crl, existing?.parsed)) {
    return jsonError(409, "stale_crl", classification.isDelta ? "Delta CRL is not newer than the stored version." : "CRL is not newer than the stored version.");
  }

  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl);
  const deltaBase = getDeltaBaseCRLNumber(crl);
  const meta: Record<string, string> = {
  issuerCN: getCN(issuer.cert) || "",
  issuerKeyId: getSKIHex(issuer.cert) || "",
    crlNumber: crlNumber !== undefined ? crlNumber.toString() : "",
    thisUpdate: thisUpdate ? thisUpdate.toISOString() : "",
    nextUpdate: nextUpdate ? nextUpdate.toISOString() : "",
    isDelta: String(classification.isDelta),
    baseCRLNumber: classification.isDelta && deltaBase !== undefined ? deltaBase.toString() : "",
  };

  if (existing) {
    await archiveExistingCRL(env, classification.folder, classification.friendly, existing, meta);
  }

  await putBinary(env, classification.logicalDERKey, derBytes, meta);
  await putBinary(env, classification.logicalPEMKey, new TextEncoder().encode(pemText), meta);
  if (classification.byAkiKey) await putBinary(env, classification.byAkiKey, derBytes, meta);

  const cache = getEdgeCache();
  await Promise.allSettled([
    cache.delete(listCacheKeys.CRL),
    cache.delete(listCacheKeys.DCRL),
    cache.delete(listCacheKeys.CA),
    cache.delete(createMetaCacheKey(`/${classification.logicalDERKey}`)),
    cache.delete(createMetaCacheKey(`/${classification.logicalPEMKey}`)),
    ...(classification.byAkiKey ? [cache.delete(createMetaCacheKey(`/${classification.byAkiKey}`))] : []),
    cache.delete(new Request("https://r2cache.internal/collections/crl/items?prefix=crl/&delimiter=/")),
    cache.delete(new Request("https://r2cache.internal/collections/dcrl/items?prefix=dcrl/&delimiter=/")),
    cache.delete(new Request("https://r2cache.internal/collections/ca/items?prefix=ca/&delimiter=/")),
    cache.delete(new Request("https://r2cache.internal/objects?prefix=crl/&delimiter=/")),
    cache.delete(new Request("https://r2cache.internal/objects?prefix=dcrl/&delimiter=/")),
  ]);

  const responsePayload = {
    kind: classification.isDelta ? "delta" : "full",
    stored: { der: classification.logicalDERKey, pem: classification.logicalPEMKey },
    byAki: classification.byAkiKey || null,
    crlNumber: meta.crlNumber || null,
    baseCRLNumber: meta.baseCRLNumber || null,
    thisUpdate: meta.thisUpdate || null,
    nextUpdate: meta.nextUpdate || null,
  };

  return jsonSuccess(responsePayload, { status: 201 });
};
