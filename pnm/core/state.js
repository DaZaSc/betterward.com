// PNM V5 — State + Event Bus + Module Registry

// ============================================================
// EVENT BUS
// ============================================================
const listeners = {};

export function on(event, fn) {
  (listeners[event] ??= []).push(fn);
}

export function off(event, fn) {
  listeners[event] = (listeners[event] || []).filter(f => f !== fn);
}

export function emit(event, data) {
  for (const fn of listeners[event] || []) {
    try { fn(data); } catch (e) { console.error(`[PNM] Event "${event}" handler error:`, e); }
  }
}

// ============================================================
// MODULE REGISTRY
// ============================================================
const modules = new Map();

export function registerModule(name, mod) {
  mod._crashed = false;
  modules.set(name, mod);
}

export function getModules() {
  return modules;
}

// ============================================================
// STATE
// ============================================================
export const DEFAULT_CONFIG = {
  primes: [2, 3, 5],
  N: null,
  maxN: 50000,
  dimension: 0.5,
  colorScheme: 'rgb',
  nodeSize: 1.0,
  lineWidth: 2,
  labelSize: 0.6,
  showNodes: true,
  showCurves: true,
  showLabels: false,
  showAllIntegers: false,
  showZero: true,
  showOne: true,
  showPrimes: true,
  showPowers: true,
  showComposites: true,
  primeGlow: true,
  primeGlowIntensity: 0.3,
  zeroGlow: true,
  zeroGlowIntensity: 1.5,
  pulse: false,
  linePulse: false,
  pulseSpeed: 1.0,
  shapeDrift: false,
  shapeDriftSpeed: 0.1,
  colorDrift: false,
  colorDriftSpeed: 1.0,
  autoRotate: true,
  driftSpeed: 0.5,
  sceneBackground: 0x0c0c0f,
  backgroundStyle: 'black',
  onStateChange: null,
};

// Hot properties: can be changed without full rebuild
export const HOT_KEYS = new Set([
  'dimension', 'shapeDrift', 'shapeDriftSpeed', 'autoRotate', 'driftSpeed', 'lineWidth', 'pulse', 'linePulse', 'pulseSpeed', 'colorDrift', 'colorDriftSpeed',
]);

export const state = { ...DEFAULT_CONFIG, paused: false };
