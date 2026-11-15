import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PipelineSocket } from '../services/ws';

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onclose: (() => void) | null = null;
  sentMessages: string[] = [];

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Helper triggers for tests
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(data: any) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  error(err: any) {
    this.onerror?.(err);
  }
}

describe('PipelineSocket', () => {
  let socket: PipelineSocket;
  let receivedEvents: any[] = [];
  let statusChanges: string[] = [];
  let errors: any[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    receivedEvents = [];
    statusChanges = [];
    errors = [];
    vi.stubGlobal('WebSocket', MockWebSocket);

    socket = new PipelineSocket({
      onEvent: (ev) => receivedEvents.push(ev),
      onStatusChange: (status) => statusChanges.push(status),
      onError: (err) => errors.push(err),
    });
  });

  afterEach(() => {
    socket.disconnect();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects and notifies status connecting then connected', () => {
    socket.connect();
    expect(statusChanges).toContain('connecting');

    const wsInstance = MockWebSocket.instances[0];
    expect(wsInstance).toBeDefined();

    wsInstance.open();
    expect(statusChanges).toContain('connected');
  });

  it('receives message and forwards parsed event to onEvent callback', () => {
    socket.connect();
    const wsInstance = MockWebSocket.instances[0];
    wsInstance.open();

    const mockEvent = { type: 'description', text: 'car turns right', t: 12.4 };
    wsInstance.receive(mockEvent);

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual(mockEvent);
  });

  it('safely handles non-JSON malformed payload without throwing', () => {
    socket.connect();
    const wsInstance = MockWebSocket.instances[0];
    wsInstance.open();

    expect(() => {
      wsInstance.receive('INVALID_NON_JSON_STRING');
    }).not.toThrow();

    expect(receivedEvents).toHaveLength(0);
  });

  it('sends keepalive ping text every 15 seconds', () => {
    socket.connect();
    const wsInstance = MockWebSocket.instances[0];
    wsInstance.open();

    expect(wsInstance.sentMessages).toHaveLength(0);

    vi.advanceTimersByTime(15000);
    expect(wsInstance.sentMessages).toEqual(['ping']);

    vi.advanceTimersByTime(15000);
    expect(wsInstance.sentMessages).toEqual(['ping', 'ping']);
  });

  it('schedules reconnection with backoff on disconnect', () => {
    socket.connect();
    let wsInstance = MockWebSocket.instances[0];
    wsInstance.open();

    // Trigger close
    wsInstance.close();
    expect(statusChanges).toContain('disconnected');

    // Timer advances to trigger reconnect
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  it('stops keepalive and disconnects cleanly', () => {
    socket.connect();
    const wsInstance = MockWebSocket.instances[0];
    wsInstance.open();

    socket.disconnect();
    expect(wsInstance.readyState).toBe(MockWebSocket.CLOSED);

    // Advancing timers should not cause any more pings
    vi.advanceTimersByTime(30000);
    expect(wsInstance.sentMessages).toHaveLength(0);
  });
});
