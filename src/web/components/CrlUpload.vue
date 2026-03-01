<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useCrlsStore } from "../stores/crls";

const store = useCrlsStore();
const { t } = useI18n();

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

async function handleFileSelection(files: File[] | File | null) {
  const selected = Array.isArray(files) ? files[0] : files;
  if (selected) {
    await processFile(selected);
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
    store.uploadError = t("upload.errors.readFile");
  }
}
</script>

<template>
  <v-card variant="outlined" rounded="lg">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon icon="mdi-upload" color="primary" />
      {{ t("upload.title") }}
    </v-card-title>
    <v-card-text>
      <!-- Success message -->
      <v-alert v-if="store.lastUploadResult" type="success" variant="tonal" class="mb-4">
        <div class="text-body-2 font-weight-medium">
          CRL
          {{
            t(store.lastUploadResult.replaced ? "upload.status.updated" : "upload.status.uploaded")
          }}
          {{ t("upload.status.success") }}
        </div>
        <div class="text-caption mt-1">
          {{ t(store.lastUploadResult.crlType === "delta" ? "common.delta" : "common.full") }}
          {{ t("upload.status.savedTo") }}
          {{ store.lastUploadResult.id }}
        </div>
      </v-alert>

      <!-- Error message -->
      <v-alert v-if="store.uploadError" type="error" variant="tonal" class="mb-4">
        <div class="text-body-2 font-weight-medium">{{ t("upload.errors.uploadFailed") }}</div>
        <div class="text-caption mt-1">{{ store.uploadError }}</div>
      </v-alert>

      <form @submit.prevent="handleSubmit">
        <v-file-input
          :label="t('upload.selectFile')"
          accept=".crl,.pem,.der"
          prepend-icon="mdi-paperclip"
          variant="outlined"
          density="comfortable"
          class="mb-4"
          @update:model-value="handleFileSelection"
          @change="handleFileSelect"
        />

        <v-sheet
          border
          rounded
          :color="dragActive ? 'primary' : undefined"
          :variant="dragActive ? 'tonal' : 'flat'"
          class="pa-3"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <v-textarea
            v-model="pemContent"
            :label="t('upload.labels.pemContent')"
            :placeholder="t('upload.placeholder')"
            rows="8"
            auto-grow
            variant="outlined"
            class="font-mono"
          />
        </v-sheet>

        <div class="d-flex align-center justify-space-between mt-4 ga-2">
          <p v-if="!isValid && pemContent.trim()" class="text-caption text-error">
            {{ t("upload.errors.invalidPem") }}
          </p>
          <p v-else class="text-caption text-medium-emphasis">
            {{ fileFormat === "der" ? t("upload.helpers.der") : t("upload.helpers.pem") }}
          </p>
          <v-btn
            type="submit"
            :disabled="!isValid || store.uploading"
            :loading="store.uploading"
            color="primary"
          >
            {{ store.uploading ? t("upload.actions.uploading") : t("upload.actions.upload") }}
          </v-btn>
        </div>
      </form>
    </v-card-text>
  </v-card>
</template>
