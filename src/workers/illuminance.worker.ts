/// <reference lib="webworker" />
import { FLOOR_H, FLOOR_W, SIM_H, SIM_SCALE, SIM_W, ZONES } from '../factory.js';
import { beamExponent, daylightAt, heatColor } from '../lighting.js';
import type { ComputeRequest, ComputeResult, DarkArea, Fixture, Obstacle, ZoneStat } from '../types.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// 阴影场在 1/2 分辨率生成（软阴影本就低频），采样时按米坐标双线性放大
const SH_SCALE = SIM_SCALE / 2;
const SH_W = SIM_W >> 1;
const SH_H = SIM_H >> 1;
const shadowCanvas = new OffscreenCanvas(SH_W, SH_H);
const sg = shadowCanvas.getContext('2d', { willReadFrequently: true })!;

/** 单灯软阴影系数（SH 分辨率，1=无遮挡，0=本影），复用同一画布 */
function buildShadowField(fx: Fixture, obstacles: Obstacle[]): Float32Array {
  const lx = fx.x * SH_SCALE;
  const ly = fx.y * SH_SCALE;
  const stretch = Math.max(1.4, 5.5 - fx.height * 0.7);
  const blur = fx.kind === 'task' ? 3 : 5;
  const cast = 13 * stretch;

  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'source-over';
  sg.globalAlpha = 1;
  sg.fillStyle = '#000';
  sg.fillRect(0, 0, SH_W, SH_H);
  sg.filter = `blur(${blur}px)`;
  sg.fillStyle = '#fff';
  for (const ob of obstacles) {
    const x0 = ob.x * SH_SCALE, y0 = ob.y * SH_SCALE;
    const x1 = (ob.x + ob.w) * SH_SCALE, y1 = (ob.y + ob.h) * SH_SCALE;
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const far = corners.map(([px, py]) => {
      const dx = px - lx, dy = py - ly;
      const len = Math.hypot(dx, dy) || 1;
      return [px + (dx / len) * cast, py + (dy / len) * cast];
    });
    sg.beginPath();
    sg.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) sg.lineTo(corners[i][0], corners[i][1]);
    for (let i = 3; i >= 0; i--) sg.lineTo(far[i][0], far[i][1]);
    sg.closePath();
    sg.fill();
  }
  sg.filter = 'none';

  const reachM = fx.height * Math.tan((Math.min(170, fx.beam) * Math.PI) / 360) * 1.8 + 3;
  const grad = sg.createRadialGradient(lx, ly, 2, lx, ly, reachM * SH_SCALE);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.globalCompositeOperation = 'destination-out';
  sg.fillStyle = grad;
  sg.fillRect(0, 0, SH_W, SH_H);
  sg.globalCompositeOperation = 'source-over';

  const data = sg.getImageData(0, 0, SH_W, SH_H).data;
  const field = new Float32Array(SH_W * SH_H);
  for (let p = 0, i = 3; p < field.length; p++, i += 4) field[p] = 1 - data[i] / 255;
  return field;
}

/** 按“米”坐标双线性采样半分辨率阴影场 */
function sampleShadow(field: Float32Array, mx: number, my: number): number {
  const gx = mx * SH_SCALE;
  const gy = my * SH_SCALE;
  const x0 = gx | 0;
  const y0 = gy | 0;
  if (x0 < 0 || y0 < 0 || x0 >= SH_W || y0 >= SH_H) return 1;
  const tx = gx - x0;
  const ty = gy - y0;
  const x1 = Math.min(SH_W - 1, x0 + 1);
  const y1 = Math.min(SH_H - 1, y0 + 1);
  const i00 = y0 * SH_W + x0;
  const i10 = y0 * SH_W + x1;
  const i01 = y1 * SH_W + x0;
  const i11 = y1 * SH_W + x1;
  const top = field[i00] * (1 - tx) + field[i10] * tx;
  const bot = field[i01] * (1 - tx) + field[i11] * tx;
  return top * (1 - ty) + bot * ty;
}

function zoneStats(lux: Float32Array): { zones: ZoneStat[]; dark: DarkArea[] } {
  const zones: ZoneStat[] = [];
  const dark: DarkArea[] = [];
  for (const z of ZONES) {
    const px0 = Math.floor(z.x * SIM_SCALE);
    const px1 = Math.ceil((z.x + z.w) * SIM_SCALE);
    const py0 = Math.floor(z.y * SIM_SCALE);
    const py1 = Math.ceil((z.y + z.h) * SIM_SCALE);
    let sum = 0, max = 0, min = Infinity, pass = 0, count = 0;
    for (let y = py0; y < py1; y++) {
      for (let x = px0; x < px1; x++) {
        const v = lux[y * SIM_W + x];
        sum += v;
        if (v > max) max = v;
        if (v < min) min = v;
        if (v >= z.threshold) pass++;
        count++;
      }
    }
    const avg = sum / count;
    const stat: ZoneStat = {
      zoneId: z.id, name: z.name, kind: z.kind,
      avgLux: avg, maxLux: max, minLux: min,
      compliance: pass / count, threshold: z.threshold, dark: false,
    };
    if ((z.kind === 'qc' && avg < 300) || (z.kind === 'aisle' && avg < 150)) {
      stat.dark = true;
      dark.push({ zoneId: z.id, name: z.name, kind: z.kind, avgLux: avg, threshold: z.threshold });
    }
    zones.push(stat);
  }
  return { zones, dark };
}

function compute(req: ComputeRequest): ComputeResult {
  const { fixtures, obstacles, windows, hour } = req;
  const active = fixtures.filter((fx) => fx.on);
  const lux = new Float32Array(SIM_W * SIM_H);

  // ---- 灯贡献叠加：每灯只遍历光照包围盒（米坐标），跳过盒外像素 ----
  for (const fx of active) {
    const field = buildShadowField(fx, obstacles);
    const ax = fx.aim?.x ?? fx.x;
    const ay = fx.aim?.y ?? fx.y;
    // 发光轴单位向量：垂直灯为 (0,0,-1)；洗墙灯按指向点倾斜
    let dx = ax - fx.x, dy = ay - fx.y;
    const planLen = Math.hypot(dx, dy);
    const axisLen = Math.hypot(planLen, fx.height);
    dx /= axisLen; dy /= axisLen;
    const dz = -fx.height / axisLen;
    const n = beamExponent(fx.beam);
    const I0 = (fx.flux * (n + 1)) / (2 * Math.PI) * 1.25;
    const h2 = fx.height * fx.height;

    const beamRad = (Math.min(170, fx.beam) * Math.PI) / 360;
    const radiusM = fx.height * Math.tan(beamRad) * 2.2 + 2.5;
    // 包围盒裁剪到厂房
    const mx0 = Math.max(0, fx.x - radiusM);
    const mx1 = Math.min(FLOOR_W, fx.x + radiusM);
    const my0 = Math.max(0, fx.y - radiusM);
    const my1 = Math.min(FLOOR_H, fx.y + radiusM);
    const x0 = Math.floor(mx0 * SIM_SCALE);
    const x1 = Math.ceil(mx1 * SIM_SCALE);
    const y0 = Math.floor(my0 * SIM_SCALE);
    const y1 = Math.ceil(my1 * SIM_SCALE);

    for (let y = y0; y < y1; y++) {
      const py = y / SIM_SCALE;
      const vy = py - fx.y;
      const rowBase = y * SIM_W;
      for (let x = x0; x < x1; x++) {
        const px = x / SIM_SCALE;
        const vx = px - fx.x;
        const vz = -fx.height;
        const d2 = vx * vx + vy * vy + h2;
        const d = Math.sqrt(d2);
        const cosI = (vx * dx + vy * dy + vz * dz) / d;
        if (cosI <= 0) continue;
        const e = directPower(cosI, n);
        if (e <= 0.0002) continue;
        const cosFloor = fx.height / d;
        const shadow = sampleShadow(field, px, py);
        lux[rowBase + x] += (I0 * e * cosFloor / d2) * (0.15 + 0.85 * shadow);
      }
    }
  }

  // ---- 自然光 + 上色 ----
  const heat = new ImageData(SIM_W, SIM_H);
  const rgba = heat.data;
  for (let p = 0; p < lux.length; p++) {
    const px = (p % SIM_W) / SIM_SCALE;
    const py = (p / SIM_W | 0) / SIM_SCALE;
    const total = lux[p] + daylightAt(px, py, windows, hour);
    lux[p] = total;
    const [r, g, b] = heatColor(total);
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
    rgba[p * 4 + 3] = 210;
  }

  const canvas = new OffscreenCanvas(SIM_W, SIM_H);
  canvas.getContext('2d')!.putImageData(heat, 0, 0);
  const bitmap = canvas.transferToImageBitmap();
  const { zones, dark } = zoneStats(lux);

  return {
    type: 'result',
    reqId: req.reqId,
    bitmap,
    lux,
    width: SIM_W,
    height: SIM_H,
    zones,
    darkAreas: dark,
    daylightLux: daylightAt(15, 4, windows, hour),
  };
}

/** cos^n，小指数走 exp/log 更快且数值稳定 */
function directPower(cosI: number, n: number): number {
  if (n >= 1) return cosI ** n;
  return Math.exp(n * Math.log(cosI));
}

ctx.onmessage = (ev: MessageEvent<ComputeRequest>) => {
  if (ev.data.type !== 'compute') return;
  try {
    const result = compute(ev.data);
    (ctx as unknown as Worker).postMessage(result, [result.bitmap, result.lux.buffer]);
  } catch (e) {
    console.error('[illuminance worker]', e);
  }
};
