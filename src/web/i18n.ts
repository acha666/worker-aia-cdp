import { createI18n } from "vue-i18n";
import en from "./locales/en.json";

export const supportedLocales = ["en", "en-US", "en-GB"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const STORAGE_KEY = "locale-preference";

const messages = {
  en,
  "en-US": en,
  "en-GB": en,
} as const;

function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

function normalizeLocale(value?: string | null): SupportedLocale {
  if (!value) return "en";

  const normalized = value.trim();
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const lowercase = normalized.toLowerCase();
  if (lowercase.startsWith("en-gb")) {
    return "en-GB";
  }
  if (lowercase.startsWith("en-us")) {
    return "en-US";
  }
  if (lowercase.startsWith("en")) {
    return "en";
  }

  return "en";
}

function getStoredLocale(): SupportedLocale | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  return normalizeLocale(stored);
}

function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === "undefined") return "en";
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }
  return "en";
}

const initialLocale = getStoredLocale() ?? detectBrowserLocale();

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale,
  fallbackLocale: "en",
  messages,
});

export function setLocale(locale: SupportedLocale) {
  const normalized = normalizeLocale(locale);
  i18n.global.locale.value = normalized;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  }
}
