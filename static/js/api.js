/**
 * VIGIL REST API & URL Resolution Service
 */

export function getBackendUrl() {
  return (localStorage.getItem('vigil_backend_url') || '').trim().replace(/\/$/, '');
}

export function setBackendUrl(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  if (clean) {
    localStorage.setItem('vigil_backend_url', clean);
  } else {
    localStorage.removeItem('vigil_backend_url');
  }
  return clean;
}

export function apiUrl(path) {
  const base = getBackendUrl();
  return base ? `${base}${path}` : path;
}

export function wsUrl() {
  const base = getBackendUrl();
  if (base) {
    const wsProto = base.startsWith('https') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '');
    return `${wsProto}//${host}/ws`;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export async function fetchStatus() {
  const res = await fetch(apiUrl('/api/status'));
  if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
  return await res.json();
}

export async function fetchPricing() {
  try {
    const res = await fetch(apiUrl('/api/pricing'));
    if (res.ok) return await res.json();
  } catch (_) {}
  return {
    'gemini-2.5-flash': { input_per_million: 0.075, output_per_million: 0.30 },
    'default': { input_per_million: 0.075, output_per_million: 0.30 },
    'usd_to_inr': 86.0
  };
}

export async function startPipeline(params) {
  const res = await fetch(apiUrl('/api/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to start pipeline');
  }
  return data;
}

export async function stopPipeline() {
  const res = await fetch(apiUrl('/api/stop'), { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to stop pipeline');
  }
  return data;
}

export async function uploadVideoFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(apiUrl('/api/upload'), {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to upload video');
  }
  return data;
}
