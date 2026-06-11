import { API_ROOT, SESSION_ROOT } from '../config.js';

export async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { error: text.trim() }; }
}

function buildRequestError(response, payload, fallbackMessage) {
  const error = new Error(payload?.error || fallbackMessage);
  error.status = response.status;
  error.payload = payload;
  return error;
}

async function requestJson(url, init = {}, fallbackMessage) {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: init.headers || {},
  });
  const payload = await readJson(response);
  if (!response.ok) throw buildRequestError(response, payload, fallbackMessage);
  return payload;
}

export async function apiRequest(init = {}) {
  return requestJson(`${API_ROOT}?admin=query`, {
    method: 'POST',
    ...init,
  }, 'Request failed');
}

export async function lookupItem(path, type = '') {
  const body = { path };
  if (type) body.type = type;
  return apiRequest({
    headers: {
      'Content-Type': 'application/json',
      'x-export': 'true',
    },
    body: JSON.stringify(body),
  });
}

export async function uploadFile(formData) {
  return requestJson(`${API_ROOT}?admin=create`, {
    method: 'POST',
    body: formData,
  }, 'Upload failed');
}

export async function updateFile(formData) {
  return requestJson(`${API_ROOT}?admin=update`, {
    method: 'POST',
    body: formData,
  }, 'Update failed');
}

export async function createRequest(init = {}) {
  return requestJson(`${API_ROOT}?admin=create`, {
    method: 'POST',
    ...init,
  }, 'Request failed');
}

export async function updateRequest(init = {}) {
  return requestJson(`${API_ROOT}?admin=update`, {
    method: 'POST',
    ...init,
  }, 'Update failed');
}

export async function deleteRequest(init = {}) {
  return requestJson(`${API_ROOT}?admin=delete`, {
    method: 'POST',
    ...init,
  }, 'Request failed');
}

export async function sessionRequest(init = {}) {
  return requestJson(SESSION_ROOT, {
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  }, 'Session request failed');
}
