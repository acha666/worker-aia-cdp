import type { Env } from "../env";
import type { CertificateMetadata } from "../pki/details/certificate";
import type { CrlMetadata } from "../pki/details/crl";
import { buildCertificateDetails, buildCRLDetails, parseCertificate, parseCRL } from "../pki";
import { extractPEMBlock } from "./pem";

export type ObjectClassification = "certificate" | "crl" | "binary" | "unknown";

export interface ObjectMetadataResource {
  id: string;
  type: "object";
  attributes: {
    path: string;
    objectType: ObjectClassification;
    size: number | null;
    uploadedAt: string | null;
    etag: string | null;
    certificate?: CertificateMetadata;
    crl?: CrlMetadata;
    parseError?: {
      message: string;
    };
  };
}

export async function getMetaJSON(env: Env, key: string): Promise<ObjectMetadataResource | undefined> {
  if (!/^\/(ca|crl|dcrl)\//.test(key)) throw new Error("Unsupported key prefix");
  const r2key = key.replace(/^\/+/, "");
  const object = await env.STORE.get(r2key);
  if (!object) return undefined;

  const isCert = r2key.endsWith(".crt") || r2key.endsWith(".crt.pem");
  const isCRL = r2key.endsWith(".crl") || r2key.endsWith(".crl.pem");

  const resource: ObjectMetadataResource = {
    id: r2key,
    type: "object",
    attributes: {
      path: `/${r2key}`,
      objectType: isCert ? "certificate" : isCRL ? "crl" : "binary",
      size: (object as any).size ?? null,
      uploadedAt: (object as any).uploaded instanceof Date ? (object as any).uploaded.toISOString() : null,
      etag: (object as any).etag ?? (object as any).httpEtag ?? null,
    },
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
      resource.attributes.objectType = "certificate";
      resource.attributes.certificate = await buildCertificateDetails(cert, der);
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
      resource.attributes.objectType = "crl";
      resource.attributes.crl = await buildCRLDetails(crl, der);
    }
  } catch (error) {
    resource.attributes.objectType = "unknown";
    resource.attributes.parseError = {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return resource;
}
