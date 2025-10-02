/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

import { buildExtensionsSection } from "../../frontend/src/components/details/extensions.js";

const { window } = parseHTML("<!doctype html><html><body></body></html>");

globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;

test("buildExtensionsSection renders extension cards with metadata", () => {
  const section = buildExtensionsSection([
    {
      oid: "2.5.29.19",
      name: "Basic Constraints",
      critical: true,
      status: "parsed",
      value: {
        isCA: true,
        pathLenConstraint: 0,
      },
    },
    {
      oid: "1.2.3.4",
      name: null,
      critical: false,
      status: "unparsed",
      rawHex: "aabbccdd",
    },
  ]);

  assert(section);
  assert.equal(section?.querySelector("h3")?.textContent, "Extensions");
  const cards = section?.querySelectorAll(".detail-extension-card") ?? [];
  assert.equal(cards.length, 2);

  const [firstCard, secondCard] = cards;
  assert(firstCard);
  const title = firstCard.querySelector(".detail-extension-card__title");
  assert.equal(title?.textContent, "Basic Constraints");
  const oid = firstCard.querySelector(".detail-extension-card__oid");
  assert.equal(oid?.textContent, "2.5.29.19");
  const criticalFlag = firstCard.querySelector(".detail-extension-flag--critical");
  assert(criticalFlag, "critical flag should be rendered next to header");

  const listItems = Array.from(firstCard.querySelectorAll(".detail-list li"));
  assert(listItems.length > 0, "parsed extensions should render list values");

  assert(secondCard);
  const secondMessage = secondCard.querySelector(".detail-extension-card__message");
  assert(secondMessage, "unparsed extensions should show status message");
});

test("buildExtensionsSection returns null for empty input", () => {
  assert.equal(buildExtensionsSection([]), null);
  assert.equal(buildExtensionsSection(null), null);
});
