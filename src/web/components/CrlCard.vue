<script setup lang="ts">
import { ref, computed, watch } from "vue";
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
  if (!issuerCommonName) return "Unknown CRL";
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
    expires: nextUpdate ? formatDateDay(nextUpdate) : "N/A",
    remaining: nextUpdate ? getRelativeTime(nextUpdate) : null,
  };
});

const status = computed(() =>
  computeCrlStatus(props.crl.summary.thisUpdate, props.crl.summary.nextUpdate)
);
</script>

<template>
  <div
    :class="[
      'overflow-hidden bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-shadow border-l-4 border-b border-gray-200 dark:border-dark-border',
      crl.summary.crlType === 'delta'
        ? 'border-l-green-500 dark:border-l-green-400'
        : 'border-l-purple-500 dark:border-l-purple-400',
      props.isFirst ? 'rounded-t-lg' : '',
      props.isLast ? 'rounded-b-lg' : '',
    ]"
  >
    <!-- Header -->
    <div
      :class="[
        'p-4 bg-gradient-to-r to-white dark:to-dark-surface',
        crl.summary.crlType === 'delta'
          ? 'from-green-50 dark:from-green-950/20'
          : 'from-purple-50 dark:from-purple-950/20',
      ]"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-base font-bold text-gray-900 dark:text-white truncate">
              {{ displayName }}
            </h3>
            <StatusBadge :state="status.state" type="crl" />
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
            <span v-if="crl.summary.crlNumber">CRL #{{ crl.summary.crlNumber }}</span>
            <span v-if="crl.summary.crlNumber" class="mx-1">·</span>
            <span>{{ crl.summary.revokedCount }} revoked</span>
          </p>

          <!-- Update info -->
          <div class="text-xs text-gray-700 dark:text-dark-textMuted space-y-1">
            <div>
              <span class="font-medium">Issued</span> {{ updateInfo.issued }} ·
              <span class="font-medium">Next update</span>
              {{ updateInfo.expires }}
              <span
                v-if="status.state === 'current' && updateInfo.remaining"
                :class="[
                  'ml-1',
                  crl.summary.crlType === 'delta'
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-purple-700 dark:text-purple-400',
                ]"
              >
                ({{ updateInfo.remaining }})
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Download buttons and expand button -->
      <div class="mt-3 flex items-center justify-between gap-2">
        <!-- Expand button -->
        <button
          :class="[
            'inline-flex items-center transition-colors',
            crl.summary.crlType === 'delta'
              ? 'text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300'
              : 'text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300',
          ]"
          :aria-expanded="expanded"
          title="Toggle details"
          @click="toggle"
        >
          <svg
            :class="['w-5 h-5 transition-transform', expanded ? 'rotate-0' : '-rotate-90']"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <!-- Format buttons -->
        <div class="flex items-center gap-2">
          <a
            :href="downloadUrls.der"
            :class="[
              'inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded transition-colors',
              crl.summary.crlType === 'delta'
                ? 'text-green-600 dark:text-green-400 border-green-600 dark:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                : 'text-purple-600 dark:text-purple-400 border-purple-600 dark:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20',
            ]"
            download
          >
            DER
          </a>
          <a
            :href="downloadUrls.pem"
            :class="[
              'inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded transition-colors',
              crl.summary.crlType === 'delta'
                ? 'text-green-600 dark:text-green-400 border-green-600 dark:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                : 'text-purple-600 dark:text-purple-400 border-purple-600 dark:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20',
            ]"
            download
          >
            PEM
          </a>
        </div>
      </div>
    </div>

    <!-- Details panel -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-[2000px]"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 max-h-[2000px]"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="expanded" class="overflow-hidden">
        <div
          :class="[
            'border-t p-4 bg-white dark:bg-dark-surface',
            crl.summary.crlType === 'delta'
              ? 'border-t-green-200 dark:border-t-green-900/50'
              : 'border-t-purple-200 dark:border-t-purple-900/50',
          ]"
        >
          <div v-if="isLoading" class="flex items-center justify-center py-8">
            <svg
              :class="[
                'animate-spin h-5 w-5',
                crl.summary.crlType === 'delta'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-purple-600 dark:text-purple-400',
              ]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              ></path>
            </svg>
            <span class="ml-2 text-xs text-gray-600 dark:text-gray-400">Loading...</span>
          </div>
          <CrlDetails v-else-if="detail" :crl="detail" />
          <div v-else class="text-center py-4 text-xs text-gray-500 dark:text-gray-400">
            Failed to load details
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
