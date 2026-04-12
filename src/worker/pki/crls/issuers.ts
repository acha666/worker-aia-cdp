import type { Env } from "../../env";
import { cachedListAllWithPrefix } from "../../r2/listing";
import { parseCertificate, getCRLAKIHex, getSKIHex, getCRLNumber } from "../parsers";
import { toJSDate, sha256Hex } from "../utils/conversion";
import { putBinary } from "../../r2/objects";
import type * as pkijs from "pkijs";

export interface CACandidate {
  key: string;
  der: ArrayBuffer;
  cert: pkijs.Certificate;
}

export async function listCACandidates(env: Env): Promise<CACandidate[]> {
  const results: CACandidate[] = [];
  const caObjects = await cachedListAllWithPrefix(env, "ca/");
  for (const object of caObjects) {
    if (!isAllowedCACertificateKey(object.key)) {
      continue;
    }
    const file = await env.STORE.get(object.key);
    if (!file) {
      continue;
    }
    const der = await file.arrayBuffer();
    try {
      const cert = parseCertificate(der);
      results.push({ key: object.key, der, cert });
    } catch (error) {
      console.warn("Skip bad cert:", object.key, String(error));
    }
  }
  return results;
}

export async function findIssuerCertForCRL(
  env: Env,
  crl: pkijs.CertificateRevocationList,
  akiHex?: string
) {
  const parsedAkiHex = akiHex ?? getCRLAKIHex(crl);
  if (!parsedAkiHex) {
    return undefined;
  }

  const candidates = await listCACandidates(env);
  for (const candidate of candidates) {
    const ski = getSKIHex(candidate.cert);
    if (ski?.toLowerCase() === parsedAkiHex.toLowerCase()) {
      return candidate;
    }
  }

  return undefined;
}

export async function verifyCRLWithIssuer(
  crl: pkijs.CertificateRevocationList,
  issuer: pkijs.Certificate
) {
  try {
    return (await crl.verify({ issuerCertificate: issuer })) === true;
  } catch (error) {
    console.error("crl.verify threw:", error);
    return false;
  }
}

export function isNewerCRL(
  incoming: pkijs.CertificateRevocationList,
  existing?: pkijs.CertificateRevocationList
) {
  if (!existing) {
    return true;
  }
  const newNumber = getCRLNumber(incoming);
  const oldNumber = getCRLNumber(existing);
  if (newNumber !== undefined && oldNumber !== undefined) {
    if (newNumber > oldNumber) {
      return true;
    }
    if (newNumber < oldNumber) {
      return false;
    }
  }
  const newUpdate = toJSDate(incoming.thisUpdate);
  const oldUpdate = toJSDate(existing.thisUpdate);
  if (newUpdate && oldUpdate) {
    return newUpdate.getTime() > oldUpdate.getTime();
  }
  console.warn("isNewerCRL: cannot determine freshness", {
    incoming: incoming.thisUpdate,
    existing: existing?.thisUpdate,
  });
  return false;
}

function isAllowedCACertificateKey(key: string): boolean {
  return /\.crt$/i.test(key) || /\.cer$/i.test(key);
}

function deriveLogicalBaseFromIssuerKey(issuerKey: string): string {
  const withoutPrefix = issuerKey.replace(/^ca\//i, "");
  const withoutExt = withoutPrefix.replace(/\.(crt|cer)$/i, "");
  const normalized = withoutExt
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return normalized || "issuer";
}

async function findRootLevelCrlKeyByIssuerKeyId(
  env: Env,
  folder: "crl" | "dcrl",
  issuerKeyId: string
): Promise<string | undefined> {
  const expectedIssuerKeyId = issuerKeyId.toLowerCase();
  let cursor: string | undefined;

  do {
    const listing = await env.STORE.list({
      prefix: `${folder}/`,
      delimiter: "/",
      cursor,
      include: ["customMetadata"],
    } as R2ListOptions);

    for (const object of listing.objects) {
      const key = object.key;
      if (!key.endsWith(".crl") || key.endsWith(".crl.pem")) {
        continue;
      }

      const metadata = (object as { customMetadata?: Record<string, string> }).customMetadata;
      const metaIssuerKeyId = metadata?.issuerKeyId?.toLowerCase();
      if (metaIssuerKeyId === expectedIssuerKeyId) {
        return key;
      }
    }

    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return undefined;
}

function keyLooksLikeRootLevelDER(folder: "crl" | "dcrl", key: string): boolean {
  if (!key.startsWith(`${folder}/`)) {
    return false;
  }
  if (key.startsWith(`${folder}/by-keyid/`) || key.startsWith(`${folder}/archive/`)) {
    return false;
  }
  return key.endsWith(".crl") && !key.endsWith(".crl.pem");
}

async function resolveLegacyCanonicalKeyFromByKeyId(
  env: Env,
  folder: "crl" | "dcrl",
  byAkiKey: string
): Promise<string | undefined> {
  const byAkiObject = await env.STORE.get(byAkiKey);
  if (!byAkiObject) {
    return undefined;
  }

  const metadata = (byAkiObject as { customMetadata?: Record<string, string> }).customMetadata;
  const candidate = metadata?.canonicalKey;
  if (!candidate || !keyLooksLikeRootLevelDER(folder, candidate)) {
    return undefined;
  }

  const exists = await env.STORE.get(candidate);
  return exists ? candidate : undefined;
}

export async function resolveCRLStorageKeys(options: {
  env: Env;
  issuerKey: string;
  issuerKeyId: string;
  isDelta: boolean;
}): Promise<{
  isDelta: boolean;
  folder: "crl" | "dcrl";
  logicalBase: string;
  logicalDERKey: string;
  logicalPEMKey: string;
  byAkiKey: string;
  friendly: string;
}> {
  const folder: "crl" | "dcrl" = options.isDelta ? "dcrl" : "crl";
  const logicalBase = deriveLogicalBaseFromIssuerKey(options.issuerKey);
  const defaultLogicalDERKey = `${folder}/${logicalBase}.crl`;
  const byAkiKey = `${folder}/by-keyid/${options.issuerKeyId}.crl`;

  // Preserve user-managed URL/key when a by-keyid alias already exists for the same issuer key id.
  const existingByCanonical = await resolveLegacyCanonicalKeyFromByKeyId(
    options.env,
    folder,
    byAkiKey
  );
  const existingByMetadata =
    existingByCanonical ??
    (await findRootLevelCrlKeyByIssuerKeyId(options.env, folder, options.issuerKeyId));

  const logicalDERKey = existingByMetadata ?? defaultLogicalDERKey;
  const logicalPEMKey = `${logicalDERKey}.pem`;
  const friendly = logicalBase.split("/").pop() ?? logicalBase;

  return {
    isDelta: options.isDelta,
    folder,
    logicalBase,
    logicalDERKey,
    logicalPEMKey,
    byAkiKey,
    friendly,
  };
}

export async function archiveExistingCRL(
  env: Env,
  folder: string,
  friendly: string,
  existing: { der: ArrayBuffer; parsed: pkijs.CertificateRevocationList },
  meta: Record<string, string>
) {
  const oldNumber = getCRLNumber(existing.parsed);
  const oldTag =
    oldNumber !== undefined ? oldNumber.toString() : (await sha256Hex(existing.der)).slice(0, 16);
  await putBinary(env, `${folder}/archive/${friendly}-${oldTag}.crl`, existing.der, {
    meta: {
      ...meta,
      archivedAt: new Date().toISOString(),
      kind: folder === "dcrl" ? "delta" : "full",
    },
  });
}
