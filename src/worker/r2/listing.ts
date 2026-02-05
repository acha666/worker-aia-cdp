import type { Env } from "../env";
import { cacheDurations } from "../cache/config";
import { listCacheKeys } from "../cache/keys";
import { getEdgeCache } from "../cache/operations";

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
    for (const obj of listing.objects) {
      out.push(obj);
    }
  } while (cursor);
  return out;
}

export async function cachedListAllWithPrefix(
  env: Env,
  prefix: "ca/" | "crl/" | "dcrl/",
): Promise<R2Object[]> {
  const cache = getEdgeCache();
  const key =
    prefix === "ca/"
      ? listCacheKeys.CA
      : prefix === "crl/"
        ? listCacheKeys.CRL
        : listCacheKeys.DCRL;

  const hit = await cache.match(key);
  if (hit) {
    const json = (await hit.json()) as unknown as {
      items: { key: string; size: number; uploaded?: string }[];
    };
    return (
      json.items as { key: string; size: number; uploaded?: string }[]
    ).map(
      (item) =>
        ({
          key: item.key,
          size: item.size,
          uploaded: item.uploaded ? new Date(item.uploaded) : undefined,
        }) as unknown as R2Object,
    );
  }

  const objects = await listAllWithPrefix(env, prefix);
  const typedObjects = objects as unknown as {
    key: string;
    size?: number;
    uploaded?: Date | string;
  }[];
  const payload = JSON.stringify({
    items: typedObjects.map((obj) => ({
      key: obj.key,
      size: obj.size ?? 0,
      uploaded:
        obj.uploaded instanceof Date ? obj.uploaded.toISOString() : undefined,
    })),
    cachedAt: new Date().toISOString(),
  });

  const response = new Response(payload, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${cacheDurations.LIST_CACHE_TTL}, s-maxage=${cacheDurations.LIST_CACHE_SMAXAGE}, stale-while-revalidate=${cacheDurations.LIST_CACHE_SWR}`,
    },
  });

  await cache.put(key, response.clone());
  return objects;
}
