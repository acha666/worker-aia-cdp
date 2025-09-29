const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTimezoneOffset(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const hourPart = String(hours);
  if (minutes === 0) return `UTC${sign}${hourPart}`;
  return `UTC${sign}${hourPart}:${String(minutes).padStart(2, "0")}`;
}

export function formatOpensslDate(iso, options = {}) {
  if (!iso) return null;
  const summary = formatDateSummary(iso, null, null, options);
  if (!summary) {
    return typeof iso === "string" ? iso : String(iso);
  }
  return summary.timezone ? `${summary.baseText} ${summary.timezone}` : summary.baseText;
}

export function formatDateSummary(iso, days, seconds, options = {}) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const { precision = "second" } = options;
  const month = MONTH_NAMES[date.getMonth()] ?? "Jan";
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  const baseParts = [`${month} ${day} ${year}`];
  if (precision !== "day") {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    if (precision === "minute") {
      baseParts.push(`${hours}:${minutes}`);
    } else {
      const secondsPart = String(date.getSeconds()).padStart(2, "0");
      baseParts.push(`${hours}:${minutes}:${secondsPart}`);
    }
  }
  const baseText = baseParts.join(" ");
  const timezone = formatTimezoneOffset(date);
  const secondsValue = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : null;
  const daysValue = typeof days === "number" && Number.isFinite(days) ? days : null;
  const preferSubDay = secondsValue !== null && Math.abs(secondsValue) < 86400;
  let relativeText = null;
  if (preferSubDay) relativeText = formatRelativeSeconds(secondsValue);
  if (!relativeText && (daysValue !== null || secondsValue !== null)) {
    relativeText = formatRelativeDays(daysValue) ?? formatRelativeSeconds(secondsValue);
  }
  return {
    baseText,
    timezone,
    relativeText,
  };
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
  if (abs < 86400) {
    if (abs === 0) return "now";
    const totalMinutes = Math.max(1, Math.round(abs / 60));
    let hours = Math.floor(totalMinutes / 60);
    let minutes = totalMinutes % 60;
    if (hours === 0 && minutes === 0) minutes = 1;
    if (hours > 0 && minutes === 60) {
      hours += 1;
      minutes = 0;
    }
    const segments = [];
    if (hours > 0) segments.push(`${hours}h`);
    if (minutes > 0 || segments.length === 0) segments.push(`${minutes}m`);
    return sign >= 0 ? `in ${segments.join(" ")}` : `${segments.join(" ")} ago`;
  }
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

export function createMonoValue(content) {
  if (content === null || content === undefined) return null;
  const text = typeof content === "string" ? content : String(content);
  if (!text) return null;
  const span = document.createElement("span");
  span.className = "detail-inline-pair__value detail-inline-pair__value--mono";
  span.textContent = text;
  return span;
}

export function formatDigest(hex) {
  if (!hex) return null;
  const clean = typeof hex === "string" ? hex.replace(/[^0-9a-f]/gi, "") : "";
  if (!clean) return null;
  return (clean.match(/.{1,2}/g) || []).join(":");
}

export function colonizeHex(hex) {
  if (!hex) return "";
  const clean = hex.replace(/[^0-9a-f]/gi, "").toLowerCase();
  const pairs = clean.match(/.{1,2}/g) || [];
  if (pairs.length === 0) return "";
  return pairs.join(":");
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
  code.textContent = colonizeHex(clean);
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
  pre.textContent = colonizeHex(clean);
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

export function createInlinePairs(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const validEntries = entries
    .map(entry => {
      if (!entry) return null;
      const label = entry.label ?? null;
      const value = entry.value ?? null;
      if (!label) return null;
      if (value === null || value === undefined || value === "") return null;
      return {
        label: String(label).trim(),
        value,
        valueClass: entry.valueClass ?? null,
      };
    })
    .filter(Boolean);
  if (!validEntries.length) return null;
  const container = document.createElement("div");
  container.className = "detail-inline-pairs";
  validEntries.forEach(entry => {
    const item = document.createElement("div");
    item.className = "detail-inline-pair";
    const label = document.createElement("span");
    label.className = "detail-inline-pair__label";
    const text = entry.label.endsWith(":") ? entry.label : `${entry.label}:`;
    label.textContent = text;
    const value = document.createElement("span");
    value.className = "detail-inline-pair__value";
    if (options.valueClass) value.classList.add(options.valueClass);
    if (entry.valueClass) value.classList.add(entry.valueClass);
    if (entry.value instanceof Node) value.append(entry.value);
    else value.textContent = typeof entry.value === "string" ? entry.value : String(entry.value);
    item.append(label, value);
    container.append(item);
  });
  return container;
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
  const pairs = [];
  try {
    const decimal = BigInt(`0x${hex}`).toString(10);
    pairs.push({ label: "Decimal", value: decimal, valueClass: "detail-inline-pair__value--mono" });
  } catch (error) {
    console.warn("serial decimal conversion failed", error);
  }
  pairs.push({ label: "Hex", value: `0x${hex.toUpperCase()}`, valueClass: "detail-inline-pair__value--mono" });
  return createInlinePairs(pairs);
}

export function formatDateWithRelative(iso, days, seconds, options = {}) {
  const summary = formatDateSummary(iso, days, seconds, options);
  if (!summary) return formatOpensslDate(iso, options);
  const parts = [summary.baseText];
  if (summary.timezone) parts.push(summary.timezone);
  let text = parts.join(" ");
  if (summary.relativeText) text += ` (${summary.relativeText})`;
  return text;
}
