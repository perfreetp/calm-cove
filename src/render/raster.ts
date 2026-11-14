import { samplePose } from '../core/animation';
import { transformPoint, worldTransforms } from '../core/skeleton';
import type { Rig, TrackMap } from '../core/types';

/**
 * Rasterise the rig polygons into an RGBA buffer at the given resolution.
 * Used to generate real PNG sequence frames for delivery packages without
 * needing a DOM canvas (so it also runs in tests / headless export).
 */
export function rasterizeParts(
  rig: Rig,
  tracks: TrackMap,
  time: number,
  width: number,
  height: number,
  background: [number, number, number, number] = [0, 0, 0, 0],
): Uint8Array {
  const buffer = new Uint8Array(width * height * 4);
  if (background[3] > 0) {
    for (let i = 0; i < width * height; i++) {
      buffer[i * 4] = background[0] * 255;
      buffer[i * 4 + 1] = background[1] * 255;
      buffer[i * 4 + 2] = background[2] * 255;
      buffer[i * 4 + 3] = background[3] * 255;
    }
  }
  const scale = Math.min(width / rig.rigWidth, height / rig.rigHeight);
  const offX = (width - rig.rigWidth * scale) / 2;
  const offY = (height - rig.rigHeight * scale) / 2;
  const worlds = worldTransforms(rig.bones, samplePose(tracks, time));

  const ordered = rig.parts
    .filter((p) => p.visible)
    .slice()
    .sort((a, b) => a.z - b.z);
  for (const part of ordered) {
    const world = worlds.get(part.boneId);
    if (!world) continue;
    const pts = part.points.map((p) => {
      const t = transformPoint(world, p);
      return { x: t.x * scale + offX, y: t.y * scale + offY };
    });
    fillPolygon(buffer, width, height, pts, part.fill);
    if (part.strokeWidth > 0) {
      strokePolygon(buffer, width, height, pts, part.strokeWidth * scale, part.stroke);
    }
  }
  return buffer;
}

function fillPolygon(
  buffer: Uint8Array,
  width: number,
  height: number,
  pts: Array<{ x: number; y: number }>,
  color: [number, number, number, number],
): void {
  if (pts.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const scan = y + 0.5;
    const nodes: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan)) {
        nodes.push(a.x + ((scan - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    nodes.sort((m, n) => m - n);
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      const xa = Math.max(0, Math.ceil(nodes[i] - 0.5));
      const xb = Math.min(width - 1, Math.floor(nodes[i + 1] - 0.5));
      for (let x = xa; x <= xb; x++) {
        blend(buffer, (y * width + x) * 4, color);
      }
    }
  }
}

function blend(buffer: Uint8Array, offset: number, color: [number, number, number, number]): void {
  const sa = Math.max(0, Math.min(1, color[3]));
  const da = buffer[offset + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 1e-6) return;
  buffer[offset] = (color[0] * 255 * sa + buffer[offset] * da * (1 - sa)) / outA;
  buffer[offset + 1] = (color[1] * 255 * sa + buffer[offset + 1] * da * (1 - sa)) / outA;
  buffer[offset + 2] = (color[2] * 255 * sa + buffer[offset + 2] * da * (1 - sa)) / outA;
  buffer[offset + 3] = outA * 255;
}

function strokePolygon(
  buffer: Uint8Array,
  width: number,
  height: number,
  pts: Array<{ x: number; y: number }>,
  thickness: number,
  color: [number, number, number, number],
): void {
  const half = Math.max(0.5, thickness / 2);
  const steps = Math.max(1, Math.ceil(half - 0.5));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      for (let dy = -steps; dy <= steps; dy++) {
        for (let dx = -steps; dx <= steps; dx++) {
          if (dx * dx + dy * dy > half * half) continue;
          const px = Math.round(x + dx);
          const py = Math.round(y + dy);
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          blend(buffer, (py * width + px) * 4, color);
        }
      }
    }
  }
}
