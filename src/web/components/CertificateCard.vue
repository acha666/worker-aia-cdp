<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { CertificateListItem, CertificateDetail } from "@contracts/schemas";
import { useCertificatesStore } from "../stores/certificates";
import StatusBadge from "./StatusBadge.vue";
import CertificateDetails from "./CertificateDetails.vue";
import { formatDateDay, getRelativeTime } from "../utils/dates";
import { computeCertificateStatus } from "../utils/status";

const props = defineProps<{
  certificate: CertificateListItem;
  isFirst?: boolean;
  isLast?: boolean;
}>();

const store = useCertificatesStore();
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
  if (!subjectCN) return "Unknown Certificate";
  return subjectCN;
});

const downloadUrls = computed(() => {
  const baseUrl = props.certificate.downloadUrl;
  const format = props.certificate.storage.format;

  if (format === "pem") {
    // Current is PEM, derive DER
    const derUrl = baseUrl.replace(/\.pem$/, "").replace(/\.(crt|cer)$/, ".der");
    return { der: derUrl, pem: baseUrl };
  } else {
    // Current is DER, derive PEM
    const pemUrl = baseUrl
      .replace(/\.der$/, ".der.pem")
      .replace(/\.crt$/, ".crt.pem")
      .replace(/\.cer$/, ".cer.pem");
    return { der: baseUrl, pem: pemUrl };
  }
});

const validityInfo = computed(() => {
  const { notBefore, notAfter } = props.certificate.summary;
  return {
    from: formatDateDay(notBefore),
    to: formatDateDay(notAfter),
    remaining: getRelativeTime(notAfter),
  };
});

const status = computed(() =>
  computeCertificateStatus(props.certificate.summary.notBefore, props.certificate.summary.notAfter)
);
</script>

<template>
  <div
    class="overflow-hidden bg-white border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow border-b border-gray-200"
    :class="[props.isFirst ? 'rounded-t-lg' : '', props.isLast ? 'rounded-b-lg' : '']"
  >
    <!-- Header -->
    <div class="p-4 bg-gradient-to-r from-blue-50 to-white">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-base font-bold text-gray-900 truncate">
              {{ displayName }}
            </h3>
            <StatusBadge :state="status.state" type="certificate" />
          </div>
          <p class="text-xs text-gray-600 truncate mb-3">
            Issuer: {{ certificate.summary.issuerCN || "Unknown" }}
          </p>

          <!-- Validity info - collapsed view only shows dates -->
          <div class="text-xs text-gray-700 space-y-1">
            <div>
              <span class="font-medium">From</span> {{ validityInfo.from }} ·
              <span class="font-medium">Until</span> {{ validityInfo.to }}
              <span
                v-if="validityInfo.remaining && status.state === 'valid'"
                class="text-green-700"
              >
                ({{ validityInfo.remaining }})
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Download buttons and expand button -->
      <div class="mt-3 flex items-center justify-between gap-2">
        <!-- Expand button -->
        <button
          class="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors"
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
            class="inline-flex items-center px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
            download
          >
            DER
          </a>
          <a
            :href="downloadUrls.pem"
            class="inline-flex items-center px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
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
        <div class="border-t border-blue-200 p-4 bg-white">
          <div v-if="isLoading" class="flex items-center justify-center py-8">
            <svg class="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
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
            <span class="ml-2 text-xs text-gray-600">Loading...</span>
          </div>
          <CertificateDetails v-else-if="detail" :certificate="detail" />
          <div v-else class="text-center py-4 text-xs text-gray-500">Failed to load details</div>
        </div>
      </div>
    </Transition>
  </div>
</template>
