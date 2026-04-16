export function derToPem(
  bytes: ArrayBuffer | Uint8Array,
  beginMarker: string,
  endMarker: string
): string {
  const binaryBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const base64 = btoa(String.fromCharCode(...binaryBytes));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `${beginMarker}\n${lines.join("\n")}\n${endMarker}\n`;
}
