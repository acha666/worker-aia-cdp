/**
 * Cache Key Generation
 *
 * Helpers for creating cache keys for different object types.
 * Uses internal HTTPS origin to avoid conflicts with actual R2 keys.
 *
 * Cache key format enables:
 * - Logical separation of different object types
 * - Version tracking for cache invalidation
 * - Query parameter-based filtering without URL conflicts
 */

const INTERNAL_CACHE_ORIGIN = "https://r2cache.internal";
const CACHE_VERSION = "v1"; // Increment when metadata schema changes

const LIST_CACHE_KEYS = {
  CA: new Request(`${INTERNAL_CACHE_ORIGIN}/list?prefix=ca/&delimiter=/`),
  CRL: new Request(`${INTERNAL_CACHE_ORIGIN}/list?prefix=crl/&delimiter=/`),
  DCRL: new Request(`${INTERNAL_CACHE_ORIGIN}/list?prefix=dcrl/&delimiter=/`),
};

export const listCacheKeys = LIST_CACHE_KEYS;

/**
 * Create cache key for object metadata
 * @param key R2 object key
 * @returns Request object suitable for cache.match/put
 */
export function createMetaCacheKey(key: string) {
  return new Request(
    `${INTERNAL_CACHE_ORIGIN}/meta/${CACHE_VERSION}?key=${encodeURIComponent(key)}`,
  );
}

/**
 * Create cache key for binary objects
 * @param key R2 object key
 * @param method HTTP method (for future use, typically GET)
 * @returns Request object suitable for cache.match/put
 */
export function createBinaryCacheKey(key: string, method = "GET") {
  const normalizedKey = key.replace(/^\/+/, "");
  const url = new URL(`${INTERNAL_CACHE_ORIGIN}/binary/${CACHE_VERSION}`);
  url.searchParams.set("key", normalizedKey);
  url.searchParams.set("method", method.toUpperCase());
  return new Request(url.toString(), { method: "GET" });
}

interface ListCacheKeyOptions {
  collection?: "ca" | "crl" | "dcrl" | null;
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Create cache key for list operations with optional filtering
 * @param options List query options (prefix, delimiter, pagination)
 * @returns Request object suitable for cache.match/put
 *
 * Note: Currently unused but provided for future list pagination caching
 */
export function createListCacheKey({
  collection = null,
  prefix,
  delimiter,
  cursor,
  limit,
}: ListCacheKeyOptions) {
  const path = collection ? `/collections/${collection}/items` : "/objects";
  const url = new URL(`${INTERNAL_CACHE_ORIGIN}${path}`);
  if (prefix) {url.searchParams.set("prefix", prefix);}
  if (delimiter) {url.searchParams.set("delimiter", delimiter);}
  if (cursor) {url.searchParams.set("cursor", cursor);}
  if (typeof limit === "number") {url.searchParams.set("limit", String(limit));}
  return new Request(url.toString(), { method: "GET" });
}
