import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineSocket } from '../../services/ws';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  public readyState = 1; // OPEN
  public url: string;
  public onopen: (() => void) | null = null;
  public onmessage: ((e: { data: string }) => void) | null = null;
  public onerror: ((e: any) => void) | null = null;
  public onclose: (() => void) | null = null;
  public sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.onopen?.();
    }, 5);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  simulateMessage(obj: any) {
    const raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
    this.onmessage?.({ data: raw });
  }

  simulateError(err: any) {
    this.onerror?.(err);
  }
}

describe('WebSocket Robustness & Edge Cases', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('safely handles non-JSON malformed strings without throwing uncaught exceptions', async () => {
    const onEvent = vi.fn();
    const socket = new PipelineSocket({ onEvent });

    socket.connect();
    vi.advanceTimersByTime(10);

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    // Send malformed payload
    expect(() => {
      ws.simulateMessage('{ malformed json missing quote ');
    }).not.toThrow();

    expect(onEvent).not.toHaveBeenCalled();

    socket.dispose();
  });

  it('keeps ping keepalive running periodically when connection is open', () => {
    const socket = new PipelineSocket({ onEvent: vi.fn() });
    socket.connect();
    vi.advanceTimersByTime(10);

    const ws = MockWebSocket.instances[0];
    expect(ws.sent.length).toBe(0);

    // Fast-forward 15 seconds (keepalive interval)
    vi.advanceTimersByTime(15500);
    expect(ws.sent).toContain('ping');

    socket.dispose();
  });

  it('cleans up and stops timers when dispose is called', () => {
    const socket = new PipelineSocket({ onEvent: vi.fn() });
    socket.connect();
    vi.advanceTimersByTime(10);

    const ws = MockWebSocket.instances[0];
    socket.dispose();

    expect(ws.readyState).toBe(3); // CLOSED

    // Advance timers; no reconnects or pings should be attempted
    vi.advanceTimersByTime(30000);
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('exponentially backs off reconnect attempts after error', () => {
    const onStatusChange = vi.fn();
    const socket = new PipelineSocket({
      onEvent: vi.fn(),
      onStatusChange,
    });

    socket.connect();
    vi.advanceTimersByTime(10);

    const ws1 = MockWebSocket.instances[0];
    ws1.simulateError(new Error('Connection lost'));
    ws1.close();

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');

    // First backoff is ~1.5s
    vi.advanceTimersByTime(1600);
    expect(MockWebSocket.instances.length).toBe(2);

    socket.dispose();
  });
});
