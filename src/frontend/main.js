import "./styles/main.css";
import { listCollection } from "./api.js";
import { renderCertificates, renderCrls, renderDeltaCrls } from "./components/list.js";
import { registerDetailPanels } from "./components/panels.js";

async function renderCollections() {
  const certContainer = document.getElementById("certs");
  const crlContainer = document.getElementById("crls");
  const deltaContainer = document.getElementById("dcrls");
  if (!certContainer || !crlContainer || !deltaContainer) return;

  const [certs, crls, deltaCrls] = await Promise.all([
    listCollection("ca"),
    listCollection("crl"),
    listCollection("dcrl"),
  ]);

  renderCertificates(certContainer, certs?.items ?? []);
  renderCrls(crlContainer, crls?.items ?? []);
  renderDeltaCrls(deltaContainer, deltaCrls?.items ?? []);
}

export async function bootstrap() {
  registerDetailPanels(document);
  await renderCollections();
}

bootstrap().catch(console.error);
