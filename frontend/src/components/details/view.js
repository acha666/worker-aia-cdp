import { createSection } from "../../formatters.js";
import {
  computeTemporalStatus,
  createChip,
  describeCertificateStatus,
  describeCrlStatus,
  renderStatusDisplay,
} from "./status.js";
import { buildMetaSection } from "./meta.js";
import { buildCertificateSections } from "./certificate.js";
import { buildCrlSections } from "./crl.js";

function buildUnknownSection(payload) {
  const pre = document.createElement("pre");
  pre.className = "detail-raw";
  pre.textContent = JSON.stringify(payload, null, 2);
  return pre;
}

export function buildDetailView(resource) {
  const article = document.createElement("article");
  article.className = "detail-view";
  const attrs = resource?.attributes ?? {};
  if (attrs.objectType) article.dataset.type = attrs.objectType;

  const header = document.createElement("div");
  header.className = "detail-header";

  const chipRow = document.createElement("div");
  chipRow.className = "detail-chip-row";
  const typeTitle = attrs.objectType === "certificate"
    ? "Certificate"
    : attrs.objectType === "crl"
      ? "Certificate Revocation List"
      : "Object";
  const chipLabel = attrs.objectType === "certificate"
    ? "Certificate"
    : attrs.objectType === "crl"
      ? (attrs.crl?.isDelta ? "Delta CRL" : "CRL")
      : "Object";
  const typeTone = attrs.objectType === "certificate"
    ? "certificate"
    : attrs.objectType === "crl"
      ? (attrs.crl?.isDelta ? "delta" : "crl")
      : "neutral";
  const typeChip = createChip(chipLabel, { category: "type", tone: typeTone });
  if (typeChip) chipRow.append(typeChip);

  let certificateExpiryStatus = null;
  let crlUpdateStatus = null;
  let statusDescriptor = null;
  if (attrs.objectType === "certificate" && attrs.certificate) {
    const expirySource = attrs.certificate.validity?.notAfter ?? attrs.certificate.summary?.notAfter ?? null;
    certificateExpiryStatus = computeTemporalStatus(expirySource);
    statusDescriptor = describeCertificateStatus(certificateExpiryStatus);
  } else if (attrs.objectType === "crl" && attrs.crl) {
    const nextUpdateSource = attrs.crl.validity?.nextUpdate ?? null;
    crlUpdateStatus = computeTemporalStatus(nextUpdateSource);
    statusDescriptor = describeCrlStatus(crlUpdateStatus, attrs.crl.isDelta);
  }

  const statusChip = renderStatusDisplay(statusDescriptor, { detailed: false });
  if (statusChip) chipRow.append(statusChip);
  if (chipRow.childElementCount) header.append(chipRow);

  const title = document.createElement("div");
  title.className = "detail-title";
  title.textContent = typeTitle;
  header.append(title);

  let highlightValue = null;
  if (attrs.objectType === "certificate") highlightValue = attrs.certificate?.summary?.subjectCommonName ?? null;
  else if (attrs.objectType === "crl") highlightValue = attrs.crl?.summary?.issuerCommonName ?? null;
  if (highlightValue) {
    const highlight = document.createElement("div");
    highlight.className = "detail-highlight";
    highlight.textContent = highlightValue;
    header.append(highlight);
  }

  const pathValue = attrs.path ?? (resource?.id ? `/${resource.id}` : null);
  if (pathValue) {
    const path = document.createElement("div");
    path.className = "detail-subtitle";
    path.textContent = pathValue;
    header.append(path);
  }

  const metaSection = buildMetaSection(resource);
  if (metaSection) header.append(metaSection);

  article.append(header);

  if (attrs.objectType === "certificate" && attrs.certificate) {
    const certSections = buildCertificateSections(attrs.certificate, certificateExpiryStatus);
    certSections.forEach(section => article.append(section));
  } else if (attrs.objectType === "crl" && attrs.crl) {
    const crlSections = buildCrlSections(attrs.crl, crlUpdateStatus);
    crlSections.forEach(section => article.append(section));
  } else if (attrs.parseError) {
    article.append(
      createSection("Parse Error", [
        { label: "Message", value: attrs.parseError.message },
      ]) ?? buildUnknownSection(attrs.parseError),
    );
  } else {
    article.append(buildUnknownSection(attrs));
  }

  return article;
}
