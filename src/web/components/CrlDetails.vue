<script setup lang="ts">
import { computed } from "vue";
import type { CrlDetail, Extension } from "@contracts/schemas";
import ExtensionView from "./ExtensionView.vue";
import { formatDateReadable, formatTimezoneOffset, getRelativeTime } from "../utils/dates";
import { computeCrlValidity } from "../utils/status";
import { formatName } from "../utils/x509";
import { copyToClipboard, formatHex } from "../utils/format";

const props = defineProps<{
  crl: CrlDetail;
}>();

const validityInfo = computed(() => {
  const thisUpdate = props.crl.tbsCertList.thisUpdate?.iso;
  const nextUpdate = props.crl.tbsCertList.nextUpdate?.iso;

  if (!thisUpdate) {
    return { display: "N/A", relative: "" };
  }

  const thisDate = new Date(thisUpdate);
  const tz = formatTimezoneOffset(thisDate);

  const issued = formatDateReadable(thisUpdate);
  const expires = nextUpdate ? formatDateReadable(nextUpdate) : "N/A";
  const relative = nextUpdate ? getRelativeTime(nextUpdate) : "";

  let display = `Issued ${issued}`;
  if (nextUpdate) {
    display += ` · Until ${expires} (${tz})`;
  } else {
    display += ` (${tz})`;
  }

  return { display, relative };
});

const validityStats = computed(() => {
  const thisUpdate = props.crl.tbsCertList.thisUpdate?.iso;
  const nextUpdate = props.crl.tbsCertList.nextUpdate?.iso;
  return computeCrlValidity(thisUpdate, nextUpdate);
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
    <!-- Basic Info -->
    <section>
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
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
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div v-if="crl.tbsCertList.version">
          <dt class="text-gray-500">Version</dt>
          <dd class="text-gray-900 font-mono">
            {{ crl.tbsCertList.version.display }}
          </dd>
        </div>

        <div class="md:col-span-2">
          <dt class="text-gray-500">Issuer</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">
            {{ formatName(crl.tbsCertList.issuer) }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500">Signature Algorithm</dt>
          <dd class="text-gray-900">
            {{
              crl.signatureAlgorithm?.algorithm?.name ||
              crl.signatureAlgorithm?.algorithm?.oid ||
              "Unknown"
            }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500">Revoked Certificates</dt>
          <dd class="text-gray-900">{{ revokedCount }}</dd>
        </div>
      </dl>
    </section>

    <!-- Validity -->
    <section>
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Validity Period
      </h4>
      <div class="text-sm text-gray-700 space-y-1">
        <div>
          {{ validityInfo.display }}
          <span v-if="validityInfo.relative" class="text-purple-700 ml-1">
            ({{ validityInfo.relative }})
          </span>
        </div>
        <div v-if="validityStats.validityPeriodHours" class="text-gray-600">
          <span class="font-medium">{{ validityStats.validityPeriodHours }} hours</span>
          total ·
          <span class="font-medium">{{ validityStats.hoursRemaining ?? "Expired" }} hours</span>
          remaining
        </div>
      </div>
    </section>

    <!-- Fingerprints -->
    <section>
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
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
        <div>
          <dt class="text-gray-500">SHA-1</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">
            {{ formatHex(crl.fingerprints.sha1) }}
            <button
              @click="copyToClipboard(crl.fingerprints.sha1)"
              class="ml-1 text-gray-400 hover:text-gray-600"
              title="Copy"
            >
              <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </dd>
        </div>
        <div>
          <dt class="text-gray-500">SHA-256</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">
            {{ formatHex(crl.fingerprints.sha256) }}
            <button
              @click="copyToClipboard(crl.fingerprints.sha256)"
              class="ml-1 text-gray-400 hover:text-gray-600"
              title="Copy"
            >
              <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          </dd>
        </div>
      </dl>
    </section>

    <!-- Revoked Certificates -->
    <section v-if="revokedCount > 0">
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
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
      <div class="max-h-64 overflow-auto border border-gray-200 rounded bg-white">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Serial Number
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Revocation Date
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Reason
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="cert in crl.tbsCertList.revokedCertificates?.items?.slice(0, 100) || []"
              :key="cert.userCertificate.hex"
            >
              <td class="px-3 py-2 font-mono text-xs text-gray-700">
                {{ cert.userCertificate.hex }}
              </td>
              <td class="px-3 py-2 text-gray-600">
                {{ cert.revocationDate.iso }}
              </td>
              <td class="px-3 py-2 text-gray-600">
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
                <span v-else class="text-gray-400">-</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="revokedCount > 100" class="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
          Showing first 100 of {{ revokedCount }} revoked certificates
        </div>
      </div>
    </section>

    <!-- Extensions -->
    <section v-if="crl.tbsCertList.crlExtensions?.items?.length">
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        Extensions ({{ crl.tbsCertList.crlExtensions?.items?.length }})
      </h4>
      <div class="space-y-2">
        <ExtensionView
          v-for="ext in crl.tbsCertList.crlExtensions?.items || []"
          :key="ext.extnID.oid"
          :extension="ext"
        />
      </div>
    </section>
  </div>
</template>
