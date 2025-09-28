import type { Env } from "../env";
import { parseCRL } from "../pki/parsers";

export async function putBinary(env: Env, key: string, data: ArrayBuffer | Uint8Array, meta?: Record<string, string>) {
  console.log("PUT", key, "meta:", meta);
  return env.STORE.put(key, data, { httpMetadata: {}, customMetadata: meta });
}

export async function getExistingCRL(env: Env, key: string) {
  const object = await env.STORE.get(key);
  if (!object) return undefined;
  const der = await object.arrayBuffer();
  const parsed = parseCRL(der);
  return { obj: object, der, parsed };
}
