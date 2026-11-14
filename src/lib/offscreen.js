// OffscreenCanvas 渲染管线：每块画布背后有一个常驻 OffscreenCanvas，
// 绘制在离屏上下文完成，再一次性 blit 到可见画布，减少主线程合成抖动。

const pool = new Map();

export function offscreenFor(canvas) {
  const w = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
  const h = Math.max(1, Math.round(canvas.clientHeight * (window.devicePixelRatio || 1)));
  let rec = pool.get(canvas);
  if (!rec) {
    rec = { canvas: null, ctx: null, w: 0, h: 0 };
    pool.set(canvas, rec);
  }
  if (rec.w !== w || rec.h !== h || !rec.ctx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      rec.canvas = new OffscreenCanvas(w, h);
    } else {
      rec.canvas = document.createElement('canvas');
    }
    rec.canvas.width = w;
    rec.canvas.height = h;
    rec.ctx = rec.canvas.getContext('2d');
    rec.w = w;
    rec.h = h;
  }
  return rec;
}

export function blit(canvas, rec) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (canvas.width !== rec.w || canvas.height !== rec.h) {
    canvas.width = rec.w;
    canvas.height = rec.h;
  }
  ctx.clearRect(0, 0, rec.w, rec.h);
  ctx.drawImage(rec.canvas, 0, 0);
}

/** 便捷封装：在离屏画布上执行 draw，然后合成到可见画布 */
export function paint(canvas, draw) {
  if (!canvas || !canvas.isConnected) return;
  const rec = offscreenFor(canvas);
  const dpr = window.devicePixelRatio || 1;
  draw(rec.ctx, rec.w / dpr, rec.h / dpr, dpr);
  blit(canvas, rec);
}

export function offscreenAvailable() {
  return typeof OffscreenCanvas !== 'undefined';
}
