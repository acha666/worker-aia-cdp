<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { CrlListItem, CrlDetail } from "@contracts/schemas";
import { useCrlsStore } from "../stores/crls";
import StatusBadge from "./StatusBadge.vue";
import CrlDetails from "./CrlDetails.vue";
import { formatDateDay, formatDateDayWithoutTimezone, getRelativeTime } from "../utils/dates";
import { computeCrlStatus } from "../utils/status";

const props = defineProps<{
  crl: CrlListItem;
  isFirst?: boolean;
  isLast?: boolean;
}>();

const store = useCrlsStore();
const { t } = useI18n();
const expanded = ref(false);
const detail = ref<CrlDetail | null>(null);

const isLoading = computed(() => store.isDetailLoading(props.crl.id));

async function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !detail.value) {
    detail.value = await store.fetchDetail(props.crl.id);
  }
}

watch(
  () => store.getDetail(props.crl.id),
  (cached) => {
    if (cached) detail.value = cached;
  }
);

const displayName = computed(() => {
  const issuerCommonName = props.crl.summary.issuerCommonName;
  if (!issuerCommonName) return t("crlCard.unknownCrl");
  return issuerCommonName;
});

const downloadUrls = computed(() => {
  const baseUrl = props.crl.downloadUrl;
  // API reports canonical DER storage; derive PEM by extension.
  const pemUrl = baseUrl + ".pem";
  return { der: baseUrl, pem: pemUrl };
});

const updateInfo = computed(() => {
  const { thisUpdate, nextUpdate } = props.crl.summary;
  return {
    issued: formatDateDayWithoutTimezone(thisUpdate),
    expires: nextUpdate ? formatDateDay(nextUpdate) : t("common.notAvailable"),
    remaining: nextUpdate ? getRelativeTime(nextUpdate) : null,
  };
});

const status = computed(() =>
  computeCrlStatus(props.crl.summary.thisUpdate, props.crl.summary.nextUpdate)
);
</script>

<template>
  <v-card variant="outlined" rounded="lg">
    <v-card-item>
      <template #title>
        <div class="d-flex align-center ga-2 flex-wrap">
          <span class="text-body-1 font-weight-bold">{{ displayName }}</span>
          <StatusBadge :state="status.state" type="crl" />
          <v-chip
            :color="crl.summary.crlType === 'delta' ? 'success' : 'secondary'"
            size="x-small"
            variant="tonal"
            label
          >
            {{ t(crl.summary.crlType === "delta" ? "common.delta" : "common.full") }}
          </v-chip>
        </div>
      </template>
      <template #subtitle>
        <span v-if="crl.summary.crlNumber">CRL #{{ crl.summary.crlNumber }}</span>
        <span v-if="crl.summary.crlNumber"> · </span>
        <span>{{ t("crlCard.revokedCount", { count: crl.summary.revokedCount }) }}</span>
      </template>
    </v-card-item>

    <v-card-text class="pt-0">
      <div class="text-body-2">
        <span class="font-weight-medium">{{ t("crlCard.issued") }}</span> {{ updateInfo.issued }} ·
        <span class="font-weight-medium">{{ t("crlCard.nextUpdate") }}</span>
        {{ updateInfo.expires }}
        <span v-if="status.state === 'current' && updateInfo.remaining" class="text-success">
          ({{ updateInfo.remaining }})
        </span>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        variant="text"
        :aria-expanded="expanded"
        :title="t('crlCard.toggleDetails')"
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
            <v-progress-circular
              indeterminate
              :color="crl.summary.crlType === 'delta' ? 'success' : 'secondary'"
              size="20"
              width="2"
            />
            <span class="text-caption">{{ t("crlCard.loading") }}</span>
          </div>
          <CrlDetails v-else-if="detail" :crl="detail" />
          <div v-else class="text-center py-2 text-caption text-medium-emphasis">
            {{ t("crlCard.failedToLoadDetails") }}
          </div>
        </v-card-text>
      </div>
    </v-expand-transition>
  </v-card>
</template>
