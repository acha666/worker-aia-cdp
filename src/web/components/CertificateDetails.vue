<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { CertificateDetail, Name } from "@contracts/schemas";
import ExtensionView from "./ExtensionView.vue";
import HexValue from "./HexValue.vue";
import StatusBadge from "./StatusBadge.vue";
import { formatDateTimeWithZone, getRelativeTimeDetailed } from "../utils/dates";
import { computeCertificateStatus } from "../utils/status";

const props = defineProps<{
  certificate: CertificateDetail;
}>();

const { t } = useI18n();

const publicKeyInfo = computed(() => {
  const parsed = props.certificate.tbsCertificate.subjectPublicKeyInfo.parsed;
  if (!parsed) return null;

  if (parsed.type === "rsa") {
    return {
      type: "RSA" as const,
      keySize: parsed.modulus.bitLength,
    };
  }
  if (parsed.type === "ec") {
    return {
      type: "EC" as const,
      curve: parsed.curve.name || parsed.curve.oid,
    };
  }
  return { type: parsed.type ?? "unknown" };
});

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

const subjectFields = computed(() => mapNameFields(props.certificate.tbsCertificate.subject));
const issuerFields = computed(() => mapNameFields(props.certificate.tbsCertificate.issuer));

const validityDates = computed(() => {
  const { notBefore, notAfter } = props.certificate.tbsCertificate.validity;
  return {
    notBefore: formatDateTimeWithZone(notBefore?.iso ?? null),
    notAfter: formatDateTimeWithZone(notAfter?.iso ?? null),
  };
});

const validityStatus = computed(() => {
  const { notBefore, notAfter } = props.certificate.tbsCertificate.validity;
  const status = computeCertificateStatus(notBefore?.iso, notAfter?.iso);
  if (status.state === "expired") {
    return {
      label: t("status.expired"),
      detail: getRelativeTimeDetailed(notAfter?.iso ?? null),
      state: status.state,
    };
  }
  if (status.state === "not-yet-valid") {
    return {
      label: t("status.notYetValid"),
      detail: getRelativeTimeDetailed(notBefore?.iso ?? null),
      state: status.state,
    };
  }
  return {
    label: t("status.active"),
    detail: getRelativeTimeDetailed(notAfter?.iso ?? null),
    state: status.state,
  };
});

const sortedExtensions = computed(() => {
  const items = props.certificate.tbsCertificate.extensions?.items ?? [];
  return [...items].sort((a, b) => {
    if (a.critical !== b.critical) return a.critical ? -1 : 1;
    const aName = a.extnID.name || a.extnID.oid;
    const bName = b.extnID.name || b.extnID.oid;
    return aName.localeCompare(bName);
  });
});
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{
        t("details.certificate.information")
      }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <div class="d-flex flex-column ga-2 text-body-2">
              <div>
                <span class="text-medium-emphasis"
                  >{{ t("details.certificate.x509Version") }}:</span
                >
                <span class="ml-2 font-weight-medium">{{
                  certificate.tbsCertificate.version.display
                }}</span>
              </div>
              <div>
                <span class="text-medium-emphasis"
                  >{{ t("details.certificate.serialNumber") }}:</span
                >
                <HexValue
                  class="ml-2"
                  :value="certificate.tbsCertificate.serialNumber.hex"
                  variant="plain"
                  value-class="font-mono text-body-2"
                />
              </div>
            </div>
          </v-col>
          <v-col cols="12" md="6">
            <v-card variant="outlined">
              <v-card-title class="text-caption">{{
                t("details.certificate.subject")
              }}</v-card-title>
              <v-card-text class="d-flex flex-column ga-1 text-body-2">
                <div v-for="field in subjectFields" :key="field.labelKey">
                  <span class="text-medium-emphasis">{{ t(field.labelKey) }}:</span>
                  <span class="ml-2">{{ field.value }}</span>
                </div>
              </v-card-text>
            </v-card>
            <v-card variant="outlined" class="mt-3">
              <v-card-title class="text-caption">{{
                t("details.certificate.issuer")
              }}</v-card-title>
              <v-card-text class="d-flex flex-column ga-1 text-body-2">
                <div v-for="field in issuerFields" :key="field.labelKey">
                  <span class="text-medium-emphasis">{{ t(field.labelKey) }}:</span>
                  <span class="ml-2">{{ field.value }}</span>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{ t("details.certificate.validity") }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-2 text-body-2">
        <div>
          <span class="text-medium-emphasis">{{ t("details.certificate.notBefore") }}:</span>
          <span class="ml-2">{{ validityDates.notBefore }}</span>
        </div>
        <div>
          <span class="text-medium-emphasis">{{ t("details.certificate.notAfter") }}:</span>
          <span class="ml-2">{{ validityDates.notAfter }}</span>
        </div>
        <div class="d-flex align-center ga-2">
          <span class="text-medium-emphasis">{{ t("details.certificate.status") }}:</span>
          <StatusBadge :state="validityStatus.state" type="certificate" />
          <span v-if="validityStatus.detail" class="text-medium-emphasis"
            >({{ validityStatus.detail }})</span
          >
        </div>
      </v-card-text>
    </v-card>

    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{
        t("details.certificate.cryptography")
      }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-2 text-body-2">
        <div>
          <span class="text-medium-emphasis"
            >{{ t("details.certificate.signatureAlgorithm") }}:</span
          >
          <span class="ml-2">{{
            certificate.signatureAlgorithm?.algorithm?.name ||
            certificate.signatureAlgorithm?.algorithm?.oid ||
            t("common.unknown")
          }}</span>
        </div>
        <div>
          <span class="text-medium-emphasis"
            >{{ t("details.certificate.publicKeyAlgorithm") }}:</span
          >
          <span class="ml-2">{{
            certificate.tbsCertificate.subjectPublicKeyInfo.algorithm?.algorithm?.name ||
            certificate.tbsCertificate.subjectPublicKeyInfo.algorithm?.algorithm?.oid ||
            t("common.unknown")
          }}</span>
        </div>
        <div v-if="publicKeyInfo">
          <span class="text-medium-emphasis"
            >{{
              publicKeyInfo.type === "RSA"
                ? t("details.certificate.keySize")
                : t("details.certificate.curve")
            }}:</span
          >
          <span class="ml-2">
            {{
              publicKeyInfo.type === "RSA"
                ? `${publicKeyInfo.keySize} ${t("common.bits")}`
                : publicKeyInfo.type === "EC"
                  ? publicKeyInfo.curve
                  : ""
            }}
          </span>
        </div>
        <div>
          <span class="text-medium-emphasis">{{ t("details.certificate.publicKeySha1") }}:</span>
          <HexValue
            class="ml-2"
            :value="certificate.tbsCertificate.subjectPublicKeyInfo.fingerprints.sha1"
            variant="grouped"
            value-class="font-mono text-body-2"
          />
        </div>
        <div>
          <span class="text-medium-emphasis">{{ t("details.certificate.publicKeySha256") }}:</span>
          <HexValue
            class="ml-2"
            :value="certificate.tbsCertificate.subjectPublicKeyInfo.fingerprints.sha256"
            variant="grouped"
            value-class="font-mono text-body-2"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-card variant="tonal">
      <v-card-title class="text-subtitle-1">{{
        t("details.certificate.fingerprints")
      }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-2 text-body-2">
        <div>
          <span class="text-medium-emphasis">SHA-1:</span>
          <HexValue
            class="ml-2"
            :value="certificate.fingerprints.sha1"
            variant="grouped"
            value-class="font-mono text-body-2"
          />
        </div>
        <div>
          <span class="text-medium-emphasis">SHA-256:</span>
          <HexValue
            class="ml-2"
            :value="certificate.fingerprints.sha256"
            variant="grouped"
            value-class="font-mono text-body-2"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-card v-if="sortedExtensions.length" variant="tonal">
      <v-card-title class="text-subtitle-1">
        {{ t("details.certificate.extensions") }} ({{ sortedExtensions.length }})
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-2">
        <ExtensionView v-for="ext in sortedExtensions" :key="ext.extnID.oid" :extension="ext" />
      </v-card-text>
    </v-card>
  </div>
</template>
