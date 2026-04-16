import type { Env } from "../env";
import { cacheDurations } from "../cache/config";
import { listCacheKeys } from "../cache/keys";
import { getEdgeCache, runSingleFlight } from "../cache/operations";

interface CachedListItem {
  key: string;
  size: number;
  uploaded?: string;
}

interface CachedListPayload {
  items: CachedListItem[];
}

function cacheKeyForPrefix(prefix: "ca/" | "crl/" | "dcrl/") {
  if (prefix === "ca/") {
    return listCacheKeys.CA;
  }
  if (prefix === "crl/") {
    return listCacheKeys.CRL;
  }
  return listCacheKeys.DCRL;
}

function deserializeCachedItems(items: CachedListItem[]): R2Object[] {
  return items.map(
    (item) =>
      ({
        key: item.key,
        size: item.size,
        uploaded: item.uploaded ? new Date(item.uploaded) : undefined,
      }) as unknown as R2Object
  );
}

async function readCachedList(response: Response): Promise<R2Object[]> {
  const json = (await response.json()) as CachedListPayload;
  return deserializeCachedItems(Array.isArray(json.items) ? json.items : []);
}

function serializeListPayload(objects: R2Object[]): string {
  const typedObjects = objects as unknown as {
    key: string;
    size?: number;
    uploaded?: Date | string;
  }[];

  return JSON.stringify({
    items: typedObjects.map((obj) => ({
      key: obj.key,
      size: obj.size ?? 0,
      uploaded: obj.uploaded instanceof Date ? obj.uploaded.toISOString() : undefined,
    })),
    cachedAt: new Date().toISOString(),
  });
}

export async function listAllWithPrefix(env: Env, prefix: string) {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await env.STORE.list({
      prefix,
      cursor,
      delimiter: undefined,
    });
    cursor = listing.truncated ? listing.cursor : undefined;
    out.push(...listing.objects);
  } while (cursor);
  return out;
}

export async function cachedListAllWithPrefix(
  env: Env,
  prefix: "ca/" | "crl/" | "dcrl/"
): Promise<R2Object[]> {
  const cache = getEdgeCache();
  const key = cacheKeyForPrefix(prefix);

  const hit = await cache.match(key);
  if (hit) {
    return readCachedList(hit);
  }

  return runSingleFlight(`r2:list:${prefix}`, async () => {
    const secondHit = await cache.match(key);
    if (secondHit) {
      return readCachedList(secondHit);
    }

    const objects = await listAllWithPrefix(env, prefix);
    const payload = serializeListPayload(objects);

    const response = new Response(payload, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${cacheDurations.LIST_CACHE_TTL}, s-maxage=${cacheDurations.LIST_CACHE_SMAXAGE}, stale-while-revalidate=${cacheDurations.LIST_CACHE_SWR}`,
      },
    });

    await cache.put(key, response.clone());
    return objects;
  });
}
