import type { GateLine, Obstacle, RouteCourse, Vec2 } from './types';
import { facingVectors } from './geometry';

export type CameraMode = 'top' | 'rider';

export interface Camera {
  mode: CameraMode;
  /** 俯视:画面中心;骑手:相机位置 */
  x: number;
  y: number;
  /** 俯视缩放 px/m;骑手视角高度 */
  zoom: number;
  /** 骑手视角朝向角 */
  heading: number;
  fov: number;
}

export interface RenderOptions {
  highlightIds?: Set<string>;
  showConflicts?: boolean;
  showStrides?: boolean;
  selectedId?: string | null;
}

export interface Renderer {
  readonly backend: 'webgpu' | 'canvas2d';
  render(course: RouteCourse, cam: Camera, opts: RenderOptions): void;
  resize(w: number, h: number, dpr: number): void;
  /** 屏幕坐标 -> 世界坐标(俯视用于拖拽) */
  screenToWorld(sx: number, sy: number, cam: Camera): Vec2;
  dispose(): void;
}

// ---------- 相机投影 ----------
export function makeCamera(mode: CameraMode, course: RouteCourse): Camera {
  const { length, width } = course.params.field;
  if (mode === 'top') {
    return { mode, x: length / 2, y: width / 2, zoom: 1, heading: 0, fov: Math.PI / 3 };
  }
  const first = course.obstacles[0];
  const f = facingVectors(first.angle).forward;
  return {
    mode,
    x: first.position.x - f.x * 12,
    y: first.position.y - f.y * 12,
    zoom: 2.2,
    heading: first.angle,
    fov: Math.PI / 2.6,
  };
}

/** 世界(米) -> 裁剪空间,两种相机共用 */
function project(p: Vec2, cam: Camera, w: number, h: number): { sx: number; sy: number; depth: number } {
  if (cam.mode === 'top') {
    const sx = w / 2 + (p.x - cam.x) * cam.zoom;
    const sy = h / 2 + (p.y - cam.y) * cam.zoom;
    return { sx, sy, depth: 0 };
  }
  // 骑手视角:以相机为原点,heading 为前进方向的透视投影
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const c = Math.cos(-cam.heading);
  const s = Math.sin(-cam.heading);
  const forward = dx * c - dy * s;
  const side = dx * s + dy * c;
  const eyeH = cam.zoom;
  if (forward <= 0.3) return { sx: NaN, sy: NaN, depth: forward };
  const focal = h / (2 * Math.tan(cam.fov / 2));
  const sx = w / 2 + (side / forward) * focal;
  const sy = h / 2 - (eyeH / forward) * focal;
  return { sx, sy, depth: forward };
}

// ---------- WebGPU 实现 ----------
const WGSL = /* wgsl */ `
struct Uniforms { view: mat4x4<f32>, proj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSIn {
  @location(0) pos: vec3<f32>,
  @location(1) color: vec3<f32>,
};
struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) color: vec3<f32>,
};
@vertex
fn vs(in: VSIn) -> VSOut {
  var o: VSOut;
  o.clip = u.proj * u.view * vec4<f32>(in.pos, 1.0);
  o.color = in.color;
  return o;
}
@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
`;

interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  const gpu = navigator.gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        const context = canvas.getContext('webgpu') as GPUCanvasContext;
        const format = gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: 'premultiplied' });

        const module = device.createShaderModule({ code: WGSL });
        const pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module,
            entryPoint: 'vs',
            buffers: [
              { arrayStride: 24, attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'float32x3' },
              ]},
            ],
          },
          fragment: { module, entryPoint: 'fs', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        });
        const uniformBuffer = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });
        const ctx: GpuContext = { device, context, format, pipeline, uniformBuffer, bindGroup };
        return new WebGpuRenderer(canvas, ctx);
      }
    } catch (err) {
      console.warn('WebGPU 初始化失败,降级到 Canvas2D:', err);
    }
  }
  return new Canvas2dRenderer(canvas);
}

// 4x4 矩阵,WebGPU/WGSL 列主序:m[col*4+row]
function m4Identity(): Float32Array { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }

/** 列主序矩阵乘法 out = a * b */
function m4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      o[col * 4 + row] = sum;
    }
  }
  return o;
}
// 列主序视图矩阵 m[col*4+row]。
// 世界坐标:x/y 为地面长/短轴,z 为高度。
function m4View(cam: Camera): Float32Array {
  const m = m4Identity();
  if (cam.mode === 'top') {
    // 俯视相机在 z=10 垂直向下看。屏幕向下 = 世界 +y,故视图 y 取负。
    m[0] = 1; m[5] = -1; m[10] = 1;
    m[12] = -cam.x;
    m[13] = cam.y;
    m[14] = -10;
    return m;
  }
  // 骑手视角(OpenGL 风格相机:xf=side 右, yf=up 上, zf=-fwd 前)。
  // fwd=cos·x+sin·y;side=-sin·x+cos·y。相机位于 (cam.x,cam.y) 上方 eye=cam.zoom。
  const c = Math.cos(cam.heading), s = Math.sin(cam.heading);
  const eye = cam.zoom;
  // col0(世界 x):xf=side.x=-s, yf=0, zf=-fwd.x=-c
  m[0] = -s; m[1] = 0; m[2] = -c; m[3] = 0;
  // col1(世界 y):xf=side.y=c, yf=0, zf=-fwd.y=-s
  m[4] = c; m[5] = 0; m[6] = -s; m[7] = 0;
  // col2(世界 z):xf=0, yf=1, zf=0
  m[8] = 0; m[9] = 1; m[10] = 0; m[11] = 0;
  // col3(平移 = -R·camPos):xf、zf 平移由地面坐标决定,yf 平移 -eye
  m[12] = -(-s * cam.x + c * cam.y);
  m[13] = -eye;
  m[14] = -(-c * cam.x - s * cam.y);
  m[15] = 1;
  return m;
}

function m4Proj(cam: Camera, w: number, h: number): Float32Array {
  const m = new Float32Array(16);
  if (cam.mode === 'top') {
    // 正交投影;y 翻转已在视图矩阵完成,这里用标准正号。相机在 z=10,覆盖 z∈[-1,9]。
    const aspect = w / h;
    const viewH = h / cam.zoom;
    const viewW = viewH * aspect;
    const near = 1, far = 11;
    m[0] = 2 / viewW;
    m[5] = 2 / viewH;
    m[10] = -2 / (far - near);
    m[14] = -(far + near) / (far - near);
    m[15] = 1;
    return m;
  }
  // 透视投影:相机 y 为垂直轴,w_clip=-z_eye(列主序 w 行 z 列 = m[11])。
  const f = 1 / Math.tan(cam.fov / 2);
  const aspect = w / h;
  const near = 0.1, far = 300;
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = -(far * near) / (far - near);
  return m;
}

type Tri = number[]; // 每三角形 3 顶点 × (xyz+rgb)=18 个 float
type RGB = [number, number, number];

/** 由三个世界点与统一颜色构造三角形(18 floats) */
function makeTri(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  col: RGB,
): Tri {
  return [...a, ...col, ...b, ...col, ...c, ...col];
}

function obstacleBox(o: Obstacle, color: [number, number, number]): Tri[] {
  const { forward, side } = facingVectors(o.angle);
  const h = Math.max(...o.elements.map((e) => e.height));
  const halfW = o.width / 2;
  const halfD = 0.25;
  const p = (sx: number, sy: number, z: number): [number, number, number] => [
    o.position.x + side.x * sx * halfW + forward.x * sy * halfD,
    o.position.y + side.y * sx * halfW + forward.y * sy * halfD,
    z,
  ];
  const c000 = p(-1, -1, 0), c100 = p(1, -1, 0), c110 = p(1, 1, 0), c010 = p(-1, 1, 0);
  const c001 = p(-1, -1, h), c101 = p(1, -1, h), c111 = p(1, 1, h), c011 = p(-1, 1, h);
  const face = (a: number[], b: number[], c: number[], d: number[], shade: number): Tri[] => {
    const col: [number, number, number] = [color[0] * shade, color[1] * shade, color[2] * shade];
    const t = (v1: number[], v2: number[], v3: number[]): Tri => [...v1, ...col, ...v2, ...col, ...v3, ...col];
    return [t(a, b, c), t(a, c, d)];
  };
  return [
    ...face(c000, c100, c101, c001, 1.0),
    ...face(c100, c110, c111, c101, 0.8),
    ...face(c110, c010, c011, c111, 0.65),
    ...face(c010, c000, c001, c011, 0.85),
    ...face(c001, c101, c111, c011, 1.1),
    ...face(c000, c010, c110, c100, 0.5),
  ];
}

function groundTiles(field: { length: number; width: number }): Tri[] {
  const tris: Tri[] = [];
  const step = 5;
  for (let x = 0; x < field.length; x += step) {
    for (let y = 0; y < field.width; y += step) {
      const shade = ((x / step + y / step) % 2 === 0) ? 0.16 : 0.13;
      const col: [number, number, number] = [0.05, shade, 0.08];
      const x2 = Math.min(x + step, field.length);
      const y2 = Math.min(y + step, field.width);
      tris.push(
        makeTri([x, y, -0.05], [x2, y, -0.05], [x2, y2, -0.05], col),
        makeTri([x, y, -0.05], [x2, y2, -0.05], [x, y2, -0.05], col),
      );
    }
  }
  return tris;
}

function tri2(a: Vec2, b: Vec2, c: Vec2, col: RGB, z = 0.02): Tri {
  return makeTri([a.x, a.y, z], [b.x, b.y, z], [c.x, c.y, z], col);
}

function quad2(a: Vec2, b: Vec2, c: Vec2, d: Vec2, col: RGB, z = 0.02): Tri[] {
  return [tri2(a, b, c, col, z), tri2(a, c, d, col, z)];
}

/** 俯视障碍:沿朝向的扁平圆角矩形色块(宽度=o.width,纵深 0.9m) */
function obstaclePlate(o: Obstacle, col: RGB): Tri[] {
  const { forward, side } = facingVectors(o.angle);
  const hw = o.width / 2;
  const hd = 0.45;
  const c = o.position;
  const p = (s: number, f: number): Vec2 => ({
    x: c.x + side.x * s * hw + forward.x * f * hd,
    y: c.y + side.y * s * hw + forward.y * f * hd,
  });
  return quad2(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), col, 0.05);
}

/** 俯视行进线:沿 path 的细飘带 */
function pathRibbon(path: Vec2[], col: RGB, widthM = 0.35): Tri[] {
  const tris: Tri[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * widthM;
    const ny = (dx / L) * widthM;
    tris.push(
      tri2({ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, col, 0.04),
      tri2({ x: a.x + nx, y: a.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }, col, 0.04),
    );
  }
  return tris;
}

/** 俯视门线:加粗线段(四边形) */
function gatePlate(g: GateLine, col: RGB): Tri[] {
  const dx = g.b.x - g.a.x;
  const dy = g.b.y - g.a.y;
  const L = Math.hypot(dx, dy) || 1;
  const t = 0.25;
  const nx = (-dy / L) * t;
  const ny = (dx / L) * t;
  return quad2(
    { x: g.a.x + nx, y: g.a.y + ny },
    { x: g.b.x + nx, y: g.b.y + ny },
    { x: g.b.x - nx, y: g.b.y - ny },
    { x: g.a.x - nx, y: g.a.y - ny },
    col, 0.06,
  );
}

/** 冲突标记:俯视红色菱形 */
function conflictDiamond(at: Vec2, col: RGB): Tri[] {
  const r = 0.7;
  const p1 = { x: at.x, y: at.y - r };
  const p2 = { x: at.x + r, y: at.y };
  const p3 = { x: at.x, y: at.y + r };
  const p4 = { x: at.x - r, y: at.y };
  return [tri2(p1, p2, p3, col, 0.08), tri2(p1, p3, p4, col, 0.08)];
}

/** 组装俯视 2D 场景 */
function topViewGeometry(course: RouteCourse, opts: RenderOptions): Tri[] {
  const tris: Tri[] = [...groundTiles(course.params.field)];
  tris.push(...borderBoxes(course.params.field));
  // 行进线
  tris.push(...pathRibbon(course.path, [0.33, 0.78, 1.0]));
  // 门线
  for (const g of course.gates) {
    tris.push(...gatePlate(g, g.kind === 'start' ? [0.49, 0.99, 0.27] : [1.0, 0.5, 0.31]));
  }
  // 障碍
  for (const o of course.obstacles) {
    let col: RGB = [0.85, 0.55, 0.2];
    if (o.manual) col = [0.95, 0.75, 0.15];
    if (opts.highlightIds?.has(o.id)) col = [0.2, 0.85, 0.95];
    if (opts.selectedId === o.id) col = [0.3, 0.9, 0.4];
    if (opts.showConflicts && course.conflicts.some((cf) => cf.obstacleIds.includes(o.id))) col = [0.95, 0.25, 0.25];
    tris.push(...obstaclePlate(o, col));
  }
  // 冲突
  if (opts.showConflicts) {
    for (const cf of course.conflicts) tris.push(...conflictDiamond(cf.at, [1.0, 0.2, 0.2]));
  }
  return tris;
}

class WebGpuRenderer implements Renderer {
  readonly backend = 'webgpu';
  private w = 800;
  private h = 600;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private gpu: GpuContext) {}

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
  }

  screenToWorld(sx: number, sy: number, cam: Camera): Vec2 {
    if (cam.mode !== 'top') return { x: cam.x, y: cam.y };
    return { x: cam.x + (sx - this.w / 2) / cam.zoom, y: cam.y + (sy - this.h / 2) / cam.zoom };
  }

  render(course: RouteCourse, cam: Camera, opts: RenderOptions): void {
    const { device, context, pipeline, uniformBuffer, bindGroup } = this.gpu;
    // 投影矩阵按 CSS 尺寸构造,再整体缩放到设备像素缓冲
    const w = this.w;
    const h = this.h;
    const view = m4View(cam);
    const scaleM = new Float32Array(16);
    scaleM[0] = this.dpr; scaleM[5] = this.dpr; scaleM[10] = 1; scaleM[15] = 1;
    const proj = m4Mul(scaleM, m4Proj(cam, w, h));
    device.queue.writeBuffer(uniformBuffer, 0, view);
    device.queue.writeBuffer(uniformBuffer, 64, proj);

    let tris: Tri[];
    if (cam.mode === 'top') {
      tris = topViewGeometry(course, opts);
    } else {
      tris = [...groundTiles(course.params.field), ...borderBoxes(course.params.field)];
      for (const o of course.obstacles) {
        let color: [number, number, number] = [0.85, 0.55, 0.2];
        if (o.manual) color = [0.95, 0.75, 0.15];
        if (opts.highlightIds?.has(o.id)) color = [0.2, 0.85, 0.95];
        if (opts.selectedId === o.id) color = [0.3, 0.9, 0.4];
        if (opts.showConflicts && course.conflicts.some((c) => c.obstacleIds.includes(o.id))) color = [0.95, 0.25, 0.25];
        tris.push(...obstacleBox(o, color));
      }
      tris.push(...pathRibbon(course.path, [0.33, 0.78, 1.0], 0.25));
    }

    const data = new Float32Array(tris.flat());
    if (data.length === 0) return;
    const vbo = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vbo, 0, data);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.04, g: 0.05, b: 0.07, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vbo);
    pass.draw(tris.length * 3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    vbo.destroy();
  }

  dispose(): void { this.gpu.device.destroy(); }
}

function borderBoxes(field: { length: number; width: number }): Tri[] {
  const col: [number, number, number] = [0.9, 0.9, 0.9];
  const out: Tri[] = [];
  const bar = (x1: number, y1: number, x2: number, y2: number) => {
    const t = 0.15;
    const minx = Math.min(x1, x2) - t, maxx = Math.max(x1, x2) + t;
    const miny = Math.min(y1, y2) - t, maxy = Math.max(y1, y2) + t;
    const z = 0.02;
    out.push(
      makeTri([minx, miny, z], [maxx, miny, z], [maxx, maxy, z], col),
      makeTri([minx, miny, z], [maxx, maxy, z], [minx, maxy, z], col),
    );
  };
  bar(0, 0, field.length, 0);
  bar(0, field.width, field.length, field.width);
  bar(0, 0, 0, field.width);
  bar(field.length, 0, field.length, field.width);
  return out;
}

// ---------- Canvas2D 降级实现 ----------
class Canvas2dRenderer implements Renderer {
  readonly backend = 'canvas2d';
  private ctx: CanvasRenderingContext2D;
  private w = 800;
  private h = 600;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  screenToWorld(sx: number, sy: number, cam: Camera): Vec2 {
    if (cam.mode !== 'top') return { x: cam.x, y: cam.y };
    return { x: cam.x + (sx - this.w / 2) / cam.zoom, y: cam.y + (sy - this.h / 2) / cam.zoom };
  }

  render(course: RouteCourse, cam: Camera, opts: RenderOptions): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, this.w, this.h);
    const P = (p: Vec2) => project(p, cam, this.w, this.h);

    // 地面
    const f = course.params.field;
    const corners = [P({ x: 0, y: 0 }), P({ x: f.length, y: 0 }), P({ x: f.length, y: f.width }), P({ x: 0, y: f.width })];
    if (corners.every((c) => !Number.isNaN(c.sx))) {
      ctx.beginPath();
      ctx.moveTo(corners[0].sx, corners[0].sy);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
      ctx.closePath();
      ctx.fillStyle = '#1d3a24';
      ctx.fill();
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 行进线
    ctx.strokeStyle = '#54c8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    course.path.forEach((p, i) => {
      const q = P(p);
      if (Number.isNaN(q.sx)) return;
      if (i === 0) ctx.moveTo(q.sx, q.sy);
      else ctx.lineTo(q.sx, q.sy);
    });
    ctx.stroke();

    // 门线
    for (const g of course.gates as GateLine[]) {
      const a = P(g.a), b = P(g.b);
      if (Number.isNaN(a.sx) || Number.isNaN(b.sx)) continue;
      ctx.strokeStyle = g.kind === 'start' ? '#7CFC00' : '#ff7f50';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    // 障碍
    for (const o of course.obstacles) {
      const { side } = facingVectors(o.angle);
      const c = P(o.position);
      if (Number.isNaN(c.sx)) continue;
      const a = P({ x: o.position.x + side.x * (o.width / 2), y: o.position.y + side.y * (o.width / 2) });
      const b = P({ x: o.position.x - side.x * (o.width / 2), y: o.position.y - side.y * (o.width / 2) });
      let fill = '#d98c33';
      if (o.manual) fill = '#f2c024';
      if (opts.highlightIds?.has(o.id)) fill = '#33d9f2';
      if (opts.selectedId === o.id) fill = '#4de666';
      if (opts.showConflicts && course.conflicts.some((cf) => cf.obstacleIds.includes(o.id))) fill = '#f24040';
      ctx.strokeStyle = fill;
      ctx.lineWidth = cam.mode === 'top' ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    // 冲突标记
    if (opts.showConflicts) {
      for (const cf of course.conflicts) {
        const p = P(cf.at);
        if (Number.isNaN(p.sx)) continue;
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  dispose(): void { /* noop */ }
}

export { project };
