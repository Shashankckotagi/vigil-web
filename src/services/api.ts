import { PipelineStatus, PricingConfig, StartRequest, VerifyKeyResponse } from '../types';

const STORAGE_KEY_BACKEND_URL = 'vigil_backend_url';

export function getBackendUrl(): string {
  const stored = typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_BACKEND_URL) || '').trim() : '';
  if (stored) {
    return stored.replace(/\/+$/, '');
  }
  const envUrl = (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_BACKEND_URL as string | undefined)) || '';
  return envUrl.trim().replace(/\/+$/, '');
}

export function setBackendUrl(url: string): string {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) {
    localStorage.setItem(STORAGE_KEY_BACKEND_URL, clean);
  } else {
    localStorage.removeItem(STORAGE_KEY_BACKEND_URL);
  }
  return clean;
}

export function apiUrl(path: string): string {
  const base = getBackendUrl();
  return base ? `${base}${path}` : path;
}

export function wsUrl(): string {
  const base = getBackendUrl();
  if (base) {
    const wsProto = base.startsWith('https') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '');
    return `${wsProto}//${host}/ws`;
  }
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws`;
  }
  return 'ws://localhost:8000/ws';
}

export async function fetchStatus(): Promise<PipelineStatus> {
  const res = await fetch(apiUrl('/api/status'));
  if (!res.ok) {
    throw new Error(`Status check failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchPricing(): Promise<PricingConfig> {
  try {
    const res = await fetch(apiUrl('/api/pricing'));
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }
  return {
    'gemini-3.5-flash-lite': { input_per_million: 0.30, output_per_million: 2.50 },
    'gemini-4-hydrogen': { input_per_million: 1.50, output_per_million: 7.50 },
    'gemini-4-argon': { input_per_million: 2.00, output_per_million: 10.00 },
    'gemini-4-carbon': { input_per_million: 2.00, output_per_million: 10.00 },
    'gemini-2.5-flash': { input_per_million: 0.075, output_per_million: 0.3 },
    default: { input_per_million: 0.075, output_per_million: 0.3 },
    usd_to_inr: 86.0,
  };
}

export async function startPipeline(params: StartRequest): Promise<{ ok: boolean; run_id: string; status: PipelineStatus }> {
  const res = await fetch(apiUrl('/api/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
  }
  if (!res.ok) {
    throw new Error((data && data.error) ? data.error : `Failed to start pipeline (HTTP ${res.status})`);
  }
  return data;
}

export async function stopPipeline(): Promise<{ ok: boolean; status: PipelineStatus }> {
  const res = await fetch(apiUrl('/api/stop'), {
    method: 'POST',
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
  }
  if (!res.ok) {
    throw new Error((data && data.error) ? data.error : `Failed to stop pipeline (HTTP ${res.status})`);
  }
  return data;
}

export async function uploadVideoFile(file: File): Promise<{ ok: boolean; path: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(apiUrl('/api/upload'), {
    method: 'POST',
    body: formData,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
  }
  if (!res.ok) {
    throw new Error((data && data.error) ? data.error : `Failed to upload video (HTTP ${res.status})`);
  }
  return data;
}

export async function verifyApiKey(
  apiKey: string,
  model = 'gemini-2.5-flash',
  provider = 'gemini'
): Promise<VerifyKeyResponse> {
  try {
    const res = await fetch(apiUrl('/api/verify-key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, model, provider }),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // Non-JSON response
    }
    if (!res.ok) {
      return {
        valid: false,
        error: (data && data.error) ? data.error : `Gateway returned HTTP ${res.status}`,
        status_code: res.status,
      };
    }
    return data;
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Network error reaching verification gateway',
    };
  }
}
