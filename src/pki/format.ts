export const toHex = (input: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(input)].map(byte => byte.toString(16).padStart(2, "0")).join("");

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

export function toJSDate(maybe: any): Date | undefined {
  try {
    if (!maybe) return undefined;
    if (maybe instanceof Date) return maybe;
    if (typeof maybe.toDate === "function") return maybe.toDate();
    if (maybe?.value instanceof Date) return maybe.value;
    if (maybe?.valueBlock?.value instanceof Date) return maybe.valueBlock.value;
    const text = typeof maybe === "string" ? maybe : maybe?.value;
    if (typeof text === "string") {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  } catch (error) {
    console.warn("toJSDate error:", error, "input:", maybe);
  }
  console.warn("toJSDate could not normalize input:", maybe);
  return undefined;
}

export function decimalFromHex(hex: string | null) {
  if (!hex) return null;
  try {
    return BigInt(`0x${hex}`).toString(10);
  } catch (error) {
    console.warn("decimalFromHex error", error, hex);
    return null;
  }
}

export function secondsUntil(date: Date | undefined) {
  if (!date) return null;
  return Math.floor((date.getTime() - Date.now()) / 1000);
}

export function daysUntil(date: Date | undefined) {
  if (!date) return null;
  return Math.floor((date.getTime() - Date.now()) / 86400000);
}
