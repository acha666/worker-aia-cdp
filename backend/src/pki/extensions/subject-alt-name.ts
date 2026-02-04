import { fromBER } from "asn1js";
import * as pkijs from "pkijs";
import { describeName } from "../utils";
import { formatIPAddress } from "./utils";

export function parseSubjectAltName(extension?: pkijs.Extension) {
  if (!extension) {return undefined;}
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const names = new pkijs.GeneralNames({ schema: asn1.result });
    const dnsNames: string[] = [];
    const emailAddresses: string[] = [];
    const ipAddresses: string[] = [];
    const uris: string[] = [];
    const directoryNames: {
      dn: string;
      rdns: {
        oid: string;
        name: string;
        shortName: string | null;
        value: string;
      }[];
    }[] = [];
    const otherNames: { oid: string; valueHex: string }[] = [];
    const registeredIds: string[] = [];
    for (const name of names.names) {
      switch (name.type) {
        case 1:
          if (typeof name.value === "string") {emailAddresses.push(name.value);}
          break;
        case 2:
          if (typeof name.value === "string") {dnsNames.push(name.value);}
          break;
        case 6:
          if (typeof name.value === "string") {uris.push(name.value);}
          break;
        case 7:
          if (name.value instanceof ArrayBuffer)
            {ipAddresses.push(formatIPAddress(new Uint8Array(name.value)));}
          break;
        case 4:
          if (name.value instanceof pkijs.RelativeDistinguishedNames) {
            const description = describeName(name.value);
            directoryNames.push({ dn: description.dn, rdns: description.rdns });
          }
          break;
        case 0:
          otherNames.push({
            oid: name.value.type || "unknown",
            valueHex: name.value.valueHex ? name.value.valueHex : "",
          });
          break;
        case 8:
          registeredIds.push(name.value);
          break;
      }
    }
    return {
      critical: extension.critical ?? false,
      dnsNames,
      emailAddresses,
      ipAddresses,
      uris,
      directoryNames,
      registeredIds,
      otherNames,
    };
  } catch (error) {
    console.warn("subjectAltName parse error", error);
    return undefined;
  }
}
