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
    color: "success",
  },
  expired: {
    labelKey: "status.expired",
    color: "error",
  },
  "not-yet-valid": {
    labelKey: "status.notYetValid",
    color: "warning",
  },
  // CRL states
  current: {
    labelKey: "status.current",
    color: "success",
  },
  stale: {
    labelKey: "status.stale",
    color: "warning",
  },
};

const statusConfig = config[props.state] || config.valid;
const statusLabel = computed(() => t(statusConfig.labelKey));
</script>

<template>
  <v-chip :color="statusConfig.color" variant="tonal" size="small" label>
    {{ statusLabel }}
  </v-chip>
</template>
