<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Extension } from "@contracts/schemas";
import HexValue from "./HexValue.vue";

const props = defineProps<{
  extension: Extension;
}>();

const { t } = useI18n();

const expanded = ref<number[]>([]);

const extensionName = computed(() => {
  return props.extension.extnID.name || props.extension.extnID.oid;
});

const isParsed = computed(() => props.extension.parseStatus === "parsed");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParsedExtension = Record<string, any> & { extensionType?: string };

const parsed = computed<ParsedExtension | null>(() => {
  if (!isParsed.value) return null;
  if (!props.extension.parsed || typeof props.extension.parsed !== "object") {
    return null;
  }
  return props.extension.parsed as ParsedExtension;
});

function formatGeneralName(gn: { type?: string; value?: string }): string {
  const type = gn.type ?? t("extension.unknownType");
  const value = gn.value ?? "";
  return `${type}: ${value}`;
}
</script>

<template>
  <v-expansion-panels v-model="expanded" variant="accordion" elevation="0">
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div class="d-flex align-center ga-2 flex-wrap">
          <span class="text-body-2 font-weight-medium">{{ extensionName }}</span>
          <v-chip v-if="extension.critical" color="error" size="x-small" variant="tonal" label>
            {{ t("extension.critical") }}
          </v-chip>
          <v-chip v-if="!isParsed" size="x-small" variant="tonal" label>
            {{ extension.parseStatus }}
          </v-chip>
        </div>
      </v-expansion-panel-title>

      <v-expansion-panel-text>
        <div class="mb-2 text-body-2">
          <span class="text-medium-emphasis">{{ t("extension.oid") }}:</span>
          <span class="ml-2 font-weight-medium">{{ extension.extnID.oid }}</span>
        </div>

        <template v-if="parsed">
          <template v-if="parsed.extensionType === 'basicConstraints'">
            <div class="d-flex flex-column ga-1 text-body-2">
              <div>
                <span class="text-medium-emphasis">{{ t("extension.ca") }}:</span>
                <v-chip
                  class="ml-2"
                  :color="parsed.cA ? 'success' : undefined"
                  size="x-small"
                  variant="tonal"
                  label
                >
                  {{ parsed.cA ? t("common.yes") : t("common.no") }}
                </v-chip>
              </div>
              <div v-if="parsed.pathLenConstraint !== undefined">
                <span class="text-medium-emphasis">{{ t("extension.pathLength") }}:</span>
                <span class="ml-2">{{ parsed.pathLenConstraint }}</span>
              </div>
            </div>
          </template>

          <template v-else-if="parsed.extensionType === 'keyUsage'">
            <div class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="flag in parsed.usages || []"
                :key="flag"
                size="x-small"
                color="primary"
                variant="tonal"
                label
              >
                {{ flag }}
              </v-chip>
            </div>
          </template>

          <template v-else-if="parsed.extensionType === 'extendedKeyUsage'">
            <div class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="usage in parsed.purposes || []"
                :key="usage.oid"
                size="x-small"
                color="secondary"
                variant="tonal"
                :title="usage.oid"
                label
              >
                {{ usage.name || usage.oid }}
              </v-chip>
            </div>
          </template>

          <template v-else-if="parsed.extensionType === 'subjectAltName'">
            <v-list density="compact" class="py-0">
              <v-list-item v-for="(name, idx) in parsed.names || []" :key="idx" class="px-0">
                <v-list-item-title class="font-mono text-caption">
                  {{ formatGeneralName(name) }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </template>

          <template
            v-else-if="
              parsed.extensionType === 'authorityKeyIdentifier' ||
              parsed.extensionType === 'subjectKeyIdentifier'
            "
          >
            <div v-if="parsed.keyIdentifier" class="text-body-2">
              <span class="text-medium-emphasis">{{ t("extension.keyId") }}:</span>
              <HexValue
                class="ml-2"
                :value="parsed.keyIdentifier"
                variant="grouped"
                value-class="text-body-2 font-mono"
              />
            </div>
          </template>

          <template v-else-if="parsed.extensionType === 'cRLDistributionPoints'">
            <v-list density="compact" class="py-0">
              <v-list-item
                v-for="(dp, idx) in parsed.distributionPoints || []"
                :key="idx"
                class="px-0"
              >
                <v-list-item-title class="font-mono text-caption">
                  <template v-if="dp.distributionPoint?.fullName">
                    <div v-for="(name, nidx) in dp.distributionPoint.fullName" :key="nidx">
                      {{ formatGeneralName(name) }}
                    </div>
                  </template>
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </template>

          <template v-else-if="parsed.extensionType === 'authorityInfoAccess'">
            <v-list density="compact" class="py-0">
              <v-list-item
                v-for="(desc, idx) in parsed.accessDescriptions || []"
                :key="idx"
                class="px-0"
              >
                <v-list-item-title class="text-caption">
                  <span class="text-medium-emphasis"
                    >{{ desc.accessMethod.name || desc.accessMethod.oid }}:</span
                  >
                  <span class="ml-2 font-mono">{{ formatGeneralName(desc.accessLocation) }}</span>
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </template>

          <template v-else-if="parsed.extensionType === 'certificatePolicies'">
            <v-list density="compact" class="py-0">
              <v-list-item
                v-for="policy in parsed.policies || []"
                :key="policy.policyIdentifier.oid"
                class="px-0"
              >
                <v-list-item-title class="text-caption">
                  {{ policy.policyIdentifier.name || policy.policyIdentifier.oid }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </template>

          <template v-else-if="parsed.extensionType === 'cRLNumber'">
            <div class="text-body-2">
              <span class="text-medium-emphasis">{{ t("extension.crlNumber") }}:</span>
              <span class="ml-2">{{ parsed.number }}</span>
            </div>
          </template>

          <template v-else-if="parsed.extensionType === 'deltaCRLIndicator'">
            <div class="text-body-2">
              <span class="text-medium-emphasis">{{ t("extension.baseCrlNumber") }}:</span>
              <span class="ml-2">{{ parsed.baseCRLNumber }}</span>
            </div>
          </template>

          <template v-else>
            <v-sheet border rounded class="pa-2">
              <pre class="text-caption" style="white-space: pre-wrap">{{
                JSON.stringify(parsed, null, 2)
              }}</pre>
            </v-sheet>
          </template>
        </template>

        <template v-else>
          <v-alert
            v-if="extension.parseError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            {{ t("extension.error") }}: {{ extension.parseError }}
          </v-alert>
          <v-expansion-panels variant="accordion" elevation="0">
            <v-expansion-panel>
              <v-expansion-panel-title class="text-caption">{{
                t("extension.rawHex")
              }}</v-expansion-panel-title>
              <v-expansion-panel-text>
                <HexValue
                  block
                  :value="extension.extnValue.hex"
                  variant="grouped"
                  value-class="text-body-2 font-mono"
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
