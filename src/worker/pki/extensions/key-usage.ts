import { fromBER, BitString } from "asn1js";
import * as pkijs from "pkijs";
import { KEY_USAGE_FLAGS } from "../constants";
import { toHex } from "../utils/conversion";

export function parseKeyUsageExtension(extension?: pkijs.Extension) {
  if (!extension) {
    return undefined;
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const bitString = asn1.result as BitString;
    const bytes =
      bitString.valueBlock.valueHexView ??
      new Uint8Array(bitString.valueBlock.valueHex);
    if (bytes.length === 0) {
      return undefined;
    }
    const unusedBits =
      typeof bitString.valueBlock.unusedBits === "number"
        ? bitString.valueBlock.unusedBits
        : 0;
    const totalBits = Math.max(0, bytes.length * 8 - unusedBits);
    const flags: Record<string, boolean> = {};
    const enabled: string[] = [];
    for (let bitIndex = 0; bitIndex < KEY_USAGE_FLAGS.length; bitIndex++) {
      const flagName = KEY_USAGE_FLAGS[bitIndex];
      if (bitIndex >= totalBits) {
        flags[flagName] = false;
        continue;
      }
      const byteIndex = Math.floor(bitIndex / 8);
      const bitPosition = 7 - (bitIndex % 8);
      const isSet = (bytes[byteIndex] & (1 << bitPosition)) !== 0;
      flags[flagName] = isSet;
      if (isSet) {
        enabled.push(flagName);
      }
    }
    return {
      critical: extension.critical ?? false,
      enabled,
      flags,
      rawHex: toHex(bytes),
      unusedBits,
      totalBits,
    };
  } catch (error) {
    console.warn("keyUsage parse error", error);
    return undefined;
  }
}
