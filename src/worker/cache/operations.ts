/**
 * Cache Operations
 * Get cache instance and manage cached responses
 */

export type CacheStatus = "HIT" | "MISS" | "STALE";

const inFlightByKey = new Map<string, Promise<unknown>>();

/**
 * Get the edge cache instance
 */
export function getEdgeCache() {
  return (caches as unknown as { default: Cache }).default;
}

/**
 * Add cache status header to response
 * @param response The response to annotate
 * @param status Cache hit/miss/stale status
 * @param headerName Optional custom header name (defaults to X-Cache-Status for consistency)
 */
export function withCacheStatus(
  response: Response,
  status: CacheStatus,
  headerName = "X-Cache-Status"
): Response {
  const headers = new Headers(response.headers);
  headers.set(headerName, status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Store a clone of the response in cache and return an annotated copy.
 */
export async function cacheResponse(
  cache: Cache,
  cacheKey: Request,
  response: Response,
  headerName = "X-Cache-Status"
): Promise<Response> {
  await cache.put(cacheKey, response.clone());
  return withCacheStatus(response, "MISS", headerName);
}

/**
 * Deduplicate concurrent work by key within the same isolate.
 * Useful to avoid cache stampede on expensive R2/list/parse operations.
 */
export async function runSingleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
  const existing = inFlightByKey.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const pending = work().finally(() => {
    inFlightByKey.delete(key);
  });

  inFlightByKey.set(key, pending as Promise<unknown>);
  return pending;
}
