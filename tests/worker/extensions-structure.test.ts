/// <reference types="node" />

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { buildCertificateDetails } from "../../src/worker/pki/certs/details";
import { parseCertificate } from "../../src/worker/pki/parsers";
import { extractPEMBlock } from "../../src/worker/pki/crls/pem";

const CERT_DER_URL = new URL("../fixtures/test-leaf.cert.der", import.meta.url);
const CA_PEM_URL = new URL("../fixtures/test-ca.cert.pem", import.meta.url);

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function toArrayBufferFromView(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

test("certificate metadata exposes structured extension entries", async () => {
  const leafDerBytes = await readFile(CERT_DER_URL);
  const leafDer = toArrayBuffer(leafDerBytes);
  const leafCertificate = parseCertificate(leafDer);
  const leafMetadata = await buildCertificateDetails(leafCertificate, leafDer);

  const caPem = await readFile(CA_PEM_URL, "utf8");
  const caDerBlock = extractPEMBlock(
    caPem,
    "-----BEGIN CERTIFICATE-----",
    "-----END CERTIFICATE-----"
  );
  const caDer = toArrayBufferFromView(caDerBlock);
  const caCertificate = parseCertificate(caDer);
  const caMetadata = await buildCertificateDetails(caCertificate, caDer);

  const allEntries = [...(leafMetadata.extensions ?? []), ...(caMetadata.extensions ?? [])];

  assert.ok(Array.isArray(leafMetadata.extensions), "leaf extensions should be an array");
  assert.ok(Array.isArray(caMetadata.extensions), "CA extensions should be an array");
  assert.ok(allEntries.length > 0, "combined extensions should include at least one entry");

  for (const entry of allEntries) {
    assert.ok(entry.oid, "each extension entry includes an oid");
    assert.ok(
      ["parsed", "unparsed", "error"].includes(entry.status),
      "entry status should be normalized"
    );
    assert.equal(typeof entry.critical === "boolean", true, "critical flag should be boolean");
  }

  const ski = allEntries.find((entry) => entry.oid === "2.5.29.14");
  assert.ok(ski, "subject key identifier extension should be present");
  assert.equal(ski?.status, "parsed");
  const skiValue =
    ski?.value && typeof ski.value === "object" && "hex" in ski.value
      ? (ski.value as { hex: string }).hex
      : null;
  assert.equal(typeof skiValue, "string", "subject key identifier should expose hex value");

  const basicConstraints = allEntries.find((entry) => entry.oid === "2.5.29.19");
  assert.ok(basicConstraints);
  assert.equal(basicConstraints?.name, "Basic Constraints");
});
