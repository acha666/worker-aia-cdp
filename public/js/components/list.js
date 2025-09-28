import { computeTemporalStatus, describeCertificateStatus, describeCrlStatus, renderStatusDisplay } from "./details.js";
import { formatOpensslDate, formatDateWithRelative } from "../formatters.js";

function fallbackName(base) {
  return base.replace(/^[^/]+\//, "").replace(/\.(crt|crl)$/i, "");
}

function getTypeTitle(type) {
  if (type === "certificate") return "Certificate";
  if (type === "crl") return "Certificate Revocation List";
  if (type === "delta-crl") return "Delta CRL";
  return "Object";
}

function buildStatus(entry) {
  const summary = entry.summary;
  if (!summary) return { node: null, lines: [] };

  if (entry.type === "certificate") {
    const expiryStatus = summary.notAfter ? computeTemporalStatus(summary.notAfter) : null;
    const descriptor = describeCertificateStatus(expiryStatus);
    const node = renderStatusDisplay(descriptor, { detailed: false });
    const lines = [];
    if (summary.notBefore) {
      const formatted = formatOpensslDate(summary.notBefore);
      if (formatted) lines.push(`From ${formatted}`);
    }
    if (summary.notAfter) {
      const formatted = formatDateWithRelative(
        summary.notAfter,
        expiryStatus?.daysUntil,
        expiryStatus?.secondsUntil,
      ) ?? formatOpensslDate(summary.notAfter);
      if (formatted) lines.push(`Until ${formatted}`);
    }
    return { node, lines };
  }

  if (entry.type === "crl" || entry.type === "delta-crl") {
    const nextUpdateStatus = summary.nextUpdate ? computeTemporalStatus(summary.nextUpdate) : null;
    const descriptor = describeCrlStatus(nextUpdateStatus, !!summary.isDelta);
    const node = renderStatusDisplay(descriptor, { detailed: false });
    const lines = [];
    if (summary.thisUpdate) {
      const formatted = formatOpensslDate(summary.thisUpdate);
      if (formatted) lines.push(`Issued ${formatted}`);
    }
    if (summary.nextUpdate) {
      const formatted = formatDateWithRelative(
        summary.nextUpdate,
        nextUpdateStatus?.daysUntil,
        nextUpdateStatus?.secondsUntil,
      ) ?? formatOpensslDate(summary.nextUpdate);
      if (formatted) lines.push(`Next update ${formatted}`);
    }
    return { node, lines };
  }

  return { node: null, lines: [] };
}

function createListItem(entry) {
  const li = document.createElement("li");
  const typeClass = entry.type ? ` file-item--${entry.type}` : "";
  li.className = `file-item${typeClass}`;

  const main = document.createElement("div");
  main.className = "file-main";

  const heading = document.createElement("div");
  heading.className = "file-heading";

  const badge = document.createElement("span");
  badge.className = "file-badge";
  badge.textContent = entry.label ?? entry.type?.toUpperCase() ?? "Object";
  heading.append(badge);

  const title = document.createElement("span");
  title.className = "detail-title";
  title.textContent = getTypeTitle(entry.type);
  heading.append(title);

  const { node: statusNode, lines: metaLines } = buildStatus(entry);
  if (statusNode) heading.append(statusNode);

  main.append(heading);

  if (entry.displayName) {
    const highlight = document.createElement("div");
    highlight.className = "detail-highlight";
    highlight.textContent = entry.displayName;
    main.append(highlight);
  }

  if (metaLines.length) {
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = metaLines.join(" · ");
    main.append(meta);
  }

  const path = document.createElement("div");
  path.className = "file-path";
  path.textContent = entry.baseKey;
  main.append(path);

  li.append(main);

  const actions = document.createElement("div");
  actions.className = "file-actions";

  const links = document.createElement("div");
  links.className = "file-links";
  links.setAttribute("aria-label", "Available downloads");
  if (entry.hasDer && entry.derHref) {
    const derLink = document.createElement("a");
    derLink.className = "file-link";
    derLink.href = entry.derHref;
    derLink.textContent = "DER";
    links.append(derLink);
  }
  if (entry.hasPem && entry.pemHref) {
    const pemLink = document.createElement("a");
    pemLink.className = "file-link";
    pemLink.href = entry.pemHref;
    pemLink.textContent = "PEM";
    links.append(pemLink);
  }
  actions.append(links);

  const button = document.createElement("button");
  button.className = "btn btn-expand";
  button.dataset.key = String(entry.primaryKey);
  button.setAttribute("aria-expanded", "false");
  const icon = document.createElement("span");
  icon.className = "btn-expand-icon";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "btn-expand-label";
  label.textContent = "View details";
  button.append(icon, label);
  actions.append(button);

  const loading = document.createElement("span");
  loading.className = "loading";
  loading.setAttribute("hidden", "");
  loading.setAttribute("aria-live", "polite");
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  const srOnly = document.createElement("span");
  srOnly.className = "sr-only";
  srOnly.textContent = "Loading…";
  loading.append(spinner, srOnly);
  actions.append(loading);

  li.append(actions);

  const details = document.createElement("div");
  details.className = "details detail-container";
  details.dataset.panel = String(entry.primaryKey);
  details.setAttribute("hidden", "");
  li.append(details);

  return li;
}

function createArtifactMap(items = [], baseExtension, skipPrefixes = []) {
  const map = new Map();
  for (const item of items) {
    if (!item || typeof item.key !== "string") continue;
    if (skipPrefixes.some(prefix => item.key.startsWith(prefix))) continue;
    const isPem = item.key.endsWith(`${baseExtension}.pem`);
    const isDer = item.key.endsWith(baseExtension) && !isPem;
    if (!isDer && !isPem) continue;
    const base = isPem ? item.key.replace(/\.pem$/, "") : item.key;
    const entry = map.get(base) ?? { base, der: null, pem: null, summary: null, displayName: null, kind: null };
    if (isPem) entry.pem = item;
    else entry.der = item;
    const candidateSummary = item.summary ?? null;
    if (candidateSummary && (!entry.summary || isDer)) entry.summary = candidateSummary;
    const candidateDisplayName = item.displayName
      ?? candidateSummary?.displayName
      ?? candidateSummary?.subjectCommonName
      ?? candidateSummary?.issuerCommonName
      ?? null;
    if (candidateDisplayName && (!entry.displayName || isDer)) entry.displayName = candidateDisplayName;
    if (!entry.kind && item.type) entry.kind = item.type;
    map.set(base, entry);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}

function toListDescriptor(entry, overrides) {
  const hasDer = !!entry.der;
  const hasPem = !!entry.pem;
  const derKey = entry.der?.key ?? null;
  const pemKey = entry.pem?.key ?? null;
  const primaryKey = derKey ?? pemKey ?? entry.base;
  const summary = entry.summary ?? entry.der?.summary ?? entry.pem?.summary ?? null;
  const normalizedSummary = summary && overrides.type === "delta-crl"
    ? { ...summary, isDelta: summary.isDelta ?? true }
    : summary;
  const displayName = entry.displayName ?? fallbackName(entry.base);
  return {
    baseKey: entry.base,
    type: overrides.type,
    label: overrides.label,
    hasDer,
    hasPem,
    derHref: hasDer && derKey ? `/${derKey}` : null,
    pemHref: hasPem && pemKey ? `/${pemKey}` : null,
    primaryKey,
    summary: normalizedSummary,
    displayName,
  };
}

export function renderCertificates(target, items) {
  const entries = createArtifactMap(items, ".crt");
  entries.forEach(entry => {
    const descriptor = toListDescriptor(entry, { type: "certificate", label: "Certificate" });
    target.appendChild(createListItem(descriptor));
  });
}

export function renderCrls(target, items) {
  const entries = createArtifactMap(items, ".crl", ["crl/archive/", "crl/by-keyid/"]);
  entries.forEach(entry => {
    const descriptor = toListDescriptor(entry, { type: "crl", label: "CRL" });
    target.appendChild(createListItem(descriptor));
  });
}

export function renderDeltaCrls(target, items) {
  const entries = createArtifactMap(items, ".crl", ["dcrl/archive/", "dcrl/by-keyid/"]);
  entries.forEach(entry => {
    const descriptor = toListDescriptor(entry, { type: "delta-crl", label: "Delta CRL" });
    target.appendChild(createListItem(descriptor));
  });
}
