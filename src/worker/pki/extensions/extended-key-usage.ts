import { fromBER, Sequence } from "asn1js";
import * as pkijs from "pkijs";
import { EKU_NAMES } from "../constants";

export function parseExtendedKeyUsage(extension?: pkijs.Extension) {
  if (!extension) {
    return undefined;
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const sequence = asn1.result as Sequence;
    const oids: string[] = [];
    for (const node of sequence.valueBlock.value) {
      const oid = (
        node as unknown as { valueBlock?: { toString?: () => string } }
      )?.valueBlock?.toString?.();
      if (typeof oid === "string" && oid.length > 0) {
        oids.push(oid);
      }
    }
    return {
      critical: extension.critical ?? false,
      oids,
      usages: oids.map((oid) => EKU_NAMES[oid] ?? oid),
    };
  } catch (error) {
    console.warn("extendedKeyUsage parse error", error);
    return undefined;
  }
}
