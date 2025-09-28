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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatOpensslDate(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const month = MONTH_NAMES[date.getUTCMonth()] ?? 'Jan';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${month} ${day} ${hours}:${minutes}:${seconds} ${date.getUTCFullYear()} GMT`;
}

function formatRelativeDays(days) {
    if (typeof days !== 'number' || !Number.isFinite(days)) return null;
    const rounded = Math.round(days);
    if (rounded === 0) return 'today';
    const plural = Math.abs(rounded) === 1 ? 'day' : 'days';
    return rounded > 0 ? `in ${rounded} ${plural}` : `${Math.abs(rounded)} ${plural} ago`;
}

function formatRelativeSeconds(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
    const abs = Math.abs(seconds);
    const sign = seconds >= 0 ? 1 : -1;
    const units = [
        { label: 'day', value: 86400 },
        { label: 'hour', value: 3600 },
        { label: 'minute', value: 60 },
        { label: 'second', value: 1 },
    ];
    for (const unit of units) {
        if (abs >= unit.value || unit.label === 'second') {
            const count = Math.round(abs / unit.value);
            const plural = count === 1 ? '' : 's';
            return sign >= 0 ? `in ${count} ${unit.label}${plural}` : `${count} ${unit.label}${plural} ago`;
        }
    }
    return null;
}

function formatNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('en-US');
    const num = Number(value);
    if (!Number.isNaN(num) && Number.isFinite(num)) return num.toLocaleString('en-US');
    return typeof value === 'string' ? value : String(value);
}

function formatBytes(size) {
    if (typeof size !== 'number' || !Number.isFinite(size)) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }
    const digits = index === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[index]}`;
}

function formatAlgorithm(algorithm) {
    if (!algorithm) return null;
    const parts = [];
    if (algorithm.name) parts.push(algorithm.name);
    if (algorithm.oid && algorithm.oid !== algorithm.name) parts.push(`(${algorithm.oid})`);
    return parts.join(' ');
}

function createMuted(text = '—') {
    const span = document.createElement('span');
    span.className = 'detail-muted';
    span.textContent = text;
    return span;
}

function formatDigest(hex) {
    if (!hex) return null;
    const clean = typeof hex === 'string' ? hex.replace(/[^0-9a-f]/gi, '') : '';
    if (!clean) return null;
    return (clean.match(/.{1,2}/g) || []).join(':');
}

function colonizeHex(hex, bytesPerRow = 16) {
    if (!hex) return '';
    const clean = hex.replace(/[^0-9a-f]/gi, '').toLowerCase();
    const pairs = clean.match(/.{1,2}/g) || [];
    if (pairs.length === 0) return '';
    const lines = [];
    for (let i = 0; i < pairs.length; i += bytesPerRow) {
        lines.push(pairs.slice(i, i + bytesPerRow).join(':'));
    }
    return lines.join('\n');
}

function hexPreview(hex, count = 8) {
    if (!hex) return '';
    const clean = hex.replace(/[^0-9a-f]/gi, '').toLowerCase();
    const pairs = clean.match(/.{1,2}/g) || [];
    if (pairs.length === 0) return '';
    const slice = pairs.slice(0, count).join(':');
    return pairs.length > count ? `${slice}:…` : slice;
}

function createHexValue(hex, options = {}) {
    if (!hex) return createMuted();
    const clean = typeof hex === 'string' ? hex.replace(/[^0-9a-f]/gi, '').toLowerCase() : '';
    if (!clean) return createMuted();
    const threshold = options.threshold ?? 96;
    if (clean.length <= threshold) {
        const code = document.createElement('code');
        code.className = 'hex-inline';
        code.textContent = colonizeHex(clean, options.bytesPerRow ?? 16).replace(/\n/g, ' ');
        return code;
    }
    const details = document.createElement('details');
    details.className = 'hex-toggle';
    const summary = document.createElement('summary');
    const parts = [];
    if (options.summary) parts.push(options.summary);
    if (options.bitLength) parts.push(`${options.bitLength} bits`);
    const preview = hexPreview(clean, options.previewBytes ?? 12);
    if (preview) parts.push(preview);
    if (parts.length === 0) parts.push('Show hex');
    summary.textContent = parts.join(' • ');
    details.append(summary);
    const pre = document.createElement('pre');
    pre.className = 'hex-content';
    pre.textContent = colonizeHex(clean, options.bytesPerRow ?? 16);
    details.append(pre);
    return details;
}

function renderValue(value, skipEmpty) {
    if (value === null || value === undefined) {
        return skipEmpty ? null : createMuted();
    }
    if (value instanceof Node) return value;
    if (Array.isArray(value)) {
        const items = value.filter(item => item !== null && item !== undefined && item !== '');
        if (items.length === 0) return skipEmpty ? null : createMuted();
        const list = document.createElement('ul');
        list.className = 'detail-list';
        for (const item of items) {
            const li = document.createElement('li');
            if (item instanceof Node) li.append(item);
            else if (typeof item === 'string') li.textContent = item;
            else li.textContent = String(item);
            list.append(li);
        }
        return list;
    }
    if (typeof value === 'string') {
        if (value.length === 0) return skipEmpty ? null : createMuted();
        const span = document.createElement('span');
        span.textContent = value;
        return span;
    }
    if (typeof value === 'number') {
        const span = document.createElement('span');
        span.textContent = formatNumber(value);
        return span;
    }
    const span = document.createElement('span');
    span.textContent = String(value);
    return span;
}

function createSection(title, rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const section = document.createElement('div');
    section.className = 'detail-section';
    if (title) {
        const heading = document.createElement('h3');
        heading.textContent = title;
        section.append(heading);
    }
    const dl = document.createElement('dl');
    dl.className = 'detail-grid';
    let hasRows = false;
    for (const row of rows) {
        if (!row || !row.label) continue;
        const rendered = renderValue(row.value, row.skipEmpty);
        if (!rendered) continue;
        const dt = document.createElement('dt');
        dt.textContent = row.label;
        const dd = document.createElement('dd');
        dd.append(rendered);
        dl.append(dt, dd);
        hasRows = true;
    }
    if (!hasRows) return null;
    section.append(dl);
    return section;
}

function formatSerial(serial) {
    if (!serial) return null;
    const parts = [];
    if (serial.decimal) parts.push(`decimal: ${serial.decimal}`);
    if (serial.hex) parts.push(`hex: 0x${serial.hex.toUpperCase()}`);
    return parts;
}

function formatDateWithRelative(iso, days, seconds) {
    const base = formatOpensslDate(iso);
    if (!base) return null;
    const rel = formatRelativeDays(days ?? null) ?? formatRelativeSeconds(seconds ?? null);
    return rel ? `${base} (${rel})` : base;
}

function buildMetaSection(meta) {
    if (!meta) return null;
    let sizeValue = null;
    if (typeof meta.size === 'number' && Number.isFinite(meta.size)) {
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
    return createSection('Object', [
        { label: 'Path', value: meta.key ? `/${meta.key}` : null },
        { label: 'Type', value: meta.type },
        { label: 'Size', value: sizeValue },
        { label: 'Uploaded', value: uploadedValue },
        { label: 'ETag', value: meta.etag },
    ]);
}

function buildCertificateSummary(summary, validity) {
    if (!summary) return null;
    const rows = [
        { label: 'Subject CN', value: summary.subjectCN, skipEmpty: true },
        { label: 'Issuer CN', value: summary.issuerCN, skipEmpty: true },
        { label: 'Serial', value: summary.serialNumberHex ? `0x${summary.serialNumberHex.toUpperCase()}` : null },
        { label: 'Not Before', value: formatOpensslDate(summary.notBefore) },
        { label: 'Not After', value: formatDateWithRelative(summary.notAfter, validity?.daysUntilExpiry, validity?.secondsUntilExpiry) },
        { label: 'Expired', value: typeof summary.isExpired === 'boolean' ? (summary.isExpired ? 'Yes' : 'No') : null },
    ];
    return createSection('Summary', rows);
}

function buildNameSection(title, name) {
    if (!name) return null;
    const rows = [
        { label: 'Distinguished Name', value: name.dn },
        { label: 'Attributes', value: Array.isArray(name.rdns) ? name.rdns.map(r => `${r.shortName ?? r.oid}=${r.value}`) : null },
    ];
    return createSection(title, rows);
}

function buildValiditySection(validity) {
    if (!validity) return null;
    const rows = [
        { label: 'Not Before', value: formatOpensslDate(validity.notBefore) },
        { label: 'Not After', value: formatDateWithRelative(validity.notAfter, validity.daysUntilExpiry, validity.secondsUntilExpiry) },
        { label: 'Days Until Expiry', value: typeof validity.daysUntilExpiry === 'number' && Number.isFinite(validity.daysUntilExpiry) ? validity.daysUntilExpiry : null, skipEmpty: true },
        { label: 'Seconds Until Expiry', value: typeof validity.secondsUntilExpiry === 'number' && Number.isFinite(validity.secondsUntilExpiry) ? validity.secondsUntilExpiry : null, skipEmpty: true },
        { label: 'Expired', value: typeof validity.isExpired === 'boolean' ? (validity.isExpired ? 'Yes' : 'No') : null },
    ];
    return createSection('Validity', rows);
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
    return createSection('Signature', [
        { label: 'Algorithm', value: formatAlgorithm(signature.algorithm) },
        { label: 'Bit Length', value: signature.bitLength ? `${signature.bitLength} bits` : null },
        { label: 'Signature Value', value: createHexValue(signature.valueHex, { summary: 'Signature', bitLength: signature.bitLength, bytesPerRow: 18 }) },
    ]);
}

function buildPublicKeySection(publicKey, extensions) {
    if (!publicKey) return null;
    const rows = [
        { label: 'Algorithm', value: formatAlgorithm(publicKey.algorithm) },
        { label: 'Key Size', value: typeof publicKey.sizeBits === 'number' ? `${publicKey.sizeBits} bits` : null },
    ];
    if (publicKey.exponent) rows.push({ label: 'Exponent', value: publicKey.exponent });
    if (publicKey.curveName || publicKey.curveOid) {
        const curve = publicKey.curveName && publicKey.curveOid && publicKey.curveName !== publicKey.curveOid
            ? `${publicKey.curveName} (${publicKey.curveOid})`
            : publicKey.curveName ?? publicKey.curveOid;
        rows.push({ label: 'Curve', value: curve });
    }
    if (extensions?.subjectKeyIdentifier) {
        rows.push({ label: 'Subject Key Identifier', value: formatDigest(extensions.subjectKeyIdentifier) });
    }
    if (publicKey.fingerprints) {
        rows.push({
            label: 'Fingerprints',
            value: Object.entries(publicKey.fingerprints).map(([algo, hex]) => `${algo.toUpperCase()}: ${formatDigest(hex)}`),
        });
    }
    if (publicKey.modulusHex) {
        rows.push({ label: 'Modulus', value: createHexValue(publicKey.modulusHex, { summary: 'Modulus', bitLength: publicKey.sizeBits, bytesPerRow: 16 }) });
    }
    if (publicKey.subjectPublicKeyHex) {
        rows.push({ label: 'Subject Public Key', value: createHexValue(publicKey.subjectPublicKeyHex, { summary: 'Subject Public Key', bitLength: publicKey.sizeBits, bytesPerRow: 16 }) });
    }
    return createSection('Subject Public Key Info', rows);
}

function describeBasicConstraints(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical', `CA: ${data.isCA ? 'TRUE' : 'FALSE'}`];
    if (data.pathLenConstraint !== null && data.pathLenConstraint !== undefined) {
        lines.push(`pathLenConstraint: ${data.pathLenConstraint}`);
    }
    return lines;
}

function describeKeyUsage(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (Array.isArray(data.enabled) && data.enabled.length) lines.push(`enabled: ${data.enabled.join(', ')}`);
    if (data.rawHex) lines.push(createHexValue(data.rawHex, { summary: 'Raw Bits', threshold: 80, bytesPerRow: 8 }));
    return lines;
}

function describeExtendedKeyUsage(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (Array.isArray(data.usages) && data.usages.length) lines.push(`usages: ${data.usages.join(', ')}`);
    if (Array.isArray(data.oids) && data.oids.length) lines.push(`oids: ${data.oids.join(', ')}`);
    return lines;
}

function describeSubjectAltName(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (Array.isArray(data.dnsNames) && data.dnsNames.length) lines.push(`DNS: ${data.dnsNames.join(', ')}`);
    if (Array.isArray(data.emailAddresses) && data.emailAddresses.length) lines.push(`Email: ${data.emailAddresses.join(', ')}`);
    if (Array.isArray(data.ipAddresses) && data.ipAddresses.length) lines.push(`IP: ${data.ipAddresses.join(', ')}`);
    if (Array.isArray(data.uris) && data.uris.length) lines.push(`URI: ${data.uris.join(', ')}`);
    if (Array.isArray(data.directoryNames) && data.directoryNames.length) {
        lines.push(...data.directoryNames.map(entry => `DirName: ${entry.dn}`));
    }
    if (Array.isArray(data.registeredIds) && data.registeredIds.length) lines.push(`Registered IDs: ${data.registeredIds.join(', ')}`);
    if (Array.isArray(data.otherNames) && data.otherNames.length) {
        lines.push(...data.otherNames.map(entry => `OtherName ${entry.oid}: ${formatDigest(entry.valueHex) ?? entry.valueHex}`));
    }
    return lines;
}

function describeAuthorityInfoAccess(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (Array.isArray(data.ocsp) && data.ocsp.length) lines.push(`OCSP: ${data.ocsp.join(', ')}`);
    if (Array.isArray(data.caIssuers) && data.caIssuers.length) lines.push(`CA Issuers: ${data.caIssuers.join(', ')}`);
    if (Array.isArray(data.other) && data.other.length) {
        for (const entry of data.other) {
            lines.push(`${entry.method}: ${entry.locations.join(', ')}`);
        }
    }
    return lines;
}

function describeCRLDP(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (Array.isArray(data.urls) && data.urls.length) lines.push(`URLs: ${data.urls.join(', ')}`);
    if (Array.isArray(data.directoryNames) && data.directoryNames.length) lines.push(`Directory Names: ${data.directoryNames.join(', ')}`);
    return lines;
}

function describeCertificatePolicies(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (Array.isArray(data.items) && data.items.length) {
        for (const item of data.items) {
            const qualifierText = Array.isArray(item.qualifiers) && item.qualifiers.length
                ? ` [${item.qualifiers.map(q => `${q.oid}${q.value ? `=${q.value}` : ''}`).join(', ')}]`
                : '';
            lines.push(`${item.oid}${qualifierText}`);
        }
    }
    return lines;
}

function describeAuthorityKeyIdentifier(data) {
    if (!data) return null;
    const lines = [data.critical ? 'critical' : 'not critical'];
    if (data.keyIdentifier) lines.push(`keyIdentifier: ${formatDigest(data.keyIdentifier) ?? data.keyIdentifier}`);
    if (Array.isArray(data.authorityCertIssuer) && data.authorityCertIssuer.length) lines.push(`authorityCertIssuer: ${data.authorityCertIssuer.join(', ')}`);
    if (data.authorityCertSerialNumber) lines.push(`authorityCertSerialNumber: 0x${data.authorityCertSerialNumber.toUpperCase()}`);
    return lines;
}

function buildExtensionsSection(extensions) {
    if (!extensions) return null;
    const rows = [];
    const basicConstraints = describeBasicConstraints(extensions.basicConstraints);
    if (basicConstraints) rows.push({ label: 'Basic Constraints', value: basicConstraints });
    const keyUsage = describeKeyUsage(extensions.keyUsage);
    if (keyUsage) rows.push({ label: 'Key Usage', value: keyUsage });
    const eku = describeExtendedKeyUsage(extensions.extendedKeyUsage);
    if (eku) rows.push({ label: 'Extended Key Usage', value: eku });
    const san = describeSubjectAltName(extensions.subjectAltName);
    if (san) rows.push({ label: 'Subject Alternative Name', value: san });
    const aia = describeAuthorityInfoAccess(extensions.authorityInfoAccess);
    if (aia) rows.push({ label: 'Authority Information Access', value: aia });
    const crldp = describeCRLDP(extensions.crlDistributionPoints);
    if (crldp) rows.push({ label: 'CRL Distribution Points', value: crldp });
    const policies = describeCertificatePolicies(extensions.certificatePolicies);
    if (policies) rows.push({ label: 'Certificate Policies', value: policies });
    if (extensions.subjectKeyIdentifier) rows.push({ label: 'Subject Key Identifier', value: formatDigest(extensions.subjectKeyIdentifier) });
    const authorityKeyIdentifier = describeAuthorityKeyIdentifier(extensions.authorityKeyIdentifier);
    if (authorityKeyIdentifier) rows.push({ label: 'Authority Key Identifier', value: authorityKeyIdentifier });
    if (Array.isArray(extensions.present) && extensions.present.length) {
        rows.push({ label: 'Present Extensions', value: extensions.present.map(ext => `${ext.oid}${ext.critical ? ' (critical)' : ''}`) });
    }
    return createSection('Extensions', rows);
}

function buildCertificateSections(details) {
    if (!details) return [];
    const sections = [];
    const summarySection = buildCertificateSummary(details.summary, details.validity);
    if (summarySection) sections.push(summarySection);
    const dataSection = createSection('Data', [
        { label: 'Version', value: details.version ? `Version ${details.version} (0x${Math.max(0, details.version - 1).toString(16)})` : null },
        { label: 'Serial Number', value: formatSerial(details.serialNumber) },
        { label: 'Signature Algorithm', value: formatAlgorithm(details.signature?.algorithm) },
    ]);
    if (dataSection) sections.push(dataSection);
    const validitySection = buildValiditySection(details.validity);
    if (validitySection) sections.push(validitySection);
    const issuerSection = buildNameSection('Issuer', details.issuer);
    if (issuerSection) sections.push(issuerSection);
    const subjectSection = buildNameSection('Subject', details.subject);
    if (subjectSection) sections.push(subjectSection);
    const publicKeySection = buildPublicKeySection(details.publicKey, details.extensions);
    if (publicKeySection) sections.push(publicKeySection);
    const fingerprintsSection = buildFingerprintsSection(details.fingerprints, 'Certificate Fingerprints');
    if (fingerprintsSection) sections.push(fingerprintsSection);
    const signatureSection = buildSignatureSection(details.signature);
    if (signatureSection) sections.push(signatureSection);
    const extensionsSection = buildExtensionsSection(details.extensions);
    if (extensionsSection) sections.push(extensionsSection);
    return sections;
}

function buildCrlSummary(summary) {
    if (!summary) return null;
    return createSection('Summary', [
        { label: 'Issuer CN', value: summary.issuerCN, skipEmpty: true },
        { label: 'CRL Number', value: summary.crlNumber },
        { label: 'Entries', value: typeof summary.entryCount === 'number' ? formatNumber(summary.entryCount) : summary.entryCount },
        { label: 'Delta CRL', value: typeof summary.isDelta === 'boolean' ? (summary.isDelta ? 'Yes' : 'No') : null },
    ]);
}

function buildCrlValiditySection(validity) {
    if (!validity) return null;
    const rows = [
        { label: 'This Update', value: formatOpensslDate(validity.thisUpdate) },
        { label: 'Next Update', value: formatDateWithRelative(validity.nextUpdate, null, validity.secondsUntilNextUpdate) },
        { label: 'Seconds Until Next Update', value: typeof validity.secondsUntilNextUpdate === 'number' && Number.isFinite(validity.secondsUntilNextUpdate) ? validity.secondsUntilNextUpdate : null, skipEmpty: true },
        { label: 'Expired', value: typeof validity.isExpired === 'boolean' ? (validity.isExpired ? 'Yes' : 'No') : null },
    ];
    return createSection('Validity', rows);
}

function buildCrlNumbersSection(numbers, isDelta) {
    if (!numbers) return null;
    const rows = [
        { label: 'CRL Number', value: numbers.crlNumber },
        { label: 'Base CRL Number', value: numbers.baseCRLNumber, skipEmpty: true },
        { label: 'Delta CRL', value: typeof isDelta === 'boolean' ? (isDelta ? 'Yes' : 'No') : null },
    ];
    return createSection('Numbers', rows);
}

function buildCrlEntriesSection(entries) {
    if (!entries) return null;
    const rows = [
        { label: 'Total', value: typeof entries.count === 'number' ? formatNumber(entries.count) : entries.count },
    ];
    if (entries.count === 0) {
        rows.push({ label: 'Sample', value: 'No revoked certificates' });
    } else if (Array.isArray(entries.sample) && entries.sample.length) {
        const lines = entries.sample.map(entry => {
            const serialParts = [];
            if (entry.serialNumber?.decimal) serialParts.push(entry.serialNumber.decimal);
            if (entry.serialNumber?.hex) serialParts.push(`0x${entry.serialNumber.hex.toUpperCase()}`);
            const when = formatOpensslDate(entry.revocationDate);
            const reason = entry.reason ? `reason: ${entry.reason}` : null;
            return [
                `Serial: ${serialParts.join(' / ')}`,
                when ? `Revoked: ${when}` : null,
                reason,
            ].filter(Boolean).join(' — ');
        });
        rows.push({ label: 'Sample', value: lines });
    }
    return createSection('Revoked Certificates', rows);
}

function buildCrlExtensionsSection(extensions) {
    if (!Array.isArray(extensions) || extensions.length === 0) return null;
    return createSection('Extensions', [
        { label: 'Present', value: extensions.map(ext => `${ext.oid}${ext.critical ? ' (critical)' : ''}`) },
    ]);
}

function buildCrlSections(details) {
    if (!details) return [];
    const sections = [];
    const summarySection = buildCrlSummary(details.summary);
    if (summarySection) sections.push(summarySection);
    const issuerSection = buildNameSection('Issuer', details.issuer);
    if (issuerSection) sections.push(issuerSection);
    const numbersSection = buildCrlNumbersSection(details.numbers, details.isDelta);
    if (numbersSection) sections.push(numbersSection);
    const validitySection = buildCrlValiditySection(details.validity);
    if (validitySection) sections.push(validitySection);
    if (details.authorityKeyIdentifier) {
        sections.push(createSection('Authority Key Identifier', [
            { label: 'Key Identifier', value: formatDigest(details.authorityKeyIdentifier) ?? details.authorityKeyIdentifier },
        ]));
    }
    const fingerprintsSection = buildFingerprintsSection(details.fingerprints, 'CRL Fingerprints');
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
    const pre = document.createElement('pre');
    pre.className = 'detail-raw';
    pre.textContent = JSON.stringify(details, null, 2);
    return pre;
}

function buildDetailView(meta) {
    const article = document.createElement('article');
    article.className = 'detail-view';
    if (meta?.type) article.dataset.type = meta.type;

    const header = document.createElement('div');
    header.className = 'detail-header';
    const title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = meta?.type === 'certificate'
        ? 'Certificate'
        : meta?.type === 'crl'
            ? 'Certificate Revocation List'
            : 'Object';
    header.append(title);
    if (meta?.details?.summary?.subjectCN) {
        const highlight = document.createElement('div');
        highlight.className = 'detail-highlight';
        highlight.textContent = meta.details.summary.subjectCN;
        header.append(highlight);
    } else if (meta?.details?.summary?.issuerCN && meta.type === 'crl') {
        const highlight = document.createElement('div');
        highlight.className = 'detail-highlight';
        highlight.textContent = meta.details.summary.issuerCN;
        header.append(highlight);
    }
    if (meta?.key) {
        const path = document.createElement('div');
        path.className = 'detail-subtitle';
        path.textContent = `/${meta.key}`;
        header.append(path);
    }
    article.append(header);

    const metaSection = buildMetaSection(meta);
    if (metaSection) article.append(metaSection);

    if (meta?.type === 'certificate') {
        const certSections = buildCertificateSections(meta.details);
        certSections.forEach(section => article.append(section));
    } else if (meta?.type === 'crl') {
        const crlSections = buildCrlSections(meta.details);
        crlSections.forEach(section => article.append(section));
    } else if (meta?.details) {
        article.append(buildUnknownSection(meta.details));
    }

    return article;
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
        const metadata = payload.data;
        panel.innerHTML = '';
        if (metadata && typeof metadata === 'object') {
            const view = buildDetailView(metadata);
            panel.append(view);
        } else {
            const fallback = document.createElement('pre');
            fallback.textContent = JSON.stringify(metadata, null, 2);
            panel.append(fallback);
        }
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
