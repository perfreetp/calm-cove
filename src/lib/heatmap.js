// 热力图与等照度线：d3 负责配色与等值面，SVG 承载全部图形

import * as d3 from 'd3';
import { LUX_STOPS } from './modes.js';

const ramp = d3
  .scaleLinear()
  .domain(LUX_STOPS.map((s) => s.v))
  .range(LUX_STOPS.map((s) => s.color))
  .interpolate(d3.interpolateRgb)
  .clamp(true);

export function luxCss(v) {
  return ramp(Math.max(0, v));
}

/**
 * 把网格照度画进离屏 canvas，返回 dataURL，供 SVG <image> 放大平滑显示。
 * tintAmt 控制色温染色强度；shadowAmt 控制遮挡阴影压暗强度。
 */
export function heatDataUrl(r, { tintAmt = 0.3, shadowAmt = 0.8 } = {}) {
  const { nx, ny, values, tint, shadow, valid } = r;
  const canvas = document.createElement('canvas');
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(nx, ny);
  const data = img.data;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const o = k * 4;
      if (valid && !valid[k]) {
        data[o] = 12; data[o + 1] = 18; data[o + 2] = 24; data[o + 3] = 255;
        continue;
      }
      const v = values[k];
      const c = d3.rgb(ramp(v));
      let cr = c.r, cg = c.g, cb = c.b;
      if (tint) {
        const tr = tint.r[k], tg = tint.g[k], tb = tint.b[k];
        // 由色温得到相对染色（归一化到最大通道）
        const mx = Math.max(tr, tg, tb) || 1;
        cr = cr * (1 - tintAmt) + (tr / mx) * 255 * tintAmt;
        cg = cg * (1 - tintAmt) + (tg / mx) * 255 * tintAmt;
        cb = cb * (1 - tintAmt) + (tb / mx) * 255 * tintAmt;
      } else {
        // 无照度处也不要纯黑，保留一点冷色
        const lift = Math.min(1, v / 20);
        cr = cr * lift + 10 * (1 - lift);
        cg = cg * lift + 16 * (1 - lift);
        cb = cb * lift + 24 * (1 - lift);
      }
      if (shadow && shadowAmt > 0) {
        const s = shadow[k] || 0;
        const f = 1 - shadowAmt * 0.75 * s;
        cr *= f; cg *= f; cb *= f;
      }
      data[o] = Math.max(0, Math.min(255, cr));
      data[o + 1] = Math.max(0, Math.min(255, cg));
      data[o + 2] = Math.max(0, Math.min(255, cb));
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * 等照度线：d3.contours 生成多级等值面，d3.geoPath 转成网格坐标路径。
 * 返回 [{ level, d }]，调用方在 <g transform=scale(cell)> 中绘制。
 */
export function contourPaths(r, levels = [50, 100, 150, 200, 300, 500]) {
  const values = Array.from(r.values);
  // d3.contours 需要按行铺开的数值数组，y 轴与数组顺序一致
  const gen = d3.contours().size([r.nx, r.ny]);
  const polys = gen.thresholds(levels)(values);
  const path = d3.geoPath();
  return polys
    .filter((p) => p.coordinates.length)
    .map((p) => ({ level: p.value, d: path(p) }))
    .filter((p) => p.d);
}

/** 暗区遮罩：仅把低于阈值的有效网格染成红色，避免用大包围盒盖住图纸 */
export function darkMaskDataUrl(r, threshold, alpha = 92) {
  const { nx, ny, values, valid, pit } = r;
  const c = document.createElement('canvas');
  c.width = nx; c.height = ny;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(nx, ny);
  for (let k = 0; k < nx * ny; k++) {
    const o = k * 4;
    const blocked = valid && !valid[k];
    const isPit = pit && pit[k];
    const dark = !blocked && !isPit && values[k] < threshold;
    img.data[o] = 239;
    img.data[o + 1] = 70;
    img.data[o + 2] = 70;
    img.data[o + 3] = dark ? alpha : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

