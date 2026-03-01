<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { CertificateStatusState, CrlStatusState } from "../utils/status";

const props = defineProps<{
  state: CertificateStatusState | CrlStatusState;
  type?: "certificate" | "crl";
  showLabel?: boolean;
}>();

const { t } = useI18n();

const config = {
  // Certificate states
  valid: {
    labelKey: "status.valid",
    bgColor: "bg-green-100 dark:bg-green-950/40",
    textColor: "text-green-700 dark:text-green-400",
    borderColor: "border-green-300 dark:border-green-800",
  },
  expired: {
    labelKey: "status.expired",
    bgColor: "bg-red-100 dark:bg-red-950/40",
    textColor: "text-red-700 dark:text-red-400",
    borderColor: "border-red-300 dark:border-red-800",
  },
  "not-yet-valid": {
    labelKey: "status.notYetValid",
    bgColor: "bg-yellow-100 dark:bg-yellow-950/40",
    textColor: "text-yellow-700 dark:text-yellow-400",
    borderColor: "border-yellow-300 dark:border-yellow-800",
  },
  // CRL states
  current: {
    labelKey: "status.current",
    bgColor: "bg-green-100 dark:bg-green-950/40",
    textColor: "text-green-700 dark:text-green-400",
    borderColor: "border-green-300 dark:border-green-800",
  },
  stale: {
    labelKey: "status.stale",
    bgColor: "bg-yellow-100 dark:bg-yellow-950/40",
    textColor: "text-yellow-700 dark:text-yellow-400",
    borderColor: "border-yellow-300 dark:border-yellow-800",
  },
};

const statusConfig = config[props.state] || config.valid;
const statusLabel = computed(() => t(statusConfig.labelKey));
</script>

<template>
  <span
    :class="[
      'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium border',
      statusConfig.bgColor,
      statusConfig.textColor,
      statusConfig.borderColor,
    ]"
  >
    {{ statusLabel }}
  </span>
</template>
