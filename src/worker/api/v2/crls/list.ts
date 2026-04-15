import type { RouteHandler } from "../../../env";
import type { CrlListItem, CrlType } from "../types";
import {
  jsonSuccess,
  parseLimitParam,
  createPaginationMeta,
  createPaginationLinks,
} from "../response";
import { getCacheControlHeader } from "../../../cache/config";
import {
  readCrlSummaryMetadata,
  readCustomMetadata,
  readFingerprintMetadata,
} from "../../../r2/metadata";
import { baseFilenameFromKey } from "../shared/resource";
import { DCRL_PREFIX, isCrlFile, listPrefixesByType } from "./constants";
import { queueCrlMetadataRebuildIfMissing } from "./metadata";

/**
 * GET /api/v2/crls
 * List all CRLs
 */
export const listCrls: RouteHandler = async (req, env, ctx) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = parseLimitParam(url.searchParams.get("limit"), 50, 100);
  const typeFilter = url.searchParams.get("type") as CrlType | null;

  const prefixes = listPrefixesByType(typeFilter);

  const crlMap = new Map<string, CrlListItem>();
  let nextCursor: string | null = null;
  let truncated = false;

  for (const prefix of prefixes) {
    if (crlMap.size >= limit) {
      break;
    }

    const list = await env.STORE.list({
      prefix,
      cursor: prefix === prefixes[0] ? cursor : undefined,
      limit: (limit - crlMap.size) * 2 + 10,
      delimiter: "/",
      include: ["customMetadata"],
    } as R2ListOptions);

    for (const object of list.objects) {
      if (!isCrlFile(object.key)) {
        continue;
      }

      const baseFilename = baseFilenameFromKey(object.key, prefix);
      const dedupKey = `${prefix}${baseFilename}`;

      if (crlMap.has(dedupKey)) {
        continue;
      }

      if (crlMap.size >= limit) {
        break;
      }

      const metadata = readCustomMetadata(object);
      const crlType: CrlType = prefix === DCRL_PREFIX ? "delta" : "full";
      queueCrlMetadataRebuildIfMissing(ctx, env, object.key, crlType, metadata);

      const metadataSummary = readCrlSummaryMetadata(metadata);
      const { sha1, sha256 } = readFingerprintMetadata(metadata);
      const canonicalKey = `${prefix}${baseFilename}`;

      const item: CrlListItem = {
        id: canonicalKey,
        type: "crl",
        href: `/api/v2/crls/${encodeURIComponent(canonicalKey)}`,
        downloadUrl: `/${canonicalKey}`,
        storage: {
          filename: baseFilename,
          format: "der",
          size: object.size,
          uploadedAt: object.uploaded.toISOString(),
        },
        summary: {
          crlType,
          issuerCommonName: metadataSummary.issuerCN,
          crlNumber: metadataSummary.crlNumber,
          baseCrlNumber: metadataSummary.baseCrlNumber,
          thisUpdate: metadataSummary.thisUpdate,
          nextUpdate: metadataSummary.nextUpdate,
          revokedCount: metadataSummary.revokedCount,
        },
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
