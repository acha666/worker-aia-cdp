import { formatBytes, formatNumber, formatOpensslDate, formatRelativeSeconds } from "../../formatters.js";

function createMetric(label, value) {
  if (!label) return null;
  if (value === null || value === undefined || value === "") return null;
  const metric = document.createElement("div");
  metric.className = "detail-metric";
  const name = document.createElement("span");
  name.className = "detail-metric__label";
  name.textContent = label;
  metric.append(name);
  const content = document.createElement("span");
  content.className = "detail-metric__value";
  if (value instanceof Node) content.append(value);
  else content.textContent = typeof value === "string" ? value : String(value);
  metric.append(content);
  return metric;
}

export function buildMetaSection(resource) {
  if (!resource || typeof resource !== "object") return null;
  const attrs = resource.attributes ?? {};
  const metrics = [];
  if (typeof attrs.size === "number" && Number.isFinite(attrs.size)) {
    const human = formatBytes(attrs.size);
    const bytes = formatNumber(attrs.size);
    const value = human ? `${human} (${bytes} bytes)` : `${bytes} bytes`;
    const metric = createMetric("Size", value);
    if (metric) metrics.push(metric);
  } else if (attrs.size !== null && attrs.size !== undefined) {
    const metric = createMetric("Size", String(attrs.size));
    if (metric) metrics.push(metric);
  }
  if (attrs.uploadedAt) {
    const when = formatOpensslDate(attrs.uploadedAt);
    const relSeconds = (new Date(attrs.uploadedAt).getTime() - Date.now()) / 1000;
    const rel = formatRelativeSeconds(relSeconds);
    const metric = createMetric("Uploaded", rel ? `${when} (${rel})` : when);
    if (metric) metrics.push(metric);
  }
  if (attrs.etag) {
    const metric = createMetric("ETag", attrs.etag);
    if (metric) metrics.push(metric);
  }
  if (!metrics.length) return null;
  const container = document.createElement("div");
  container.className = "detail-metrics";
  metrics.forEach(metric => container.append(metric));
  return container;
}
