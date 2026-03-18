// PNM V5 — Side Panel UI
import { state, emit, getModules } from './state.js';
import { FIRST_PRIMES, getPrimeRGB } from './math.js';
import { getShapes, getMaxDim, getMinDim } from './positions.js';
import { update, resolveN, getInfo, buildScene } from './renderer.js';

const $ = id => document.getElementById(id);

let selectedPrimes = [...state.primes];
let rebuildTimeout = null;

function scheduleRebuild() {
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(() => {
    state.primes = [...selectedPrimes];
    const N = resolveN();
    state.N = $('auto-n').checked ? null : Math.max(1, +$('n-input').value || 1);
    state.colorScheme = $('color-scheme').value;
    state.backgroundStyle = $('background-style').value;
    state.nodeSize = +$('node-size').value;
    state.showNodes = $('show-nodes').checked;
    state.showAllIntegers = $('show-all-integers').checked;
    state.showZero = $('show-zero').checked;
    state.showOne = $('show-one').checked;
    state.showPrimes = $('filter-primes').checked;
    state.showPowers = $('filter-powers').checked;
    state.showComposites = $('filter-composites').checked;
    state.showCurves = $('show-curves').checked;
    state.showLabels = $('show-labels').checked;
    state.primeGlow = $('prime-glow').checked;
    state.primeGlowIntensity = +$('prime-glow-intensity').value;
    state.zeroGlow = $('zero-glow').checked;
    state.zeroGlowIntensity = +$('zero-glow-intensity').value;
    state.lineWidth = +$('line-width').value;

    buildScene();
    updatePrimeColors();
    updateStatus();
    updateModuleStates();
  }, 120);
}

function updateStatus() {
  const info = getInfo();
  $('status').textContent = `${info.nodeCount} nodes · N=${info.N} · primes: ${info.primes.join(', ')}`;
}

// ============================================================
// PRIME GRID
// ============================================================
function buildPrimeGrid() {
  const grid = $('prime-grid');
  FIRST_PRIMES.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'prime-btn';
    btn.textContent = p;
    btn.dataset.prime = p;
    if (selectedPrimes.includes(p)) btn.classList.add('active');
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      updateSelectedPrimes();
      scheduleRebuild();
    });
    grid.appendChild(btn);
  });

  const allBtn = document.createElement('button');
  allBtn.className = 'grid-btn';
  allBtn.id = 'all-btn';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    grid.querySelectorAll('.prime-btn').forEach(b => b.classList.add('active'));
    updateSelectedPrimes();
    scheduleRebuild();
  });
  grid.appendChild(allBtn);

  const noneBtn = document.createElement('button');
  noneBtn.className = 'grid-btn';
  noneBtn.textContent = 'None';
  noneBtn.addEventListener('click', () => {
    grid.querySelectorAll('.prime-btn').forEach(b => b.classList.remove('active'));
    updateSelectedPrimes();
    scheduleRebuild();
  });
  grid.appendChild(noneBtn);
}

function updateSelectedPrimes() {
  const grid = $('prime-grid');
  selectedPrimes = [];
  grid.querySelectorAll('.prime-btn.active').forEach(b => {
    if (b.dataset.prime) selectedPrimes.push(+b.dataset.prime);
  });
  selectedPrimes.sort((a, b) => a - b);
  updatePrimeColors();
  updateAllBtnHighlight();
  updateN();
}

function updateAllBtnHighlight() {
  const allBtn = $('all-btn');
  if (!allBtn) return;
  const allActive = selectedPrimes.length === FIRST_PRIMES.length;
  allBtn.classList.toggle('active', allActive);
}

function updatePrimeColors() {
  const grid = $('prime-grid');
  const colors = getPrimeRGB(selectedPrimes, $('color-scheme').value);
  grid.querySelectorAll('.prime-btn').forEach(btn => {
    const p = +btn.dataset.prime;
    if (selectedPrimes.includes(p) && colors[p]) {
      const c = colors[p];
      const r = Math.round(c[0] * 255), g = Math.round(c[1] * 255), b = Math.round(c[2] * 255);
      const tooFaint = r + g + b < 180;
      if (tooFaint) {
        btn.style.background = 'rgba(255,255,255,0.12)';
        btn.style.borderColor = 'rgba(255,255,255,0.4)';
        btn.style.color = 'rgba(224,221,213,0.8)';
      } else {
        btn.style.background = `rgba(${r},${g},${b},0.3)`;
        btn.style.borderColor = `rgba(${r},${g},${b},0.7)`;
        btn.style.color = `rgb(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)})`;
      }
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });
}

// ============================================================
// N CONTROLS
// ============================================================
function getMaxN() {
  return 10000;
}

function updateN() {
  const cap = getMaxN();
  const sliderMax = 2500;
  $('n-input').max = cap;
  $('n-slider').max = sliderMax;

  let n;
  if ($('auto-n').checked && selectedPrimes.length > 0) {
    n = selectedPrimes.reduce((a, b) => a * b, 1);
    if (n > 500) n = 500; // Auto-N caps at 500
    if (n < 1) n = 1;
  } else {
    n = Math.max(1, Math.min(cap, +$('n-input').value || 1));
  }

  $('n-input').value = n;
  $('n-slider').value = Math.min(n, sliderMax);
  $('n-display').textContent = n.toLocaleString();
}

// ============================================================
// DIMENSION LABEL + STICKINESS
// ============================================================
function updateDimLabel() {
  const dim = +$('dimension').value;
  const shapes = getShapes();

  let label = '';
  for (let i = 0; i < shapes.length; i++) {
    const [val, shape] = shapes[i];
    const margin = 0.1;
    if (Math.abs(dim - val) < margin) {
      label = shape.name;
      break;
    }
    if (i < shapes.length - 1) {
      const [nextVal, nextShape] = shapes[i + 1];
      if (dim > val + margin && dim < nextVal - margin) {
        label = `${shape.name} / ${nextShape.name}`;
        break;
      }
    }
  }
  if (!label && shapes.length > 0) {
    label = shapes[shapes.length - 1][1].name;
  }
  $('dim-display').textContent = label;
}

// ============================================================
// MODULE SECTIONS
// ============================================================
// Module DOM refs for dynamic state updates
const moduleRows = new Map(); // moduleName → { header, content, controlEls, capMsg }

function buildModuleSections() {
  const resetBtn = $('reset-btn');
  if (!resetBtn) return;
  // Remove any previously built module sections
  for (const [, refs] of moduleRows) {
    refs.header.remove();
    refs.content.remove();
  }
  moduleRows.clear();

  for (const [name, mod] of getModules()) {
    // Create a proper collapsible section like the built-in ones
    const header = document.createElement('h2');
    header.className = 'section-header';
    header.textContent = mod.label || name;

    const content = document.createElement('div');
    content.className = 'section-content';

    header.addEventListener('click', () => header.classList.toggle('open'));

    // Cap message (shown once at top when N exceeds limit)
    const capMsg = document.createElement('div');
    capMsg.className = 'module-cap-msg';
    capMsg.style.cssText = 'display:none; opacity:0.5; font-size:0.7rem; margin:4px 0';
    capMsg.textContent = '(too many nodes)';
    content.appendChild(capMsg);

    // Auto-enable the module backend — individual controls gate features
    mod.enabled = true;

    // All controls rendered as peers (no nesting)
    const controlEls = [];
    for (const ctrl of (mod.controls || [])) {
      if (ctrl.type === 'toggle') {
        const tgl = document.createElement('label');
        tgl.className = 'toggle';
        tgl.innerHTML = `
          <input type="checkbox" ${ctrl.default ? 'checked' : ''}>
          <span class="toggle-track"></span>
          ${ctrl.label}
        `;
        const cb = tgl.querySelector('input');
        cb.addEventListener('change', () => {
          if (ctrl.onChange) ctrl.onChange(cb.checked);
          if (ctrl.hot) {
            update({ [ctrl.key]: cb.checked });
          } else {
            state[ctrl.key] = cb.checked;
            scheduleRebuild();
          }
        });
        controlEls.push(cb);
        content.appendChild(tgl);
      } else if (ctrl.type === 'slider') {
        const wrapper = document.createElement('div');
        wrapper.className = 'control-row';
        wrapper.innerHTML = `
          <div class="control-label">${ctrl.label} <span class="value">${ctrl.default}</span></div>
          <div class="control-line">
            <input type="range" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${ctrl.default}">
          </div>
        `;
        const slider = wrapper.querySelector('input[type=range]');
        const display = wrapper.querySelector('.value');
        slider.addEventListener('input', () => {
          display.textContent = slider.value;
          if (ctrl.onChange) ctrl.onChange(+slider.value);
          if (ctrl.hot) {
            update({ [ctrl.key]: +slider.value });
          } else {
            state[ctrl.key] = +slider.value;
            scheduleRebuild();
          }
        });
        controlEls.push(slider);
        content.appendChild(wrapper);
      } else if (ctrl.type === 'select') {
        const wrapper = document.createElement('div');
        wrapper.style.margin = '4px 0';
        const label = document.createElement('label');
        label.textContent = ctrl.label;
        label.style.fontSize = '0.72rem';
        const select = document.createElement('select');
        for (const opt of ctrl.options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === ctrl.default) o.selected = true;
          select.appendChild(o);
        }
        select.addEventListener('change', () => {
          if (ctrl.onChange) ctrl.onChange(select.value);
          state[ctrl.key] = select.value;
          scheduleRebuild();
        });
        wrapper.appendChild(label);
        wrapper.appendChild(select);
        controlEls.push(select);
        content.appendChild(wrapper);
      } else if (ctrl.type === 'button') {
        const btn = document.createElement('button');
        btn.textContent = ctrl.label;
        btn.style.cssText = 'width:100%; padding:5px; margin-top:6px; background:transparent; border:1px solid var(--border); color:var(--text-faint); font-size:10px; font-family:inherit; cursor:pointer; border-radius:6px; transition:all 0.2s; letter-spacing:0.05em;';
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.3)'; btn.style.color = 'rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.6)'; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = ''; btn.style.color = 'var(--text-faint)'; });
        btn.addEventListener('click', () => { if (ctrl.onClick) ctrl.onClick(); });
        controlEls.push(btn);
        content.appendChild(btn);
      }
    }

    // Optional hint text
    if (mod.hint) {
      const hintEl = document.createElement('div');
      hintEl.style.cssText = 'font-size:0.7rem; color:var(--text-dim); margin:4px 0; font-style:italic;';
      hintEl.textContent = mod.hint;
      content.appendChild(hintEl);
    }

    moduleRows.set(name, { header, content, controlEls, capMsg });
    const anchor = mod.insertBefore ? $(mod.insertBefore) : resetBtn;
    anchor.parentNode.insertBefore(header, anchor);
    anchor.parentNode.insertBefore(content, anchor);
  }
}

function updateModuleStates() {
  const N = resolveN();
  for (const [name, mod] of getModules()) {
    const refs = moduleRows.get(name);
    if (!refs) continue;
    const capped = mod.maxN && N > mod.maxN;
    refs.header.style.opacity = capped ? '0.4' : '';
    refs.content.style.opacity = capped ? '0.4' : '';
    refs.capMsg.style.display = capped ? '' : 'none';
    if (capped) {
      mod.enabled = false;
      try { mod.disable?.(); } catch (e) { console.error(`[PNM] Module "${name}" disable error:`, e); }
    } else {
      mod.enabled = true;
    }
    for (const el of refs.controlEls) {
      el.disabled = capped;
      if (capped && el.type === 'checkbox' && el.checked) {
        el.checked = false;
        // Fire onChange so the module internal flag updates
        el.dispatchEvent(new Event('change'));
      }
    }
  }
}

// ============================================================
// WIRE EVERYTHING
// ============================================================
export function initPanel() {
  // Collapsible sections
  document.querySelectorAll('.section-header').forEach(h => {
    h.addEventListener('click', () => h.classList.toggle('open'));
  });

  // Prime grid
  buildPrimeGrid();
  updatePrimeColors();
  updateAllBtnHighlight();

  // N controls
  $('auto-n').addEventListener('change', () => {
    const auto = $('auto-n').checked;
    $('n-input').disabled = auto;
    updateN();
    scheduleRebuild();
  });
  $('n-input').addEventListener('change', () => {
    $('n-slider').value = $('n-input').value;
    updateN();
    scheduleRebuild();
  });
  // Disable only the number input when auto is on — keep slider always enabled
  $('n-slider').disabled = false;
  $('n-slider').addEventListener('input', () => {
    if ($('auto-n').checked) {
      $('auto-n').checked = false;
      $('n-input').disabled = false;
    }
    $('n-input').value = $('n-slider').value;
    updateN();
    scheduleRebuild();
  });

  // Dimension slider with stickiness at keyframes
  const dimSlider = $('dimension');
  dimSlider.min = getMinDim();
  dimSlider.max = getMaxDim();
  const shapeKeyframes = getShapes().map(s => s[0]);

  dimSlider.addEventListener('input', () => {
    // Manual dimension change disables shape drift
    if ($('shape-drift').checked) {
      $('shape-drift').checked = false;
      state.shapeDrift = false;
    }
    let val = +dimSlider.value;
    // Stickiness: snap to nearest keyframe if within 0.02
    for (const key of shapeKeyframes) {
      if (Math.abs(val - key) < 0.02) {
        val = key;
        dimSlider.value = val;
        break;
      }
    }
    updateDimLabel();
    update({ dimension: val });
  });
  updateDimLabel();

  // Node size slider (real-time rebuild on drag)
  $('node-size').addEventListener('input', () => {
    $('node-size-display').textContent = $('node-size').value;
    scheduleRebuild();
  });

  // Toggles that trigger rebuild
  for (const id of [
    'color-scheme', 'background-style',
    'show-nodes', 'show-all-integers', 'show-zero', 'show-one',
    'show-curves', 'show-labels',
    'prime-glow', 'zero-glow', 'pulse',
  ]) {
    $(id).addEventListener('change', () => { updateN(); scheduleRebuild(); });
  }

  // Line width slider (hot — no rebuild needed)
  $('line-width').addEventListener('input', () => {
    $('line-width-display').textContent = $('line-width').value;
    update({ lineWidth: +$('line-width').value });
  });

  // Prime filter toggles — auto-enable "All Nodes" when turned on
  for (const id of ['filter-primes', 'filter-powers', 'filter-composites']) {
    $(id).addEventListener('change', () => {
      if ($(id).checked && !$('show-nodes').checked) {
        $('show-nodes').checked = true;
      }
      updateN();
      scheduleRebuild();
    });
  }

  // Prime glow intensity slider
  $('prime-glow-intensity').addEventListener('input', () => {
    $('prime-glow-display').textContent = $('prime-glow-intensity').value;
    scheduleRebuild();
  });

  // Zero glow intensity slider
  $('zero-glow-intensity').addEventListener('input', () => {
    $('zero-glow-display').textContent = $('zero-glow-intensity').value;
    scheduleRebuild();
  });

  // Shape drift (morph)
  $('shape-drift').addEventListener('change', () => {
    update({ shapeDrift: $('shape-drift').checked });
  });
  $('shape-drift-speed').addEventListener('input', () => {
    $('shape-drift-speed-display').textContent = $('shape-drift-speed').value;
    update({ shapeDriftSpeed: +$('shape-drift-speed').value });
  });

  // Drift speed + auto-rotate
  $('auto-rotate').addEventListener('change', () => {
    update({ autoRotate: $('auto-rotate').checked });
  });
  $('drift-speed').addEventListener('input', () => {
    $('drift-speed-display').textContent = $('drift-speed').value;
    update({ driftSpeed: +$('drift-speed').value });
  });

  // Pulse (hot key — updates without rebuild)
  $('pulse').addEventListener('change', () => {
    update({ pulse: $('pulse').checked });
  });
  $('line-pulse').addEventListener('change', () => {
    update({ linePulse: $('line-pulse').checked });
  });
  $('pulse-speed').addEventListener('input', () => {
    $('pulse-speed-display').textContent = $('pulse-speed').value;
    update({ pulseSpeed: +$('pulse-speed').value });
  });

  // Color drift (hot key — animation loop handles it)
  $('color-drift').addEventListener('change', () => {
    update({ colorDrift: $('color-drift').checked });
  });
  $('color-drift-speed').addEventListener('input', () => {
    $('color-drift-speed-display').textContent = $('color-drift-speed').value;
    update({ colorDriftSpeed: +$('color-drift-speed').value });
  });

  // Auto-enable morph after 3s of no interaction
  function enableMorphIdle() {
    if (!state.shapeDrift) {
      state.shapeDrift = true;
      $('shape-drift').checked = true;
      update({ shapeDrift: true });
    }
    idleTimer = null;
  }
  function resetIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }
  let idleTimer = setTimeout(enableMorphIdle, 3000);

  // Reset
  $('reset-btn').addEventListener('click', () => {
    const grid = $('prime-grid');
    grid.querySelectorAll('.prime-btn').forEach(btn => {
      btn.classList.toggle('active', [2, 3, 5].includes(+btn.dataset.prime));
    });
    $('dimension').value = 0.5;
    $('color-scheme').value = 'rgb';
    $('background-style').value = 'black';
    $('auto-n').checked = true;
    $('n-input').disabled = true;
    $('n-slider').disabled = false;
    $('show-nodes').checked = true;
    $('show-all-integers').checked = false;
    $('show-zero').checked = true;
    $('show-one').checked = true;
    $('show-curves').checked = true;
    $('line-width').value = 2;
    $('line-width-display').textContent = '2';
    $('show-labels').checked = false;
    $('shape-drift').checked = false;
    $('shape-drift-speed').value = 0.1;
    $('shape-drift-speed-display').textContent = '0.1';
    $('auto-rotate').checked = true;
    $('prime-glow').checked = true;
    $('prime-glow-intensity').value = 0.3;
    $('prime-glow-display').textContent = '0.3';
    $('zero-glow').checked = true;
    $('zero-glow-intensity').value = 1.5;
    $('zero-glow-display').textContent = '1.5';
    $('pulse').checked = false;
    $('line-pulse').checked = false;
    $('pulse-speed').value = 1.0;
    $('pulse-speed-display').textContent = '1.0';
    $('color-drift').checked = false;
    $('color-drift-speed').value = 1.0;
    $('color-drift-speed-display').textContent = '1.0';
    $('filter-primes').checked = true;
    $('filter-powers').checked = true;
    $('filter-composites').checked = true;
    $('node-size').value = 1.0;
    $('node-size-display').textContent = '1.0';
    $('drift-speed').value = 0.5;
    $('drift-speed-display').textContent = '0.5';

    // Reset module controls to defaults
    for (const [name, mod] of getModules()) {
      const refs = moduleRows.get(name);
      if (!refs) continue;
      let ctrlIdx = 0;
      for (const ctrl of (mod.controls || [])) {
        const el = refs.controlEls[ctrlIdx++];
        if (!el) continue;
        if (ctrl.type === 'toggle' && el.type === 'checkbox') {
          el.checked = !!ctrl.default;
          if (ctrl.onChange) ctrl.onChange(!!ctrl.default);
        } else if (ctrl.type === 'slider') {
          el.value = ctrl.default;
          const display = el.closest('.control-row')?.querySelector('.value');
          if (display) display.textContent = ctrl.default;
          if (ctrl.onChange) ctrl.onChange(+ctrl.default);
        }
      }
    }

    updateSelectedPrimes();
    updateDimLabel();
    update({ dimension: 0.5, shapeDrift: false });
    scheduleRebuild();

    // Restart idle morph timer (same as boot)
    resetIdleTimer();
    idleTimer = setTimeout(enableMorphIdle, 3000);
  });


  // Update N display
  updateN();

  // Build module sections
  buildModuleSections();
  updateModuleStates();

  emit('panelReady', { panelEl: $('panel') });

  // Any interaction cancels the idle timer
  const panel = $('panel');
  const viewport = document.getElementById('viewport');
  for (const el of [panel, viewport]) {
    if (!el) continue;
    for (const evt of ['pointerdown', 'mousedown', 'touchstart', 'wheel']) {
      el.addEventListener(evt, resetIdleTimer, { once: true });
    }
  }
  document.addEventListener('keydown', resetIdleTimer, { once: true });
}
