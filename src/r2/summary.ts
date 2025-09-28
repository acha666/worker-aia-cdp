import type { Env } from "../env";
import { parseCertificate, parseCRL, getCN, isDeltaCRL } from "../pki/parsers";
import { toJSDate } from "../pki/format";
import { extractPEMBlock } from "../crl/pem";

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

export function detectSummaryKind(key: string): SummaryKind {
  if (/\.(crt|cer)(\.pem)?$/i.test(key)) return "certificate";
  if (/\.crl(\.pem)?$/i.test(key)) return "crl";
  return "other";
}

export function readSummaryFromMetadata(meta?: Record<string, string | undefined> | null): ObjectSummary | null {
  if (!meta) return null;
  const kind = (meta[SUMMARY_KEYS.kind] as SummaryKind | undefined) ?? null;
  const version = meta[SUMMARY_KEYS.version] ?? null;
  const subjectCommonName = meta[SUMMARY_KEYS.subject] ?? meta.subjectCommonName ?? meta.subjectCN ?? null;
  const issuerCommonName = meta[SUMMARY_KEYS.issuer] ?? meta.issuerCommonName ?? meta.issuerCN ?? null;
  const notBefore = meta[SUMMARY_KEYS.notBefore] ?? meta.notBefore ?? null;
  const notAfter = meta[SUMMARY_KEYS.notAfter] ?? meta.notAfter ?? null;
  const thisUpdate = meta[SUMMARY_KEYS.thisUpdate] ?? meta.thisUpdate ?? null;
  const nextUpdate = meta[SUMMARY_KEYS.nextUpdate] ?? meta.nextUpdate ?? null;
  const isDeltaRaw = meta[SUMMARY_KEYS.isDelta] ?? meta.isDelta ?? null;
  const displayName = meta[SUMMARY_KEYS.displayName] ?? null;

  if (!kind) {
    if (!subjectCommonName && !issuerCommonName) return null;
  }

  return {
    kind: kind ?? inferKindFromFields({ subjectCommonName, issuerCommonName, thisUpdate, nextUpdate }),
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

function inferKindFromFields(fields: { subjectCommonName?: string | null; issuerCommonName?: string | null; thisUpdate?: string | null; nextUpdate?: string | null; }): SummaryKind {
  if (fields.thisUpdate || fields.nextUpdate) return "crl";
  if (fields.subjectCommonName) return "certificate";
  return "other";
}

function parseBoolean(value: string | null): boolean | null {
  if (value === null || value === undefined) return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

interface SummaryComputationContext {
  env: Env;
  key: string;
  kind: SummaryKind;
  existingMeta?: Record<string, string> | null;
  expectedEtag?: string | null;
}

interface ComputedSummary {
  summary: ObjectSummary;
  metadata: Record<string, string>;
  etag?: string | null;
}

export async function ensureSummaryMetadata(context: SummaryComputationContext): Promise<ObjectSummary | null> {
  const { env, key } = context;
  const kind = context.kind ?? detectSummaryKind(key);
  if (kind === "other") return null;

  try {
    const object = await env.STORE.get(key);
    if (!object) return null;

    const buffer = await object.arrayBuffer();
    const summary = await computeSummaryFromBody(buffer, key, kind);
    if (!summary) return null;

    const newMetadata = buildSummaryMetadata(summary, object.customMetadata ?? context.existingMeta ?? {});

    await env.STORE.put(key, buffer, {
      httpMetadata: object.httpMetadata,
      customMetadata: newMetadata,
      onlyIf: object.httpEtag ? { etagMatches: object.httpEtag } : context.expectedEtag ? { etagMatches: context.expectedEtag } : undefined,
    });

    return summary;
  } catch (error) {
    console.error("ensureSummaryMetadata error", { key, error });
    return null;
  }
}

export function buildSummaryMetadata(summary: ObjectSummary, base: Record<string, string | undefined>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  output[SUMMARY_KEYS.version] = SUMMARY_VERSION;
  output[SUMMARY_KEYS.kind] = summary.kind;
  if (summary.displayName) output[SUMMARY_KEYS.displayName] = summary.displayName;
  if (summary.subjectCommonName) output[SUMMARY_KEYS.subject] = summary.subjectCommonName;
  if (summary.issuerCommonName) output[SUMMARY_KEYS.issuer] = summary.issuerCommonName;
  if (summary.notBefore) output[SUMMARY_KEYS.notBefore] = summary.notBefore;
  if (summary.notAfter) output[SUMMARY_KEYS.notAfter] = summary.notAfter;
  if (summary.thisUpdate) output[SUMMARY_KEYS.thisUpdate] = summary.thisUpdate;
  if (summary.nextUpdate) output[SUMMARY_KEYS.nextUpdate] = summary.nextUpdate;
  if (summary.isDelta !== null) output[SUMMARY_KEYS.isDelta] = String(summary.isDelta);
  return output;
}

async function computeSummaryFromBody(buffer: ArrayBuffer, key: string, kind: SummaryKind): Promise<ObjectSummary | null> {
  const bytes = new Uint8Array(buffer);
  if (!bytes.byteLength) return null;
  const isPem = /\.pem$/i.test(key);

  if (kind === "certificate") {
    const der = (() => {
      if (!isPem) return buffer;
      const pemText = new TextDecoder().decode(bytes);
      const block = extractPEMBlock(pemText, "-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----");
      const copy = block.slice();
      return copy.buffer as ArrayBuffer;
    })();
    const cert = parseCertificate(der);
    const subject = getCN(cert) ?? null;
    const issuer = cert.issuer?.typesAndValues?.find?.(tv => tv.type === "2.5.4.3")?.value.valueBlock.value ?? null;
    const notBefore = toJSDate(cert.notBefore.value)?.toISOString() ?? null;
    const notAfter = toJSDate(cert.notAfter.value)?.toISOString() ?? null;
  const displayName = subject ?? issuer ?? fallbackDisplayName(key, kind);
    return {
      kind,
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

  if (kind === "crl") {
    const der = (() => {
      if (!isPem) return buffer;
      const pemText = new TextDecoder().decode(bytes);
      const block = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
      const copy = block.slice();
      return copy.buffer as ArrayBuffer;
    })();
    const crl = parseCRL(der);
    const issuer = crl.issuer?.typesAndValues?.find?.(tv => tv.type === "2.5.4.3")?.value.valueBlock.value ?? null;
    const thisUpdate = toJSDate(crl.thisUpdate)?.toISOString() ?? null;
    const nextUpdate = toJSDate(crl.nextUpdate)?.toISOString() ?? null;
    const isDelta = isDeltaCRL(crl);
  const displayName = issuer ?? fallbackDisplayName(key, kind);
    return {
      kind,
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

  return null;
}

export function fallbackDisplayName(key: string, kind: SummaryKind = detectSummaryKind(key)): string {
  const base = key.replace(/^[^/]+\//, "").replace(/\.(crt|cer|crl)(\.pem)?$/i, "");
  if (kind === "certificate") return base;
  return base.replace(/[-_.]+/g, " ").trim() || base;
}

export function mergeSummaryWithMetadata(meta: Record<string, string> | undefined, summary: ObjectSummary | null): Record<string, string> | undefined {
  if (!summary) return meta;
  const base = meta ?? {};
  return buildSummaryMetadata(summary, base);
}

export function summaryToPayload(summary: ObjectSummary | null) {
  if (!summary) return null;
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
