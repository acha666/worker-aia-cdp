import type { RouteHandler } from "../env";
import { getEdgeCache } from "../config/cache";
import { buildHeadersForObject } from "../http/content";

export const getBinaryOrText: RouteHandler = async (req, env) => {
  const url = new URL(req.url);
  if (!/^\/(ca|crl|dcrl)\//.test(url.pathname)) return new Response("Not Found", { status: 404 });

  const key = url.pathname.replace(/^\/+/, "");
  const cache = getEdgeCache();
  const cacheKey = new Request(url.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const object = await env.STORE.get(key);
  if (!object) return new Response("Not Found", { status: 404 });

  const headers = buildHeadersForObject(object, key);
  const response = key.endsWith(".pem")
    ? new Response(await object.text(), { status: 200, headers })
    : new Response(await object.arrayBuffer(), { status: 200, headers });

  await cache.put(cacheKey, response.clone());
  return response;
};
