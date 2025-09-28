async function requestJson(url, errorLabel) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${errorLabel} failed: ${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.message || `${errorLabel} failed`);
  return payload.data;
}

export async function listCollection(collection) {
  return requestJson(`/api/v1/collections/${collection}/items`, `list ${collection}`);
}

export async function fetchMetadata(key) {
  const encodedKey = encodeURIComponent(key);
  return requestJson(`/api/v1/objects/${encodedKey}/metadata`, "metadata");
}
