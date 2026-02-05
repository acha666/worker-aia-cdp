interface HexFormatOptions {
  groupSize?: number;
  separator?: string;
  uppercase?: boolean;
}

export function formatHex(hex: string, options: HexFormatOptions = {}): string {
  const groupSize = options.groupSize ?? 2;
  const separator = options.separator ?? ":";
  const uppercase = options.uppercase ?? true;
  const value = uppercase ? hex.toUpperCase() : hex;

  if (groupSize <= 0) return value;

  const groups = value.match(new RegExp(`.{1,${groupSize}}`, "g")) || [];
  return separator ? groups.join(separator) : groups.join("");
}

export function normalizeHexForCopy(hex: string): string {
  const trimmed = hex.trim();
  const noPrefix =
    trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  return noPrefix.replace(/[:\s-]/g, "").toUpperCase();
}

export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") return;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
