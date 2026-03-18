// PNM V5 — Physics Module
// Spring-network drag + collision. Ported from V1 engine.js.
import * as THREE from 'three';
import { registerModule, state } from '../core/state.js';
import { getControls, getCamera, getRenderer, getNodes, resolveN } from '../core/renderer.js';
import { interpolatedPos } from '../core/positions.js';
import { SAMPLES_PER_SEG } from '../core/math.js';

// === CONSTANTS (tuned in V1/V2, do not change lightly) ===
const SPRING_STIFFNESS = 0.06;
const DAMPING = 0.92;
const ANCHOR_STIFFNESS = 0.015;
const MAX_FORCE = 0.5;
const DRAG_MAX_N = 1000;

// === MODULE STATE ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragIntersect = new THREE.Vector3();

// Scratch vectors (reused per frame, never allocate in loops)
const _force = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _restOther = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _camDir = new THREE.Vector3();

let draggedNode = null;       // node data object being dragged
let physicsActive = false;
let touchEnabled = true;      // toggle from module controls
let collisionEnabled = true;  // toggle from module controls

// Per-node physics arrays (keyed by node n)
let offsets = new Map();      // n → Vector3 displacement from rest
let velocities = new Map();   // n → Vector3 velocity
let springs = new Map();      // n → [{other: n, restDist: number}]

// Refs from lifecycle hooks
let rendererEl = null;
let nodesRef = [];
let nodeByNRef = new Map();
let curveN = 0;
let curveState = null;
let lastDim = -1;

// Event handler refs (for cleanup)
let _onDown = null, _onMove = null, _onUp = null;

// === POINTER HANDLERS ===
function getMouseNDC(e) {
  const rect = rendererEl.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(e) {
  if (!mod.enabled || !touchEnabled) return;
  if (e.button !== 0) return; // only left-click triggers drag
  if (state.paused) return;
  if (resolveN() > DRAG_MAX_N) return;

  getMouseNDC(e);
  const camera = getCamera();
  raycaster.setFromCamera(mouse, camera);

  // Collect all node meshes for hit test
  const meshes = nodesRef.map(nd => nd.mesh);
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length === 0) return;

  // Find which node was hit
  const hitMesh = hits[0].object;
  const nd = nodesRef.find(n => n.mesh === hitMesh);
  if (!nd) return;

  draggedNode = nd;
  physicsActive = true;

  // Disable orbit controls during drag — stop propagation so OrbitControls doesn't see this event
  const controls = getControls();
  if (controls) controls.enabled = false;
  e.stopPropagation();

  // Create camera-facing drag plane through hit point
  camera.getWorldDirection(_camDir);
  dragPlane.setFromNormalAndCoplanarPoint(_camDir, nd.mesh.position);
}

function onPointerMove(e) {
  if (!draggedNode) return;

  getMouseNDC(e);
  raycaster.setFromCamera(mouse, getCamera());
  if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
    draggedNode.mesh.position.copy(dragIntersect);

    // Update offset
    const N = resolveN();
    const dim = curveState?.dimension ?? 0.5;
    const rest = interpolatedPos(draggedNode.n, N, dim);
    const off = offsets.get(draggedNode.n);
    if (off) {
      off.copy(dragIntersect).sub(rest);
    }
    // Zero velocity on dragged node
    const vel = velocities.get(draggedNode.n);
    if (vel) vel.set(0, 0, 0);
  }
}

function onPointerUp() {
  if (!draggedNode) return;
  draggedNode = null;
  physicsActive = true;

  const controls = getControls();
  if (controls) controls.enabled = true;
}

// === SPRING NETWORK ===
function buildSprings(nodes, nodeByN, N, state) {
  springs = new Map();
  offsets = new Map();
  velocities = new Map();

  for (const nd of nodes) {
    springs.set(nd.n, []);
    offsets.set(nd.n, new THREE.Vector3());
    velocities.set(nd.n, new THREE.Vector3());
  }

  const dim = state.dimension;
  const selectedPrimes = state.primes;

  // Connect consecutive multiples of each selected prime
  for (const p of selectedPrimes) {
    const multiples = [];
    for (let k = 1; k * p <= N; k++) {
      if (nodeByN.has(k * p)) multiples.push(k * p);
    }
    for (let i = 0; i < multiples.length - 1; i++) {
      const a = multiples[i], b = multiples[i + 1];
      const springsA = springs.get(a);
      const springsB = springs.get(b);
      if (!springsA || !springsB) continue;

      // Compute rest distance
      const posA = interpolatedPos(a, N, dim);
      const posB = interpolatedPos(b, N, dim);
      const restDist = posA.distanceTo(posB);

      // Avoid duplicates
      if (!springsA.some(s => s.other === b)) {
        springsA.push({ other: b, restDist });
      }
      if (!springsB.some(s => s.other === a)) {
        springsB.push({ other: a, restDist });
      }
    }
  }
}

// === COLLISION — elastic billiard-ball separation ===
function resolveCollisions() {
  const nodes = nodesRef;
  const count = nodes.length;
  let anyPushed = false;

  for (let i = 0; i < count; i++) {
    const ndA = nodes[i];
    if (ndA.isSun || ndA.isEarth) continue;
    const rA = ndA.baseScale;
    const posA = ndA.mesh.position;

    for (let j = i + 1; j < count; j++) {
      const ndB = nodes[j];
      if (ndB.isSun || ndB.isEarth) continue;
      const rB = ndB.baseScale;
      const minDist = rA + rB;

      const dx = ndB.mesh.position.x - posA.x;
      const dy = ndB.mesh.position.y - posA.y;
      const dz = ndB.mesh.position.z - posA.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > 0.001 && dist < minDist) {
        const overlap = (minDist - dist) * 0.5 / dist;

        if (ndA !== draggedNode) {
          posA.x -= dx * overlap;
          posA.y -= dy * overlap;
          posA.z -= dz * overlap;
          const offA = offsets.get(ndA.n);
          if (offA) {
            const restA = interpolatedPos(ndA.n, resolveN(), curveState?.dimension ?? 0.5);
            offA.set(posA.x - restA.x, posA.y - restA.y, posA.z - restA.z);
          }
        }
        if (ndB !== draggedNode) {
          ndB.mesh.position.x += dx * overlap;
          ndB.mesh.position.y += dy * overlap;
          ndB.mesh.position.z += dz * overlap;
          const offB = offsets.get(ndB.n);
          if (offB) {
            const restB = interpolatedPos(ndB.n, resolveN(), curveState?.dimension ?? 0.5);
            offB.set(ndB.mesh.position.x - restB.x, ndB.mesh.position.y - restB.y, ndB.mesh.position.z - restB.z);
          }
        }
        anyPushed = true;
      }
    }
  }
  return anyPushed;
}

// === CURVE DEFORMATION ===
function deformCurves(dim) {
  const nodes = nodesRef;
  const N = resolveN();

  const threeScene = nodes[0]?.mesh?.parent;
  if (!threeScene) return;

  threeScene.traverse(obj => {
    if (!obj.isLine2 || !obj.userData.prime) return;
    const { lerpBuf, numPts, prime: p } = obj.userData;
    if (!lerpBuf || !numPts) return;

    const attr = obj.geometry.getAttribute('instanceStart');
    if (!attr) return;
    const arr = attr.data.array;

    const lastMult = Math.floor(N / p);
    if (lastMult < 1) return;
    const maxSeg = Math.max(0, lastMult - 2);

    // Get displacement of last knot for tail extension
    let lastDx = 0, lastDy = 0, lastDz = 0;
    const lastN = lastMult * p;
    const lastOff = offsets.get(lastN);
    if (lastOff) {
      lastDx = lastOff.x; lastDy = lastOff.y; lastDz = lastOff.z;
    }

    let anyDeformed = false;
    for (let i = 0; i < numPts - 1; i++) {
      const seg = Math.min(Math.floor(i / SAMPLES_PER_SEG), maxSeg);
      const tInSeg = (i % SAMPLES_PER_SEG) / SAMPLES_PER_SEG;
      const knotA = (seg + 1) * p;
      const knotB = Math.min((seg + 2) * p, lastMult * p);

      let dAx, dAy, dAz, dBx, dBy, dBz;
      if (i >= (lastMult - 1) * SAMPLES_PER_SEG) {
        dAx = lastDx; dAy = lastDy; dAz = lastDz;
        dBx = lastDx; dBy = lastDy; dBz = lastDz;
      } else {
        const offA = offsets.get(knotA);
        dAx = offA ? offA.x : 0;
        dAy = offA ? offA.y : 0;
        dAz = offA ? offA.z : 0;

        const offB = offsets.get(knotB);
        if (offB && knotB !== knotA) {
          dBx = offB.x; dBy = offB.y; dBz = offB.z;
        } else {
          dBx = dAx; dBy = dAy; dBz = dAz;
        }
      }

      const hasMag = Math.abs(dAx) + Math.abs(dAy) + Math.abs(dAz) +
                     Math.abs(dBx) + Math.abs(dBy) + Math.abs(dBz);
      if (hasMag < 0.001) continue;

      anyDeformed = true;
      const w = tInSeg;
      const si = i * 3, ei = (i + 1) * 3, bi = i * 6;

      arr[bi]     = lerpBuf[si]     + dAx * (1 - w) + dBx * w;
      arr[bi + 1] = lerpBuf[si + 1] + dAy * (1 - w) + dBy * w;
      arr[bi + 2] = lerpBuf[si + 2] + dAz * (1 - w) + dBz * w;

      const seg2 = Math.min(Math.floor((i + 1) / SAMPLES_PER_SEG), maxSeg);
      const tInSeg2 = ((i + 1) % SAMPLES_PER_SEG) / SAMPLES_PER_SEG;
      let dAx2, dAy2, dAz2, dBx2, dBy2, dBz2;
      if ((i + 1) >= (lastMult - 1) * SAMPLES_PER_SEG) {
        dAx2 = lastDx; dAy2 = lastDy; dAz2 = lastDz;
        dBx2 = lastDx; dBy2 = lastDy; dBz2 = lastDz;
      } else {
        const kA2 = (seg2 + 1) * p;
        const kB2 = Math.min((seg2 + 2) * p, lastMult * p);
        const oA2 = offsets.get(kA2);
        dAx2 = oA2 ? oA2.x : 0; dAy2 = oA2 ? oA2.y : 0; dAz2 = oA2 ? oA2.z : 0;
        const oB2 = offsets.get(kB2);
        if (oB2 && kB2 !== kA2) {
          dBx2 = oB2.x; dBy2 = oB2.y; dBz2 = oB2.z;
        } else {
          dBx2 = dAx2; dBy2 = dAy2; dBz2 = dAz2;
        }
      }
      const w2 = tInSeg2;
      arr[bi + 3] = lerpBuf[ei]     + dAx2 * (1 - w2) + dBx2 * w2;
      arr[bi + 4] = lerpBuf[ei + 1] + dAy2 * (1 - w2) + dBy2 * w2;
      arr[bi + 5] = lerpBuf[ei + 2] + dAz2 * (1 - w2) + dBz2 * w2;
    }

    if (anyDeformed) attr.data.needsUpdate = true;
  });
}

// === RESET ===
function resetPhysics() {
  const N = resolveN();
  const dim = curveState?.dimension ?? 0.5;
  for (const nd of nodesRef) {
    const off = offsets.get(nd.n);
    if (off) off.set(0, 0, 0);
    const vel = velocities.get(nd.n);
    if (vel) vel.set(0, 0, 0);
    const rest = interpolatedPos(nd.n, N, dim);
    nd.mesh.position.copy(rest);
  }
  draggedNode = null;
  physicsActive = false;
  const controls = getControls();
  if (controls) controls.enabled = true;
}

// === MODULE DEFINITION ===
const mod = {
  name: 'physics',
  label: 'Physics',
  enabled: true,
  maxN: DRAG_MAX_N,
  insertBefore: 'section-appearance',
  controls: [
    {
      type: 'toggle',
      label: 'Touch',
      key: '_physicsTouch',
      default: true,
      hot: true,
      onChange: (val) => { touchEnabled = val; },
    },
    {
      type: 'toggle',
      label: 'Collision',
      key: '_physicsCollision',
      default: true,
      hot: true,
      onChange: (val) => { collisionEnabled = val; },
    },
    {
      type: 'button',
      label: 'Reset',
      onClick: () => { resetPhysics(); },
    },
  ],

  init(ctx) {
    rendererEl = ctx.renderer.domElement;

    _onDown = onPointerDown;
    _onMove = onPointerMove;
    _onUp = onPointerUp;

    // Capture phase so we fire before OrbitControls (which listens in bubble phase)
    rendererEl.addEventListener('pointerdown', _onDown, { capture: true });
    rendererEl.addEventListener('pointermove', _onMove);
    rendererEl.addEventListener('pointerup', _onUp);
  },

  build(ctx) {
    nodesRef = ctx.nodes;
    nodeByNRef = ctx.nodeByN;
    curveN = ctx.N;
    curveState = ctx.state;

    if (!mod.enabled || ctx.N > DRAG_MAX_N) return;
    buildSprings(ctx.nodes, ctx.nodeByN, ctx.N, ctx.state);
  },

  animate(ctx) {
    if (!mod.enabled) return;
    if (ctx.N > DRAG_MAX_N) return;

    if (!draggedNode && !physicsActive) return;

    const dim = ctx.dim;
    const N = ctx.N;
    let anyMoving = false;

    const dimChanged = dim !== lastDim;
    lastDim = dim;

    // Spring + anchor forces (use rest + offset, NOT mesh.position which core may overwrite)
    for (const nd of nodesRef) {
      if (nd === draggedNode) continue;
      if (nd.isSun || nd.isEarth) continue;

      const off = offsets.get(nd.n);
      const vel = velocities.get(nd.n);
      if (!off || !vel) continue;

      _force.set(0, 0, 0);

      const rest = interpolatedPos(nd.n, N, dim);

      // Current position from module state (not mesh.position which core clobbers)
      const curX = rest.x + off.x;
      const curY = rest.y + off.y;
      const curZ = rest.z + off.z;

      // Anchor force: pull toward rest, stiffness ramps up with displacement
      const offDist = Math.sqrt(off.x * off.x + off.y * off.y + off.z * off.z);
      const anchorK = ANCHOR_STIFFNESS * (1 + offDist * 2);
      _force.x -= off.x * anchorK;
      _force.y -= off.y * anchorK;
      _force.z -= off.z * anchorK;

      // Spring forces
      const nodeSprings = springs.get(nd.n);
      if (nodeSprings) {
        for (const spring of nodeSprings) {
          const other = nodeByNRef.get(spring.other);
          if (!other) continue;

          const restDist = dimChanged
            ? rest.distanceTo(interpolatedPos(spring.other, N, dim))
            : spring.restDist;
          if (dimChanged) spring.restDist = restDist;

          // Other node's position from module state
          const otherOff = offsets.get(spring.other);
          const otherRest = interpolatedPos(spring.other, N, dim);
          const otherX = otherRest.x + (otherOff ? otherOff.x : 0);
          const otherY = otherRest.y + (otherOff ? otherOff.y : 0);
          const otherZ = otherRest.z + (otherOff ? otherOff.z : 0);

          const dx = otherX - curX;
          const dy = otherY - curY;
          const dz = otherZ - curZ;
          const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (currentDist > 0.001 && restDist > 0.001) {
            const f = (currentDist - restDist) * SPRING_STIFFNESS / currentDist;
            _force.x += dx * f;
            _force.y += dy * f;
            _force.z += dz * f;
          }
        }
      }

      // Clamp force
      const fMag = _force.length();
      if (fMag > MAX_FORCE) _force.multiplyScalar(MAX_FORCE / fMag);

      // Integrate velocity with damping
      vel.x = (vel.x + _force.x) * DAMPING;
      vel.y = (vel.y + _force.y) * DAMPING;
      vel.z = (vel.z + _force.z) * DAMPING;

      // Update offset
      off.x += vel.x;
      off.y += vel.y;
      off.z += vel.z;

      // Apply: rest + offset
      nd.mesh.position.set(rest.x + off.x, rest.y + off.y, rest.z + off.z);

      const vMag = vel.length();
      if (vMag > 0.0005 || fMag > 0.0005) {
        anyMoving = true;
      } else {
        off.set(0, 0, 0);
        vel.set(0, 0, 0);
        nd.mesh.position.copy(rest);
      }
    }

    // Sun/Earth anchor spring-back
    for (const nd of nodesRef) {
      if (nd === draggedNode) continue;
      if (!nd.isSun && !nd.isEarth) continue;
      const off = offsets.get(nd.n);
      const vel = velocities.get(nd.n);
      if (!off || !vel) continue;

      const rest = interpolatedPos(nd.n, N, dim);
      _diff.set(-off.x, -off.y, -off.z).multiplyScalar(ANCHOR_STIFFNESS);
      vel.add(_diff).multiplyScalar(DAMPING);
      off.add(vel);
      nd.mesh.position.set(rest.x + off.x, rest.y + off.y, rest.z + off.z);
      if (vel.length() > 0.0005) anyMoving = true;
    }

    // Re-apply dragged node position (core's dim interpolation may have overwritten it)
    if (draggedNode) {
      const rest = interpolatedPos(draggedNode.n, N, dim);
      const off = offsets.get(draggedNode.n);
      if (off) {
        draggedNode.mesh.position.set(rest.x + off.x, rest.y + off.y, rest.z + off.z);
      }
    }

    // Collision resolution
    if (collisionEnabled) {
      const pushed = resolveCollisions();
      if (pushed) anyMoving = true;
    }

    // Update glow sprites that track nodes
    const threeScene = nodesRef[0]?.mesh?.parent;
    if (threeScene) {
      threeScene.traverse(obj => {
        if (obj.isSprite && obj.userData.nodeRef) {
          const nd = obj.userData.nodeRef;
          if (nd.isSun) return;
          obj.position.copy(nd.mesh.position);
        }
      });
    }

    // Deform curves
    if (curveState?.showCurves) {
      deformCurves(dim);
    }

    physicsActive = anyMoving || !!draggedNode;
  },

  destroy() {
    springs.clear();
    offsets.clear();
    velocities.clear();
    draggedNode = null;
    physicsActive = false;
    lastDim = -1;
  },

  enable() {
    if (nodesRef.length > 0 && curveState) {
      buildSprings(nodesRef, nodeByNRef, curveN, curveState);
    }
  },

  disable() {
    resetPhysics();
  },
};

export function register() {
  registerModule('physics', mod);
}
