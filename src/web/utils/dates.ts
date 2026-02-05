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
  if (!iso) return "N/A";
  try {
    const date = new Date(iso);
    const month = MONTH_NAMES[date.getMonth()];
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month} ${day} ${year}`;
  } catch {
    return iso;
  }
}

export function formatDateTimeWithZone(iso: string | null): string {
  if (!iso) return "N/A";
  try {
    const date = new Date(iso);
    const month = MONTH_NAMES[date.getMonth()];
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const tz = formatTimezoneOffset(date);
    return `${month} ${day} ${year} ${hours}:${minutes}:${seconds} (${tz})`;
  } catch {
    return iso;
  }
}

export function formatDateDay(iso: string | null): string {
  if (!iso) return "N/A";
  try {
    const date = new Date(iso);
    const month = MONTH_NAMES[date.getMonth()];
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    const tz = formatTimezoneOffset(date);
    return `${month} ${day} ${year} (${tz})`;
  } catch {
    return iso;
  }
}

export function formatRelativeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
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
      return sign >= 0
        ? `in ${count} ${unit.label}${plural}`
        : `${count} ${unit.label}${plural} ago`;
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

  const segments = [] as string[];
  if (days > 0) segments.push(`${days}d`);
  if (hours > 0) segments.push(`${hours}h`);
  if (minutes > 0 || segments.length === 0) segments.push(`${minutes}m`);

  return sign >= 0 ? `in ${segments.join(" ")}` : `${segments.join(" ")} ago`;
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

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
