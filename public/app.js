async function listCollection(collection) {
    const res = await fetch(`/api/v1/collections/${collection}/items`);
    if (!res.ok) throw new Error(`list ${collection} failed: ${res.status}`);
    const payload = await res.json();
    if (payload?.error) {
        throw new Error(payload.error.message || `list ${collection} failed`);
    }
    return payload.data ?? { items: [], prefixes: [] };
}

/** Build a row for a cert/crl.
 *  Minimal DOM changes, but clearer structure and styles. */
function itemLi(base, hasDer, hasPem) {
    const li = document.createElement('li');

    const name = base.replace(/^([^/]+)\//, '').replace(/\.(crt|crl)$/i, '');
    const hrefDer = hasDer ? `/${base}` : '';
    const hrefPem = hasPem ? `/${base}.pem` : '';
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
            ${hasDer ? `<a href="${hrefDer}">DER</a>` : ''}
            ${hasPem ? `<a href="${hrefPem}">PEM</a>` : ''}
        </div>
    `;
    return li;
}

async function render() {
    const certUL = document.getElementById('certs');
    const crlUL = document.getElementById('crls');
    const dcrlUL = document.getElementById('dcrls');

    const [certs, crls, dcrls] = await Promise.all([
        listCollection('ca'),
        listCollection('crl'),
        listCollection('dcrl'),
    ]);

    // ---- Certs
    const certMap = new Map();
    certs.items.forEach(o => {
        if (o.key.endsWith('.crt')) {
            const prev = certMap.get(o.key) || {};
            certMap.set(o.key, { ...prev, der: true });
        }
        if (o.key.endsWith('.crt.pem')) {
            const base = o.key.replace(/\.pem$/, '');
            const prev = certMap.get(base) || {};
            certMap.set(base, { ...prev, pem: true });
        }
    });
    [...certMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([base, v]) => {
            certUL.appendChild(itemLi(base, !!v.der, !!v.pem));
        });

    // ---- Full CRLs
    const crlMap = new Map();
    crls.items
        .filter(o => !o.key.startsWith('crl/archive/') && !o.key.startsWith('crl/by-keyid/'))
        .forEach(o => {
            if (o.key.endsWith('.crl')) {
                const prev = crlMap.get(o.key) || {};
                crlMap.set(o.key, { ...prev, der: true });
            }
            if (o.key.endsWith('.crl.pem')) {
                const base = o.key.replace(/\.pem$/, '');
                const prev = crlMap.get(base) || {};
                crlMap.set(base, { ...prev, pem: true });
            }
        });
    [...crlMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([base, v]) => {
            crlUL.appendChild(itemLi(base, !!v.der, !!v.pem));
        });

    // ---- Delta CRLs
    const dcrlMap = new Map();
    dcrls.items
        .filter(o => !o.key.startsWith('dcrl/archive/') && !o.key.startsWith('dcrl/by-keyid/'))
        .forEach(o => {
            if (o.key.endsWith('.crl')) {
                const prev = dcrlMap.get(o.key) || {};
                dcrlMap.set(o.key, { ...prev, der: true });
            }
            if (o.key.endsWith('.crl.pem')) {
                const base = o.key.replace(/\.pem$/, '');
                const prev = dcrlMap.get(base) || {};
                dcrlMap.set(base, { ...prev, pem: true });
            }
        });
    [...dcrlMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([base, v]) => {
            dcrlUL.appendChild(itemLi(base, !!v.der, !!v.pem));
        });
}

addEventListener('click', async e => {
    const btn = (e.target.closest?.('.btn-detail')) || null;
    if (!btn) return;

    const key = btn.getAttribute('data-key');
    const panel = document.querySelector(`.details[data-panel="${key}"]`);
    const spinner = btn.parentElement.querySelector('.loading');
    if (!panel || !spinner) return;

    // If panel is visible, simply hide it (no network activity)
    if (!panel.hasAttribute('hidden')) {
        panel.setAttribute('hidden', '');
        return;
    }

    if (panel.getAttribute('data-loaded') === 'true') {
        panel.removeAttribute('hidden');
        return;
    }

    if (panel.getAttribute('data-loading') === 'true') {
        return;
    }

    spinner.removeAttribute('hidden');
    panel.setAttribute('data-loading', 'true');
    try {
        const encodedKey = encodeURIComponent(key);
        const r = await fetch(`/api/v1/objects/${encodedKey}/metadata`);
        const payload = await r.json();
        if (!r.ok || payload?.error) {
            throw new Error(payload?.error?.message || 'meta error');
        }
        // Cache the HTML in the panel itself and mark as loaded
        panel.innerHTML = '<pre>' + JSON.stringify(payload.data, null, 2) + '</pre>';
        panel.setAttribute('data-loaded', 'true');
        panel.removeAttribute('hidden');
    } catch (err) {
        panel.innerHTML = '<div class="error">Failed to load details: ' + err.message + '</div>';
        panel.removeAttribute('hidden');
    } finally {
        panel.removeAttribute('data-loading');
        spinner.setAttribute('hidden', '');
    }
});

render().catch(console.error);
