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
  <div class="space-y-6">
    <!-- Certificate Information -->
    <section>
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-dark-text mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {{ t("details.certificate.information") }}
      </h4>
      <div class="space-y-4">
        <dl class="space-y-2 text-sm">
          <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
            <dt
              class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              {{ t("details.certificate.x509Version") }}
            </dt>
            <dd class="text-gray-900 dark:text-white font-medium">
              {{ certificate.tbsCertificate.version.display }}
            </dd>
          </div>
          <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
            <dt
              class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              {{ t("details.certificate.serialNumber") }}
            </dt>
            <dd class="text-gray-900 dark:text-white">
              <HexValue
                :value="certificate.tbsCertificate.serialNumber.hex"
                variant="plain"
                value-class="font-mono text-sm break-all"
              />
            </dd>
          </div>
        </dl>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            class="border border-gray-200 dark:border-dark-border rounded dark:bg-dark-surface/30 bg-gray-50/60 p-3"
          >
            <h5
              class="text-xs font-semibold text-gray-700 dark:text-dark-text uppercase tracking-wide mb-2"
            >
              {{ t("details.certificate.subject") }}
            </h5>
            <dl class="space-y-2 text-sm">
              <div
                v-for="field in subjectFields"
                :key="field.labelKey"
                class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline"
              >
                <dt
                  class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {{ t(field.labelKey) }}
                </dt>
                <dd class="text-gray-900 dark:text-white font-medium">{{ field.value }}</dd>
              </div>
            </dl>
          </div>
          <div
            class="border border-gray-200 dark:border-dark-border rounded dark:bg-dark-surface/30 bg-gray-50/60 p-3"
          >
            <h5
              class="text-xs font-semibold text-gray-700 dark:text-dark-text uppercase tracking-wide mb-2"
            >
              {{ t("details.certificate.issuer") }}
            </h5>
            <dl class="space-y-2 text-sm">
              <div
                v-for="field in issuerFields"
                :key="field.labelKey"
                class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline"
              >
                <dt
                  class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                >
                  {{ t(field.labelKey) }}
                </dt>
                <dd class="text-gray-900 dark:text-white font-medium">{{ field.value }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <!-- Validity -->
    <section>
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-dark-text mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {{ t("details.certificate.validity") }}
      </h4>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.notBefore") }}
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">{{ validityDates.notBefore }}</dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.notAfter") }}
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">{{ validityDates.notAfter }}</dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.status") }}
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">
            <div class="flex items-center gap-2">
              <StatusBadge :state="validityStatus.state" type="certificate" />
              <span v-if="validityStatus.detail" class="text-gray-600 dark:text-gray-400">
                ({{ validityStatus.detail }})
              </span>
            </div>
          </dd>
        </div>
      </dl>
    </section>

    <!-- Cryptography -->
    <section>
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        {{ t("details.certificate.cryptography") }}
      </h4>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.signatureAlgorithm") }}
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">
            {{
              certificate.signatureAlgorithm?.algorithm?.name ||
              certificate.signatureAlgorithm?.algorithm?.oid ||
              t("common.unknown")
            }}
          </dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.publicKeyAlgorithm") }}
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">
            {{
              certificate.tbsCertificate.subjectPublicKeyInfo.algorithm?.algorithm?.name ||
              certificate.tbsCertificate.subjectPublicKeyInfo.algorithm?.algorithm?.oid ||
              t("common.unknown")
            }}
          </dd>
        </div>
        <div v-if="publicKeyInfo" class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <template v-if="publicKeyInfo.type === 'RSA'">
            <dt
              class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              {{ t("details.certificate.keySize") }}
            </dt>
            <dd class="text-gray-900 dark:text-white font-medium">
              {{ publicKeyInfo.keySize }} {{ t("common.bits") }}
            </dd>
          </template>
          <template v-else-if="publicKeyInfo.type === 'EC'">
            <dt
              class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              {{ t("details.certificate.curve") }}
            </dt>
            <dd class="text-gray-900 dark:text-white font-medium">{{ publicKeyInfo.curve }}</dd>
          </template>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.publicKeySha1") }}
          </dt>
          <dd class="text-gray-900 dark:text-white">
            <HexValue
              :value="certificate.tbsCertificate.subjectPublicKeyInfo.fingerprints.sha1"
              variant="grouped"
              value-class="font-mono text-sm break-all"
            />
          </dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {{ t("details.certificate.publicKeySha256") }}
          </dt>
          <dd class="text-gray-900 dark:text-white">
            <HexValue
              :value="certificate.tbsCertificate.subjectPublicKeyInfo.fingerprints.sha256"
              variant="grouped"
              value-class="font-mono text-sm break-all"
            />
          </dd>
        </div>
      </dl>
    </section>

    <!-- Fingerprints -->
    <section>
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
          />
        </svg>
        {{ t("details.certificate.fingerprints") }}
      </h4>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            SHA-1
          </dt>
          <dd class="text-gray-900 dark:text-white">
            <HexValue
              :value="certificate.fingerprints.sha1"
              variant="grouped"
              value-class="font-mono text-sm break-all"
            />
          </dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            SHA-256
          </dt>
          <dd class="text-gray-900 dark:text-white">
            <HexValue
              :value="certificate.fingerprints.sha256"
              variant="grouped"
              value-class="font-mono text-sm break-all"
            />
          </dd>
        </div>
      </dl>
    </section>

    <!-- Extensions -->
    <section v-if="sortedExtensions.length">
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        {{ t("details.certificate.extensions") }} ({{ sortedExtensions.length }})
      </h4>
      <div class="space-y-2">
        <ExtensionView v-for="ext in sortedExtensions" :key="ext.extnID.oid" :extension="ext" />
      </div>
    </section>
  </div>
</template>
