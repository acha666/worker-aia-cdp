import type { RouteHandler } from "../env";
import { jsonSuccess, jsonError } from "../http/json-response";
import { getEdgeCache, cacheDurations } from "../config/cache";

export const listObjects: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const { pathname } = url;
  const collectionMatch = pathname.match(/^\/api\/v1\/collections\/(ca|crl|dcrl)\/items$/);

  let prefix = url.searchParams.get("prefix") ?? "";
  let collection: string | null = null;
  if (collectionMatch) {
    collection = collectionMatch[1];
    prefix = `${collection}/`;
  } else if (pathname !== "/api/v1/objects") {
    return jsonError(404, "not_found", "Endpoint not found.");
  }

  const delimiter = url.searchParams.get("delimiter") ?? "/";
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(1000, Number(limitParam))) : undefined;

  const cacheUrl = new URL(`https://r2cache.internal${collection ? `/collections/${collection}/items` : "/objects"}`);
  const cacheParams = new URLSearchParams();
  if (prefix) cacheParams.set("prefix", prefix);
  if (delimiter) cacheParams.set("delimiter", delimiter);
  if (cursor) cacheParams.set("cursor", cursor);
  if (limit) cacheParams.set("limit", String(limit));
  cacheUrl.search = cacheParams.toString();
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  const cache = getEdgeCache();
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const list = await env.STORE.list({ prefix, delimiter, cursor, limit });

  const items = list.objects.map(object => ({
    key: object.key,
    size: (object as any).size ?? 0,
    etag: (object as any).etag ?? (object as any).httpEtag ?? null,
    uploaded: (object as any).uploaded instanceof Date ? (object as any).uploaded.toISOString() : null,
  }));

  const nextCursor = list.truncated ? list.cursor ?? null : null;
  const links: Record<string, string> = {
    self: url.origin + pathname + (url.search ? url.search : ""),
  };
  if (nextCursor) {
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.set("cursor", nextCursor);
    if (collectionMatch) nextParams.delete("prefix");
    else if (!nextParams.has("prefix") && prefix) nextParams.set("prefix", prefix);
    links.next = url.origin + pathname + `?${nextParams.toString()}`;
  }

  const response = jsonSuccess(
    {
      items,
      prefixes: list.delimitedPrefixes ?? [],
    },
    {
      meta: {
        prefix,
        delimiter,
        truncated: list.truncated,
        cursor: nextCursor,
        collection,
        count: items.length,
        links,
      },
      headers: {
        "Cache-Control": `public, max-age=${cacheDurations.LIST_CACHE_TTL}, s-maxage=${cacheDurations.LIST_CACHE_SMAXAGE}, stale-while-revalidate=${cacheDurations.LIST_CACHE_SWR}`,
      },
    },
  );

  await cache.put(cacheKey, response.clone());
  return response;
};
