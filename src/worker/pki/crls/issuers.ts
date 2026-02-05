import type { Env } from "../../env";
import { cachedListAllWithPrefix } from "../../r2/listing";
import {
  parseCertificate,
  getCRLAKIHex,
  getSKIHex,
  getCRLNumber,
  getDeltaBaseCRLNumber,
  friendlyNameFromCert,
} from "../parsers";
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
    if (!object.key.endsWith(".crt")) {
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

export async function findIssuerCertForCRL(env: Env, crl: pkijs.CertificateRevocationList) {
  const akiHex = getCRLAKIHex(crl);
  const candidates = await listCACandidates(env);
  if (akiHex) {
    for (const candidate of candidates) {
      const ski = getSKIHex(candidate.cert);
      if (ski?.toLowerCase() === akiHex.toLowerCase()) {
        return candidate;
      }
    }
  }
  const issuerDN = crl.issuer.typesAndValues
    .map((tv) => `${tv.type}=${tv.value.valueBlock.value}`)
    .join(",");
  for (const candidate of candidates) {
    const subjectDN = candidate.cert.subject.typesAndValues
      .map((tv) => `${tv.type}=${tv.value.valueBlock.value}`)
      .join(",");
    if (issuerDN === subjectDN) {
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

export function classifyCRL(crl: pkijs.CertificateRevocationList, issuer: pkijs.Certificate) {
  const friendly = friendlyNameFromCert(issuer)
    .replace(/IssuingCA/gi, "IssuingCA")
    .replace(/RootCA/gi, "RootCA");
  const deltaBase = getDeltaBaseCRLNumber(crl);
  const isDelta = deltaBase !== undefined;
  const logicalBase = /Issuing/i.test(friendly) ? "AchaIssuingCA01" : "AchaRootCA";
  const folder = isDelta ? "dcrl" : "crl";
  const logicalDERKey = `${folder}/${logicalBase}.crl`;
  const logicalPEMKey = `${folder}/${logicalBase}.crl.pem`;
  const byAkiKey = (() => {
    const aki = getCRLAKIHex(crl);
    return aki ? `${folder}/by-keyid/${aki}.crl` : undefined;
  })();
  return {
    friendly,
    isDelta,
    deltaBase,
    folder,
    logicalBase,
    logicalDERKey,
    logicalPEMKey,
    byAkiKey,
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
