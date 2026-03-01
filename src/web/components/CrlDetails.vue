<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { CrlDetail, Extension, Name } from "@contracts/schemas";
import ExtensionView from "./ExtensionView.vue";
import HexValue from "./HexValue.vue";
import StatusBadge from "./StatusBadge.vue";
import { formatDateTimeWithZone, getRelativeTimeDetailed } from "../utils/dates";
import { computeCrlStatus } from "../utils/status";

const props = defineProps<{
  crl: CrlDetail;
}>();

const { t } = useI18n();

function displayValue(value?: string | null): string {
  if (!value) return t("common.emptyValue");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : t("common.emptyValue");
}

function mapNameFields(name: Name) {
  return [
    { labelKey: "nameFields.commonName", value: displayValue(name.commonName) },
    { labelKey: "nameFields.organization", value: displayValue(name.organization) },
    { labelKey: "nameFields.organizationalUnit", value: displayValue(name.organizationalUnit) },
    { labelKey: "nameFields.countryName", value: displayValue(name.country) },
    { labelKey: "nameFields.stateProvince", value: displayValue(name.stateOrProvince) },
    { labelKey: "nameFields.locality", value: displayValue(name.locality) },
  ];
}

const issuerFields = computed(() => mapNameFields(props.crl.tbsCertList.issuer));

const validityDates = computed(() => {
  const thisUpdate = props.crl.tbsCertList.thisUpdate?.iso ?? null;
  const nextUpdate = props.crl.tbsCertList.nextUpdate?.iso ?? null;
  return {
    thisUpdate: formatDateTimeWithZone(thisUpdate),
    nextUpdate: formatDateTimeWithZone(nextUpdate),
  };
});

const validityStatus = computed(() => {
  const thisUpdate = props.crl.tbsCertList.thisUpdate?.iso ?? null;
  const nextUpdate = props.crl.tbsCertList.nextUpdate?.iso ?? null;
  const status = computeCrlStatus(thisUpdate, nextUpdate);
  if (status.state === "expired") {
    return {
      label: t("status.expired"),
      detail: getRelativeTimeDetailed(nextUpdate),
      state: status.state,
    };
  }
  if (status.state === "stale") {
    return {
      label: t("status.stale"),
      detail: getRelativeTimeDetailed(nextUpdate),
      state: status.state,
    };
  }
  return {
    label: t("status.current"),
    detail: getRelativeTimeDetailed(nextUpdate),
    state: status.state,
  };
});

const formattedRevokedCerts = computed(() => {
  const items = props.crl.tbsCertList.revokedCertificates?.items ?? [];
  return items.map((cert) => ({
    ...cert,
    revocationDateFormatted: formatDateTimeWithZone(cert.revocationDate?.iso ?? null),
  }));
});

const sortedExtensions = computed(() => {
  const items = props.crl.tbsCertList.crlExtensions?.items ?? [];
  return [...items].sort((a, b) => {
    if (a.critical !== b.critical) return a.critical ? -1 : 1;
    const aName = a.extnID.name || a.extnID.oid;
    const bName = b.extnID.name || b.extnID.oid;
    return aName.localeCompare(bName);
  });
});

function getCrlReasonName(extension: Extension): string | null {
  if (extension.parseStatus !== "parsed") return null;
  if (!extension.parsed || typeof extension.parsed !== "object") return null;
  const parsed = extension.parsed as { extensionType?: string; name?: string };
  if (parsed.extensionType === "cRLReason" && typeof parsed.name === "string") {
    return parsed.name;
  }
  return null;
}

const revokedCount = props.crl.tbsCertList.revokedCertificates?.count || 0;
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{ t("details.crl.information") }}</v-card-title>
      <v-card-text>
        <div class="d-flex flex-column ga-2 text-body-2">
          <div v-if="crl.tbsCertList.version">
            <span class="text-medium-emphasis">{{ t("details.crl.version") }}:</span>
            <span class="ml-2">{{ crl.tbsCertList.version.display }}</span>
          </div>
          <div>
            <span class="text-medium-emphasis">{{ t("details.crl.revokedCertificates") }}:</span>
            <span class="ml-2">{{ revokedCount }}</span>
          </div>
        </div>

        <v-card variant="outlined" class="mt-4">
          <v-card-title class="text-caption">{{ t("details.crl.issuer") }}</v-card-title>
          <v-card-text class="d-flex flex-column ga-1 text-body-2">
            <div v-for="field in issuerFields" :key="field.labelKey">
              <span class="text-medium-emphasis">{{ t(field.labelKey) }}:</span>
              <span class="ml-2">{{ field.value }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>

    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{ t("details.crl.validity") }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-2 text-body-2">
        <div>
          <span class="text-medium-emphasis">{{ t("details.crl.thisUpdate") }}:</span>
          <span class="ml-2">{{ validityDates.thisUpdate }}</span>
        </div>
        <div>
          <span class="text-medium-emphasis">{{ t("details.crl.nextUpdate") }}:</span>
          <span class="ml-2">{{ validityDates.nextUpdate }}</span>
        </div>
        <div class="d-flex align-center ga-2">
          <span class="text-medium-emphasis">{{ t("details.crl.status") }}:</span>
          <StatusBadge :state="validityStatus.state" type="crl" />
          <span v-if="validityStatus.detail" class="text-medium-emphasis"
            >({{ validityStatus.detail }})</span
          >
        </div>
      </v-card-text>
    </v-card>

    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{ t("details.crl.cryptography") }}</v-card-title>
      <v-card-text class="text-body-2">
        <span class="text-medium-emphasis">{{ t("details.crl.signatureAlgorithm") }}:</span>
        <span class="ml-2">{{
          crl.signatureAlgorithm?.algorithm?.name ||
          crl.signatureAlgorithm?.algorithm?.oid ||
          t("common.unknown")
        }}</span>
      </v-card-text>
    </v-card>

    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{ t("details.crl.fingerprints") }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-2 text-body-2">
        <div>
          <span class="text-medium-emphasis">SHA-1:</span>
          <HexValue class="ml-2" :value="crl.fingerprints.sha1" variant="grouped" />
        </div>
        <div>
          <span class="text-medium-emphasis">SHA-256:</span>
          <HexValue class="ml-2" :value="crl.fingerprints.sha256" variant="grouped" />
        </div>
      </v-card-text>
    </v-card>

    <v-card v-if="revokedCount > 0" variant="tonal">
      <v-card-title class="text-subtitle-1">
        {{ t("details.crl.revokedCertificates") }} ({{ revokedCount }})
      </v-card-title>
      <v-card-text>
        <v-table density="compact" fixed-header height="320">
          <thead>
            <tr>
              <th>{{ t("details.crl.serialNumber") }}</th>
              <th>{{ t("details.crl.revocationDate") }}</th>
              <th>{{ t("details.crl.reason") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cert in formattedRevokedCerts.slice(0, 100)" :key="cert.userCertificate.hex">
              <td>
                <HexValue
                  :value="cert.userCertificate.hex"
                  variant="plain"
                  value-class="font-mono text-body-2"
                />
              </td>
              <td>{{ cert.revocationDateFormatted }}</td>
              <td>
                <template v-if="cert.crlEntryExtensions?.items">
                  <template
                    v-for="ext in cert.crlEntryExtensions?.items || []"
                    :key="ext.extnID.oid"
                  >
                    <span v-if="getCrlReasonName(ext)">{{ getCrlReasonName(ext) }}</span>
                  </template>
                </template>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </v-table>
        <div v-if="revokedCount > 100" class="text-caption text-medium-emphasis mt-2">
          {{ t("common.showingFirst", { limit: 100, total: revokedCount }) }}
        </div>
      </v-card-text>
    </v-card>

    <v-card v-if="sortedExtensions.length" variant="tonal">
      <v-card-title class="text-subtitle-1"
        >{{ t("details.crl.extensions") }} ({{ sortedExtensions.length }})</v-card-title
      >
      <v-card-text class="d-flex flex-column ga-2">
        <ExtensionView v-for="ext in sortedExtensions" :key="ext.extnID.oid" :extension="ext" />
      </v-card-text>
    </v-card>
  </div>
</template>
