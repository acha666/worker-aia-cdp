import { toHex } from "../utils/conversion";

function formatIPv6(bytes: Uint8Array) {
  const segments: string[] = [];
  for (let index = 0; index < 16; index += 2) {
    segments.push(((bytes[index] << 8) | bytes[index + 1]).toString(16));
  }
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < segments.length; ) {
    if (segments[index] !== "0") {
      index++;
      continue;
    }
    let cursor = index;
    while (cursor < segments.length && segments[cursor] === "0") {
      cursor++;
    }
    const length = cursor - index;
    if (length > bestLength) {
      bestStart = index;
      bestLength = length;
    }
    index = cursor;
  }
  if (bestLength > 1) {
    segments.splice(bestStart, bestLength, "");
    if (bestStart === 0) {
      segments.unshift("");
    }
    if (bestStart + bestLength === 8) {
      segments.push("");
    }
  }
  return segments.join(":");
}

export function formatIPAddress(bytes: Uint8Array) {
  if (bytes.length === 4) {
    return Array.from(bytes).join(".");
  }
  if (bytes.length === 16) {
    return formatIPv6(bytes);
  }
  return toHex(bytes);
}
