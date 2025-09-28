import type { RouteHandler } from "../env";
import { jsonError, jsonSuccess } from "../http/json-response";
import { getMetaJSON } from "../crl/metadata";
import { createMetaCacheKey, getEdgeCache, cacheDurations } from "../config/cache";

export const getObjectMetadata: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/v1\/objects\/(.+)\/metadata$/);
  if (!match) return jsonError(400, "invalid_path", "Metadata endpoint path is invalid.");

  let decodedKey: string;
  try {
    decodedKey = decodeURIComponent(match[1]);
  } catch (error) {
    return jsonError(400, "invalid_key", "Object key must be URL-encoded.", {
      details: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  const normalizedKey = decodedKey.startsWith("/") ? decodedKey : `/${decodedKey}`;
  const cache = getEdgeCache();
  const cacheKey = createMetaCacheKey(normalizedKey);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let metadata;
  try {
    metadata = await getMetaJSON(env, normalizedKey);
  } catch (error) {
    return jsonError(400, "unsupported_key", "The provided key prefix is not supported.", {
      details: { key: normalizedKey, message: error instanceof Error ? error.message : String(error) },
    });
  }

  if (!metadata) {
    const notFound = jsonError(404, "not_found", "Object not found.", {
      headers: {
        "Cache-Control": `public, max-age=${cacheDurations.META_CACHE_TTL}, s-maxage=${cacheDurations.LIST_CACHE_SMAXAGE}, stale-while-revalidate=${cacheDurations.LIST_CACHE_SWR}`,
      },
      details: { key: normalizedKey },
    });
    await cache.put(cacheKey, notFound.clone());
    return notFound;
  }

  const response = jsonSuccess(metadata, {
    meta: {
      key: metadata.key,
      cachedAt: new Date().toISOString(),
    },
    headers: {
      "Cache-Control": `public, max-age=${cacheDurations.META_CACHE_TTL}, s-maxage=${cacheDurations.LIST_CACHE_SMAXAGE}, stale-while-revalidate=${cacheDurations.LIST_CACHE_SWR}`,
    },
  });

  await cache.put(cacheKey, response.clone());
  return response;
};
