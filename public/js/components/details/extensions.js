import { createHexValue, createSection, formatDigest, renderValue } from "../../formatters.js";
import { createChip } from "./status.js";

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
  if (Array.isArray(data)) return data.length ? data : null;
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
  if (Array.isArray(data.other) && data.other.length) {
    lines.push(...data.other.map(item => `${item.oid ?? "other"}${item.value ? `: ${item.value}` : ""}`.trim()));
  }
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

function describeCRLDistributionPoints(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data.length ? data : null;
  const lines = [];
  if (typeof data.critical === "boolean") lines.push(data.critical ? "critical" : "not critical");
  if (Array.isArray(data.urls) && data.urls.length) lines.push(`URLs: ${data.urls.join(", ")}`);
  if (Array.isArray(data.directoryNames) && data.directoryNames.length) {
    lines.push(`Directory Names: ${data.directoryNames.join(", ")}`);
  }
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
  if (data.keyIdentifier) {
    lines.push(`keyIdentifier: ${formatDigest(data.keyIdentifier) ?? data.keyIdentifier}`);
  }
  if (Array.isArray(data.authorityCertIssuer) && data.authorityCertIssuer.length) {
    lines.push(`authorityCertIssuer: ${data.authorityCertIssuer.join(", ")}`);
  }
  if (data.authorityCertSerialNumber) {
    lines.push(`authorityCertSerialNumber: 0x${String(data.authorityCertSerialNumber).toUpperCase()}`);
  }
  return lines.length ? lines : null;
}

export function describeExtensionPresence(entries) {
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

export function buildExtensionsSection(extensions) {
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
  const crldp = describeCRLDistributionPoints(extensions.crlDistributionPoints);
  addRow("CRL Distribution Points", crldp);
  addRow("Certificate Policies", describeCertificatePolicies(extensions.certificatePolicies));
  if (extensions.subjectKeyIdentifier) {
    rows.push({
      label: "Subject Key Identifier",
      value: createHexValue(extensions.subjectKeyIdentifier, {
        threshold: 200,
        previewBytes: 20,
      }),
    });
  }
  const authorityKeyIdentifier = describeAuthorityKeyIdentifier(extensions.authorityKeyIdentifier);
  if (authorityKeyIdentifier) rows.push({ label: "Authority Key Identifier", value: decorateExtensionValue(authorityKeyIdentifier) });
  const present = describeExtensionPresence(extensions.present);
  if (present) rows.push({ label: "Present Extensions", value: present });
  return rows.length ? createSection("Extensions", rows) : null;
}
