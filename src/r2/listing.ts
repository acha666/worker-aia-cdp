import type { Env } from "../env";
import { cacheDurations, listCacheKeys, getEdgeCache } from "../config/cache";

export async function listAllWithPrefix(env: Env, prefix: string) {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listing = await env.STORE.list({ prefix, cursor, delimiter: undefined });
    cursor = listing.truncated ? listing.cursor : undefined;
    for (const obj of listing.objects) out.push(obj);
  } while (cursor);
  return out;
}

export async function cachedListAllWithPrefix(env: Env, prefix: "ca/" | "crl/" | "dcrl/"): Promise<R2Object[]> {
  const cache = getEdgeCache();
  const key = prefix === "ca/" ? listCacheKeys.CA : prefix === "crl/" ? listCacheKeys.CRL : listCacheKeys.DCRL;

  const hit = await cache.match(key);
  if (hit) {
    const json: any = await hit.json();
    return (json.items as Array<{ key: string; size: number; uploaded?: string }>).map(item => ({
      key: item.key,
      size: item.size,
      uploaded: item.uploaded ? new Date(item.uploaded) : undefined,
    } as unknown as R2Object));
  }

  const objects = await listAllWithPrefix(env, prefix);
  const payload = JSON.stringify({
    items: objects.map(obj => ({
      key: obj.key,
      size: (obj as any).size ?? 0,
      uploaded: (obj as any).uploaded instanceof Date ? (obj as any).uploaded.toISOString() : undefined,
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
