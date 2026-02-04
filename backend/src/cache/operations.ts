/**
 * Cache Operations
 * Get cache instance and manage cached responses
 */

export type CacheStatus = "HIT" | "MISS" | "STALE";

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
  headerName = "X-Cache-Status",
): Response {
  const headers = new Headers(response.headers);
  headers.set(headerName, status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
