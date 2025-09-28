import { fromBER, Sequence, BitString } from "asn1js";
import * as pkijs from "pkijs";
import { EKU_NAMES, KEY_USAGE_FLAGS, CRL_REASON_CODES } from "../constants";
import { describeAlgorithm, describeExtensionPresence, describeName } from "../utils";
import { toHex } from "../format";

function formatIPv6(bytes: Uint8Array) {
  const segments: string[] = [];
  for (let index = 0; index < 16; index += 2) segments.push(((bytes[index] << 8) | bytes[index + 1]).toString(16));
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < segments.length;) {
    if (segments[index] !== "0") {
      index++;
      continue;
    }
    let cursor = index;
    while (cursor < segments.length && segments[cursor] === "0") cursor++;
    const length = cursor - index;
    if (length > bestLength) {
      bestStart = index;
      bestLength = length;
    }
    index = cursor;
  }
  if (bestLength > 1) {
    segments.splice(bestStart, bestLength, "");
    if (bestStart === 0) segments.unshift("");
    if (bestStart + bestLength === 8) segments.push("");
  }
  return segments.join(":");
}

function formatIPAddress(bytes: Uint8Array) {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length === 16) return formatIPv6(bytes);
  return toHex(bytes);
}

export function parseKeyUsageExtension(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const bitString = asn1.result as BitString;
    const bytes = new Uint8Array(bitString.valueBlock.valueHex);
    if (bytes.length === 0) return undefined;
    const unusedBits = bytes[0];
    const totalBits = Math.max(0, (bytes.length - 1) * 8 - unusedBits);
    const flags: Record<string, boolean> = {};
    const enabled: string[] = [];
    for (let bitIndex = 0; bitIndex < Math.min(KEY_USAGE_FLAGS.length, totalBits); bitIndex++) {
      const byteIndex = 1 + Math.floor(bitIndex / 8);
      const bitPosition = 7 - (bitIndex % 8);
      const isSet = (bytes[byteIndex] & (1 << bitPosition)) !== 0;
      const flagName = KEY_USAGE_FLAGS[bitIndex];
      flags[flagName] = isSet;
      if (isSet) enabled.push(flagName);
    }
    return {
      critical: extension.critical ?? false,
      enabled,
      flags,
      rawHex: toHex(bitString.valueBlock.valueHex),
      unusedBits,
      totalBits,
    };
  } catch (error) {
    console.warn("keyUsage parse error", error);
    return undefined;
  }
}

export function parseExtendedKeyUsage(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const sequence = asn1.result as Sequence;
    const oids: string[] = [];
    for (const node of sequence.valueBlock.value) {
      const oid = (node as any)?.valueBlock?.toString?.();
      if (typeof oid === "string" && oid.length > 0) oids.push(oid);
    }
    return {
      critical: extension.critical ?? false,
      oids,
      usages: oids.map(oid => EKU_NAMES[oid] ?? oid),
    };
  } catch (error) {
    console.warn("extendedKeyUsage parse error", error);
    return undefined;
  }
}

export function parseBasicConstraints(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const basicConstraints = new pkijs.BasicConstraints({ schema: asn1.result });
    const rawPath = basicConstraints.pathLenConstraint;
    const pathLenConstraint = rawPath === undefined || rawPath === null
      ? null
      : typeof rawPath === "number"
        ? rawPath
        : rawPath.valueBlock?.valueDec ?? null;
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

export function parseSubjectAltName(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const names = new pkijs.GeneralNames({ schema: asn1.result });
    const dnsNames: string[] = [];
    const emailAddresses: string[] = [];
    const ipAddresses: string[] = [];
    const uris: string[] = [];
    const directoryNames: Array<{ dn: string; rdns: Array<{ oid: string; name: string; shortName: string | null; value: string }> }> = [];
    const otherNames: Array<{ oid: string; valueHex: string }> = [];
    const registeredIds: string[] = [];
    for (const name of names.names) {
      switch (name.type) {
        case 1:
          if (typeof name.value === "string") emailAddresses.push(name.value);
          break;
        case 2:
          if (typeof name.value === "string") dnsNames.push(name.value);
          break;
        case 6:
          if (typeof name.value === "string") uris.push(name.value);
          break;
        case 7:
          if (name.value instanceof ArrayBuffer) ipAddresses.push(formatIPAddress(new Uint8Array(name.value)));
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
            valueHex: name.value.valueHex ? toHex(name.value.valueHex) : "",
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

export function parseAuthorityInfoAccess(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const ocsp: string[] = [];
    const caIssuers: string[] = [];
    const other: Array<{ method: string; locations: string[] }> = [];
    const sequence = asn1.result as Sequence;
    for (const access of sequence.valueBlock.value) {
      const accessDesc = access as Sequence;
      const methodNode = accessDesc.valueBlock.value[0];
      const locationNode = accessDesc.valueBlock.value[1];
      const method = methodNode?.valueBlock?.toString?.() ?? "";
      const locations: string[] = [];
      if (locationNode) {
        const generalName = new pkijs.GeneralName({ schema: locationNode });
        if (generalName.type === 6 && typeof generalName.value === "string") locations.push(generalName.value);
        else if (generalName.type === 1 && typeof generalName.value === "string") locations.push(`mailto:${generalName.value}`);
        else if (generalName.type === 2 && typeof generalName.value === "string") locations.push(`dns:${generalName.value}`);
        else if (generalName.type === 7 && generalName.value instanceof ArrayBuffer) locations.push(`ip:${formatIPAddress(new Uint8Array(generalName.value))}`);
      }
      if (method === "1.3.6.1.5.5.7.48.1") ocsp.push(...locations);
      else if (method === "1.3.6.1.5.5.7.48.2") caIssuers.push(...locations);
      else other.push({ method, locations });
    }
    return {
      critical: extension.critical ?? false,
      ocsp,
      caIssuers,
      other: other.filter(entry => entry.locations.length > 0),
    };
  } catch (error) {
    console.warn("authorityInfoAccess parse error", error);
    return undefined;
  }
}

export function parseCRLDistributionPoints(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const urls = new Set<string>();
    const directoryNames = new Set<string>();
    const distributionPoints: Array<{ urls: string[]; directoryNames: string[] }> = [];
    const sequence = asn1.result as Sequence;
    for (const dp of sequence.valueBlock.value) {
      if (!(dp instanceof Sequence)) continue;
      const pointUrls: string[] = [];
      const pointDirectoryNames: string[] = [];
      try {
        const distribution = new pkijs.DistributionPoint({ schema: dp });
        const handleGeneralName = (generalName: pkijs.GeneralName) => {
          if (generalName.type === 6 && typeof generalName.value === "string") {
            pointUrls.push(generalName.value);
            urls.add(generalName.value);
          } else if (generalName.type === 4 && generalName.value instanceof pkijs.RelativeDistinguishedNames) {
            const description = describeName(generalName.value);
            pointDirectoryNames.push(description.dn);
            directoryNames.add(description.dn);
          }
        };

        if (Array.isArray(distribution.distributionPoint)) {
          for (const generalName of distribution.distributionPoint) handleGeneralName(generalName);
        } else if (distribution.distributionPoint instanceof pkijs.RelativeDistinguishedNames) {
          const description = describeName(distribution.distributionPoint);
          pointDirectoryNames.push(description.dn);
          directoryNames.add(description.dn);
        }

        if (Array.isArray(distribution.cRLIssuer)) {
          for (const generalName of distribution.cRLIssuer) handleGeneralName(generalName);
        }
      } catch (error) {
        console.warn("crlDistributionPoints distribution parse error", error);
      }
      if (pointUrls.length || pointDirectoryNames.length) {
        distributionPoints.push({ urls: pointUrls, directoryNames: pointDirectoryNames });
      }
    }
    return {
      critical: extension.critical ?? false,
      urls: [...urls],
      directoryNames: [...directoryNames],
      distributionPoints: distributionPoints.length ? distributionPoints : undefined,
    };
  } catch (error) {
    console.warn("crlDistributionPoints parse error", error);
    return undefined;
  }
}

export function parseCertificatePolicies(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const policies = new pkijs.CertificatePolicies({ schema: asn1.result });
    return {
      critical: extension.critical ?? false,
      items: policies.certificatePolicies.map(policy => {
        const entry = policy as any;
        const identifier = entry.policyIdentifier;
        const oid = typeof identifier === "string" ? identifier : identifier?.valueBlock?.toString?.() ?? "";
        const qualifiers = (entry.policyQualifiers ?? []).map((qualifier: any) => {
          const type = qualifier.policyQualifierId ?? "";
          let value: string | null = null;
          if (type === "1.3.6.1.5.5.7.2.1") {
            if (typeof qualifier.qualifier === "string") value = qualifier.qualifier;
            else if (qualifier.qualifier?.valueBlock?.value) value = String(qualifier.qualifier.valueBlock.value);
          } else if (type === "1.3.6.1.5.5.7.2.2") value = "userNotice";
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

export function parseAuthorityKeyIdentifier(extension?: pkijs.Extension) {
  if (!extension) return undefined;
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const sequence = asn1.result as Sequence;
    let keyIdentifier: string | null = null;
    const authorityCertIssuer: string[] = [];
    let authorityCertSerialNumber: string | null = null;
    for (const element of sequence.valueBlock.value) {
      if (element.idBlock.tagClass !== 3) continue;
      if (element.idBlock.tagNumber === 0) keyIdentifier = toHex((element as any).valueBlock.valueHex);
      else if (element.idBlock.tagNumber === 1) {
        const names = new pkijs.GeneralNames({ schema: element });
        for (const generalName of names.names) {
          if (generalName.type === 6 && typeof generalName.value === "string") authorityCertIssuer.push(generalName.value);
          else if (generalName.type === 4 && generalName.value instanceof pkijs.RelativeDistinguishedNames)
            authorityCertIssuer.push(describeName(generalName.value).dn);
        }
      } else if (element.idBlock.tagNumber === 2) authorityCertSerialNumber = toHex((element as any).valueBlock.valueHex);
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

export function parseCRLReason(extensions?: pkijs.Extensions) {
  const reasonExtension = extensions?.extensions?.find(ext => ext.extnID === "2.5.29.21");
  if (!reasonExtension) return undefined;
  try {
    const asn1 = fromBER(reasonExtension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const enumerated = asn1.result as any;
    const code: number | undefined = enumerated?.valueBlock?.valueDec;
    if (typeof code === "number") return CRL_REASON_CODES[code] ?? `reason_${code}`;
  } catch (error) {
    console.warn("crl reason parse error", error);
  }
  return undefined;
}

