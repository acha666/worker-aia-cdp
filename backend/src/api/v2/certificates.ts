/**
 * API v2 - Certificates Handlers
 */

import type { RouteHandler } from "../../env";
import type {
  CertificateListItem,
  CertificateDetail,
  StorageInfo,
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
  buildTBSCertificate,
  buildCertificateFingerprints,
  buildCertificateStatus,
  buildAlgorithmIdentifier,
  buildBitString,
} from "./builders";
import { parseCertificate } from "../../pki/certs";
import { toJSDate } from "../../pki/utils";
import { extractPEMBlock } from "../../pki/crls";
import { getCacheControlHeader } from "../../cache";
import { SIGNATURE_ALG_NAMES } from "../../pki/constants";

const CERT_PREFIX = "ca/";

/**
 * GET /api/v2/certificates
 * List all certificates
 */
export const listCertificates: RouteHandler = async (req, env) => {
  const url = new URL(req.url);

  // Parse query parameters
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimitParam(url.searchParams.get("limit"), 50, 100);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.toLowerCase();

  // List objects from R2
  const list = await env.STORE.list({
    prefix: CERT_PREFIX,
    cursor,
    limit: limit + 10, // Fetch extra for filtering
    include: ["customMetadata"],
  } as R2ListOptions);

  const items: CertificateListItem[] = [];
  const now = Date.now();

  for (const object of list.objects) {
    // Only include certificate files
    if (!isCertificateFile(object.key)) {continue;}

    const metadata = (object as { customMetadata?: Record<string, string> })
      .customMetadata;
    const filename = object.key.replace(CERT_PREFIX, "");
    const format = object.key.endsWith(".pem") ? "pem" : "der";

    // Extract summary from metadata or use defaults
    const subjectCN = metadata?.summarySubjectCN ?? metadata?.subjectCN ?? null;
    const issuerCN = metadata?.summaryIssuerCN ?? metadata?.issuerCN ?? null;
    const notBefore = metadata?.summaryNotBefore ?? metadata?.notBefore ?? null;
    const notAfter = metadata?.summaryNotAfter ?? metadata?.notAfter ?? null;
    const serialNumber = metadata?.serialNumber ?? null;

    // Compute status
    const notBeforeDate = notBefore ? new Date(notBefore) : undefined;
    const notAfterDate = notAfter ? new Date(notAfter) : undefined;
    const certStatus = computeCertStatus(now, notBeforeDate, notAfterDate);

    // Apply filters
    if (status && certStatus.state !== status) {continue;}
    if (search) {
      const searchable = `${subjectCN ?? ""} ${issuerCN ?? ""}`.toLowerCase();
      if (!searchable.includes(search)) {continue;}
    }

    // Get fingerprints from metadata or generate placeholder
    const sha1 = metadata?.fingerprintSha1 ?? "";
    const sha256 = metadata?.fingerprintSha256 ?? "";

    const item: CertificateListItem = {
      id: filename,
      type: "certificate",
      href: `/api/v2/certificates/${encodeURIComponent(filename)}`,
      downloadUrl: `/${object.key}`,
      storage: {
        filename,
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
      status: certStatus,
      fingerprints: { sha1, sha256 },
    };

    items.push(item);
    if (items.length >= limit) {break;}
  }

  // Determine pagination
  const hasMore =
    list.truncated ||
    items.length < list.objects.filter((o) => isCertificateFile(o.key)).length;
  const nextCursor =
    hasMore && list.truncated
      ? (list as unknown as { cursor: string }).cursor
      : null;

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
    nextCursor,
  );

  return jsonSuccess(items, {
    meta: { pagination, links },
    headers: { "Cache-Control": getCacheControlHeader("list") },
  });
};

/**
 * GET /api/v2/certificates/{id}
 * Get certificate details
 */
export const getCertificate: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/v2\/certificates\/(.+)$/);
  if (!match) {return Errors.invalidPath();}

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
        "-----END CERTIFICATE-----",
      );
      der = block.slice().buffer as ArrayBuffer;
    } else {
      der = bytes;
    }
  } catch (error) {
    return jsonError(
      400,
      "invalid_certificate",
      "Failed to read certificate data",
      {
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }

  let cert;
  try {
    cert = parseCertificate(der);
  } catch (error) {
    return jsonError(
      400,
      "invalid_certificate",
      "Failed to parse certificate",
      {
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }

  // Build response
  const filename = id;
  const format = key.endsWith(".pem") ? "pem" : "der";

  const storage: StorageInfo = {
    filename,
    format,
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
    etag: object.etag,
  };

  const fingerprints = await buildCertificateFingerprints(der);

  const notBefore = toJSDate(cert.notBefore);
  const notAfter = toJSDate(cert.notAfter);
  const status = buildCertificateStatus(notBefore, notAfter);

  const tbsCertificate = await buildTBSCertificate(cert);

  // Optionally exclude extensions if not requested
  if (!include.has("extensions") && include.size > 0) {
    tbsCertificate.extensions = undefined;
  }

  const detail: CertificateDetail = {
    id: filename,
    type: "certificate",
    href: `/api/v2/certificates/${encodeURIComponent(filename)}`,
    downloadUrl: `/${key}`,
    storage,
    fingerprints,
    status,
    tbsCertificate,
    relationships: {},
  };

  // Include signature fields if requested or by default
  if (include.size === 0 || include.has("signaturealgorithm")) {
    detail.signatureAlgorithm = buildAlgorithmIdentifier(
      cert.signatureAlgorithm.algorithmId,
      cert.signatureAlgorithm.algorithmParams,
      SIGNATURE_ALG_NAMES,
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

function computeCertStatus(
  now: number,
  notBefore?: Date,
  notAfter?: Date,
): CertificateListItem["status"] {
  let state: "valid" | "expired" | "not-yet-valid" = "valid";
  let expiresIn: number | undefined;
  let expiredAgo: number | undefined;
  let startsIn: number | undefined;

  if (notBefore && now < notBefore.getTime()) {
    state = "not-yet-valid";
    startsIn = Math.floor((notBefore.getTime() - now) / 1000);
  } else if (notAfter && now > notAfter.getTime()) {
    state = "expired";
    expiredAgo = Math.floor((now - notAfter.getTime()) / 1000);
  } else if (notAfter) {
    expiresIn = Math.floor((notAfter.getTime() - now) / 1000);
  }

  return { state, expiresIn, expiredAgo, startsIn };
}
