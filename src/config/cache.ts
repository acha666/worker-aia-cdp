const LIST_CACHE_TTL = 60;
const LIST_CACHE_SMAXAGE = 300;
const LIST_CACHE_SWR = 86400;
const META_CACHE_TTL = 60;

const LIST_CACHE_KEYS = {
  CA: new Request("https://r2cache.internal/list?prefix=ca/&delimiter=/"),
  CRL: new Request("https://r2cache.internal/list?prefix=crl/&delimiter=/"),
  DCRL: new Request("https://r2cache.internal/list?prefix=dcrl/&delimiter=/"),
};

export const cacheDurations = {
  LIST_CACHE_TTL,
  LIST_CACHE_SMAXAGE,
  LIST_CACHE_SWR,
  META_CACHE_TTL,
} as const;

export const listCacheKeys = LIST_CACHE_KEYS;

export function createMetaCacheKey(key: string) {
  return new Request(`https://r2cache.internal/meta?key=${encodeURIComponent(key)}`);
}

export function getEdgeCache() {
  return (caches as unknown as { default: Cache }).default;
}
