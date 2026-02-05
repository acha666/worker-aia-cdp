/// <reference types="node" />

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";

import {
  SUMMARY_VERSION,
  buildSummaryMetadata,
  detectSummaryKind,
  ensureSummaryMetadata,
  fallbackDisplayName,
  mergeSummaryWithMetadata,
  readSummaryFromMetadata,
  summaryToPayload,
} from "../../src/worker/r2/summary";

type R2HTTPMetadata = Record<string, unknown>;

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  onlyIf?: {
    etagMatches?: string | null;
  };
}

interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
  httpEtag?: string | null;
  etag?: string | null;
}

type R2Object = R2ObjectBody;

// Polyfill Web APIs that Cloudflare Workers expose but Node lacks.
if (typeof globalThis.crypto === "undefined") {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}
if (typeof globalThis.atob !== "function") {
  globalThis.atob = (input: string) =>
    Buffer.from(input, "base64").toString("binary");
}

const CERT_PEM_URL = new URL("../fixtures/test-leaf.cert.pem", import.meta.url);

class MockR2Object implements R2ObjectBody {
  readonly customMetadata?: Record<string, string> | undefined;
  readonly httpMetadata?: R2HTTPMetadata | undefined;
  readonly httpEtag?: string | null;
  readonly etag?: string | null;
  #buffer: ArrayBuffer;

  constructor(
    buffer: ArrayBuffer | Uint8Array,
    metadata?: Record<string, string>,
  ) {
    const bytes =
      buffer instanceof Uint8Array ? buffer.slice() : new Uint8Array(buffer);
    this.#buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    this.customMetadata = metadata;
    this.httpMetadata = {};
    this.httpEtag = '"etag-value"';
    this.etag = '"etag-value"';
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.#buffer.slice(0);
  }
}

class MockBucket {
  readonly object: MockR2Object | null;
  lastPut: {
    key: string;
    data: ArrayBuffer | Uint8Array;
    options: R2PutOptions;
  } | null = null;

  constructor(object: MockR2Object | null) {
    this.object = object;
  }

  async get(_key: string): Promise<R2Object | null> {
    return this.object as unknown as R2Object | null;
  }

  async put(
    _key: string,
    _data: ArrayBuffer | Uint8Array,
    _options: R2PutOptions,
  ): Promise<void> {
    this.lastPut = { key: _key, data: _data, options: _options };
  }
}

function createEnv(bucket: MockBucket) {
  return {
    STORE: bucket,
  } as unknown as import("../../src/worker/env").Env;
}

test("detectSummaryKind discriminates by extension", () => {
  assert.equal(detectSummaryKind("ca/root.cer"), "certificate");
  assert.equal(detectSummaryKind("ca/root.cer.pem"), "certificate");
  assert.equal(detectSummaryKind("crl/latest.crl"), "crl");
  assert.equal(detectSummaryKind("crl/latest.crl.pem"), "crl");
  assert.equal(detectSummaryKind("misc/readme.txt"), "other");
});

test("fallbackDisplayName strips prefix and cleans value", () => {
  assert.equal(
    fallbackDisplayName("ca/Example Authority.cer"),
    "Example Authority",
  );
  assert.equal(
    fallbackDisplayName("crl/example-delta.crl", "crl"),
    "example delta",
  );
});

test("readSummaryFromMetadata reconstructs summary payload", () => {
  const meta = {
    summaryVersion: SUMMARY_VERSION,
    summaryObjectType: "certificate",
    summarySubjectCN: "Leaf Certificate",
    summaryIssuerCN: "Test Root CA",
    summaryNotBefore: "2025-01-01T00:00:00.000Z",
    summaryNotAfter: "2026-01-01T00:00:00.000Z",
  } satisfies Record<string, string>;
  const summary = readSummaryFromMetadata(meta);
  assert(summary);
  assert.equal(summary.kind, "certificate");
  assert.equal(summary.displayName, "Leaf Certificate");
  assert.equal(summary.subjectCommonName, "Leaf Certificate");
  assert.equal(summary.issuerCommonName, "Test Root CA");
  assert.equal(summary.notBefore, "2025-01-01T00:00:00.000Z");
  assert.equal(summary.notAfter, "2026-01-01T00:00:00.000Z");
  assert.equal(summary.thisUpdate, null);
  assert.equal(summary.isDelta, null);
});

test("readSummaryFromMetadata infers kind when missing", () => {
  const summary = readSummaryFromMetadata({
    summarySubjectCN: "Leaf Certificate",
    summaryIssuerCN: "Test Root CA",
    summaryNextUpdate: "2025-10-01T00:00:00.000Z",
  });
  assert(summary);
  assert.equal(summary.kind, "crl");
  assert.equal(summary.displayName, "Leaf Certificate");
  assert.equal(summary.nextUpdate, "2025-10-01T00:00:00.000Z");
});

test("buildSummaryMetadata rolls new fields into base metadata", () => {
  const summary = {
    kind: "certificate" as const,
    displayName: "Leaf Certificate",
    subjectCommonName: "Leaf Certificate",
    issuerCommonName: "Test Root CA",
    notBefore: "2025-01-01T00:00:00.000Z",
    notAfter: "2026-01-01T00:00:00.000Z",
    thisUpdate: null,
    nextUpdate: null,
    isDelta: null,
  };
  const metadata = buildSummaryMetadata(summary, {
    foo: "bar",
    baz: undefined,
  });
  assert.equal(metadata.summaryVersion, SUMMARY_VERSION);
  assert.equal(metadata.summaryObjectType, "certificate");
  assert.equal(metadata.summaryDisplayName, "Leaf Certificate");
  assert.equal(metadata.summarySubjectCN, "Leaf Certificate");
  assert.equal(metadata.summaryIssuerCN, "Test Root CA");
  assert.equal(metadata.summaryNotBefore, "2025-01-01T00:00:00.000Z");
  assert.equal(metadata.foo, "bar");
  assert(!("baz" in metadata));
});

test("mergeSummaryWithMetadata overlays summary keys", () => {
  const base = { existing: "value" };
  const summary = {
    kind: "crl" as const,
    displayName: "Test Root CA CRL",
    subjectCommonName: null,
    issuerCommonName: "Test Root CA",
    notBefore: null,
    notAfter: null,
    thisUpdate: "2025-09-27T00:00:00.000Z",
    nextUpdate: "2025-09-28T00:00:00.000Z",
    isDelta: false,
  };
  const merged = mergeSummaryWithMetadata(base, summary)!;
  assert.equal(merged.existing, "value");
  assert.equal(merged.summaryDisplayName, "Test Root CA CRL");
  assert.equal(merged.summaryIssuerCN, "Test Root CA");
  assert.equal(merged.summaryThisUpdate, "2025-09-27T00:00:00.000Z");
  assert.equal(merged.summaryNextUpdate, "2025-09-28T00:00:00.000Z");
  assert.equal(merged.summaryIsDelta, "false");
});

test("summaryToPayload normalises summary output", () => {
  assert.equal(summaryToPayload(null), null);
  const payload = summaryToPayload({
    kind: "certificate",
    displayName: "Leaf Certificate",
    subjectCommonName: "Leaf Certificate",
    issuerCommonName: "Test Root CA",
    notBefore: "2025-01-01T00:00:00.000Z",
    notAfter: "2026-01-01T00:00:00.000Z",
    thisUpdate: null,
    nextUpdate: null,
    isDelta: null,
  });
  assert(payload);
  assert.deepEqual(payload, {
    kind: "certificate",
    displayName: "Leaf Certificate",
    subjectCommonName: "Leaf Certificate",
    issuerCommonName: "Test Root CA",
    notBefore: "2025-01-01T00:00:00.000Z",
    notAfter: "2026-01-01T00:00:00.000Z",
    thisUpdate: null,
    nextUpdate: null,
    isDelta: null,
  });
});

test("ensureSummaryMetadata parses certificate and writes metadata", async () => {
  const pem = await readFile(CERT_PEM_URL);
  const bytes = Uint8Array.from(pem);
  const object = new MockR2Object(bytes, { foo: "bar" });
  const bucket = new MockBucket(object);
  const env = createEnv(bucket);

  const summary = await ensureSummaryMetadata({
    env,
    key: "ca/test-leaf.cert.pem",
    kind: "certificate",
    existingMeta: { foo: "bar" },
    expectedEtag: '"etag-value"',
  });

  assert(summary);
  assert.equal(summary.kind, "certificate");
  assert.equal(summary.displayName, "Leaf Certificate");
  assert.equal(summary.subjectCommonName, "Leaf Certificate");
  assert.equal(summary.issuerCommonName, "Test Root CA");
  assert(summary.notBefore);
  assert(summary.notAfter);

  assert(bucket.lastPut);
  assert.equal(bucket.lastPut?.key, "ca/test-leaf.cert.pem");
  assert(bucket.lastPut?.options.customMetadata);
  const metadata = bucket.lastPut?.options.customMetadata ?? {};
  assert.equal(metadata.summaryVersion, SUMMARY_VERSION);
  assert.equal(metadata.summaryDisplayName, "Leaf Certificate");
  assert.equal(metadata.foo, "bar");
  assert(bucket.lastPut?.options.onlyIf);
  assert.equal(bucket.lastPut?.options.onlyIf?.etagMatches, "etag-value");
});
