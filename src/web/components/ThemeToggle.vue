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
  <v-btn
    icon
    variant="text"
    :title="`Switch theme (currently: ${getThemeLabel()})`"
    :aria-label="`Theme: ${getThemeLabel()}`"
    @click="toggleTheme"
  >
    <v-icon v-if="getThemeIcon() === 'sun'" icon="mdi-white-balance-sunny" />
    <v-icon v-else-if="getThemeIcon() === 'moon'" icon="mdi-moon-waning-crescent" />
    <v-icon v-else icon="mdi-theme-light-dark" />
  </v-btn>
</template>
