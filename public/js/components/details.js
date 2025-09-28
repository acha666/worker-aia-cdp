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
  renderValue,
  createSection,
  formatSerial,
  formatDateWithRelative,
} from "../formatters.js";

function buildMetaSection(meta) {
  if (!meta) return null;
  let sizeValue = null;
  if (typeof meta.size === "number" && Number.isFinite(meta.size)) {
    const human = formatBytes(meta.size);
    const bytes = formatNumber(meta.size);
    sizeValue = human ? `${human} (${bytes} bytes)` : `${bytes} bytes`;
  } else if (meta.size !== null && meta.size !== undefined) {
    sizeValue = String(meta.size);
  }
  let uploadedValue = null;
  if (meta.uploaded) {
    const when = formatOpensslDate(meta.uploaded);
    const rel = formatRelativeSeconds((new Date(meta.uploaded).getTime() - Date.now()) / 1000);
    uploadedValue = rel ? `${when} (${rel})` : when;
  }
  return createSection("Object", [
    { label: "Path", value: meta.key ? `/${meta.key}` : null },
    { label: "Type", value: meta.type },
    { label: "Size", value: sizeValue },
    { label: "Uploaded", value: uploadedValue },
    { label: "ETag", value: meta.etag },
  ]);
}

function buildCertificateSummary(summary, validity) {
  if (!summary) return null;
  const rows = [
    { label: "Subject CN", value: summary.subjectCN, skipEmpty: true },
    { label: "Issuer CN", value: summary.issuerCN, skipEmpty: true },
    { label: "Serial", value: summary.serialNumberHex ? `0x${summary.serialNumberHex.toUpperCase()}` : null },
    { label: "Not Before", value: formatOpensslDate(summary.notBefore) },
    { label: "Not After", value: formatDateWithRelative(summary.notAfter, validity?.daysUntilExpiry, validity?.secondsUntilExpiry) },
    { label: "Expired", value: typeof summary.isExpired === "boolean" ? (summary.isExpired ? "Yes" : "No") : null },
  ];
  return createSection("Summary", rows);
}

function buildNameSection(title, name) {
  if (!name) return null;
  const rows = [
    { label: "Distinguished Name", value: name.dn },
    { label: "Attributes", value: Array.isArray(name.rdns) ? name.rdns.map(r => `${r.shortName ?? r.oid}=${r.value}`) : null },
  ];
  return createSection(title, rows);
}

function buildValiditySection(validity) {
  if (!validity) return null;
  const rows = [
    { label: "Not Before", value: formatOpensslDate(validity.notBefore) },
    { label: "Not After", value: formatDateWithRelative(validity.notAfter, validity.daysUntilExpiry, validity.secondsUntilExpiry) },
    { label: "Days Until Expiry", value: typeof validity.daysUntilExpiry === "number" && Number.isFinite(validity.daysUntilExpiry) ? validity.daysUntilExpiry : null, skipEmpty: true },
    { label: "Seconds Until Expiry", value: typeof validity.secondsUntilExpiry === "number" && Number.isFinite(validity.secondsUntilExpiry) ? validity.secondsUntilExpiry : null, skipEmpty: true },
    { label: "Expired", value: typeof validity.isExpired === "boolean" ? (validity.isExpired ? "Yes" : "No") : null },
  ];
  return createSection("Validity", rows);
}

function buildFingerprintsSection(fingerprints, title) {
  if (!fingerprints) return null;
  const rows = Object.entries(fingerprints).map(([algo, hex]) => ({
    label: algo.toUpperCase(),
    value: formatDigest(hex),
  }));
  return createSection(title, rows);
}

function buildSignatureSection(signature) {
  if (!signature) return null;
  return createSection("Signature", [
    { label: "Algorithm", value: formatAlgorithm(signature.algorithm) },
    { label: "Bit Length", value: signature.bitLength ? `${signature.bitLength} bits` : null },
    { label: "Signature Value", value: createHexValue(signature.valueHex, { summary: "Signature", bitLength: signature.bitLength, bytesPerRow: 18 }) },
  ]);
}

function buildPublicKeySection(publicKey, extensions) {
  if (!publicKey) return null;
  const rows = [
    { label: "Algorithm", value: formatAlgorithm(publicKey.algorithm) },
    { label: "Key Size", value: typeof publicKey.sizeBits === "number" ? `${publicKey.sizeBits} bits` : null },
  ];
  if (publicKey.exponent) rows.push({ label: "Exponent", value: publicKey.exponent });
  if (publicKey.curveName || publicKey.curveOid) {
    const curve = publicKey.curveName && publicKey.curveOid && publicKey.curveName !== publicKey.curveOid
      ? `${publicKey.curveName} (${publicKey.curveOid})`
      : publicKey.curveName ?? publicKey.curveOid;
    rows.push({ label: "Curve", value: curve });
  }
  if (extensions?.subjectKeyIdentifier) {
    rows.push({ label: "Subject Key Identifier", value: formatDigest(extensions.subjectKeyIdentifier) });
  }
  if (publicKey.fingerprints) {
    rows.push({
      label: "Fingerprints",
      value: Object.entries(publicKey.fingerprints).map(([algo, hex]) => `${algo.toUpperCase()}: ${formatDigest(hex)}`),
    });
  }
  if (publicKey.modulusHex) {
    rows.push({ label: "Modulus", value: createHexValue(publicKey.modulusHex, { summary: "Modulus", bitLength: publicKey.sizeBits, bytesPerRow: 16 }) });
  }
  if (publicKey.subjectPublicKeyHex) {
    rows.push({ label: "Subject Public Key", value: createHexValue(publicKey.subjectPublicKeyHex, { summary: "Subject Public Key", bitLength: publicKey.sizeBits, bytesPerRow: 16 }) });
  }
  return createSection("Subject Public Key Info", rows);
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
  const lines = [data.critical ? "critical" : "not critical"];
  if (Array.isArray(data.enabled) && data.enabled.length) lines.push(`enabled: ${data.enabled.join(", ")}`);
  if (data.rawHex) lines.push(createHexValue(data.rawHex, { summary: "Raw Bits", threshold: 80, bytesPerRow: 8 }));
  return lines;
}

function describeExtendedKeyUsage(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical"];
  if (Array.isArray(data.usages) && data.usages.length) lines.push(`usages: ${data.usages.join(", ")}`);
  if (Array.isArray(data.oids) && data.oids.length) lines.push(`oids: ${data.oids.join(", ")}`);
  return lines;
}

function describeSubjectAltName(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical"];
  if (Array.isArray(data.dnsNames) && data.dnsNames.length) lines.push(`DNS: ${data.dnsNames.join(", ")}`);
  if (Array.isArray(data.emailAddresses) && data.emailAddresses.length) lines.push(`Email: ${data.emailAddresses.join(", ")}`);
  if (Array.isArray(data.ipAddresses) && data.ipAddresses.length) lines.push(`IP: ${data.ipAddresses.join(", ")}`);
  if (Array.isArray(data.uris) && data.uris.length) lines.push(`URI: ${data.uris.join(", ")}`);
  if (Array.isArray(data.directoryNames) && data.directoryNames.length) {
    lines.push(...data.directoryNames.map(entry => `DirName: ${entry.dn}`));
  }
  if (Array.isArray(data.registeredIds) && data.registeredIds.length) lines.push(`Registered IDs: ${data.registeredIds.join(", ")}`);
  if (Array.isArray(data.otherNames) && data.otherNames.length) {
    lines.push(...data.otherNames.map(entry => `OtherName ${entry.oid}: ${formatDigest(entry.valueHex) ?? entry.valueHex}`));
  }
  return lines;
}

function describeAuthorityInfoAccess(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical"];
  if (Array.isArray(data.ocsp) && data.ocsp.length) lines.push(`OCSP: ${data.ocsp.join(", ")}`);
  if (Array.isArray(data.caIssuers) && data.caIssuers.length) lines.push(`CA Issuers: ${data.caIssuers.join(", ")}`);
  if (Array.isArray(data.other) && data.other.length) {
    for (const entry of data.other) {
      lines.push(`${entry.method}: ${entry.locations.join(", ")}`);
    }
  }
  return lines;
}

function describeCRLDP(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical"];
  if (Array.isArray(data.urls) && data.urls.length) lines.push(`URLs: ${data.urls.join(", ")}`);
  if (Array.isArray(data.directoryNames) && data.directoryNames.length) lines.push(`Directory Names: ${data.directoryNames.join(", ")}`);
  return lines;
}

function describeCertificatePolicies(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical"];
  if (Array.isArray(data.items) && data.items.length) {
    for (const item of data.items) {
      const qualifierText = Array.isArray(item.qualifiers) && item.qualifiers.length
        ? ` [${item.qualifiers.map(q => `${q.oid}${q.value ? `=${q.value}` : ""}`).join(", ")}]`
        : "";
      lines.push(`${item.oid}${qualifierText}`);
    }
  }
  return lines;
}

function describeAuthorityKeyIdentifier(data) {
  if (!data) return null;
  const lines = [data.critical ? "critical" : "not critical"];
  if (data.keyIdentifier) lines.push(`keyIdentifier: ${formatDigest(data.keyIdentifier) ?? data.keyIdentifier}`);
  if (Array.isArray(data.authorityCertIssuer) && data.authorityCertIssuer.length) lines.push(`authorityCertIssuer: ${data.authorityCertIssuer.join(", ")}`);
  if (data.authorityCertSerialNumber) lines.push(`authorityCertSerialNumber: 0x${data.authorityCertSerialNumber.toUpperCase()}`);
  return lines;
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

function buildExtensionsSection(extensions) {
  if (!extensions) return null;
  const rows = [];
  const basicConstraints = describeBasicConstraints(extensions.basicConstraints);
  if (basicConstraints) rows.push({ label: "Basic Constraints", value: basicConstraints });
  const keyUsage = describeKeyUsage(extensions.keyUsage);
  if (keyUsage) rows.push({ label: "Key Usage", value: keyUsage });
  const eku = describeExtendedKeyUsage(extensions.extendedKeyUsage);
  if (eku) rows.push({ label: "Extended Key Usage", value: eku });
  const san = describeSubjectAltName(extensions.subjectAltName);
  if (san) rows.push({ label: "Subject Alternative Name", value: san });
  const aia = describeAuthorityInfoAccess(extensions.authorityInfoAccess);
  if (aia) rows.push({ label: "Authority Information Access", value: aia });
  const crldp = describeCRLDP(extensions.crlDistributionPoints);
  if (crldp) rows.push({ label: "CRL Distribution Points", value: crldp });
  const policies = describeCertificatePolicies(extensions.certificatePolicies);
  if (policies) rows.push({ label: "Certificate Policies", value: policies });
  if (extensions.subjectKeyIdentifier) rows.push({ label: "Subject Key Identifier", value: formatDigest(extensions.subjectKeyIdentifier) });
  const authorityKeyIdentifier = describeAuthorityKeyIdentifier(extensions.authorityKeyIdentifier);
  if (authorityKeyIdentifier) rows.push({ label: "Authority Key Identifier", value: authorityKeyIdentifier });
  const present = describeExtensionPresence(extensions.present);
  if (present) rows.push({ label: "Present Extensions", value: present });
  return rows.length ? createSection("Extensions", rows) : null;
}

function buildCertificateSections(details) {
  if (!details) return [];
  const sections = [];
  const summarySection = buildCertificateSummary(details.summary, details.validity);
  if (summarySection) sections.push(summarySection);
  const dataSection = createSection("Data", [
    { label: "Version", value: details.version ? `Version ${details.version} (0x${Math.max(0, details.version - 1).toString(16)})` : null },
    { label: "Serial Number", value: formatSerial(details.serialNumber) },
    { label: "Signature Algorithm", value: formatAlgorithm(details.signature?.algorithm) },
  ]);
  if (dataSection) sections.push(dataSection);
  const validitySection = buildValiditySection(details.validity);
  if (validitySection) sections.push(validitySection);
  const issuerSection = buildNameSection("Issuer", details.issuer);
  if (issuerSection) sections.push(issuerSection);
  const subjectSection = buildNameSection("Subject", details.subject);
  if (subjectSection) sections.push(subjectSection);
  const publicKeySection = buildPublicKeySection(details.publicKey, details.extensions);
  if (publicKeySection) sections.push(publicKeySection);
  const fingerprintsSection = buildFingerprintsSection(details.fingerprints, "Certificate Fingerprints");
  if (fingerprintsSection) sections.push(fingerprintsSection);
  const signatureSection = buildSignatureSection(details.signature);
  if (signatureSection) sections.push(signatureSection);
  const extensionsSection = buildExtensionsSection(details.extensions);
  if (extensionsSection) sections.push(extensionsSection);
  return sections;
}

function buildCrlSummary(summary) {
  if (!summary) return null;
  return createSection("Summary", [
    { label: "Issuer CN", value: summary.issuerCN, skipEmpty: true },
    { label: "CRL Number", value: summary.crlNumber },
    { label: "Entries", value: typeof summary.entryCount === "number" ? formatNumber(summary.entryCount) : summary.entryCount },
    { label: "Delta CRL", value: typeof summary.isDelta === "boolean" ? (summary.isDelta ? "Yes" : "No") : null },
  ]);
}

function buildCrlValiditySection(validity) {
  if (!validity) return null;
  const rows = [
    { label: "This Update", value: formatOpensslDate(validity.thisUpdate) },
    { label: "Next Update", value: formatDateWithRelative(validity.nextUpdate, null, validity.secondsUntilNextUpdate) },
    { label: "Seconds Until Next Update", value: typeof validity.secondsUntilNextUpdate === "number" && Number.isFinite(validity.secondsUntilNextUpdate) ? validity.secondsUntilNextUpdate : null, skipEmpty: true },
    { label: "Expired", value: typeof validity.isExpired === "boolean" ? (validity.isExpired ? "Yes" : "No") : null },
  ];
  return createSection("Validity", rows);
}

function buildCrlNumbersSection(numbers, isDelta) {
  if (!numbers) return null;
  const rows = [
    { label: "CRL Number", value: numbers.crlNumber },
    { label: "Base CRL Number", value: numbers.baseCRLNumber, skipEmpty: true },
    { label: "Delta CRL", value: typeof isDelta === "boolean" ? (isDelta ? "Yes" : "No") : null },
  ];
  return createSection("Numbers", rows);
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
      if (entry.serialNumber?.decimal) serialParts.push(entry.serialNumber.decimal);
      if (entry.serialNumber?.hex) serialParts.push(`0x${entry.serialNumber.hex.toUpperCase()}`);
      const when = formatOpensslDate(entry.revocationDate);
      const reason = entry.reason ? `reason: ${entry.reason}` : null;
      return [
        `Serial: ${serialParts.join(" / ")}`,
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

function buildCrlSections(details) {
  if (!details) return [];
  const sections = [];
  const summarySection = buildCrlSummary(details.summary);
  if (summarySection) sections.push(summarySection);
  const issuerSection = buildNameSection("Issuer", details.issuer);
  if (issuerSection) sections.push(issuerSection);
  const numbersSection = buildCrlNumbersSection(details.numbers, details.isDelta);
  if (numbersSection) sections.push(numbersSection);
  const validitySection = buildCrlValiditySection(details.validity);
  if (validitySection) sections.push(validitySection);
  if (details.authorityKeyIdentifier) {
    sections.push(createSection("Authority Key Identifier", [
      { label: "Key Identifier", value: formatDigest(details.authorityKeyIdentifier) ?? details.authorityKeyIdentifier },
    ]));
  }
  const fingerprintsSection = buildFingerprintsSection(details.fingerprints, "CRL Fingerprints");
  if (fingerprintsSection) sections.push(fingerprintsSection);
  const signatureSection = buildSignatureSection(details.signature);
  if (signatureSection) sections.push(signatureSection);
  const entriesSection = buildCrlEntriesSection(details.entries);
  if (entriesSection) sections.push(entriesSection);
  const extensionsSection = buildCrlExtensionsSection(details.extensions);
  if (extensionsSection) sections.push(extensionsSection);
  return sections;
}

function buildUnknownSection(details) {
  const pre = document.createElement("pre");
  pre.className = "detail-raw";
  pre.textContent = JSON.stringify(details, null, 2);
  return pre;
}

export function buildDetailView(meta) {
  const article = document.createElement("article");
  article.className = "detail-view";
  if (meta?.type) article.dataset.type = meta.type;

  const header = document.createElement("div");
  header.className = "detail-header";
  const title = document.createElement("div");
  title.className = "detail-title";
  title.textContent = meta?.type === "certificate"
    ? "Certificate"
    : meta?.type === "crl"
      ? "Certificate Revocation List"
      : "Object";
  header.append(title);
  if (meta?.details?.summary?.subjectCN) {
    const highlight = document.createElement("div");
    highlight.className = "detail-highlight";
    highlight.textContent = meta.details.summary.subjectCN;
    header.append(highlight);
  } else if (meta?.details?.summary?.issuerCN && meta.type === "crl") {
    const highlight = document.createElement("div");
    highlight.className = "detail-highlight";
    highlight.textContent = meta.details.summary.issuerCN;
    header.append(highlight);
  }
  if (meta?.key) {
    const path = document.createElement("div");
    path.className = "detail-subtitle";
    path.textContent = `/${meta.key}`;
    header.append(path);
  }
  article.append(header);

  const metaSection = buildMetaSection(meta);
  if (metaSection) article.append(metaSection);

  if (meta?.type === "certificate") {
    const certSections = buildCertificateSections(meta.details);
    certSections.forEach(section => article.append(section));
  } else if (meta?.type === "crl") {
    const crlSections = buildCrlSections(meta.details);
    crlSections.forEach(section => article.append(section));
  } else if (meta?.details) {
    article.append(buildUnknownSection(meta.details));
  }

  return article;
}
