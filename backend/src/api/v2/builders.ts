/**
 * X.509 Builders - Convert pkijs objects to v2 API types
 * Follows RFC 5280 structure
 */

import {
  fromBER,
  Sequence,
  Integer,
  OctetString,
  BitString as Asn1BitString,
} from "asn1js";
import * as pkijs from "pkijs";
import {
  OID_DICTIONARY,
  SIGNATURE_ALG_NAMES,
  KEY_ALG_NAMES,
  CURVE_NAMES,
  EXTENSION_NAMES,
  EKU_NAMES,
  KEY_USAGE_FLAGS,
  CRL_REASON_CODES,
} from "../../pki/constants";
import {
  toHex,
  sha256Hex,
  sha1Hex,
  toJSDate,
  decimalFromHex,
} from "../../pki/utils";
import type {
  X509Version,
  SerialNumber,
  BitString,
  ObjectIdentifier,
  AlgorithmIdentifier,
  Time,
  Name,
  RelativeDistinguishedName,
  AttributeTypeAndValue,
  SubjectPublicKeyInfo,
  RSAPublicKey,
  ECPublicKey,
  EdPublicKey,
  Extensions,
  Extension,
  ParsedExtensionValue,
  BasicConstraintsValue,
  KeyUsageValue,
  ExtendedKeyUsageValue,
  SubjectAltNameValue,
  AuthorityKeyIdentifierValue,
  SubjectKeyIdentifierValue,
  CRLDistributionPointsValue,
  AuthorityInfoAccessValue,
  CertificatePoliciesValue,
  GeneralName,
  DistributionPoint,
  AccessDescription,
  PolicyInformation,
  CRLNumberValue,
  DeltaCRLIndicatorValue,
  CRLReasonValue,
  InvalidityDateValue,
  TBSCertificate,
  TBSCertList,
  RevokedCertificate,
  Fingerprints,
  CertificateStatus,
  CrlStatus,
  CrlType,
} from "./types";

// =============================================================================
// Primitive Builders
// =============================================================================

export function buildVersion(version: number | undefined): X509Version {
  const raw = version ?? 0;
  const display = raw === 0 ? "v1" : raw === 1 ? "v2" : "v3";
  return { raw, display };
}

export function buildSerialNumber(integer: Integer): SerialNumber {
  const hex = toHex(integer.valueBlock.valueHexView).toUpperCase();
  const decimal = decimalFromHex(hex) ?? undefined;
  return { hex, decimal };
}

export function buildBitString(bitString: Asn1BitString): BitString {
  const bytes = new Uint8Array(bitString.valueBlock.valueHex);
  const hex = toHex(bytes).toUpperCase();
  const unusedBits =
    typeof bitString.valueBlock.unusedBits === "number"
      ? bitString.valueBlock.unusedBits
      : 0;
  const bitLength = bytes.length * 8 - unusedBits;
  return { hex, bitLength, unusedBits };
}

export function buildObjectIdentifier(
  oid: string,
  dictionary?: Record<string, string>,
): ObjectIdentifier {
  const dictEntry = OID_DICTIONARY[oid];
  const algName = dictionary?.[oid];
  return {
    oid,
    name: algName ?? dictEntry?.name ?? null,
    shortName: dictEntry?.short ?? null,
  };
}

export function buildAlgorithmIdentifier(
  algorithmId: string,
  algorithmParams?: unknown,
  dictionary?: Record<string, string>,
): AlgorithmIdentifier {
  const result: AlgorithmIdentifier = {
    algorithm: buildObjectIdentifier(algorithmId, dictionary),
  };

  if (algorithmParams && typeof algorithmParams === "object") {
    const params = algorithmParams as {
      valueBlock?: { valueHex?: ArrayBuffer };
    };
    if (params.valueBlock?.valueHex) {
      result.parameters = {
        rawHex: toHex(params.valueBlock.valueHex).toUpperCase(),
      };
    }
  }

  return result;
}

export function buildTime(value: unknown): Time {
  const jsDate = toJSDate(value);
  const iso = jsDate?.toISOString() ?? "";

  // Determine ASN.1 type
  let type: "utcTime" | "generalizedTime" = "utcTime";
  let raw = "";

  if (value && typeof value === "object") {
    const timeObj = value as { type?: number; value?: Date };
    // PKI.js uses type 0 for UTCTime, 1 for GeneralizedTime
    if (timeObj.type === 1) {
      type = "generalizedTime";
    }
    if (timeObj.value instanceof Date) {
      // Format raw based on type
      if (type === "utcTime") {
        raw = formatUtcTime(timeObj.value);
      } else {
        raw = formatGeneralizedTime(timeObj.value);
      }
    }
  }

  return { iso, type, raw };
}

function formatUtcTime(date: Date): string {
  const year = date.getUTCFullYear() % 100;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${String(year).padStart(2, "0")}${month}${day}${hours}${minutes}${seconds}Z`;
}

function formatGeneralizedTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}Z`;
}

// =============================================================================
// Name Builder
// =============================================================================

export function buildName(name: pkijs.RelativeDistinguishedNames): Name {
  const rdnSequence: RelativeDistinguishedName[] = [];

  // Normalized fields
  let commonName: string | null = null;
  let organization: string | null = null;
  let organizationalUnit: string | null = null;
  let country: string | null = null;
  let stateOrProvince: string | null = null;
  let locality: string | null = null;

  for (const tv of name.typesAndValues) {
    const oid = tv.type;
    const dictEntry = OID_DICTIONARY[oid];
    const rawValue = tv.value.valueBlock.value;
    const stringValue =
      typeof rawValue === "string" ? rawValue : String(rawValue);

    // Determine encoding type
    let encoding: AttributeTypeAndValue["value"]["encoding"] = "unknown";
    const blockName = tv.value.constructor.name;
    if (blockName.includes("Utf8")) {encoding = "utf8String";}
    else if (blockName.includes("Printable")) {encoding = "printableString";}
    else if (blockName.includes("IA5")) {encoding = "ia5String";}
    else if (blockName.includes("Bmp")) {encoding = "bmpString";}

    const attr: AttributeTypeAndValue = {
      type: {
        oid,
        name: dictEntry?.name ?? null,
        shortName: dictEntry?.short ?? null,
      },
      value: {
        string: stringValue,
        encoding,
      },
    };

    rdnSequence.push({ attributes: [attr] });

    // Extract normalized fields
    switch (oid) {
      case "2.5.4.3":
        commonName = commonName ?? stringValue;
        break;
      case "2.5.4.10":
        organization = organization ?? stringValue;
        break;
      case "2.5.4.11":
        organizationalUnit = organizationalUnit ?? stringValue;
        break;
      case "2.5.4.6":
        country = country ?? stringValue;
        break;
      case "2.5.4.8":
        stateOrProvince = stateOrProvince ?? stringValue;
        break;
      case "2.5.4.7":
        locality = locality ?? stringValue;
        break;
    }
  }

  return {
    commonName,
    organization,
    organizationalUnit,
    country,
    stateOrProvince,
    locality,
    rdnSequence,
  };
}

// =============================================================================
// Public Key Builder
// =============================================================================

export async function buildSubjectPublicKeyInfo(
  spki: pkijs.PublicKeyInfo,
): Promise<SubjectPublicKeyInfo> {
  const algorithm = buildAlgorithmIdentifier(
    spki.algorithm.algorithmId,
    spki.algorithm.algorithmParams,
    KEY_ALG_NAMES,
  );

  const subjectPublicKey = buildBitString(spki.subjectPublicKey);

  // Calculate fingerprints
  const spkiDer = spki.toSchema().toBER(false);
  const fingerprints: Fingerprints = {
    sha1: await sha1Hex(spkiDer),
    sha256: await sha256Hex(spkiDer),
  };

  // Parse key based on algorithm
  let parsed: RSAPublicKey | ECPublicKey | EdPublicKey | undefined;

  const algOid = spki.algorithm.algorithmId;

  if (algOid === "1.2.840.113549.1.1.1") {
    // RSA
    parsed = parseRSAPublicKey(spki);
  } else if (algOid === "1.2.840.10045.2.1") {
    // EC
    parsed = parseECPublicKey(spki);
  } else if (algOid === "1.3.101.112" || algOid === "1.3.101.113") {
    // Ed25519 or Ed448
    const keyHex = toHex(
      spki.subjectPublicKey.valueBlock.valueHex,
    ).toUpperCase();
    parsed = {
      type: algOid === "1.3.101.112" ? "ed25519" : "ed448",
      publicKey: { hex: keyHex },
    };
  }

  return {
    algorithm,
    subjectPublicKey,
    parsed,
    fingerprints,
  };
}

function parseRSAPublicKey(
  spki: pkijs.PublicKeyInfo,
): RSAPublicKey | undefined {
  try {
    const keyAsn1 = fromBER(spki.subjectPublicKey.valueBlock.valueHex);
    if (keyAsn1.offset === -1) {return undefined;}

    const sequence = keyAsn1.result as Sequence;
    const modulus = sequence.valueBlock.value[0] as Integer;
    const exponent = sequence.valueBlock.value[1] as Integer;

    let modBytes = new Uint8Array(modulus.valueBlock.valueHex);
    // Remove leading zero if present (sign byte)
    if (modBytes.length > 0 && modBytes[0] === 0) {
      modBytes = modBytes.slice(1);
    }

    return {
      type: "rsa",
      modulus: {
        hex: toHex(modBytes).toUpperCase(),
        bitLength: modBytes.length * 8,
      },
      publicExponent: exponent.valueBlock.valueDec ?? 65537,
    };
  } catch {
    return undefined;
  }
}

function parseECPublicKey(spki: pkijs.PublicKeyInfo): ECPublicKey | undefined {
  try {
    const params = spki.algorithm.algorithmParams as {
      valueBlock?: { toString?: () => string };
    };
    const curveOid = params?.valueBlock?.toString?.() ?? "";

    const pointBytes = new Uint8Array(
      spki.subjectPublicKey.valueBlock.valueHex,
    );
    const pointHex = toHex(pointBytes).toUpperCase();

    // For uncompressed points (starting with 04), extract x and y
    let x: string | undefined;
    let y: string | undefined;
    if (pointBytes.length > 1 && pointBytes[0] === 0x04) {
      const coordLen = (pointBytes.length - 1) / 2;
      x = toHex(pointBytes.slice(1, 1 + coordLen)).toUpperCase();
      y = toHex(pointBytes.slice(1 + coordLen)).toUpperCase();
    }

    return {
      type: "ec",
      curve: buildObjectIdentifier(curveOid, CURVE_NAMES),
      point: { hex: pointHex, x, y },
      keySize: pointBytes.length > 1 ? ((pointBytes.length - 1) / 2) * 8 : 0,
    };
  } catch {
    return undefined;
  }
}

// =============================================================================
// Extension Builders
// =============================================================================

export function buildExtensions(
  extensions: pkijs.Extension[] | undefined,
): Extensions | undefined {
  if (!extensions || extensions.length === 0) {return undefined;}

  const items: Extension[] = extensions.map(buildExtension);
  const critical = items.filter((ext) => ext.critical).length;

  return {
    count: items.length,
    critical,
    items,
  };
}

function buildExtension(ext: pkijs.Extension): Extension {
  const extnID = buildObjectIdentifier(ext.extnID, EXTENSION_NAMES);
  const critical = ext.critical ?? false;
  const rawHex = ext.extnValue?.valueBlock?.valueHex
    ? toHex(ext.extnValue.valueBlock.valueHex).toUpperCase()
    : "";
  const byteLength = rawHex.length / 2;

  const extnValue = { hex: rawHex, byteLength };

  // Try to parse the extension
  let parseStatus: Extension["parseStatus"] = "unsupported";
  let parsed: ParsedExtensionValue | undefined;
  let parseError: string | undefined;

  try {
    const parser = EXTENSION_PARSERS[ext.extnID];
    if (parser) {
      parsed = parser(ext);
      if (parsed) {
        parseStatus = "parsed";
      }
    }
  } catch (error) {
    parseStatus = "error";
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    extnID,
    critical,
    extnValue,
    parseStatus,
    parsed,
    parseError,
  };
}

// Extension parsers
type ExtensionParser = (
  ext: pkijs.Extension,
) => ParsedExtensionValue | undefined;

const EXTENSION_PARSERS: Record<string, ExtensionParser> = {
  // Basic Constraints (2.5.29.19)
  "2.5.29.19": (ext): BasicConstraintsValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const bc = new pkijs.BasicConstraints({ schema: asn1.result });
    const rawPath = bc.pathLenConstraint;
    const pathLenConstraint =
      rawPath === undefined || rawPath === null
        ? undefined
        : typeof rawPath === "number"
          ? rawPath
          : (rawPath.valueBlock?.valueDec ?? undefined);
    return {
      extensionType: "basicConstraints",
      cA: bc.cA ?? false,
      pathLenConstraint,
    };
  },

  // Key Usage (2.5.29.15)
  "2.5.29.15": (ext): KeyUsageValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const bitString = asn1.result as Asn1BitString;
    const bytes =
      bitString.valueBlock.valueHexView ??
      new Uint8Array(bitString.valueBlock.valueHex);
    if (bytes.length === 0) {return undefined;}

    const unusedBits =
      typeof bitString.valueBlock.unusedBits === "number"
        ? bitString.valueBlock.unusedBits
        : 0;
    const totalBits = Math.max(0, bytes.length * 8 - unusedBits);

    const usages: string[] = [];
    const flags: Record<string, boolean> = {};

    for (let i = 0; i < KEY_USAGE_FLAGS.length; i++) {
      const flagName = KEY_USAGE_FLAGS[i];
      if (i >= totalBits) {
        flags[flagName] = false;
        continue;
      }
      const byteIndex = Math.floor(i / 8);
      const bitPosition = 7 - (i % 8);
      const isSet = (bytes[byteIndex] & (1 << bitPosition)) !== 0;
      flags[flagName] = isSet;
      if (isSet) {usages.push(flagName);}
    }

    return {
      extensionType: "keyUsage",
      digitalSignature: flags.digitalSignature ?? false,
      nonRepudiation: flags.nonRepudiation ?? false,
      keyEncipherment: flags.keyEncipherment ?? false,
      dataEncipherment: flags.dataEncipherment ?? false,
      keyAgreement: flags.keyAgreement ?? false,
      keyCertSign: flags.keyCertSign ?? false,
      cRLSign: flags.cRLSign ?? false,
      encipherOnly: flags.encipherOnly ?? false,
      decipherOnly: flags.decipherOnly ?? false,
      usages,
    };
  },

  // Extended Key Usage (2.5.29.37)
  "2.5.29.37": (ext): ExtendedKeyUsageValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const sequence = asn1.result as Sequence;
    const purposes: ObjectIdentifier[] = [];
    for (const node of sequence.valueBlock.value) {
      const oid = (
        node as { valueBlock?: { toString?: () => string } }
      )?.valueBlock?.toString?.();
      if (typeof oid === "string" && oid.length > 0) {
        purposes.push(buildObjectIdentifier(oid, EKU_NAMES));
      }
    }
    return { extensionType: "extendedKeyUsage", purposes };
  },

  // Subject Alternative Name (2.5.29.17)
  "2.5.29.17": (ext): SubjectAltNameValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const generalNames = new pkijs.GeneralNames({ schema: asn1.result });
    const names = generalNames.names.map(parseGeneralName);
    return { extensionType: "subjectAltName", names };
  },

  // Authority Key Identifier (2.5.29.35)
  "2.5.29.35": (ext): AuthorityKeyIdentifierValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const sequence = asn1.result as Sequence;

    let keyIdentifier: string | undefined;
    const authorityCertIssuer: GeneralName[] = [];
    let authorityCertSerialNumber: string | undefined;

    for (const element of sequence.valueBlock.value) {
      const el = element as {
        idBlock: { tagClass: number; tagNumber: number };
        valueBlock?: { valueHex?: ArrayBuffer };
      };
      if (el.idBlock.tagClass !== 3) {continue;}
      if (el.idBlock.tagNumber === 0 && el.valueBlock?.valueHex) {
        keyIdentifier = toHex(el.valueBlock.valueHex).toUpperCase();
      } else if (el.idBlock.tagNumber === 1) {
        const names = new pkijs.GeneralNames({ schema: element });
        for (const gn of names.names) {
          authorityCertIssuer.push(parseGeneralName(gn));
        }
      } else if (el.idBlock.tagNumber === 2 && el.valueBlock?.valueHex) {
        authorityCertSerialNumber = toHex(el.valueBlock.valueHex).toUpperCase();
      }
    }

    return {
      extensionType: "authorityKeyIdentifier",
      keyIdentifier,
      authorityCertIssuer:
        authorityCertIssuer.length > 0 ? authorityCertIssuer : undefined,
      authorityCertSerialNumber,
    };
  },

  // Subject Key Identifier (2.5.29.14)
  "2.5.29.14": (ext): SubjectKeyIdentifierValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const octetString = asn1.result as OctetString;
    const keyIdentifier = toHex(octetString.valueBlock.valueHex).toUpperCase();
    return { extensionType: "subjectKeyIdentifier", keyIdentifier };
  },

  // CRL Distribution Points (2.5.29.31)
  "2.5.29.31": (ext): CRLDistributionPointsValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const sequence = asn1.result as Sequence;
    const distributionPoints: DistributionPoint[] = [];

    for (const dp of sequence.valueBlock.value) {
      if (!(dp instanceof Sequence)) {continue;}
      try {
        const distribution = new pkijs.DistributionPoint({ schema: dp });
        const point: DistributionPoint = {};

        if (distribution.distributionPoint) {
          if (Array.isArray(distribution.distributionPoint)) {
            point.distributionPoint = {
              fullName: distribution.distributionPoint.map(parseGeneralName),
            };
          }
        }

        if (distribution.cRLIssuer && Array.isArray(distribution.cRLIssuer)) {
          point.cRLIssuer = distribution.cRLIssuer.map(parseGeneralName);
        }

        distributionPoints.push(point);
      } catch {
        // Skip malformed distribution points
      }
    }

    return { extensionType: "cRLDistributionPoints", distributionPoints };
  },

  // Authority Information Access (1.3.6.1.5.5.7.1.1)
  "1.3.6.1.5.5.7.1.1": (ext): AuthorityInfoAccessValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const sequence = asn1.result as Sequence;
    const accessDescriptions: AccessDescription[] = [];

    for (const access of sequence.valueBlock.value) {
      const accessDesc = access as Sequence;
      const methodNode = accessDesc.valueBlock.value[0] as {
        valueBlock?: { toString?: () => string };
      };
      const locationNode = accessDesc.valueBlock.value[1];

      const methodOid = methodNode?.valueBlock?.toString?.() ?? "";
      let accessMethod: ObjectIdentifier;
      if (methodOid === "1.3.6.1.5.5.7.48.1") {
        accessMethod = { oid: methodOid, name: "ocsp", shortName: "OCSP" };
      } else if (methodOid === "1.3.6.1.5.5.7.48.2") {
        accessMethod = {
          oid: methodOid,
          name: "caIssuers",
          shortName: "caIssuers",
        };
      } else {
        accessMethod = buildObjectIdentifier(methodOid);
      }

      if (locationNode) {
        const generalName = new pkijs.GeneralName({ schema: locationNode });
        accessDescriptions.push({
          accessMethod,
          accessLocation: parseGeneralName(generalName),
        });
      }
    }

    return { extensionType: "authorityInfoAccess", accessDescriptions };
  },

  // Certificate Policies (2.5.29.32)
  "2.5.29.32": (ext): CertificatePoliciesValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const certPolicies = new pkijs.CertificatePolicies({ schema: asn1.result });

    const policies: PolicyInformation[] = certPolicies.certificatePolicies.map(
      (policy) => {
        const policyAny = policy as {
          policyIdentifier?:
            | string
            | { valueBlock?: { toString?: () => string } };
          policyQualifiers?: {
            policyQualifierId?: string;
            qualifier?: string | { valueBlock?: { value?: string } };
          }[];
        };
        const identifier = policyAny.policyIdentifier;
        const oid =
          typeof identifier === "string"
            ? identifier
            : (identifier?.valueBlock?.toString?.() ?? "");

        const policyQualifiers = policyAny.policyQualifiers?.map((q) => {
          const qualifierOid = q.policyQualifierId ?? "";
          let qualifier: string | undefined;
          if (typeof q.qualifier === "string") {
            qualifier = q.qualifier;
          } else if (q.qualifier?.valueBlock?.value) {
            qualifier = String(q.qualifier.valueBlock.value);
          }
          return {
            qualifierId: buildObjectIdentifier(qualifierOid),
            qualifier,
          };
        });

        return {
          policyIdentifier: buildObjectIdentifier(oid),
          policyQualifiers,
        };
      },
    );

    return { extensionType: "certificatePolicies", policies };
  },

  // CRL Number (2.5.29.20)
  "2.5.29.20": (ext): CRLNumberValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const integer = asn1.result as Integer;
    const bytes = new Uint8Array(integer.valueBlock.valueHex);
    let value = 0n;
    for (const byte of bytes) {value = (value << 8n) + BigInt(byte);}
    return { extensionType: "cRLNumber", number: value.toString() };
  },

  // Delta CRL Indicator (2.5.29.27)
  "2.5.29.27": (ext): DeltaCRLIndicatorValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const integer = asn1.result as Integer;
    const bytes = new Uint8Array(integer.valueBlock.valueHex);
    let value = 0n;
    for (const byte of bytes) {value = (value << 8n) + BigInt(byte);}
    return {
      extensionType: "deltaCRLIndicator",
      baseCRLNumber: value.toString(),
    };
  },

  // CRL Reason (2.5.29.21) - for CRL entry extensions
  "2.5.29.21": (ext): CRLReasonValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    const enumerated = asn1.result as { valueBlock?: { valueDec?: number } };
    const code = enumerated?.valueBlock?.valueDec;
    if (typeof code !== "number") {return undefined;}
    return {
      extensionType: "cRLReason",
      code,
      name: CRL_REASON_CODES[code] ?? `reason_${code}`,
    };
  },

  // Invalidity Date (2.5.29.24)
  "2.5.29.24": (ext): InvalidityDateValue | undefined => {
    const asn1 = fromBER(ext.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {return undefined;}
    // The value is a GeneralizedTime
    const time = asn1.result as { valueBlock?: { value?: Date } };
    if (!time.valueBlock?.value) {return undefined;}
    return {
      extensionType: "invalidityDate",
      date: buildTime(time),
    };
  },
};

function parseGeneralName(gn: pkijs.GeneralName): GeneralName {
  const typeMap: Record<number, GeneralName["type"]> = {
    0: "otherName",
    1: "rfc822Name",
    2: "dNSName",
    3: "x400Address",
    4: "directoryName",
    5: "ediPartyName",
    6: "uniformResourceIdentifier",
    7: "iPAddress",
    8: "registeredID",
  };

  const type = typeMap[gn.type] ?? "otherName";
  let value = "";
  let typeOid: string | undefined;
  let rawHex: string | undefined;

  if (typeof gn.value === "string") {
    value = gn.value;
  } else if (gn.value instanceof ArrayBuffer) {
    // IP address
    const bytes = new Uint8Array(gn.value);
    if (bytes.length === 4) {
      value = Array.from(bytes).join(".");
    } else if (bytes.length === 16) {
      value = formatIPv6(bytes);
    } else {
      value = toHex(bytes);
      rawHex = value;
    }
  } else if (gn.value instanceof pkijs.RelativeDistinguishedNames) {
    const name = buildName(gn.value);
    value = name.rdnSequence
      .map((rdn) =>
        rdn.attributes
          .map((a) => `${a.type.shortName ?? a.type.oid}=${a.value.string}`)
          .join("+"),
      )
      .join(", ");
  } else if (gn.type === 0 && gn.value) {
    // otherName
    const otherName = gn.value as { type?: string; valueHex?: ArrayBuffer };
    typeOid = otherName.type;
    if (otherName.valueHex) {
      rawHex = toHex(otherName.valueHex).toUpperCase();
      value = rawHex;
    }
  }

  return { type, value, typeOid, rawHex };
}

function formatIPv6(bytes: Uint8Array): string {
  const segments: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    segments.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }
  // Find longest run of zeros
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < segments.length; ) {
    if (segments[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < segments.length && segments[j] === "0") {j++;}
    if (j - i > bestLength) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  if (bestLength > 1) {
    segments.splice(bestStart, bestLength, "");
    if (bestStart === 0) {segments.unshift("");}
    if (bestStart + bestLength === 8) {segments.push("");}
  }
  return segments.join(":");
}

// =============================================================================
// Certificate Builder
// =============================================================================

export async function buildTBSCertificate(
  cert: pkijs.Certificate,
): Promise<TBSCertificate> {
  const version = buildVersion(cert.version);
  const serialNumber = buildSerialNumber(cert.serialNumber);
  const signature = buildAlgorithmIdentifier(
    cert.signatureAlgorithm.algorithmId,
    cert.signatureAlgorithm.algorithmParams,
    SIGNATURE_ALG_NAMES,
  );
  const issuer = buildName(cert.issuer);
  const subject = buildName(cert.subject);

  const validity = {
    notBefore: buildTime(cert.notBefore),
    notAfter: buildTime(cert.notAfter),
  };

  const subjectPublicKeyInfo = await buildSubjectPublicKeyInfo(
    cert.subjectPublicKeyInfo,
  );
  const extensions = buildExtensions(cert.extensions);

  return {
    version,
    serialNumber,
    signature,
    issuer,
    validity,
    subject,
    subjectPublicKeyInfo,
    extensions,
  };
}

export async function buildCertificateFingerprints(
  der: ArrayBuffer,
): Promise<Fingerprints> {
  return {
    sha1: await sha1Hex(der),
    sha256: await sha256Hex(der),
  };
}

export function buildCertificateStatus(
  notBefore: Date | undefined,
  notAfter: Date | undefined,
): CertificateStatus {
  const now = Date.now();
  const validFrom = notBefore?.toISOString() ?? "";
  const validUntil = notAfter?.toISOString() ?? "";

  let state: CertificateStatus["state"] = "valid";
  let expiresIn: number | undefined;
  let expiredAgo: number | undefined;
  let startsIn: number | undefined;

  if (notBefore && now < notBefore.getTime()) {
    state = "not-yet-valid";
    startsIn = Math.floor((notBefore.getTime() - now) / 1000);
  } else if (notAfter && now > notAfter.getTime()) {
    state = "expired";
    expiredAgo = Math.floor((now - notAfter.getTime()) / 1000);
  } else if (notAfter) {
    expiresIn = Math.floor((notAfter.getTime() - now) / 1000);
  }

  const expiresInHuman = expiresIn ? formatDuration(expiresIn) : undefined;

  return {
    state,
    validFrom,
    validUntil,
    expiresIn,
    expiredAgo,
    startsIn,
    expiresInHuman,
  };
}

// =============================================================================
// CRL Builder
// =============================================================================

export function buildTBSCertList(
  crl: pkijs.CertificateRevocationList,
  options?: { revocationsLimit?: number; revocationsCursor?: number },
): TBSCertList {
  const hasExtensions =
    crl.crlExtensions?.extensions && crl.crlExtensions.extensions.length > 0;
  const version = hasExtensions ? buildVersion(1) : undefined; // v2 if extensions

  const signature = buildAlgorithmIdentifier(
    crl.signatureAlgorithm.algorithmId,
    crl.signatureAlgorithm.algorithmParams,
    SIGNATURE_ALG_NAMES,
  );
  const issuer = buildName(crl.issuer);
  const thisUpdate = buildTime(crl.thisUpdate);
  const nextUpdate = crl.nextUpdate ? buildTime(crl.nextUpdate) : undefined;

  // Build revoked certificates list
  const revokedCerts = (
    crl as { revokedCertificates?: pkijs.RevokedCertificate[] }
  ).revokedCertificates;
  let revokedCertificates: TBSCertList["revokedCertificates"];

  if (revokedCerts && revokedCerts.length > 0) {
    const limit = options?.revocationsLimit ?? 10;
    const cursor = options?.revocationsCursor ?? 0;
    const items = revokedCerts
      .slice(cursor, cursor + limit)
      .map(buildRevokedCertificate);
    const hasMore = cursor + limit < revokedCerts.length;

    revokedCertificates = {
      count: revokedCerts.length,
      items,
      hasMore,
      nextCursor: hasMore ? String(cursor + limit) : undefined,
    };
  }

  // Build CRL extensions
  const crlExtensions = buildExtensions(crl.crlExtensions?.extensions);

  return {
    version,
    signature,
    issuer,
    thisUpdate,
    nextUpdate,
    revokedCertificates,
    crlExtensions,
  };
}

function buildRevokedCertificate(
  revoked: pkijs.RevokedCertificate,
): RevokedCertificate {
  const userCertificate = buildSerialNumber(revoked.userCertificate);
  const revocationDate = buildTime(revoked.revocationDate);

  let crlEntryExtensions: RevokedCertificate["crlEntryExtensions"];
  if (
    revoked.crlEntryExtensions?.extensions &&
    revoked.crlEntryExtensions.extensions.length > 0
  ) {
    const items = revoked.crlEntryExtensions.extensions.map(buildExtension);
    crlEntryExtensions = {
      count: items.length,
      items,
    };
  }

  return {
    userCertificate,
    revocationDate,
    crlEntryExtensions,
  };
}

export async function buildCrlFingerprints(
  der: ArrayBuffer,
): Promise<Fingerprints> {
  return {
    sha1: await sha1Hex(der),
    sha256: await sha256Hex(der),
  };
}

export function buildCrlStatus(
  thisUpdate: Date | undefined,
  nextUpdate: Date | undefined,
): CrlStatus {
  const now = Date.now();
  const thisUpdateIso = thisUpdate?.toISOString() ?? "";
  const nextUpdateIso = nextUpdate?.toISOString() ?? null;

  let state: CrlStatus["state"] = "current";
  let expiresIn: number | undefined;
  let expiredAgo: number | undefined;

  if (nextUpdate) {
    if (now > nextUpdate.getTime()) {
      state = "expired";
      expiredAgo = Math.floor((now - nextUpdate.getTime()) / 1000);
    } else {
      // Check if it's stale (past 80% of validity period)
      if (thisUpdate) {
        const validityPeriod = nextUpdate.getTime() - thisUpdate.getTime();
        const elapsed = now - thisUpdate.getTime();
        if (elapsed > validityPeriod * 0.8) {
          state = "stale";
        }
      }
      expiresIn = Math.floor((nextUpdate.getTime() - now) / 1000);
    }
  }

  const expiresInHuman = expiresIn ? formatDuration(expiresIn) : undefined;

  return {
    state,
    thisUpdate: thisUpdateIso,
    nextUpdate: nextUpdateIso,
    expiresIn,
    expiredAgo,
    expiresInHuman,
  };
}

export function determineCrlType(
  crl: pkijs.CertificateRevocationList,
): CrlType {
  const deltaCrlIndicator = crl.crlExtensions?.extensions.find(
    (ext) => ext.extnID === "2.5.29.27",
  );
  return deltaCrlIndicator ? "delta" : "full";
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) {return `${seconds} seconds`;}
  if (seconds < 3600) {return `${Math.floor(seconds / 60)} minutes`;}
  if (seconds < 86400) {return `${Math.floor(seconds / 3600)} hours`;}
  if (seconds < 2592000) {return `${Math.floor(seconds / 86400)} days`;}
  if (seconds < 31536000) {return `${Math.floor(seconds / 2592000)} months`;}

  const years = Math.floor(seconds / 31536000);
  const remainingMonths = Math.floor((seconds % 31536000) / 2592000);
  if (remainingMonths === 0) {return `${years} years`;}
  return `${years} years, ${remainingMonths} months`;
}
