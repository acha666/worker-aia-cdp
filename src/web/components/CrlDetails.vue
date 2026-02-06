<script setup lang="ts">
import { computed } from "vue";
import type { CrlDetail, Extension, Name } from "@contracts/schemas";
import ExtensionView from "./ExtensionView.vue";
import HexValue from "./HexValue.vue";
import { formatDateTimeWithZone, getRelativeTimeDetailed } from "../utils/dates";
import { computeCrlStatus } from "../utils/status";

const props = defineProps<{
  crl: CrlDetail;
}>();

const EMPTY_VALUE = "(empty)";

function displayValue(value?: string | null): string {
  if (!value) return EMPTY_VALUE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_VALUE;
}

function mapNameFields(name: Name) {
  return [
    { label: "Common Name", value: displayValue(name.commonName) },
    { label: "Organization", value: displayValue(name.organization) },
    { label: "Organizational Unit", value: displayValue(name.organizationalUnit) },
    { label: "Country Name", value: displayValue(name.country) },
    { label: "State/Province", value: displayValue(name.stateOrProvince) },
    { label: "Locality", value: displayValue(name.locality) },
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
    return { label: "Expired", detail: getRelativeTimeDetailed(nextUpdate) };
  }
  if (status.state === "stale") {
    return { label: "Stale", detail: getRelativeTimeDetailed(nextUpdate) };
  }
  return { label: "Current", detail: getRelativeTimeDetailed(nextUpdate) };
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
  <div class="space-y-6">
    <!-- CRL Information -->
    <section>
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        CRL Information
      </h4>
      <div class="space-y-4">
        <dl class="space-y-2 text-sm">
          <div
            v-if="crl.tbsCertList.version"
            class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline"
          >
            <dt
              class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              Version
            </dt>
            <dd class="text-gray-900 dark:text-white font-medium">
              {{ crl.tbsCertList.version.display }}
            </dd>
          </div>
          <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
            <dt
              class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              Revoked Certificates
            </dt>
            <dd class="text-gray-900 dark:text-white font-medium">{{ revokedCount }}</dd>
          </div>
        </dl>

        <div
          class="border border-gray-200 dark:border-dark-border rounded dark:bg-dark-surface/30 bg-gray-50/60 p-3"
        >
          <h5
            class="text-xs font-semibold text-gray-700 dark:text-dark-text uppercase tracking-wide mb-2"
          >
            Issuer
          </h5>
          <dl class="space-y-2 text-sm">
            <div
              v-for="field in issuerFields"
              :key="field.label"
              class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline"
            >
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
              >
                {{ field.label }}
              </dt>
              <dd class="text-gray-900 dark:text-white font-medium">{{ field.value }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <!-- Validity -->
    <section>
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Validity
      </h4>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            This Update
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">{{ validityDates.thisUpdate }}</dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Next Update
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">{{ validityDates.nextUpdate }}</dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Status
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">
            {{ validityStatus.label }}
            <span v-if="validityStatus.detail" class="text-gray-600 dark:text-gray-400">
              ({{ validityStatus.detail }})
            </span>
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
        Cryptography
      </h4>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Signature Algorithm
          </dt>
          <dd class="text-gray-900 dark:text-white font-medium">
            {{
              crl.signatureAlgorithm?.algorithm?.name ||
              crl.signatureAlgorithm?.algorithm?.oid ||
              "Unknown"
            }}
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
        Fingerprints
      </h4>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-baseline">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            SHA-1
          </dt>
          <dd class="text-gray-900 dark:text-white">
            <HexValue :value="crl.fingerprints.sha1" variant="grouped" />
          </dd>
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-x-3 items-start">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            SHA-256
          </dt>
          <dd class="text-gray-900 dark:text-white">
            <HexValue :value="crl.fingerprints.sha256" variant="grouped" />
          </dd>
        </div>
      </dl>
    </section>

    <!-- Revoked Certificates -->
    <section v-if="revokedCount > 0">
      <h4
        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
        Revoked Certificates ({{ revokedCount }})
      </h4>
      <div
        class="max-h-64 overflow-auto border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-surface"
      >
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 dark:bg-dark-surface/50 sticky top-0">
            <tr>
              <th
                class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
              >
                Serial Number
              </th>
              <th
                class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
              >
                Revocation Date
              </th>
              <th
                class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
              >
                Reason
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-600">
            <tr
              v-for="cert in crl.tbsCertList.revokedCertificates?.items?.slice(0, 100) || []"
              :key="cert.userCertificate.hex"
            >
              <td class="px-3 py-2 text-gray-700 dark:text-dark-text">
                <HexValue
                  :value="cert.userCertificate.hex"
                  variant="plain"
                  value-class="font-mono text-sm break-all"
                />
              </td>
              <td class="px-3 py-2 text-gray-600 dark:text-gray-400">
                {{ cert.revocationDate.iso }}
              </td>
              <td class="px-3 py-2 text-gray-600 dark:text-gray-400">
                <template v-if="cert.crlEntryExtensions?.items">
                  <template
                    v-for="ext in cert.crlEntryExtensions?.items || []"
                    :key="ext.extnID.oid"
                  >
                    <span v-if="getCrlReasonName(ext)">
                      {{ getCrlReasonName(ext) }}
                    </span>
                  </template>
                </template>
                <span v-else class="text-gray-400 dark:text-gray-500">-</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="revokedCount > 100"
          class="px-3 py-2 text-xs text-gray-500 dark:text-dark-textMuted bg-gray-50 dark:bg-dark-surface/50 border-t border-gray-200 dark:border-dark-border"
        >
          Showing first 100 of {{ revokedCount }} revoked certificates
        </div>
      </div>
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
        Extensions ({{ sortedExtensions.length }})
      </h4>
      <div class="space-y-2">
        <ExtensionView v-for="ext in sortedExtensions" :key="ext.extnID.oid" :extension="ext" />
      </div>
    </section>
  </div>
</template>
