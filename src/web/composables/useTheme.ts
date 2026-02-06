import { ref, onMounted } from "vue";

type Theme = "light" | "dark" | "auto";

const STORAGE_KEY = "theme-preference";

export function useTheme() {
  const theme = ref<Theme>("auto");
  const isDark = ref(false);

  const applyTheme = (newTheme: Theme) => {
    theme.value = newTheme;
    localStorage.setItem(STORAGE_KEY, newTheme);

    const html = document.documentElement;
    const prefersDark =
      newTheme === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : newTheme === "dark";

    isDark.value = prefersDark;

    if (prefersDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  };

  const initializeTheme = () => {
    // Get saved preference or default to auto
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initialTheme = (saved || "auto") as Theme;

    // Apply initial theme
    applyTheme(initialTheme);

    // Listen for system preference changes if in auto mode
    if (initialTheme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        isDark.value = e.matches;
        if (theme.value === "auto") {
          applyTheme("auto");
        }
      };

      // Modern API
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
      }
    }
  };

  const setTheme = (newTheme: Theme) => {
    applyTheme(newTheme);
  };

  const toggleTheme = () => {
    const themes: Theme[] = ["auto", "light", "dark"];
    const currentIndex = themes.indexOf(theme.value);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  onMounted(() => {
    initializeTheme();
  });

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
}
