// PNM V5 — Info Module
// Right-click tooltip showing node math info and curve details.
// Tooltip appears on right-press, disappears on release. All motion pauses while open.
import * as THREE from 'three';
import { registerModule, state } from '../core/state.js';
import { getCamera, getRenderer, getNodes, resolveN } from '../core/renderer.js';
import { isPrimeNumber, isPrimePower, getPrimeRGB, FIRST_PRIMES } from '../core/math.js';

// === HELPERS ===

function fullFactorization(n) {
  const factors = [];
  if (n < 2) return factors;
  for (let p = 2; p * p <= n; p++) {
    while (n % p === 0) { factors.push(p); n /= p; }
  }
  if (n > 1) factors.push(n);
  return factors;
}

// === MODULE STATE ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let tooltipEl = null;
let tooltipVisible = false;
let cameraRef = null;
let rendererEl = null;
let nodesRef = [];
let nodeByNRef = new Map();
let curveN = 0;
let stateRef = null;

let _onDown = null;
let _onUp = null;
let _onContext = null;

// === TOOLTIP DOM ===

function createTooltip() {
  const el = document.createElement('div');
  el.id = 'info-tooltip';
  el.style.cssText = `
    position: fixed; z-index: 100; pointer-events: none;
    background: rgba(12, 12, 15, 0.92); backdrop-filter: blur(16px);
    border: 1px solid rgba(180, 200, 210, 0.12);
    border-radius: 8px; padding: 10px 14px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px; color: #e0ddd5; line-height: 1.5;
    max-width: 280px; opacity: 0; transition: opacity 0.15s;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(el);
  return el;
}

function showTooltip(html, x, y) {
  tooltipEl.innerHTML = html;

  // Render offscreen first to measure
  tooltipEl.style.left = '0px';
  tooltipEl.style.top = '0px';
  tooltipEl.style.opacity = '0';
  tooltipEl.offsetHeight; // force layout
  const w = tooltipEl.offsetWidth;
  const h = tooltipEl.offsetHeight;

  const pad = 12;
  let tx = x + pad;
  let ty = y + pad;
  if (tx + w > window.innerWidth - pad) tx = x - w - pad;
  if (ty + h > window.innerHeight - pad) ty = y - h - pad;
  if (tx < pad) tx = pad;
  if (ty < pad) ty = pad;

  tooltipEl.style.left = tx + 'px';
  tooltipEl.style.top = ty + 'px';
  tooltipEl.style.opacity = '1';
  tooltipVisible = true;
  state.paused = true;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.opacity = '0';
  if (tooltipVisible) {
    tooltipVisible = false;
    state.paused = false;
  }
}

// === HIT TESTING ===

function hitTestNodes(e) {
  const rect = rendererEl.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, cameraRef);

  const meshes = nodesRef.filter(nd => nd.mesh && nd.mesh.visible).map(nd => nd.mesh);
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length === 0) return null;

  const hitMesh = hits[0].object;
  return nodesRef.find(nd => nd.mesh === hitMesh) || null;
}

function hitTestCurves(e) {
  const scene = nodesRef[0]?.mesh?.parent;
  if (!scene) return null;

  const rect = rendererEl.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const threshold = 15; // px

  let bestPrime = null;
  let bestDist = threshold;
  const proj = new THREE.Vector3();

  scene.traverse(obj => {
    if (!obj.isLine2 || !obj.userData.prime) return;
    const { prime, lerpBuf, numPts } = obj.userData;
    for (let i = 0; i < numPts; i++) {
      const idx = i * 3;
      proj.set(lerpBuf[idx], lerpBuf[idx + 1], lerpBuf[idx + 2]);
      proj.project(cameraRef);
      const sx = (proj.x * 0.5 + 0.5) * rect.width;
      const sy = (-proj.y * 0.5 + 0.5) * rect.height;
      const d = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2);
      if (d < bestDist) {
        bestDist = d;
        bestPrime = prime;
      }
    }
  });

  return bestPrime;
}

// === TOOLTIP CONTENT ===

function nodeTooltipHTML(nd) {
  const n = nd.n;
  // 508-compliant contrast on ~#0c0c0f bg: #e0ddd5 ≈ 14:1, #9a9890 ≈ 5.2:1
  const subStyle = 'color: #9a9890; font-size: 13px;';
  const numStyle = 'color: #e0ddd5; font-weight: 600;';

  let html = `<div style="font-size: 16px; font-weight: 600; margin-bottom: 4px; color: #e0ddd5;">`;

  if (n === 0) {
    html += `0 <span style="${subStyle}">— Sun</span></div>`;
    return html;
  }
  if (n === 1) {
    html += `1 <span style="${subStyle}">— Earth</span></div>`;
    return html;
  }

  html += `${n}</div>`;

  // Type
  const tealStyle = 'color: rgba(61,219,217,0.85); font-size: 13px;';
  const typeLabel = isPrimeNumber(n) ? 'Prime' : isPrimePower(n) ? 'Power' : 'Composite';
  html += `<div style="${tealStyle}">${typeLabel}</div>`;

  // Factorization (skip for primes — redundant)
  if (!isPrimeNumber(n)) {
    const factors = fullFactorization(n);
    html += `<div style="${subStyle}">Factors: <span style="${numStyle}">${factors.join(' × ')}</span></div>`;
  }

  // Neighbors along all prime factors
  const relevantPrimes = fullFactorization(n).filter((p, i, a) => a.indexOf(p) === i);

  if (relevantPrimes.length > 0) {
    const selectedPrimes = stateRef?.primes || [];
    const primeColors = getPrimeRGB(selectedPrimes, stateRef?.colorScheme || 'rgb');

    html += `<div style="margin-top: 4px; ${subStyle}">Neighbors:</div>`;
    html += `<div style="display: grid; grid-template-columns: auto auto auto auto auto auto; padding-left: 8px; gap: 0 4px; align-items: center;">`;
    for (const p of relevantPrimes) {
      const prev = n - p;
      const next = n + p;
      const isSelected = selectedPrimes.includes(p);
      const rgb = primeColors[p];
      // Boost prime colors for contrast: ensure at least ~5:1 on dark bg
      let arrowColor = '#9a9890';
      if (isSelected && rgb) {
        const r = Math.min(255, Math.round(rgb[0] * 255 * 1.3 + 40));
        const g = Math.min(255, Math.round(rgb[1] * 255 * 1.3 + 40));
        const b = Math.min(255, Math.round(rgb[2] * 255 * 1.3 + 40));
        arrowColor = `rgb(${r},${g},${b})`;
      }
      const labelStyle = isSelected && rgb
        ? `color: ${arrowColor}; font-size: 11px;`
        : subStyle;

      const prevCell = prev >= p
        ? `<span style="${subStyle} text-align: right;">${prev}</span>`
        : `<span></span>`;
      const arrowL = prev >= p
        ? `<span style="color:${arrowColor};">→</span>`
        : `<span></span>`;
      const center = `<span style="${numStyle} text-align: center;">[${n}]</span>`;
      const arrowR = `<span style="color:${arrowColor};">→</span>`;
      const nextCell = `<span style="${subStyle}">${next}</span>`;

      html += `<span style="${labelStyle}">${p}:</span>`;
      html += prevCell + arrowL + center + arrowR + nextCell;
    }
    html += `</div>`;
  }

  return html;
}

function curveTooltipHTML(prime) {
  const subStyle = 'color: #9a9890; font-size: 13px;';
  const numStyle = 'color: #e0ddd5; font-weight: 600;';

  const tealStyle = 'color: rgba(61,219,217,0.85); font-size: 13px;';
  let html = `<div style="font-size: 16px; font-weight: 600; margin-bottom: 4px; color: #e0ddd5;">${prime}</div>`;

  // Ordinal position among primes
  const ordinal = FIRST_PRIMES.indexOf(prime) + 1;
  if (ordinal > 0) {
    const suffix = ordinal === 1 ? 'st' : ordinal === 2 ? 'nd' : ordinal === 3 ? 'rd' : 'th';
    html += `<div style="${tealStyle}">${ordinal}${suffix} prime</div>`;
  }

  const multiples = [];
  const maxShow = 12;
  for (let k = prime; k <= curveN; k += prime) {
    multiples.push(k);
  }

  if (multiples.length > 0) {
    const shown = multiples.slice(0, maxShow);
    const str = shown.map(m => `<span style="${numStyle}">${m}</span>`).join(', ');
    const ellipsis = multiples.length > maxShow ? ', …' : '';
    html += `<div style="${subStyle}">Multiples: ${str}${ellipsis}</div>`;
  }

  return html;
}

// === EVENT HANDLERS ===

function onContextMenu(e) {
  // Always suppress browser context menu on canvas
  if (e.target !== rendererEl) return;
  e.preventDefault();
  if (!mod.enabled) return;

  const nd = hitTestNodes(e);
  if (nd) {
    showTooltip(nodeTooltipHTML(nd), e.clientX, e.clientY);
    return;
  }

  const prime = hitTestCurves(e);
  if (prime) {
    showTooltip(curveTooltipHTML(prime), e.clientX, e.clientY);
    return;
  }
}

function onPointerDown(e) {
  if (!mod.enabled) return;
  if (e.button !== 2) return;
  if (e.target !== rendererEl) return;

  const nd = hitTestNodes(e);
  if (nd) {
    e.stopPropagation(); // block physics + OrbitControls only when showing tooltip
    showTooltip(nodeTooltipHTML(nd), e.clientX, e.clientY);
    return;
  }

  const prime = hitTestCurves(e);
  if (prime) {
    e.stopPropagation();
    showTooltip(curveTooltipHTML(prime), e.clientX, e.clientY);
    return;
  }
  // No hit — let event propagate to OrbitControls for camera pan
}

function onPointerUp(e) {
  if (e.button === 2 || e.button === 0) hideTooltip();
}

// === MODULE DEFINITION ===

const mod = {
  name: 'info',
  label: 'Info',
  enabled: true,
  insertBefore: 'section-appearance',
  hint: 'Right-click a node or line for mathematical info',
  controls: [],

  init(ctx) {
    cameraRef = ctx.camera;
    rendererEl = ctx.renderer.domElement;
    tooltipEl = createTooltip();

    _onContext = onContextMenu;
    _onDown = onPointerDown;
    _onUp = onPointerUp;

    window.addEventListener('contextmenu', _onContext, { capture: true });
    rendererEl.addEventListener('pointerdown', _onDown, { capture: true });
    window.addEventListener('pointerup', _onUp);
  },

  build(ctx) {
    nodesRef = ctx.nodes;
    nodeByNRef = ctx.nodeByN;
    curveN = ctx.N;
    stateRef = ctx.state;
    hideTooltip();
  },

  animate() {},

  destroy() {
    hideTooltip();
  },

  enable() {},

  disable() {
    hideTooltip();
  },
};

export function register() {
  registerModule('info', mod);
}
