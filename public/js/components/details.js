import {
  formatOpensslDate,
  formatRelativeDays,
  formatRelativeSeconds,
  formatNumber,
  formatBytes,
  formatAlgorithm,
  createMuted,
  formatDigest,
  createHexValue,
  createInlinePairs,
  renderValue,
  createSection,
  formatSerial,
  formatDateWithRelative,
} from "../formatters.js";

export function computeTemporalStatus(iso) {
  if (!iso) return { secondsUntil: null, daysUntil: null, isExpired: null };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { secondsUntil: null, daysUntil: null, isExpired: null };
  const diffMs = date.getTime() - Date.now();
  const secondsUntil = Math.floor(diffMs / 1000);
  const daysUntil = Math.floor(secondsUntil / 86400);
  return {
    secondsUntil,
    daysUntil,
    isExpired: diffMs < 0,
  };
}

function createChip(text, { category = "status", tone = "neutral" } = {}) {
  if (!text) return null;
  const span = document.createElement("span");
  const safeCategory = category.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "status";
  const safeTone = tone.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "neutral";
  span.className = `detail-chip detail-chip--${safeCategory} detail-chip--${safeCategory}-${safeTone}`;
  span.textContent = text;
  return span;
}

function createMetric(label, value) {
  if (!label) return null;
  if (value === null || value === undefined || value === "") return null;
  const metric = document.createElement("div");
  metric.className = "detail-metric";
  const name = document.createElement("span");
  name.className = "detail-metric__label";
  name.textContent = label;
  metric.append(name);
  const content = document.createElement("span");
  content.className = "detail-metric__value";
  if (value instanceof Node) content.append(value);
  else content.textContent = typeof value === "string" ? value : String(value);
  metric.append(content);
  return metric;
}

export function describeCertificateStatus(expiryStatus, options = {}) {
  if (!expiryStatus || typeof expiryStatus.isExpired !== "boolean") return null;
  const { soonThresholdDays = 30 } = options;
  const rel = formatRelativeDays(expiryStatus.daysUntil) ?? formatRelativeSeconds(expiryStatus.secondsUntil);
  if (expiryStatus.isExpired) {
    return { label: "Expired", variant: "danger", description: rel ?? "Expired" };
  }
  if (typeof expiryStatus.daysUntil === "number" && Number.isFinite(expiryStatus.daysUntil) && expiryStatus.daysUntil <= soonThresholdDays) {
    return { label: "Expiring soon", variant: "warning", description: rel ?? null };
  }
  return { label: "Active", variant: "success", description: rel ?? null };
}

export function describeCrlStatus(nextUpdateStatus, isDelta, options = {}) {
  if (!nextUpdateStatus || typeof nextUpdateStatus.isExpired !== "boolean") return null;
  const { warningThresholdDays = 1 } = options;
  const rel = formatRelativeDays(nextUpdateStatus.daysUntil) ?? formatRelativeSeconds(nextUpdateStatus.secondsUntil);
  if (nextUpdateStatus.isExpired) {
    return { label: "Stale", variant: "danger", description: rel ?? "Next update overdue" };
  }
  if (typeof nextUpdateStatus.daysUntil === "number" && Number.isFinite(nextUpdateStatus.daysUntil) && nextUpdateStatus.daysUntil <= warningThresholdDays) {
    return { label: "Updating soon", variant: "warning", description: rel ?? null };
  }
  return { label: isDelta ? "Delta current" : "Current", variant: "success", description: rel ?? null };
}

export function renderStatusDisplay(descriptor, { detailed = false } = {}) {
  if (!descriptor) return null;
  if (!detailed) return createChip(descriptor.label, { category: "status", tone: descriptor.variant ?? "neutral" });
  const wrapper = document.createElement("div");
  wrapper.className = "detail-status";
  const chip = createChip(descriptor.label, { category: "status", tone: descriptor.variant ?? "neutral" });
  if (chip) wrapper.append(chip);
  if (descriptor.description) {
    const meta = document.createElement("span");
    meta.className = "detail-status__note";
    meta.textContent = descriptor.description;
    wrapper.append(meta);
  }
  return wrapper.childElementCount ? wrapper : chip;
}

function buildMetaSection(resource) {
  if (!resource || typeof resource !== "object") return null;
  const attrs = resource.attributes ?? {};
  const metrics = [];
  if (typeof attrs.size === "number" && Number.isFinite(attrs.size)) {
    const human = formatBytes(attrs.size);
    const bytes = formatNumber(attrs.size);
    const value = human ? `${human} (${bytes} bytes)` : `${bytes} bytes`;
    const metric = createMetric("Size", value);
    if (metric) metrics.push(metric);
  } else if (attrs.size !== null && attrs.size !== undefined) {
    const metric = createMetric("Size", String(attrs.size));
    if (metric) metrics.push(metric);
  }
  if (attrs.uploadedAt) {
    const when = formatOpensslDate(attrs.uploadedAt);
    const rel = formatRelativeSeconds((new Date(attrs.uploadedAt).getTime() - Date.now()) / 1000);
    const metric = createMetric("Uploaded", rel ? `${when} (${rel})` : when);
    if (metric) metrics.push(metric);
  }
  if (attrs.etag) {
    const metric = createMetric("ETag", attrs.etag);
    if (metric) metrics.push(metric);
  }
  if (!metrics.length) return null;
  const container = document.createElement("div");
  container.className = "detail-metrics";
  metrics.forEach(metric => container.append(metric));
  return container;
}

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
    const formatLabel = (attr) => {
      if (attr?.name) {
        return attr.name
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, char => char.toUpperCase())
          .replace(/\bOf\b/g, "of")
          .replace(/\bOr\b/g, "or");
      }
      if (attr?.shortName) return attr.shortName;
      return attr?.oid ?? "";
    };
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

function buildIdentitySection(subject, issuer) {
  const blocks = [];
  const subjectBlock = createNameBlock("Subject", subject);
  if (subjectBlock) blocks.push(subjectBlock);
  const issuerBlock = createNameBlock("Issuer", issuer);
  if (issuerBlock) blocks.push(issuerBlock);
  if (!blocks.length) return null;
  const section = document.createElement("div");
  section.className = "detail-section detail-section--composite";
  const heading = document.createElement("h3");
  heading.textContent = blocks.length === 2 ? "Identity" : (subjectBlock ? "Subject" : "Issuer");
  section.append(heading);
  const grid = document.createElement("div");
  grid.className = "detail-composite-grid";
  blocks.forEach(block => grid.append(block));
  section.append(grid);
  return section;
}

function describeBasicConstraints(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical", `CA: ${data.isCA ? "TRUE" : "FALSE"}`];
  if (data.pathLenConstraint !== null && data.pathLenConstraint !== undefined) {
    lines.push(`pathLenConstraint: ${data.pathLenConstraint}`);
  }
  return lines;
}

function describeKeyUsage(data) {
  if (!data) return null;
  // If it's already an array of usages, return it directly
  if (Array.isArray(data)) return data.length ? data : null;

  // If it's an object of boolean flags, map to human-friendly labels
  if (typeof data === "object") {
    const mapping = {
      digitalSignature: "Digital Signature",
      nonRepudiation: "Non Repudiation",
      keyEncipherment: "Key Encipherment",
      dataEncipherment: "Data Encipherment",
      keyAgreement: "Key Agreement",
      keyCertSign: "Certificate Signing",
      cRLSign: "CRL Signing",
      encipherOnly: "Encipher Only",
      decipherOnly: "Decipher Only",
    };
    const items = Object.entries(mapping)
      .filter(([key]) => !!data[key])
      .map(([, label]) => label);
    return items.length ? items : null;
  }

  return null;
}

function describeExtendedKeyUsage(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  if (Array.isArray(data.usages) && data.usages.length) lines.push(`usages: ${data.usages.join(", ")}`);
  if (Array.isArray(data.oids) && data.oids.length) lines.push(`oids: ${data.oids.join(", ")}`);
  if (Array.isArray(data.other) && data.other.length) lines.push(...data.other.map(item => `${item.oid ?? "other"}: ${item.value ?? ""}`.trim()));
  return lines.length ? lines : null;
}

function describeSubjectAltName(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  const addList = (label, values) => {
    if (Array.isArray(values) && values.length) lines.push(`${label}: ${values.join(", ")}`);
  };
  addList("DNS", data.dnsNames);
  addList("Email", data.emailAddresses);
  addList("IP", data.ipAddresses);
  addList("URI", data.uris);
  if (Array.isArray(data.directoryNames) && data.directoryNames.length) {
    lines.push(...data.directoryNames.map(entry => `DirName: ${entry.dn ?? entry}`));
  }
  if (Array.isArray(data.registeredIds) && data.registeredIds.length) lines.push(`Registered IDs: ${data.registeredIds.join(", ")}`);
  if (Array.isArray(data.otherNames) && data.otherNames.length) {
    lines.push(...data.otherNames.map(entry => `OtherName ${entry.oid}: ${formatDigest(entry.valueHex) ?? entry.valueHex ?? ""}`.trim()));
  }
  return lines.length ? lines : null;
}

function describeAuthorityInfoAccess(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  if (Array.isArray(data.ocsp) && data.ocsp.length) lines.push(`OCSP: ${data.ocsp.join(", ")}`);
  if (Array.isArray(data.caIssuers) && data.caIssuers.length) lines.push(`CA Issuers: ${data.caIssuers.join(", ")}`);
  if (Array.isArray(data.other) && data.other.length) {
    for (const entry of data.other) {
      const method = entry.method ?? "method";
      if (Array.isArray(entry.locations) && entry.locations.length) {
        lines.push(`${method}: ${entry.locations.join(", ")}`);
      }
    }
  }
  return lines.length ? lines : null;
}

function describeCRLDP(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  if (Array.isArray(data.urls) && data.urls.length) lines.push(`URLs: ${data.urls.join(", ")}`);
  if (Array.isArray(data.directoryNames) && data.directoryNames.length) lines.push(`Directory Names: ${data.directoryNames.join(", ")}`);
  return lines.length ? lines : null;
}

function describeCertificatePolicies(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  if (Array.isArray(data.items) && data.items.length) {
    for (const item of data.items) {
      const qualifierText = Array.isArray(item.qualifiers) && item.qualifiers.length
        ? ` [${item.qualifiers.map(q => `${q.oid}${q.value ? `=${q.value}` : ""}`).join(", ")}]`
        : "";
      lines.push(`${item.oid}${qualifierText}`);
    }
  }
  return lines.length ? lines : null;
}

function describeAuthorityKeyIdentifier(data) {
  if (!data) return null;
  if (typeof data === "string") return [data];
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  if (data.keyIdentifier) lines.push(`keyIdentifier: ${formatDigest(data.keyIdentifier) ?? data.keyIdentifier}`);
  if (Array.isArray(data.authorityCertIssuer) && data.authorityCertIssuer.length) lines.push(`authorityCertIssuer: ${data.authorityCertIssuer.join(", ")}`);
  if (data.authorityCertSerialNumber) lines.push(`authorityCertSerialNumber: 0x${String(data.authorityCertSerialNumber).toUpperCase()}`);
  return lines.length ? lines : null;
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
    const curve = publicKey.curveName && publicKey.curveOid && publicKey.curveName !== publicKey.curveOid
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

  if (details.extensions?.subjectKeyIdentifier) {
    rows.push({ label: "Subject key identifier", value: formatDigest(details.extensions.subjectKeyIdentifier) });
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

function describeExtensionPresence(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const items = entries
    .map(ext => {
      const label = ext?.name ? `${ext.name} (${ext.oid})` : ext?.oid;
      if (!label) return null;
      return ext?.critical ? `${label} (critical)` : label;
    })
    .filter(Boolean);
  return items.length ? items : null;
}

function decorateExtensionValue(value) {
  if (!value) return value;
  if (Array.isArray(value) && value.length) {
    const [first, ...rest] = value;
    if (typeof first === "string") {
      const normalized = first.toLowerCase();
      if (normalized === "critical" || normalized === "not critical") {
        const container = document.createElement("div");
        container.className = "detail-extension";
        const chip = createChip(normalized === "critical" ? "Critical" : "Not critical", {
          category: "extension",
          tone: normalized === "critical" ? "danger" : "neutral",
        });
        if (chip) container.append(chip);
        if (rest.length) {
          const remainder = renderValue(rest, true);
          if (remainder) {
            remainder.classList?.add?.("detail-extension__list");
            container.append(remainder);
          }
        }
        return container.childElementCount ? container : chip;
      }
    }
  }
  return value;
}

function buildExtensionsSection(extensions) {
  if (!extensions) return null;
  const rows = [];
  const addRow = (label, rawValue) => {
    if (!rawValue) return;
    const value = decorateExtensionValue(rawValue);
    if (value) rows.push({ label, value });
  };
  addRow("Basic Constraints", describeBasicConstraints(extensions.basicConstraints));
  addRow("Key Usage", describeKeyUsage(extensions.keyUsage));
  addRow("Extended Key Usage", describeExtendedKeyUsage(extensions.extendedKeyUsage));
  addRow("Subject Alternative Name", describeSubjectAltName(extensions.subjectAltName));
  const aia = describeAuthorityInfoAccess(extensions.authorityInfoAccess);
  addRow("Authority Information Access", aia);
  const crldp = describeCRLDP(extensions.crlDistributionPoints);
  addRow("CRL Distribution Points", crldp);
  addRow("Certificate Policies", describeCertificatePolicies(extensions.certificatePolicies));
  if (extensions.subjectKeyIdentifier) {
    rows.push({ label: "Subject Key Identifier", value: formatDigest(extensions.subjectKeyIdentifier) });
  }
  const authorityKeyIdentifier = describeAuthorityKeyIdentifier(extensions.authorityKeyIdentifier);
  if (authorityKeyIdentifier) rows.push({ label: "Authority Key Identifier", value: decorateExtensionValue(authorityKeyIdentifier) });
  const present = describeExtensionPresence(extensions.present);
  if (present) rows.push({ label: "Present Extensions", value: present });
  return rows.length ? createSection("Extensions", rows) : null;
}

function buildCertificateSections(details, expiryStatus) {
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
  const rows = [
    { label: "Total", value: typeof entries.count === "number" ? formatNumber(entries.count) : entries.count },
  ];
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
      ].filter(Boolean).join(" — ");
    });
    rows.push({ label: "Sample", value: lines });
  }
  return createSection("Revoked Certificates", rows);
}

function buildCrlExtensionsSection(extensions) {
  if (!Array.isArray(extensions) || extensions.length === 0) return null;
  const present = describeExtensionPresence(extensions);
  if (!present) return null;
  return createSection("Extensions", [{ label: "Present", value: present }]);
}

function buildCrlSections(details, nextUpdateStatus) {
  if (!details) return [];
  const sections = [];
  const summarySection = buildCrlSummary(details.summary, details.validity, details.numbers, nextUpdateStatus, details.isDelta);
  if (summarySection) sections.push(summarySection);
  const identitySection = buildIdentitySection(null, details.issuer);
  if (identitySection) sections.push(identitySection);
  if (details.authorityKeyIdentifier) {
    const akiSection = createSection("Authority key identifier", [
      { label: "Key identifier", value: formatDigest(details.authorityKeyIdentifier) ?? details.authorityKeyIdentifier },
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
      const fingerprintsSection = createSection("CRL fingerprints", [
        { label: "Fingerprints", value: fingerprintNode },
      ]);
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
  const extensionsSection = buildCrlExtensionsSection(details.extensions);
  if (extensionsSection) sections.push(extensionsSection);
  return sections;
}

function buildUnknownSection(payload) {
  const pre = document.createElement("pre");
  pre.className = "detail-raw";
  pre.textContent = JSON.stringify(payload, null, 2);
  return pre;
}

export function buildDetailView(resource) {
  const article = document.createElement("article");
  article.className = "detail-view";
  const attrs = resource?.attributes ?? {};
  if (attrs.objectType) article.dataset.type = attrs.objectType;

  const header = document.createElement("div");
  header.className = "detail-header";

  const chipRow = document.createElement("div");
  chipRow.className = "detail-chip-row";
  const typeTitle = attrs.objectType === "certificate"
    ? "Certificate"
    : attrs.objectType === "crl"
      ? "Certificate Revocation List"
      : "Object";
  const chipLabel = attrs.objectType === "certificate"
    ? "Certificate"
    : attrs.objectType === "crl"
      ? (attrs.crl?.isDelta ? "Delta CRL" : "CRL")
      : "Object";
  const typeTone = attrs.objectType === "certificate"
    ? "certificate"
    : attrs.objectType === "crl"
      ? (attrs.crl?.isDelta ? "delta" : "crl")
      : "neutral";
  const typeChip = createChip(chipLabel, { category: "type", tone: typeTone });
  if (typeChip) chipRow.append(typeChip);

  let certificateExpiryStatus = null;
  let crlUpdateStatus = null;
  let statusDescriptor = null;
  if (attrs.objectType === "certificate" && attrs.certificate) {
    const expirySource = attrs.certificate.validity?.notAfter ?? attrs.certificate.summary?.notAfter ?? null;
    certificateExpiryStatus = computeTemporalStatus(expirySource);
    statusDescriptor = describeCertificateStatus(certificateExpiryStatus);
  } else if (attrs.objectType === "crl" && attrs.crl) {
    const nextUpdateSource = attrs.crl.validity?.nextUpdate ?? null;
    crlUpdateStatus = computeTemporalStatus(nextUpdateSource);
    statusDescriptor = describeCrlStatus(crlUpdateStatus, attrs.crl.isDelta);
  }

  const statusChip = renderStatusDisplay(statusDescriptor, { detailed: false });
  if (statusChip) chipRow.append(statusChip);
  if (chipRow.childElementCount) header.append(chipRow);

  const title = document.createElement("div");
  title.className = "detail-title";
  title.textContent = typeTitle;
  header.append(title);

  let highlightValue = null;
  if (attrs.objectType === "certificate") highlightValue = attrs.certificate?.summary?.subjectCommonName ?? null;
  else if (attrs.objectType === "crl") highlightValue = attrs.crl?.summary?.issuerCommonName ?? null;
  if (highlightValue) {
    const highlight = document.createElement("div");
    highlight.className = "detail-highlight";
    highlight.textContent = highlightValue;
    header.append(highlight);
  }

  const pathValue = attrs.path ?? (resource?.id ? `/${resource.id}` : null);
  if (pathValue) {
    const path = document.createElement("div");
    path.className = "detail-subtitle";
    path.textContent = pathValue;
    header.append(path);
  }

  const metaSection = buildMetaSection(resource);
  if (metaSection) header.append(metaSection);

  article.append(header);

  if (attrs.objectType === "certificate" && attrs.certificate) {
    const certSections = buildCertificateSections(attrs.certificate, certificateExpiryStatus);
    certSections.forEach(section => article.append(section));
  } else if (attrs.objectType === "crl" && attrs.crl) {
    const crlSections = buildCrlSections(attrs.crl, crlUpdateStatus);
    crlSections.forEach(section => article.append(section));
  } else if (attrs.parseError) {
    article.append(createSection("Parse Error", [
      { label: "Message", value: attrs.parseError.message },
    ]) ?? buildUnknownSection(attrs.parseError));
  } else {
    article.append(buildUnknownSection(attrs));
  }

  return article;
}
