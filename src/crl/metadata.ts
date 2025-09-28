import type { Env } from "../env";
import { buildCertificateDetails, buildCRLDetails, parseCertificate, parseCRL } from "../pki";
import { extractPEMBlock } from "./pem";

export interface ObjectMetadata {
  key: string;
  size: number | null;
  uploaded: string | null;
  etag: string | null;
  type: "certificate" | "crl" | "binary" | "unknown";
  details: Record<string, unknown>;
}

export async function getMetaJSON(env: Env, key: string): Promise<ObjectMetadata | undefined> {
  if (!/^\/(ca|crl|dcrl)\//.test(key)) throw new Error("Unsupported key prefix");
  const r2key = key.replace(/^\/+/, "");
  const object = await env.STORE.get(r2key);
  if (!object) return undefined;

  const isCert = r2key.endsWith(".crt") || r2key.endsWith(".crt.pem");
  const isCRL = r2key.endsWith(".crl") || r2key.endsWith(".crl.pem");

  const base: ObjectMetadata = {
    key: r2key,
    size: (object as any).size ?? null,
    uploaded: (object as any).uploaded instanceof Date ? (object as any).uploaded.toISOString() : null,
    etag: (object as any).etag ?? (object as any).httpEtag ?? null,
    type: isCert ? "certificate" : isCRL ? "crl" : "binary",
    details: {},
  };

  try {
    const decoder = new TextDecoder();
    if (isCert) {
      let der: ArrayBuffer;
      if (r2key.endsWith(".pem")) {
        const pemText = decoder.decode(await object.arrayBuffer());
        const block = extractPEMBlock(pemText, "-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----");
        const copy = block.slice();
        der = copy.buffer;
      } else {
        der = await object.arrayBuffer();
      }
      const cert = parseCertificate(der);
      base.details = await buildCertificateDetails(cert, der);
      base.type = "certificate";
      (base.details as any).commonName = (base.details as any).summary?.subjectCN ?? null;
    } else if (isCRL) {
      let der: ArrayBuffer;
      if (r2key.endsWith(".pem")) {
        const pemText = decoder.decode(await object.arrayBuffer());
        const block = extractPEMBlock(pemText, "-----BEGIN X509 CRL-----", "-----END X509 CRL-----");
        const copy = block.slice();
        der = copy.buffer;
      } else {
        der = await object.arrayBuffer();
      }
      const crl = parseCRL(der);
      base.details = await buildCRLDetails(crl, der);
      base.type = "crl";
    } else {
      base.details = { size: base.size };
    }
  } catch (error) {
    base.type = "unknown";
    base.details = {
      parseError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return base;
}
