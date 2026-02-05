import type { Env } from "../env";
import { parseCertificate, parseCRL, getCN, isDeltaCRL } from "../pki/parsers";
import { toJSDate } from "../pki/utils/conversion";
import { extractPEMBlock } from "../pki/crls/pem";

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

const SUMMARY_KEYS = {
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

const PEM_MARKERS = {
  certificate: {
    begin: "-----BEGIN CERTIFICATE-----",
    end: "-----END CERTIFICATE-----",
  },
  crl: {
    begin: "-----BEGIN X509 CRL-----",
    end: "-----END X509 CRL-----",
  },
} as const;

function bufferFromMaybePem(
  bytes: Uint8Array,
  key: string,
  markers: { begin: string; end: string }
): ArrayBuffer {
  if (!/\.pem$/i.test(key)) {
    return bytes.slice().buffer;
  }
  const pemText = new TextDecoder().decode(bytes);
  const block = extractPEMBlock(pemText, markers.begin, markers.end);
  const copy = block.slice();
  return copy.buffer as ArrayBuffer;
}

function issuerCommonNameFromCertificate(cert: ReturnType<typeof parseCertificate>): string | null {
  for (const tv of cert.issuer.typesAndValues) {
    if (tv.type === "2.5.4.3") {
      return tv.value.valueBlock.value;
    }
  }
  return null;
}

function issuerCommonNameFromCrl(crl: ReturnType<typeof parseCRL>): string | null {
  for (const tv of crl.issuer.typesAndValues) {
    if (tv.type === "2.5.4.3") {
      return tv.value.valueBlock.value;
    }
  }
  return null;
}

async function createCertificateSummary(
  bytes: Uint8Array,
  key: string
): Promise<ObjectSummary | null> {
  const der = bufferFromMaybePem(bytes, key, PEM_MARKERS.certificate);
  const cert = parseCertificate(der);
  const subject = getCN(cert) ?? null;
  const issuer = issuerCommonNameFromCertificate(cert);
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
  const der = bufferFromMaybePem(bytes, key, PEM_MARKERS.crl);
  const crl = parseCRL(der);
  const issuer = issuerCommonNameFromCrl(crl);
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
  const kind = (meta[SUMMARY_KEYS.kind] as SummaryKind | undefined) ?? null;
  const subjectCommonName =
    meta[SUMMARY_KEYS.subject] ?? meta.subjectCommonName ?? meta.subjectCN ?? null;
  const issuerCommonName =
    meta[SUMMARY_KEYS.issuer] ?? meta.issuerCommonName ?? meta.issuerCN ?? null;
  const notBefore = meta[SUMMARY_KEYS.notBefore] ?? meta.notBefore ?? null;
  const notAfter = meta[SUMMARY_KEYS.notAfter] ?? meta.notAfter ?? null;
  const thisUpdate = meta[SUMMARY_KEYS.thisUpdate] ?? meta.thisUpdate ?? null;
  const nextUpdate = meta[SUMMARY_KEYS.nextUpdate] ?? meta.nextUpdate ?? null;
  const isDeltaRaw = meta[SUMMARY_KEYS.isDelta] ?? meta.isDelta ?? null;
  const displayName = meta[SUMMARY_KEYS.displayName] ?? null;

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

    const newMetadata = buildSummaryMetadata(
      summary,
      object.customMetadata ?? context.existingMeta ?? {}
    );

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
  output[SUMMARY_KEYS.version] = SUMMARY_VERSION;
  output[SUMMARY_KEYS.kind] = summary.kind;
  if (summary.displayName) {
    output[SUMMARY_KEYS.displayName] = summary.displayName;
  }
  if (summary.subjectCommonName) {
    output[SUMMARY_KEYS.subject] = summary.subjectCommonName;
  }
  if (summary.issuerCommonName) {
    output[SUMMARY_KEYS.issuer] = summary.issuerCommonName;
  }
  if (summary.notBefore) {
    output[SUMMARY_KEYS.notBefore] = summary.notBefore;
  }
  if (summary.notAfter) {
    output[SUMMARY_KEYS.notAfter] = summary.notAfter;
  }
  if (summary.thisUpdate) {
    output[SUMMARY_KEYS.thisUpdate] = summary.thisUpdate;
  }
  if (summary.nextUpdate) {
    output[SUMMARY_KEYS.nextUpdate] = summary.nextUpdate;
  }
  if (summary.isDelta !== null) {
    output[SUMMARY_KEYS.isDelta] = String(summary.isDelta);
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
  return {
    kind: summary.kind,
    displayName: summary.displayName,
    subjectCommonName: summary.subjectCommonName,
    issuerCommonName: summary.issuerCommonName,
    notBefore: summary.notBefore,
    notAfter: summary.notAfter,
    thisUpdate: summary.thisUpdate,
    nextUpdate: summary.nextUpdate,
    isDelta: summary.isDelta,
  };
}
