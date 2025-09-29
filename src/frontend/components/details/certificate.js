import {
  createHexValue,
  createInlinePairs,
  createMonoValue,
  createSection,
  formatAlgorithm,
  formatDateWithRelative,
  formatDigest,
  formatOpensslDate,
  formatSerial,
} from "../../formatters.js";
import { describeCertificateStatus, renderStatusDisplay } from "./status.js";
import { buildExtensionsSection } from "./extensions.js";

function buildCertificateSummary(summary, validity, serialNumberHex, expiryStatus) {
  if (!summary && !validity) return null;
  const rows = [];
  if (summary?.subjectCommonName) rows.push({ label: "Subject", value: summary.subjectCommonName });
  if (summary?.issuerCommonName) rows.push({ label: "Issuer", value: summary.issuerCommonName });
  if (serialNumberHex) rows.push({ label: "Serial (hex)", value: `0x${serialNumberHex.toUpperCase()}` });
  const notBefore = validity?.notBefore ?? summary?.notBefore ?? null;
  const notAfter = validity?.notAfter ?? summary?.notAfter ?? null;
  rows.push({ label: "Valid from", value: formatOpensslDate(notBefore) });
  rows.push({ label: "Valid until", value: formatDateWithRelative(notAfter, expiryStatus?.daysUntil, expiryStatus?.secondsUntil) });
  const statusDescriptor = describeCertificateStatus(expiryStatus);
  if (statusDescriptor) rows.push({ label: "Status", value: renderStatusDisplay(statusDescriptor, { detailed: true }) });
  return createSection("Overview", rows);
}

function formatLabel(attr) {
  if (attr?.name) {
    return attr.name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, char => char.toUpperCase())
      .replace(/\bOf\b/g, "of")
      .replace(/\bOr\b/g, "or");
  }
  if (attr?.shortName) return attr.shortName;
  return attr?.oid ?? "";
}

function createNameBlock(title, descriptor) {
  if (!descriptor) return null;
  const attributes = Array.isArray(descriptor.attributes) ? descriptor.attributes : [];
  const block = document.createElement("div");
  block.className = "detail-card";
  const heading = document.createElement("div");
  heading.className = "detail-card__title";
  heading.textContent = title;
  block.append(heading);
  if (attributes.length) {
    const list = document.createElement("dl");
    list.className = "detail-card__pairs";
    attributes.forEach(attr => {
      const dt = document.createElement("dt");
      dt.textContent = formatLabel(attr);
      const dd = document.createElement("dd");
      dd.textContent = attr.value;
      list.append(dt, dd);
    });
    block.append(list);
  }
  return block.childElementCount > 1 ? block : null;
}

function findExtensionByOid(extensions, oid) {
  if (!Array.isArray(extensions) || !oid) return null;
  return extensions.find(entry => entry && entry.oid === oid) ?? null;
}

function extractExtensionHex(entry) {
  if (!entry || entry.value === null || entry.value === undefined) return null;
  const { value } = entry;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.hex === "string") return value.hex;
  return null;
}

export function buildIdentitySection(subject, issuer) {
  const blocks = [];
  const subjectBlock = createNameBlock("Subject", subject);
  if (subjectBlock) blocks.push(subjectBlock);
  const issuerBlock = createNameBlock("Issuer", issuer);
  if (issuerBlock) blocks.push(issuerBlock);
  if (!blocks.length) return null;
  const section = document.createElement("div");
  section.className = "detail-section detail-section--composite";
  const heading = document.createElement("h3");
  heading.textContent = blocks.length === 2 ? "Identity" : subjectBlock ? "Subject" : "Issuer";
  section.append(heading);
  const grid = document.createElement("div");
  grid.className = "detail-composite-grid";
  blocks.forEach(block => grid.append(block));
  section.append(grid);
  return section;
}

function buildCertificateCryptoSection(details) {
  if (!details) return null;
  const rows = [];
  const publicKey = details.publicKey ?? {};

  if (publicKey.algorithm) rows.push({ label: "Public key algorithm", value: formatAlgorithm(publicKey.algorithm) });
  if (typeof publicKey.sizeBits === "number" && Number.isFinite(publicKey.sizeBits)) {
    rows.push({ label: "Key size", value: `${publicKey.sizeBits} bits` });
  }
  if (typeof publicKey.exponent === "number" && Number.isFinite(publicKey.exponent)) {
    rows.push({ label: "Exponent", value: publicKey.exponent });
  }
  if (publicKey.curveName || publicKey.curveOid) {
    const curve =
      publicKey.curveName && publicKey.curveOid && publicKey.curveName !== publicKey.curveOid
        ? `${publicKey.curveName} (${publicKey.curveOid})`
        : publicKey.curveName ?? publicKey.curveOid;
    rows.push({ label: "Curve", value: curve });
  }
  if (publicKey.fingerprints) {
    const pairs = Object.entries(publicKey.fingerprints)
      .filter(([, hex]) => !!hex)
      .map(([algo, hex]) => ({
        label: algo.toUpperCase(),
        value: formatDigest(hex) ?? hex,
        valueClass: "detail-inline-pair__value--mono",
      }));
    const fingerprintNode = createInlinePairs(pairs);
    if (fingerprintNode) rows.push({ label: "Public key fingerprints", value: fingerprintNode });
  }
  if (publicKey.modulusHex) {
    rows.push({
      label: "Modulus",
      value: createHexValue(publicKey.modulusHex, { summary: "Modulus", bitLength: publicKey.sizeBits, bytesPerRow: 16 }),
    });
  }
  if (publicKey.subjectPublicKeyHex) {
    rows.push({
      label: "Subject public key",
      value: createHexValue(publicKey.subjectPublicKeyHex, { summary: "Subject public key", bitLength: publicKey.sizeBits, bytesPerRow: 16 }),
    });
  }

  const subjectKeyExtension = findExtensionByOid(details.extensions, "2.5.29.14");
  const subjectKeyHex = extractExtensionHex(subjectKeyExtension);
  if (subjectKeyHex) {
    const subjectKeyText = formatDigest(subjectKeyHex) ?? subjectKeyHex;
    const display = createMonoValue(subjectKeyText) ?? subjectKeyText;
    rows.push({ label: "Subject key identifier", value: display });
  }
  if (details.fingerprints) {
    const pairs = Object.entries(details.fingerprints)
      .filter(([, hex]) => !!hex)
      .map(([algo, hex]) => ({
        label: algo.toUpperCase(),
        value: formatDigest(hex) ?? hex,
        valueClass: "detail-inline-pair__value--mono",
      }));
    const certificateFingerprints = createInlinePairs(pairs);
    if (certificateFingerprints) rows.push({ label: "Certificate fingerprints", value: certificateFingerprints });
  }
  if (details.signature) {
    rows.push({ label: "Signature algorithm", value: formatAlgorithm(details.signature.algorithm) });
    rows.push({
      label: "Signature",
      value: createHexValue(details.signature.valueHex, { summary: "Signature", bitLength: details.signature.bitLength, bytesPerRow: 18 }),
    });
  }
  return rows.length ? createSection("Cryptography", rows) : null;
}

export function buildCertificateSections(details, expiryStatus) {
  if (!details) return [];
  const sections = [];
  const summarySection = buildCertificateSummary(details.summary, details.validity, details.serialNumberHex, expiryStatus);
  if (summarySection) sections.push(summarySection);
  const identitySection = buildIdentitySection(details.subject, details.issuer);
  if (identitySection) sections.push(identitySection);
  const dataSection = createSection("Details", [
    { label: "Version", value: details.version ? `Version ${details.version} (0x${Math.max(0, details.version - 1).toString(16)})` : null },
    { label: "Serial number", value: formatSerial(details.serialNumberHex) },
  ]);
  if (dataSection) sections.push(dataSection);
  const cryptoSection = buildCertificateCryptoSection(details);
  if (cryptoSection) sections.push(cryptoSection);
  const extensionsSection = buildExtensionsSection(details.extensions);
  if (extensionsSection) sections.push(extensionsSection);
  return sections;
}
