export interface PemBlockMarkers {
  begin: string;
  end: string;
}

export const PEM_BLOCK_MARKERS = {
  certificate: {
    begin: "-----BEGIN CERTIFICATE-----",
    end: "-----END CERTIFICATE-----",
  },
  crl: {
    begin: "-----BEGIN X509 CRL-----",
    end: "-----END X509 CRL-----",
  },
} as const;

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

export function derBufferFromMaybePem(
  input: ArrayBuffer | Uint8Array,
  key: string,
  markers: PemBlockMarkers
): ArrayBuffer {
  const bytes = input instanceof Uint8Array ? input.slice() : new Uint8Array(input);
  if (!/\.pem$/i.test(key)) {
    return bytes.buffer;
  }

  const pemText = new TextDecoder().decode(bytes);
  const block = extractPEMBlock(pemText, markers.begin, markers.end);
  const copy = block.slice();
  return copy.buffer as ArrayBuffer;
}
