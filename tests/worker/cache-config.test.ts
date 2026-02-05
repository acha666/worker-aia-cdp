/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cacheDurations,
  cacheControlDirectives,
  getCacheControlHeader,
} from "../../src/worker/cache/config";
import {
  createBinaryCacheKey,
  createListCacheKey,
  createMetaCacheKey,
  listCacheKeys,
} from "../../src/worker/cache/keys";
import { cacheResponse, getEdgeCache, withCacheStatus } from "../../src/worker/cache/operations";

class MemoryCache {
  readonly store = new Map<string, Response>();
  async match(request: Request) {
    return this.store.get(request.url) ?? null;
  }
  async put(request: Request, response: Response) {
    this.store.set(request.url, response);
  }
}

test("cacheDurations expose expected TTL constants", () => {
  assert.equal(cacheDurations.LIST_CACHE_TTL, 60);
  assert.equal(cacheDurations.LIST_CACHE_SMAXAGE, 300);
  assert.equal(cacheDurations.LIST_CACHE_SWR, 86400);
  assert.equal(cacheDurations.META_CACHE_TTL, 60);
});

test("createMetaCacheKey encodes key safely", () => {
  const key = "crl/Üñîçødé value.pem";
  const request = createMetaCacheKey(key);
  assert.equal(
    request.url,
    "https://r2cache.internal/meta?key=crl%2F%C3%9C%C3%B1%C3%AE%C3%A7%C3%B8d%C3%A9%20value.pem"
  );
});

test("getEdgeCache returns global caches.default", () => {
  const original = globalThis.caches;
  const memoryCache = new MemoryCache();
  globalThis.caches = { default: memoryCache } as any;
  try {
    const cache = getEdgeCache();
    assert.equal(cache, memoryCache);
  } finally {
    globalThis.caches = original;
  }
});

test("predefined list cache keys point at expected URLs", () => {
  assert.equal(listCacheKeys.CA.url, "https://r2cache.internal/list?prefix=ca/&delimiter=/");
  assert.equal(listCacheKeys.CRL.url, "https://r2cache.internal/list?prefix=crl/&delimiter=/");
  assert.equal(listCacheKeys.DCRL.url, "https://r2cache.internal/list?prefix=dcrl/&delimiter=/");
});

test("createBinaryCacheKey normalizes leading slashes and encodes method", () => {
  const request = createBinaryCacheKey("/ca/root.pem", "head");
  const url = new URL(request.url);
  assert.equal(`${url.origin}${url.pathname}`, "https://r2cache.internal/binary");
  assert.equal(url.searchParams.get("key"), "ca/root.pem");
  assert.equal(url.searchParams.get("method"), "HEAD");
  assert.equal(request.method, "GET");
});

test("createListCacheKey composes cache key for collections and options", () => {
  const request = createListCacheKey({
    collection: "crl",
    prefix: "crl/",
    delimiter: "/",
    cursor: "opaque",
    limit: 25,
  });
  const url = new URL(request.url);
  assert.equal(`${url.origin}${url.pathname}`, "https://r2cache.internal/collections/crl/items");
  assert.equal(url.searchParams.get("prefix"), "crl/");
  assert.equal(url.searchParams.get("delimiter"), "/");
  assert.equal(url.searchParams.get("cursor"), "opaque");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(request.method, "GET");
});

test("getCacheControlHeader exposes directives", () => {
  assert.equal(getCacheControlHeader("meta"), cacheControlDirectives.meta);
  assert.equal(getCacheControlHeader("list"), cacheControlDirectives.list);
});

test("withCacheStatus returns annotated copy without mutating original", () => {
  const original = new Response("payload", { status: 200 });
  const hit = withCacheStatus(original, "HIT");
  assert.equal(hit.headers.get("X-Cache-Status"), "HIT");
  assert.equal(original.headers.get("X-Cache-Status"), null);
});

test("cacheResponse stores clone and labels outgoing response", async () => {
  const memoryCache = new MemoryCache();
  const cacheKey = new Request("https://example.test/cache");
  const response = new Response("body", { status: 200 });

  const result = await cacheResponse(memoryCache as unknown as Cache, cacheKey, response);

  assert.equal(result.headers.get("X-Cache-Status"), "MISS");
  const stored = memoryCache.store.get(cacheKey.url);
  assert.ok(stored);
  assert.equal(stored?.headers.get("X-Cache-Status"), null);
});
