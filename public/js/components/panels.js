import { fetchMetadata } from "../api.js";
import { buildDetailView } from "./details.js";

export function registerDetailPanels(container = document) {
  container.addEventListener("click", async event => {
    const button = event.target.closest?.(".btn-detail");
    if (!button) return;

    const key = button.getAttribute("data-key");
    const panel = container.querySelector(`.details[data-panel="${key}"]`);
    const spinner = button.parentElement?.querySelector?.(".loading");
    if (!panel || !spinner) return;

    if (!panel.hasAttribute("hidden")) {
      panel.setAttribute("hidden", "");
      return;
    }

    if (panel.getAttribute("data-loaded") === "true") {
      panel.removeAttribute("hidden");
      return;
    }

    if (panel.getAttribute("data-loading") === "true") return;

    spinner.removeAttribute("hidden");
    panel.setAttribute("data-loading", "true");
    try {
      const metadata = await fetchMetadata(key);
      panel.innerHTML = "";
      if (metadata && typeof metadata === "object") {
        const view = buildDetailView(metadata);
        panel.append(view);
      } else {
        const fallback = document.createElement("pre");
        fallback.textContent = JSON.stringify(metadata, null, 2);
        panel.append(fallback);
      }
      panel.setAttribute("data-loaded", "true");
      panel.removeAttribute("hidden");
    } catch (error) {
      panel.innerHTML = `<div class="error">Failed to load details: ${error.message}</div>`;
      panel.removeAttribute("hidden");
    } finally {
      panel.removeAttribute("data-loading");
      spinner.setAttribute("hidden", "");
    }
  });
}
