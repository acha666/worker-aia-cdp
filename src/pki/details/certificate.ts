import { fromBER, Sequence, Integer } from "asn1js";
import * as pkijs from "pkijs";
import { describeName, bitStringBytes, describeAlgorithm, describeExtensionPresence } from "../utils";
import { toHex, sha256Hex, sha1Hex, toJSDate } from "../format";
import { KEY_ALG_NAMES, SIGNATURE_ALG_NAMES, CURVE_NAMES } from "../constants";
import {
  parseBasicConstraints,
  parseKeyUsageExtension,
  parseExtendedKeyUsage,
  parseSubjectAltName,
  parseAuthorityInfoAccess,
  parseCRLDistributionPoints,
  parseCertificatePolicies,
  parseAuthorityKeyIdentifier,
} from "../extensions";
import { getSKIHex } from "../parsers";

export interface DistinguishedNameAttribute {
  oid: string;
  name: string;
  shortName: string | null;
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
  extensions: {
    basicConstraints?: ReturnType<typeof parseBasicConstraints>;
    keyUsage?: ReturnType<typeof parseKeyUsageExtension>;
    extendedKeyUsage?: ReturnType<typeof parseExtendedKeyUsage>;
    subjectAltName?: ReturnType<typeof parseSubjectAltName>;
    authorityInfoAccess?: ReturnType<typeof parseAuthorityInfoAccess>;
    crlDistributionPoints?: ReturnType<typeof parseCRLDistributionPoints>;
    certificatePolicies?: ReturnType<typeof parseCertificatePolicies>;
    subjectKeyIdentifier: string | null;
    authorityKeyIdentifier?: ReturnType<typeof parseAuthorityKeyIdentifier>;
    present: ReturnType<typeof describeExtensionPresence>[];
  };
}

export async function buildCertificateDetails(cert: pkijs.Certificate, der: ArrayBuffer): Promise<CertificateMetadata> {
  const subjectDescription = describeName(cert.subject);
  const issuerDescription = describeName(cert.issuer);
  const notBefore = toJSDate((cert as any).notBefore);
  const notAfter = toJSDate((cert as any).notAfter);
  const serialHex = cert.serialNumber.valueBlock.valueHex ? toHex(cert.serialNumber.valueBlock.valueHex) : null;
  const signatureAlgorithm = describeAlgorithm(cert.signatureAlgorithm.algorithmId, SIGNATURE_ALG_NAMES);
  const signatureBytes = bitStringBytes(cert.signatureValue);
  const signatureHex = signatureBytes.length ? toHex(signatureBytes) : null;

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
      const sequence = keyAsn1.result as Sequence;
      const modulus = sequence.valueBlock.value[0] as Integer;
      const exponent = sequence.valueBlock.value[1] as Integer;
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
  const findExtension = (oid: string) => extensions.find(ext => ext.extnID === oid);

  const basicConstraints = parseBasicConstraints(findExtension("2.5.29.19"));
  const keyUsage = parseKeyUsageExtension(findExtension("2.5.29.15"));
  const extendedKeyUsage = parseExtendedKeyUsage(findExtension("2.5.29.37"));
  const subjectAltName = parseSubjectAltName(findExtension("2.5.29.17"));
  const authorityInfoAccess = parseAuthorityInfoAccess(findExtension("1.3.6.1.5.5.7.1.1"));
  const crlDistributionPoints = parseCRLDistributionPoints(findExtension("2.5.29.31"));
  const certificatePolicies = parseCertificatePolicies(findExtension("2.5.29.32"));
  const authorityKeyIdentifier = parseAuthorityKeyIdentifier(findExtension("2.5.29.35"));
  const subjectKeyIdentifier = getSKIHex(cert) || null;

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
      present: extensions.map(extension => describeExtensionPresence(extension)),
    },
  };
}
