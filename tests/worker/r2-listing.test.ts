/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import { cachedListAllWithPrefix } from "../../src/worker/r2/listing";
import { listCacheKeys } from "../../src/worker/cache/keys";

class MemoryCache {
  readonly store = new Map<string, Response>();
  putCalls: { request: Request; response: Response }[] = [];

  async match(request: Request) {
    return this.store.get(request.url) ?? null;
  }

  async put(request: Request, response: Response) {
    this.store.set(request.url, response);
    this.putCalls.push({ request, response });
  }
}

function createEnv(
  listImpl: (options: { prefix: string; cursor?: string; delimiter?: string }) => Promise<any>
) {
  return {
    STORE: {
      list: listImpl,
    },
  } as unknown as import("../../src/worker/env").Env;
}

test("cachedListAllWithPrefix returns cached items without hitting R2", async () => {
  const cache = new MemoryCache();
  const cachedItems = {
    items: [
      { key: "ca/root.cer", size: 1024, uploaded: "2025-09-25T12:00:00.000Z" },
      { key: "ca/leaf.cer", size: 2048 },
    ],
    cachedAt: "2025-09-26T00:00:00.000Z",
  };
  await cache.put(
    listCacheKeys.CA,
    new Response(JSON.stringify(cachedItems), {
      headers: { "Content-Type": "application/json" },
    })
  );
  cache.putCalls = [];

  const originalCaches = globalThis.caches;
  globalThis.caches = { default: cache } as any;

  const env = createEnv(async () => {
    throw new Error("R2 list should not be invoked when cache hits");
  });

  try {
    const result = await cachedListAllWithPrefix(env, "ca/");
    assert.equal(result.length, 2);
    assert.equal(result[0].key, "ca/root.cer");
    assert.equal(result[0].size, 1024);
    assert(result[0].uploaded instanceof Date);
    assert.equal(result[0].uploaded?.toISOString(), "2025-09-25T12:00:00.000Z");
    assert.equal(result[1].uploaded, undefined);
    assert.equal(cache.putCalls.length, 0);
  } finally {
    globalThis.caches = originalCaches;
  }
});

test("cachedListAllWithPrefix fetches from R2 and populates cache when missing", async () => {
  const cache = new MemoryCache();
  const originalCaches = globalThis.caches;
  globalThis.caches = { default: cache } as any;

  const objects = [
    {
      key: "crl/current.crl",
      size: 4096,
      uploaded: new Date("2025-09-27T03:04:05.000Z"),
    },
  ];

  const env = createEnv(async () => ({
    objects,
    truncated: false,
  }));

  try {
    const result = await cachedListAllWithPrefix(env, "crl/");
    assert.equal(result.length, 1);
    assert.equal(result[0].key, "crl/current.crl");
    assert.equal(result[0].size, 4096);
    assert(result[0].uploaded instanceof Date);
    assert.equal(result[0].uploaded?.toISOString(), "2025-09-27T03:04:05.000Z");

    assert.equal(cache.putCalls.length, 1);
    const putCall = cache.putCalls[0];
    assert.equal(putCall.request.url, listCacheKeys.CRL.url);
    const stored = (await putCall.response.clone().json()) as {
      items: { key: string; size: number; uploaded: string }[];
      cachedAt: string;
    };
    assert.equal(stored.items.length, 1);
    assert.equal(stored.items[0].key, "crl/current.crl");
    assert.equal(stored.items[0].size, 4096);
    assert.equal(stored.items[0].uploaded, "2025-09-27T03:04:05.000Z");
    assert.equal(typeof stored.cachedAt, "string");
    const cacheControl = putCall.response.headers.get("cache-control");
    assert.equal(cacheControl, "public, max-age=30, s-maxage=60, stale-while-revalidate=0");
  } finally {
    globalThis.caches = originalCaches;
  }
});

test("cachedListAllWithPrefix deduplicates concurrent miss requests", async () => {
  const cache = new MemoryCache();
  const originalCaches = globalThis.caches;
  globalThis.caches = { default: cache } as any;

  let listCalls = 0;
  const env = createEnv(async () => {
    listCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return {
      objects: [
        {
          key: "ca/root.cer",
          size: 123,
          uploaded: new Date("2025-10-01T00:00:00.000Z"),
        },
      ],
      truncated: false,
    };
  });

  try {
    const [a, b, c] = await Promise.all([
      cachedListAllWithPrefix(env, "ca/"),
      cachedListAllWithPrefix(env, "ca/"),
      cachedListAllWithPrefix(env, "ca/"),
    ]);

    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(c.length, 1);
    assert.equal(listCalls, 1);
    assert.equal(cache.putCalls.length, 1);
  } finally {
    globalThis.caches = originalCaches;
  }
});
