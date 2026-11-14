import type { Fixture } from './types.js';

/** 光束角（全角）-> 余弦指数 n：半强度方向 cos(theta)=cos(beam/2) */
export function beamExponent(beamDeg: number): number {
  const half = (Math.max(5, Math.min(170, beamDeg)) * Math.PI) / 180 / 2;
  return Math.max(0.05, Math.log(0.5) / Math.log(Math.cos(half)));
}

/** 单灯在地面点的直射照度（lux），含 cos 三次方定律；aim 决定发光轴方向 */
export function directLux(
  fx: Fixture, px: number, py: number,
): number {
  if (!fx.on) return 0;
  const ax = fx.aim?.x ?? fx.x;
  const ay = fx.aim?.y ?? fx.y;
  // 发光轴单位向量（从灯指向地面目标点）
  let dx = ax - fx.x;
  let dy = ay - fx.y;
  let dz = -fx.height;
  const al = Math.hypot(dx, dy, dz) || 1;
  dx /= al; dy /= al; dz /= al;

  // 灯 -> 受光点
  const vx = px - fx.x;
  const vy = py - fx.y;
  const vz = -fx.height;
  const d = Math.hypot(vx, vy, vz);
  if (d < 0.05) return 0;
  const cosI = (vx * dx + vy * dy + vz * dz) / d; // 光线与发光轴夹角余弦
  if (cosI <= 0.02) return 0;
  const n = beamExponent(fx.beam);
  const cosFloor = fx.height / d; // 入射角（相对地面法线）余弦
  // I0 按光域总通量 = 光通量标定：
  // Φ = ∫ I0·cos^nθ dΩ = 2π·I0/(n+1)  =>  I0 = Φ·(n+1)/(2π)
  const I0 = (fx.flux * (n + 1)) / (2 * Math.PI);
  // 1.25 = 室内墙面/顶棚反射光的利用系数（UF 近似）
  return (1.25 * I0 * cosI ** n * cosFloor) / (d * d);
}

/** 太阳高度角（弧度）：8 点/20 点近地平线，14 点正午最高 */
export function sunElevation(hour: number): number {
  const t = (hour - 8) / 12; // 0..1
  return Math.sin(t * Math.PI) * (65 * Math.PI / 180);
}

/** 窗户自然光在某点的贡献：北墙窗带向南衰减，按太阳高度调制 */
export function daylightAt(
  px: number, py: number,
  windows: { x: number; y: number; w: number; h: number }[],
  hour: number,
): number {
  const elev = sunElevation(hour);
  if (elev <= 0.02) return 0;
  const strength = Math.sin(elev); // 0..1
  let lux = 0;
  for (const win of windows) {
    // 点到窗带的横向包含与纵向距离
    const cx = Math.max(win.x, Math.min(px, win.x + win.w));
    const reach = Math.max(0, py - (win.y + win.h));
    const lateral = Math.abs(px - cx);
    const inBand = lateral < win.w / 2 + 2.5;
    if (!inBand) continue;
    const depth = 1 / (1 + reach * 0.55);          // 进深衰减
    const lateralFade = Math.max(0, 1 - lateral / (win.w / 2 + 2.5));
    lux += 4500 * strength * depth * lateralFade; // 窗面峰值约 4500 lux
  }
  return lux;
}

/** 时段自然光色温 K */
export function daylightCct(hour: number): number {
  const elev = sunElevation(hour);
  return Math.round(3500 + 3000 * Math.max(0, Math.sin(elev)));
}

/** 色温 K -> 显示用 RGB（普朗克轨迹近似，暖色偏黄、冷色偏蓝） */
export function cctToRgb(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(12000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * t ** -0.1332;
    g = 288.12 * t ** -0.0755;
    b = 255;
  }
  return [clamp255(r), clamp255(g), clamp255(b)];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 照度 -> 色阶（蓝<50 青<150 绿<300 黄<500 橙<800 红>=800），对数刻度 */
const RAMP: { lux: number; rgb: [number, number, number] }[] = [
  { lux: 0,   rgb: [18, 32, 92] },
  { lux: 30,  rgb: [38, 96, 168] },
  { lux: 80,  rgb: [52, 160, 190] },
  { lux: 150, rgb: [62, 190, 140] },
  { lux: 300, rgb: [130, 205, 90] },
  { lux: 500, rgb: [235, 210, 70] },
  { lux: 800, rgb: [235, 130, 45] },
  { lux: 1400, rgb: [220, 55, 45] },
];

export function heatColor(lux: number): [number, number, number] {
  const l = Math.log10(1 + Math.max(0, lux));
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i];
    const b = RAMP[i + 1];
    const la = Math.log10(1 + a.lux);
    const lb = Math.log10(1 + b.lux);
    if (l <= lb) {
      const t = (l - la) / Math.max(1e-9, lb - la);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
      ];
    }
  }
  return RAMP[RAMP.length - 1].rgb;
}

/** 色阶图例档位 */
export const LEGEND = RAMP.map((r) => r.lux);
