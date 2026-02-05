/**
 * API v2 - CRL Handlers
 */

import type { RouteHandler } from "../../env";
import type {
  CrlListItem,
  CrlDetail,
  CrlUploadResult,
  StorageInfo,
  CrlType,
  CrlStatusState,
} from "./types";
import {
  jsonSuccess,
  jsonError,
  parseIncludeParam,
  parseLimitParam,
  createPaginationMeta,
  createPaginationLinks,
  Errors,
} from "./response";
import {
  buildTBSCertList,
  buildCrlFingerprints,
  buildCrlStatus,
  determineCrlType,
  buildAlgorithmIdentifier,
  buildBitString,
} from "./builders";
import {
  parseCRL,
  getCRLNumber,
  getDeltaBaseCRLNumber,
  getCRLAKIHex,
  getCN,
} from "../../pki/parsers";
import { toJSDate, sha256Hex } from "../../pki/utils/conversion";
import { extractPEMBlock } from "../../pki/crls/pem";
import {
  findIssuerCertForCRL,
  verifyCRLWithIssuer,
  classifyCRL,
  isNewerCRL,
  archiveExistingCRL,
} from "../../pki/crls/issuers";
import { getCacheControlHeader } from "../../cache/config";
import { listCacheKeys, createMetaCacheKey } from "../../cache/keys";
import { getEdgeCache } from "../../cache/operations";
import { SIGNATURE_ALG_NAMES } from "../../pki/constants";
import { putBinary, getExistingCRL } from "../../r2/objects";
import { buildSummaryMetadata, type ObjectSummary } from "../../r2/summary";

const CRL_PREFIX = "crl/";
const DCRL_PREFIX = "dcrl/";

/**
 * GET /api/v2/crls
 * List all CRLs
 *
 * Note: Returns one entry per unique CRL (deduplicated by base filename).
 * Both DER and PEM formats are available for each CRL, but only one list item
 * is returned per CRL with the DER format preferred. Clients can request the
 * PEM format via the downloadUrl by appending .pem to the base filename.
 *
 * Lists only CRLs in the root of each CRL prefix (crl/ and dcrl/) to avoid
 * returning alternative access paths (like by-keyid/) as separate entries.
 * Alternative access paths remain available for direct download but are not
 * included in list results.
 */
export const listCrls: RouteHandler = async (req, env) => {
  const url = new URL(req.url);

  // Parse query parameters
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimitParam(url.searchParams.get("limit"), 50, 100);
  const typeFilter = url.searchParams.get("type") as CrlType | null;
  const statusFilter = url.searchParams.get("status") as CrlStatusState | null;

  // Determine which prefixes to search
  const prefixes: string[] = [];
  if (!typeFilter || typeFilter === "full") {
    prefixes.push(CRL_PREFIX);
  }
  if (!typeFilter || typeFilter === "delta") {
    prefixes.push(DCRL_PREFIX);
  }

  // Use a Map to deduplicate CRLs by their base filename
  // Key: "prefix:baseFilename", Value: CrlListItem
  const crlMap = new Map<string, CrlListItem>();
  const now = Date.now();
  let nextCursor: string | null = null;
  let truncated = false;

  for (const prefix of prefixes) {
    if (crlMap.size >= limit) {
      break;
    }

    const list = await env.STORE.list({
      prefix,
      cursor: prefix === prefixes[0] ? cursor : undefined,
      limit: (limit - crlMap.size) * 2 + 10, // Fetch extra to account for PEM duplicates
      delimiter: "/", // Only list files in the root of this prefix, not in subdirectories
      include: ["customMetadata"],
    } as R2ListOptions);

    for (const object of list.objects) {
      if (!isCrlFile(object.key)) {
        continue;
      }

      // Extract base filename (without .pem extension)
      const baseFilename = object.key.endsWith(".pem")
        ? object.key.replace(".pem", "").replace(prefix, "")
        : object.key.replace(prefix, "");

      // Create dedup key: prefix + baseFilename
      const dedupKey = `${prefix}${baseFilename}`;

      // Skip if we've already added this CRL (prefer DER over PEM)
      if (crlMap.has(dedupKey)) {
        continue;
      }

      if (crlMap.size >= limit) {
        break;
      }

      const metadata = (object as { customMetadata?: Record<string, string> }).customMetadata;
      const format = "der"; // Always report as DER (the canonical format)

      // Determine CRL type from path
      const crlType: CrlType = prefix === DCRL_PREFIX ? "delta" : "full";

      // Extract summary from metadata
      const issuerCN = metadata?.summaryIssuerCN ?? metadata?.issuerCN ?? null;
      const crlNumber = metadata?.crlNumber ?? null;
      const baseCrlNumber = metadata?.baseCRLNumber ?? null;
      const thisUpdate = metadata?.summaryThisUpdate ?? metadata?.thisUpdate ?? null;
      const nextUpdate = metadata?.summaryNextUpdate ?? metadata?.nextUpdate ?? null;
      const revokedCount = parseInt(metadata?.revokedCount ?? "0", 10) || 0;

      // Compute status
      const thisUpdateDate = thisUpdate ? new Date(thisUpdate) : undefined;
      const nextUpdateDate = nextUpdate ? new Date(nextUpdate) : undefined;
      const crlStatus = computeCrlStatus(now, thisUpdateDate, nextUpdateDate);

      // Apply filters
      if (statusFilter && crlStatus.state !== statusFilter) {
        continue;
      }

      // Get fingerprints from metadata
      const sha1 = metadata?.fingerprintSha1 ?? "";
      const sha256 = metadata?.fingerprintSha256 ?? "";

      // Use base filename without .pem for the id and downloadUrl
      const canonicalKey = `${prefix}${baseFilename}`;

      const item: CrlListItem = {
        id: canonicalKey,
        type: "crl",
        href: `/api/v2/crls/${encodeURIComponent(canonicalKey)}`,
        downloadUrl: `/${canonicalKey}`,
        storage: {
          filename: baseFilename,
          format,
          size: object.size,
          uploadedAt: object.uploaded.toISOString(),
        },
        summary: {
          crlType,
          issuerCommonName: issuerCN,
          crlNumber,
          baseCrlNumber,
          thisUpdate,
          nextUpdate,
          revokedCount,
        },
        status: crlStatus,
        fingerprints: { sha1, sha256 },
      };

      crlMap.set(dedupKey, item);
    }

    if (list.truncated) {
      truncated = true;
      nextCursor = list.cursor ?? null;
    }
  }

  const items = Array.from(crlMap.values());

  const pagination = createPaginationMeta({
    cursor: cursor ?? null,
    nextCursor,
    hasMore: truncated,
    pageSize: items.length,
  });

  const links = createPaginationLinks(url.origin, "/api/v2/crls", url.searchParams, nextCursor);

  return jsonSuccess(items, {
    meta: { pagination, links },
    headers: { "Cache-Control": getCacheControlHeader("list") },
  });
};

/**
 * GET /api/v2/crls/{id}
 * Get CRL details
 *
 * Note: The API always returns canonical DER format information, regardless of
 * whether a PEM variant was requested. This implements API design principle #9
 * (Format Deduplication): when a resource is available in multiple formats,
 * the API returns a single logical item representing the canonical DER format.
 *
 * If a client requests a PEM variant (e.g., /api/v2/crls/crl%2FAchaRootCA.crl.pem),
 * this endpoint still returns DER format metadata. The PEM binary is available
 * separately via downloadUrl + ".pem" (e.g., /crl/AchaRootCA.crl.pem).
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

  // Normalize the key - id might be "crl/filename" or "dcrl/filename"
  let key = id;
  if (!id.startsWith("crl/") && !id.startsWith("dcrl/")) {
    // Try crl/ first, then dcrl/
    const crlObject = await env.STORE.get(`crl/${id}`);
    if (crlObject) {
      key = `crl/${id}`;
    } else {
      key = `dcrl/${id}`;
    }
  }

  const object = await env.STORE.get(key);
  if (!object) {
    return Errors.notFound("CRL");
  }

  // Parse the CRL
  let der: ArrayBuffer;
  try {
    const bytes = await object.arrayBuffer();
    if (key.endsWith(".pem")) {
      const pemText = new TextDecoder().decode(bytes);
      const block = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
      der = block.slice().buffer as ArrayBuffer;
    } else {
      der = bytes;
    }
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

  // Build response
  // Always report the canonical DER format, regardless of how the CRL was requested.
  // If a PEM version was requested, we still parse its DER content and report DER metadata.
  const baseKey = key.endsWith(".pem") ? key.replace(".pem", "") : key;
  const filename = baseKey.replace(CRL_PREFIX, "").replace(DCRL_PREFIX, "");
  const format = "der"; // Always canonical DER format per API design
  const crlType = determineCrlType(crl);

  const storage: StorageInfo = {
    filename,
    format,
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
    etag: object.etag,
  };

  const fingerprints = await buildCrlFingerprints(der);

  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const status = buildCrlStatus(thisUpdate, nextUpdate);

  // Build TBSCertList
  const includeRevocations = include.size === 0 || include.has("revokedcertificates");
  const tbsCertList = buildTBSCertList(crl, {
    revocationsLimit: includeRevocations ? revocationsLimit : 0,
    revocationsCursor,
  });

  // Remove revocations if not requested
  if (!includeRevocations) {
    tbsCertList.revokedCertificates = undefined;
  }

  // Remove extensions if not requested
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
    status,
    crlType,
    tbsCertList,
    relationships: {},
  };

  // Include signature fields if requested or by default
  if (include.size === 0 || include.has("signaturealgorithm")) {
    detail.signatureAlgorithm = buildAlgorithmIdentifier(
      crl.signatureAlgorithm.algorithmId,
      crl.signatureAlgorithm.algorithmParams,
      SIGNATURE_ALG_NAMES
    );
  }

  if (include.size === 0 || include.has("signaturevalue")) {
    detail.signatureValue = buildBitString(crl.signatureValue);
  }

  return jsonSuccess(detail, {
    headers: { "Cache-Control": getCacheControlHeader("meta") },
  });
};

/**
 * POST /api/v2/crls
 * Upload a new CRL
 */
export const uploadCrl: RouteHandler = async (req, env) => {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  // Accept text/plain for PEM or application/pkix-crl for DER
  const isPem = contentType.startsWith("text/");
  const isDer =
    contentType === "application/pkix-crl" || contentType === "application/octet-stream";

  if (!isPem && !isDer) {
    return Errors.unsupportedMediaType(contentType || null);
  }

  let derBytes: Uint8Array;
  let pemText: string | undefined;

  try {
    if (isPem) {
      pemText = await req.text();
      derBytes = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
    } else {
      const arrayBuffer = await req.arrayBuffer();
      derBytes = new Uint8Array(arrayBuffer);
    }
  } catch (error) {
    return jsonError(400, "invalid_body", "Failed to read request body", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  // Parse CRL
  let crl;
  try {
    crl = parseCRL(derBytes.buffer as ArrayBuffer);
  } catch (error) {
    return jsonError(400, "invalid_crl", "Failed to parse CRL", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  // Find and verify issuer
  const issuer = await findIssuerCertForCRL(env, crl);
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

  // Classify and check for existing
  const classification = classifyCRL(crl, issuer.cert);
  const existing = await getExistingCRL(env, classification.logicalDERKey);

  if (!isNewerCRL(crl, existing?.parsed ?? undefined)) {
    return Errors.conflict(
      "stale_crl",
      classification.isDelta
        ? "Delta CRL is not newer than the stored version"
        : "CRL is not newer than the stored version"
    );
  }

  // Build metadata
  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl);
  const deltaBase = getDeltaBaseCRLNumber(crl);
  const issuerCN = getCN(issuer.cert) ?? "";
  const issuerKeyId = getCRLAKIHex(crl) ?? "";

  const baseMeta: Record<string, string> = {
    issuerKeyId,
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

  // Count revoked certificates
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

  // Archive existing if present
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

  // Generate PEM if uploaded as DER
  if (!pemText) {
    const base64 = btoa(String.fromCharCode(...derBytes));
    const lines = base64.match(/.{1,64}/g) ?? [];
    pemText = `-----BEGIN X509 CRL-----\n${lines.join("\n")}\n-----END X509 CRL-----\n`;
  }

  // Store the CRL
  await putBinary(env, classification.logicalDERKey, derBytes, { meta });
  await putBinary(env, classification.logicalPEMKey, new TextEncoder().encode(pemText), { meta });
  if (classification.byAkiKey) {
    await putBinary(env, classification.byAkiKey, derBytes, { meta });
  }

  // Invalidate caches
  const cache = getEdgeCache();
  await Promise.allSettled([
    cache.delete(listCacheKeys.CRL),
    cache.delete(listCacheKeys.DCRL),
    cache.delete(listCacheKeys.CA),
    cache.delete(createMetaCacheKey(`/${classification.logicalDERKey}`)),
    cache.delete(createMetaCacheKey(`/${classification.logicalPEMKey}`)),
    ...(classification.byAkiKey
      ? [cache.delete(createMetaCacheKey(`/${classification.byAkiKey}`))]
      : []),
  ]);

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
      keyIdentifier: issuerKeyId || null,
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

// =============================================================================
// Helper Functions
// =============================================================================

function isCrlFile(key: string): boolean {
  return key.endsWith(".crl") || key.endsWith(".crl.pem");
}

function computeCrlStatus(
  now: number,
  thisUpdate?: Date,
  nextUpdate?: Date
): CrlListItem["status"] {
  let state: CrlStatusState = "current";
  let expiresIn: number | undefined;
  let expiredAgo: number | undefined;

  if (nextUpdate) {
    if (now > nextUpdate.getTime()) {
      state = "expired";
      expiredAgo = Math.floor((now - nextUpdate.getTime()) / 1000);
    } else {
      // Check if stale (past 80% of validity)
      if (thisUpdate) {
        const validityPeriod = nextUpdate.getTime() - thisUpdate.getTime();
        const elapsed = now - thisUpdate.getTime();
        if (elapsed > validityPeriod * 0.8) {
          state = "stale";
        }
      }
      expiresIn = Math.floor((nextUpdate.getTime() - now) / 1000);
    }
  }

  return { state, expiresIn, expiredAgo };
}
