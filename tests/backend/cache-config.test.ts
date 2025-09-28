/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import { cacheDurations, createMetaCacheKey, getEdgeCache, listCacheKeys } from "../../src/config/cache";

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
    "https://r2cache.internal/meta?key=crl%2F%C3%9C%C3%B1%C3%AE%C3%A7%C3%B8d%C3%A9%20value.pem",
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
