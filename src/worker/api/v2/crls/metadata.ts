import type { Env } from "../../../env";
import type { CrlType } from "../types";
import { parseCRL, getCRLNumber, getDeltaBaseCRLNumber } from "../../../pki/parsers";
import { toJSDate } from "../../../pki/utils/conversion";
import { derBufferFromMaybePem, PEM_BLOCK_MARKERS } from "../../../pki/crls/pem";
import { buildSummaryMetadata, type ObjectSummary } from "../../../r2/summary";
import { hasCrlListMetadata, readCustomMetadata } from "../../../r2/metadata";
import { queueMetadataRefreshIfNeeded } from "../shared/metadata-refresh";

export function queueCrlMetadataRebuildIfMissing(
  ctx: ExecutionContext,
  env: Env,
  key: string,
  crlType: CrlType,
  existingMeta?: Record<string, string>
): void {
  queueMetadataRefreshIfNeeded({
    ctx,
    shouldRefresh: !hasCrlListMetadata(existingMeta, {
      requireBaseCrlNumber: crlType === "delta",
    }),
    key,
    label: "crl",
    task: async () => {
      await rebuildCrlMetadata(env, key, existingMeta);
    },
  });
}

export async function rebuildCrlMetadata(
  env: Env,
  key: string,
  existingMeta?: Record<string, string>
): Promise<void> {
  const object = await env.STORE.get(key);
  if (!object) {
    return;
  }

  const body = await object.arrayBuffer();
  const der = derBufferFromMaybePem(body, key, PEM_BLOCK_MARKERS.crl);
  const crl = parseCRL(der);

  const issuerCN = (() => {
    for (const tv of crl.issuer.typesAndValues) {
      if (tv.type === "2.5.4.3") {
        return tv.value.valueBlock.value as string;
      }
    }
    return null;
  })();

  const thisUpdate = toJSDate(crl.thisUpdate)?.toISOString() ?? null;
  const nextUpdate = toJSDate(crl.nextUpdate)?.toISOString() ?? null;
  const crlNumber = getCRLNumber(crl);
  const baseCrlNumber = getDeltaBaseCRLNumber(crl);
  const revokedCerts = (crl as { revokedCertificates?: unknown[] }).revokedCertificates;
  const revokedCount = revokedCerts ? revokedCerts.length : 0;

  const summary: ObjectSummary = {
    kind: "crl",
    displayName: issuerCN,
    subjectCommonName: null,
    issuerCommonName: issuerCN,
    notBefore: null,
    notAfter: null,
    thisUpdate,
    nextUpdate,
    isDelta: baseCrlNumber !== undefined,
  };

  const sourceMeta = readCustomMetadata(object) ?? existingMeta ?? {};
  const metadata = buildSummaryMetadata(summary, sourceMeta);

  if (issuerCN) {
    metadata.issuerCN = issuerCN;
  }
  if (thisUpdate) {
    metadata.thisUpdate = thisUpdate;
  }
  if (nextUpdate) {
    metadata.nextUpdate = nextUpdate;
  }
  if (crlNumber !== undefined) {
    metadata.crlNumber = crlNumber.toString();
  }
  if (baseCrlNumber !== undefined) {
    metadata.baseCRLNumber = baseCrlNumber.toString();
  }
  metadata.revokedCount = String(revokedCount);

  await env.STORE.put(key, body, {
    httpMetadata: object.httpMetadata,
    customMetadata: metadata,
  });
}
