async function list(prefix) {
    const res = await fetch(`/api/list?prefix=${encodeURIComponent(prefix)}&delimiter=/`);
    if (!res.ok) throw new Error(`list ${prefix} failed: ${res.status}`);
    return res.json();
}

function itemLi(base, hasDer, hasPem) {
    const li = document.createElement('li');
    const name = base.replace(/^([^/]+)\//, '').replace(/\.(crt|crl)$/i, '');
    li.innerHTML = `
    <div>
      <strong>${name}</strong>
      <div class="meta">${base}</div>
      <div class="toggle">
        <button class="btn-detail" data-key="/${hasDer ? base : base + '.pem'}">详情</button>
        <span class="loading" hidden><span class="spinner"></span></span>
      </div>
      <div class="details" data-panel="/${hasDer ? base : base + '.pem'}" hidden></div>
    </div>
    <div>
      ${hasDer ? `<a href="/${base}">DER</a>` : ''}
      ${hasPem ? `${hasDer ? ' | ' : ''}<a href="/${base}.pem">PEM</a>` : ''}
    </div>`;
    return li;
}

async function render() {
    const certUL = document.getElementById('certs');
    const crlUL = document.getElementById('crls');

    const [certs, crls] = await Promise.all([list('ca/'), list('crl/')]);

    const certMap = new Map();
    certs.objects.forEach(o => {
        if (o.key.endsWith('.crt')) certMap.set(o.key, { der: true });
        if (o.key.endsWith('.crt.pem')) certMap.set(o.key.replace(/\.pem$/, ''), { ...(certMap.get(o.key.replace(/\.pem$/, '')) || {}), pem: true });
    });
    [...certMap.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([base, v]) => {
        certUL.appendChild(itemLi(base, !!v.der, !!v.pem));
    });

    const crlMap = new Map();
    crls.objects.filter(o => !o.key.startsWith('crl/archive/') && !o.key.startsWith('crl/by-keyid/')).forEach(o => {
        if (o.key.endsWith('.crl')) crlMap.set(o.key, { der: true });
        if (o.key.endsWith('.crl.pem')) crlMap.set(o.key.replace(/\.pem$/, ''), { ...(crlMap.get(o.key.replace(/\.pem$/, '')) || {}), pem: true });
    });
    [...crlMap.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([base, v]) => {
        crlUL.appendChild(itemLi(base, !!v.der, !!v.pem));
    });
}

addEventListener('click', async e => {
    const btn = (e.target.closest?.('.btn-detail')) || null;
    if (!btn) return;
    const key = btn.getAttribute('data-key');
    const panel = document.querySelector(`.details[data-panel="${key}"]`);
    const spinner = btn.parentElement.querySelector('.loading');
    if (!panel || !spinner) return;
    if (!panel.hasAttribute('hidden')) { panel.setAttribute('hidden', ''); return; }
    spinner.removeAttribute('hidden');
    try {
        const r = await fetch('/meta?key=' + encodeURIComponent(key));
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'meta error');
        panel.innerHTML = '<pre>' + JSON.stringify(j, null, 2) + '</pre>';
        panel.removeAttribute('hidden');
    } catch (err) {
        panel.innerHTML = '<div class="error">加载详情失败：' + err.message + '</div>';
        panel.removeAttribute('hidden');
    } finally {
        spinner.setAttribute('hidden', '');
    }
});

render().catch(console.error);
