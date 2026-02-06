<script setup lang="ts">
import { computed } from "vue";
import { copyToClipboard, formatHex, formatHexGroups, normalizeHexForCopy } from "../utils/format";

const props = withDefaults(
  defineProps<{
    value?: string | null;
    variant?: "grouped" | "plain";
    groupSize?: number;
    separator?: string;
    showCopy?: boolean;
    block?: boolean;
    valueClass?: string;
    fallback?: string;
  }>(),
  {
    variant: "plain",
    groupSize: 2,
    separator: ":",
    showCopy: true,
    block: false,
    valueClass: "font-mono text-sm break-all",
    fallback: "",
  }
);

const formattedValue = computed(() => {
  if (!props.value) return null;
  if (props.variant === "grouped") {
    return formatHexGroups(props.value, { groupSize: props.groupSize });
  }
  return formatHex(props.value, { groupSize: 0, separator: "" });
});

const copyValue = computed(() => {
  if (!props.value) return "";
  return normalizeHexForCopy(props.value);
});

const rootTag = computed(() => (props.block ? "div" : "span"));
const rootClasses = computed(() => [
  props.block ? "flex" : "inline-flex",
  "items-baseline",
  "gap-1",
  "min-w-0",
]);
</script>

<template>
  <component :is="rootTag" :class="rootClasses">
    <span v-if="!Array.isArray(formattedValue)" :class="[valueClass, 'min-w-0']">
      {{ formattedValue ?? fallback }}
    </span>
    <span v-else :class="[valueClass, 'min-w-0']">
      <template v-for="(group, index) in formattedValue" :key="index">
        <span v-if="index > 0">{{ separator }}</span
        ><wbr />
        <span>{{ group }}</span>
      </template>
    </span>
    <button
      v-if="showCopy && copyValue"
      type="button"
      class="inline-flex items-baseline leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
      title="Copy"
      @click="copyToClipboard(copyValue)"
    >
      <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    </button>
  </component>
</template>
