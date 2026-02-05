<script setup lang="ts">
import { computed } from "vue";
import type { CertificateDetail } from "@contracts/schemas";
import ExtensionView from "./ExtensionView.vue";
import { formatDateReadable, formatTimezoneOffset, getRelativeTime } from "../utils/dates";
import { computeCertificateValidity } from "../utils/status";
import { formatName } from "../utils/x509";
import { copyToClipboard, formatHex } from "../utils/format";

const props = defineProps<{
  certificate: CertificateDetail;
}>();

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

const validityInfo = computed(() => {
  const { notBefore, notAfter } = props.certificate.tbsCertificate.validity;
  if (!notBefore?.iso || !notAfter?.iso) {
    return { display: "N/A", relative: "" };
  }

  const beforeDate = new Date(notBefore.iso);
  const afterDate = new Date(notAfter.iso);
  const tz = formatTimezoneOffset(beforeDate);

  const before = formatDateReadable(notBefore.iso);
  const after = formatDateReadable(notAfter.iso);
  const relative = getRelativeTime(notAfter.iso);

  const display = `${before} · ${after} (${tz})`;

  return { display, relative };
});

const validityStats = computed(() => {
  const { notBefore, notAfter } = props.certificate.tbsCertificate.validity;
  return computeCertificateValidity(notBefore?.iso, notAfter?.iso);
});
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
        Certificate Information
      </h4>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt class="text-gray-500">Version</dt>
          <dd class="text-gray-900 font-mono">
            {{ certificate.tbsCertificate.version.display }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500">Serial Number</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">
            {{ certificate.tbsCertificate.serialNumber.hex }}
            <button
              @click="copyToClipboard(certificate.tbsCertificate.serialNumber.hex)"
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
        <div class="md:col-span-2">
          <dt class="text-gray-500">Subject</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">
            {{ formatName(certificate.tbsCertificate.subject) }}
          </dd>
        </div>
        <div class="md:col-span-2">
          <dt class="text-gray-500">Issuer</dt>
          <dd class="text-gray-900 font-mono text-xs break-all">
            {{ formatName(certificate.tbsCertificate.issuer) }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500">Signature Algorithm</dt>
          <dd class="text-gray-900">
            {{
              certificate.signatureAlgorithm?.algorithm?.name ||
              certificate.signatureAlgorithm?.algorithm?.oid ||
              "Unknown"
            }}
          </dd>
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
          From {{ validityInfo.display }}
          <span v-if="validityInfo.relative" class="text-blue-700 ml-1">
            ({{ validityInfo.relative }})
          </span>
        </div>
        <div class="text-gray-600">
          <span class="font-medium">{{ validityStats.validityPeriodDays ?? "N/A" }} days</span>
          total ·
          <span class="font-medium">{{ validityStats.daysRemaining ?? "Expired" }} days</span>
          remaining
        </div>
      </div>
    </section>

    <!-- Public Key -->
    <section>
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        Public Key
      </h4>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt class="text-gray-500">Algorithm</dt>
          <dd class="text-gray-900">
            {{
              certificate.tbsCertificate.subjectPublicKeyInfo.algorithm?.algorithm?.name ||
              certificate.tbsCertificate.subjectPublicKeyInfo.algorithm?.algorithm?.oid ||
              "Unknown"
            }}
          </dd>
        </div>
        <div v-if="publicKeyInfo">
          <template v-if="publicKeyInfo.type === 'RSA'">
            <dt class="text-gray-500">Key Size</dt>
            <dd class="text-gray-900">{{ publicKeyInfo.keySize }} bits</dd>
          </template>
          <template v-else-if="publicKeyInfo.type === 'EC'">
            <dt class="text-gray-500">Curve</dt>
            <dd class="text-gray-900">{{ publicKeyInfo.curve }}</dd>
          </template>
        </div>
      </dl>
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
            {{ formatHex(certificate.fingerprints.sha1) }}
            <button
              @click="copyToClipboard(certificate.fingerprints.sha1)"
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
            {{ formatHex(certificate.fingerprints.sha256) }}
            <button
              @click="copyToClipboard(certificate.fingerprints.sha256)"
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

    <!-- Extensions -->
    <section v-if="certificate.tbsCertificate.extensions?.items?.length">
      <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        Extensions ({{ certificate.tbsCertificate.extensions?.items?.length }})
      </h4>
      <div class="space-y-2">
        <ExtensionView
          v-for="ext in certificate.tbsCertificate.extensions?.items ?? []"
          :key="ext.extnID.oid"
          :extension="ext"
        />
      </div>
    </section>
  </div>
</template>
