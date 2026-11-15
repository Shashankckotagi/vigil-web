import { wsUrl } from './api';
import { PipelineEventBase } from '../types';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface PipelineSocketOptions {
  onEvent: (event: PipelineEventBase) => void;
  onStatusChange?: (status: SocketStatus) => void;
  onError?: (err: any) => void;
}

export class PipelineSocket {
  private ws: WebSocket | null = null;
  private timer: any = null;
  private pingTimer: any = null;
  private attempts = 0;
  private isDisposed = false;
  private options: PipelineSocketOptions;

  constructor(options: PipelineSocketOptions) {
    this.options = options;
  }

  public connect(): void {
    if (this.isDisposed) return;
    this.cleanup();

    this.options.onStatusChange?.('connecting');
    const url = wsUrl();

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.attempts = 0;
        this.options.onStatusChange?.('connected');
        this.startKeepalive();
      };

      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.options.onEvent(data);
        } catch (err) {
          console.warn('Failed to parse WebSocket JSON payload', err);
        }
      };

      this.ws.onerror = (e) => {
        this.options.onError?.(e);
        this.options.onStatusChange?.('error');
      };

      this.ws.onclose = () => {
        this.options.onStatusChange?.('disconnected');
        this.stopKeepalive();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.options.onError?.(err);
      this.options.onStatusChange?.('error');
      this.scheduleReconnect();
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
        } catch {
          // ignore
        }
      }
    }, 15000);
  }

  private stopKeepalive(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDisposed) return;
    if (this.timer) clearTimeout(this.timer);

    this.attempts++;
    const delay = Math.min(1000 * Math.pow(1.5, Math.min(this.attempts, 6)), 12000);
    this.timer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public reconnect(): void {
    this.attempts = 0;
    this.connect();
  }

  public disconnect(): void {
    this.isDisposed = true;
    this.cleanup();
  }

  public dispose(): void {
    this.disconnect();
  }

  private cleanup(): void {
    this.stopKeepalive();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
