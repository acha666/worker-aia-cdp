/**
 * API v2 - Certificates Handlers
 */

import type { RouteHandler } from "../../env";
import type { CertificateListItem, CertificateDetail, StorageInfo } from "./types";
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
  buildTBSCertificate,
  buildCertificateFingerprints,
  buildAlgorithmIdentifier,
  buildBitString,
} from "./builders";
import { parseCertificate } from "../../pki/parsers";
import { extractPEMBlock } from "../../pki/crls/pem";
import { getCacheControlHeader } from "../../cache/config";
import { SIGNATURE_ALG_NAMES } from "../../pki/constants";
import { ensureSummaryMetadata } from "../../r2/summary";

const CERT_PREFIX = "ca/";

/**
 * GET /api/v2/certificates
 * List all certificates
 *
 * Note: Returns one entry per unique certificate (deduplicated by base filename).
 * Both DER and PEM formats are available for each certificate, but only one list item
 * is returned per certificate with the DER format preferred. Clients can request the
 * PEM format via the downloadUrl by appending .pem to the base filename.
 */
export const listCertificates: RouteHandler = async (req, env) => {
  const url = new URL(req.url);

  // Parse query parameters
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimitParam(url.searchParams.get("limit"), 50, 100);
  const search = url.searchParams.get("search")?.toLowerCase();

  // List objects from R2
  const list = await env.STORE.list({
    prefix: CERT_PREFIX,
    cursor,
    limit: limit * 2 + 10, // Fetch extra to account for PEM duplicates
    include: ["customMetadata"],
  } as R2ListOptions);

  // Use a Map to deduplicate certificates by their base filename
  // Key: baseFilename, Value: CertificateListItem
  const certMap = new Map<string, CertificateListItem>();

  for (const object of list.objects) {
    // Only include certificate files
    if (!isCertificateFile(object.key)) {
      continue;
    }

    // Extract base filename (without .pem extension)
    const baseFilename = object.key.endsWith(".pem")
      ? object.key.replace(".pem", "").replace(CERT_PREFIX, "")
      : object.key.replace(CERT_PREFIX, "");

    // Skip if we've already added this certificate (prefer DER over PEM)
    if (certMap.has(baseFilename)) {
      continue;
    }

    if (certMap.size >= limit) {
      break;
    }

    let metadata = (object as { customMetadata?: Record<string, string> }).customMetadata;

    // Lazy-load summary metadata if missing (for initially-uploaded certificates)
    // When certificates are manually uploaded to R2 (without going through the API),
    // they lack the computed summary metadata. This ensures such certificates get
    // their metadata generated and cached on first access to the list endpoint.
    const hasSummaryMetadata =
      metadata?.summarySubjectCN ??
      metadata?.summaryIssuerCN ??
      metadata?.summaryNotBefore ??
      metadata?.summaryNotAfter;

    if (!hasSummaryMetadata) {
      try {
        const summary = await ensureSummaryMetadata({
          env,
          key: object.key,
          kind: "certificate",
          existingMeta: metadata,
        });
        if (summary) {
          // Fetch updated metadata after summary generation
          const updated = await env.STORE.head(object.key);
          metadata = (updated as { customMetadata?: Record<string, string> })?.customMetadata;
        }
      } catch (error) {
        // If metadata generation fails, continue with null summary fields
        console.error(`Failed to generate summary for ${object.key}:`, error);
      }
    }

    // Always report DER format (canonical format)
    const format = "der";

    // Extract summary from metadata or use defaults
    const subjectCN = metadata?.summarySubjectCN ?? metadata?.subjectCN ?? null;
    const issuerCN = metadata?.summaryIssuerCN ?? metadata?.issuerCN ?? null;
    const notBefore = metadata?.summaryNotBefore ?? metadata?.notBefore ?? null;
    const notAfter = metadata?.summaryNotAfter ?? metadata?.notAfter ?? null;
    const serialNumber = metadata?.serialNumber ?? null;

    if (search) {
      const searchable = `${subjectCN ?? ""} ${issuerCN ?? ""}`.toLowerCase();
      if (!searchable.includes(search)) {
        continue;
      }
    }

    // Get fingerprints from metadata or generate placeholder
    const sha1 = metadata?.fingerprintSha1 ?? "";
    const sha256 = metadata?.fingerprintSha256 ?? "";

    // Use base filename for canonical DER representation
    const canonicalId = baseFilename;

    const item: CertificateListItem = {
      id: canonicalId,
      type: "certificate",
      href: `/api/v2/certificates/${encodeURIComponent(canonicalId)}`,
      downloadUrl: `/${CERT_PREFIX}${canonicalId}`,
      storage: {
        filename: canonicalId,
        format,
        size: object.size,
        uploadedAt: object.uploaded.toISOString(),
      },
      summary: {
        subjectCN,
        issuerCN,
        serialNumber,
        notBefore,
        notAfter,
      },
      fingerprints: { sha1, sha256 },
    };

    certMap.set(baseFilename, item);
  }

  const items = Array.from(certMap.values()); // Determine pagination
  const hasMore =
    list.truncated || items.length < list.objects.filter((o) => isCertificateFile(o.key)).length;
  const nextCursor =
    hasMore && list.truncated ? (list as unknown as { cursor: string }).cursor : null;

  const pagination = createPaginationMeta({
    cursor: cursor ?? null,
    nextCursor,
    hasMore,
    pageSize: items.length,
  });

  const links = createPaginationLinks(
    url.origin,
    "/api/v2/certificates",
    url.searchParams,
    nextCursor
  );

  return jsonSuccess(items, {
    meta: { pagination, links },
    headers: { "Cache-Control": getCacheControlHeader("list") },
  });
};

/**
 * GET /api/v2/certificates/{id}
 * Get certificate details
 *
 * Note: The API always returns canonical DER format information, regardless of
 * whether a PEM variant was requested. This implements API design principle #9
 * (Format Deduplication): when a resource is available in multiple formats,
 * the API returns a single logical item representing the canonical DER format.
 *
 * If a client requests a PEM variant (e.g., /api/v2/certificates/root-ca.crt.pem),
 * this endpoint still returns DER format metadata. The PEM binary is available
 * separately via downloadUrl + ".pem" (e.g., /ca/root-ca.crt.pem).
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

  // Try to find the certificate
  const key = `${CERT_PREFIX}${id}`;
  const object = await env.STORE.get(key);

  if (!object) {
    return Errors.notFound("Certificate");
  }

  // Parse the certificate
  let der: ArrayBuffer;
  try {
    const bytes = await object.arrayBuffer();
    if (key.endsWith(".pem")) {
      const pemText = new TextDecoder().decode(bytes);
      const block = extractPEMBlock(
        pemText,
        "-----BEGIN CERTIFICATE-----",
        "-----END CERTIFICATE-----"
      );
      der = block.slice().buffer as ArrayBuffer;
    } else {
      der = bytes;
    }
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

  // Build response
  // Always report the canonical DER format, regardless of how the certificate was requested.
  // If a PEM version was requested, we still parse its DER content and report DER metadata.
  const baseId = id.endsWith(".pem") ? id.replace(".pem", "") : id;
  const format = "der"; // Always canonical DER format per API design

  const storage: StorageInfo = {
    filename: baseId,
    format,
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
    etag: object.etag,
  };

  const fingerprints = await buildCertificateFingerprints(der);

  const tbsCertificate = await buildTBSCertificate(cert);

  // Optionally exclude extensions if not requested
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

  // Include signature fields if requested or by default
  if (include.size === 0 || include.has("signaturealgorithm")) {
    detail.signatureAlgorithm = buildAlgorithmIdentifier(
      cert.signatureAlgorithm.algorithmId,
      cert.signatureAlgorithm.algorithmParams,
      SIGNATURE_ALG_NAMES
    );
  }

  if (include.size === 0 || include.has("signaturevalue")) {
    detail.signatureValue = buildBitString(cert.signatureValue);
  }

  return jsonSuccess(detail, {
    headers: { "Cache-Control": getCacheControlHeader("meta") },
  });
};

// =============================================================================
// Helper Functions
// =============================================================================

function isCertificateFile(key: string): boolean {
  return (
    key.endsWith(".crt") ||
    key.endsWith(".cer") ||
    key.endsWith(".der") ||
    key.endsWith(".crt.pem") ||
    key.endsWith(".cer.pem")
  );
}
