<script setup lang="ts">
import { useTheme } from "../composables/useTheme";

const { theme, toggleTheme } = useTheme();

const getThemeIcon = () => {
  switch (theme.value) {
    case "dark":
      return "moon";
    case "light":
      return "sun";
    default:
      return "auto";
  }
};

const getThemeLabel = () => {
  return theme.value.charAt(0).toUpperCase() + theme.value.slice(1);
};
</script>

<template>
  <button
    class="relative inline-flex items-center justify-center p-2 rounded-lg text-gray-700 dark:text-dark-text-muted hover:bg-gray-200 dark:hover:bg-dark-surface transition-colors"
    :title="`Switch theme (currently: ${getThemeLabel()})`"
    :aria-label="`Theme: ${getThemeLabel()}`"
    @click="toggleTheme"
  >
    <!-- Sun icon (light mode) -->
    <svg v-if="getThemeIcon() === 'sun'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M10 2a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536a1 1 0 10 1.414 1.414l1.414-1.414a1 1 0 00-1.414-1.414l-1.414 1.414zM2.05 6.464A1 1 0 103.464 5.05L2.05 6.464zm12.728 0l-1.414-1.414a1 1 0 00-1.414 1.414l1.414 1.414a1 1 0 001.414-1.414zM17 11a1 1 0 100-2h-2a1 1 0 100 2h2zm-15 0a1 1 0 100-2H2a1 1 0 100 2h2z"
        clip-rule="evenodd"
      />
    </svg>

    <!-- Moon icon (dark mode) -->
    <svg
      v-else-if="getThemeIcon() === 'moon'"
      class="w-5 h-5"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>

    <!-- Auto icon (system preference) -->
    <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
      />
    </svg>
  </button>
</template>
