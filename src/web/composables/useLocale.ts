import { computed } from "vue";
import { i18n, setLocale, type SupportedLocale } from "../i18n";

const localeOptions: { value: SupportedLocale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
];

export function useLocale() {
  const locale = computed<SupportedLocale>({
    get: () => i18n.global.locale.value as SupportedLocale,
    set: (value) => setLocale(value),
  });

  return {
    locale,
    localeOptions,
    setLocale,
  };
}
