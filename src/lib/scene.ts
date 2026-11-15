import type { AnimationDoc, PartDef } from '../types';
import { evaluatePose, sampleTrack, type BonePose } from './animation';
import { builtinTexture, loadImage, SCENE_H, SCENE_W } from '../renderer/textures';
import { getMetric } from '../data/constants';

export interface QuadPrim {
  image: CanvasImageSource;
  x: number;
  y: number;
  angleDeg: number;
  pivotX: number;
  pivotY: number;
  w: number;
  h: number;
  alpha: number;
  tint: string | null;
}

export interface LinePrim {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  dashed: boolean;
}

export interface TextPrim {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  align: 'left' | 'center';
}

export interface Scene {
  quads: QuadPrim[];
  lines: LinePrim[];
  texts: TextPrim[];
  background: string;
}

const imageCache = new Map<string, HTMLCanvasElement | HTMLImageElement>();

async function partImage(part: PartDef): Promise<CanvasImageSource | null> {
  if (part.src) {
    let img = imageCache.get(part.src);
    if (!img) {
      img = await loadImage(part.src);
      imageCache.set(part.src, img);
    }
    return img;
  }
  if (part.builtin) {
    const key = `builtin:${part.builtin}:${part.width}x${part.height}`;
    let tex = imageCache.get(key);
    if (!tex) {
      tex = builtinTexture(part.builtin, part.width, part.height);
      imageCache.set(key, tex);
    }
    return tex;
  }
  return null;
}

/** 异步预加载全部拆件贴图(WebGPU 上传与 2D 绘制前调用) */
export async function preloadPartImages(doc: AnimationDoc): Promise<void> {
  await Promise.all(doc.parts.map((p) => partImage(p)));
}

function nodeAt(doc: AnimationDoc, time: number): string | null {
  for (const [nodeId, r] of Object.entries(doc.nodeRanges)) {
    if (time >= r.start - 1e-6 && time <= r.end + 1e-6) return nodeId;
  }
  return null;
}

function boneEnd(pose: BonePose, length: number): { x: number; y: number } {
  // 骨长仅用于绘制骨链参考线,缩短到不穿出画面
  const rad = (pose.worldAngle * Math.PI) / 180;
  const drawLen = Math.min(length, 34);
  return {
    x: pose.wx + drawLen * Math.cos(rad),
    y: pose.wy + drawLen * Math.sin(rad),
  };
}

/** 同步构建场景(贴图需已预加载) */
export function buildScene(
  doc: AnimationDoc,
  time: number,
  opts: { showSkeleton: boolean; showGuides: boolean },
): Scene {
  const poses = evaluatePose(doc, time);
  const quads: QuadPrim[] = [];
  const lines: LinePrim[] = [];
  const texts: TextPrim[] = [];
  const currentNode = nodeAt(doc, time);

  // 拆件按 zOrder 排序绘制
  const sortedParts = [...doc.parts].sort((a, b) => a.zOrder - b.zOrder);
  for (const part of sortedParts) {
    if (!part.boneId) continue;
    const pose = poses.get(part.boneId);
    if (!pose) continue;
    let image: CanvasImageSource | null = null;
    if (part.src) image = imageCache.get(part.src) ?? null;
    else if (part.builtin)
      image = imageCache.get(`builtin:${part.builtin}:${part.width}x${part.height}`) ?? null;
    if (!image) continue;
    quads.push({
      image,
      x: pose.wx,
      y: pose.wy,
      angleDeg: pose.worldAngle,
      pivotX: part.pivotX,
      pivotY: part.pivotY,
      w: part.width,
      h: part.height,
      alpha: 1,
      tint: pose.clamped ? 'rgba(220,53,69,0.28)' : null,
    });
  }

  // 骨骼层
  if (opts.showSkeleton) {
    for (const bone of doc.bones) {
      const pose = poses.get(bone.id);
      if (!pose) continue;
      const end = boneEnd(pose, bone.length);
      lines.push({
        x1: pose.wx,
        y1: pose.wy,
        x2: end.x,
        y2: end.y,
        color: pose.clamped ? '#dc3545' : '#2f80ed',
        width: 3,
        dashed: false,
      });
      lines.push({
        x1: pose.wx - 5,
        y1: pose.wy - 5,
        x2: pose.wx + 5,
        y2: pose.wy + 5,
        color: '#11407a',
        width: 2,
        dashed: false,
      });
      lines.push({
        x1: pose.wx + 5,
        y1: pose.wy - 5,
        x2: pose.wx - 5,
        y2: pose.wy + 5,
        color: '#11407a',
        width: 2,
        dashed: false,
      });
      texts.push({
        x: pose.wx + 8,
        y: pose.wy - 8,
        text: bone.name,
        color: '#11407a',
        size: 11,
        align: 'left',
      });
    }
  }

  // 进针:穿刺针 + 角度规范区(15°~30°)
  const hand = poses.get('hand');
  const forearm = poses.get('forearm');
  if (hand && forearm && currentNode === 'insert') {
    const angleMetric = getMetric('needleAngle');
    const needleAngle = sampleTrack(doc.keyframes, 'needleAngle', time);
    const skinDir = (forearm.worldAngle * Math.PI) / 180;
    const hx = hand.wx;
    const hy = hand.wy;
    if (opts.showGuides) {
      // 规范角度锥
      for (const deg of [angleMetric.min, angleMetric.max]) {
        const rad = skinDir + (deg * Math.PI) / 180;
        lines.push({
          x1: hx,
          y1: hy,
          x2: hx + 90 * Math.cos(rad),
          y2: hy + 90 * Math.sin(rad),
          color: 'rgba(40,167,69,0.75)',
          width: 1.5,
          dashed: true,
        });
      }
    }
    if (needleAngle !== null) {
      const inRange = needleAngle >= angleMetric.min && needleAngle <= angleMetric.max;
      const rad = skinDir + (needleAngle * Math.PI) / 180;
      lines.push({
        x1: hx,
        y1: hy,
        x2: hx + 70 * Math.cos(rad),
        y2: hy + 70 * Math.sin(rad),
        color: inRange ? '#1a7f37' : '#dc3545',
        width: 4,
        dashed: false,
      });
      // 针柄
      lines.push({
        x1: hx - 10 * Math.cos(rad),
        y1: hy - 10 * Math.sin(rad),
        x2: hx + 6 * Math.cos(rad),
        y2: hy + 6 * Math.sin(rad),
        color: '#555',
        width: 7,
        dashed: false,
      });
      texts.push({
        x: hx + 78 * Math.cos(rad),
        y: hy + 78 * Math.sin(rad),
        text: `进针角度 ${needleAngle.toFixed(1)}°(规范 15~30°)`,
        color: inRange ? '#1a7f37' : '#dc3545',
        size: 12,
        align: 'left',
      });
    }
  }

  // 按压:力度指示
  if (hand && currentNode === 'press') {
    const forceMetric = getMetric('pressForce');
    const force = sampleTrack(doc.keyframes, 'pressForce', time);
    if (force !== null) {
      const inRange = force >= forceMetric.min && force <= forceMetric.max;
      const color = inRange ? '#1a7f37' : '#dc3545';
      // 按压箭头
      for (let i = 0; i < 3; i++) {
        lines.push({
          x1: hand.wx - 14 + i * 14,
          y1: hand.wy + 18,
          x2: hand.wx - 14 + i * 14,
          y2: hand.wy + 34,
          color,
          width: 2,
          dashed: false,
        });
      }
      // 力度条
      const barX = 20;
      const barY = SCENE_H - 34;
      lines.push({ x1: barX, y1: barY, x2: barX + 160, y2: barY, color: '#999', width: 6, dashed: false });
      lines.push({
        x1: barX,
        y1: barY,
        x2: barX + 160 * Math.min(1, force / 5),
        y2: barY,
        color,
        width: 6,
        dashed: false,
      });
      texts.push({
        x: barX,
        y: barY - 8,
        text: `按压力度 ${force.toFixed(1)} 级(规范 2~4 级)`,
        color,
        size: 12,
        align: 'left',
      });
    }
  }

  // 消毒:螺旋擦拭提示圈
  if (hand && currentNode === 'disinfect') {
    lines.push({
      x1: hand.wx - 22,
      y1: hand.wy,
      x2: hand.wx + 22,
      y2: hand.wy,
      color: 'rgba(138,43,226,0.7)',
      width: 1.5,
      dashed: true,
    });
    lines.push({
      x1: hand.wx,
      y1: hand.wy - 22,
      x2: hand.wx,
      y2: hand.wy + 22,
      color: 'rgba(138,43,226,0.7)',
      width: 1.5,
      dashed: true,
    });
  }

  // 当前节点名
  if (currentNode) {
    const name = currentNode;
    texts.push({ x: 14, y: 24, text: `当前动作:${nodeLabel(name)}`, color: '#0d3b66', size: 15, align: 'left' });
    texts.push({ x: SCENE_W - 14, y: 24, text: `t = ${time.toFixed(1)}s`, color: '#666', size: 13, align: 'left' });
  }

  return { quads, lines, texts, background: '#f7f9fc' };
}

function nodeLabel(id: string): string {
  const map: Record<string, string> = {
    disinfect: '消毒',
    insert: '进针',
    fix: '固定',
    withdraw: '拔针',
    press: '按压',
  };
  return map[id] ?? id;
}
