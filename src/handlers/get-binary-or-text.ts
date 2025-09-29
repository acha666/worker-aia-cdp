import type { RouteHandler } from "../env";
import {
  cacheResponse,
  createBinaryCacheKey,
  getCacheControlHeader,
  getEdgeCache,
  withCacheStatus,
} from "../config/cache";
import { buildHeadersForObject } from "../http/content";

export const getBinaryOrText: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  if (!/^\/(ca|crl|dcrl)\//.test(url.pathname)) {
    const notFound = new Response("Not Found", { status: 404 });
    return withCacheStatus(notFound, "MISS");
  }

  const key = url.pathname.replace(/^\/+/, "");
  const cache = getEdgeCache();
  const cacheKey = createBinaryCacheKey(key, req.method ?? "GET");

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return withCacheStatus(cachedResponse, "HIT");

  const object = await env.STORE.get(key);
  if (!object) {
    const notFound = new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": getCacheControlHeader("meta"),
      },
    });
    return cacheResponse(cache, cacheKey, notFound);
  }

  const headers = buildHeadersForObject(object, key);
  const response = key.endsWith(".pem")
    ? new Response(await object.text(), { status: 200, headers })
    : new Response(await object.arrayBuffer(), { status: 200, headers });

  return cacheResponse(cache, cacheKey, response);
};
