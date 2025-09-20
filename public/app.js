async function list(prefix) {
    const res = await fetch(`/api/list?prefix=${encodeURIComponent(prefix)}&delimiter=/`);
    if (!res.ok) throw new Error(`list ${prefix} failed: ${res.status}`);
    return res.json();
}

/** Build a row for a cert/crl.
 *  Minimal DOM changes, but clearer structure and styles. */
function itemLi(base, hasDer, hasPem) {
    const li = document.createElement('li');

    const name = base.replace(/^([^/]+)\//, '').replace(/\.(crt|crl)$/i, '');
    const hrefDer = hasDer ? `/${base}` : '';
    const hrefPem = hasPem ? `/${base}.pem` : '';

    li.innerHTML = `
    <div class="item-left">
      <div class="item-title">${name}</div>
      <div class="item-path">${base}</div>
      <div class="actions">
        <button class="btn btn-detail" data-key="${hasDer ? hrefDer : hrefPem}">Details</button>
        <span class="loading" hidden><span class="spinner" aria-hidden="true"></span></span>
      </div>
      <div class="details" data-panel="${hasDer ? hrefDer : hrefPem}" hidden></div>
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
        list('ca/'),
        list('crl/'),
        list('dcrl/'),
    ]);

    // ---- Certs
    const certMap = new Map();
    certs.objects.forEach(o => {
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
    crls.objects
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
    dcrls.objects
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

    if (!panel.hasAttribute('hidden')) {
        panel.setAttribute('hidden', '');
        return;
    }

    spinner.removeAttribute('hidden');
    try {
        const r = await fetch('/meta?key=' + encodeURIComponent(key));
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'meta error');
        panel.innerHTML = '<pre>' + JSON.stringify(j, null, 2) + '</pre>';
        panel.removeAttribute('hidden');
    } catch (err) {
        panel.innerHTML = '<div class="error">Failed to load details: ' + err.message + '</div>';
        panel.removeAttribute('hidden');
    } finally {
        spinner.setAttribute('hidden', '');
    }
});

render().catch(console.error);
