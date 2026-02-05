<script setup lang="ts">
import type {
  CertificateStatusState,
  CrlStatusState,
} from "@contracts/schemas";

const props = defineProps<{
  state: CertificateStatusState | CrlStatusState;
  type?: "certificate" | "crl";
  showLabel?: boolean;
}>();

const config = {
  // Certificate states
  valid: {
    label: "Valid",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    borderColor: "border-green-300",
    dotColor: "bg-green-600",
  },
  expired: {
    label: "Expired",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    borderColor: "border-red-300",
    dotColor: "bg-red-600",
  },
  "not-yet-valid": {
    label: "Not Yet Valid",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-300",
    dotColor: "bg-yellow-600",
  },
  // CRL states
  current: {
    label: "Current",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    borderColor: "border-green-300",
    dotColor: "bg-green-600",
  },
  stale: {
    label: "Stale",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-300",
    dotColor: "bg-yellow-600",
  },
};

const statusConfig = config[props.state] || config.valid;
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border',
      statusConfig.bgColor,
      statusConfig.textColor,
      statusConfig.borderColor,
    ]"
  >
    <span :class="['w-1.5 h-1.5 rounded-full', statusConfig.dotColor]"></span>
    <span v-if="showLabel !== false">{{ statusConfig.label }}</span>
  </span>
</template>
