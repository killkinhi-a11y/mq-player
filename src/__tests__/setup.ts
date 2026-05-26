import "@testing-library/jest-dom/vitest";
import { TextEncoder, TextDecoder } from "util";

// Polyfill TextEncoder/TextDecoder for jose library
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as any).TextDecoder = TextDecoder;
}

// Mock Web Crypto API for jose library (required for JWT sign/verify in test env)
if (!globalThis.crypto?.subtle) {
  try {
    const { webcrypto } = require("crypto");
    globalThis.crypto = webcrypto as any;
  } catch {}
}

// ── Browser-only mocks (skip in Node.js environment) ──
if (typeof window !== "undefined" && typeof HTMLMediaElement !== "undefined") {
  // Mock Web Audio API for tests
  class MockAudioContext {
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
        connect: () => {},
        disconnect: () => {},
      } as any;
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        getByteFrequencyData: (arr: Uint8Array) => arr.fill(0),
        getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128),
        connect: () => {},
        disconnect: () => {},
      } as any;
    }
    createBiquadFilter() {
      return {
        type: "lowshelf",
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect: () => {},
        disconnect: () => {},
      } as any;
    }
    createMediaElementSource() {
      return {
        connect: () => {},
        disconnect: () => {},
      } as any;
    }
    get destination() {
      return { connect: () => {} } as any;
    }
    get currentTime() {
      return 0;
    }
    get state() {
      return "running";
    }
    resume() {
      return Promise.resolve();
    }
    close() {}
  }

  if (typeof globalThis.AudioContext === "undefined") {
    (globalThis as any).AudioContext = MockAudioContext;
    (globalThis as any).webkitAudioContext = MockAudioContext;
  }

  // Mock HTMLAudioElement.play
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(globalThis, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = MockResizeObserver;
}

// Suppress console.warn for test output clarity
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("[MQ Store]")) return;
  originalWarn(...args);
};
