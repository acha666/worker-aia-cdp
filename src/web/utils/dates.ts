import { i18n } from "../i18n";

function getLocale(): string {
  return i18n.global.locale.value || "en";
}

function t(key: string, named?: Record<string, string | number>): string {
  if (named) {
    return i18n.global.t(key, named) as string;
  }
  return i18n.global.t(key) as string;
}

function getNotAvailable(): string {
  return t("common.notAvailable");
}

function formatDatePart(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTimePart(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function withDirection(value: string, sign: number): string {
  return sign >= 0 ? t("dates.in", { value }) : t("dates.ago", { value });
}

export function formatTimezoneOffset(date: Date): string {
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

export function formatDateReadable(iso: string | null): string {
  if (!iso) return getNotAvailable();
  try {
    const date = new Date(iso);
    return formatDatePart(date);
  } catch {
    return iso;
  }
}

export function formatDateTimeWithZone(iso: string | null): string {
  if (!iso) return getNotAvailable();
  try {
    const date = new Date(iso);
    const datePart = formatDatePart(date);
    const timePart = formatTimePart(date);
    const tz = formatTimezoneOffset(date);
    return `${datePart} ${timePart} (${tz})`;
  } catch {
    return iso;
  }
}

export function formatDateDay(iso: string | null): string {
  if (!iso) return getNotAvailable();
  try {
    const date = new Date(iso);
    const datePart = formatDatePart(date);
    const tz = formatTimezoneOffset(date);
    return `${datePart} (${tz})`;
  } catch {
    return iso;
  }
}

export function formatDateDayWithoutTimezone(iso: string | null): string {
  if (!iso) return getNotAvailable();
  try {
    const date = new Date(iso);
    return formatDatePart(date);
  } catch {
    return iso;
  }
}

export function formatRelativeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const abs = Math.abs(seconds);
  const sign = seconds >= 0 ? 1 : -1;

  if (abs < 86400) {
    if (abs === 0) return t("dates.now");
    const totalMinutes = Math.max(1, Math.round(abs / 60));
    let hours = Math.floor(totalMinutes / 60);
    let minutes = totalMinutes % 60;
    if (hours === 0 && minutes === 0) minutes = 1;
    if (hours > 0 && minutes === 60) {
      hours += 1;
      minutes = 0;
    }
    const segments: string[] = [];
    if (hours > 0) segments.push(`${hours}${t("dates.short.hour")}`);
    if (minutes > 0 || segments.length === 0) {
      segments.push(`${minutes}${t("dates.short.minute")}`);
    }
    return withDirection(segments.join(" "), sign);
  }

  const units: { unit: Intl.RelativeTimeFormatUnit; value: number }[] = [
    { unit: "day", value: 86400 },
    { unit: "hour", value: 3600 },
    { unit: "minute", value: 60 },
    { unit: "second", value: 1 },
  ];

  const relativeFormatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: "always" });

  for (const unit of units) {
    if (abs >= unit.value || unit.unit === "second") {
      const count = Math.round(abs / unit.value);
      return relativeFormatter.format(sign * count, unit.unit);
    }
  }
  return "";
}

export function getRelativeTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);
    return formatRelativeSeconds(diffSeconds);
  } catch {
    return "";
  }
}

export function formatRelativeDetailedSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const sign = seconds >= 0 ? 1 : -1;
  const absSeconds = Math.abs(seconds);
  const totalMinutes = Math.max(1, Math.round(absSeconds / 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const segments: string[] = [];
  if (days > 0) segments.push(`${days}${t("dates.short.day")}`);
  if (hours > 0) segments.push(`${hours}${t("dates.short.hour")}`);
  if (minutes > 0 || segments.length === 0) segments.push(`${minutes}${t("dates.short.minute")}`);

  return withDirection(segments.join(" "), sign);
}

export function getRelativeTimeDetailed(iso: string | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);
    return formatRelativeDetailedSeconds(diffSeconds);
  } catch {
    return "";
  }
}
