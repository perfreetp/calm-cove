// Procedural tunnel element generator.
// Deterministic: the same project seed always yields identical geometry, so
// QC findings and delivery manifests are reproducible across runs.

import { mulberry32 } from '../../shared/rng.js';
import { MODEL_LIBRARY, boreLayout, KINDS } from '../../shared/domain.js';

const SECTION_TARGET_M = 250;
const FAN_SPACING_MIN_M = 6.0;   // design minimum clear spacing between adjacent fans

function pick(rnd, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];
}

export function buildSections(project) {
  const layout = boreLayout(project);
  const sections = [];
  for (let b = 0; b < layout.bores; b++) {
    const n = Math.max(2, Math.ceil(project.length_m / SECTION_TARGET_M));
    for (let i = 0; i < n; i++) {
      const start = Math.round((project.length_m * i) / n);
      const end = Math.round((project.length_m * (i + 1)) / n);
      sections.push({
        code: `${layout.boreNames[b]}${String(i + 1).padStart(2, '0')}`,
        name: `第 ${i + 1} 区段`,
        bore_index: b,
        start_m: start,
        end_m: end,
      });
    }
  }
  return sections;
}

/**
 * Generate every element of a project.
 * @param {object} project  {length_m, lanes, bores, seed, id}
 * @param {Array}  sections rows from buildSections()
 * @param {object} [opts]   {clean: boolean}  clean=true disables injected defects
 * @returns {{elements: Array, layout: object}}
 */
export function buildElements(project, sections, opts = {}) {
  const rnd = mulberry32((project.seed >>> 0) || 1);
  const layout = boreLayout(project);
  const length = project.length_m;
  const injectDefects = opts.clean !== true;
  const tightFanProb = injectDefects ? 0.016 : 0;
  const unmountedEvery = injectDefects ? 101 : 1e9;

  const perBoreSections = sections.length / layout.bores;
  const sectionFor = (bore, meter) => {
    const idx = Math.min(perBoreSections - 1, Math.max(0, Math.floor((meter / length) * perBoreSections)));
    return sections[bore * perBoreSections + idx];
  };

  const elements = [];
  const counters = {};
  const push = (bore, kind, x, y, angle, extra = {}) => {
    const layer = extra.layer || KINDS[kind].layer;
    counters[kind] = (counters[kind] || 0) + 1;
    const section = extra.section === undefined ? sectionFor(bore, x) : extra.section;
    const code = extra.code ||
      `${KINDS[kind].prefix}-${layout.boreNames[bore]}-${String(counters[kind]).padStart(4, '0')}`;
    elements.push({
      layer,
      kind,
      code,
      model: extra.model || pick(rnd, MODEL_LIBRARY[kind] || ['—']),
      bore_index: bore,
      chainage: Math.round(x * 100) / 100,
      offset: Math.round(y * 100) / 100,
      angle_deg: angle,
      mounted: extra.mounted === undefined ? 1 : extra.mounted,
      section_code: section ? section.code : null,
    });
  };

  for (let b = 0; b < layout.bores; b++) {
    const cy = layout.centers[b];
    const halfW = layout.boreW / 2;

    // --- Jet fans: banks along the crown every 24 m, 2–3 units per cross-section ---
    const bankCount = layout.lanesPerBore >= 3 ? 3 : 2;
    const lateralStep = Math.max(3.0, Math.min(4.2, (layout.roadW - 3) / Math.max(1, bankCount - 1)));
    for (let x = 18; x < length - 14; x += 24) {
      const dir = x < length / 2 ? 1 : -1;
      const offsets = [];
      for (let k = 0; k < bankCount; k++) {
        offsets.push((k - (bankCount - 1) / 2) * lateralStep);
      }
      for (const off of offsets) push(b, 'jet_fan', x, cy + off, dir === 1 ? 0 : 180);
      // Deliberate defect: an extra bank 5 m downstream on the same mounting
      // line => centre-to-centre spacing 5.0 m < 6.0 m design minimum.
      if (rnd() < tightFanProb) {
        for (const off of offsets) push(b, 'jet_fan', x + 5, cy + off, dir === 1 ? 0 : 180);
      }
    }

    // --- Duct run: 1 m segments along the right haunch ---
    const ductY = cy + halfW - 2.15;
    for (let x = 1; x < length - 1; x += 1) {
      push(b, 'duct', x, ductY, 0, { length_override: 1 });
    }
    for (let x = 36; x < length - 20; x += 58) {
      push(b, 'damper', x, ductY, 0);
      if (rnd() < 0.28) push(b, 'damper', x + 9, ductY - 2.4, 0);
    }

    // --- Cable tray along the left haunch, 2 m segments ---
    const trayY = cy - halfW + 1.7;
    for (let x = 2; x < length - 1; x += 2) {
      push(b, 'cable_tray', x, trayY, 0);
    }

    // --- CO / VI detectors every 25 m, alternating, some unmounted ---
    let tick = 0;
    for (let x = 60; x < length - 40; x += 25) {
      tick++;
      const kind = tick % 2 === 0 ? 'co_sensor' : 'vi_sensor';
      const mounted = tick % unmountedEvery !== 0 ? 1 : 0;
      const side = tick % 4 < 2 ? 1 : -1;
      push(b, kind, x, cy + side * (halfW - 0.95), 0,
        mounted ? {} : { mounted: 0, section: null });
    }

    // --- Civil expansion joints every 30 m ---
    for (let x = 45; x < length - 15; x += 30) {
      push(b, 'civil_joint', x, cy, 0, { layer: 'civil' });
    }

    // --- Fan rooms: clusters of 12 equipment units outside the bore ---
    const roomY = cy + (cy >= 0 ? 1 : -1) * (halfW + 19);
    for (let x = 260; x < length - 200; x += 420) {
      for (let k = 0; k < 12; k++) {
        const dx = (k % 4) * 6.4 - 9.6;
        const dy = Math.floor(k / 4) * 4.2 - 4.2;
        push(b, 'fan_equip', x + dx, roomY + dy, 0);
      }
    }
  }

  // --- Section chainage annotation marks (annotations layer) ---
  for (const s of sections) {
    push(s.bore_index, 'chainage_mark', s.start_m, layout.centers[s.bore_index], 0, {
      layer: 'anno', code: `LB-${s.code}`, model: '区段桩号标注', section: s,
    });
  }

  return { elements, layout };
}

export function fanBanks(elements) {
  const byKey = new Map();
  const banks = [];
  for (const e of elements) {
    if (e.kind !== 'jet_fan') continue;
    const k = `${e.bore_index}:${Math.round(e.chainage)}`;
    let b = byKey.get(k);
    if (!b) {
      b = { key: k, bore: e.bore_index, chainage: e.chainage, count: 0, section_code: e.section_code };
      byKey.set(k, b);
      banks.push(b);
    }
    b.count++;
  }
  return banks;
}

export const LIMITS = { FAN_SPACING_MIN_M };
