import type { Scene } from '../lib/scene';
import { SCENE_H, SCENE_W } from './textures';

export interface Renderer {
  readonly kind: 'webgpu' | 'canvas2d';
  render(scene: Scene): void;
  dispose(): void;
}

/* ---------------- Canvas2D 回退实现 ---------------- */

class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  render(scene: Scene): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    ctx.lineCap = 'round';

    for (const q of scene.quads) {
      ctx.save();
      ctx.globalAlpha = q.alpha;
      ctx.translate(q.x, q.y);
      ctx.rotate((q.angleDeg * Math.PI) / 180);
      ctx.drawImage(q.image, -q.pivotX, -q.pivotY, q.w, q.h);
      if (q.tint) {
        ctx.fillStyle = q.tint;
        ctx.fillRect(-q.pivotX, -q.pivotY, q.w, q.h);
      }
      ctx.restore();
    }

    for (const ln of scene.lines) {
      ctx.save();
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = ln.width;
      if (ln.dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(ln.x1, ln.y1);
      ctx.lineTo(ln.x2, ln.y2);
      ctx.stroke();
      ctx.restore();
    }

    for (const t of scene.texts) {
      ctx.save();
      ctx.fillStyle = t.color;
      ctx.font = `${t.size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.textAlign = t.align;
      ctx.textBaseline = 'middle';
      const x = t.align === 'center' ? t.x : t.x;
      ctx.fillText(t.text, x, t.y);
      ctx.restore();
    }
  }

  dispose() {}
}

/* ---------------- WebGPU 实现 ---------------- */

const WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
};

@vertex
fn vs_main(
  @location(0) local: vec2f,
  @location(1) uv: vec2f,
  @location(2) center: vec2f,
  @location(3) angle: f32,
  @location(4) size: vec2f,
  @location(5) pivot: vec2f,
  @location(6) tint: vec4f,
) -> VSOut {
  // 屏幕坐标 Y 向下,与数学坐标系 Y 向上相反,旋转角需取负
  let a = -angle;
  let c = cos(a);
  let s = sin(a);
  // 以 pivot 为旋转中心
  let p0 = local * size - pivot;
  let rot = vec2f(p0.x * c - p0.y * s, p0.x * s + p0.y * c);
  let world = rot + center;
  let ndc = vec2f(
    world.x / uni.res.x * 2.0 - 1.0,
    1.0 - world.y / uni.res.y * 2.0
  );
  var out: VSOut;
  out.pos = vec4f(ndc, 0.0, 1.0);
  out.uv = uv;
  out.tint = tint;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let base = textureSample(tex, samp, in.uv);
  let outCol = mix(base.rgb, in.tint.rgb, in.tint.a);
  return vec4f(outCol, base.a);
}
`;

const LINE_WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> uni: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs_main(
  @location(0) world: vec2f,
  @location(1) color: vec4f,
) -> VSOut {
  var out: VSOut;
  let ndc = vec2f(
    world.x / uni.res.x * 2.0 - 1.0,
    1.0 - world.y / uni.res.y * 2.0
  );
  out.pos = vec4f(ndc, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  return in.color;
}
`;

function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  if (hex.startsWith('rgba')) {
    const m = hex.match(/[\d.]+/g)!;
    return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3])];
  }
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

/** 生成 1x1 白色占位纹理(线条/纯色也走 quad 管线或 line 管线) */
async function makeWhiteTexture(device: GPUDevice): Promise<GPUTexture> {
  const tex = device.createTexture({
    size: { width: 1, height: 1 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.writeTexture({ texture: tex }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, { width: 1, height: 1 });
  return tex;
}

class WebGPURenderer implements Renderer {
  readonly kind = 'webgpu' as const;
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private quadPipeline: GPURenderPipeline;
  private linePipeline: GPURenderPipeline;
  private sampler: GPUSampler;
  private uniformBuffer: GPUBuffer;
  private whiteTex: GPUTexture;
  private textureCache = new Map<CanvasImageSource, GPUTexture>();
  private quadBuffer: GPUBuffer;
  private lineBuffer: GPUBuffer;
  private quadCapacity = 4096;
  private lineCapacity = 4096;

  private static readonly QUAD_STRIDE = 15 * 4;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
  ) {
    this.device = device;
    this.context = context;
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([SCENE_W, SCENE_H, 0, 0]),
    );
    this.whiteTex = null as unknown as GPUTexture; // init 中赋值

    const quadModule = device.createShaderModule({ code: WGSL });
    const lineModule = device.createShaderModule({ code: LINE_WGSL });

    this.quadPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: quadModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            // 顶点字段:local(2)+uv(2)+center(2)+angle(1)+size(2)+pivot(2)+tint(4)= 15 float
            arrayStride: 15 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'float32x2' },
              { shaderLocation: 3, offset: 24, format: 'float32' },
              { shaderLocation: 4, offset: 28, format: 'float32x2' },
              { shaderLocation: 5, offset: 36, format: 'float32x2' },
              { shaderLocation: 6, offset: 44, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module: quadModule,
        entryPoint: 'fs_main',
        targets: [{ format, blend: { alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }, writeMask: 7 }],
      },
      primitive: { topology: 'triangle-strip' },
    });

    this.linePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: lineModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 6 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module: lineModule,
        entryPoint: 'fs_main',
        targets: [{ format, blend: { alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }, writeMask: 7 }],
      },
      primitive: { topology: 'line-list' },
    });

    this.quadBuffer = device.createBuffer({
      size: this.quadCapacity * WebGPURenderer.QUAD_STRIDE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.lineBuffer = device.createBuffer({
      size: this.lineCapacity * 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    // uniformBind 依赖 whiteTex,在 static create() 中创建
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('未找到可用 GPU 适配器');
    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (e) => {
      console.error('[WebGPU] 未捕获错误:', (e as GPUUncapturedErrorEvent).error.message);
    });
    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const r = new WebGPURenderer(device, context, format);
    r.whiteTex = await makeWhiteTexture(device);
    return r;
  }

  private getTexture(src: CanvasImageSource): GPUTexture {
    const cached = this.textureCache.get(src);
    if (cached) return cached;
    const source = src as HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;
    const w =
      (source as HTMLCanvasElement).width ||
      (source as HTMLImageElement).naturalWidth;
    const h =
      (source as HTMLCanvasElement).height ||
      (source as HTMLImageElement).naturalHeight;
    const tex = this.device.createTexture({
      size: { width: w, height: h },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture(
      { source: source as GPUCopyExternalImageSource },
      { texture: tex },
      { width: w, height: h },
    );
    this.textureCache.set(src, tex);
    return tex;
  }

  private ensureCapacity(kind: 'quad' | 'line', needed: number) {
    if (kind === 'quad' && needed > this.quadCapacity) {
      this.quadCapacity = Math.max(needed, this.quadCapacity * 2);
      this.quadBuffer.destroy();
      this.quadBuffer = this.device.createBuffer({
        size: this.quadCapacity * WebGPURenderer.QUAD_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (kind === 'line' && needed > this.lineCapacity) {
      this.lineCapacity = Math.max(needed, this.lineCapacity * 2);
      this.lineBuffer.destroy();
      this.lineBuffer = this.device.createBuffer({
        size: this.lineCapacity * 6 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  render(scene: Scene): void {
    try {
      this.renderInner(scene);
    } catch (err) {
      console.error('[WebGPU] 渲染中断:', err);
    }
  }

  private renderInner(scene: Scene): void {
    // ---- quad 顶点:每个 quad 4 顶点(triangle-strip) ----
    const quadVerts: number[] = [];
    const quadGroups: { offset: number; count: number; tex: GPUTexture; tint: [number, number, number, number] }[] = [];
    for (const q of scene.quads) {
      const tex = this.getTexture(q.image);
      const tint = q.tint ? hexToRgba(q.tint) : ([0, 0, 0, 0] as [number, number, number, number]);
      const angle = (q.angleDeg * Math.PI) / 180;
      const corners = [
        { local: [0, 0], uv: [0, 0] },
        { local: [1, 0], uv: [1, 0] },
        { local: [0, 1], uv: [0, 1] },
        { local: [1, 1], uv: [1, 1] },
      ];
      const offset = quadVerts.length / 15;
      for (const c of corners) {
        quadVerts.push(
          c.local[0], c.local[1],
          c.uv[0], c.uv[1],
          q.x, q.y,
          angle,
          q.w, q.h,
          q.pivotX, q.pivotY,
          tint[0], tint[1], tint[2], tint[3],
        );
      }
      quadGroups.push({ offset, count: 4, tex, tint });
    }

    // ---- 线段:每条线段 2 顶点 ----
    const lineVerts: number[] = [];
    const pushLine = (x1: number, y1: number, x2: number, y2: number, color: string, width: number) => {
      const [r, g, b, a] = hexToRgba(color);
      // 用垂直偏移模拟线宽
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * width * 0.5;
      const ny = (dx / len) * width * 0.5;
      lineVerts.push(x1 + nx, y1 + ny, r, g, b, a, x2 + nx, y2 + ny, r, g, b, a);
      lineVerts.push(x1 - nx, y1 - ny, r, g, b, a, x2 - nx, y2 - ny, r, g, b, a);
    };
    for (const ln of scene.lines) {
      if (ln.dashed) {
        const dx = ln.x2 - ln.x1;
        const dy = ln.y2 - ln.y1;
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.floor(len / 10));
        for (let i = 0; i < steps; i += 2) {
          const t0 = i / steps;
          const t1 = Math.min(1, (i + 1) / steps);
          pushLine(
            ln.x1 + dx * t0,
            ln.y1 + dy * t0,
            ln.x1 + dx * t1,
            ln.y1 + dy * t1,
            ln.color,
            ln.width,
          );
        }
      } else {
        pushLine(ln.x1, ln.y1, ln.x2, ln.y2, ln.color, ln.width);
      }
    }

    this.ensureCapacity('quad', quadVerts.length / 15);
    this.ensureCapacity('line', lineVerts.length / 6);
    this.device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array(quadVerts));
    this.device.queue.writeBuffer(this.lineBuffer, 0, new Float32Array(lineVerts));

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: this.parseBg(scene.background),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    // 拆件
    for (const g of quadGroups) {
      const bind = this.device.createBindGroup({
        layout: this.quadPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: g.tex.createView() },
          { binding: 2, resource: this.sampler },
        ],
      });
      pass.setPipeline(this.quadPipeline);
      pass.setBindGroup(0, bind);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(g.count, 1, g.offset, 0);
    }

    // 线条
    if (lineVerts.length > 0) {
      const lineBind = this.device.createBindGroup({
        layout: this.linePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
      });
      pass.setPipeline(this.linePipeline);
      pass.setBindGroup(0, lineBind);
      pass.setVertexBuffer(0, this.lineBuffer);
      pass.draw(lineVerts.length / 6);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    // 文字层走 DOM 覆盖(见 Viewport 组件),GPU 管线不做光栅文字
  }

  private parseBg(hex: string): GPUColor {
    const [r, g, b] = hexToRgba(hex);
    return { r, g, b, a: 1 };
  }

  dispose() {
    this.quadBuffer.destroy();
    this.lineBuffer.destroy();
    this.uniformBuffer.destroy();
    this.whiteTex.destroy();
    for (const t of this.textureCache.values()) t.destroy();
  }
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  try {
    return await WebGPURenderer.create(canvas);
  } catch (err) {
    console.warn('[renderer] WebGPU 不可用,回退到 Canvas2D:', err);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D 上下文也无法创建');
    return new Canvas2DRenderer(ctx);
  }
}

/** 导出用离屏 2D 渲染器(保证导出结果与后端无关、分辨率可调) */
export class Offscreen2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  private inner: Canvas2DRenderer;
  constructor(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const scale = Math.min(width / SCENE_W, height / SCENE_H);
    const offsetX = (width - SCENE_W * scale) / 2;
    const offsetY = (height - SCENE_H * scale) / 2;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    this.inner = new Canvas2DRenderer(ctx);
  }
  render(scene: Scene) {
    this.inner.render(scene);
  }
  get ctx(): CanvasRenderingContext2D {
    return this.inner.ctx;
  }
  get canvas(): HTMLCanvasElement {
    return this.inner.ctx.canvas;
  }
  dispose() {}
}
