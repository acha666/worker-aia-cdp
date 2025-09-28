import * as pkijs from "pkijs";
import { describeName, bitStringBytes, describeAlgorithm, describeExtensionPresence } from "../utils";
import { toHex, sha1Hex, sha256Hex, toJSDate, decimalFromHex, secondsUntil } from "../format";
import { SIGNATURE_ALG_NAMES } from "../constants";
import { getCRLNumber, getDeltaBaseCRLNumber, getCRLAKIHex } from "../parsers";
import { parseCRLReason } from "../extensions";

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
    extensions: (crl.crlExtensions?.extensions ?? []).map(ext => describeExtensionPresence(ext)),
    isDelta,
  };
}
