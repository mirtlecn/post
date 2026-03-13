import { API_ROOT, SESSION_ROOT } from '../config.js';

export async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { error: text.trim() }; }
}

async function requestJson(url, init = {}, fallbackMessage) {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: init.headers || {},
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.error || fallbackMessage);
  return payload;
}

export async function apiRequest(init = {}) {
  return requestJson(API_ROOT, init, 'Request failed');
}

export async function uploadFile(formData) {
  return requestJson(API_ROOT, {
    method: 'POST',
    body: formData,
  }, 'Upload failed');
}

export async function sessionRequest(init = {}) {
  return requestJson(SESSION_ROOT, {
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  }, 'Session request failed');
}
