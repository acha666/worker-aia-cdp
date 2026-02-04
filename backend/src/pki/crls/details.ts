import * as pkijs from "pkijs";
import {
  describeName,
  bitStringBytes,
  describeAlgorithm,
  toHex,
  sha1Hex,
  sha256Hex,
  toJSDate,
} from "../utils";
import { SIGNATURE_ALG_NAMES, EXTENSION_NAMES } from "../constants";
import { getCRLNumber, getDeltaBaseCRLNumber, getCRLAKIHex } from "../parsers";
import {
  parseAuthorityKeyIdentifier,
  parseCRLReason,
  type ExtensionDetail,
} from "../extensions";

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
  extensions: ExtensionDetail[];
  isDelta: boolean;
}

export async function buildCRLDetails(
  crl: pkijs.CertificateRevocationList,
  der: ArrayBuffer,
): Promise<CrlMetadata> {
  const issuerDescription = describeName(crl.issuer);
  const thisUpdate = toJSDate(crl.thisUpdate);
  const nextUpdate = toJSDate(crl.nextUpdate);
  const crlNumber = getCRLNumber(crl)?.toString() ?? null;
  const baseCRLNumber = getDeltaBaseCRLNumber(crl)?.toString() ?? null;
  const isDelta = baseCRLNumber !== null;
  const authorityKeyIdentifier = getCRLAKIHex(crl) || null;
  const signatureAlgorithm = describeAlgorithm(
    crl.signatureAlgorithm.algorithmId,
    SIGNATURE_ALG_NAMES,
  );
  const signatureBytes = bitStringBytes(crl.signatureValue);
  const signatureHex = signatureBytes.length ? toHex(signatureBytes) : null;
  const fingerprints = {
    sha1: await sha1Hex(der),
    sha256: await sha256Hex(der),
  };
  const revoked = ((
    crl as unknown as { revokedCertificates?: pkijs.RevokedCertificate[] }
  ).revokedCertificates ?? []) as pkijs.RevokedCertificate[];
  const sample = revoked.slice(0, 5).map((entry) => {
    const serialHex = entry.userCertificate.valueBlock.valueHex
      ? toHex(entry.userCertificate.valueBlock.valueHex)
      : null;
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
    extensions: buildCrlExtensionDetails(crl),
    isDelta,
  };
}

type CrlExtensionParsers = Record<
  string,
  (extension: pkijs.Extension, crl: pkijs.CertificateRevocationList) => unknown
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

const CRL_EXTENSION_PARSERS: CrlExtensionParsers = {
  "2.5.29.35": (extension) =>
    stripCritical(parseAuthorityKeyIdentifier(extension)),
  "2.5.29.20": (_extension, crl) => {
    const number = getCRLNumber(crl);
    return typeof number === "bigint" ? number.toString(10) : undefined;
  },
  "2.5.29.27": (_extension, crl) => {
    const base = getDeltaBaseCRLNumber(crl);
    return typeof base === "bigint" ? base.toString(10) : undefined;
  },
};

function buildCrlExtensionDetails(
  crl: pkijs.CertificateRevocationList,
): ExtensionDetail[] {
  const extensions = crl.crlExtensions?.extensions ?? [];
  return extensions.map((extension) => {
    const oid = extension.extnID;
    const parser = CRL_EXTENSION_PARSERS[oid];
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
      const value = parser(extension, crl) ?? undefined;
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
