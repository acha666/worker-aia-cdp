<script setup lang="ts">
import { ref, computed } from "vue";
import { useCrlsStore } from "../stores/crls";

const store = useCrlsStore();

const pemContent = ref("");
const binaryData = ref<ArrayBuffer | null>(null);
const dragActive = ref(false);
const fileFormat = ref<"pem" | "der" | "unknown">("unknown");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const isValid = computed(() => {
  // DER format is valid if we have binary data
  if (binaryData.value) {
    return true;
  }

  // PEM format is valid if it has the proper markers
  const content = pemContent.value.trim();
  return content.includes("-----BEGIN X509 CRL-----") && content.includes("-----END X509 CRL-----");
});

async function handleSubmit() {
  if (!isValid.value) return;

  // If we have binary data, upload as DER
  if (binaryData.value) {
    const result = await store.uploadBinary(binaryData.value);
    if (result) {
      pemContent.value = "";
      binaryData.value = null;
      fileFormat.value = "unknown";
    }
  } else {
    // Otherwise upload as PEM
    const result = await store.upload(pemContent.value);
    if (result) {
      pemContent.value = "";
    }
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  dragActive.value = true;
}

function handleDragLeave() {
  dragActive.value = false;
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  dragActive.value = false;

  const file = e.dataTransfer?.files[0];
  if (file) {
    await processFile(file);
  }
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await processFile(file);
  }
}

async function processFile(file: File) {
  // Clear previous data
  pemContent.value = "";
  binaryData.value = null;
  fileFormat.value = "unknown";

  // Check file extension to determine format
  const isPemFile = file.name.endsWith(".pem") || file.name.endsWith(".crl");
  const isDerFile = file.name.endsWith(".der") || file.name.endsWith(".crl");

  try {
    if (isPemFile && !isDerFile) {
      // Explicitly a PEM file
      const text = await file.text();
      pemContent.value = text;
      fileFormat.value = "pem";
    } else if (isDerFile && !isPemFile) {
      // Explicitly a DER file
      const arrayBuffer = await file.arrayBuffer();
      binaryData.value = arrayBuffer;
      fileFormat.value = "der";
    } else {
      // For ambiguous extensions (.crl), try to detect format
      const arrayBuffer = await file.arrayBuffer();

      // Try to read as text first
      try {
        const text = new TextDecoder().decode(arrayBuffer);
        if (text.includes("-----BEGIN X509 CRL-----")) {
          pemContent.value = text;
          fileFormat.value = "pem";
          return;
        }
      } catch {
        // Failed to decode as text, treat as binary
      }

      // Otherwise treat as DER
      binaryData.value = arrayBuffer;
      fileFormat.value = "der";
    }
  } catch (error) {
    console.error("Error processing file:", error);
    store.uploadError = "Failed to read file";
  }
}

function focusTextarea() {
  textareaRef.value?.focus();
}
</script>

<template>
  <div
    class="rounded-lg bg-white dark:bg-dark-surface shadow-sm p-6 border border-gray-200 dark:border-dark-border"
  >
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
      <svg
        class="w-5 h-5 text-blue-600 dark:text-blue-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
      Upload CRL
    </h3>

    <!-- Success message -->
    <div
      v-if="store.lastUploadResult"
      class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg"
    >
      <div class="flex items-start gap-3">
        <svg
          class="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p class="text-sm font-medium text-green-800 dark:text-green-200">
            CRL
            {{ store.lastUploadResult.replaced ? "updated" : "uploaded" }}
            successfully
          </p>
          <p class="text-xs text-green-700 dark:text-green-300 mt-1">
            {{ store.lastUploadResult.crlType === "delta" ? "Delta" : "Full" }} CRL saved to
            {{ store.lastUploadResult.id }}
          </p>
        </div>
      </div>
    </div>

    <!-- Error message -->
    <div
      v-if="store.uploadError"
      class="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg"
    >
      <div class="flex items-start gap-3">
        <svg
          class="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p class="text-sm font-medium text-red-800 dark:text-red-200">Upload failed</p>
          <p class="text-xs text-red-700 dark:text-red-300 mt-1">{{ store.uploadError }}</p>
        </div>
      </div>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <!-- Drop zone / textarea -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2"
          >> PEM Content
        </label>
        <div
          class="relative rounded-lg"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @click="focusTextarea"
        >
          <textarea
            ref="textareaRef"
            v-model="pemContent"
            rows="8"
            :class="[
              'w-full px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 rounded-lg outline-2 outline-dashed outline-offset-[-1px] transition-colors dark:text-white dark:caret-white',
              dragActive
                ? 'outline-blue-400 dark:outline-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'outline-gray-300 dark:outline-dark-border bg-white dark:bg-dark-surface',
            ]"
            placeholder="Paste or drag and drop a .crl/.pem/.der file here, or type PEM content directly"
          ></textarea>
          <!-- Hidden file upload input - positioned in corner -->
          <label
            class="absolute bottom-2 right-2 p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
            title="Click to select a file"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <input type="file" accept=".crl,.pem,.der" class="hidden" @change="handleFileSelect" />
          </label>
        </div>
      </div>

      <!-- Submit -->
      <div class="flex items-center justify-between">
        <p v-if="!isValid && pemContent.trim()" class="text-sm text-red-600 dark:text-red-400">
          Invalid PEM format. Must contain X509 CRL markers.
        </p>
        <p
          v-else-if="!isValid && !binaryData && pemContent.trim()"
          class="text-sm text-red-600 dark:text-red-400"
        >
          No valid CRL content detected.
        </p>
        <p v-else class="text-sm text-gray-500 dark:text-gray-400">
          {{ fileFormat === "der" ? "DER-formatted CRL" : "Paste or drop a PEM-encoded CRL" }}
        </p>
        <button
          type="submit"
          :disabled="!isValid || store.uploading"
          class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg v-if="store.uploading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
          {{ store.uploading ? "Uploading..." : "Upload CRL" }}
        </button>
      </div>
    </form>
  </div>
</template>
