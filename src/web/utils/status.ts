export type CertificateStatusState = "valid" | "expired" | "not-yet-valid";
export type CrlStatusState = "current" | "stale" | "expired";

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function computeCertificateStatus(
  notBefore?: string | null,
  notAfter?: string | null,
  nowMs: number = Date.now()
): {
  state: CertificateStatusState;
  startsIn?: number;
  expiresIn?: number;
  expiredAgo?: number;
} {
  const notBeforeDate = parseIsoDate(notBefore);
  const notAfterDate = parseIsoDate(notAfter);

  if (notBeforeDate && nowMs < notBeforeDate.getTime()) {
    return {
      state: "not-yet-valid",
      startsIn: Math.floor((notBeforeDate.getTime() - nowMs) / SECOND_MS),
    };
  }

  if (notAfterDate && nowMs > notAfterDate.getTime()) {
    return {
      state: "expired",
      expiredAgo: Math.floor((nowMs - notAfterDate.getTime()) / SECOND_MS),
    };
  }

  if (notAfterDate) {
    return {
      state: "valid",
      expiresIn: Math.floor((notAfterDate.getTime() - nowMs) / SECOND_MS),
    };
  }

  return { state: "valid" };
}

export function computeCrlStatus(
  thisUpdate?: string | null,
  nextUpdate?: string | null,
  nowMs: number = Date.now()
): {
  state: CrlStatusState;
  expiresIn?: number;
  expiredAgo?: number;
} {
  const thisUpdateDate = parseIsoDate(thisUpdate);
  const nextUpdateDate = parseIsoDate(nextUpdate);

  if (nextUpdateDate) {
    if (nowMs > nextUpdateDate.getTime()) {
      return {
        state: "expired",
        expiredAgo: Math.floor((nowMs - nextUpdateDate.getTime()) / SECOND_MS),
      };
    }

    if (thisUpdateDate) {
      const validityPeriod = nextUpdateDate.getTime() - thisUpdateDate.getTime();
      const elapsed = nowMs - thisUpdateDate.getTime();
      if (validityPeriod > 0 && elapsed > validityPeriod * 0.8) {
        return {
          state: "stale",
          expiresIn: Math.floor((nextUpdateDate.getTime() - nowMs) / SECOND_MS),
        };
      }
    }

    return {
      state: "current",
      expiresIn: Math.floor((nextUpdateDate.getTime() - nowMs) / SECOND_MS),
    };
  }

  return { state: "current" };
}

export function computeCertificateValidity(
  notBefore?: string | null,
  notAfter?: string | null,
  nowMs: number = Date.now()
): {
  validityPeriodDays?: number;
  daysRemaining?: number | null;
} {
  const notBeforeDate = parseIsoDate(notBefore);
  const notAfterDate = parseIsoDate(notAfter);

  if (!notBeforeDate || !notAfterDate) {
    return {};
  }

  const totalDays = Math.ceil((notAfterDate.getTime() - notBeforeDate.getTime()) / DAY_MS);
  const remainingMs = notAfterDate.getTime() - nowMs;

  return {
    validityPeriodDays: Math.max(0, totalDays),
    daysRemaining: remainingMs >= 0 ? Math.ceil(remainingMs / DAY_MS) : null,
  };
}

export function computeCrlValidity(
  thisUpdate?: string | null,
  nextUpdate?: string | null,
  nowMs: number = Date.now()
): {
  validityPeriodHours?: number;
  hoursRemaining?: number | null;
} {
  const thisUpdateDate = parseIsoDate(thisUpdate);
  const nextUpdateDate = parseIsoDate(nextUpdate);

  if (!thisUpdateDate || !nextUpdateDate) {
    return {};
  }

  const totalHours = Math.ceil((nextUpdateDate.getTime() - thisUpdateDate.getTime()) / HOUR_MS);
  const remainingMs = nextUpdateDate.getTime() - nowMs;

  return {
    validityPeriodHours: Math.max(0, totalHours),
    hoursRemaining: remainingMs >= 0 ? Math.ceil(remainingMs / HOUR_MS) : null,
  };
}
