import { EXTENSION_NAMES, OID_DICTIONARY } from "./constants";
import type * as pkijs from "pkijs";
import type { BitString } from "asn1js";

export const describeExtensionPresence = (extension: pkijs.Extension) => ({
  oid: extension.extnID,
  name: EXTENSION_NAMES[extension.extnID] ?? null,
  critical: extension.critical ?? false,
});

export function describeName(name: pkijs.RelativeDistinguishedNames) {
  const rdns = name.typesAndValues.map(tv => {
    const info = OID_DICTIONARY[tv.type];
    const raw = tv.value.valueBlock.value;
    const value = typeof raw === "string" ? raw : String(raw);
    return {
      oid: tv.type,
      name: info?.name ?? tv.type,
      shortName: info?.short ?? null,
      value,
    };
  });
  const dn = rdns.map(part => `${part.shortName ?? part.oid}=${part.value}`).join(", ");
  const commonName = rdns.find(part => part.shortName === "CN" || part.name === "commonName")?.value ?? null;
  return { dn, rdns, commonName };
}

export function bitStringBytes(bitString: BitString) {
  const bytes = new Uint8Array(bitString.valueBlock.valueHex);
  return bytes.length > 0 ? bytes.slice(1) : bytes;
}

export function describeAlgorithm(oid: string, dictionary: Record<string, string>) {
  return {
    oid,
    name: dictionary[oid] ?? oid,
  };
}
