// Babylon drawing engine for the tunnel schematic.
//
// Design goals:
//  * Tens of thousands of symbols on one layered plan without per-symbol meshes.
//    Each layer/kind combination is a single mesh whose instances are supplied as
//    a thin-instance matrix buffer, so the whole plan is a handful of draw calls.
//  * Viewport culling is explicit: the camera's visible world rectangle is
//    recomputed on every view change and the thin-instance buffer is rebuilt with
//    only intersecting elements. Off-screen elements never reach the GPU.
//  * Level of detail follows the denominator of the plot scale (<1:5000 → section
//    outlines + fan counts; ≥1:500 → single units, ducts and annotations).
//  * Picking is done analytically against the same element arrays (no GPU picking)
//    so it stays fast and exact at any zoom.

import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { LAYERS, KINDS, KIND_KEYS } from '../../shared/domain.js';

// Symbol geometry, built once per kind in a unit square on the XZ plane (the
// camera looks straight down, so XZ is the drawing plane and Y is "up" out of the
// page). Instance matrices scale each unit symbol to its real footprint.
const KIND_GEOMETRY = {
  jet_fan: 'rect',
  damper: 'damper',
  duct: 'rect',
  cable_tray: 'rect',
  fan_equip: 'equip',
  co_sensor: 'disc',
  vi_sensor: 'disc',
  civil_joint: 'line',
  chainage_mark: 'none',
};

function buildSymbol(scene, name, kind) {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  const pos = [];
  const idx = [];
  const addQuad = (x0, z0, x1, z1) => {
    const b = pos.length / 3;
    pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const addDisc = (segments) => {
    const b = pos.length / 3;
    pos.push(0, 0, 0);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segments; i++) {
      idx.push(b, b + 1 + i, b + 1 + ((i + 1) % segments));
    }
  };

  switch (kind) {
    case 'rect':   // solid body: one unit quad
      addQuad(-0.5, -0.5, 0.5, 0.5);
      break;
    case 'equip':  // body plus a divider stripe
      addQuad(-0.5, -0.5, 0.5, 0.5);
      break;
    case 'damper': // outer frame + diagonal blade
      addQuad(-0.5, -0.5, 0.5, -0.34);
      addQuad(-0.5, 0.34, 0.5, 0.5);
      addQuad(-0.5, -0.34, -0.34, 0.34);
      addQuad(0.34, -0.34, 0.5, 0.34);
      break;
    case 'disc':
      addDisc(20);
      break;
    case 'line':
      addQuad(-1, -0.08, 1, 0.08);
      break;
    default:
      addQuad(-0.5, -0.5, 0.5, 0.5);
  }
  vd.positions = pos;
  vd.indices = idx;
  vd.normals = pos.map((_, i) => (i % 3 === 1 ? 1 : 0));
  vd.uvs = pos.map((_, i) => (i % 3 === 0 ? 0.5 + pos[i] : 0.5));
  vd.applyToMesh(m);
  return m;
}

// A small tilt away from perfectly vertical keeps the camera's up-vector
// well-conditioned; at beta≈0 the view matrix degenerates and the projection
// collapses, which shows up as a blank canvas once the target moves.
const PLAN_RADIUS = 1600;   // eye height above the plan (orthographic, only affects clip)

function formatChainageClient(m) {
  const km = Math.floor(m / 1000);
  return `K${km}+${String(Math.round(m - km * 1000)).padStart(3, '0')}`;
}

export class TunnelPlan {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.onReady = opts.onReady || (() => {});
    this.onViewChange = opts.onViewChange || (() => {});

    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      powerPreference: 'high-performance',
    }, false);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.043, 0.063, 0.086, 1);
    this.scene.ambientColor = new Color3(1, 1, 1);

    // Plan camera: orthographic, positioned above the target and looking down -Y
    // with +X to the right and +Z "down" the page. Billboarded symbols lie in
    // the XZ plane, which is exactly the plane this camera sees.
    this.camera = new FreeCamera('plan', new Vector3(0, PLAN_RADIUS, 0), this.scene);
    this.camera.mode = 1;                     // orthographic
    this.camera.setTarget(new Vector3(0, 0, 0));
    this.camera.upVector = new Vector3(0, 0, 1);
    this.camera.minZ = 1;
    this.camera.maxZ = 8000;
    this.camera.inputs.clear();

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
    light.intensity = 1.0;
    light.groundColor = new Color3(1, 1, 1);

    this.materials = {};
    this.meshes = {};
    this.textLayer = null;
    this.pickables = [];
    this.state = {
      layers: { hvac: true, elec: true, civil: true, anno: true },
      lod: 'full',
      selection: [],
      hover: null,
      issueIds: new Set(),
      sectionColors: null,
      showLabels: true,
    };
    this.geometry = null;
    this.viewRect = { x0: 0, x1: 1, y0: 0, y1: 1 };
    this._buildStatic();

    if (typeof window !== 'undefined') window.__plan = this;   // debug handle
    this.engine.runRenderLoop(() => this.scene.render());
    this._resizeObs = new ResizeObserver(() => {
      this.engine.resize();
      // Keep the frustum matched to the canvas aspect after layout changes.
      const v = this.viewRect;
      if (v.x1 > v.x0) {
        this.setView({ x0: v.x0, x1: v.x1, y0: v.y0, y1: v.y1 });
      }
    });
    this._resizeObs.observe(canvas.parentElement || canvas);
    this.scene.onBeforeRenderObservable.add(() => this._syncCamera());
    this.onReady(this);
  }

  // ----- static layer of meshes -------------------------------------------
  _buildStatic() {
    this.staticMeshes = {};
    for (const key of KIND_KEYS) {
      const geo = KIND_GEOMETRY[key];
      if (geo === 'none') continue;
      const mesh = buildSymbol(this.scene, `inst_${key}`, geo);
      const mat = new StandardMaterial(`mat_${key}`, this.scene);
      mat.diffuseColor = Color3.FromHexString(LAYERS[KINDS[key].layer].color);
      mat.emissiveColor = Color3.FromHexString(LAYERS[KINDS[key].layer].color).scale(0.75);
      mat.specularColor = Color3.Black();
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.thinInstanceEnablePicking = false;
      mesh.doNotSyncBoundingInfo = true;
      this.staticMeshes[key] = mesh;
    }
  }

  // ----- geometry loading --------------------------------------------------
  loadGeometry(geo) {
    this.geometry = geo;
    this.state.selection = [];
    this.fitAll();
    this.refresh();
    return geo;
  }

  setIssueIds(ids) {
    this.state.issueIds = new Set(ids);
    this.refresh();
  }

  setSectionColors(map) {
    this.state.sectionColors = map;
  }

  setLayers(layers) {
    Object.assign(this.state.layers, layers);
    this.refresh();
  }

  setSelection(ids) {
    this.state.selection = [...ids];
    this.refresh();
    this.onViewChange(this.getViewInfo());
  }

  setHover(id) {
    if (this.state.hover === id) return;
    this.state.hover = id;
    this.refresh();
  }

  // ----- camera ------------------------------------------------------------
  fitAll() {
    const p = this.geometry?.project;
    if (!p) return;
    const rect = this.canvas.getBoundingClientRect();
    const aspect = Math.max(0.2, rect.height / Math.max(1, rect.width));
    const halfH = (p.length_m * aspect) / 2;
    this.setView({ x0: 0, x1: p.length_m, y0: -halfH, y1: halfH });
  }

  fitSection(section) {
    const layout = this.geometry?.layout;
    if (!section || !layout) return;
    const cy = layout.centers[section.bore_index] ?? 0;
    const pad = Math.max(20, (section.end_m - section.start_m) * 0.12);
    this.setView({
      x0: section.start_m - pad, x1: section.end_m + pad,
      y0: cy - layout.boreW / 2 - 32, y1: cy + layout.boreW / 2 + 32,
    });
  }

  /** Set the visible world rectangle (metres). */
  setView({ x0, x1, y0, y1 }) {
    if (!this.geometry) return;
    const p = this.geometry.project;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const canvasW = Math.max(1, this.engine.getRenderWidth());
    const canvasH = Math.max(1, this.engine.getRenderHeight());
    const wUnits = Math.max(4, x1 - x0);
    const hUnits = Math.max(4, y1 - y0);
    const aspect = canvasW / canvasH;
    // Expand the requested rect so it exactly fills the canvas aspect.
    let halfW = wUnits / 2;
    let halfH = hUnits / 2;
    if (halfW / halfH < aspect) halfW = halfH * aspect;
    else halfH = halfW / aspect;

    this.camera.position.set(cx, PLAN_RADIUS, cy);
    this.camera.setTarget(new Vector3(cx, 0, cy));
    this.camera.upVector = new Vector3(0, 0, 1);
    halfW = Math.max(2, halfW);
    halfH = Math.max(2, halfH);
    this.camera.orthoLeft = -halfW;
    this.camera.orthoRight = halfW;
    this.camera.orthoTop = halfH;
    this.camera.orthoBottom = -halfH;
    this.viewRect = { x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH };
    this.refresh();
    this.onViewChange(this.getViewInfo());
  }

  panBy(dxUnits, dyUnits) {
    const v = this.viewRect;
    this.setView({
      x0: v.x0 + dxUnits, x1: v.x1 + dxUnits,
      y0: v.y0 + dyUnits, y1: v.y1 + dyUnits,
    });
  }

  zoomAt(factor, worldX, worldY) {
    const v = this.viewRect;
    const cx = worldX ?? (v.x0 + v.x1) / 2;
    const cy = worldY ?? (v.y0 + v.y1) / 2;
    const halfW = ((v.x1 - v.x0) / 2) * factor;
    const halfH = ((v.y1 - v.y0) / 2) * factor;
    this.setView({ x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH });
  }

  /** Screen (CSS pixels) → world metres. */
  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const v = this.viewRect;
    return {
      x: v.x0 + fx * (v.x1 - v.x0),
      y: v.y1 - fy * (v.y1 - v.y0),
    };
  }

  worldToScreen(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const v = this.viewRect;
    return {
      x: rect.left + ((x - v.x0) / (v.x1 - v.x0)) * rect.width,
      y: rect.top + ((v.y1 - y) / (v.y1 - v.y0)) * rect.height,
    };
  }

  _syncCamera() {
    // Keep the ortho frustum in step with the canvas aspect after resizes.
  }

  getViewInfo() {
    const v = this.viewRect;
    const widthM = v.x1 - v.x0;
    const widthPx = Math.max(1, this.canvas.getBoundingClientRect().width);
    // metres-per-pixel → plotted denominator for a 96 dpi screen
    const mPerPx = widthM / widthPx;
    const denom = Math.round(mPerPx * (96 / 0.0254));
    return {
      rect: { ...v },
      widthM,
      denominator: denom,
      lod: this.lodForDenominator(denom),
    };
  }

  /**
   * Plot-scale LOD. A denominator below 1:5000 is "zoomed out" (section outlines
   * and per-section fan counts); at 1:5000 and closer the individual units, ducts
   * and annotations are expanded. Zooming out past 1:5000 collapses them again.
   */
  lodForDenominator(denom) {
    return denom >= 5000 ? 'overview' : 'full';
  }

  // ----- culling + instance building ---------------------------------------
  refresh() {
    const geo = this.geometry;
    if (!geo) return;
    const v = this.viewRect;
    const padM = (v.x1 - v.x0) * 0.02;
    const x0 = v.x0 - padM, x1 = v.x1 + padM;
    const y0 = v.y0 - padM, y1 = v.y1 + padM;

    const el = geo.elements;
    const st = this.state;
    const lod = this.lodForDenominator(this.getViewInfo().denominator);

    const buckets = new Map();   // kind -> matrices array
    this.visibleCounts = { total: 0, byKind: {} };
    const selected = new Set(st.selection);

    for (let i = 0; i < el.count; i++) {
      const layer = LAYER_KEYS_CACHE[el.layer[i]] || 'civil';
      if (!st.layers[layer]) continue;
      if (lod === 'overview') continue;   // overview is drawn on the overlay
      if (el.kind[i] === KIND_INDEX_CACHE.chainage_mark) continue;
      const x = el.x[i];
      const y = el.y[i];
      const kw = el.w[i];
      const kh = el.h[i];
      const halfW = kw / 2;
      const halfH = kh / 2;
      if (x + halfW < x0 || x - halfW > x1 || y + halfH < y0 || y - halfH > y1) continue;

      const kindKey = KIND_KEYS_CACHE[el.kind[i]];
      if (!buckets.has(kindKey)) buckets.set(kindKey, []);
      let scale = 1;
      const id = el.ids[i];
      const isSel = selected.has(id);
      if (isSel) scale = 1.25;
      const ang = (el.ang[i] * Math.PI) / 180;
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const sx = kw * scale, sy = kh * scale;
      // Column-major 4x4: rotate the XZ symbol about the vertical axis, then
      // scale to its footprint and translate to (chainage, lateral offset).
      buckets.get(kindKey).push(
        cos * sx, 0, sin * sx, 0,
        0, 1, 0, 0,
        -sin * sy, 0, cos * sy, 0,
        x, 0, y, 1,
      );
      this.visibleCounts.total++;
      this.visibleCounts.byKind[kindKey] = (this.visibleCounts.byKind[kindKey] || 0) + 1;
    }

    for (const [kindKey, mesh] of Object.entries(this.staticMeshes)) {
      const mats = buckets.get(kindKey);
      if (!mats || !mats.length) {
        mesh.thinInstanceCount = 0;
        mesh.isVisible = false;
        continue;
      }
      mesh.isVisible = true;
      mesh.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16, true);
    }
    this._drawOverlay();
  }

  // ----- overlay: section outlines, labels, selection ----------------------
  _drawOverlay() {
    // The overlay is an HTML canvas positioned over the WebGL canvas for crisp
    // text and cheap vector overlays; redrawn on every view/selection change.
    if (!this.overlay) {
      const c = document.createElement('canvas');
      c.className = 'plan-overlay';
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.pointerEvents = 'none';
      this.canvas.parentElement.appendChild(c);
      this.overlay = c;
    }
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.overlay;
    if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, rect.width, rect.height);
    if (!this.geometry) return;

    const geo = this.geometry;
    const v = this.viewRect;
    const st = this.state;
    const sx = rect.width / (v.x1 - v.x0);
    const sy = rect.height / (v.y1 - v.y0);
    const X = (m) => (m - v.x0) * sx;
    const Y = (m) => (v.y1 - m) * sy;
    const lod = this.getViewInfo().lod;

    if (lod === 'overview') {
      this._drawOverview(g, rect, X, Y);
      return;
    }

    // Section bands
    if (st.layers.civil) {
      for (const sec of geo.sections) {
        const cy = geo.layout.centers[sec.bore_index] ?? 0;
        const half = geo.layout.boreW / 2;
        if (sec.end_m < v.x0 || sec.start_m > v.x1) continue;
        const x0 = X(sec.start_m), x1 = X(sec.end_m);
        const yTop = Y(cy + half), yBot = Y(cy - half);
        g.fillStyle = st.sectionColors?.[sec.id] || 'rgba(120,170,210,0.05)';
        g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
        g.strokeStyle = 'rgba(150,190,220,0.22)';
        g.lineWidth = 1;
        g.strokeRect(x0 + 0.5, yTop + 0.5, Math.max(0, x1 - x0 - 1), Math.max(0, yBot - yTop - 1));
        if (x1 - x0 > 34) {
          g.fillStyle = 'rgba(190,220,245,0.75)';
          g.font = '600 10px "Segoe UI", system-ui, sans-serif';
          g.fillText(sec.code, x0 + 5, yTop + 12);
        }
      }
    }

    // Bore outlines and labels
    if (st.layers.civil) {
      for (const [bi, cy] of geo.layout.centers.entries()) {
        const half = geo.layout.boreW / 2;
        g.strokeStyle = 'rgba(150,180,205,0.5)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0, Y(cy + half));
        g.lineTo(rect.width, Y(cy + half));
        g.moveTo(0, Y(cy - half));
        g.lineTo(rect.width, Y(cy - half));
        g.stroke();
        g.setLineDash([5, 5]);
        g.strokeStyle = 'rgba(150,180,205,0.28)';
        g.beginPath();
        g.moveTo(0, Y(cy));
        g.lineTo(rect.width, Y(cy));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(160,190,215,0.65)';
        g.font = '11px "Segoe UI", system-ui, sans-serif';
        g.fillText(`${geo.layout.boreLabels[bi]} · ${geo.layout.boreNames[bi]}洞`, 8, Y(cy + half) - 6);
      }
    }

    // Fan bank counts in overview mode
    if (lod === 'overview' && st.layers.hvac) {
      g.textAlign = 'center';
      for (const bank of geo.banks) {
        if (bank.chainage < v.x0 || bank.chainage > v.x1) continue;
        const y = Y(this._bankY(bank));
        g.fillStyle = 'rgba(94,200,255,0.9)';
        g.font = '600 11px "Segoe UI", system-ui, sans-serif';
        g.fillText(`${bank.count}×`, X(bank.chainage), y - 4);
      }
      g.textAlign = 'left';
    }

    // Element labels at the detailed level (only when there is room)
    if (lod === 'full' && st.showLabels && st.layers.anno) {
      const el = geo.elements;
      const denom = this.getViewInfo().denominator;
      if (denom > 200 && denom < 1800) {
        g.font = '9px "Segoe UI", system-ui, sans-serif';
        g.fillStyle = 'rgba(200,225,245,0.72)';
        let drawn = 0;
        for (let i = 0; i < el.count && drawn < 400; i++) {
          if (el.kind[i] !== KIND_INDEX_CACHE.jet_fan) continue;
          const x = el.x[i];
          if (x < v.x0 || x > v.x1) continue;
          drawn++;
          g.fillText(String(el.ids[i] % 10000).padStart(4, '0'), X(x) - 9, Y(el.y[i]) - 8);
        }
      }
    }

    // Selection highlights
    g.strokeStyle = '#ffd166';
    g.lineWidth = 1.6;
    const el2 = geo.elements;
    if (st.selection.length) {
      const sel = new Set(st.selection);
      for (let i = 0; i < el2.count; i++) {
        if (!sel.has(el2.ids[i])) continue;
        const w = Math.max(6, el2.w[i] * sx * 1.35);
        const h = Math.max(6, el2.h[i] * sy * 1.35);
        g.strokeRect(X(el2.x[i]) - w / 2, Y(el2.y[i]) - h / 2, w, h);
      }
    }
    // Hover
    if (st.hover != null) {
      for (let i = 0; i < el2.count; i++) {
        if (el2.ids[i] !== st.hover) continue;
        const w = Math.max(7, el2.w[i] * sx * 1.5);
        const h = Math.max(7, el2.h[i] * sy * 1.5);
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.strokeRect(X(el2.x[i]) - w / 2, Y(el2.y[i]) - h / 2, w, h);
        break;
      }
    }
    // Issue markers
    if (st.issueIds.size) {
      g.strokeStyle = 'rgba(255,110,90,0.95)';
      g.lineWidth = 1.4;
      for (let i = 0; i < el2.count; i++) {
        if (!st.issueIds.has(el2.ids[i])) continue;
        const w = Math.max(9, el2.w[i] * sx * 1.7);
        const h = Math.max(9, el2.h[i] * sy * 1.7);
        g.beginPath();
        g.ellipse(X(el2.x[i]), Y(el2.y[i]), w / 2, h / 2, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Rubber-band box
    if (this.rubberBand) {
      const { x0, y0, x1, y1 } = this.rubberBand;
      g.fillStyle = 'rgba(94,200,255,0.14)';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = 'rgba(120,215,255,0.9)';
      g.setLineDash([5, 4]);
      g.lineWidth = 1.2;
      g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      g.setLineDash([]);
    }
  }

  /**
   * Overview (plot scale < 1:5000): a schematic bar chart of the corridor.
   * Each bore becomes a horizontal ribbon split into section blocks with
   * per-section fan counts; individual symbols are not drawn.
   */
  _drawOverview(g, rect, X, Y) {
    const geo = this.geometry;
    const st = this.state;
    const v = this.viewRect;
    const layout = geo.layout;

    const barH = Math.max(44, Math.min(84, (rect.height * 0.55) / layout.bores));
    const rowGap = Math.max(46, barH * 0.75);
    const top = rect.height / 2 - ((layout.bores - 1) * (barH + rowGap)) / 2 - barH / 2;

    // Section fan counts, aggregated from the geometry feed.
    const fanCount = new Map();
    let fanCountMax = 1;
    const el = geo.elements;
    for (let i = 0; i < el.count; i++) {
      if (el.kind[i] !== KIND_INDEX_CACHE.jet_fan) continue;
      const si = el.sectionIdx[i];
      if (si >= 0) fanCount.set(si, (fanCount.get(si) || 0) + 1);
    }
    for (const n of fanCount.values()) fanCountMax = Math.max(fanCountMax, n);

    for (let b = 0; b < layout.bores; b++) {
      const cyPx = top + b * (barH + rowGap) + barH / 2;
      const y0 = cyPx - barH / 2;

      // Bore ribbon background
      g.fillStyle = 'rgba(28,44,60,0.65)';
      g.fillRect(0, y0, rect.width, barH);
      g.strokeStyle = 'rgba(120,150,175,0.35)';
      g.lineWidth = 1;
      g.strokeRect(0.5, y0 + 0.5, rect.width - 1, barH - 1);

      // Bore label
      g.fillStyle = 'rgba(160,190,215,0.85)';
      g.font = '600 11px "Segoe UI", system-ui, sans-serif';
      g.fillText(`${layout.boreLabels[b]}（${layout.boreNames[b]}洞）`, 8, y0 - 5);

      // Sections of this bore
      const secs = geo.sections.filter((sec) => sec.bore_index === b);
      for (const sec of secs) {
        if (sec.end_m < v.x0 || sec.start_m > v.x1) continue;
        const x0 = Math.max(0, X(sec.start_m));
        const x1 = Math.min(rect.width, X(sec.end_m));
        if (x1 <= x0) continue;
        const fans = fanCount.get(geo.sections.indexOf(sec)) || 0;
        const intensity = Math.min(1, fans / 60);
        g.fillStyle = st.sectionColors?.[sec.id]
          || `rgba(60,140,190,${0.16 + intensity * 0.22})`;
        g.fillRect(x0, y0 + 2, x1 - x0, barH - 4);
        g.strokeStyle = 'rgba(140,180,215,0.45)';
        g.strokeRect(x0 + 0.5, y0 + 2.5, Math.max(0, x1 - x0 - 1), barH - 5);
        if (x1 - x0 > 18) {
          g.fillStyle = 'rgba(215,240,255,0.95)';
          g.font = '600 11px "Segoe UI", system-ui, sans-serif';
          g.fillText(sec.code, x0 + 4, y0 + 15);
          // Fan count gets its own right-aligned slot so it never collides with
          // the bar, which is drawn on the left of the same block.
          const blockW = x1 - x0;
          if (blockW > 34) {
            g.fillStyle = 'rgba(200,228,248,0.95)';
            g.font = '600 10px "Segoe UI", system-ui, sans-serif';
            g.fillText(`${fans} 台`, x0 + 4, y0 + 13.5 + 12);
          }
          if (x1 - x0 > 30) {
            const barWidth = Math.max(4, Math.min(14, (x1 - x0) * 0.18));
            const hh = Math.max(2, (fans / fanCountMax) * (barH - 34));
            g.fillStyle = 'rgba(255,198,80,0.55)';
            g.fillRect(x0 + 5, y0 + barH - 10 - hh, barWidth, hh);
          }
        }
      }

    }

    // Chainage ruler under the last bar
    const rulerY = top + layout.bores * (barH + rowGap) + 4;
    g.strokeStyle = 'rgba(140,170,195,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, rulerY);
    g.lineTo(rect.width, rulerY);
    g.stroke();
    const span = v.x1 - v.x0;
    const step = span > 4000 ? 1000 : span > 1000 ? 200 : 50;
    g.fillStyle = 'rgba(150,175,200,0.8)';
    g.font = '10px "Segoe UI", system-ui, sans-serif';
    for (let m = Math.ceil(v.x0 / step) * step; m <= v.x1; m += step) {
      const px = X(m);
      g.beginPath();
      g.moveTo(px, rulerY);
      g.lineTo(px, rulerY + 4);
      g.stroke();
      g.fillText(formatChainageClient(m), px + 2, rulerY + 13);
    }

    // Selection / issue markers in overview: highlight containing sections.
    if (st.selection.length || st.issueIds.size) {
      const selectedSections = new Set();
      for (let i = 0; i < el.count; i++) {
        const isSel = st.selection.includes(el.ids[i]);
        const isIssue = st.issueIds.has(el.ids[i]);
        if (isSel || isIssue) selectedSections.add(`${el.kind[i]}:${el.sectionIdx[i]}:${isSel ? 's' : 'i'}`);
      }
      // Section-level highlight for issues
      const issueSections = new Set();
      for (let i = 0; i < el.count; i++) {
        if (st.issueIds.has(el.ids[i])) issueSections.add(el.sectionIdx[i]);
      }
      for (const si of issueSections) {
        const sec = geo.sections[si];
        if (!sec) continue;
        const b = sec.bore_index;
        const y0 = top + b * (barH + rowGap);
        const x0 = Math.max(0, X(sec.start_m));
        const x1 = Math.min(rect.width, X(sec.end_m));
        g.strokeStyle = 'rgba(255,110,90,0.85)';
        g.lineWidth = 1.6;
        g.strokeRect(x0 + 1, y0 + 3, Math.max(0, x1 - x0 - 2), barH - 6);
      }
    }
  }

  _bankY(bank) {
    const layout = this.geometry.layout;
    return layout.centers[bank.bore] ?? 0;
  }

  // ----- picking -----------------------------------------------------------
  pickAt(clientX, clientY) {
    const geo = this.geometry;
    if (!geo) return null;
    const { x, y } = this.screenToWorld(clientX, clientY);
    const rect = this.canvas.getBoundingClientRect();
    const tolX = ((this.viewRect.x1 - this.viewRect.x0) / rect.width) * 5;
    const tolY = ((this.viewRect.y1 - this.viewRect.y0) / rect.height) * 5;
    const el = geo.elements;
    const st = this.state;
    const lod = this.getViewInfo().lod;
    if (lod === 'overview') return this._pickSectionAt(x, y);
    let best = null;
    let bestArea = Infinity;
    for (let i = 0; i < el.count; i++) {
      const layer = LAYER_KEYS_CACHE[el.layer[i]] || 'civil';
      if (!st.layers[layer]) continue;
      if (lod === 'overview') continue;
      if (el.kind[i] === KIND_INDEX_CACHE.chainage_mark) continue;
      const hw = Math.max(el.w[i] / 2, tolX);
      const hh = Math.max(el.h[i] / 2, tolY);
      if (Math.abs(el.x[i] - x) > hw || Math.abs(el.y[i] - y) > hh) continue;
      const area = hw * hh;
      if (area < bestArea) { bestArea = area; best = i; }
    }
    return best == null ? null : {
      id: el.ids[best],
      index: best,
      sectionId: el.sectionIdx[best],
      kind: KIND_KEYS_CACHE[el.kind[best]],
      x: el.x[best],
      y: el.y[best],
    };
  }

  /** Overview-mode pick: return the section under the cursor (no element). */
  _pickSectionAt(x, y) {
    const geo = this.geometry;
    if (!geo) return null;
    for (const sec of geo.sections) {
      const cy = geo.layout.centers[sec.bore_index] ?? 0;
      const half = geo.layout.boreW / 2;
      if (x >= sec.start_m && x <= sec.end_m && y >= cy - half && y <= cy + half) {
        return { section: sec, id: null, mode: 'overview' };
      }
    }
    return null;
  }

  /** Overview-mode rectangle: return section ids intersecting the box. */
  _sectionsInRect(x0, y0, x1, y1) {
    const geo = this.geometry;
    if (!geo) return [];
    const out = [];
    for (const sec of geo.sections) {
      const cy = geo.layout.centers[sec.bore_index] ?? 0;
      const half = geo.layout.boreW / 2;
      if (sec.end_m < x0 || sec.start_m > x1) continue;
      if (cy + half < y0 || cy - half > y1) continue;
      out.push(sec);
    }
    return out;
  }

  pickInRect(screenRect) {
    const geo = this.geometry;
    if (!geo) return [];
    const a = this.screenToWorld(screenRect.x0, screenRect.y0);
    const b = this.screenToWorld(screenRect.x1, screenRect.y1);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (this.getViewInfo().lod === 'overview') return this._sectionsInRect(x0, y0, x1, y1);
    const el = geo.elements;
    const st = this.state;
    const lod = this.getViewInfo().lod;
    const out = [];
    for (let i = 0; i < el.count; i++) {
      const layer = LAYER_KEYS_CACHE[el.layer[i]] || 'civil';
      if (!st.layers[layer]) continue;
      if (lod === 'overview' && el.kind[i] !== KIND_INDEX_CACHE.jet_fan
        && el.kind[i] !== KIND_INDEX_CACHE.chainage_mark) continue;
      if (lod === 'full' && el.kind[i] === KIND_INDEX_CACHE.chainage_mark) continue;
      const x = el.x[i], y = el.y[i];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      out.push(el.ids[i]);
    }
    return out;
  }

  /** Snapshot the current plan as a PNG (used by the UI "export view"). */
  snapshot() {
    this.scene.render();
    const data = this.canvas.toDataURL('image/png');
    return data;
  }

  dispose() {
    this._resizeObs?.disconnect();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

// Fast lookup tables
const LAYER_KEYS_CACHE = { 0: 'hvac', 1: 'elec', 2: 'civil', 3: 'anno' };
const KIND_INDEX_CACHE = Object.fromEntries(KIND_KEYS.map((k, i) => [k, i]));
const KIND_KEYS_CACHE = KIND_KEYS;

