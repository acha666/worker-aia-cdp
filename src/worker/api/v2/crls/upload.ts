import type { RouteHandler } from "../../../env";
import type { CrlUploadResult } from "../types";
import { jsonSuccess, jsonError, Errors } from "../response";
import {
  parseCRL,
  getCRLNumber,
  getDeltaBaseCRLNumber,
  getCRLAKIHex,
  getCN,
} from "../../../pki/parsers";
import { extractPEMBlock } from "../../../pki/crls/pem";
import {
  findIssuerCertForCRL,
  verifyCRLWithIssuer,
  resolveCRLStorageKeys,
  isNewerCRL,
  archiveExistingCRL,
} from "../../../pki/crls/issuers";
import { toJSDate, sha256Hex } from "../../../pki/utils/conversion";
import { listCacheKeys, createMetaCacheKey } from "../../../cache/keys";
import { getEdgeCache } from "../../../cache/operations";
import { putBinary, getExistingCRL } from "../../../r2/objects";
import { buildSummaryMetadata, type ObjectSummary } from "../../../r2/summary";
import { derToPem } from "../shared/pem";
/**
 * POST /api/v2/crls
 * Upload a new CRL
 */
export const uploadCrl: RouteHandler = async (req, env) => {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    return Errors.unsupportedMediaType(contentType || null);
  }

  const parsedUpload = await parseUploadBody(req);
  if (parsedUpload instanceof Response) {
    return parsedUpload;
  }

  const { derBytes, pemText } = parsedUpload;

  let crl;
  try {
    crl = parseCRL(derBytes.buffer as ArrayBuffer);
  } catch (error) {
    return jsonError(400, "invalid_crl", "Failed to parse CRL", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const parsedAki = getCRLAKIHex(crl);
  if (!parsedAki) {
    return jsonError(400, "missing_aki", "Failed to parse Authority Key Identifier from CRL");
  }

  const issuer = await findIssuerCertForCRL(env, crl, parsedAki);
  if (!issuer) {
    return jsonError(
      400,
      "issuer_not_found",
      "Issuer certificate could not be resolved for this CRL"
    );
  }

  const signatureOk = await verifyCRLWithIssuer(crl, issuer.cert);
  if (!signatureOk) {
    return jsonError(400, "invalid_signature", "CRL signature validation failed");
  }

  const deltaBase = getDeltaBaseCRLNumber(crl);
  const classification = await resolveCRLStorageKeys({
    env,
    issuerKey: issuer.key,
    issuerKeyId: parsedAki,
    isDelta: deltaBase !== undefined,
  });
  const existing = await getExistingCRL(env, classification.logicalDERKey);

  if (!isNewerCRL(crl, existing?.parsed ?? undefined)) {
    return Errors.conflict(
      "stale_crl",
      classification.isDelta
        ? "Delta CRL is not newer than the stored version"
        : "CRL is not newer than the stored version"
    );
  }

  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl);
  const issuerCN = getCN(issuer.cert) ?? "";

  const baseMeta: Record<string, string> = {
    issuerKeyId: parsedAki,
    canonicalKey: classification.logicalDERKey,
    isDelta: classification.isDelta ? "true" : "false",
  };
  if (issuerCN) {
    baseMeta.issuerCN = issuerCN;
  }
  if (crlNumber !== undefined) {
    baseMeta.crlNumber = crlNumber.toString();
  }
  if (thisUpdate) {
    baseMeta.thisUpdate = thisUpdate.toISOString();
  }
  if (nextUpdate) {
    baseMeta.nextUpdate = nextUpdate.toISOString();
  }
  if (classification.isDelta && deltaBase !== undefined) {
    baseMeta.baseCRLNumber = deltaBase.toString();
  }

  const revokedCerts = (crl as { revokedCertificates?: unknown[] }).revokedCertificates;
  if (revokedCerts) {
    baseMeta.revokedCount = String(revokedCerts.length);
  }

  const summary: ObjectSummary = {
    kind: "crl",
    displayName: issuerCN || classification.friendly,
    subjectCommonName: null,
    issuerCommonName: issuerCN || null,
    notBefore: null,
    notAfter: null,
    thisUpdate: thisUpdate?.toISOString() ?? null,
    nextUpdate: nextUpdate?.toISOString() ?? null,
    isDelta: classification.isDelta,
  };

  const meta = buildSummaryMetadata(summary, baseMeta);

  let replaced: CrlUploadResult["replaced"];
  if (existing?.parsed) {
    const oldNumber = getCRLNumber(existing.parsed);
    const oldTag =
      oldNumber !== undefined ? oldNumber.toString() : (await sha256Hex(existing.der)).slice(0, 16);
    const archivedKey = `${classification.folder}/archive/${classification.friendly}-${oldTag}.crl`;

    await archiveExistingCRL(
      env,
      classification.folder,
      classification.friendly,
      existing as { der: ArrayBuffer; parsed: typeof crl },
      meta
    );
    replaced = {
      id: classification.logicalDERKey,
      crlNumber: getCRLNumber(existing.parsed)?.toString() ?? null,
      archivedTo: archivedKey,
    };
  }

  const outputPem =
    pemText ?? derToPem(derBytes, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");

  await putBinary(env, classification.logicalDERKey, derBytes, { meta });
  await putBinary(env, classification.logicalPEMKey, new TextEncoder().encode(outputPem), { meta });
  if (classification.byAkiKey) {
    await putBinary(env, classification.byAkiKey, derBytes, { meta });
  }

  await invalidateCrlCaches(
    classification.logicalDERKey,
    classification.logicalPEMKey,
    classification.byAkiKey
  );

  const result: CrlUploadResult = {
    id: classification.logicalDERKey,
    type: "crl",
    href: `/api/v2/crls/${encodeURIComponent(classification.logicalDERKey)}`,
    downloadUrl: `/${classification.logicalDERKey}`,
    crlType: classification.isDelta ? "delta" : "full",
    crlNumber: crlNumber?.toString() ?? null,
    baseCrlNumber: deltaBase?.toString() ?? null,
    thisUpdate: thisUpdate?.toISOString() ?? "",
    nextUpdate: nextUpdate?.toISOString() ?? null,
    issuer: {
      commonName: issuerCN || null,
      keyIdentifier: parsedAki || null,
    },
    stored: {
      der: classification.logicalDERKey,
      pem: classification.logicalPEMKey,
      byKeyId: classification.byAkiKey ?? undefined,
    },
    replaced,
  };

  return jsonSuccess(result, { status: 201 });
};

interface ParsedUploadBody {
  derBytes: Uint8Array;
  pemText?: string;
}

async function parseUploadBody(req: Request): Promise<ParsedUploadBody | Response> {
  let derBytes: Uint8Array;
  let pemText: string | undefined;

  try {
    const formData = await req.formData();
    const crlFile = formData.get("crl");

    if (!crlFile) {
      return Errors.badRequest("Missing required field: crl");
    }

    if (typeof crlFile === "string") {
      return Errors.badRequest("Field 'crl' must be a file, not a string");
    }

    const file = crlFile as File;
    const filename = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    const isPemFilename = filename.endsWith(".pem");
    const isDerFilename = filename.endsWith(".der") || filename.endsWith(".crl");

    if (isPemFilename && !isDerFilename) {
      const text = new TextDecoder().decode(arrayBuffer);
      pemText = text.trim();
      derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
    } else if (isDerFilename && !isPemFilename) {
      derBytes = new Uint8Array(arrayBuffer);
    } else {
      try {
        const text = new TextDecoder().decode(arrayBuffer).trim();
        if (text.includes("-----BEGIN X509 CRL-----")) {
          pemText = text;
          derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
        } else {
          derBytes = new Uint8Array(arrayBuffer);
        }
      } catch {
        derBytes = new Uint8Array(arrayBuffer);
      }
    }
  } catch (error) {
    return jsonError(400, "invalid_body", "Failed to read request body", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  return { derBytes, pemText };
}

async function invalidateCrlCaches(
  logicalDerKey: string,
  logicalPemKey: string,
  byAkiKey?: string
): Promise<void> {
  const cache = getEdgeCache();
  await Promise.allSettled([
    cache.delete(listCacheKeys.CRL),
    cache.delete(listCacheKeys.DCRL),
    cache.delete(listCacheKeys.CA),
    cache.delete(createMetaCacheKey(`/${logicalDerKey}`)),
    cache.delete(createMetaCacheKey(`/${logicalPemKey}`)),
    ...(byAkiKey ? [cache.delete(createMetaCacheKey(`/${byAkiKey}`))] : []),
  ]);
}
