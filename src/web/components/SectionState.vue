<script setup lang="ts">
const props = defineProps<{
  showLoading: boolean;
  error?: string | null;
  isEmpty: boolean;
  emptyText: string;
}>();
</script>

<template>
  <div v-if="props.showLoading" class="d-flex justify-center py-8">
    <v-progress-circular indeterminate color="primary" size="36" />
  </div>

  <v-alert v-else-if="props.error" type="error" variant="tonal" density="comfortable">
    {{ props.error }}
  </v-alert>

  <v-sheet v-else-if="props.isEmpty" class="py-8 text-center" border rounded>
    <slot name="empty-icon" />
    <p class="text-medium-emphasis">{{ props.emptyText }}</p>
  </v-sheet>

  <div v-else>
    <slot />
  </div>
</template>
