import {
  createHexValue,
  createInlinePairs,
  createMonoValue,
  createSection,
  formatAlgorithm,
  formatDateWithRelative,
  formatDigest,
  formatNumber,
  formatOpensslDate,
} from "../../formatters.js";
import { describeCrlStatus, renderStatusDisplay } from "./status.js";
import { buildExtensionsSection } from "./extensions.js";
import { buildIdentitySection } from "./certificate.js";

function buildCrlSummary(summary, validity, numbers, nextUpdateStatus, isDelta) {
  if (!summary && !validity) return null;
  const rows = [];
  if (summary?.issuerCommonName) rows.push({ label: "Issuer", value: summary.issuerCommonName });
  const crlNumber = numbers?.crlNumber ?? summary?.crlNumber ?? null;
  if (crlNumber) rows.push({ label: "CRL number", value: crlNumber });
  if (numbers?.baseCRLNumber) rows.push({ label: "Base CRL number", value: numbers.baseCRLNumber });
  const thisUpdate = validity?.thisUpdate ?? null;
  const nextUpdate = validity?.nextUpdate ?? null;
  rows.push({ label: "This update", value: formatOpensslDate(thisUpdate) });
  rows.push({ label: "Next update", value: formatDateWithRelative(nextUpdate, nextUpdateStatus?.daysUntil, nextUpdateStatus?.secondsUntil) });
  const entryCount = typeof summary?.entryCount === "number" ? formatNumber(summary.entryCount) : summary?.entryCount;
  if (entryCount !== undefined && entryCount !== null) rows.push({ label: "Entries", value: entryCount });
  if (typeof isDelta === "boolean") rows.push({ label: "Type", value: isDelta ? "Delta" : "Base" });
  const statusDescriptor = describeCrlStatus(nextUpdateStatus, isDelta);
  if (statusDescriptor) rows.push({ label: "Status", value: renderStatusDisplay(statusDescriptor, { detailed: true }) });
  return createSection("Overview", rows);
}

function buildCrlEntriesSection(entries) {
  if (!entries) return null;
  const rows = [{ label: "Total", value: typeof entries.count === "number" ? formatNumber(entries.count) : entries.count }];
  if (entries.count === 0) {
    rows.push({ label: "Sample", value: "No revoked certificates" });
  } else if (Array.isArray(entries.sample) && entries.sample.length) {
    const lines = entries.sample.map(entry => {
      const serialParts = [];
      if (entry.serialNumberHex) {
        try {
          const decimal = BigInt(`0x${entry.serialNumberHex}`).toString(10);
          serialParts.push(decimal);
        } catch (error) {
          console.warn("serialNumber decimal conversion failed", error);
        }
        serialParts.push(`0x${entry.serialNumberHex.toUpperCase()}`);
      }
      const when = formatOpensslDate(entry.revocationDate);
      const reason = entry.reason ? `reason: ${entry.reason}` : null;
      return [
        serialParts.length ? `Serial: ${serialParts.join(" / ")}` : null,
        when ? `Revoked: ${when}` : null,
        reason,
      ]
        .filter(Boolean)
        .join(" — ");
    });
    rows.push({ label: "Sample", value: lines });
  }
  return createSection("Revoked Certificates", rows);
}

export function buildCrlSections(details, nextUpdateStatus) {
  if (!details) return [];
  const sections = [];
  const summarySection = buildCrlSummary(details.summary, details.validity, details.numbers, nextUpdateStatus, details.isDelta);
  if (summarySection) sections.push(summarySection);
  const identitySection = buildIdentitySection(null, details.issuer);
  if (identitySection) sections.push(identitySection);
  if (details.authorityKeyIdentifier) {
    const keyIdentifierText = formatDigest(details.authorityKeyIdentifier) ?? details.authorityKeyIdentifier;
    const keyIdentifierDisplay = createMonoValue(keyIdentifierText) ?? keyIdentifierText;
    const akiSection = createSection("Authority key identifier", [
      { label: "Key identifier", value: keyIdentifierDisplay },
    ]);
    if (akiSection) sections.push(akiSection);
  }
  if (details.fingerprints) {
    const fingerprintPairs = Object.entries(details.fingerprints)
      .filter(([, hex]) => !!hex)
      .map(([algo, hex]) => ({
        label: algo.toUpperCase(),
        value: formatDigest(hex) ?? hex,
        valueClass: "detail-inline-pair__value--mono",
      }));
    const fingerprintNode = createInlinePairs(fingerprintPairs);
    if (fingerprintNode) {
      const fingerprintsSection = createSection("CRL fingerprints", [{ label: "Fingerprints", value: fingerprintNode }]);
      if (fingerprintsSection) sections.push(fingerprintsSection);
    }
  }
  if (details.signature) {
    const signatureSection = createSection("Signature", [
      { label: "Algorithm", value: formatAlgorithm(details.signature.algorithm) },
      {
        label: "Value",
        value: createHexValue(details.signature.valueHex, { summary: "Signature", bitLength: details.signature.bitLength, bytesPerRow: 18 }),
      },
    ]);
    if (signatureSection) sections.push(signatureSection);
  }
  const entriesSection = buildCrlEntriesSection(details.entries);
  if (entriesSection) sections.push(entriesSection);
  const extensionsSection = buildExtensionsSection(details.extensions);
  if (extensionsSection) sections.push(extensionsSection);
  return sections;
}
