// PNM V5 — Pure Math (no Three.js dependency)

export const FIRST_PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137];

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508°
export const SPACING_2D = 0.8;
export const SPHERE_R = 5;
export const SAMPLES_PER_SEG = 40;

const HUE_SATURATION = 0.85;
const HUE_VALUE = 0.9;

export function smoothstep(t) { return t * t * (3 - 2 * t); }

export function isPrimeNumber(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

export function isPrimePower(n) {
  if (n < 4) return false;
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) {
      let v = n;
      while (v % p === 0) v /= p;
      return v === 1;
    }
  }
  return false;
}

export function primeFactorsOf(n) {
  const factors = [];
  if (n < 2) return factors;
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) {
      factors.push(p);
      while (n % p === 0) n /= p;
    }
  }
  if (n > 1) factors.push(n);
  return factors;
}

export function shouldShowNode(n, state) {
  if (n <= 1) return true;
  if (isPrimeNumber(n)) return state.showPrimes;
  if (isPrimePower(n)) return state.showPowers;
  return state.showComposites;
}

export function getVisibleNodes(N, selectedPrimes) {
  const vis = new Set([0, 1]);
  for (const p of selectedPrimes) for (let k = 1; k * p <= N; k++) vis.add(k * p);
  return [...vis].sort((a, b) => a - b);
}

// ============================================================
// COLORS
// ============================================================
export function hueToRGB(h) {
  const s = HUE_SATURATION, v = HUE_VALUE;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v,t,p]; case 1: return [q,v,p]; case 2: return [p,v,t];
    case 3: return [p,q,v]; case 4: return [t,p,v]; case 5: return [v,p,q];
  }
}

export function getPrimeRGB(selectedPrimes, colorScheme) {
  const colors = {};
  if (colorScheme === 'none') {
    selectedPrimes.forEach(p => { colors[p] = [0.18, 0.18, 0.21]; });
  } else if (colorScheme === 'rgb') {
    const channels = [
      [1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],
      [1,0.5,0],[0.5,0,1],[0,1,0.5],
    ];
    selectedPrimes.forEach((p, i) => {
      const c = channels[i % channels.length];
      colors[p] = [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9];
    });
  } else if (colorScheme === 'spectrum' || colorScheme === 'spectrum-rev') {
    const rev = colorScheme === 'spectrum-rev';
    selectedPrimes.forEach((p, i) => {
      let t = selectedPrimes.length > 1 ? i / (selectedPrimes.length - 1) : 0.5;
      if (rev) t = 1 - t;
      colors[p] = hueToRGB(t * 0.65);
    });
  } else {
    selectedPrimes.forEach((p, i) => {
      colors[p] = hueToRGB(i / Math.max(selectedPrimes.length, 1));
    });
  }
  return colors;
}

export function nodeColor(n, primeRGB, selectedPrimes) {
  if (n === 0) return [0, 0, 0];
  if (n === 1) return [0.25, 0.25, 0.25];
  let r = 0, g = 0, b = 0, count = 0;
  for (const p of selectedPrimes) {
    if (n % p === 0) { r += primeRGB[p][0]; g += primeRGB[p][1]; b += primeRGB[p][2]; count++; }
  }
  if (count === 0) return [0.25, 0.25, 0.25];
  return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
}

// ============================================================
// CATMULL-ROM SPLINE
// ============================================================
// ============================================================
// PARASTICHY CURVE BUILDING
// ============================================================
export function buildParastichy(p, N, posFunc, samplesPerSeg = 20) {
  const lastMult = Math.floor(N / p);
  if (lastMult < 1) return [];
  const extMax = lastMult + 3;
  const indices = [];
  for (let k = 1; k <= extMax; k++) indices.push(k * p);
  const knots = indices.map(n => posFunc(n));
  for (let i = 1; i < knots.length; i++) {
    while (knots[i][1] - knots[i - 1][1] > Math.PI) knots[i][1] -= 2 * Math.PI;
    while (knots[i][1] - knots[i - 1][1] < -Math.PI) knots[i][1] += 2 * Math.PI;
  }
  const curve = catmullRom(knots, samplesPerSeg);
  let totalPts = (lastMult - 1) * samplesPerSeg + 1;
  const lastMultN = lastMult * p;
  if (lastMultN < N) {
    const extraFrac = (N - lastMultN) / p;
    totalPts += Math.ceil(extraFrac * samplesPerSeg);
  }
  const EXTEND_FRAC = 0.5;
  totalPts += Math.ceil(EXTEND_FRAC * samplesPerSeg);
  const maxPts = Math.min(totalPts, curve.length);
  const maxR = posFunc(N)[0];
  let clipped = maxPts;
  for (let i = 0; i < maxPts; i++) {
    if (curve[i][0] > maxR) { clipped = i; break; }
  }
  return curve.slice(0, clipped);
}

export function buildLineArcs(p, N, samplesPerSeg = 20) {
  const lastMult = Math.floor(N / p);
  if (lastMult < 1) return null;
  const lastMultN = lastMult * p;
  const extending = lastMultN < N;
  const extraFrac = extending ? (N - lastMultN) / p : 0;
  const extraSamples = Math.ceil(extraFrac * samplesPerSeg);
  const EXTEND_FRAC = 0.5;
  const extendSamples = Math.ceil(EXTEND_FRAC * samplesPerSeg);
  const pts = [];
  for (let k = 1; k < lastMult; k++) {
    const x1 = SPHERE_R * (2 * k * p / N - 1);
    const x2 = SPHERE_R * (2 * (k + 1) * p / N - 1);
    const cx = (x1 + x2) / 2;
    const r = (x2 - x1) / 2;
    const below = (k % 2 === 1);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const angle = Math.PI * (1 - t);
      pts.push(cx + r * Math.cos(angle), below ? -r * Math.sin(angle) : r * Math.sin(angle), 0);
    }
  }
  {
    const x1 = SPHERE_R * (2 * lastMultN / N - 1);
    const x2 = SPHERE_R * (2 * (lastMultN + p) / N - 1);
    const cx = (x1 + x2) / 2;
    const r = (x2 - x1) / 2;
    const below = (lastMult % 2 === 1);
    const arcSamples = extending ? extraSamples + extendSamples : extendSamples;
    for (let s = 0; s <= arcSamples; s++) {
      const t = s / samplesPerSeg;
      const angle = Math.PI * (1 - t);
      const x = cx + r * Math.cos(angle);
      if (x > SPHERE_R) break;
      pts.push(x, below ? -r * Math.sin(angle) : r * Math.sin(angle), 0);
    }
  }
  return new Float32Array(pts);
}

// ============================================================
// CATMULL-ROM SPLINE
// ============================================================
export function catmullRom(points, samplesPerSeg = 20, alpha = 0.5) {
  const result = [];
  const pts = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
    const d01 = Math.max(dist(p0, p1) ** alpha, 1e-10);
    const d12 = Math.max(dist(p1, p2) ** alpha, 1e-10);
    const d23 = Math.max(dist(p2, p3) ** alpha, 1e-10);
    const t0 = 0, t1 = d01, t2 = d01 + d12, t3 = d01 + d12 + d23;
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = t1 + (s / samplesPerSeg) * d12;
      const lerp = (pa, pb, ta, tb, tv) => {
        if (Math.abs(tb - ta) < 1e-10) return [pa[0], pa[1]];
        const f = (tv - ta) / (tb - ta);
        return [pa[0] + f * (pb[0] - pa[0]), pa[1] + f * (pb[1] - pa[1])];
      };
      const a1 = lerp(p0, p1, t0, t1, t), a2 = lerp(p1, p2, t1, t2, t), a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t), b2 = lerp(a2, a3, t1, t3, t);
      result.push(lerp(b1, b2, t1, t2, t));
    }
  }
  result.push(points[points.length - 1]);
  return result;
}
