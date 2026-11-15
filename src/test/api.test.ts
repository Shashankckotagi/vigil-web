import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getBackendUrl,
  setBackendUrl,
  apiUrl,
  wsUrl,
  fetchStatus,
  fetchPricing,
  startPipeline,
  stopPipeline,
  uploadVideoFile,
  verifyApiKey,
} from '../services/api';

describe('API Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Backend URL management', () => {
    it('returns empty string by default', () => {
      expect(getBackendUrl()).toBe('');
    });

    it('sets and retrieves backend URL from localStorage', () => {
      setBackendUrl('http://192.168.1.100:8000');
      expect(getBackendUrl()).toBe('http://192.168.1.100:8000');
    });

    it('strips trailing slashes from backend URL', () => {
      setBackendUrl('https://vigil.example.com///');
      expect(getBackendUrl()).toBe('https://vigil.example.com');
    });

    it('removes item from localStorage when set with empty string or null', () => {
      setBackendUrl('http://test.com');
      setBackendUrl('');
      expect(getBackendUrl()).toBe('');
      expect(localStorage.getItem('vigil_backend_url')).toBeNull();
    });
  });

  describe('apiUrl resolution', () => {
    it('returns relative path when no backend URL is set', () => {
      expect(apiUrl('/api/status')).toBe('/api/status');
    });

    it('prepends backend URL when configured', () => {
      setBackendUrl('https://api.vigil.ai');
      expect(apiUrl('/api/status')).toBe('https://api.vigil.ai/api/status');
    });
  });

  describe('wsUrl resolution', () => {
    it('computes ws URL from location.host with http', () => {
      expect(wsUrl()).toBe('ws://localhost:3000/ws');
    });

    it('computes wss URL from custom https backend URL', () => {
      setBackendUrl('https://vigil-cloud.org');
      expect(wsUrl()).toBe('wss://vigil-cloud.org/ws');
    });

    it('computes ws URL from custom http backend URL', () => {
      setBackendUrl('http://localhost:8000');
      expect(wsUrl()).toBe('ws://localhost:8000/ws');
    });
  });

  describe('fetchStatus', () => {
    it('fetches status and returns parsed JSON', async () => {
      const mockStatus = { running: true, run_id: 'test-run-1' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStatus,
      }));

      const res = await fetchStatus();
      expect(res).toEqual(mockStatus);
      expect(fetch).toHaveBeenCalledWith('/api/status');
    });

    it('throws error when status response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      }));

      await expect(fetchStatus()).rejects.toThrow('Status check failed: Internal Server Error');
    });
  });

  describe('fetchPricing', () => {
    it('returns pricing data when endpoint succeeds', async () => {
      const mockPricing = {
        'gemini-2.5-flash': { input_per_million: 0.075, output_per_million: 0.3 },
        usd_to_inr: 86.0,
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPricing,
      }));

      const res = await fetchPricing();
      expect(res).toEqual(mockPricing);
    });

    it('falls back to default pricing when endpoint fails or network error occurs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const res = await fetchPricing();
      expect(res).toBeDefined();
      expect(res.usd_to_inr).toBe(86.0);
      expect((res as any)['gemini-2.5-flash'].input_per_million).toBe(0.075);
    });
  });

  describe('startPipeline', () => {
    it('sends POST request with StartRequest payload and returns data', async () => {
      const mockStartResponse = { ok: true, run_id: 'ui-12345', status: { running: true } };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStartResponse,
      }));

      const payload = {
        url: 'sample/demo_clip.avi',
        tau: 0.95,
        escalation: true,
        provider: 'mock',
        bounded: true,
        audio: false,
      };

      const res = await startPipeline(payload);
      expect(res).toEqual(mockStartResponse);
      expect(fetch).toHaveBeenCalledWith('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    it('throws specific error message returned by server on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid URL source provided' }),
      }));

      await expect(startPipeline({ url: 'invalid-url' })).rejects.toThrow('Invalid URL source provided');
    });
  });

  describe('stopPipeline', () => {
    it('sends POST request to stop pipeline', async () => {
      const mockStopResponse = { ok: true, status: { running: false } };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStopResponse,
      }));

      const res = await stopPipeline();
      expect(res).toEqual(mockStopResponse);
      expect(fetch).toHaveBeenCalledWith('/api/stop', { method: 'POST' });
    });

    it('throws error when stop request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'nothing running' }),
      }));

      await expect(stopPipeline()).rejects.toThrow('nothing running');
    });
  });

  describe('uploadVideoFile', () => {
    it('uploads file as multipart FormData and returns destination path', async () => {
      const mockUploadResponse = { ok: true, path: '/app/uploads/123_video.mp4', filename: 'video.mp4' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockUploadResponse,
      }));

      const file = new File(['mock content'], 'video.mp4', { type: 'video/mp4' });
      const res = await uploadVideoFile(file);

      expect(res).toEqual(mockUploadResponse);
      expect(fetch).toHaveBeenCalledWith(
        '/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );
    });

    it('throws error when upload fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'File size exceeded' }),
      }));

      const file = new File(['mock'], 'large.mp4', { type: 'video/mp4' });
      await expect(uploadVideoFile(file)).rejects.toThrow('File size exceeded');
    });
  });

  describe('verifyApiKey', () => {
    it('returns successful verification payload on HTTP 200', async () => {
      const mockResult = {
        valid: true,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        message: 'Verified!',
        latency_ms: 120.5,
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResult,
      }));

      const res = await verifyApiKey('AIzaSy_valid_key', 'gemini-2.5-flash');
      expect(res.valid).toBe(true);
      expect(res.model).toBe('gemini-2.5-flash');
      expect(fetch).toHaveBeenCalledWith(
        '/api/verify-key',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: 'AIzaSy_valid_key', model: 'gemini-2.5-flash', provider: 'gemini' }),
        })
      );
    });

    it('returns failure object on HTTP error response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid API key' }),
      }));

      const res = await verifyApiKey('AIzaSy_bad_key');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Invalid API key');
    });

    it('handles network / fetch exceptions safely without throwing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));

      const res = await verifyApiKey('AIzaSy_test');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Network offline');
    });
  });
});
