import { fromBER, Sequence, Integer } from "asn1js";
import * as pkijs from "pkijs";
import { describeName, bitStringBytes, describeAlgorithm, describeExtensionPresence } from "../utils";
import { toHex, sha256Hex, sha1Hex, toJSDate, decimalFromHex } from "../format";
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
      subjectCN: subject.commonName,
      issuerCN: issuer.commonName,
      serialNumberHex: serialHex,
      notBefore: notBefore?.toISOString() ?? null,
      notAfter: notAfter?.toISOString() ?? null,
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
  present: extensions.map(extension => describeExtensionPresence(extension)),
    },
  };
}
