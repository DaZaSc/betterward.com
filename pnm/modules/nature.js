// PNM V5 — Nature Module
// Remaps Disk (0.5) → Sunflower and Sphere (1.0) → Pineapple.
// Toggle switches between Math Mode and Nature Mode.
import * as THREE from 'three';
import { registerModule } from '../core/state.js';
import { registerShape } from '../core/positions.js';
import { GOLDEN_ANGLE, SPHERE_R, SPACING_2D } from '../core/math.js';
import { buildScene } from '../core/renderer.js';

const PHI = GOLDEN_ANGLE;

// ============================================================
// NATURE POSITION FUNCTIONS
// ============================================================

function pineapplePos(n, N) {
  const z = 1 - 2 * n / N;
  const latitude = Math.acos(Math.max(-1, Math.min(1, z)));
  const barrelR = Math.sin(latitude);
  const aspect = 1.6;
  const theta = n * PHI;
  return new THREE.Vector3(
    SPHERE_R * barrelR * Math.cos(theta),
    SPHERE_R * z * aspect,
    SPHERE_R * barrelR * Math.sin(theta)
  );
}

function sunflowerPos(n, N) {
  const rNorm = Math.sqrt(n / N);
  const theta = n * PHI;
  const capAngle = Math.PI / 3;
  const phi = rNorm * capAngle;
  const domeR = SPHERE_R;
  const x = domeR * Math.sin(phi) * Math.cos(theta);
  let y = domeR * Math.sin(phi) * Math.sin(theta);
  let z = domeR * Math.cos(phi);
  const tilt = Math.PI / 4;
  const yTilted = y * Math.cos(tilt) - z * Math.sin(tilt);
  const zTilted = y * Math.sin(tilt) + z * Math.cos(tilt);
  return new THREE.Vector3(x, yTilted, zTilted);
}

// ============================================================
// ORIGINAL CORE SHAPES (saved on first enable, restored on disable)
// ============================================================

// Core position functions — duplicated here so we can restore them
// without importing from positions.js (which doesn't export the raw
// registration entries).
function coreDiskPos(n, N) {
  if (n === 0) return new THREE.Vector3(0, 0, 0);
  const r = SPACING_2D * Math.sqrt(n);
  const theta = n * PHI;
  const x = r * Math.cos(theta);
  const z = r * Math.sin(theta);
  const maxR = SPACING_2D * Math.sqrt(N);
  const scale = maxR > 0 ? SPHERE_R / maxR : 1;
  return new THREE.Vector3(x * scale, 0, z * scale);
}

function coreSpherePos(n, N) {
  const z = 1 - 2 * n / N;
  const rxy = Math.sqrt(Math.max(0, 1 - z * z));
  const theta = n * PHI;
  return new THREE.Vector3(
    SPHERE_R * rxy * Math.cos(theta),
    SPHERE_R * z,
    SPHERE_R * rxy * Math.sin(theta)
  );
}

// ============================================================
// MODULE STATE
// ============================================================

let natureEnabled = false;

function applyNatureMode() {
  registerShape(0.5, 'Sunflower', sunflowerPos);
  registerShape(1.0, 'Pineapple', pineapplePos);
  natureEnabled = true;
  buildScene();
}

function applyMathMode() {
  registerShape(0.5, 'Disk', coreDiskPos);
  registerShape(1.0, 'Sphere', coreSpherePos);
  natureEnabled = false;
  buildScene();
}

// ============================================================
// MODULE DEFINITION
// ============================================================

const mod = {
  name: 'nature',
  label: 'Nature',
  enabled: true,
  insertBefore: 'section-appearance',
  controls: [
    {
      type: 'toggle',
      label: 'Nature Mode',
      key: '_natureMode',
      default: false,
      hot: false,
      onChange: (val) => {
        if (val) {
          applyNatureMode();
        } else {
          applyMathMode();
        }
      },
    },
  ],

  init() {},
  build() {},
  animate() {},
  destroy() {},
  enable() {},
  disable() {
    if (natureEnabled) {
      applyMathMode();
    }
  },
};

export function register() {
  registerModule('nature', mod);
}
