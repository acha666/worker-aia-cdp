import type { Env } from "../env";
import { parseCRL } from "../pki/parsers";

export interface R2PutOptions {
  meta?: Record<string, string>;
  onlyIf?: { etagMatches: string };
}

/**
 * Store binary data to R2 with optional conditional write support
 * @param env Cloudflare worker environment
 * @param key R2 object key
 * @param data Binary data to store
 * @param options R2 put options (metadata and conditional write support)
 */
export async function putBinary(
  env: Env,
  key: string,
  data: ArrayBuffer | Uint8Array,
  options?: R2PutOptions
) {
  return env.STORE.put(key, data, {
    httpMetadata: {},
    customMetadata: options?.meta,
    onlyIf: options?.onlyIf,
  });
}

/**
 * Retrieve and parse an existing CRL from R2
 * @param env Cloudflare worker environment
 * @param key R2 object key
 * @returns Object with R2 object, raw DER, and parsed CRL, or undefined if not found
 */
export async function getExistingCRL(env: Env, key: string) {
  try {
    const object = await env.STORE.get(key);
    if (!object) {
      return undefined;
    }

    const der = await object.arrayBuffer();
    let parsed;

    try {
      parsed = parseCRL(der);
    } catch (parseError) {
      // Return object but mark parsing as failed
      console.warn(`Failed to parse CRL at ${key}:`, parseError);
      return {
        obj: object,
        der,
        parsed: null,
        parseError: parseError instanceof Error ? parseError : new Error(String(parseError)),
      };
    }

    return { obj: object, der, parsed };
  } catch (error) {
    console.error(`Error retrieving CRL at ${key}:`, error);
    throw error;
  }
}
