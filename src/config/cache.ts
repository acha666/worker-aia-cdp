const LIST_CACHE_TTL = 60;
const LIST_CACHE_SMAXAGE = 300;
const LIST_CACHE_SWR = 86400;
const META_CACHE_TTL = 60;

const INTERNAL_CACHE_ORIGIN = "https://r2cache.internal";

const META_CACHE_CONTROL = `public, max-age=${META_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`;
const LIST_CACHE_CONTROL = `public, max-age=${LIST_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`;

const LIST_CACHE_KEYS = {
  CA: new Request(`${INTERNAL_CACHE_ORIGIN}/list?prefix=ca/&delimiter=/`),
  CRL: new Request(`${INTERNAL_CACHE_ORIGIN}/list?prefix=crl/&delimiter=/`),
  DCRL: new Request(`${INTERNAL_CACHE_ORIGIN}/list?prefix=dcrl/&delimiter=/`),
};

export const cacheDurations = {
  LIST_CACHE_TTL,
  LIST_CACHE_SMAXAGE,
  LIST_CACHE_SWR,
  META_CACHE_TTL,
} as const;

export const cacheControlDirectives = {
  meta: META_CACHE_CONTROL,
  list: LIST_CACHE_CONTROL,
} as const;

export type CachePolicy = keyof typeof cacheControlDirectives;

export function getCacheControlHeader(policy: CachePolicy) {
  return cacheControlDirectives[policy];
}

export const listCacheKeys = LIST_CACHE_KEYS;

export function createMetaCacheKey(key: string) {
  return new Request(`${INTERNAL_CACHE_ORIGIN}/meta?key=${encodeURIComponent(key)}`);
}

export function createBinaryCacheKey(key: string, method: string = "GET") {
  const normalizedKey = key.replace(/^\/+/, "");
  const url = new URL(`${INTERNAL_CACHE_ORIGIN}/binary`);
  url.searchParams.set("key", normalizedKey);
  url.searchParams.set("method", method.toUpperCase());
  return new Request(url.toString(), { method: "GET" });
}

type ListCacheKeyOptions = {
  collection?: "ca" | "crl" | "dcrl" | null;
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
};

export function createListCacheKey({
  collection = null,
  prefix,
  delimiter,
  cursor,
  limit,
}: ListCacheKeyOptions) {
  const path = collection ? `/collections/${collection}/items` : "/objects";
  const url = new URL(`${INTERNAL_CACHE_ORIGIN}${path}`);
  if (prefix) url.searchParams.set("prefix", prefix);
  if (delimiter) url.searchParams.set("delimiter", delimiter);
  if (cursor) url.searchParams.set("cursor", cursor);
  if (typeof limit === "number") url.searchParams.set("limit", String(limit));
  return new Request(url.toString(), { method: "GET" });
}

export function getEdgeCache() {
  return (caches as unknown as { default: Cache }).default;
}

export type CacheStatus = "HIT" | "MISS";

export function cloneWithCacheStatus(response: Response, status: CacheStatus) {
  const cloned = response.clone();
  cloned.headers.set("X-Worker-Cache", status);
  return cloned;
}

export function markCacheStatus(response: Response, status: CacheStatus) {
  response.headers.set("X-Worker-Cache", status);
  return response;
}

export async function cacheResponse(cache: Cache, key: Request, response: Response, status: CacheStatus = "MISS") {
  const cacheCopy = response.clone();
  await cache.put(key, cacheCopy);
  return markCacheStatus(response, status);
}
