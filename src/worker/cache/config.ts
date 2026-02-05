/**
 * Cache Duration & Control Headers
 *
 * TTL values and Cache-Control directives for different response types.
 *
 * Strategy:
 * - Browser cache (max-age): Short TTL for frequent updates and freshness
 * - Edge cache (s-maxage): Longer TTL for shared cache reliability
 * - Stale-while-revalidate (SWR): Extended for background updates
 *
 * For more info on Cache-Control directives:
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
 * @see https://developers.cloudflare.com/cache/concepts/cache-control/
 */

// List cache durations: Full directory listings (CAs, CRLs)
const LIST_CACHE_TTL = 60; // browser: 1 minute - listings change infrequently
const LIST_CACHE_SMAXAGE = 300; // CDN: 5 minutes - higher reliability threshold
const LIST_CACHE_SWR = 86400; // stale-while-revalidate: 24 hours

// Metadata cache durations: Certificate/CRL metadata (subject, issuer, dates)
const META_CACHE_TTL = 60; // browser: 1 minute - same as list for consistency
const META_CACHE_SMAXAGE = 300; // CDN: 5 minutes - metadata is immutable per object

// Binary cache durations: Actual certificate/CRL files (immutable by R2 key)
const BINARY_CACHE_TTL = 31536000; // browser: 1 year - immutable content
const BINARY_CACHE_SMAXAGE = 31536000; // CDN: 1 year - immutable content

export const cacheDurations = {
  LIST_CACHE_TTL,
  LIST_CACHE_SMAXAGE,
  LIST_CACHE_SWR,
  META_CACHE_TTL,
  META_CACHE_SMAXAGE,
  BINARY_CACHE_TTL,
  BINARY_CACHE_SMAXAGE,
} as const;

// Constructed Cache-Control headers for common scenarios
const META_CACHE_CONTROL = `public, max-age=${META_CACHE_TTL}, s-maxage=${META_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`;
const LIST_CACHE_CONTROL = `public, max-age=${LIST_CACHE_TTL}, s-maxage=${LIST_CACHE_SMAXAGE}, stale-while-revalidate=${LIST_CACHE_SWR}`;
const BINARY_CACHE_CONTROL = `public, max-age=${BINARY_CACHE_TTL}, s-maxage=${BINARY_CACHE_SMAXAGE}, immutable`;

export const cacheControlDirectives = {
  meta: META_CACHE_CONTROL,
  list: LIST_CACHE_CONTROL,
  binary: BINARY_CACHE_CONTROL,
} as const;

export type CachePolicy = keyof typeof cacheControlDirectives;

/**
 * Get Cache-Control header value for a given policy
 * @param policy The cache policy (meta, list, or binary)
 * @returns Cache-Control header value
 */
export function getCacheControlHeader(policy: CachePolicy) {
  return cacheControlDirectives[policy];
}
