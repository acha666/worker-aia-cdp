function createListItem(base, options = {}) {
  const { hasDer, hasPem, type, label } = options;
  const li = document.createElement("li");
  const name = base.replace(/^[^/]+\//, "").replace(/\.(crt|crl)$/i, "");
  const hrefDer = hasDer ? `/${base}` : "";
  const hrefPem = hasPem ? `/${base}.pem` : "";
  const primaryKey = hasDer ? base : `${base}.pem`;
  const badgeLabel = label ?? (type ? type.toUpperCase() : "Object");
  const typeClass = type ? ` file-item--${type}` : "";

  li.className = `file-item${typeClass}`;
  li.innerHTML = `
    <div class="file-main">
      <div class="file-heading">
        <span class="file-badge">${badgeLabel}</span>
        <span class="file-name">${name}</span>
      </div>
      <div class="file-path">${base}</div>
    </div>
    <div class="file-actions">
      <div class="file-links" aria-label="Available downloads">
        ${hasDer ? `<a class="file-link" href="${hrefDer}">DER</a>` : ""}
        ${hasPem ? `<a class="file-link" href="${hrefPem}">PEM</a>` : ""}
      </div>
      <button class="btn btn-expand" data-key="${primaryKey}" aria-expanded="false">
        <span class="btn-expand-icon" aria-hidden="true"></span>
        <span class="btn-expand-label">View details</span>
      </button>
      <span class="loading" hidden aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span class="sr-only">Loading…</span>
      </span>
    </div>
    <div class="details detail-container" data-panel="${primaryKey}" hidden></div>
  `;
  return li;
}

function createArtifactMap(items, baseExtension, skipPrefixes = []) {
  const map = new Map();
  for (const item of items) {
    if (skipPrefixes.some(prefix => item.key.startsWith(prefix))) continue;
    if (item.key.endsWith(baseExtension)) {
      const prev = map.get(item.key) || {};
      map.set(item.key, { ...prev, der: true });
    }
    if (item.key.endsWith(`${baseExtension}.pem`)) {
      const base = item.key.replace(/\.pem$/, "");
      const prev = map.get(base) || {};
      map.set(base, { ...prev, pem: true });
    }
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function renderCertificates(target, items) {
  const entries = createArtifactMap(items, ".crt");
  entries.forEach(([base, value]) => {
    target.appendChild(createListItem(base, {
      hasDer: !!value.der,
      hasPem: !!value.pem,
      type: "certificate",
      label: "Certificate",
    }));
  });
}

export function renderCrls(target, items) {
  const entries = createArtifactMap(items, ".crl", ["crl/archive/", "crl/by-keyid/"]);
  entries.forEach(([base, value]) => {
    target.appendChild(createListItem(base, {
      hasDer: !!value.der,
      hasPem: !!value.pem,
      type: "crl",
      label: "CRL",
    }));
  });
}

export function renderDeltaCrls(target, items) {
  const entries = createArtifactMap(items, ".crl", ["dcrl/archive/", "dcrl/by-keyid/"]);
  entries.forEach(([base, value]) => {
    target.appendChild(createListItem(base, {
      hasDer: !!value.der,
      hasPem: !!value.pem,
      type: "delta-crl",
      label: "Delta CRL",
    }));
  });
}
