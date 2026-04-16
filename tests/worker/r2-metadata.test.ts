/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SUMMARY_METADATA_KEYS,
  hasCertificateSummaryMetadata,
  hasCrlListMetadata,
  readCertificateSummaryMetadata,
  readCrlSummaryMetadata,
  readCustomMetadata,
  readFingerprintMetadata,
  readNextUpdateDate,
} from "../../src/worker/r2/metadata";

test("readCustomMetadata returns only string metadata values", () => {
  const metadata = readCustomMetadata({
    customMetadata: {
      issuerCN: "Example CA",
      revokedCount: "42",
      ignoredNumber: 123,
      ignoredBoolean: true,
    },
  });

  assert.deepEqual(metadata, {
    issuerCN: "Example CA",
    revokedCount: "42",
  });
});

test("hasCertificateSummaryMetadata detects summary keys", () => {
  assert.equal(hasCertificateSummaryMetadata(undefined), false);
  assert.equal(
    hasCertificateSummaryMetadata({
      [SUMMARY_METADATA_KEYS.subject]: "Leaf Cert",
    }),
    true
  );
});

test("readCertificateSummaryMetadata supports summary and legacy keys", () => {
  const summaryValues = readCertificateSummaryMetadata({
    summarySubjectCN: "Summary Subject",
    summaryIssuerCN: "Summary Issuer",
    summaryNotBefore: "2025-01-01T00:00:00.000Z",
    summaryNotAfter: "2026-01-01T00:00:00.000Z",
    serialNumber: "ABCD",
  });

  assert.deepEqual(summaryValues, {
    subjectCN: "Summary Subject",
    issuerCN: "Summary Issuer",
    notBefore: "2025-01-01T00:00:00.000Z",
    notAfter: "2026-01-01T00:00:00.000Z",
    serialNumber: "ABCD",
  });

  const legacyValues = readCertificateSummaryMetadata({
    subjectCN: "Legacy Subject",
    issuerCN: "Legacy Issuer",
    notBefore: "2024-01-01T00:00:00.000Z",
    notAfter: "2025-01-01T00:00:00.000Z",
  });

  assert.deepEqual(legacyValues, {
    subjectCN: "Legacy Subject",
    issuerCN: "Legacy Issuer",
    notBefore: "2024-01-01T00:00:00.000Z",
    notAfter: "2025-01-01T00:00:00.000Z",
    serialNumber: null,
  });
});

test("readCrlSummaryMetadata parses values and revoked count presence", () => {
  const values = readCrlSummaryMetadata({
    summaryIssuerCN: "Issuer A",
    summaryThisUpdate: "2025-09-01T00:00:00.000Z",
    summaryNextUpdate: "2025-09-02T00:00:00.000Z",
    crlNumber: "10",
    baseCRLNumber: "9",
    revokedCount: "3",
  });

  assert.deepEqual(values, {
    issuerCN: "Issuer A",
    crlNumber: "10",
    baseCrlNumber: "9",
    thisUpdate: "2025-09-01T00:00:00.000Z",
    nextUpdate: "2025-09-02T00:00:00.000Z",
    revokedCount: 3,
    hasRevokedCount: true,
  });

  const noRevocations = readCrlSummaryMetadata({
    issuerCN: "Issuer B",
  });

  assert.equal(noRevocations.revokedCount, 0);
  assert.equal(noRevocations.hasRevokedCount, false);
});

test("hasCrlListMetadata validates required CRL list fields", () => {
  const full = {
    summaryIssuerCN: "Issuer A",
    summaryThisUpdate: "2025-09-01T00:00:00.000Z",
    summaryNextUpdate: "2025-09-02T00:00:00.000Z",
    crlNumber: "10",
    revokedCount: "3",
  };

  assert.equal(hasCrlListMetadata(full), true);
  assert.equal(hasCrlListMetadata(full, { requireBaseCrlNumber: true }), false);

  const delta = {
    ...full,
    baseCRLNumber: "9",
  };
  assert.equal(hasCrlListMetadata(delta, { requireBaseCrlNumber: true }), true);

  assert.equal(
    hasCrlListMetadata({
      summaryIssuerCN: "Issuer A",
      summaryThisUpdate: "2025-09-01T00:00:00.000Z",
      summaryNextUpdate: "2025-09-02T00:00:00.000Z",
      crlNumber: "10",
    }),
    false
  );
});

test("readFingerprintMetadata returns defaults for missing values", () => {
  assert.deepEqual(readFingerprintMetadata(undefined), { sha1: "", sha256: "" });
  assert.deepEqual(readFingerprintMetadata({ fingerprintSha1: "a1", fingerprintSha256: "b2" }), {
    sha1: "a1",
    sha256: "b2",
  });
});

test("readNextUpdateDate parses valid and ignores invalid values", () => {
  const valid = readNextUpdateDate({ summaryNextUpdate: "2025-09-30T00:00:00.000Z" });
  assert(valid instanceof Date);
  assert.equal(valid?.toISOString(), "2025-09-30T00:00:00.000Z");

  assert.equal(readNextUpdateDate({ nextUpdate: "not-a-date" }), null);
  assert.equal(readNextUpdateDate(undefined), null);
});
