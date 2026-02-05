import { fromBER, Sequence, Integer, OctetString } from "asn1js";
import * as pkijs from "pkijs";
import {
  describeName,
  bitStringBytes,
  describeAlgorithm,
} from "../utils/describe";
import { toHex, sha256Hex, sha1Hex, toJSDate } from "../utils/conversion";
import {
  KEY_ALG_NAMES,
  SIGNATURE_ALG_NAMES,
  CURVE_NAMES,
  EXTENSION_NAMES,
} from "../constants";
import { parseBasicConstraints } from "../extensions/basic-constraints";
import { parseKeyUsageExtension } from "../extensions/key-usage";
import { parseExtendedKeyUsage } from "../extensions/extended-key-usage";
import { parseSubjectAltName } from "../extensions/subject-alt-name";
import { parseAuthorityInfoAccess } from "../extensions/authority-info-access";
import { parseCRLDistributionPoints } from "../extensions/crl-distribution-points";
import { parseCertificatePolicies } from "../extensions/certificate-policies";
import { parseAuthorityKeyIdentifier } from "../extensions/authority-key-identifier";
import type { ExtensionDetail } from "../extensions/types";
import { getSKIHex } from "../parsers";

export interface DistinguishedNameAttribute {
  oid: string;
  name: string;
  value: string;
}

export interface DistinguishedNameDescriptor {
  attributes: DistinguishedNameAttribute[];
}

export interface CertificateSummary {
  subjectCommonName: string | null;
  issuerCommonName: string | null;
  notBefore: string | null;
  notAfter: string | null;
}

export interface CertificateMetadata {
  summary: CertificateSummary;
  version: number | null;
  serialNumberHex: string | null;
  validity: {
    notBefore: string | null;
    notAfter: string | null;
  };
  subject: DistinguishedNameDescriptor;
  issuer: DistinguishedNameDescriptor;
  signature: {
    algorithm: ReturnType<typeof describeAlgorithm>;
    valueHex: string | null;
    bitLength: number | null;
  };
  fingerprints: {
    sha1: string | null;
    sha256: string | null;
  };
  publicKey: {
    algorithm: ReturnType<typeof describeAlgorithm>;
    sizeBits: number | null;
    exponent: number | null;
    modulusHex: string | null;
    curveOid: string | null;
    curveName: string | null;
    subjectPublicKeyHex: string | null;
    fingerprints: {
      sha1: string | null;
      sha256: string | null;
    };
  };
  extensions: ExtensionDetail[];
}

export async function buildCertificateDetails(
  cert: pkijs.Certificate,
  der: ArrayBuffer,
): Promise<CertificateMetadata> {
  const subjectDescription = describeName(cert.subject);
  const issuerDescription = describeName(cert.issuer);
  const notBefore = toJSDate(cert.notBefore as unknown as Date);
  const notAfter = toJSDate(cert.notAfter as unknown as Date);
  const serialHex = cert.serialNumber.valueBlock.valueHex
    ? toHex(cert.serialNumber.valueBlock.valueHex)
    : null;
  const signatureAlgorithm = describeAlgorithm(
    cert.signatureAlgorithm.algorithmId,
    SIGNATURE_ALG_NAMES,
  );
  const signatureBytes = bitStringBytes(cert.signatureValue);
  const signatureHex = signatureBytes.length ? toHex(signatureBytes) : null;

  const spki = cert.subjectPublicKeyInfo;
  const publicKeyAlgorithm = describeAlgorithm(
    spki.algorithm.algorithmId,
    KEY_ALG_NAMES,
  );
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
      const sequence = keyAsn1.result as Sequence;
      const modulus = sequence.valueBlock.value[0] as Integer;
      const exponent = sequence.valueBlock.value[1] as Integer;
      let modBytes = new Uint8Array(modulus.valueBlock.valueHex);
      if (modBytes.length > 0 && modBytes[0] === 0) {
        modBytes = modBytes.slice(1);
      }
      keySizeBits = modBytes.length * 8;
      modulusHex = toHex(modBytes);
      keyExponent = exponent.valueBlock.valueDec ?? null;
    }
  } else if (spki.algorithm.algorithmId === "1.2.840.10045.2.1") {
    const params = spki.algorithm.algorithmParams as unknown as
      | { valueBlock?: { toString?: () => string } }
      | undefined;
    if (params?.valueBlock?.toString) {
      curveOid = params.valueBlock.toString();
      curveName = curveOid ? (CURVE_NAMES[curveOid] ?? curveOid) : null;
    }
    if (spkBytes.length > 1) {
      keySizeBits = ((spkBytes.length - 1) / 2) * 8;
    }
  } else if (CURVE_NAMES[spki.algorithm.algorithmId]) {
    curveOid = spki.algorithm.algorithmId;
    curveName = CURVE_NAMES[curveOid];
    keySizeBits = spkBytes.length * 8;
  }

  const certFingerprintSha256 = await sha256Hex(der);
  const certFingerprintSha1 = await sha1Hex(der);

  const extensionEntries = buildCertificateExtensionDetails(cert);

  return {
    summary: {
      subjectCommonName: subjectDescription.commonName,
      issuerCommonName: issuerDescription.commonName,
      notBefore: notBefore?.toISOString() ?? null,
      notAfter: notAfter?.toISOString() ?? null,
    },
    version: typeof cert.version === "number" ? cert.version + 1 : null,
    serialNumberHex: serialHex,
    validity: {
      notBefore: notBefore?.toISOString() ?? null,
      notAfter: notAfter?.toISOString() ?? null,
    },
    subject: {
      attributes: subjectDescription.rdns,
    },
    issuer: {
      attributes: issuerDescription.rdns,
    },
    signature: {
      algorithm: signatureAlgorithm,
      valueHex: signatureHex,
      bitLength: signatureHex ? signatureBytes.length * 8 : null,
    },
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
      subjectPublicKeyHex: spkBytes.length ? toHex(spkBytes) : null,
      fingerprints: {
        sha1: spkFingerprintSha1,
        sha256: spkFingerprintSha256,
      },
    },
    extensions: extensionEntries,
  };
}

type CertificateExtensionParsers = Record<
  string,
  (extension: pkijs.Extension, certificate: pkijs.Certificate) => unknown
>;

function stripCritical<T extends { critical?: boolean }>(
  value: T | null | undefined,
): Omit<T, "critical"> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { critical: _omit, ...rest } = value as T;
  return rest as Omit<T, "critical">;
}

function parseSubjectKeyIdentifierExtension(
  extension: pkijs.Extension,
  certificate: pkijs.Certificate,
) {
  const existing = getSKIHex(certificate);
  if (existing) {
    return { hex: existing };
  }
  try {
    const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
    if (asn1.offset === -1) {
      return undefined;
    }
    const octet = asn1.result as OctetString;
    return { hex: toHex(octet.valueBlock.valueHex) };
  } catch (error) {
    console.warn("subjectKeyIdentifier parse error", error);
    return undefined;
  }
}

const CERTIFICATE_EXTENSION_PARSERS: CertificateExtensionParsers = {
  "2.5.29.19": (extension) => stripCritical(parseBasicConstraints(extension)),
  "2.5.29.15": (extension) => stripCritical(parseKeyUsageExtension(extension)),
  "2.5.29.37": (extension) => stripCritical(parseExtendedKeyUsage(extension)),
  "2.5.29.17": (extension) => stripCritical(parseSubjectAltName(extension)),
  "1.3.6.1.5.5.7.1.1": (extension) =>
    stripCritical(parseAuthorityInfoAccess(extension)),
  "2.5.29.31": (extension) =>
    stripCritical(parseCRLDistributionPoints(extension)),
  "2.5.29.32": (extension) =>
    stripCritical(parseCertificatePolicies(extension)),
  "2.5.29.35": (extension) =>
    stripCritical(parseAuthorityKeyIdentifier(extension)),
  "2.5.29.14": (extension, certificate) =>
    parseSubjectKeyIdentifierExtension(extension, certificate),
};

function buildCertificateExtensionDetails(
  cert: pkijs.Certificate,
): ExtensionDetail[] {
  const extensions = cert.extensions ?? [];
  return extensions.map((extension) => {
    const oid = extension.extnID;
    const parser = CERTIFICATE_EXTENSION_PARSERS[oid];
    const base: ExtensionDetail = {
      oid,
      name: EXTENSION_NAMES[oid] ?? null,
      critical: extension.critical ?? false,
      status: "unparsed",
      rawHex: extension.extnValue?.valueBlock?.valueHex
        ? toHex(extension.extnValue.valueBlock.valueHex)
        : null,
    };
    if (!parser) {
      return base;
    }
    try {
      const value = parser(extension, cert) ?? undefined;
      return {
        ...base,
        status: "parsed",
        value,
      };
    } catch (error) {
      return {
        ...base,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
