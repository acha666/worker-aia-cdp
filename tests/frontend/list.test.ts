/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

import { renderCertificates, renderCrls, renderDeltaCrls } from "../../public/js/components/list.js";

const { window } = parseHTML("<!doctype html><html><body></body></html>");

globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;

test("renderCertificates builds list items with links", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const target = document.createElement("ul");
    renderCertificates(target, [
      {
        key: "ca/leaf.crt",
        summary: {
          displayName: "Leaf Certificate",
          notBefore: "2025-01-01T00:00:00Z",
          notAfter: "2026-01-01T00:00:00Z",
        },
        displayName: "Leaf Certificate",
        type: "certificate",
      },
      {
        key: "ca/leaf.crt.pem",
        summary: {
          displayName: "Leaf Certificate",
          notBefore: "2025-01-01T00:00:00Z",
          notAfter: "2026-01-01T00:00:00Z",
        },
        displayName: "Leaf Certificate",
        type: "certificate",
      },
    ]);

    const items = target.querySelectorAll("li.file-item");
    assert.equal(items.length, 1);
    const item = items[0];
    assert(item.classList.contains("file-item--certificate"));
    expectText(item.querySelector(".detail-title"), "Certificate");
    expectText(item.querySelector(".detail-highlight"), "Leaf Certificate");
    const badge = item.querySelector(".file-badge");
    expectText(badge, "Certificate");
    const links = Array.from(item.querySelectorAll(".file-link"));
    const hrefs = links.map(link => link.getAttribute("href"));
    assert.deepEqual(hrefs.sort(), ["/ca/leaf.crt", "/ca/leaf.crt.pem"].sort());
    const meta = item.querySelector(".file-meta");
    assert(meta);
    const metaText = meta.textContent ?? "";
    assert(metaText.includes("From"));
    assert(metaText.includes("Until"));
  const timezoneMatches = metaText.match(/UTC/g) ?? [];
  assert.equal(timezoneMatches.length, 1);
  assert.equal(/From[^·]+UTC/.test(metaText), false);
    const button = item.querySelector("button.btn-expand");
    assert(button);
    assert.equal(button.getAttribute("data-key"), "ca/leaf.crt");
  } finally {
    Date.now = originalNow;
  }
});

test("renderCrls filters archive prefixes and renders status", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const target = document.createElement("ul");
    renderCrls(target, [
      {
        key: "crl/archive/old.crl",
        summary: null,
      },
      {
        key: "crl/current.crl",
        summary: {
          displayName: "Root CRL",
          thisUpdate: "2025-09-20T00:00:00Z",
          nextUpdate: "2025-10-05T00:00:00Z",
          isDelta: false,
        },
        type: "crl",
      },
      {
        key: "crl/current.crl.pem",
        summary: {
          displayName: "Root CRL",
          thisUpdate: "2025-09-20T00:00:00Z",
          nextUpdate: "2025-10-05T00:00:00Z",
          isDelta: false,
        },
        type: "crl",
      },
    ]);

    const items = target.querySelectorAll("li.file-item");
    assert.equal(items.length, 1);
    const item = items[0];
    assert(item.classList.contains("file-item--crl"));
    expectText(item.querySelector(".file-badge"), "CRL");
    const meta = item.querySelector(".file-meta");
    assert(meta);
    const metaText = meta.textContent ?? "";
    assert(metaText.includes("Issued"));
    assert(metaText.includes("Next update"));
    const timezoneMatches = metaText.match(/UTC/g) ?? [];
    assert.equal(timezoneMatches.length, 1);
    assert.equal(/Issued[^·]+UTC/.test(metaText), false);
  } finally {
    Date.now = originalNow;
  }
});

test("renderDeltaCrls forces delta flag", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2025-09-28T00:00:00Z").getTime();
  try {
    const target = document.createElement("ul");
    renderDeltaCrls(target, [
      {
        key: "dcrl/current.crl",
        summary: {
          displayName: "Delta CRL",
          thisUpdate: "2025-09-25T00:00:00Z",
          nextUpdate: "2025-09-29T00:00:00Z",
          isDelta: null,
        },
      },
    ]);
    const item = target.querySelector("li.file-item");
    assert(item);
    assert(item.classList.contains("file-item--delta-crl"));
    expectText(item.querySelector(".file-badge"), "Delta CRL");
  } finally {
    Date.now = originalNow;
  }
});

function expectText(element: Element | null, expected: string) {
  assert.equal(element?.textContent, expected);
}
