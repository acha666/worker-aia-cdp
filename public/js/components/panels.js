import { fetchMetadata } from "../api.js";
import { buildDetailView } from "./details.js";

function updateButtonState(button, expanded) {
  if (!button) return;
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  button.classList.toggle("is-open", expanded);
  const label = button.querySelector(".btn-expand-label");
  if (label) label.textContent = expanded ? "Hide details" : "View details";
}

export function registerDetailPanels(container = document) {
  container.addEventListener("click", async event => {
    const button = event.target.closest?.(".btn-expand");
    if (!button) return;

    const key = button.getAttribute("data-key");
    const panel = container.querySelector(`.details[data-panel="${key}"]`);
    const spinner = button.parentElement?.querySelector?.(".loading");
    if (!panel || !spinner) return;

    if (!panel.hasAttribute("hidden")) {
      panel.setAttribute("hidden", "");
      updateButtonState(button, false);
      return;
    }

    if (panel.getAttribute("data-loaded") === "true") {
      panel.removeAttribute("hidden");
      updateButtonState(button, true);
      return;
    }

    if (panel.getAttribute("data-loading") === "true") return;

    spinner.removeAttribute("hidden");
    button.disabled = true;
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
      updateButtonState(button, true);
    } catch (error) {
      panel.innerHTML = `<div class="error">Failed to load details: ${error.message}</div>`;
      panel.removeAttribute("hidden");
      updateButtonState(button, true);
    } finally {
      panel.removeAttribute("data-loading");
      spinner.setAttribute("hidden", "");
      button.disabled = false;
    }
  });
}
