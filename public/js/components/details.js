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

function computeTemporalStatus(iso) {
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

function buildMetaSection(resource) {
  if (!resource || typeof resource !== "object") return null;
  const attrs = resource.attributes ?? {};
  let sizeValue = null;
  if (typeof attrs.size === "number" && Number.isFinite(attrs.size)) {
    const human = formatBytes(attrs.size);
    const bytes = formatNumber(attrs.size);
    sizeValue = human ? `${human} (${bytes} bytes)` : `${bytes} bytes`;
  } else if (attrs.size !== null && attrs.size !== undefined) {
    sizeValue = String(attrs.size);
  }
  let uploadedValue = null;
  if (attrs.uploadedAt) {
    const when = formatOpensslDate(attrs.uploadedAt);
    const rel = formatRelativeSeconds((new Date(attrs.uploadedAt).getTime() - Date.now()) / 1000);
    uploadedValue = rel ? `${when} (${rel})` : when;
  }
  return createSection("Object", [
    { label: "Path", value: attrs.path ?? (resource.id ? `/${resource.id}` : null) },
    { label: "Type", value: attrs.objectType },
    { label: "Size", value: sizeValue },
    { label: "Uploaded", value: uploadedValue },
    { label: "ETag", value: attrs.etag },
  ]);
}

function buildCertificateSummary(summary, serialNumberHex, expiryStatus) {
  if (!summary) return null;
  const rows = [
    { label: "Subject CN", value: summary.subjectCommonName, skipEmpty: true },
    { label: "Issuer CN", value: summary.issuerCommonName, skipEmpty: true },
    { label: "Serial", value: serialNumberHex ? `0x${serialNumberHex.toUpperCase()}` : null },
    { label: "Not Before", value: formatOpensslDate(summary.notBefore) },
    { label: "Not After", value: formatDateWithRelative(summary.notAfter, expiryStatus?.daysUntil, expiryStatus?.secondsUntil) },
    { label: "Expired", value: typeof expiryStatus?.isExpired === "boolean" ? (expiryStatus.isExpired ? "Yes" : "No") : null },
  ];
  return createSection("Summary", rows);
}

function buildNameSection(title, name) {
  if (!name || !Array.isArray(name.attributes)) return null;
  const dn = name.attributes
    .map(attr => `${attr.shortName ?? attr.oid}=${attr.value}`)
    .join(", ");
  const attrs = name.attributes.map(attr => `${attr.shortName ?? attr.oid}=${attr.value}`);
  const rows = [
    { label: "Distinguished Name", value: dn || null },
    { label: "Attributes", value: attrs.length ? attrs : null },
  ];
  return createSection(title, rows);
}

function buildValiditySection(validity, expiryStatus) {
  if (!validity) return null;
  const rows = [
    { label: "Not Before", value: formatOpensslDate(validity.notBefore) },
    { label: "Not After", value: formatDateWithRelative(validity.notAfter, expiryStatus?.daysUntil, expiryStatus?.secondsUntil) },
    { label: "Days Until Expiry", value: typeof expiryStatus?.daysUntil === "number" && Number.isFinite(expiryStatus.daysUntil) ? expiryStatus.daysUntil : null, skipEmpty: true },
    { label: "Seconds Until Expiry", value: typeof expiryStatus?.secondsUntil === "number" && Number.isFinite(expiryStatus.secondsUntil) ? expiryStatus.secondsUntil : null, skipEmpty: true },
    { label: "Expired", value: typeof expiryStatus?.isExpired === "boolean" ? (expiryStatus.isExpired ? "Yes" : "No") : null },
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
  const expirySource = details.validity?.notAfter ?? details.summary?.notAfter ?? null;
  const expiryStatus = computeTemporalStatus(expirySource);
  const summarySection = buildCertificateSummary(details.summary, details.serialNumberHex, expiryStatus);
  if (summarySection) sections.push(summarySection);
  const dataSection = createSection("Data", [
    { label: "Version", value: details.version ? `Version ${details.version} (0x${Math.max(0, details.version - 1).toString(16)})` : null },
    { label: "Serial Number", value: formatSerial(details.serialNumberHex) },
    { label: "Signature Algorithm", value: formatAlgorithm(details.signature?.algorithm) },
  ]);
  if (dataSection) sections.push(dataSection);
  const validitySection = buildValiditySection(details.validity, expiryStatus);
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
    { label: "Issuer CN", value: summary.issuerCommonName, skipEmpty: true },
    { label: "CRL Number", value: summary.crlNumber },
    { label: "Entries", value: typeof summary.entryCount === "number" ? formatNumber(summary.entryCount) : summary.entryCount },
    { label: "Delta CRL", value: typeof summary.isDelta === "boolean" ? (summary.isDelta ? "Yes" : "No") : null },
  ]);
}

function buildCrlValiditySection(validity, nextUpdateStatus) {
  if (!validity) return null;
  const rows = [
    { label: "This Update", value: formatOpensslDate(validity.thisUpdate) },
    { label: "Next Update", value: formatDateWithRelative(validity.nextUpdate, nextUpdateStatus?.daysUntil, nextUpdateStatus?.secondsUntil) },
    { label: "Seconds Until Next Update", value: typeof nextUpdateStatus?.secondsUntil === "number" && Number.isFinite(nextUpdateStatus.secondsUntil) ? nextUpdateStatus.secondsUntil : null, skipEmpty: true },
    { label: "Expired", value: typeof nextUpdateStatus?.isExpired === "boolean" ? (nextUpdateStatus.isExpired ? "Yes" : "No") : null },
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

function buildCrlSections(details) {
  if (!details) return [];
  const sections = [];
  const summarySection = buildCrlSummary(details.summary);
  if (summarySection) sections.push(summarySection);
  const issuerSection = buildNameSection("Issuer", details.issuer);
  if (issuerSection) sections.push(issuerSection);
  const numbersSection = buildCrlNumbersSection(details.numbers, details.isDelta);
  if (numbersSection) sections.push(numbersSection);
  const nextUpdateStatus = computeTemporalStatus(details.validity?.nextUpdate ?? null);
  const validitySection = buildCrlValiditySection(details.validity, nextUpdateStatus);
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
  const title = document.createElement("div");
  title.className = "detail-title";
  title.textContent = attrs.objectType === "certificate"
    ? "Certificate"
    : attrs.objectType === "crl"
      ? "Certificate Revocation List"
      : "Object";
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
  article.append(header);

  const metaSection = buildMetaSection(resource);
  if (metaSection) article.append(metaSection);

  if (attrs.objectType === "certificate") {
    const certSections = buildCertificateSections(attrs.certificate);
    certSections.forEach(section => article.append(section));
  } else if (attrs.objectType === "crl") {
    const crlSections = buildCrlSections(attrs.crl);
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
