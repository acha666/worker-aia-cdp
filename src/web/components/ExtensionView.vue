<script setup lang="ts">
import { ref, computed } from "vue";
import type { Extension } from "@contracts/schemas";

const props = defineProps<{
  extension: Extension;
}>();

const expanded = ref(false);

const extensionName = computed(() => {
  return props.extension.extnID.name || props.extension.extnID.oid;
});

const isParsed = computed(() => props.extension.parseStatus === "parsed");

type ParsedExtension = Record<string, any> & { extensionType?: string };

const parsed = computed<ParsedExtension | null>(() => {
  if (!isParsed.value) return null;
  if (!props.extension.parsed || typeof props.extension.parsed !== "object") {
    return null;
  }
  return props.extension.parsed as ParsedExtension;
});

function formatGeneralName(gn: { type?: string; value?: string }): string {
  const type = gn.type ?? "unknown";
  const value = gn.value ?? "";
  return `${type}: ${value}`;
}
</script>

<template>
  <div class="border border-gray-200 rounded bg-white">
    <button
      @click="expanded = !expanded"
      class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-900">{{ extensionName }}</span>
        <span
          v-if="extension.critical"
          class="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded"
        >
          Critical
        </span>
        <span
          v-if="!isParsed"
          class="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded"
        >
          {{ extension.parseStatus }}
        </span>
      </div>
      <svg
        :class="['w-4 h-4 text-gray-400 transition-transform', expanded ? 'rotate-180' : '']"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="expanded" class="overflow-hidden">
        <div class="px-3 py-2 border-t border-gray-100 text-sm">
          <!-- OID -->
          <div class="mb-2">
            <span class="text-gray-500">OID:</span>
            <code class="ml-1 text-xs text-gray-700">{{ extension.extnID.oid }}</code>
          </div>

          <!-- Parsed content -->
          <template v-if="parsed">
            <!-- Basic Constraints -->
            <template v-if="parsed.extensionType === 'basicConstraints'">
              <div class="space-y-1">
                <div>
                  <span class="text-gray-500">CA:</span>
                  <span class="ml-1" :class="parsed.cA ? 'text-green-600' : 'text-gray-600'">
                    {{ parsed.cA ? "Yes" : "No" }}
                  </span>
                </div>
                <div v-if="parsed.pathLenConstraint !== undefined">
                  <span class="text-gray-500">Path Length:</span>
                  <span class="ml-1 text-gray-900">
                    {{ parsed.pathLenConstraint }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Key Usage -->
            <template v-else-if="parsed.extensionType === 'keyUsage'">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="flag in parsed.usages || []"
                  :key="flag"
                  class="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
                >
                  {{ flag }}
                </span>
              </div>
            </template>

            <!-- Extended Key Usage -->
            <template v-else-if="parsed.extensionType === 'extendedKeyUsage'">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="usage in parsed.purposes || []"
                  :key="usage.oid"
                  class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded"
                  :title="usage.oid"
                >
                  {{ usage.name || usage.oid }}
                </span>
              </div>
            </template>

            <!-- Subject Alternative Name -->
            <template v-else-if="parsed.extensionType === 'subjectAltName'">
              <ul class="space-y-1">
                <li
                  v-for="(name, idx) in parsed.names || []"
                  :key="idx"
                  class="text-xs text-gray-700 font-mono"
                >
                  {{ formatGeneralName(name) }}
                </li>
              </ul>
            </template>

            <!-- Authority Key Identifier -->
            <template v-else-if="parsed.extensionType === 'authorityKeyIdentifier'">
              <div class="space-y-1">
                <div v-if="parsed.keyIdentifier">
                  <span class="text-gray-500">Key ID:</span>
                  <code class="ml-1 text-xs text-gray-700 break-all">{{
                    parsed.keyIdentifier
                  }}</code>
                </div>
              </div>
            </template>

            <!-- Subject Key Identifier (has 'keyIdentifier' but it's the only field or no authorityCertIssuer) -->
            <template v-else-if="parsed.extensionType === 'subjectKeyIdentifier'">
              <div>
                <span class="text-gray-500">Key ID:</span>
                <code class="ml-1 text-xs text-gray-700 break-all">{{ parsed.keyIdentifier }}</code>
              </div>
            </template>

            <!-- CRL Distribution Points -->
            <template v-else-if="parsed.extensionType === 'cRLDistributionPoints'">
              <ul class="space-y-2">
                <li v-for="(dp, idx) in parsed.distributionPoints || []" :key="idx" class="text-xs">
                  <template v-if="dp.distributionPoint?.fullName">
                    <div
                      v-for="(name, nidx) in dp.distributionPoint.fullName"
                      :key="nidx"
                      class="text-gray-700 font-mono"
                    >
                      {{ formatGeneralName(name) }}
                    </div>
                  </template>
                </li>
              </ul>
            </template>

            <!-- Authority Info Access -->
            <template v-else-if="parsed.extensionType === 'authorityInfoAccess'">
              <ul class="space-y-1">
                <li
                  v-for="(desc, idx) in parsed.accessDescriptions || []"
                  :key="idx"
                  class="text-xs"
                >
                  <span class="text-gray-500"
                    >{{ desc.accessMethod.name || desc.accessMethod.oid }}:</span
                  >
                  <span class="ml-1 text-gray-700 font-mono">{{
                    formatGeneralName(desc.accessLocation)
                  }}</span>
                </li>
              </ul>
            </template>

            <!-- Certificate Policies -->
            <template v-else-if="parsed.extensionType === 'certificatePolicies'">
              <ul class="space-y-1">
                <li
                  v-for="policy in parsed.policies || []"
                  :key="policy.policyIdentifier.oid"
                  class="text-xs"
                >
                  <span class="text-gray-700">{{
                    policy.policyIdentifier.name || policy.policyIdentifier.oid
                  }}</span>
                </li>
              </ul>
            </template>

            <!-- CRL Number -->
            <template v-else-if="parsed.extensionType === 'cRLNumber'">
              <div>
                <span class="text-gray-500">CRL Number:</span>
                <span class="ml-1 text-gray-900">{{ parsed.number }}</span>
              </div>
            </template>

            <!-- Delta CRL Indicator -->
            <template v-else-if="parsed.extensionType === 'deltaCRLIndicator'">
              <div>
                <span class="text-gray-500">Base CRL Number:</span>
                <span class="ml-1 text-gray-900">{{ parsed.baseCRLNumber }}</span>
              </div>
            </template>

            <!-- Generic fallback -->
            <template v-else>
              <pre class="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-auto max-h-40">{{
                JSON.stringify(parsed, null, 2)
              }}</pre>
            </template>
          </template>

          <!-- Raw hex for unsupported/error -->
          <template v-else>
            <div v-if="extension.parseError" class="text-xs text-red-600 mb-2">
              Error: {{ extension.parseError }}
            </div>
            <details class="text-xs">
              <summary class="cursor-pointer text-gray-500 hover:text-gray-700">
                Raw value (hex)
              </summary>
              <code
                class="block mt-1 p-2 bg-gray-50 rounded text-gray-600 break-all max-h-32 overflow-auto"
              >
                {{ extension.extnValue.hex }}
              </code>
            </details>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>
