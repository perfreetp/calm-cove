// 内置护士角色分层拆件的程序化贴图生成

const SKIN = '#f2c9a0';
const SKIN_DARK = '#d9a878';
const SCRUB = '#7fb3d5';
const SCRUB_DARK = '#5b93b8';
const CAP = '#ffffff';
const CAP_RED = '#d9534f';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const SCENE_W = 640;
export const SCENE_H = 480;

type BuiltinDrawer = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const drawers: Record<string, BuiltinDrawer> = {
  torso: (ctx, w, h) => {
    // 洗手衣躯干,pivot 在底部中央
    ctx.fillStyle = SCRUB;
    roundRect(ctx, w * 0.12, 0, w * 0.76, h * 0.92, 18);
    ctx.fill();
    ctx.fillStyle = SCRUB_DARK;
    ctx.fillRect(w * 0.46, 0, w * 0.08, h * 0.55); // 门襟
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, w * 0.2, h * 0.12, w * 0.22, h * 0.2, 8);
    ctx.fill();
    // 领口
    ctx.fillStyle = SCRUB_DARK;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.06, w * 0.16, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  head: (ctx, w, h) => {
    // 脖子
    ctx.fillStyle = SKIN_DARK;
    ctx.fillRect(w * 0.38, h * 0.82, w * 0.24, h * 0.16);
    // 脸
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, w * 0.36, 0, Math.PI * 2);
    ctx.fill();
    // 五官
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.arc(w * 0.38, h * 0.4, 2.4, 0, Math.PI * 2);
    ctx.arc(w * 0.62, h * 0.4, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b07a52';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.5, w * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // 护士帽
    ctx.fillStyle = CAP;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.18);
    ctx.quadraticCurveTo(w / 2, -h * 0.08, w * 0.8, h * 0.18);
    ctx.lineTo(w * 0.74, h * 0.26);
    ctx.lineTo(w * 0.26, h * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CAP_RED;
    ctx.fillRect(w * 0.42, h * 0.08, w * 0.16, h * 0.07);
  },
  upperArm: (ctx, w, h) => {
    // 袖子,pivot 在肩部(底部)
    ctx.fillStyle = SCRUB;
    roundRect(ctx, w * 0.18, 0, w * 0.64, h * 0.9, 14);
    ctx.fill();
    ctx.fillStyle = SCRUB_DARK;
    ctx.fillRect(w * 0.18, h * 0.82, w * 0.64, h * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(w * 0.26, h * 0.08, w * 0.1, h * 0.6);
  },
  forearm: (ctx, w, h) => {
    // 前臂(裸露皮肤),pivot 在肘部(底部)
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, SKIN_DARK);
    grad.addColorStop(0.5, SKIN);
    grad.addColorStop(1, SKIN_DARK);
    ctx.fillStyle = grad;
    roundRect(ctx, w * 0.24, 0, w * 0.52, h * 0.92, 12);
    ctx.fill();
  },
  hand: (ctx, w, h) => {
    // 手掌,pivot 在腕部(顶部)
    ctx.fillStyle = SKIN;
    roundRect(ctx, w * 0.18, h * 0.08, w * 0.64, h * 0.8, 10);
    ctx.fill();
    ctx.fillStyle = SKIN_DARK;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(w * (0.2 + i * 0.16), h * 0.78, w * 0.09, h * 0.2);
    }
    ctx.fillStyle = SKIN;
    roundRect(ctx, w * 0.02, h * 0.28, w * 0.22, h * 0.34, 8);
    ctx.fill(); // 拇指
  },
};

export function builtinTexture(key: string, width: number, height: number): HTMLCanvasElement {
  const c = makeCanvas(width, height);
  const ctx = c.getContext('2d')!;
  const drawer = drawers[key];
  if (!drawer) {
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, width, height);
  } else {
    drawer(ctx, width, height);
  }
  return c;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('拆件图片加载失败'));
    img.src = src;
  });
}
