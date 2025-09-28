function createListItem(base, hasDer, hasPem) {
  const li = document.createElement("li");
  const name = base.replace(/^([^/]+)\//, "").replace(/\.(crt|crl)$/i, "");
  const hrefDer = hasDer ? `/${base}` : "";
  const hrefPem = hasPem ? `/${base}.pem` : "";
  const primaryKey = hasDer ? base : `${base}.pem`;

  li.innerHTML = `
    <div class="item-left">
      <div class="item-title">${name}</div>
      <div class="item-path">${base}</div>
      <div class="actions">
        <button class="btn btn-detail" data-key="${primaryKey}">Details</button>
        <span class="loading" hidden><span class="spinner" aria-hidden="true"></span></span>
      </div>
      <div class="details" data-panel="${primaryKey}" hidden></div>
    </div>
    <div class="item-right">
      ${hasDer ? `<a href="${hrefDer}">DER</a>` : ""}
      ${hasPem ? `<a href="${hrefPem}">PEM</a>` : ""}
    </div>
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
  entries.forEach(([base, value]) => target.appendChild(createListItem(base, !!value.der, !!value.pem)));
}

export function renderCrls(target, items) {
  const entries = createArtifactMap(items, ".crl", ["crl/archive/", "crl/by-keyid/"]);
  entries.forEach(([base, value]) => target.appendChild(createListItem(base, !!value.der, !!value.pem)));
}

export function renderDeltaCrls(target, items) {
  const entries = createArtifactMap(items, ".crl", ["dcrl/archive/", "dcrl/by-keyid/"]);
  entries.forEach(([base, value]) => target.appendChild(createListItem(base, !!value.der, !!value.pem)));
}
