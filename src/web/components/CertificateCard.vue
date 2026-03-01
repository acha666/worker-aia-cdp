<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { CertificateListItem, CertificateDetail } from "@contracts/schemas";
import { useCertificatesStore } from "../stores/certificates";
import StatusBadge from "./StatusBadge.vue";
import CertificateDetails from "./CertificateDetails.vue";
import { formatDateDay, formatDateDayWithoutTimezone, getRelativeTime } from "../utils/dates";
import { computeCertificateStatus } from "../utils/status";

const props = defineProps<{
  certificate: CertificateListItem;
  isFirst?: boolean;
  isLast?: boolean;
}>();

const store = useCertificatesStore();
const { t } = useI18n();
const expanded = ref(false);
const detail = ref<CertificateDetail | null>(null);

const isLoading = computed(() => store.isDetailLoading(props.certificate.id));

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !detail.value) {
    detail.value = await store.fetchDetail(props.certificate.id);
  }
}

// Watch for cache updates
watch(
  () => store.getDetail(props.certificate.id),
  (cached) => {
    if (cached) detail.value = cached;
  }
);

const displayName = computed(() => {
  const subjectCN = props.certificate.summary.subjectCN;
  if (!subjectCN) return t("certificateCard.unknownCertificate");
  return subjectCN;
});

const downloadUrls = computed(() => {
  const baseUrl = props.certificate.downloadUrl;
  // API reports canonical DER storage; derive PEM variant by extension.
  const pemUrl = baseUrl
    .replace(/\.der$/, ".der.pem")
    .replace(/\.crt$/, ".crt.pem")
    .replace(/\.cer$/, ".cer.pem");
  return { der: baseUrl, pem: pemUrl };
});

const validityInfo = computed(() => {
  const { notBefore, notAfter } = props.certificate.summary;
  return {
    from: formatDateDayWithoutTimezone(notBefore),
    to: formatDateDay(notAfter),
    remaining: getRelativeTime(notAfter),
  };
});

const status = computed(() =>
  computeCertificateStatus(props.certificate.summary.notBefore, props.certificate.summary.notAfter)
);
</script>

<template>
  <v-card variant="outlined" rounded="lg">
    <v-card-item>
      <template #title>
        <div class="d-flex align-center ga-2 flex-wrap">
          <span class="text-body-1 font-weight-bold">{{ displayName }}</span>
          <StatusBadge :state="status.state" type="certificate" />
        </div>
      </template>
      <template #subtitle>
        {{ t("certificateCard.issuer") }}:
        {{ certificate.summary.issuerCN || t("common.unknown") }}
      </template>
    </v-card-item>

    <v-card-text class="pt-0">
      <div class="text-body-2">
        <span class="font-weight-medium">{{ t("common.from") }}</span> {{ validityInfo.from }} ·
        <span class="font-weight-medium">{{ t("common.until") }}</span> {{ validityInfo.to }}
        <span v-if="validityInfo.remaining && status.state === 'valid'" class="text-success">
          ({{ validityInfo.remaining }})
        </span>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        variant="text"
        :aria-expanded="expanded"
        :title="t('certificateCard.toggleDetails')"
        @click="toggle"
      />
      <v-spacer />
      <v-btn :href="downloadUrls.der" download variant="outlined" size="small">DER</v-btn>
      <v-btn :href="downloadUrls.pem" download variant="outlined" size="small">PEM</v-btn>
    </v-card-actions>

    <v-expand-transition>
      <div v-if="expanded">
        <v-divider />
        <v-card-text>
          <div v-if="isLoading" class="d-flex align-center justify-center py-6 ga-2">
            <v-progress-circular indeterminate color="primary" size="20" width="2" />
            <span class="text-caption">{{ t("certificateCard.loading") }}</span>
          </div>
          <CertificateDetails v-else-if="detail" :certificate="detail" />
          <div v-else class="text-center py-2 text-caption text-medium-emphasis">
            {{ t("certificateCard.failedToLoadDetails") }}
          </div>
        </v-card-text>
      </div>
    </v-expand-transition>
  </v-card>
</template>
