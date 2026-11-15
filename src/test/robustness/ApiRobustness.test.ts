import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBackendUrl,
  setBackendUrl,
  apiUrl,
  wsUrl,
  startPipeline,
  stopPipeline,
  uploadVideoFile,
  fetchPricing,
  fetchStatus,
} from '../../services/api';

describe('API Robustness & Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('handles non-JSON 502 HTML responses without crashing with SyntaxError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
    } as any);

    await expect(startPipeline({ url: 'sample/demo.avi' })).rejects.toThrow(
      'Failed to start pipeline (HTTP 502)'
    );

    await expect(stopPipeline()).rejects.toThrow(
      'Failed to stop pipeline (HTTP 502)'
    );

    const dummyFile = new File(['binary'], 'test.mp4', { type: 'video/mp4' });
    await expect(uploadVideoFile(dummyFile)).rejects.toThrow(
      'Failed to upload video (HTTP 502)'
    );
  });

  it('handles complete network failure (fetch throws TypeError)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchStatus()).rejects.toThrow('Failed to fetch');
    await expect(startPipeline({ url: 'sample/demo.avi' })).rejects.toThrow('Failed to fetch');
  });

  it('falls back to default pricing when pricing endpoint is down or unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const pricing = await fetchPricing();
    expect(pricing).toBeDefined();
    expect(pricing.usd_to_inr).toBe(86.0);
    expect(pricing['gemini-4-hydrogen'].input_per_million).toBe(1.50);
  });

  it('correctly handles backend URL trimming, trailing slashes and empty string', () => {
    expect(getBackendUrl()).toBe('');

    setBackendUrl('  https://vigil-server.internal/api///  ');
    expect(getBackendUrl()).toBe('https://vigil-server.internal/api');

    expect(apiUrl('/api/status')).toBe('https://vigil-server.internal/api/api/status');
    expect(wsUrl()).toBe('wss://vigil-server.internal/api/ws');

    setBackendUrl('');
    expect(getBackendUrl()).toBe('');
    expect(apiUrl('/api/status')).toBe('/api/status');
  });

  it('handles wsUrl resolution for HTTP and HTTPS protocols', () => {
    setBackendUrl('http://192.168.1.50:8000');
    expect(wsUrl()).toBe('ws://192.168.1.50:8000/ws');

    setBackendUrl('https://my-vigil-deployment.com:443');
    expect(wsUrl()).toBe('wss://my-vigil-deployment.com:443/ws');
  });
});
