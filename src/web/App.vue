<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useCertificatesStore } from "./stores/certificates";
import { useCrlsStore } from "./stores/crls";
import { useTheme } from "./composables/useTheme";
import { useLocale } from "./composables/useLocale";
import CertificateCard from "./components/CertificateCard.vue";
import CrlCard from "./components/CrlCard.vue";
import CrlUpload from "./components/CrlUpload.vue";
import SectionState from "./components/SectionState.vue";

const certificatesStore = useCertificatesStore();
const crlsStore = useCrlsStore();
const { t } = useI18n();
const { locale, localeOptions } = useLocale();
useTheme();

onMounted(async () => {
  await Promise.all([certificatesStore.fetchAll(), crlsStore.fetchAll()]);
});
</script>

<template>
  <v-app>
    <v-app-bar flat border>
      <v-container class="d-flex align-center justify-space-between">
        <v-toolbar-title>{{ t("app.title") }}</v-toolbar-title>
        <div class="d-flex align-center ga-2" style="max-width: 260px">
          <span class="text-body-2 text-medium-emphasis">{{ t("common.language") }}</span>
          <v-select
            v-model="locale"
            :items="localeOptions"
            item-title="label"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
          />
        </div>
      </v-container>
    </v-app-bar>

    <v-main>
      <v-container class="py-8 d-flex flex-column ga-8" max-width="960">
        <section>
          <div class="d-flex align-center justify-space-between mb-3">
            <h2 class="text-h6">{{ t("app.sections.certificates") }}</h2>
            <span v-if="!certificatesStore.loading" class="text-body-2 text-medium-emphasis">
              {{
                t(
                  "common.itemCount",
                  { count: certificatesStore.items.length },
                  { plural: certificatesStore.items.length }
                )
              }}
            </span>
          </div>
          <SectionState
            :show-loading="certificatesStore.loading && certificatesStore.items.length === 0"
            :error="certificatesStore.error"
            :is-empty="certificatesStore.isEmpty"
            :empty-text="t('app.empty.certificates')"
          >
            <template #empty-icon>
              <v-icon size="48" color="medium-emphasis" icon="mdi-file-certificate" class="mb-3" />
            </template>
            <div class="d-flex flex-column ga-3">
              <CertificateCard
                v-for="(cert, index) in certificatesStore.items"
                :key="cert.id"
                :certificate="cert"
                :is-first="index === 0"
                :is-last="index === certificatesStore.items.length - 1"
              />
            </div>
          </SectionState>
        </section>

        <section>
          <div class="d-flex align-center justify-space-between mb-3">
            <h2 class="text-h6">{{ t("app.sections.crls") }}</h2>
            <span v-if="!crlsStore.loading" class="text-body-2 text-medium-emphasis">
              {{
                t(
                  "common.itemCount",
                  { count: crlsStore.fullCrls.length },
                  { plural: crlsStore.fullCrls.length }
                )
              }}
            </span>
          </div>
          <SectionState
            :show-loading="crlsStore.loading && crlsStore.allCrls.length === 0"
            :error="crlsStore.error"
            :is-empty="crlsStore.fullCrls.length === 0"
            :empty-text="t('app.empty.crls')"
          >
            <template #empty-icon>
              <v-icon
                size="48"
                color="medium-emphasis"
                icon="mdi-file-document-outline"
                class="mb-3"
              />
            </template>
            <div class="d-flex flex-column ga-3">
              <CrlCard
                v-for="(crl, index) in crlsStore.fullCrls"
                :key="crl.id"
                :crl="crl"
                :is-first="index === 0"
                :is-last="index === crlsStore.fullCrls.length - 1"
              />
            </div>
          </SectionState>
        </section>

        <section v-if="crlsStore.deltaCrls.length > 0">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2 class="text-h6">{{ t("app.sections.deltaCrls") }}</h2>
            <span class="text-body-2 text-medium-emphasis">
              {{
                t(
                  "common.itemCount",
                  { count: crlsStore.deltaCrls.length },
                  { plural: crlsStore.deltaCrls.length }
                )
              }}
            </span>
          </div>
          <div class="d-flex flex-column ga-3">
            <CrlCard
              v-for="(crl, index) in crlsStore.deltaCrls"
              :key="crl.id"
              :crl="crl"
              :is-first="index === 0"
              :is-last="index === crlsStore.deltaCrls.length - 1"
            />
          </div>
        </section>

        <section>
          <CrlUpload />
        </section>
      </v-container>
    </v-main>

    <v-footer border>
      <v-container>
        <p class="text-center text-body-2 text-medium-emphasis">{{ t("app.footer") }}</p>
      </v-container>
    </v-footer>
  </v-app>
</template>
