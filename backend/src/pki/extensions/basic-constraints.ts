import { fromBER } from "asn1js";
import * as pkijs from "pkijs";

export function parseBasicConstraints(extension?: pkijs.Extension) {
  if (!extension) {return undefined;}
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const basicConstraints = new pkijs.BasicConstraints({
      schema: asn1.result,
    });
    const rawPath = basicConstraints.pathLenConstraint;
    const pathLenConstraint =
      rawPath === undefined || rawPath === null
        ? null
        : typeof rawPath === "number"
          ? rawPath
          : (rawPath.valueBlock?.valueDec ?? null);
    return {
      critical: extension.critical ?? false,
      isCA: basicConstraints.cA ?? false,
      pathLenConstraint,
    };
  } catch (error) {
    console.warn("basicConstraints parse error", error);
    return undefined;
  }
}
