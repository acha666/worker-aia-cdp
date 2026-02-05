export function extractPEMBlock(pemText: string, begin: string, end: string): Uint8Array {
  const pattern = new RegExp(`${begin}[\\s\\S]*?${end}`, "g");
  const matches = pemText.match(pattern);
  if (!matches || matches.length === 0) {
    throw new Error(`PEM block not found: ${begin} ... ${end}`);
  }
  const block = matches[0];
  const base64Body = block
    .replace(begin, "")
    .replace(end, "")
    .replace(/[\r\n\s]/g, "");
  const binary = atob(base64Body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
