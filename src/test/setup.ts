import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn(),
  setTransform: vi.fn(),
  setLineDash: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  fillText: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
});

const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
const revokeObjectURLMock = vi.fn();

global.URL.createObjectURL = createObjectURLMock;
global.URL.revokeObjectURL = revokeObjectURLMock;
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = createObjectURLMock;
  window.URL.revokeObjectURL = revokeObjectURLMock;
}
