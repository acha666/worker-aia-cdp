import type { RouteHandler } from "../env";
import { jsonError, jsonSuccess } from "../http/json-response";
import { getMetaJSON, type ObjectMetadataResource } from "../crl/metadata";
import {
  cacheResponse,
  cloneWithCacheStatus,
  createMetaCacheKey,
  getCacheControlHeader,
  getEdgeCache,
  markCacheStatus,
} from "../config/cache";

export const getObjectMetadata: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/v1\/objects\/(.+)\/metadata$/);
  if (!match) return markCacheStatus(jsonError(400, "invalid_path", "Metadata endpoint path is invalid."), "MISS");

  let decodedKey: string;
  try {
    decodedKey = decodeURIComponent(match[1]);
  } catch (error) {
    const invalid = jsonError(400, "invalid_key", "Object key must be URL-encoded.", {
      details: { message: error instanceof Error ? error.message : String(error) },
    });
    return markCacheStatus(invalid, "MISS");
  }

  const normalizedKey = decodedKey.startsWith("/") ? decodedKey : `/${decodedKey}`;
  const cache = getEdgeCache();
  const cacheKey = createMetaCacheKey(normalizedKey);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cloneWithCacheStatus(cachedResponse, "HIT");

  let metadata: ObjectMetadataResource | undefined;
  try {
    metadata = await getMetaJSON(env, normalizedKey);
  } catch (error) {
    const unsupported = jsonError(400, "unsupported_key", "The provided key prefix is not supported.", {
      details: { key: normalizedKey, message: error instanceof Error ? error.message : String(error) },
    });
    return markCacheStatus(unsupported, "MISS");
  }

  if (!metadata) {
    const notFound = jsonError(404, "not_found", "Object not found.", {
      headers: {
        "Cache-Control": getCacheControlHeader("meta"),
      },
      details: { key: normalizedKey },
    });
    await cacheResponse(cache, cacheKey, notFound);
    return notFound;
  }

  const response = jsonSuccess(metadata, {
    meta: {
      id: metadata.id,
      objectType: metadata.attributes.objectType,
      cachedAt: new Date().toISOString(),
    },
    headers: {
      "Cache-Control": getCacheControlHeader("meta"),
    },
  });

  await cacheResponse(cache, cacheKey, response);
  return response;
};
