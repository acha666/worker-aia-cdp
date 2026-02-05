<script setup lang="ts">
import { onMounted } from "vue";
import { useCertificatesStore } from "./stores/certificates";
import { useCrlsStore } from "./stores/crls";
import CertificateCard from "./components/CertificateCard.vue";
import CrlCard from "./components/CrlCard.vue";
import CrlUpload from "./components/CrlUpload.vue";

const certificatesStore = useCertificatesStore();
const crlsStore = useCrlsStore();

onMounted(async () => {
  await Promise.all([certificatesStore.fetchAll(), crlsStore.fetchAll()]);
});
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <h1 class="text-2xl font-bold text-gray-900">PKI AIA/CDP</h1>
      </div>
    </header>

    <!-- Main content -->
    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="space-y-8">
        <!-- Certificates Section -->
        <section>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold text-gray-900">Certificates (AIA)</h2>
            <span v-if="!certificatesStore.loading" class="text-sm text-gray-500">
              {{ certificatesStore.items.length }} certificate{{
                certificatesStore.items.length !== 1 ? "s" : ""
              }}
            </span>
          </div>

          <!-- Loading state -->
          <div
            v-if="certificatesStore.loading && certificatesStore.items.length === 0"
            class="flex items-center justify-center py-12"
          >
            <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
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
          </div>

          <!-- Error state -->
          <div
            v-else-if="certificatesStore.error"
            class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"
          >
            {{ certificatesStore.error }}
          </div>

          <!-- Empty state -->
          <div
            v-else-if="certificatesStore.isEmpty"
            class="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center"
          >
            <svg
              class="w-12 h-12 mx-auto text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p class="text-gray-500">No certificates found</p>
          </div>

          <!-- Certificate list -->
          <div v-else class="border border-gray-200 rounded-lg overflow-hidden">
            <CertificateCard
              v-for="(cert, index) in certificatesStore.items"
              :key="cert.id"
              :certificate="cert"
              :is-first="index === 0"
              :is-last="index === certificatesStore.items.length - 1"
            />
          </div>
        </section>

        <!-- CRLs Section -->
        <section>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold text-gray-900">CRLs (CDP)</h2>
            <span v-if="!crlsStore.loading" class="text-sm text-gray-500">
              {{ crlsStore.fullCrls.length }} CRL{{ crlsStore.fullCrls.length !== 1 ? "s" : "" }}
            </span>
          </div>

          <!-- Loading state -->
          <div
            v-if="crlsStore.loading && crlsStore.allCrls.length === 0"
            class="flex items-center justify-center py-12"
          >
            <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
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
          </div>

          <!-- Error state -->
          <div
            v-else-if="crlsStore.error"
            class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"
          >
            {{ crlsStore.error }}
          </div>

          <!-- Empty state -->
          <div
            v-else-if="crlsStore.fullCrls.length === 0"
            class="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center"
          >
            <svg
              class="w-12 h-12 mx-auto text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p class="text-gray-500">No CRLs found</p>
          </div>

          <!-- CRL list -->
          <div v-else class="border border-gray-200 rounded-lg overflow-hidden">
            <CrlCard
              v-for="(crl, index) in crlsStore.fullCrls"
              :key="crl.id"
              :crl="crl"
              :is-first="index === 0"
              :is-last="index === crlsStore.fullCrls.length - 1"
            />
          </div>
        </section>

        <!-- Delta CRLs Section -->
        <section v-if="crlsStore.deltaCrls.length > 0">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold text-gray-900">Delta CRLs (Delta-CDP)</h2>
            <span class="text-sm text-gray-500">
              {{ crlsStore.deltaCrls.length }} delta{{
                crlsStore.deltaCrls.length !== 1 ? "s" : ""
              }}
            </span>
          </div>

          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <CrlCard
              v-for="(crl, index) in crlsStore.deltaCrls"
              :key="crl.id"
              :crl="crl"
              :is-first="index === 0"
              :is-last="index === crlsStore.deltaCrls.length - 1"
            />
          </div>
        </section>

        <!-- Upload Section -->
        <section>
          <CrlUpload />
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-200 bg-white mt-12">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <p class="text-sm text-gray-500 text-center">
          PKI AIA/CDP Distribution Point · Powered by Cloudflare Workers
        </p>
      </div>
    </footer>
  </div>
</template>
