import type { DrawList } from './drawlist';
import type { RGBA } from '../core/types';

export interface ViewportTransform {
  /** CSS pixel size of the canvas. */
  width: number;
  height: number;
  /** Device pixel ratio used for backing store sizing. */
  dpr: number;
  /** Camera zoom factor. */
  zoom: number;
  /** Pan in CSS pixels. */
  panX: number;
  panY: number;
  rigWidth: number;
  rigHeight: number;
  background: RGBA;
}

const SHADER = /* wgsl */ `
struct Uniforms {
  xform: vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs_main(
  @location(0) position: vec2f,
  @location(1) color: vec4f,
) -> VSOut {
  var out: VSOut;
  out.position = vec4f(
    position.x * u.xform.x + u.xform.y,
    position.y * u.xform.z + u.xform.w,
    0.0,
    1.0,
  );
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  return in.color;
}
`;

export function computeXform(vp: ViewportTransform): Float32Array {
  const w = vp.width * vp.dpr;
  const h = vp.height * vp.dpr;
  const scale = Math.min(w / vp.rigWidth, h / vp.rigHeight) * vp.zoom;
  const panX = vp.panX * vp.dpr;
  const panY = vp.panY * vp.dpr;
  const sx = (2 * scale) / w;
  const ox = (-vp.rigWidth * scale + 2 * panX) / w;
  const sy = (-2 * scale) / h;
  const oy = (vp.rigHeight * scale - 2 * panY) / h;
  return new Float32Array([sx, ox, sy, oy]);
}

export type RendererBackend = 'webgpu' | 'canvas2d' | 'none';

export class SceneRenderer {
  readonly backend: RendererBackend;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexCapacity = 0;
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private lost = false;

  private constructor(canvas: HTMLCanvasElement, backend: RendererBackend) {
    this.canvas = canvas;
    this.backend = backend;
  }

  static async create(canvas: HTMLCanvasElement): Promise<SceneRenderer> {
    if (!('gpu' in navigator) || !navigator.gpu) {
      const r = new SceneRenderer(canvas, 'canvas2d');
      r.setup2d();
      return r;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('未找到可用的 GPU 适配器');
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu');
      if (!context) throw new Error('无法创建 WebGPU 上下文');
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'opaque' });

      const renderer = new SceneRenderer(canvas, 'webgpu');
      renderer.device = device;
      renderer.context = context;
      renderer.pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({ code: SHADER, label: 'scene-shader' }),
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 24,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x4' },
              ],
            },
          ],
        },
        fragment: {
          module: device.createShaderModule({ code: SHADER, label: 'scene-shader-frag' }),
          entryPoint: 'fs_main',
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
      });
      renderer.uniformBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      renderer.bindGroup = device.createBindGroup({
        layout: renderer.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: renderer.uniformBuffer } }],
      });
      device.lost.then((info) => {
        renderer.lost = true;
        console.warn('[WebGPU] device lost:', info.reason, info.message);
      });
      return renderer;
    } catch (err) {
      console.warn('[WebGPU] 初始化失败，回退到 Canvas2D:', err);
      const r = new SceneRenderer(canvas, 'canvas2d');
      r.setup2d();
      return r;
    }
  }

  private setup2d(): void {
    this.ctx2d = this.canvas.getContext('2d');
  }

  get isLost(): boolean {
    return this.lost;
  }

  resize(vp: ViewportTransform): void {
    const w = Math.max(1, Math.round(vp.width * vp.dpr));
    const h = Math.max(1, Math.round(vp.height * vp.dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  render(list: DrawList, vp: ViewportTransform): void {
    this.resize(vp);
    if (this.backend === 'webgpu' && this.device && this.context && this.pipeline) {
      this.renderGpu(list, vp);
    } else if (this.ctx2d) {
      this.render2d(list, vp);
    }
  }

  private ensureVertexBuffer(byteLength: number): GPUBuffer | null {
    if (!this.device) return null;
    if (this.vertexBuffer && this.vertexCapacity >= byteLength) return this.vertexBuffer;
    this.vertexBuffer?.destroy();
    const size = Math.max(1024, Math.ceil((byteLength * 1.5) / 1024) * 1024);
    this.vertexBuffer = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.vertexCapacity = size;
    return this.vertexBuffer;
  }

  private renderGpu(list: DrawList, vp: ViewportTransform): void {
    const device = this.device!;
    const context = this.context!;
    const pipeline = this.pipeline!;
    if (list.vertices.byteLength === 0) {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: vp.background[0], g: vp.background[1], b: vp.background[2], a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
      return;
    }

    const vb = this.ensureVertexBuffer(list.vertices.byteLength);
    if (!vb) return;
    device.queue.writeBuffer(vb, 0, list.vertices as unknown as GPUAllowSharedBufferSource);
    device.queue.writeBuffer(this.uniformBuffer!, 0, computeXform(vp) as unknown as GPUAllowSharedBufferSource);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: vp.background[0], g: vp.background[1], b: vp.background[2], a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.bindGroup!);
    pass.setVertexBuffer(0, vb);
    pass.draw(list.vertexCount, 1, 0, 0);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  private render2d(list: DrawList, vp: ViewportTransform): void {
    const ctx = this.ctx2d!;
    const w = vp.width;
    const h = vp.height;
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(w / vp.rigWidth, h / vp.rigHeight) * vp.zoom;
    ctx.save();
    ctx.translate(w / 2 + vp.panX, h / 2 + vp.panY);
    ctx.scale(scale, scale);
    ctx.translate(-vp.rigWidth / 2, -vp.rigHeight / 2);
    const v = list.vertices;
    for (let i = 0; i < v.length; i += 18) {
      const r = v[i + 2];
      const g = v[i + 3];
      const b = v[i + 4];
      const a = v[i + 5];
      if (a <= 0.001) continue;
      ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
      ctx.beginPath();
      ctx.moveTo(v[i], v[i + 1]);
      ctx.lineTo(v[i + 6], v[i + 7]);
      ctx.lineTo(v[i + 12], v[i + 13]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  destroy(): void {
    this.vertexBuffer?.destroy();
    this.uniformBuffer?.destroy();
  }
}

export async function isWebGpuAvailable(): Promise<boolean> {
  if (!('gpu' in navigator) || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}
