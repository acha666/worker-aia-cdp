import type { Env } from "../../../env";
import { parseCertificate } from "../../../pki/parsers";
import { ensureSummaryMetadata, buildSummaryMetadata } from "../../../r2/summary";
import { hasCertificateSummaryMetadata, readCustomMetadata } from "../../../r2/metadata";
import { DER_CERT_PATTERN } from "./constants";
import { queueMetadataRefreshIfNeeded } from "../shared/metadata-refresh";
import { derToPem } from "../shared/pem";

export function queueCertificateMetadataRebuildIfMissing(
  ctx: ExecutionContext,
  env: Env,
  key: string,
  existingMeta?: Record<string, string>
): void {
  queueMetadataRefreshIfNeeded({
    ctx,
    shouldRefresh: !hasCertificateSummaryMetadata(existingMeta),
    key,
    label: "certificate",
    task: async () => {
      await ensureSummaryMetadata({
        env,
        key,
        kind: "certificate",
        existingMeta,
      });
    },
  });
}

export async function ensureCertificatePemVariant(
  env: Env,
  key: string,
  existingMeta?: Record<string, string>
): Promise<void> {
  if (!DER_CERT_PATTERN.test(key)) {
    return;
  }

  const pemKey = `${key}.pem`;
  const existingPem = await env.STORE.get(pemKey);
  if (existingPem) {
    return;
  }

  const source = await env.STORE.get(key);
  if (!source) {
    return;
  }

  const der = await source.arrayBuffer();
  parseCertificate(der);

  const summary = await ensureSummaryMetadata({
    env,
    key,
    kind: "certificate",
    existingMeta: existingMeta ?? readCustomMetadata(source),
  });

  const sourceMetadata = readCustomMetadata(source);
  const metadata = summary
    ? buildSummaryMetadata(summary, sourceMetadata ?? existingMeta ?? {})
    : (sourceMetadata ?? existingMeta ?? {});

  const pemText = derToPem(der, "-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----");

  await env.STORE.put(pemKey, new TextEncoder().encode(pemText), {
    httpMetadata: {},
    customMetadata: metadata,
  });
}
