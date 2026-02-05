<script setup lang="ts">
const props = defineProps<{
  showLoading: boolean;
  error?: string | null;
  isEmpty: boolean;
  emptyText: string;
}>();
</script>

<template>
  <div v-if="props.showLoading" class="flex items-center justify-center py-12">
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

  <div v-else-if="props.error" class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
    {{ props.error }}
  </div>

  <div
    v-else-if="props.isEmpty"
    class="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center"
  >
    <slot name="empty-icon" />
    <p class="text-gray-500">{{ props.emptyText }}</p>
  </div>

  <div v-else>
    <slot />
  </div>
</template>
