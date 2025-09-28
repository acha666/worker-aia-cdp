/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

import {
  computeTemporalStatus,
  createChip,
  describeCertificateStatus,
  describeCrlStatus,
  renderStatusDisplay,
} from "../../public/js/components/details/status.js";

const { window } = parseHTML("<!doctype html><html><body></body></html>");

globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;

test("computeTemporalStatus returns offsets for future dates", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const status = computeTemporalStatus("2025-10-02T00:00:00Z");
    assert.equal(status.isExpired, false);
    assert.equal(status.daysUntil, 4);
  } finally {
    Date.now = originalNow;
  }
});

test("computeTemporalStatus marks expired timestamps", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const status = computeTemporalStatus("2025-09-20T00:00:00Z");
    assert.equal(status.isExpired, true);
    assert(status.daysUntil <= -8);
  } finally {
    Date.now = originalNow;
  }
});

test("createChip sanitises category and tone", () => {
  const chip = createChip("Active", { category: "Status!", tone: "Success+" });
  assert(chip instanceof window.HTMLElement);
  assert.equal(chip.className, "detail-chip detail-chip--status detail-chip--status-success");
  assert.equal(chip.textContent, "Active");
});

test("describeCertificateStatus categorises states", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const active = describeCertificateStatus(computeTemporalStatus("2025-11-01T00:00:00Z"));
    assert(active);
    assert.equal(active.label, "Active");
    assert.equal(active.variant, "success");

    const soon = describeCertificateStatus(computeTemporalStatus("2025-10-05T00:00:00Z"));
    assert(soon);
    assert.equal(soon.label, "Expiring soon");
    assert.equal(soon.variant, "warning");

    const expired = describeCertificateStatus(computeTemporalStatus("2025-09-20T00:00:00Z"));
    assert(expired);
    assert.equal(expired.label, "Expired");
    assert.equal(expired.variant, "danger");
  } finally {
    Date.now = originalNow;
  }
});

test("describeCrlStatus handles delta flags", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const current = describeCrlStatus(computeTemporalStatus("2025-10-01T00:00:00Z"), false);
    assert(current);
    assert.equal(current.label, "Current");
    assert.equal(current.variant, "success");

    const delta = describeCrlStatus(computeTemporalStatus("2025-10-01T00:00:00Z"), true);
    assert(delta);
    assert.equal(delta.label, "Delta current");

    const stale = describeCrlStatus(computeTemporalStatus("2025-09-20T00:00:00Z"), false);
    assert(stale);
    assert.equal(stale.label, "Stale");
    assert.equal(stale.variant, "danger");
  } finally {
    Date.now = originalNow;
  }
});

test("renderStatusDisplay builds detailed layouts", () => {
  const descriptor = { label: "Active", variant: "success", description: "in 5 days" };
  const node = renderStatusDisplay(descriptor, { detailed: true });
  assert(node instanceof window.HTMLElement);
  assert.equal(node.className, "detail-status");
  const chip = node.querySelector(".detail-chip");
  assert(chip);
  expectText(chip, "Active");
  const note = node.querySelector(".detail-status__note");
  assert(note);
  expectText(note, "in 5 days");
});

function expectText(element: Element | null | undefined, expected: string) {
  assert.equal(element?.textContent, expected);
}
