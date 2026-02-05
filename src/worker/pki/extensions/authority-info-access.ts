import { fromBER, Sequence } from "asn1js";
import * as pkijs from "pkijs";
import { formatIPAddress } from "./utils";

export function parseAuthorityInfoAccess(extension?: pkijs.Extension) {
  if (!extension) {
    return undefined;
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const ocsp: string[] = [];
    const caIssuers: string[] = [];
    const other: { method: string; locations: string[] }[] = [];
    const sequence = asn1.result as Sequence;
    for (const access of sequence.valueBlock.value) {
      const accessDesc = access as Sequence;
      const methodNode = accessDesc.valueBlock.value[0];
      const locationNode = accessDesc.valueBlock.value[1];
      const method = methodNode?.valueBlock?.toString?.() ?? "";
      const locations: string[] = [];
      if (locationNode) {
        const generalName = new pkijs.GeneralName({ schema: locationNode });
        if (generalName.type === 6 && typeof generalName.value === "string") {
          locations.push(generalName.value);
        } else if (generalName.type === 1 && typeof generalName.value === "string") {
          locations.push(`mailto:${generalName.value}`);
        } else if (generalName.type === 2 && typeof generalName.value === "string") {
          locations.push(`dns:${generalName.value}`);
        } else if (generalName.type === 7 && generalName.value instanceof ArrayBuffer) {
          locations.push(`ip:${formatIPAddress(new Uint8Array(generalName.value))}`);
        }
      }
      if (method === "1.3.6.1.5.5.7.48.1") {
        ocsp.push(...locations);
      } else if (method === "1.3.6.1.5.5.7.48.2") {
        caIssuers.push(...locations);
      } else {
        other.push({ method, locations });
      }
    }
    return {
      critical: extension.critical ?? false,
      ocsp,
      caIssuers,
      other: other.filter((entry) => entry.locations.length > 0),
    };
  } catch (error) {
    console.warn("authorityInfoAccess parse error", error);
    return undefined;
  }
}
