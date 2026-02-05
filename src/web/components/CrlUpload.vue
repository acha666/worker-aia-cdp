<script setup lang="ts">
import { ref, computed } from "vue";
import { useCrlsStore } from "../stores/crls";

const store = useCrlsStore();

const pemContent = ref("");
const binaryData = ref<ArrayBuffer | null>(null);
const dragActive = ref(false);
const fileFormat = ref<"pem" | "der" | "unknown">("unknown");

const isValid = computed(() => {
  // DER format is valid if we have binary data
  if (binaryData.value) {
    return true;
  }

  // PEM format is valid if it has the proper markers
  const content = pemContent.value.trim();
  return (
    content.includes("-----BEGIN X509 CRL-----") &&
    content.includes("-----END X509 CRL-----")
  );
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
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-lg p-6">
    <h3
      class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"
    >
      <svg
        class="w-5 h-5 text-blue-600"
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
      class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg"
    >
      <div class="flex items-start gap-3">
        <svg
          class="w-5 h-5 text-green-600 mt-0.5"
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
          <p class="text-sm font-medium text-green-800">
            CRL
            {{
              store.lastUploadResult.status === "created"
                ? "uploaded"
                : "updated"
            }}
            successfully
          </p>
          <p class="text-xs text-green-700 mt-1">
            {{ store.lastUploadResult.type === "delta" ? "Delta" : "Full" }} CRL
            saved to {{ store.lastUploadResult.id }}
          </p>
        </div>
      </div>
    </div>

    <!-- Error message -->
    <div
      v-if="store.uploadError"
      class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg"
    >
      <div class="flex items-start gap-3">
        <svg
          class="w-5 h-5 text-red-600 mt-0.5"
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
          <p class="text-sm font-medium text-red-800">Upload failed</p>
          <p class="text-xs text-red-700 mt-1">{{ store.uploadError }}</p>
        </div>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- Drop zone / textarea -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          PEM Content
        </label>
        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          :class="[
            'relative border-2 border-dashed rounded-lg transition-colors',
            dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300',
          ]"
        >
          <textarea
            v-model="pemContent"
            rows="8"
            class="w-full px-3 py-2 text-sm font-mono bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
            placeholder="Paste or drag and drop a .crl/.pem/.der file here, or type PEM content directly"
          ></textarea>
          <!-- Hidden file upload input - positioned in corner -->
          <label
            class="absolute bottom-2 right-2 p-2 text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
            title="Click to select a file"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <input
              type="file"
              accept=".crl,.pem,.der"
              @change="handleFileSelect"
              class="hidden"
            />
          </label>
        </div>
      </div>

      <!-- Submit -->
      <div class="flex items-center justify-between">
        <p v-if="!isValid && pemContent.trim()" class="text-sm text-red-600">
          Invalid PEM format. Must contain X509 CRL markers.
        </p>
        <p v-else-if="!isValid && !binaryData" class="text-sm text-red-600">
          No valid CRL content detected.
        </p>
        <p v-else class="text-sm text-gray-500">
          {{
            fileFormat === "der"
              ? "DER-formatted CRL"
              : "Paste or drop a PEM-encoded CRL"
          }}
        </p>
        <button
          type="submit"
          :disabled="!isValid || store.uploading"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <svg
            v-if="store.uploading"
            class="animate-spin h-4 w-4"
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
          {{ store.uploading ? "Uploading..." : "Upload CRL" }}
        </button>
      </div>
    </form>
  </div>
</template>
