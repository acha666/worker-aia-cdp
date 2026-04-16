import type { RouteHandler } from "../../../env";
import type { CrlDetail, StorageInfo } from "../types";
import { jsonSuccess, jsonError, parseIncludeParam, Errors } from "../response";
import {
  buildTBSCertList,
  buildCrlFingerprints,
  determineCrlType,
  buildAlgorithmIdentifier,
  buildBitString,
} from "../builders";
import { parseCRL } from "../../../pki/parsers";
import { derBufferFromMaybePem, PEM_BLOCK_MARKERS } from "../../../pki/crls/pem";
import { getCacheControlHeader } from "../../../cache/config";
import { SIGNATURE_ALG_NAMES } from "../../../pki/constants";
import { includeField, stripKnownPrefix, stripPemSuffix } from "../shared/resource";
import { CRL_PREFIX, DCRL_PREFIX } from "./constants";

/**
 * GET /api/v2/crls/{id}
 * Get CRL details
 */
export const getCrl: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/v2\/crls\/(.+)$/);
  if (!match) {
    return Errors.invalidPath();
  }

  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return Errors.badRequest("Invalid CRL ID encoding");
  }

  const include = parseIncludeParam(url.searchParams.get("include"));
  const revocationsLimit = parseInt(url.searchParams.get("revocations.limit") ?? "10", 10) || 10;
  const revocationsCursor = parseInt(url.searchParams.get("revocations.cursor") ?? "0", 10) || 0;

  const key = await resolveCrlStorageKey(env, id);
  const object = await env.STORE.get(key);
  if (!object) {
    return Errors.notFound("CRL");
  }

  let der: ArrayBuffer;
  try {
    der = derBufferFromMaybePem(await object.arrayBuffer(), key, PEM_BLOCK_MARKERS.crl);
  } catch (error) {
    return jsonError(400, "invalid_crl", "Failed to read CRL data", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  let crl;
  try {
    crl = parseCRL(der);
  } catch (error) {
    return jsonError(400, "invalid_crl", "Failed to parse CRL", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const baseKey = stripPemSuffix(key);
  const filename = stripKnownPrefix(baseKey, [CRL_PREFIX, DCRL_PREFIX]);
  const crlType = determineCrlType(crl);

  const storage: StorageInfo = {
    filename,
    format: "der",
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
    etag: object.etag,
  };

  const fingerprints = await buildCrlFingerprints(der);

  const includeRevocations = includeField(include, "revokedcertificates");
  const tbsCertList = buildTBSCertList(crl, {
    revocationsLimit: includeRevocations ? revocationsLimit : 0,
    revocationsCursor,
  });

  if (!includeRevocations) {
    tbsCertList.revokedCertificates = undefined;
  }

  if (include.size > 0 && !include.has("extensions")) {
    tbsCertList.crlExtensions = undefined;
  }

  const detail: CrlDetail = {
    id: baseKey,
    type: "crl",
    href: `/api/v2/crls/${encodeURIComponent(baseKey)}`,
    downloadUrl: `/${baseKey}`,
    storage,
    fingerprints,
    crlType,
    tbsCertList,
    relationships: {},
  };

  if (includeField(include, "signaturealgorithm")) {
    detail.signatureAlgorithm = buildAlgorithmIdentifier(
      crl.signatureAlgorithm.algorithmId,
      crl.signatureAlgorithm.algorithmParams,
      SIGNATURE_ALG_NAMES
    );
  }

  if (includeField(include, "signaturevalue")) {
    detail.signatureValue = buildBitString(crl.signatureValue);
  }

  return jsonSuccess(detail, {
    headers: { "Cache-Control": getCacheControlHeader("meta") },
  });
};

async function resolveCrlStorageKey(env: Parameters<RouteHandler>[1], id: string): Promise<string> {
  if (id.startsWith(CRL_PREFIX) || id.startsWith(DCRL_PREFIX)) {
    return id;
  }

  const fullCrlObject = await env.STORE.get(`${CRL_PREFIX}${id}`);
  if (fullCrlObject) {
    return `${CRL_PREFIX}${id}`;
  }

  return `${DCRL_PREFIX}${id}`;
}
