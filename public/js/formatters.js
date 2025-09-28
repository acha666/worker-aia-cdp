const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatOpensslDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = MONTH_NAMES[date.getUTCMonth()] ?? "Jan";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${month} ${day} ${hours}:${minutes}:${seconds} ${date.getUTCFullYear()} GMT`;
}

export function formatRelativeDays(days) {
  if (typeof days !== "number" || !Number.isFinite(days)) return null;
  const rounded = Math.round(days);
  if (rounded === 0) return "today";
  const plural = Math.abs(rounded) === 1 ? "day" : "days";
  return rounded > 0 ? `in ${rounded} ${plural}` : `${Math.abs(rounded)} ${plural} ago`;
}

export function formatRelativeSeconds(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const abs = Math.abs(seconds);
  const sign = seconds >= 0 ? 1 : -1;
  const units = [
    { label: "day", value: 86400 },
    { label: "hour", value: 3600 },
    { label: "minute", value: 60 },
    { label: "second", value: 1 },
  ];
  for (const unit of units) {
    if (abs >= unit.value || unit.label === "second") {
      const count = Math.round(abs / unit.value);
      const plural = count === 1 ? "" : "s";
      return sign >= 0 ? `in ${count} ${unit.label}${plural}` : `${count} ${unit.label}${plural} ago`;
    }
  }
  return null;
}

export function formatNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("en-US");
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) return asNumber.toLocaleString("en-US");
  return typeof value === "string" ? value : String(value);
}

export function formatBytes(size) {
  if (typeof size !== "number" || !Number.isFinite(size)) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  const digits = index === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

export function formatAlgorithm(algorithm) {
  if (!algorithm) return null;
  const parts = [];
  if (algorithm.name) parts.push(algorithm.name);
  if (algorithm.oid && algorithm.oid !== algorithm.name) parts.push(`(${algorithm.oid})`);
  return parts.join(" ");
}

export function createMuted(text = "—") {
  const span = document.createElement("span");
  span.className = "detail-muted";
  span.textContent = text;
  return span;
}

export function formatDigest(hex) {
  if (!hex) return null;
  const clean = typeof hex === "string" ? hex.replace(/[^0-9a-f]/gi, "") : "";
  if (!clean) return null;
  return (clean.match(/.{1,2}/g) || []).join(":");
}

export function colonizeHex(hex, bytesPerRow = 16) {
  if (!hex) return "";
  const clean = hex.replace(/[^0-9a-f]/gi, "").toLowerCase();
  const pairs = clean.match(/.{1,2}/g) || [];
  if (pairs.length === 0) return "";
  const lines = [];
  for (let index = 0; index < pairs.length; index += bytesPerRow) {
    lines.push(pairs.slice(index, index + bytesPerRow).join(":"));
  }
  return lines.join("\n");
}

export function hexPreview(hex, count = 8) {
  if (!hex) return "";
  const clean = hex.replace(/[^0-9a-f]/gi, "").toLowerCase();
  const pairs = clean.match(/.{1,2}/g) || [];
  if (pairs.length === 0) return "";
  const slice = pairs.slice(0, count).join(":");
  return pairs.length > count ? `${slice}:…` : slice;
}

export function createHexValue(hex, options = {}) {
  if (!hex) return createMuted();
  const clean = typeof hex === "string" ? hex.replace(/[^0-9a-f]/gi, "").toLowerCase() : "";
  if (!clean) return createMuted();
  const threshold = options.threshold ?? 96;
  if (clean.length <= threshold) {
    const code = document.createElement("code");
    code.className = "hex-inline";
    code.textContent = colonizeHex(clean, options.bytesPerRow ?? 16).replace(/\n/g, " ");
    return code;
  }
  const details = document.createElement("details");
  details.className = "hex-toggle";
  const summary = document.createElement("summary");
  const parts = [];
  if (options.summary) parts.push(options.summary);
  if (options.bitLength) parts.push(`${options.bitLength} bits`);
  const preview = hexPreview(clean, options.previewBytes ?? 12);
  if (preview) parts.push(preview);
  if (parts.length === 0) parts.push("Show hex");
  summary.textContent = parts.join(" • ");
  details.append(summary);
  const pre = document.createElement("pre");
  pre.className = "hex-content";
  pre.textContent = colonizeHex(clean, options.bytesPerRow ?? 16);
  details.append(pre);
  return details;
}

export function renderValue(value, skipEmpty) {
  if (value === null || value === undefined) {
    return skipEmpty ? null : createMuted();
  }
  if (value instanceof Node) return value;
  if (Array.isArray(value)) {
    const items = value.filter(item => item !== null && item !== undefined && item !== "");
    if (items.length === 0) return skipEmpty ? null : createMuted();
    const list = document.createElement("ul");
    list.className = "detail-list";
    for (const item of items) {
      const li = document.createElement("li");
      if (item instanceof Node) li.append(item);
      else if (typeof item === "string") li.textContent = item;
      else li.textContent = String(item);
      list.append(li);
    }
    return list;
  }
  if (typeof value === "string") {
    if (value.length === 0) return skipEmpty ? null : createMuted();
    const span = document.createElement("span");
    span.textContent = value;
    return span;
  }
  if (typeof value === "number") {
    const span = document.createElement("span");
    span.textContent = formatNumber(value);
    return span;
  }
  const span = document.createElement("span");
  span.textContent = String(value);
  return span;
}

export function createSection(title, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const section = document.createElement("div");
  section.className = "detail-section";
  if (title) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);
  }
  const dl = document.createElement("dl");
  dl.className = "detail-grid";
  let hasRows = false;
  for (const row of rows) {
    if (!row || !row.label) continue;
    const rendered = renderValue(row.value, row.skipEmpty);
    if (!rendered) continue;
    const dt = document.createElement("dt");
    dt.textContent = row.label;
    const dd = document.createElement("dd");
    dd.append(rendered);
    dl.append(dt, dd);
    hasRows = true;
  }
  if (!hasRows) return null;
  section.append(dl);
  return section;
}

export function formatSerial(serial) {
  if (!serial) return null;
  let hex = null;
  if (typeof serial === "string") hex = serial.replace(/^0x/i, "");
  else if (typeof serial === "object") {
    if (typeof serial.hex === "string") hex = serial.hex.replace(/^0x/i, "");
    else if (typeof serial.value === "string") hex = serial.value.replace(/^0x/i, "");
  }
  if (!hex) return null;
  const parts = [];
  try {
    const decimal = BigInt(`0x${hex}`).toString(10);
    parts.push(`decimal: ${decimal}`);
  } catch (error) {
    console.warn("serial decimal conversion failed", error);
  }
  parts.push(`hex: 0x${hex.toUpperCase()}`);
  return parts;
}

export function formatDateWithRelative(iso, days, seconds) {
  const base = formatOpensslDate(iso);
  if (!base) return null;
  const rel = formatRelativeDays(days ?? null) ?? formatRelativeSeconds(seconds ?? null);
  return rel ? `${base} (${rel})` : base;
}
