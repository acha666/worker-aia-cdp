import type { RouteHandler } from "../../../env";
import type { CertificateListItem } from "../types";
import {
  jsonSuccess,
  parseLimitParam,
  createPaginationMeta,
  createPaginationLinks,
} from "../response";
import { getCacheControlHeader } from "../../../cache/config";
import {
  readCertificateSummaryMetadata,
  readCustomMetadata,
  readFingerprintMetadata,
} from "../../../r2/metadata";
import { DER_CERT_PATTERN, CERT_PREFIX, isCertificateFile } from "./constants";
import { ensureCertificatePemVariant, queueCertificateMetadataRebuildIfMissing } from "./metadata";
import { baseFilenameFromKey } from "../shared/resource";

/**
 * GET /api/v2/certificates
 * List all certificates
 */
export const listCertificates: RouteHandler = async (req, env, ctx) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimitParam(url.searchParams.get("limit"), 50, 100);
  const search = url.searchParams.get("search")?.toLowerCase();

  const list = await env.STORE.list({
    prefix: CERT_PREFIX,
    cursor,
    limit: limit * 2 + 10,
    include: ["customMetadata"],
  } as R2ListOptions);

  const certMap = new Map<string, CertificateListItem>();

  for (const object of list.objects) {
    if (!isCertificateFile(object.key)) {
      continue;
    }

    const baseFilename = baseFilenameFromKey(object.key, CERT_PREFIX);
    if (certMap.has(baseFilename)) {
      continue;
    }

    if (certMap.size >= limit) {
      break;
    }

    const metadata = readCustomMetadata(object);

    queueCertificateMetadataRebuildIfMissing(ctx, env, object.key, metadata);

    if (DER_CERT_PATTERN.test(object.key)) {
      ctx.waitUntil(
        ensureCertificatePemVariant(env, object.key, metadata).catch((error) => {
          console.error(`Failed to ensure PEM variant for ${object.key}:`, error);
        })
      );
    }

    const { subjectCN, issuerCN, notBefore, notAfter, serialNumber } =
      readCertificateSummaryMetadata(metadata);

    if (search) {
      const searchable = `${subjectCN ?? ""} ${issuerCN ?? ""}`.toLowerCase();
      if (!searchable.includes(search)) {
        continue;
      }
    }

    const { sha1, sha256 } = readFingerprintMetadata(metadata);
    const canonicalId = baseFilename;

    certMap.set(baseFilename, {
      id: canonicalId,
      type: "certificate",
      href: `/api/v2/certificates/${encodeURIComponent(canonicalId)}`,
      downloadUrl: `/${CERT_PREFIX}${canonicalId}`,
      storage: {
        filename: canonicalId,
        format: "der",
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
    });
  }

  const items = Array.from(certMap.values());
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
