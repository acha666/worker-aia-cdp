import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { CertificateListItem, CertificateDetail } from "@contracts/schemas";
import { listCertificates, getCertificate, type ListCertificatesResult } from "../api/client";

export const useCertificatesStore = defineStore("certificates", () => {
  // State
  const items = ref<CertificateListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(false);
  const nextCursor = ref<string | null>(null);
  const detailCache = ref<Map<string, CertificateDetail>>(new Map());
  const detailLoading = ref<Set<string>>(new Set());

  // Getters
  const isEmpty = computed(() => items.value.length === 0 && !loading.value);
  const validCount = computed(() => items.value.filter((c) => c.status.state === "valid").length);
  const expiredCount = computed(
    () => items.value.filter((c) => c.status.state === "expired").length
  );

  // Actions
  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      const result: ListCertificatesResult = await listCertificates({
        limit: 100,
      });
      items.value = result.items;
      hasMore.value = result.hasMore;
      nextCursor.value = result.nextCursor;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load certificates";
      console.error("Failed to fetch certificates:", e);
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (!hasMore.value || !nextCursor.value || loading.value) return;

    loading.value = true;
    try {
      const result = await listCertificates({
        limit: 100,
        cursor: nextCursor.value,
      });
      items.value = [...items.value, ...result.items];
      hasMore.value = result.hasMore;
      nextCursor.value = result.nextCursor;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load more certificates";
    } finally {
      loading.value = false;
    }
  }

  async function fetchDetail(id: string): Promise<CertificateDetail | null> {
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
      const detail = await getCertificate(id, {
        include: ["extensions"],
      });
      if (!detail) return null;
      detailCache.value.set(id, detail);
      return detail;
    } catch (e) {
      console.error(`Failed to fetch certificate ${id}:`, e);
      return null;
    } finally {
      detailLoading.value.delete(id);
    }
  }

  function clearCache() {
    detailCache.value.clear();
  }

  function isDetailLoading(id: string): boolean {
    return detailLoading.value.has(id);
  }

  function getDetail(id: string): CertificateDetail | undefined {
    return detailCache.value.get(id);
  }

  return {
    // State
    items,
    loading,
    error,
    hasMore,
    // Getters
    isEmpty,
    validCount,
    expiredCount,
    // Actions
    fetchAll,
    loadMore,
    fetchDetail,
    clearCache,
    isDetailLoading,
    getDetail,
  };
});
