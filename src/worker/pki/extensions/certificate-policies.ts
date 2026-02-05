import { fromBER } from "asn1js";
import * as pkijs from "pkijs";

export function parseCertificatePolicies(extension?: pkijs.Extension) {
  if (!extension) {
    return undefined;
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const policies = new pkijs.CertificatePolicies({ schema: asn1.result });
    return {
      critical: extension.critical ?? false,
      items: policies.certificatePolicies.map((policy) => {
        const entry = policy as unknown as {
          policyIdentifier: string | { valueBlock?: { toString?: () => string } };
          policyQualifiers?: {
            policyQualifierId?: string;
            qualifier?: string | { valueBlock?: { value?: string } };
          }[];
        };
        const identifier = entry.policyIdentifier;
        const oid =
          typeof identifier === "string"
            ? identifier
            : (identifier?.valueBlock?.toString?.() ?? "");
        const qualifiers = (entry.policyQualifiers ?? []).map((qualifier) => {
          const type = qualifier.policyQualifierId ?? "";
          let value: string | null = null;
          if (type === "1.3.6.1.5.5.7.2.1") {
            if (typeof qualifier.qualifier === "string") {
              value = qualifier.qualifier;
            } else if (qualifier.qualifier?.valueBlock?.value) {
              value = String(qualifier.qualifier.valueBlock.value);
            }
          } else if (type === "1.3.6.1.5.5.7.2.2") {
            value = "userNotice";
          }
          return { oid: type, value };
        });
        return { oid, qualifiers };
      }),
    };
  } catch (error) {
    console.warn("certificatePolicies parse error", error);
    return undefined;
  }
}
