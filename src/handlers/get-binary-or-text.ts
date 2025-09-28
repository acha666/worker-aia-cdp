import type { RouteHandler } from "../env";
import { cacheDurations, createBinaryCacheKey, getEdgeCache } from "../config/cache";
import { buildHeadersForObject } from "../http/content";

export const getBinaryOrText: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  if (!/^\/(ca|crl|dcrl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 });

  const key = url.pathname.replace(/^\/+/, "");
  const cache = getEdgeCache();
  const cacheKey = createBinaryCacheKey(key, req.method ?? "GET");

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;

  const object = await env.STORE.get(key);
  if (!object) {
    const notFound = new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": `public, max-age=${cacheDurations.META_CACHE_TTL}, s-maxage=${cacheDurations.LIST_CACHE_SMAXAGE}, stale-while-revalidate=${cacheDurations.LIST_CACHE_SWR}`,
      },
    });
    await cache.put(cacheKey, notFound.clone());
    return notFound;
  }

  const headers = buildHeadersForObject(object, key);
  const response = key.endsWith(".pem")
    ? new Response(await object.text(), { status: 200, headers })
    : new Response(await object.arrayBuffer(), { status: 200, headers });

  await cache.put(cacheKey, response.clone());
  return response;
};
