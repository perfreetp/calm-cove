import { circlePoints, strokeQuads, triangulate } from './geometry';
import type { CameraState } from '../core/scene';
import type { Rig, RGBA, Scene, SceneItem, Vec2 } from '../core/types';

export interface DrawList {
  /** Interleaved [x, y, r, g, b, a] per vertex. */
  vertices: Float32Array;
  vertexCount: number;
  /** Screen-space scale factor, so stroke widths can be kept visually stable. */
  scale: number;
}

export interface DrawOptions {
  showBones: boolean;
  boneAlpha: number;
  showGuides: boolean;
  selectedBoneId?: string | null;
  hoverBoneId?: string | null;
  background?: RGBA;
}

const GRID: RGBA = [1, 1, 1, 0.045];
const BONE_MAIN: RGBA = [0.36, 0.86, 1, 0.95];
const BONE_HOVER: RGBA = [0.98, 0.92, 0.45, 1];
const BONE_SELECTED: RGBA = [0.45, 1, 0.72, 1];
const BONE_VIOLATION: RGBA = [1, 0.28, 0.28, 1];
const JOINT_FILL: RGBA = [0.9, 0.98, 1, 0.9];
const LIMIT_ARC: RGBA = [0.36, 0.86, 1, 0.22];

class TriangleBuilder {
  private data: number[] = [];

  tri(a: Vec2, b: Vec2, c: Vec2, color: RGBA): void {
    this.data.push(
      a.x,
      a.y,
      color[0],
      color[1],
      color[2],
      color[3],
      b.x,
      b.y,
      color[0],
      color[1],
      color[2],
      color[3],
      c.x,
      c.y,
      color[0],
      color[1],
      color[2],
      color[3],
    );
  }

  quad(pts: [Vec2, Vec2, Vec2, Vec2], color: RGBA): void {
    this.tri(pts[0], pts[1], pts[2], color);
    this.tri(pts[0], pts[2], pts[3], color);
  }

  polygon(points: Vec2[], color: RGBA, closed = true): void {
    if (points.length < 3) return;
    const indices = triangulate(points);
    for (let i = 0; i < indices.length; i += 3) {
      this.tri(points[indices[i]], points[indices[i + 1]], points[indices[i + 2]], color);
    }
    if (closed) {
      for (const q of strokeQuads(points, 0.9, true)) this.quad(q, color);
    }
  }

  arc(cx: number, cy: number, r: number, color: RGBA, segments = 20, from = 0, to = Math.PI * 2): void {
    const pts: Vec2[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = from + ((to - from) * i) / segments;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    for (let i = 0; i < segments; i++) {
      this.tri({ x: cx, y: cy }, pts[i], pts[i + 1], color);
    }
  }

  disc(cx: number, cy: number, r: number, color: RGBA, segments = 18): void {
    this.arc(cx, cy, r, color, segments);
  }

  ring(cx: number, cy: number, r: number, width: number, color: RGBA, segments = 28): void {
    const outer = circlePoints(cx, cy, r + width / 2, segments);
    const inner = circlePoints(cx, cy, Math.max(0.2, r - width / 2), segments);
    // Reverse inner so winding matches for stroking-free quad construction.
    const innerRev = [...inner].reverse();
    const idxOuter = triangulate(outer);
    for (let i = 0; i < idxOuter.length; i += 3) {
      this.tri(outer[idxOuter[i]], outer[idxOuter[i + 1]], outer[idxOuter[i + 2]], color);
    }
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const o0 = { x: cx + Math.cos(a0) * (r + width / 2), y: cy + Math.sin(a0) * (r + width / 2) };
      const o1 = { x: cx + Math.cos(a1) * (r + width / 2), y: cy + Math.sin(a1) * (r + width / 2) };
      const i0 = {
        x: cx + Math.cos(a0) * Math.max(0.2, r - width / 2),
        y: cy + Math.sin(a0) * Math.max(0.2, r - width / 2),
      };
      const i1 = {
        x: cx + Math.cos(a1) * Math.max(0.2, r - width / 2),
        y: cy + Math.sin(a1) * Math.max(0.2, r - width / 2),
      };
      this.tri(o0, o1, i1, color);
      this.tri(o0, i1, i0, color);
    }
    void innerRev;
  }

  line(a: Vec2, b: Vec2, width: number, color: RGBA): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    this.quad(
      [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
      ],
      color,
    );
  }

  finish(): DrawList {
    return {
      vertices: new Float32Array(this.data),
      vertexCount: this.data.length / 6,
      scale: 1,
    };
  }
}

function withAlpha(color: RGBA, alpha: number): RGBA {
  return [color[0], color[1], color[2], color[3] * alpha];
}

function drawItem(b: TriangleBuilder, item: SceneItem): void {
  if (item.fill && item.closed && item.points.length >= 3) {
    const indices = triangulate(item.points);
    for (let i = 0; i < indices.length; i += 3) {
      b.tri(item.points[indices[i]], item.points[indices[i + 1]], item.points[indices[i + 2]], item.fill);
    }
  }
  if (item.stroke && (item.strokeWidth ?? 0) > 0) {
    if (item.dashed) {
      drawDashedPolyline(b, item.points, item.closed, item.strokeWidth ?? 1, item.stroke);
    } else {
      const q = strokeQuads(item.points, item.strokeWidth ?? 1, item.closed);
      for (const quad of q) b.quad(quad, item.stroke);
    }
  }
}

function drawDashedPolyline(b: TriangleBuilder, points: Vec2[], closed: boolean, width: number, color: RGBA): void {
  const segs = closed ? points.length : points.length - 1;
  const dash = 9;
  const gap = 7;
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const c = points[(i + 1) % points.length];
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (len < 1e-6) continue;
    const steps = Math.max(1, Math.ceil(len / (dash + gap)));
    const stepLen = len / steps;
    for (let s = 0; s < steps; s++) {
      const t0 = (s * stepLen) / len;
      const t1 = Math.min(1, (s * stepLen + dash) / len);
      b.line(
        { x: a.x + (c.x - a.x) * t0, y: a.y + (c.y - a.y) * t0 },
        { x: a.x + (c.x - a.x) * t1, y: a.y + (c.y - a.y) * t1 },
        width,
        color,
      );
    }
  }
}

function drawGrid(b: TriangleBuilder, rig: Rig): void {
  const step = 100;
  for (let x = 0; x <= rig.rigWidth; x += step) {
    b.line({ x, y: 0 }, { x, y: rig.rigHeight }, 0.7, GRID);
  }
  for (let y = 0; y <= rig.rigHeight; y += step) {
    b.line({ x: 0, y }, { x: rig.rigWidth, y }, 0.7, GRID);
  }
}

function drawBones(b: TriangleBuilder, scene: Scene, options: DrawOptions, cameraScale: number): void {
  const alpha = Math.max(0, Math.min(1, options.boneAlpha));
  const px = 1 / Math.max(0.0001, cameraScale);

  for (const sb of scene.bones) {
    const selected = options.selectedBoneId === sb.bone.id;
    const hovered = options.hoverBoneId === sb.bone.id;
    const color = sb.violating
      ? withAlpha(BONE_VIOLATION, alpha)
      : selected
        ? withAlpha(BONE_SELECTED, alpha)
        : hovered
          ? withAlpha(BONE_HOVER, alpha)
          : withAlpha(BONE_MAIN, 0.55 * alpha);

    // Joint range arc: a light wedge showing allowed sweep.
    const from = sb.parentAngle + sb.bone.visualAngle + sb.bone.minAngle;
    const to = sb.parentAngle + sb.bone.visualAngle + sb.bone.maxAngle;
    b.arc(
      sb.pivot.x,
      sb.pivot.y,
      Math.max(28 * px, 26),
      withAlpha(LIMIT_ARC, alpha * (selected ? 0.9 : 0.45)),
      18,
      (from * Math.PI) / 180,
      (to * Math.PI) / 180,
    );

    b.line(sb.pivot, sb.tip, (selected ? 3.4 : 2.2) * px, color);
    if (selected) {
      b.line(sb.pivot, sb.tip, 7 * px, withAlpha(color, 0.18));
    }
    b.disc(sb.pivot.x, sb.pivot.y, (selected ? 7 : 4.5) * px, JOINT_FILL);
    b.ring(sb.pivot.x, sb.pivot.y, (selected ? 9 : 6) * px, 1.4 * px, color, 20);
  }
}

export interface BuildDrawListInput {
  scene: Scene;
  rig: Rig;
  camera: CameraState;
  viewport: { x: number; y: number };
  options: DrawOptions;
}

export function buildDrawList({ scene, rig, viewport, options }: BuildDrawListInput): DrawList {
  const b = new TriangleBuilder();
  if (options.showGuides) drawGrid(b, rig);

  const sorted = [...scene.items].sort((a, c) => a.z - c.z);
  for (const item of sorted) drawItem(b, item);

  if (options.showBones) {
    const scale = fitScale(viewport, rig, 1);
    drawBones(b, scene, options, scale);
  }

  const list = b.finish();
  list.scale = fitScale(viewport, rig, 1);
  return list;
}

export function fitScale(viewport: { x: number; y: number }, rig: Rig, zoom: number): number {
  if (viewport.x <= 0 || viewport.y <= 0) return 1;
  return Math.min(viewport.x / rig.rigWidth, viewport.y / rig.rigHeight) * zoom;
}

export { TriangleBuilder, withAlpha };
