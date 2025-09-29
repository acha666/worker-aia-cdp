import { fetchMetadata } from "../api.js";
import { buildDetailView } from "./details.js";

function updateButtonState(button, expanded) {
  if (!button) return;
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  button.classList.toggle("is-open", expanded);
  const label = button.querySelector(".btn-expand-label");
  if (label) label.textContent = expanded ? "Hide details" : "View details";
}

function waitForTransition(panel) {
  return new Promise(resolve => {
    const handler = event => {
      if (event.target !== panel || event.propertyName !== "max-height") return;
      panel.removeEventListener("transitionend", handler);
      resolve();
    };
    panel.addEventListener("transitionend", handler);
  });
}

async function expandPanel(panel) {
  if (!panel) return;
  if (!panel.hasAttribute("hidden") && panel.classList.contains("is-expanded") && !panel.dataset.animating) {
    return;
  }

  const prefersReducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  panel.dataset.animating = "true";
  panel.classList.add("is-transitioning");
  panel.removeAttribute("hidden");

  const targetHeight = panel.scrollHeight;
  if (!targetHeight || prefersReducedMotion) {
    panel.classList.add("is-expanded");
    panel.classList.remove("is-transitioning");
    panel.style.maxHeight = "";
    delete panel.dataset.animating;
    return;
  }

  panel.style.maxHeight = "0px";
  panel.offsetHeight;
  panel.classList.add("is-expanded");
  panel.style.maxHeight = `${targetHeight}px`;
  await waitForTransition(panel);
  panel.style.maxHeight = "";
  panel.classList.remove("is-transitioning");
  delete panel.dataset.animating;
}

async function collapsePanel(panel) {
  if (!panel || panel.hasAttribute("hidden")) return;
  if (panel.dataset.animating) return;

  const prefersReducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const startHeight = panel.scrollHeight;
  if (!startHeight || prefersReducedMotion) {
    panel.classList.remove("is-expanded");
    panel.setAttribute("hidden", "");
    panel.style.maxHeight = "";
    panel.classList.remove("is-transitioning");
    delete panel.dataset.animating;
    return;
  }

  panel.dataset.animating = "true";
  panel.classList.add("is-transitioning");
  panel.style.maxHeight = `${startHeight}px`;
  panel.offsetHeight;
  panel.classList.remove("is-expanded");
  panel.style.maxHeight = "0px";
  await waitForTransition(panel);
  panel.setAttribute("hidden", "");
  panel.style.maxHeight = "";
  panel.classList.remove("is-transitioning");
  delete panel.dataset.animating;
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
      updateButtonState(button, false);
      await collapsePanel(panel);
      return;
    }

    if (panel.getAttribute("data-loaded") === "true") {
      updateButtonState(button, true);
      await expandPanel(panel);
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
      await expandPanel(panel);
      updateButtonState(button, true);
    } catch (error) {
      panel.innerHTML = `<div class="error">Failed to load details: ${error.message}</div>`;
      await expandPanel(panel);
      updateButtonState(button, true);
    } finally {
      panel.removeAttribute("data-loading");
      spinner.setAttribute("hidden", "");
      button.disabled = false;
    }
  });
}
