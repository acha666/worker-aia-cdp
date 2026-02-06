<script setup lang="ts">
import type { CertificateStatusState, CrlStatusState } from "../utils/status";

const props = defineProps<{
  state: CertificateStatusState | CrlStatusState;
  type?: "certificate" | "crl";
  showLabel?: boolean;
}>();

const config = {
  // Certificate states
  valid: {
    label: "Valid",
    bgColor: "bg-green-100 dark:bg-green-950/40",
    textColor: "text-green-700 dark:text-green-400",
    borderColor: "border-green-300 dark:border-green-800",
  },
  expired: {
    label: "Expired",
    bgColor: "bg-red-100 dark:bg-red-950/40",
    textColor: "text-red-700 dark:text-red-400",
    borderColor: "border-red-300 dark:border-red-800",
  },
  "not-yet-valid": {
    label: "Not Yet Valid",
    bgColor: "bg-yellow-100 dark:bg-yellow-950/40",
    textColor: "text-yellow-700 dark:text-yellow-400",
    borderColor: "border-yellow-300 dark:border-yellow-800",
  },
  // CRL states
  current: {
    label: "Current",
    bgColor: "bg-green-100 dark:bg-green-950/40",
    textColor: "text-green-700 dark:text-green-400",
    borderColor: "border-green-300 dark:border-green-800",
  },
  stale: {
    label: "Stale",
    bgColor: "bg-yellow-100 dark:bg-yellow-950/40",
    textColor: "text-yellow-700 dark:text-yellow-400",
    borderColor: "border-yellow-300 dark:border-yellow-800",
  },
};

const statusConfig = config[props.state] || config.valid;
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
    {{ statusConfig.label }}
  </span>
</template>
