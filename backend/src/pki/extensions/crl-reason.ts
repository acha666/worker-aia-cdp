import { fromBER } from "asn1js";
import * as pkijs from "pkijs";
import { CRL_REASON_CODES } from "../constants";

export function parseCRLReason(extensions?: pkijs.Extensions) {
  const reasonExtension = extensions?.extensions?.find(
    (ext) => ext.extnID === "2.5.29.21",
  );
  if (!reasonExtension) {return undefined;}
  try {
    const asn1 = fromBER(reasonExtension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const enumerated = asn1.result as unknown as {
      valueBlock?: { valueDec?: number };
    };
    const code: number | undefined = enumerated?.valueBlock?.valueDec;
    if (typeof code === "number")
      {return CRL_REASON_CODES[code] ?? `reason_${code}`;}
  } catch (error) {
    console.warn("crl reason parse error", error);
  }
  return undefined;
}
