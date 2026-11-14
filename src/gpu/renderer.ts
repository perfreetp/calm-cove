// ---------- 立面渲染器：WebGPU 优先，Canvas2D 降级 ----------

export interface Rect {
  x: number; // 世界坐标(米)
  y: number;
  w: number;
  h: number;
  color: [number, number, number, number];
}

export interface View {
  scale: number; // 像素/米
  offsetX: number; // 屏幕平移(像素)
  offsetY: number;
}

export interface Renderer {
  backend: "webgpu" | "canvas2d";
  render(rects: Rect[], view: View, canvasWidth: number, canvasHeight: number): void;
  dispose(): void;
}

const WGSL = /* wgsl */ `
struct Uniforms {
  // scale.x, scale.y, offset.x, offset.y (像素)
  view: vec4f,
  canvas: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Instance {
  @location(0) pos: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, inst: Instance) -> @builtin(position) vec4f {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
  );
  let c = corners[vi];
  // 世界(米, y向上) -> 像素(y向下)
  let world = inst.pos + c * inst.size;
  let px = vec2f(
    world.x * u.view.x + u.view.z,
    u.canvas.y - (world.y * u.view.y + u.view.w)
  );
  // 像素 -> 裁剪空间
  let clip = vec2f(px.x / u.canvas.x * 2.0 - 1.0, 1.0 - px.y / u.canvas.y * 2.0);
  return vec4f(clip, 0.0, 1.0);
}

@fragment
fn fs(inst: Instance) -> @location(0) vec4f {
  return inst.color;
}
`;

async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  try {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext("webgpu");
    if (!ctx) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });

    const module = device.createShaderModule({ code: WGSL });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 8 * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // pos
              { shaderLocation: 1, offset: 8, format: "float32x2" }, // size
              { shaderLocation: 2, offset: 16, format: "float32x4" }, // color
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    const uniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    let instBuffer: GPUBuffer | null = null;
    let instCapacity = 0;

    return {
      backend: "webgpu",
      render(rects, view, w, h) {
        if (rects.length === 0) return;
        if (rects.length > instCapacity) {
          instBuffer?.destroy();
          instCapacity = Math.max(256, rects.length * 2);
          instBuffer = device.createBuffer({
            size: instCapacity * 32,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
        }
        const data = new Float32Array(rects.length * 8);
        rects.forEach((r, i) => {
          data.set([r.x, r.y, r.w, r.h, ...r.color], i * 8);
        });
        device.queue.writeBuffer(instBuffer!, 0, data);
        device.queue.writeBuffer(
          uniformBuffer,
          0,
          new Float32Array([view.scale, view.scale, view.offsetX, view.offsetY, w, h, 0, 0]),
        );
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: ctx.getCurrentTexture().createView(),
              loadOp: "clear",
              clearValue: { r: 0.97, g: 0.98, b: 1.0, a: 1 },
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, instBuffer!);
        pass.draw(6, rects.length);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
      dispose() {
        instBuffer?.destroy();
        uniformBuffer.destroy();
        device.destroy();
      },
    };
  } catch {
    return null;
  }
}

function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  return {
    backend: "canvas2d",
    render(rects, view, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#f7f9ff";
      ctx.fillRect(0, 0, w, h);
      for (const r of rects) {
        const [cr, cg, cb, ca] = r.color;
        ctx.fillStyle = `rgba(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(
          cb * 255,
        )},${ca})`;
        const px = r.x * view.scale + view.offsetX;
        const py = h - (r.y + r.h) * view.scale + view.offsetY;
        ctx.fillRect(px, py, r.w * view.scale, r.h * view.scale);
      }
    },
    dispose() {},
  };
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  const gpu = await createWebGPURenderer(canvas);
  return gpu ?? createCanvas2DRenderer(canvas);
}
