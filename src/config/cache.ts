const LIST_CACHE_TTL = 60;
const LIST_CACHE_SMAXAGE = 300;
const LIST_CACHE_SWR = 86400;
const META_CACHE_TTL = 60;

const INTERNAL_CACHE_ORIGIN = "https://r2cache.internal";

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
