import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { CrlListItem, CrlDetail } from "@contracts/schemas";
import { listCrls, getCrl, uploadCrl, uploadCrlBinary, type UploadCrlResult } from "../api/client";

export const useCrlsStore = defineStore("crls", () => {
  // State
  const fullCrls = ref<CrlListItem[]>([]);
  const deltaCrls = ref<CrlListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const detailCache = ref<Map<string, CrlDetail>>(new Map());
  const detailLoading = ref<Set<string>>(new Set());

  // Upload state
  const uploading = ref(false);
  const uploadError = ref<string | null>(null);
  const lastUploadResult = ref<UploadCrlResult | null>(null);

  // Getters
  const allCrls = computed(() => [...fullCrls.value, ...deltaCrls.value]);
  const totalCount = computed(() => fullCrls.value.length + deltaCrls.value.length);
  const currentCount = computed(
    () => allCrls.value.filter((c) => c.status.state === "current").length
  );
  const staleCount = computed(() => allCrls.value.filter((c) => c.status.state === "stale").length);
  const expiredCount = computed(
    () => allCrls.value.filter((c) => c.status.state === "expired").length
  );
  const totalRevocations = computed(() =>
    allCrls.value.reduce((sum, crl) => sum + crl.summary.revokedCount, 0)
  );

  // Actions
  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      const [fullResult, deltaResult] = await Promise.all([
        listCrls({ type: "full", limit: 100 }),
        listCrls({ type: "delta", limit: 100 }),
      ]);
      fullCrls.value = fullResult.items;
      deltaCrls.value = deltaResult.items;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load CRLs";
      console.error("Failed to fetch CRLs:", e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchDetail(id: string): Promise<CrlDetail | null> {
    // Check cache first
    const cached = detailCache.value.get(id);
    if (cached) {
      return cached;
    }

    // Avoid duplicate requests
    if (detailLoading.value.has(id)) {
      return null;
    }

    detailLoading.value.add(id);
    try {
      const detail = await getCrl(id, {
        include: ["extensions", "revokedCertificates"],
      });
      detailCache.value.set(id, detail);
      return detail;
    } catch (e) {
      console.error(`Failed to fetch CRL ${id}:`, e);
      return null;
    } finally {
      detailLoading.value.delete(id);
    }
  }

  async function upload(pem: string): Promise<UploadCrlResult | null> {
    uploading.value = true;
    uploadError.value = null;
    lastUploadResult.value = null;

    try {
      const result = await uploadCrl(pem);
      lastUploadResult.value = result;
      // Refresh the lists
      await fetchAll();
      return result;
    } catch (e) {
      uploadError.value = e instanceof Error ? e.message : "Failed to upload CRL";
      console.error("Failed to upload CRL:", e);
      return null;
    } finally {
      uploading.value = false;
    }
  }

  async function uploadBinary(data: ArrayBuffer): Promise<UploadCrlResult | null> {
    uploading.value = true;
    uploadError.value = null;
    lastUploadResult.value = null;

    try {
      const result = await uploadCrlBinary(data);
      lastUploadResult.value = result;
      // Refresh the lists
      await fetchAll();
      return result;
    } catch (e) {
      uploadError.value = e instanceof Error ? e.message : "Failed to upload CRL";
      console.error("Failed to upload CRL:", e);
      return null;
    } finally {
      uploading.value = false;
    }
  }

  function clearCache() {
    detailCache.value.clear();
  }

  function isDetailLoading(id: string): boolean {
    return detailLoading.value.has(id);
  }

  function getDetail(id: string): CrlDetail | undefined {
    return detailCache.value.get(id);
  }

  return {
    // State
    fullCrls,
    deltaCrls,
    loading,
    error,
    uploading,
    uploadError,
    lastUploadResult,
    // Getters
    allCrls,
    totalCount,
    currentCount,
    staleCount,
    expiredCount,
    totalRevocations,
    // Actions
    fetchAll,
    fetchDetail,
    upload,
    uploadBinary,
    clearCache,
    isDetailLoading,
    getDetail,
  };
});
