/**
 * VIGIL WebSocket Manager
 */
import { wsUrl } from './api.js';

export class PipelineSocket {
  constructor(options = {}) {
    this.onEvent = options.onEvent || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onError = options.onError || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.ws = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.backoffMs = 1500;
    this.isExplicitClose = false;
  }

  connect() {
    this.isExplicitClose = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);

    try {
      const url = wsUrl();
      this.ws = new WebSocket(url);
    } catch (err) {
      this.onError(err);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoffMs = 1500;
      this.onStateChange('connected');
      // Heartbeat keepalive every 20s
      this.pingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        }
      }, 20000);
    };

    this.ws.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      this.onEvent(event);
    };

    this.ws.onerror = (err) => {
      this.onError(err);
    };

    this.ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.onStateChange('disconnected');
      if (!this.isExplicitClose) {
        this._scheduleReconnect();
      }
    };
  }

  _scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.backoffMs = Math.min(this.backoffMs * 1.5, 10000);
      this.connect();
    }, this.backoffMs);
  }

  disconnect() {
    this.isExplicitClose = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
  }

  reconnect() {
    this.disconnect();
    this.connect();
  }
}
