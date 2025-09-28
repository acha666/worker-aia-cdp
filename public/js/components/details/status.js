import { formatRelativeDays, formatRelativeSeconds } from "../../formatters.js";

function formatStatusRelative(days, seconds) {
  const secondsValue = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : null;
  const daysValue = typeof days === "number" && Number.isFinite(days) ? days : null;
  const preferSubDay = secondsValue !== null && Math.abs(secondsValue) < 86400;
  if (preferSubDay) {
    const relSeconds = formatRelativeSeconds(secondsValue);
    if (relSeconds) return relSeconds;
  }
  return formatRelativeDays(daysValue) ?? formatRelativeSeconds(secondsValue);
}

export function computeTemporalStatus(iso) {
  if (!iso) return { secondsUntil: null, daysUntil: null, isExpired: null };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { secondsUntil: null, daysUntil: null, isExpired: null };
  const diffMs = date.getTime() - Date.now();
  const secondsUntil = Math.floor(diffMs / 1000);
  const daysUntil = Math.floor(secondsUntil / 86400);
  return {
    secondsUntil,
    daysUntil,
    isExpired: diffMs < 0,
  };
}

export function createChip(text, { category = "status", tone = "neutral" } = {}) {
  if (!text) return null;
  const span = document.createElement("span");
  const safeCategory = category.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "status";
  const safeTone = tone.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "neutral";
  span.className = `detail-chip detail-chip--${safeCategory} detail-chip--${safeCategory}-${safeTone}`;
  span.textContent = text;
  return span;
}

export function describeCertificateStatus(expiryStatus, options = {}) {
  if (!expiryStatus || typeof expiryStatus.isExpired !== "boolean") return null;
  const { soonThresholdDays = 30 } = options;
  const rel = formatStatusRelative(expiryStatus.daysUntil, expiryStatus.secondsUntil);
  if (expiryStatus.isExpired) {
    return { label: "Expired", variant: "danger", description: rel ?? "Expired" };
  }
  if (
    typeof expiryStatus.daysUntil === "number" &&
    Number.isFinite(expiryStatus.daysUntil) &&
    expiryStatus.daysUntil <= soonThresholdDays
  ) {
    return { label: "Expiring soon", variant: "warning", description: rel ?? null };
  }
  return { label: "Active", variant: "success", description: rel ?? null };
}

export function describeCrlStatus(nextUpdateStatus, isDelta, options = {}) {
  if (!nextUpdateStatus || typeof nextUpdateStatus.isExpired !== "boolean") return null;
  const { warningThresholdDays = 1 } = options;
  const rel = formatStatusRelative(nextUpdateStatus.daysUntil, nextUpdateStatus.secondsUntil);
  if (nextUpdateStatus.isExpired) {
    return { label: "Stale", variant: "danger", description: rel ?? "Next update overdue" };
  }
  if (
    typeof nextUpdateStatus.daysUntil === "number" &&
    Number.isFinite(nextUpdateStatus.daysUntil) &&
    nextUpdateStatus.daysUntil <= warningThresholdDays
  ) {
    return { label: "Updating soon", variant: "warning", description: rel ?? null };
  }
  return { label: isDelta ? "Delta current" : "Current", variant: "success", description: rel ?? null };
}

export function renderStatusDisplay(descriptor, { detailed = false } = {}) {
  if (!descriptor) return null;
  if (!detailed) return createChip(descriptor.label, { category: "status", tone: descriptor.variant ?? "neutral" });
  const wrapper = document.createElement("div");
  wrapper.className = "detail-status";
  const chip = createChip(descriptor.label, { category: "status", tone: descriptor.variant ?? "neutral" });
  if (chip) wrapper.append(chip);
  if (descriptor.description) {
    const meta = document.createElement("span");
    meta.className = "detail-status__note";
    meta.textContent = descriptor.description;
    wrapper.append(meta);
  }
  return wrapper.childElementCount ? wrapper : chip;
}
