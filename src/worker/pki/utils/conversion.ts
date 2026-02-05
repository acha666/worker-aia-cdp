/**
 * Data conversion utilities: hex, hash, date transformations
 */

export const toHex = (input: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(input)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const toBufferSource = (input: ArrayBuffer | Uint8Array): BufferSource =>
  (input instanceof Uint8Array ? input : new Uint8Array(input)) as unknown as BufferSource;

export async function sha256Hex(data: ArrayBuffer | Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", toBufferSource(data));
  return toHex(digest);
}

export async function sha1Hex(data: ArrayBuffer | Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-1", toBufferSource(data));
  return toHex(digest);
}

export function toJSDate(maybe: unknown): Date | undefined {
  try {
    if (!maybe) {
      return undefined;
    }
    if (maybe instanceof Date) {
      return maybe;
    }
    let text: string | undefined;

    if (typeof maybe === "object" && maybe !== null) {
      const obj = maybe as Record<string, unknown>;
      if (typeof obj.toDate === "function") {
        const result = (obj.toDate as () => unknown).call(maybe);
        if (result instanceof Date) {
          return result;
        }
      }
      if (obj.value instanceof Date) {
        return obj.value;
      }
      if (typeof obj.valueBlock === "object" && obj.valueBlock !== null) {
        const valueBlock = obj.valueBlock as Record<string, unknown>;
        if (valueBlock.value instanceof Date) {
          return valueBlock.value;
        }
      }
      if (typeof obj.value === "string") {
        text = obj.value;
      }
    }

    if (typeof maybe === "string") {
      text = maybe;
    }
    if (typeof text === "string") {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("toJSDate error:", error, "input:", maybe);
  }
  console.warn("toJSDate could not normalize input:", maybe);
  return undefined;
}

export function decimalFromHex(hex: string | null) {
  if (!hex) {
    return null;
  }
  try {
    return BigInt(`0x${hex}`).toString(10);
  } catch (error) {
    console.warn("decimalFromHex error", error, hex);
    return null;
  }
}
