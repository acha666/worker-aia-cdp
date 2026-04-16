export type R2CustomMetadata = Record<string, string>;

type MetadataInput = Record<string, string | undefined> | null | undefined;

export const SUMMARY_METADATA_KEYS = {
  version: "summaryVersion",
  kind: "summaryObjectType",
  subject: "summarySubjectCN",
  issuer: "summaryIssuerCN",
  notBefore: "summaryNotBefore",
  notAfter: "summaryNotAfter",
  thisUpdate: "summaryThisUpdate",
  nextUpdate: "summaryNextUpdate",
  isDelta: "summaryIsDelta",
  displayName: "summaryDisplayName",
} as const;

function getMetadataValue(meta: MetadataInput, keys: readonly string[]): string | null {
  if (!meta) {
    return null;
  }
  for (const key of keys) {
    const value = meta[key];
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

export function readCustomMetadata(source: unknown): R2CustomMetadata | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const candidate = (source as { customMetadata?: unknown }).customMetadata;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const output: R2CustomMetadata = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }

  return output;
}

export function hasCertificateSummaryMetadata(meta: MetadataInput): boolean {
  return Boolean(
    getMetadataValue(meta, [
      SUMMARY_METADATA_KEYS.subject,
      SUMMARY_METADATA_KEYS.issuer,
      SUMMARY_METADATA_KEYS.notBefore,
      SUMMARY_METADATA_KEYS.notAfter,
    ])
  );
}

export function readCertificateSummaryMetadata(meta: MetadataInput): {
  subjectCN: string | null;
  issuerCN: string | null;
  notBefore: string | null;
  notAfter: string | null;
  serialNumber: string | null;
} {
  return {
    subjectCN: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.subject, "subjectCN"]),
    issuerCN: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.issuer, "issuerCN"]),
    notBefore: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.notBefore, "notBefore"]),
    notAfter: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.notAfter, "notAfter"]),
    serialNumber: getMetadataValue(meta, ["serialNumber"]),
  };
}

export function readCrlSummaryMetadata(meta: MetadataInput): {
  issuerCN: string | null;
  crlNumber: string | null;
  baseCrlNumber: string | null;
  thisUpdate: string | null;
  nextUpdate: string | null;
  revokedCount: number;
  hasRevokedCount: boolean;
} {
  const revokedCountRaw = getMetadataValue(meta, ["revokedCount"]);
  return {
    issuerCN: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.issuer, "issuerCN"]),
    crlNumber: getMetadataValue(meta, ["crlNumber"]),
    baseCrlNumber: getMetadataValue(meta, ["baseCRLNumber"]),
    thisUpdate: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.thisUpdate, "thisUpdate"]),
    nextUpdate: getMetadataValue(meta, [SUMMARY_METADATA_KEYS.nextUpdate, "nextUpdate"]),
    revokedCount: parseInt(revokedCountRaw ?? "0", 10) || 0,
    hasRevokedCount: revokedCountRaw !== null,
  };
}

export function hasCrlListMetadata(
  meta: MetadataInput,
  options?: {
    requireBaseCrlNumber?: boolean;
  }
): boolean {
  const summary = readCrlSummaryMetadata(meta);
  if (!summary.issuerCN || !summary.thisUpdate || !summary.nextUpdate) {
    return false;
  }
  if (!summary.hasRevokedCount || summary.crlNumber === null) {
    return false;
  }
  if (options?.requireBaseCrlNumber && summary.baseCrlNumber === null) {
    return false;
  }
  return true;
}

export function readFingerprintMetadata(meta: MetadataInput): {
  sha1: string;
  sha256: string;
} {
  return {
    sha1: getMetadataValue(meta, ["fingerprintSha1"]) ?? "",
    sha256: getMetadataValue(meta, ["fingerprintSha256"]) ?? "",
  };
}

export function readNextUpdateDate(meta: MetadataInput): Date | null {
  const raw = getMetadataValue(meta, [SUMMARY_METADATA_KEYS.nextUpdate, "nextUpdate"]);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}
