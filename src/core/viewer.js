import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import earcut from 'earcut';

import { layerSubpaths, plateSubpaths } from './model.js';
import { ringsFromSubpaths, groupRings, segmentsOf } from './geom.js';

const deg = (d) => (d * Math.PI) / 180;

export class SignViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, alpha: false });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.09, 0.11, 0.14, 1);
    this.root = new TransformNode('signRoot', this.scene);
    this.plateMesh = null;
    this.texture = null;
    this.mode = 'perspective';
    this.lighting = 'day';
    this.angle = 0;
    this.buildEnvironment();
    this.engine.runRenderLoop(() => this.scene.render());
    this._resize = () => this.engine.resize();
    window.addEventListener('resize', this._resize);
  }

  buildEnvironment() {
    const scene = this.scene;
    // alpha 0 → camera on +Z (plate normal); +beta tilts above the sign
    this.camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2.35, 5.4, Vector3.Zero(), scene);
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerRadiusLimit = 1.2;
    this.camera.upperRadiusLimit = 24;
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.minZ = 0.01;
    this.camera.panningSensibility = 700;
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

    const hemi = new HemisphericLight('hemi', new Vector3(0.25, 1, 0.15), scene);
    hemi.intensity = 0.72;
    hemi.diffuse = new Color3(0.92, 0.95, 1);
    hemi.groundColor = new Color3(0.16, 0.18, 0.22);

    const dir = new DirectionalLight('dir', new Vector3(-0.55, -1, -0.7), scene);
    dir.position = new Vector3(6, 10, 9);
    dir.intensity = 0.85;
    this.shadow = new ShadowGenerator(1024, dir);
    this.shadow.useBlurExponentialShadowMap = true;
    this.shadow.blurKernel = 32;
    this.shadow.darkness = 0.5;

    const ground = CreateGround('ground', { width: 60, height: 60, subdivisions: 1 }, scene);
    ground.position.y = -2.3;
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.14, 0.17);
    gm.specularColor = new Color3(0.02, 0.02, 0.03);
    ground.material = gm;
    ground.receiveShadows = true;
    this.ground = ground;
  }

  update(doc, opts = {}) {
    this.disposePlate();
    const scale = 4.6 / Math.max(doc.width, doc.height);
    this.root.scaling = new Vector3(scale, scale, scale);

    const thickness = Math.max(0.35, (doc.plateThickness || 2) / 8); // visually exaggerated so the edge reads
    const texW = Math.min(2048, Math.max(512, Math.round(doc.width / 2)));
    const texH = Math.max(64, Math.round((texW * doc.height) / doc.width));

    const texture = new DynamicTexture('signTex', { width: texW, height: texH }, this.scene, true);
    this.drawFace(texture, doc);
    texture.update(false);
    this.texture = texture;

    const rings = ringsFromSubpaths(plateSubpaths(doc), 0.7);
    const { mesh, faceIndexCount } = extrudeRings(rings, doc.width, doc.height, thickness, this.scene);
    mesh.parent = this.root;

    const faceMat = new StandardMaterial('faceMat', this.scene);
    faceMat.diffuseTexture = texture;
    faceMat.emissiveTexture = texture;
    faceMat.emissiveColor = new Color3(0.5, 0.5, 0.5);
    faceMat.diffuseColor = new Color3(1, 1, 1);
    faceMat.specularColor = new Color3(0.16, 0.16, 0.18);
    faceMat.specularPower = 48;
    faceMat.backFaceCulling = false;

    const edgeMat = new StandardMaterial('edgeMat', this.scene);
    edgeMat.diffuseColor = new Color3(0.76, 0.79, 0.82);
    edgeMat.specularColor = new Color3(0.55, 0.57, 0.6);
    edgeMat.specularPower = 96;
    edgeMat.emissiveColor = new Color3(0.05, 0.06, 0.07);

    const mm = new MultiMaterial('signMM', this.scene);
    mm.subMaterials.push(faceMat, edgeMat);
    mesh.material = mm;
    mesh.subMeshes = [];
    const verticesCount = mesh.getTotalVertices();
    if (faceIndexCount > 0) new SubMesh(0, 0, verticesCount, 0, faceIndexCount, mesh);
    const rest = mesh.getTotalIndices() - faceIndexCount;
    if (rest > 0) new SubMesh(1, 0, verticesCount, faceIndexCount, rest, mesh);

    this.plateMesh = mesh;
    this.faceMat = faceMat;
    this.edgeMat = edgeMat;
    this.shadow.addShadowCaster(mesh);
    this.setLighting(this.lighting);
    this.applyCameraPreset(this.mode);
  }

  drawFace(texture, doc) {
    const ctx = texture.getContext();
    ctx.save();
    ctx.clearRect(0, 0, texture.getSize().width, texture.getSize().height);
    ctx.scale(texture.getSize().width / doc.width, texture.getSize().height / doc.height);
    for (const layer of doc.layers) {
      if (layer.visible === false) continue;
      const subs = layerSubpaths(layer, doc);
      if (!subs.length) continue;
      const path = new Path2D();
      for (const s of subs) {
        if (!s.pts.length) continue;
        path.moveTo(s.pts[0].x, s.pts[0].y);
        for (const seg of segmentsOf(s)) {
          if (seg.c1 || seg.c2) {
            const c1 = seg.c1 || seg.p0, c2 = seg.c2 || seg.p3;
            path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, seg.p3.x, seg.p3.y);
          } else path.lineTo(seg.p3.x, seg.p3.y);
        }
        if (s.closed) path.closePath();
      }
      if (layer.kind === 'plate' && !layer.fill) {
        ctx.fillStyle = '#f2f4f7';
        ctx.fill(path, 'evenodd');
        continue;
      }
      if (layer.fill) {
        ctx.fillStyle = layer.fill;
        ctx.fill(path, 'evenodd');
      }
      if (layer.stroke && layer.strokeWidth) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }

  setLighting(mode) {
    this.lighting = mode;
    const hemi = this.scene.getLightByName('hemi');
    const dir = this.scene.getLightByName('dir');
    const gm = this.ground.material;
    const night = mode === 'night';
    this.scene.clearColor = night ? new Color4(0.03, 0.04, 0.06, 1) : new Color4(0.09, 0.11, 0.14, 1);
    hemi.intensity = night ? 0.3 : 0.72;
    hemi.groundColor = night ? new Color3(0.02, 0.03, 0.05) : new Color3(0.16, 0.18, 0.22);
    dir.intensity = night ? 0.12 : 0.85;
    gm.diffuseColor = night ? new Color3(0.05, 0.06, 0.08) : new Color3(0.12, 0.14, 0.17);
    if (this.faceMat) this.faceMat.emissiveColor = night ? new Color3(0.95, 0.95, 0.95) : new Color3(0.5, 0.5, 0.5);
    if (this.edgeMat) this.edgeMat.emissiveColor = night ? new Color3(0.12, 0.13, 0.15) : new Color3(0.05, 0.06, 0.07);
  }

  applyCameraPreset(mode) {
    this.mode = mode;
    const cam = this.camera;
    const presets = {
      front: [0, 0, 4.55],
      perspective: [32, 10, 5.0],
      side15: [15, 5, 4.75],
      side30: [30, 7, 5.05],
      side45: [45, 9, 5.3],
      left: [-32, 10, 5.0],
    };
    const [ya, ba, radius] = presets[mode] || presets.perspective;
    cam.alpha = Math.PI / 2 + deg(ya);
    cam.beta = Math.PI / 2 - deg(ba);
    cam.radius = radius;
    cam.setTarget(Vector3.Zero());
    this.angle = Math.abs(ya);
  }

  /** Signed horizontal viewing angle relative to the plate normal, degrees. */
  signedAngleDeg() {
    // alpha = PI/2 is head-on; measure how far we swung away from it
    let a = ((this.camera.alpha - Math.PI / 2) * 180) / Math.PI;
    a = ((a + 540) % 360) - 180;
    return a;
  }

  snapshot() {
    this.scene.render();
    return this.canvas.toDataURL('image/png');
  }

  disposePlate() {
    if (this.plateMesh) {
      this.shadow.removeShadowCaster(this.plateMesh);
      this.plateMesh.dispose();
      this.plateMesh = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  dispose() {
    window.removeEventListener('resize', this._resize);
    this.disposePlate();
    this.scene.dispose();
    this.engine.dispose();
  }
}

/* ---------- geometry → mesh ---------- */

function extrudeRings(rings, w, h, thickness, scene) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const half = thickness / 2;
  const cx = w / 2, cy = h / 2;
  const to3d = (x, y) => [-(x - cx), -(y - cy)];

  const polygons = groupRings(rings);

  for (const poly of polygons) {
    const { verts, tris } = triangulatePoly(poly);
    if (!verts.length) continue;
    const base = positions.length / 3;
    for (const [x, y] of verts) {
      const [X, Y] = to3d(x, y);
      positions.push(X, Y, half);
      normals.push(0, 0, 1);
      uvs.push(x / w, y / h);
    }
    for (const [a, b, c] of tris) indices.push(base + a, base + c, base + b);
    const base2 = positions.length / 3;
    for (const [x, y] of verts) {
      const [X, Y] = to3d(x, y);
      positions.push(X, Y, -half);
      normals.push(0, 0, -1);
      uvs.push(1 - x / w, y / h);
    }
    for (const [a, b, c] of tris) indices.push(base2 + a, base2 + b, base2 + c);
  }
  const faceIndexCount = indices.length;

  for (const poly of polygons) {
    const ring = dedupeRing(poly.outer);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const [ax, ay] = to3d(p[0], p[1]);
      const [bx, by] = to3d(q[0], q[1]);
      const base = positions.length / 3;
      positions.push(ax, ay, half, bx, by, half, bx, by, -half, ax, ay, -half);
      const nx = by - ay, ny = -(bx - ax);
      const len = Math.hypot(nx, ny) || 1;
      for (let k = 0; k < 4; k++) normals.push(nx / len, ny / len, 0);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const mesh = new Mesh('signPlate', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return { mesh, faceIndexCount };
}

function dedupeRing(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  }
  return out;
}

function triangulatePoly(poly) {
  const verts = [];
  const flat = [];
  poly.outer.forEach((p) => { verts.push(p); flat.push(p[0], p[1]); });
  const holes = [];
  let idx = poly.outer.length;
  for (const hole of poly.holes) {
    holes.push(idx);
    for (const p of hole) { verts.push(p); flat.push(p[0], p[1]); }
    idx += hole.length;
  }
  const tris = earcut(flat, holes.length ? holes : null, 2);
  const out = [];
  for (let i = 0; i < tris.length; i += 3) out.push([tris[i], tris[i + 1], tris[i + 2]]);
  return { verts, tris: out };
}
