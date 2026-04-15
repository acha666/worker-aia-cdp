import type { Env } from "../env";
import { parseCertificate, parseCRL, getCN, isDeltaCRL } from "../pki/parsers";
import { toJSDate } from "../pki/utils/conversion";
import { derBufferFromMaybePem, PEM_BLOCK_MARKERS } from "../pki/crls/pem";
import { runSingleFlight } from "../cache/operations";
import { SUMMARY_METADATA_KEYS, readCustomMetadata } from "./metadata";

export type SummaryKind = "certificate" | "crl" | "other";

export interface ObjectSummary {
  kind: SummaryKind;
  displayName: string | null;
  subjectCommonName: string | null;
  issuerCommonName: string | null;
  notBefore: string | null;
  notAfter: string | null;
  thisUpdate: string | null;
  nextUpdate: string | null;
  isDelta: boolean | null;
}

export const SUMMARY_VERSION = "1";

const SUMMARY_READ_KEYS = {
  kind: [SUMMARY_METADATA_KEYS.kind] as const,
  displayName: [SUMMARY_METADATA_KEYS.displayName] as const,
  subjectCommonName: [SUMMARY_METADATA_KEYS.subject, "subjectCommonName", "subjectCN"] as const,
  issuerCommonName: [SUMMARY_METADATA_KEYS.issuer, "issuerCommonName", "issuerCN"] as const,
  notBefore: [SUMMARY_METADATA_KEYS.notBefore, "notBefore"] as const,
  notAfter: [SUMMARY_METADATA_KEYS.notAfter, "notAfter"] as const,
  thisUpdate: [SUMMARY_METADATA_KEYS.thisUpdate, "thisUpdate"] as const,
  nextUpdate: [SUMMARY_METADATA_KEYS.nextUpdate, "nextUpdate"] as const,
  isDelta: [SUMMARY_METADATA_KEYS.isDelta, "isDelta"] as const,
} as const;

const SUMMARY_WRITE_FIELDS = [
  ["displayName", SUMMARY_METADATA_KEYS.displayName],
  ["subjectCommonName", SUMMARY_METADATA_KEYS.subject],
  ["issuerCommonName", SUMMARY_METADATA_KEYS.issuer],
  ["notBefore", SUMMARY_METADATA_KEYS.notBefore],
  ["notAfter", SUMMARY_METADATA_KEYS.notAfter],
  ["thisUpdate", SUMMARY_METADATA_KEYS.thisUpdate],
  ["nextUpdate", SUMMARY_METADATA_KEYS.nextUpdate],
] as const;

function commonNameFromDistinguishedName(name: {
  typesAndValues: { type: string; value: { valueBlock: { value: unknown } } }[];
}): string | null {
  for (const tv of name.typesAndValues) {
    if (tv.type === "2.5.4.3") {
      const value = tv.value.valueBlock.value;
      return typeof value === "string" ? value : String(value);
    }
  }
  return null;
}

async function createCertificateSummary(
  bytes: Uint8Array,
  key: string
): Promise<ObjectSummary | null> {
  const der = derBufferFromMaybePem(bytes, key, PEM_BLOCK_MARKERS.certificate);
  const cert = parseCertificate(der);
  const subject = getCN(cert) ?? null;
  const issuer = commonNameFromDistinguishedName(cert.issuer);
  const notBefore = toJSDate(cert.notBefore.value)?.toISOString() ?? null;
  const notAfter = toJSDate(cert.notAfter.value)?.toISOString() ?? null;
  const displayName = subject ?? issuer ?? fallbackDisplayName(key, "certificate");
  return {
    kind: "certificate",
    displayName,
    subjectCommonName: subject,
    issuerCommonName: issuer,
    notBefore,
    notAfter,
    thisUpdate: null,
    nextUpdate: null,
    isDelta: null,
  };
}

async function createCrlSummary(bytes: Uint8Array, key: string): Promise<ObjectSummary | null> {
  const der = derBufferFromMaybePem(bytes, key, PEM_BLOCK_MARKERS.crl);
  const crl = parseCRL(der);
  const issuer = commonNameFromDistinguishedName(crl.issuer);
  const thisUpdate = toJSDate(crl.thisUpdate)?.toISOString() ?? null;
  const nextUpdate = toJSDate(crl.nextUpdate)?.toISOString() ?? null;
  const isDelta = isDeltaCRL(crl);
  const displayName = issuer ?? fallbackDisplayName(key, "crl");
  return {
    kind: "crl",
    displayName,
    subjectCommonName: null,
    issuerCommonName: issuer,
    notBefore: null,
    notAfter: null,
    thisUpdate,
    nextUpdate,
    isDelta,
  };
}

function normalizeEtag(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Drop weak validators and surrounding quotes per R2 conditional write docs.
  const withoutWeakPrefix = trimmed.startsWith("W/") ? trimmed.slice(2) : trimmed;
  if (withoutWeakPrefix.startsWith('"') && withoutWeakPrefix.endsWith('"')) {
    return withoutWeakPrefix.slice(1, -1);
  }
  return withoutWeakPrefix;
}

function readOptionalEtag(source: unknown): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }
  const candidate = (source as Record<string, unknown>).etag;
  return typeof candidate === "string" ? candidate : null;
}

export function detectSummaryKind(key: string): SummaryKind {
  if (/\.(crt|cer)(\.pem)?$/i.test(key)) {
    return "certificate";
  }
  if (/\.crl(\.pem)?$/i.test(key)) {
    return "crl";
  }
  return "other";
}

export function readSummaryFromMetadata(
  meta?: Record<string, string | undefined> | null
): ObjectSummary | null {
  if (!meta) {
    return null;
  }
  const kind = pickMetadataValue(meta, SUMMARY_READ_KEYS.kind) as SummaryKind | null;
  const subjectCommonName = pickMetadataValue(meta, SUMMARY_READ_KEYS.subjectCommonName);
  const issuerCommonName = pickMetadataValue(meta, SUMMARY_READ_KEYS.issuerCommonName);
  const notBefore = pickMetadataValue(meta, SUMMARY_READ_KEYS.notBefore);
  const notAfter = pickMetadataValue(meta, SUMMARY_READ_KEYS.notAfter);
  const thisUpdate = pickMetadataValue(meta, SUMMARY_READ_KEYS.thisUpdate);
  const nextUpdate = pickMetadataValue(meta, SUMMARY_READ_KEYS.nextUpdate);
  const isDeltaRaw = pickMetadataValue(meta, SUMMARY_READ_KEYS.isDelta);
  const displayName = pickMetadataValue(meta, SUMMARY_READ_KEYS.displayName);

  if (!kind) {
    if (!subjectCommonName && !issuerCommonName) {
      return null;
    }
  }

  return {
    kind:
      kind ??
      inferKindFromFields({
        subjectCommonName,
        issuerCommonName,
        thisUpdate,
        nextUpdate,
      }),
    displayName: displayName ?? subjectCommonName ?? issuerCommonName ?? null,
    subjectCommonName: subjectCommonName ?? null,
    issuerCommonName: issuerCommonName ?? null,
    notBefore: notBefore ?? null,
    notAfter: notAfter ?? null,
    thisUpdate: thisUpdate ?? null,
    nextUpdate: nextUpdate ?? null,
    isDelta: parseBoolean(isDeltaRaw),
  };
}

function pickMetadataValue(
  meta: Record<string, string | undefined>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

function inferKindFromFields(fields: {
  subjectCommonName?: string | null;
  issuerCommonName?: string | null;
  thisUpdate?: string | null;
  nextUpdate?: string | null;
}): SummaryKind {
  if (fields.thisUpdate || fields.nextUpdate) {
    return "crl";
  }
  if (fields.subjectCommonName) {
    return "certificate";
  }
  return "other";
}

function parseBoolean(value: string | null): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return null;
}

interface SummaryComputationContext {
  env: Env;
  key: string;
  kind: SummaryKind;
  existingMeta?: Record<string, string> | null;
  expectedEtag?: string | null;
}

export async function ensureSummaryMetadata(
  context: SummaryComputationContext
): Promise<ObjectSummary | null> {
  const { env, key } = context;
  const kind = context.kind ?? detectSummaryKind(key);
  if (kind === "other") {
    return null;
  }

  return runSingleFlight(`summary:${kind}:${key}`, async () => {
    try {
      const object = await env.STORE.get(key);
      if (!object) {
        return null;
      }

      const buffer = await object.arrayBuffer();
      const summary = await computeSummaryFromBody(buffer, key, kind);
      if (!summary) {
        return null;
      }

      const objectMetadata = readCustomMetadata(object) ?? context.existingMeta ?? {};
      const newMetadata = buildSummaryMetadata(summary, objectMetadata);

      const etagMatch =
        normalizeEtag(readOptionalEtag(object)) ??
        normalizeEtag(object.httpEtag) ??
        normalizeEtag(context.expectedEtag);

      await env.STORE.put(key, buffer, {
        httpMetadata: object.httpMetadata,
        customMetadata: newMetadata,
        onlyIf: etagMatch ? { etagMatches: etagMatch } : undefined,
      });

      return summary;
    } catch (error) {
      console.error("ensureSummaryMetadata error", { key, error });
      return null;
    }
  });
}

export function buildSummaryMetadata(
  summary: ObjectSummary,
  base: Record<string, string | undefined>
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) {
      continue;
    }
    output[key] = value;
  }
  output[SUMMARY_METADATA_KEYS.version] = SUMMARY_VERSION;
  output[SUMMARY_METADATA_KEYS.kind] = summary.kind;
  for (const [field, metadataKey] of SUMMARY_WRITE_FIELDS) {
    const value = summary[field];
    if (value) {
      output[metadataKey] = value;
    }
  }
  if (summary.isDelta !== null) {
    output[SUMMARY_METADATA_KEYS.isDelta] = String(summary.isDelta);
  }
  return output;
}

async function computeSummaryFromBody(
  buffer: ArrayBuffer,
  key: string,
  kind: SummaryKind
): Promise<ObjectSummary | null> {
  const bytes = new Uint8Array(buffer);
  if (!bytes.byteLength) {
    return null;
  }

  if (kind === "certificate") {
    return createCertificateSummary(bytes, key);
  }
  if (kind === "crl") {
    return createCrlSummary(bytes, key);
  }
  return null;
}

export function fallbackDisplayName(
  key: string,
  kind: SummaryKind = detectSummaryKind(key)
): string {
  const base = key.replace(/^[^/]+\//, "").replace(/\.(crt|cer|crl)(\.pem)?$/i, "");
  if (kind === "certificate") {
    return base;
  }
  return base.replace(/[-_.]+/g, " ").trim() || base;
}

export function mergeSummaryWithMetadata(
  meta: Record<string, string> | undefined,
  summary: ObjectSummary | null
): Record<string, string> | undefined {
  if (!summary) {
    return meta;
  }
  const base = meta ?? {};
  return buildSummaryMetadata(summary, base);
}

export function summaryToPayload(summary: ObjectSummary | null) {
  if (!summary) {
    return null;
  }
  return { ...summary };
}
