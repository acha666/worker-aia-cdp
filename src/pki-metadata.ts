import { fromBER, OctetString, Integer, Sequence, BitString } from "asn1js";
import * as pkijs from "pkijs";

export const OID_DICTIONARY: Record<string, { short?: string; name: string }> = {
  "2.5.4.3": { short: "CN", name: "commonName" },
  "2.5.4.4": { short: "SN", name: "surname" },
  "2.5.4.5": { short: "serialNumber", name: "serialNumber" },
  "2.5.4.6": { short: "C", name: "countryName" },
  "2.5.4.7": { short: "L", name: "localityName" },
  "2.5.4.8": { short: "ST", name: "stateOrProvinceName" },
  "2.5.4.9": { short: "STREET", name: "streetAddress" },
  "2.5.4.10": { short: "O", name: "organizationName" },
  "2.5.4.11": { short: "OU", name: "organizationalUnitName" },
  "2.5.4.12": { short: "T", name: "title" },
  "2.5.4.13": { short: "DESCRIPTION", name: "description" },
  "2.5.4.15": { short: "BUSINESS", name: "businessCategory" },
  "2.5.4.17": { short: "POSTAL", name: "postalCode" },
  "1.2.840.113549.1.9.1": { short: "emailAddress", name: "emailAddress" },
  "0.9.2342.19200300.100.1.25": { short: "DC", name: "domainComponent" },
};

export const SIGNATURE_ALG_NAMES: Record<string, string> = {
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
};

export const KEY_ALG_NAMES: Record<string, string> = {
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.10045.2.1": "ecPublicKey",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
};

export const EKU_NAMES: Record<string, string> = {
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
};

export const KEY_USAGE_FLAGS = [
  "digitalSignature",
  "nonRepudiation",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
  "decipherOnly",
];

export const CURVE_NAMES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.101.110": "Ed25519",
  "1.3.101.111": "Ed448",
};

export const CRL_REASON_CODES: Record<number, string> = {
  0: "unspecified",
  1: "keyCompromise",
  2: "caCompromise",
  3: "affiliationChanged",
  4: "superseded",
  5: "cessationOfOperation",
  6: "certificateHold",
  8: "removeFromCRL",
  9: "privilegeWithdrawn",
  10: "aaCompromise",
};

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

const toBufferSource = (input: ArrayBuffer | Uint8Array): BufferSource =>
  (input instanceof Uint8Array ? input : new Uint8Array(input)) as unknown as BufferSource;

export async function sha256Hex(data: ArrayBuffer | Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", toBufferSource(data));
  return toHex(d);
}

export async function sha1Hex(data: ArrayBuffer | Uint8Array) {
  const d = await crypto.subtle.digest("SHA-1", toBufferSource(data));
  return toHex(d);
}

export function toJSDate(maybeTime: any): Date | undefined {
  try {
    if (!maybeTime) return undefined;
    if (maybeTime instanceof Date) return maybeTime;
    if (typeof maybeTime.toDate === "function") return maybeTime.toDate();
    if ((maybeTime as any).value instanceof Date) return (maybeTime as any).value;
    if ((maybeTime as any).valueBlock?.value instanceof Date) return (maybeTime as any).valueBlock.value;
    const s = typeof maybeTime === "string" ? maybeTime : (maybeTime as any)?.value;
    if (typeof s === "string") {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
    }
  } catch (e) {
    console.warn("toJSDate error:", e, "input:", maybeTime);
  }
  console.warn("toJSDate could not normalize input:", maybeTime);
  return undefined;
}

export function parseCertificate(der: ArrayBuffer) {
  const asn1 = fromBER(der);
  if (asn1.offset === -1) throw new Error("Bad certificate DER");
  return new pkijs.Certificate({ schema: asn1.result });
}

export function parseCRL(der: ArrayBuffer) {
  const asn1 = fromBER(der);
  if (asn1.offset === -1) throw new Error("Bad CRL DER");
  return new pkijs.CertificateRevocationList({ schema: asn1.result });
}

export function getCN(cert: pkijs.Certificate): string | undefined {
  for (const rdn of cert.subject.typesAndValues) {
    if (rdn.type === "2.5.4.3") return rdn.value.valueBlock.value;
  }
  return undefined;
}

export function getSKIHex(cert: pkijs.Certificate): string | undefined {
  const ext = cert.extensions?.find(e => e.extnID === "2.5.29.14");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const raw = asn1.result as OctetString;
  return toHex(raw.valueBlock.valueHex);
}

export function getCRLAKIHex(crl: pkijs.CertificateRevocationList): string | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.35");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const seq = asn1.result as Sequence;
  const first = seq.valueBlock.value[0];
  if (!first || first.idBlock.tagClass !== 3 || first.idBlock.tagNumber !== 0) return undefined;
  // @ts-ignore implicit [0] OCTET STRING has valueHex
  return toHex(first.valueBlock.valueHex);
}

export function getCRLNumber(crl: pkijs.CertificateRevocationList): bigint | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.20");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const int = asn1.result as Integer;
  const bytes = new Uint8Array(int.valueBlock.valueHex);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

export function getDeltaBaseCRLNumber(crl: pkijs.CertificateRevocationList): bigint | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === "2.5.29.27");
  if (!ext) return undefined;
  const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
  const int = asn1.result as Integer;
  const bytes = new Uint8Array(int.valueBlock.valueHex);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

export function isDeltaCRL(crl: pkijs.CertificateRevocationList): boolean {
  return getDeltaBaseCRLNumber(crl) !== undefined;
}

export function friendlyNameFromCert(cert: pkijs.Certificate): string {
  const cn = getCN(cert);
  if (cn) return cn.replace(/[^\w.-]+/g, "").replace(/\s+/g, "");
  const ski = getSKIHex(cert);
  return ski ? `CA-${ski.slice(0, 16)}` : `CA-${Date.now()}`;
}

export function describeName(name: pkijs.RelativeDistinguishedNames) {
  const rdns = name.typesAndValues.map(tv => {
    const info = OID_DICTIONARY[tv.type];
    const val = tv.value.valueBlock.value;
    const value = typeof val === "string" ? val : String(val);
    return {
      oid: tv.type,
      name: info?.name ?? tv.type,
      shortName: info?.short ?? null,
      value,
    };
  });
  const dn = rdns.map(r => `${r.shortName ?? r.oid}=${r.value}`).join(", ");
  const commonName = rdns.find(r => r.shortName === "CN" || r.name === "commonName")?.value ?? null;
  return { dn, rdns, commonName };
}

function bitStringBytes(bitString: BitString) {
  const bytes = new Uint8Array(bitString.valueBlock.valueHex);
  return bytes.length > 0 ? bytes.slice(1) : bytes;
}

function describeAlgorithm(oid: string, dictionary: Record<string, string>) {
  return {
    oid,
    name: dictionary[oid] ?? oid,
  };
}

function parseKeyUsageExtension(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
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
      critical: ext.critical ?? false,
      enabled,
      flags,
      rawHex: toHex(bitString.valueBlock.valueHex),
      unusedBits,
      totalBits,
    };
  } catch (err) {
    console.warn("keyUsage parse error", err);
    return undefined;
  }
}

function parseExtendedKeyUsage(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const seq = asn1.result as Sequence;
    const oids: string[] = [];
    for (const node of seq.valueBlock.value) {
      const oid = (node as any)?.valueBlock?.toString?.();
      if (typeof oid === "string" && oid.length > 0) oids.push(oid);
    }
    return {
      critical: ext.critical ?? false,
      oids,
      usages: oids.map(oid => EKU_NAMES[oid] ?? oid),
    };
  } catch (err) {
    console.warn("extendedKeyUsage parse error", err);
    return undefined;
  }
}

function parseBasicConstraints(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const bc = new pkijs.BasicConstraints({ schema: asn1.result });
    const rawPath = bc.pathLenConstraint;
    const pathLenConstraint = rawPath === undefined || rawPath === null
      ? null
      : typeof rawPath === "number"
        ? rawPath
        : rawPath.valueBlock?.valueDec ?? null;
    return {
      critical: ext.critical ?? false,
      isCA: bc.cA ?? false,
      pathLenConstraint,
    };
  } catch (err) {
    console.warn("basicConstraints parse error", err);
    return undefined;
  }
}

function formatIPv6(bytes: Uint8Array) {
  const segments = [] as string[];
  for (let i = 0; i < 16; i += 2) segments.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < segments.length; ) {
    if (segments[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < segments.length && segments[j] === "0") j++;
    const len = j - i;
    if (len > bestLen) {
      bestStart = i;
      bestLen = len;
    }
    i = j;
  }
  if (bestLen > 1) {
    segments.splice(bestStart, bestLen, "");
    if (bestStart === 0) segments.unshift("");
    if (bestStart + bestLen === 8) segments.push("");
  }
  return segments.join(":");
}

function formatIPAddress(bytes: Uint8Array) {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length === 16) return formatIPv6(bytes);
  return toHex(bytes);
}

function parseSubjectAltName(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
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
            const desc = describeName(name.value);
            directoryNames.push({ dn: desc.dn, rdns: desc.rdns });
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
      critical: ext.critical ?? false,
      dnsNames,
      emailAddresses,
      ipAddresses,
      uris,
      directoryNames,
      registeredIds,
      otherNames,
    };
  } catch (err) {
    console.warn("subjectAltName parse error", err);
    return undefined;
  }
}

function parseAuthorityInfoAccess(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const ocsp: string[] = [];
    const caIssuers: string[] = [];
    const other: Array<{ method: string; locations: string[] }> = [];
    const seq = asn1.result as Sequence;
    for (const ad of seq.valueBlock.value) {
      const accessDesc = ad as Sequence;
      const methodNode = accessDesc.valueBlock.value[0];
      const locationNode = accessDesc.valueBlock.value[1];
      const method = methodNode?.valueBlock?.toString?.() ?? "";
      const locations: string[] = [];
      if (locationNode) {
        const gn = new pkijs.GeneralName({ schema: locationNode });
        if (gn.type === 6 && typeof gn.value === "string") locations.push(gn.value);
        else if (gn.type === 1 && typeof gn.value === "string") locations.push(`mailto:${gn.value}`);
        else if (gn.type === 2 && typeof gn.value === "string") locations.push(`dns:${gn.value}`);
        else if (gn.type === 7 && gn.value instanceof ArrayBuffer) locations.push(`ip:${formatIPAddress(new Uint8Array(gn.value))}`);
      }
      if (method === "1.3.6.1.5.5.7.48.1") ocsp.push(...locations);
      else if (method === "1.3.6.1.5.5.7.48.2") caIssuers.push(...locations);
      else other.push({ method, locations });
    }
    return {
      critical: ext.critical ?? false,
      ocsp,
      caIssuers,
      other: other.filter(item => item.locations.length > 0),
    };
  } catch (err) {
    console.warn("authorityInfoAccess parse error", err);
    return undefined;
  }
}

function parseCRLDistributionPoints(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const urls: string[] = [];
    const directoryNames: string[] = [];
    const seq = asn1.result as Sequence;
    for (const dp of seq.valueBlock.value) {
      const dpSeq = dp as Sequence;
      for (const child of dpSeq.valueBlock.value) {
        if (child.idBlock.tagClass === 3 && child.idBlock.tagNumber === 0) {
          const names = new pkijs.GeneralNames({ schema: child });
          for (const gn of names.names) {
            if (gn.type === 6 && typeof gn.value === "string") urls.push(gn.value);
            else if (gn.type === 4 && gn.value instanceof pkijs.RelativeDistinguishedNames) {
              const desc = describeName(gn.value);
              directoryNames.push(desc.dn);
            }
          }
        }
      }
    }
    return {
      critical: ext.critical ?? false,
      urls,
      directoryNames,
    };
  } catch (err) {
    console.warn("crlDistributionPoints parse error", err);
    return undefined;
  }
}

function parseCertificatePolicies(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const policies = new pkijs.CertificatePolicies({ schema: asn1.result });
    return {
      critical: ext.critical ?? false,
      items: policies.certificatePolicies.map(policy => {
        const p = policy as any;
        const identifier = p.policyIdentifier;
        const oid = typeof identifier === "string" ? identifier : identifier?.valueBlock?.toString?.() ?? "";
        const qualifiers = (p.policyQualifiers ?? []).map((qualifier: any) => {
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
  } catch (err) {
    console.warn("certificatePolicies parse error", err);
    return undefined;
  }
}

function parseAuthorityKeyIdentifier(ext?: pkijs.Extension) {
  if (!ext) return undefined;
  try {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const seq = asn1.result as Sequence;
    let keyIdentifier: string | null = null;
    const authorityCertIssuer: string[] = [];
    let authorityCertSerialNumber: string | null = null;
    for (const el of seq.valueBlock.value) {
      if (el.idBlock.tagClass !== 3) continue;
      if (el.idBlock.tagNumber === 0) keyIdentifier = toHex((el as any).valueBlock.valueHex);
      else if (el.idBlock.tagNumber === 1) {
        const names = new pkijs.GeneralNames({ schema: el });
        for (const gn of names.names) {
          if (gn.type === 6 && typeof gn.value === "string") authorityCertIssuer.push(gn.value);
          else if (gn.type === 4 && gn.value instanceof pkijs.RelativeDistinguishedNames) authorityCertIssuer.push(describeName(gn.value).dn);
        }
      } else if (el.idBlock.tagNumber === 2) authorityCertSerialNumber = toHex((el as any).valueBlock.valueHex);
    }
    return {
      critical: ext.critical ?? false,
      keyIdentifier,
      authorityCertIssuer,
      authorityCertSerialNumber,
    };
  } catch (err) {
    console.warn("authorityKeyIdentifier parse error", err);
    return undefined;
  }
}

function decimalFromHex(hex: string | null) {
  if (!hex) return null;
  try {
    return BigInt(`0x${hex}`).toString(10);
  } catch (err) {
    console.warn("decimalFromHex error", err, hex);
    return null;
  }
}

function secondsUntil(date: Date | undefined) {
  if (!date) return null;
  return Math.floor((date.getTime() - Date.now()) / 1000);
}

function daysUntil(date: Date | undefined) {
  if (!date) return null;
  return Math.floor((date.getTime() - Date.now()) / 86400000);
}

function parseCRLReason(extensions?: pkijs.Extensions) {
  const reasonExt = extensions?.extensions?.find(ext => ext.extnID === "2.5.29.21");
  if (!reasonExt) return undefined;
  try {
    const asn1 = fromBER(reasonExt.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) return undefined;
    const enumerated = asn1.result as any;
    const code: number | undefined = enumerated?.valueBlock?.valueDec;
    if (typeof code === "number") return CRL_REASON_CODES[code] ?? `reason_${code}`;
  } catch (err) {
    console.warn("crl reason parse error", err);
  }
  return undefined;
}

export async function buildCertificateDetails(cert: pkijs.Certificate, der: ArrayBuffer) {
  const subject = describeName(cert.subject);
  const issuer = describeName(cert.issuer);
  const notBefore = toJSDate((cert as any).notBefore);
  const notAfter = toJSDate((cert as any).notAfter);
  const serialHex = cert.serialNumber.valueBlock.valueHex ? toHex(cert.serialNumber.valueBlock.valueHex) : null;
  const serialDecimal = decimalFromHex(serialHex);
  const signatureAlgorithm = describeAlgorithm(cert.signatureAlgorithm.algorithmId, SIGNATURE_ALG_NAMES);
  const signatureBytes = bitStringBytes(cert.signatureValue);
  const signature = {
    algorithm: signatureAlgorithm,
    valueHex: toHex(signatureBytes),
    bitLength: signatureBytes.length * 8,
  };

  const spki = cert.subjectPublicKeyInfo;
  const publicKeyAlgorithm = describeAlgorithm(spki.algorithm.algorithmId, KEY_ALG_NAMES);
  const spkiDer = spki.toSchema().toBER(false);
  const spkFingerprintSha256 = await sha256Hex(spkiDer);
  const spkFingerprintSha1 = await sha1Hex(spkiDer);
  let keySizeBits: number | null = null;
  let keyExponent: number | null = null;
  let modulusHex: string | null = null;
  let curveOid: string | null = null;
  let curveName: string | null = null;
  const spkBytes = bitStringBytes(spki.subjectPublicKey);
  if (spki.algorithm.algorithmId === "1.2.840.113549.1.1.1") {
    const keyAsn1 = fromBER(spki.subjectPublicKey.valueBlock.valueHex);
    if (keyAsn1.offset !== -1) {
      const seq = keyAsn1.result as Sequence;
      const modulus = seq.valueBlock.value[0] as Integer;
      const exponent = seq.valueBlock.value[1] as Integer;
      let modBytes = new Uint8Array(modulus.valueBlock.valueHex);
      if (modBytes.length > 0 && modBytes[0] === 0) modBytes = modBytes.slice(1);
      keySizeBits = modBytes.length * 8;
      modulusHex = toHex(modBytes);
      keyExponent = exponent.valueBlock.valueDec ?? null;
    }
  } else if (spki.algorithm.algorithmId === "1.2.840.10045.2.1") {
    const params: any = spki.algorithm.algorithmParams;
    if (params?.valueBlock?.toString) {
      curveOid = params.valueBlock.toString();
      curveName = curveOid ? CURVE_NAMES[curveOid] ?? curveOid : null;
    }
    if (spkBytes.length > 1) keySizeBits = ((spkBytes.length - 1) / 2) * 8;
  } else if (CURVE_NAMES[spki.algorithm.algorithmId]) {
    curveOid = spki.algorithm.algorithmId;
    curveName = CURVE_NAMES[curveOid];
    keySizeBits = spkBytes.length * 8;
  }

  const certFingerprintSha256 = await sha256Hex(der);
  const certFingerprintSha1 = await sha1Hex(der);

  const extensions = cert.extensions ?? [];
  const findExt = (oid: string) => extensions.find(ext => ext.extnID === oid);

  const basicConstraints = parseBasicConstraints(findExt("2.5.29.19"));
  const keyUsage = parseKeyUsageExtension(findExt("2.5.29.15"));
  const extendedKeyUsage = parseExtendedKeyUsage(findExt("2.5.29.37"));
  const subjectAltName = parseSubjectAltName(findExt("2.5.29.17"));
  const authorityInfoAccess = parseAuthorityInfoAccess(findExt("1.3.6.1.5.5.7.1.1"));
  const crlDistributionPoints = parseCRLDistributionPoints(findExt("2.5.29.31"));
  const certificatePolicies = parseCertificatePolicies(findExt("2.5.29.32"));
  const authorityKeyIdentifier = parseAuthorityKeyIdentifier(findExt("2.5.29.35"));
  const subjectKeyIdentifier = getSKIHex(cert) || null;

  return {
    summary: {
      subjectCN: subject.commonName,
      issuerCN: issuer.commonName,
      serialNumberHex: serialHex,
      notBefore: notBefore?.toISOString() ?? null,
      notAfter: notAfter?.toISOString() ?? null,
      isExpired: notAfter ? Date.now() > notAfter.getTime() : null,
    },
    version: (cert.version ?? 0) + 1,
    subject,
    issuer,
    serialNumber: {
      hex: serialHex,
      decimal: serialDecimal,
    },
    validity: {
      notBefore: notBefore?.toISOString() ?? null,
      notAfter: notAfter?.toISOString() ?? null,
      daysUntilExpiry: daysUntil(notAfter),
      secondsUntilExpiry: secondsUntil(notAfter),
      isExpired: notAfter ? Date.now() > notAfter.getTime() : null,
    },
    signature,
    fingerprints: {
      sha1: certFingerprintSha1,
      sha256: certFingerprintSha256,
    },
    publicKey: {
      algorithm: publicKeyAlgorithm,
      sizeBits: keySizeBits,
      exponent: keyExponent,
      modulusHex,
      curveOid,
      curveName,
      subjectPublicKeyHex: toHex(spkBytes),
      fingerprints: {
        sha1: spkFingerprintSha1,
        sha256: spkFingerprintSha256,
      },
    },
    extensions: {
      basicConstraints,
      keyUsage,
      extendedKeyUsage,
      subjectAltName,
      authorityInfoAccess,
      crlDistributionPoints,
      certificatePolicies,
      subjectKeyIdentifier,
      authorityKeyIdentifier,
      present: extensions.map(ext => ({ oid: ext.extnID, critical: ext.critical ?? false })),
    },
  };
}

export async function buildCRLDetails(crl: pkijs.CertificateRevocationList, der: ArrayBuffer) {
  const issuer = describeName(crl.issuer);
  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl)?.toString() ?? null;
  const baseCRLNumber = getDeltaBaseCRLNumber(crl)?.toString() ?? null;
  const isDelta = baseCRLNumber !== null;
  const authorityKeyIdentifier = getCRLAKIHex(crl) || null;
  const signatureAlgorithm = describeAlgorithm(crl.signatureAlgorithm.algorithmId, SIGNATURE_ALG_NAMES);
  const signatureBytes = bitStringBytes(crl.signatureValue);
  const fingerprints = {
    sha1: await sha1Hex(der),
    sha256: await sha256Hex(der),
  };
  const revoked = ((crl as any).revokedCertificates ?? []) as Array<pkijs.RevokedCertificate>;
  const sample = revoked.slice(0, 5).map(entry => {
    const serialHex = entry.userCertificate.valueBlock.valueHex ? toHex(entry.userCertificate.valueBlock.valueHex) : null;
    return {
      serialNumber: {
        hex: serialHex,
        decimal: decimalFromHex(serialHex),
      },
      revocationDate: toJSDate(entry.revocationDate)?.toISOString() ?? null,
      reason: parseCRLReason(entry.crlEntryExtensions),
    };
  });
  return {
    summary: {
      issuerCN: issuer.commonName,
      crlNumber,
      entryCount: revoked.length,
      isDelta,
    },
    issuer,
    numbers: {
      crlNumber,
      baseCRLNumber,
    },
    validity: {
      thisUpdate: thisUpdate?.toISOString() ?? null,
      nextUpdate: nextUpdate?.toISOString() ?? null,
      secondsUntilNextUpdate: secondsUntil(nextUpdate),
      isExpired: nextUpdate ? Date.now() > nextUpdate.getTime() : null,
    },
    signature: {
      algorithm: signatureAlgorithm,
      valueHex: toHex(signatureBytes),
      bitLength: signatureBytes.length * 8,
    },
    fingerprints,
    authorityKeyIdentifier,
    entries: {
      count: revoked.length,
      sample,
    },
    extensions: (crl.crlExtensions?.extensions ?? []).map(ext => ({ oid: ext.extnID, critical: ext.critical ?? false })),
    isDelta,
  };
}
