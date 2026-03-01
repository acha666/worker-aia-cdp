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
const rootClasses = computed(() => [props.block ? "d-flex" : "d-inline-flex", "align-baseline"]);
</script>

<template>
  <component :is="rootTag" :class="rootClasses">
    <span v-if="!Array.isArray(formattedValue)" :class="[valueClass, 'flex-grow-1']">
      {{ formattedValue ?? fallback }}
    </span>
    <span v-else :class="[valueClass, 'flex-grow-1']">
      <template v-for="(group, index) in formattedValue" :key="index">
        <span v-if="index > 0">{{ separator }}</span
        ><wbr />
        <span>{{ group }}</span>
      </template>
    </span>
    <v-btn
      v-if="showCopy && copyValue"
      title="Copy"
      icon="mdi-content-copy"
      variant="text"
      size="x-small"
      color="medium-emphasis"
      @click="copyToClipboard(copyValue)"
    />
  </component>
</template>
