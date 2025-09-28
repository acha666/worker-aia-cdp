import * as pkijs from "pkijs";
import { describeName, bitStringBytes, describeAlgorithm, describeExtensionPresence } from "../utils";
import { toHex, sha1Hex, sha256Hex, toJSDate } from "../format";
import { SIGNATURE_ALG_NAMES } from "../constants";
import { getCRLNumber, getDeltaBaseCRLNumber, getCRLAKIHex } from "../parsers";
import { parseCRLReason } from "../extensions";

export interface CrlEntrySummary {
  serialNumberHex: string | null;
  revocationDate: string | null;
  reason?: string;
}

export interface CrlMetadata {
  summary: {
    issuerCommonName: string | null;
    crlNumber: string | null;
    entryCount: number;
    isDelta: boolean;
  };
  issuer: {
    attributes: ReturnType<typeof describeName>["rdns"];
  };
  numbers: {
    crlNumber: string | null;
    baseCRLNumber: string | null;
  };
  validity: {
    thisUpdate: string | null;
    nextUpdate: string | null;
  };
  signature: {
    algorithm: ReturnType<typeof describeAlgorithm>;
    valueHex: string | null;
    bitLength: number | null;
  };
  fingerprints: {
    sha1: string | null;
    sha256: string | null;
  };
  authorityKeyIdentifier: string | null;
  entries: {
    count: number;
    sample: CrlEntrySummary[];
  };
  extensions: ReturnType<typeof describeExtensionPresence>[];
  isDelta: boolean;
}

export async function buildCRLDetails(crl: pkijs.CertificateRevocationList, der: ArrayBuffer): Promise<CrlMetadata> {
  const issuerDescription = describeName(crl.issuer);
  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl)?.toString() ?? null;
  const baseCRLNumber = getDeltaBaseCRLNumber(crl)?.toString() ?? null;
  const isDelta = baseCRLNumber !== null;
  const authorityKeyIdentifier = getCRLAKIHex(crl) || null;
  const signatureAlgorithm = describeAlgorithm(crl.signatureAlgorithm.algorithmId, SIGNATURE_ALG_NAMES);
  const signatureBytes = bitStringBytes(crl.signatureValue);
  const signatureHex = signatureBytes.length ? toHex(signatureBytes) : null;
  const fingerprints = {
    sha1: await sha1Hex(der),
    sha256: await sha256Hex(der),
  };
  const revoked = ((crl as any).revokedCertificates ?? []) as Array<pkijs.RevokedCertificate>;
  const sample = revoked.slice(0, 5).map(entry => {
    const serialHex = entry.userCertificate.valueBlock.valueHex ? toHex(entry.userCertificate.valueBlock.valueHex) : null;
    return {
      serialNumberHex: serialHex,
      revocationDate: toJSDate(entry.revocationDate)?.toISOString() ?? null,
      reason: parseCRLReason(entry.crlEntryExtensions),
    };
  });
  return {
    summary: {
      issuerCommonName: issuerDescription.commonName,
      crlNumber,
      entryCount: revoked.length,
      isDelta,
    },
    issuer: {
      attributes: issuerDescription.rdns,
    },
    numbers: {
      crlNumber,
      baseCRLNumber,
    },
    validity: {
      thisUpdate: thisUpdate?.toISOString() ?? null,
      nextUpdate: nextUpdate?.toISOString() ?? null,
    },
    signature: {
      algorithm: signatureAlgorithm,
      valueHex: signatureHex,
      bitLength: signatureHex ? signatureBytes.length * 8 : null,
    },
    fingerprints,
    authorityKeyIdentifier,
    entries: {
      count: revoked.length,
      sample,
    },
    extensions: (crl.crlExtensions?.extensions ?? []).map(ext => describeExtensionPresence(ext)),
    isDelta,
  };
}
