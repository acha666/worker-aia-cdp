import { createHexValue, createMuted, formatDigest, renderValue } from "../../formatters.js";

function describeBasicConstraints(data) {
  if (!data) return null;
  const lines = [`CA: ${data.isCA ? "TRUE" : "FALSE"}`];
  if (data.pathLenConstraint !== null && data.pathLenConstraint !== undefined) {
    lines.push(`pathLenConstraint: ${data.pathLenConstraint}`);
  }
  return lines;
}

function describeKeyUsage(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  if (typeof data !== "object") return null;
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
  const enabledFlags = Array.isArray(data.enabled)
    ? data.enabled
    : Object.entries(data.flags ?? {})
        .filter(([, value]) => !!value)
        .map(([key]) => key);
  const labels = enabledFlags.map(flag => mapping[flag] ?? flag);
  return labels.length ? labels : null;
}

function describeExtendedKeyUsage(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (Array.isArray(data.usages) && data.usages.length) lines.push(`usages: ${data.usages.join(", ")}`);
  if (Array.isArray(data.oids) && data.oids.length) lines.push(`oids: ${data.oids.join(", ")}`);
  if (Array.isArray(data.other) && data.other.length) {
    lines.push(...data.other.map(item => `${item.oid ?? "other"}${item.value ? `: ${item.value}` : ""}`.trim()));
  }
  return lines.length ? lines : null;
}

function describeSubjectAltName(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
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
  if (Array.isArray(data.registeredIds) && data.registeredIds.length) {
    lines.push(`Registered IDs: ${data.registeredIds.join(", ")}`);
  }
  if (Array.isArray(data.otherNames) && data.otherNames.length) {
    lines.push(...data.otherNames.map(entry => `OtherName ${entry.oid}: ${formatDigest(entry.valueHex) ?? entry.valueHex ?? ""}`.trim()));
  }
  return lines.length ? lines : null;
}

function describeAuthorityInfoAccess(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
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

function describeCRLDistributionPoints(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (Array.isArray(data.urls) && data.urls.length) lines.push(`URLs: ${data.urls.join(", ")}`);
  if (Array.isArray(data.directoryNames) && data.directoryNames.length) {
    lines.push(`Directory Names: ${data.directoryNames.join(", ")}`);
  }
  if (Array.isArray(data.distributionPoints) && data.distributionPoints.length) {
    data.distributionPoints.forEach((point, index) => {
      const parts = [];
      if (Array.isArray(point.urls) && point.urls.length) parts.push(`URLs: ${point.urls.join(", ")}`);
      if (Array.isArray(point.directoryNames) && point.directoryNames.length) parts.push(`Directory Names: ${point.directoryNames.join(", ")}`);
      if (parts.length) lines.push(`Point ${index + 1} — ${parts.join("; ")}`);
    });
  }
  return lines.length ? lines : null;
}

function describeCertificatePolicies(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (Array.isArray(data.items) && data.items.length) {
    for (const item of data.items) {
      const qualifierText = Array.isArray(item.qualifiers) && item.qualifiers.length
        ? ` [${item.qualifiers.map(q => `${q.oid}${q.value ? `=${q.value}` : ""}`).join(", " )}]`
        : "";
      lines.push(`${item.oid}${qualifierText}`);
    }
  }
  return lines.length ? lines : null;
}

function describeAuthorityKeyIdentifier(data) {
  if (!data || typeof data === "string") return null;
  const lines = [];
  if (Array.isArray(data.authorityCertIssuer) && data.authorityCertIssuer.length) {
    lines.push(`authorityCertIssuer: ${data.authorityCertIssuer.join(", ")}`);
  }
  if (data.authorityCertSerialNumber) {
    lines.push(`authorityCertSerialNumber: 0x${String(data.authorityCertSerialNumber).toUpperCase()}`);
  }
  return lines.length ? lines : null;
}

function renderList(lines) {
  if (!lines || !lines.length) return null;
  return renderValue(lines, true);
}

function extractHex(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.hex) return value.hex;
  return null;
}

function buildKeyIdentifierDisplay(hex, options = {}) {
  if (!hex) return null;
  const wrapper = document.createElement("div");
  wrapper.className = "detail-extension-card__hex";
  const hexNode = createHexValue(hex, {
    summary: options.summary ?? "Key identifier",
    bytesPerRow: options.bytesPerRow ?? 16,
    previewBytes: options.previewBytes ?? 18,
    threshold: options.threshold ?? 160,
  });
  if (hexNode) wrapper.append(hexNode);
  return wrapper.childElementCount ? wrapper : null;
}

function renderKeyIdentifier(value) {
  const hex = extractHex(value);
  if (!hex) return null;
  const content = document.createElement("div");
  content.className = "detail-extension-card__content";
  const display = buildKeyIdentifierDisplay(hex, { summary: "Key identifier" });
  if (display) content.append(display);
  return content.childElementCount ? content : null;
}

function renderAuthorityKeyIdentifier(value) {
  if (!value) return null;
  const content = document.createElement("div");
  content.className = "detail-extension-card__content";
  let hasContent = false;
  const keyHex = typeof value === "string" ? value : extractHex(value.keyIdentifier) ?? extractHex(value);
  const keyDisplay = buildKeyIdentifierDisplay(keyHex, { summary: "Key identifier" });
  if (keyDisplay) {
    content.append(keyDisplay);
    hasContent = true;
  }
  const extra = describeAuthorityKeyIdentifier(value);
  if (extra) {
    const extraNode = renderList(extra);
    if (extraNode) {
      content.append(extraNode);
      hasContent = true;
    }
  }
  return hasContent ? content : null;
}

function renderGenericObject(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Node) return value;
  if (Array.isArray(value)) return renderValue(value, true);
  if (typeof value === "object") {
    const pre = document.createElement("pre");
    pre.className = "detail-extension-card__raw detail-raw";
    pre.textContent = JSON.stringify(value, null, 2);
    return pre;
  }
  return renderValue(value, true);
}

function buildMessage(text, variant = "muted") {
  const note = document.createElement("div");
  note.className = `detail-extension-card__message detail-extension-card__message--${variant}`;
  note.textContent = text;
  return note;
}

function buildRawValue(hex) {
  if (!hex) return null;
  return createHexValue(hex, {
    summary: "Raw value",
    bytesPerRow: 16,
    previewBytes: 18,
    threshold: 200,
  });
}

const EXTENSION_RENDERERS = {
  "2.5.29.19": value => renderList(describeBasicConstraints(value)),
  "2.5.29.15": value => renderList(describeKeyUsage(value)),
  "2.5.29.37": value => renderList(describeExtendedKeyUsage(value)),
  "2.5.29.17": value => renderList(describeSubjectAltName(value)),
  "1.3.6.1.5.5.7.1.1": value => renderList(describeAuthorityInfoAccess(value)),
  "2.5.29.31": value => renderList(describeCRLDistributionPoints(value)),
  "2.5.29.32": value => renderList(describeCertificatePolicies(value)),
  "2.5.29.35": value => renderAuthorityKeyIdentifier(value),
  "2.5.29.14": value => renderKeyIdentifier(value),
};

function renderExtensionContent(entry) {
  if (!entry) return null;
  if (entry.status === "error") {
    const container = document.createElement("div");
    container.className = "detail-extension-card__content";
    container.append(buildMessage(`Error: ${entry.error ?? "Unknown error"}`, "error"));
    const raw = buildRawValue(entry.rawHex);
    if (raw) container.append(raw);
    return container;
  }
  const renderer = EXTENSION_RENDERERS[entry.oid];
  let node = renderer ? renderer(entry.value, entry) : null;
  if (!node && entry.value !== undefined && entry.value !== null) {
    node = renderGenericObject(entry.value);
  }
  if (node) return node;
  const container = document.createElement("div");
  container.className = "detail-extension-card__content";
  const message = entry.status === "parsed" ? "No details available" : "Unparsed extension";
  container.append(buildMessage(message, "muted"));
  const raw = buildRawValue(entry.rawHex);
  if (raw) container.append(raw);
  return container;
}

function buildExtensionHeader(entry) {
  const header = document.createElement("div");
  header.className = "detail-extension-card__header";
  const title = document.createElement("div");
  title.className = "detail-extension-card__title";
  title.textContent = entry.name ?? "Extension";
  header.append(title);
  const meta = document.createElement("div");
  meta.className = "detail-extension-card__meta";
  const oid = document.createElement("span");
  oid.className = "detail-extension-card__oid";
  oid.textContent = entry.oid;
  meta.append(oid);
  if (entry.critical) {
    const flag = document.createElement("span");
    flag.className = "detail-extension-flag detail-extension-flag--critical";
    flag.textContent = "Critical";
    meta.append(flag);
  }
  header.append(meta);
  return header;
}

function buildExtensionCard(entry) {
  if (!entry) return null;
  const card = document.createElement("div");
  card.className = "detail-extension-card";
  card.append(buildExtensionHeader(entry));
  const body = document.createElement("div");
  body.className = "detail-extension-card__body";
  const content = renderExtensionContent(entry);
  if (content) body.append(content);
  else body.append(createMuted());
  card.append(body);
  return card;
}

export function buildExtensionsSection(extensions) {
  if (!Array.isArray(extensions) || extensions.length === 0) return null;
  const section = document.createElement("div");
  section.className = "detail-section detail-section--extensions";
  const heading = document.createElement("h3");
  heading.textContent = "Extensions";
  section.append(heading);
  const list = document.createElement("div");
  list.className = "detail-extensions";
  extensions
    .map(entry => buildExtensionCard(entry))
    .filter(Boolean)
    .forEach(card => list.append(card));
  if (!list.childElementCount) return null;
  section.append(list);
  return section;
}
