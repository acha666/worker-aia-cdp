import type { RouteHandler } from "../../../env";
import type { CertificateDetail, StorageInfo } from "../types";
import { jsonSuccess, jsonError, parseIncludeParam, Errors } from "../response";
import {
  buildTBSCertificate,
  buildCertificateFingerprints,
  buildAlgorithmIdentifier,
  buildBitString,
} from "../builders";
import { parseCertificate } from "../../../pki/parsers";
import { derBufferFromMaybePem, PEM_BLOCK_MARKERS } from "../../../pki/crls/pem";
import { getCacheControlHeader } from "../../../cache/config";
import { SIGNATURE_ALG_NAMES } from "../../../pki/constants";
import { CERT_PREFIX } from "./constants";
import { includeField, stripPemSuffix } from "../shared/resource";

/**
 * GET /api/v2/certificates/{id}
 * Get certificate details
 */
export const getCertificate: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/v2\/certificates\/(.+)$/);
  if (!match) {
    return Errors.invalidPath();
  }

  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return Errors.badRequest("Invalid certificate ID encoding");
  }

  const include = parseIncludeParam(url.searchParams.get("include"));
  const key = `${CERT_PREFIX}${id}`;
  const object = await env.STORE.get(key);

  if (!object) {
    return Errors.notFound("Certificate");
  }

  let der: ArrayBuffer;
  try {
    der = derBufferFromMaybePem(await object.arrayBuffer(), key, PEM_BLOCK_MARKERS.certificate);
  } catch (error) {
    return jsonError(400, "invalid_certificate", "Failed to read certificate data", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  let cert;
  try {
    cert = parseCertificate(der);
  } catch (error) {
    return jsonError(400, "invalid_certificate", "Failed to parse certificate", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const baseId = stripPemSuffix(id);

  const storage: StorageInfo = {
    filename: baseId,
    format: "der",
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
    etag: object.etag,
  };

  const fingerprints = await buildCertificateFingerprints(der);
  const tbsCertificate = await buildTBSCertificate(cert);

  if (!include.has("extensions") && include.size > 0) {
    tbsCertificate.extensions = undefined;
  }

  const detail: CertificateDetail = {
    id: baseId,
    type: "certificate",
    href: `/api/v2/certificates/${encodeURIComponent(baseId)}`,
    downloadUrl: `/${CERT_PREFIX}${baseId}`,
    storage,
    fingerprints,
    tbsCertificate,
    relationships: {},
  };

  if (includeField(include, "signaturealgorithm")) {
    detail.signatureAlgorithm = buildAlgorithmIdentifier(
      cert.signatureAlgorithm.algorithmId,
      cert.signatureAlgorithm.algorithmParams,
      SIGNATURE_ALG_NAMES
    );
  }

  if (includeField(include, "signaturevalue")) {
    detail.signatureValue = buildBitString(cert.signatureValue);
  }

  return jsonSuccess(detail, {
    headers: { "Cache-Control": getCacheControlHeader("meta") },
  });
};
