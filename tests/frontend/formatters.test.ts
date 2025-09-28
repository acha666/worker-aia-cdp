/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

import {
  createHexValue,
  formatDateSummary,
  formatNumber,
  formatOpensslDate,
  formatRelativeSeconds,
  formatSerial,
  renderValue,
} from "../../public/js/formatters.js";

const { window } = parseHTML("<!doctype html><html><body></body></html>");

globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Text = window.Text;
globalThis.CustomEvent = window.CustomEvent;

test("formatOpensslDate produces OpenSSL-style strings", () => {
  const formatted = formatOpensslDate("2024-09-15T12:34:56Z");
  assert.equal(formatted, "Sep 15 2024 12:34:56 UTC");
});

test("formatDateSummary separates timezone and relative text", () => {
  const summary = formatDateSummary("2025-09-28T01:00:00Z", 0, 3600, { precision: "second" });
  assert(summary);
  assert.equal(summary.baseText, "Sep 28 2025 01:00:00");
  assert.equal(summary.timezone, "UTC");
  assert.equal(summary.relativeText, "in 1h");
});

test("formatRelativeSeconds returns human friendly durations", () => {
  assert.equal(formatRelativeSeconds(90), "in 2m");
  assert.equal(formatRelativeSeconds(-3600), "1h ago");
  assert.equal(formatRelativeSeconds(0), "now");
});

test("formatNumber normalizes strings and numbers", () => {
  assert.equal(formatNumber(12345), "12,345");
  assert.equal(formatNumber("67890"), "67,890");
  assert.equal(formatNumber("not-a-number"), "not-a-number");
});

test("createHexValue returns inline code for short values", () => {
  const hexNode = createHexValue("AABBCC", { threshold: 8 });
  assert.equal(hexNode.tagName, "CODE");
  assert.equal(hexNode.className, "hex-inline");
  assert.equal(hexNode.textContent, "aa:bb:cc");
});

test("createHexValue generates expandable details for long values", () => {
  const longHex = "AA".repeat(64);
  const node = createHexValue(longHex, { summary: "Key", bitLength: 1024, threshold: 32, bytesPerRow: 8, previewBytes: 4 });
  assert(node instanceof window.HTMLElement);
  assert.equal(node.tagName, "DETAILS");
  assert.equal(node.className, "hex-toggle");
  const summary = node.querySelector("summary");
  assert(summary instanceof window.HTMLElement);
  const summaryText = summary.textContent ?? "";
  assert.equal(summaryText.includes("Key"), true);
  assert.equal(summaryText.includes("1024 bits"), true);
  assert.equal(summaryText.includes("aa:aa:aa:aa"), true);
  const pre = node.querySelector("pre");
  assert(pre instanceof window.HTMLElement);
  const preText = pre.textContent ?? "";
  assert.equal(preText.includes("aa:aa:aa:aa:aa:aa:aa:aa"), true);
});

test("formatSerial renders decimal and hex pairs", () => {
  const node = formatSerial({ hex: "0A46A242EAF2D833B7552DA70D66D81D435123A9" });
  assert(node instanceof window.HTMLElement);
  const text = node.textContent ?? "";
  assert.equal(text.includes("Decimal:"), true);
  assert.equal(text.includes("58665094833392972755419431325433790933314380713"), true);
  assert.equal(text.includes("Hex:"), true);
  assert.equal(text.includes("0x0A46A242EAF2D833B7552DA70D66D81D435123A9"), true);
});

test("renderValue handles arrays and skips falsy values", () => {
  const value = renderValue(["alpha", null, "", "beta"]);
  assert(value instanceof window.HTMLElement);
  assert.equal(value.tagName, "UL");
  const items = Array.from(value.querySelectorAll("li"));
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map(item => item.textContent ?? ""),
    ["alpha", "beta"],
  );
});
