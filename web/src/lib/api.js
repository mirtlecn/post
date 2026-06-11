import { API_ROOT, SESSION_ROOT } from '../config.js';

export async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return null; }
}

function getPayloadError(payload) {
  const message = typeof payload?.error === 'string' ? payload.error.trim() : '';
  if (!message || message.startsWith('<')) return '';
  return message;
}

function buildRequestError(response, payload, fallbackMessage) {
  const error = new Error(getPayloadError(payload) || fallbackMessage);
  error.status = response.status;
  error.payload = payload;
  return error;
}

function buildFallbackRequestError(fallbackMessage) {
  const error = new Error(fallbackMessage);
  error.status = 0;
  error.payload = null;
  return error;
}

async function requestJson(url, init = {}, fallbackMessage) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: init.headers || {},
    });
  } catch {
    throw buildFallbackRequestError(fallbackMessage);
  }
  const payload = await readJson(response);
  if (!response.ok) throw buildRequestError(response, payload, fallbackMessage);
  return payload;
}

export async function apiRequest(init = {}) {
  return requestJson(`${API_ROOT}/query`, {
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
  return requestJson(`${API_ROOT}/create`, {
    method: 'POST',
    body: formData,
  }, 'Upload failed');
}

export async function updateFile(formData) {
  return requestJson(`${API_ROOT}/update`, {
    method: 'POST',
    body: formData,
  }, 'Update failed');
}

export async function prepareUpload(body, fallbackMessage = 'Upload failed') {
  return requestJson(`${API_ROOT}/upload/prepare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, fallbackMessage);
}

export async function completeUpload(uploadId, fallbackMessage = 'Upload failed') {
  return requestJson(`${API_ROOT}/upload/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uploadId }),
  }, fallbackMessage);
}

export async function uploadToS3(uploadUrl, headers, file, fallbackMessage = 'Upload failed') {
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      credentials: 'omit',
      headers: headers || {},
      body: file,
    });
  } catch {
    throw buildFallbackRequestError(fallbackMessage);
  }
  if (!response.ok) throw buildRequestError(response, null, fallbackMessage);
  return null;
}

export async function createRequest(init = {}) {
  return requestJson(`${API_ROOT}/create`, {
    method: 'POST',
    ...init,
  }, 'Request failed');
}

export async function updateRequest(init = {}) {
  return requestJson(`${API_ROOT}/update`, {
    method: 'POST',
    ...init,
  }, 'Update failed');
}

export async function deleteRequest(init = {}) {
  return requestJson(`${API_ROOT}/delete`, {
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
