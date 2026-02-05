import { fromBER, Sequence } from "asn1js";
import * as pkijs from "pkijs";
import { describeName } from "../utils/describe";
import { toHex } from "../utils/conversion";

export function parseAuthorityKeyIdentifier(extension?: pkijs.Extension) {
  if (!extension) {
    return undefined;
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const sequence = asn1.result as Sequence;
    let keyIdentifier: string | null = null;
    const authorityCertIssuer: string[] = [];
    let authorityCertSerialNumber: string | null = null;
    for (const element of sequence.valueBlock.value) {
      if (element.idBlock.tagClass !== 3) {
        continue;
      }
      if (element.idBlock.tagNumber === 0) {
        keyIdentifier = toHex(
          (element as unknown as { valueBlock: { valueHex: ArrayBuffer } }).valueBlock.valueHex
        );
      } else if (element.idBlock.tagNumber === 1) {
        const names = new pkijs.GeneralNames({ schema: element });
        for (const generalName of names.names) {
          if (generalName.type === 6 && typeof generalName.value === "string") {
            authorityCertIssuer.push(generalName.value);
          } else if (
            generalName.type === 4 &&
            generalName.value instanceof pkijs.RelativeDistinguishedNames
          ) {
            authorityCertIssuer.push(describeName(generalName.value).dn);
          }
        }
      } else if (element.idBlock.tagNumber === 2) {
        authorityCertSerialNumber = toHex(
          (element as unknown as { valueBlock: { valueHex: ArrayBuffer } }).valueBlock.valueHex
        );
      }
    }
    return {
      critical: extension.critical ?? false,
      keyIdentifier,
      authorityCertIssuer,
      authorityCertSerialNumber,
    };
  } catch (error) {
    console.warn("authorityKeyIdentifier parse error", error);
    return undefined;
  }
}
