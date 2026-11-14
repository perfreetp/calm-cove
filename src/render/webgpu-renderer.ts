// ============ WebGPU 编队渲染器（WGSL 点精灵 + 地面网格） ============
import type { Camera } from './camera'
import { project } from './camera'

export interface RenderPoint {
  x: number
  y: number
  z: number
  r: number // 0..255
  g: number
  b: number
  size: number // 屏幕像素半径
}

export interface RenderLine {
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  color: [number, number, number]
}

const WGSL = /* wgsl */ `
struct CameraUniform {
  viewProj: mat4x4<f32>,
  canvasSize: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> cam: CameraUniform;

struct VSInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) size: f32,
};

struct VSOutput {
  @builtin(position) clip: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) size: f32,
};

@vertex
fn vs_main(@location(0) corner: vec2<f32>, in: VSInput) -> VSOutput {
  var out: VSOutput;
  let world = vec4<f32>(in.position, 1.0);
  out.clip = cam.viewProj * world;
  // 点精灵按屏幕像素偏移，近大远小由透视除法天然体现
  let pixel = vec2<f32>(in.size * 2.0) / cam.canvasSize;
  out.clip = vec4<f32>(out.clip.xy + corner * pixel * out.clip.w, out.clip.zw);
  out.color = in.color;
  out.uv = corner;
  out.size = in.size;
  return out;
}

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  let core = 1.0 - smoothstep(0.78, 1.0, d);
  // 灯光辉光：中心亮、边缘渐隐
  let glow = exp(-d * d * 3.0) * 0.55;
  let alpha = clamp(core + glow, 0.0, 1.0);
  return vec4<f32>(in.color * (0.75 + glow), alpha);
}

struct LineVertex {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
};

@vertex
fn line_vs(in: LineVertex) -> @builtin(position) vec4<f32> {
  return cam.viewProj * vec4<f32>(in.position, 1.0);
}

@fragment
fn line_fs(@builtin(position) p: vec4<f32>, @location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(color, 0.8);
}
`

/** 由相机参数构造 view-proj 矩阵（列主序，与 WGSL mat4x4 对应） */
function viewProjMatrix(cam: Camera): Float32Array {
  // 简化：直接用 project() 的同款变换组装矩阵
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const f = 1 / Math.tan(cam.fov / 2)
  const aspect = cam.aspect
  const d = cam.distance
  // view: 平移 -d 后做 pitch / yaw 逆变换；proj: 透视
  // 合并为列主序 4x4
  const m = new Float32Array(16)
  // 旋转 Rz(-yaw) * Rx(-pitch) * T(0,0,-d) 后乘透视
  const rot = [
    cy, sy * sp, sy * cp, 0,
    -sy, cy * sp, cy * cp, 0,
    0, -cp, sp, 0,
    0, 0, -d, 1
  ]
  const proj = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, 1, 1,
    0, 0, 0, 0
  ]
  // 矩阵乘 proj * rot（列主序）
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += proj[k * 4 + r] * rot[c * 4 + k]
      }
      m[c * 4 + r] = sum
    }
  }
  return m
}

export class WebGPURenderer {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  pipeline!: GPURenderPipeline
  linePipeline!: GPURenderPipeline
  uniformBuffer!: GPUBuffer
  bindGroup!: GPUBindGroup
  pointBuffer!: GPUBuffer
  lineBuffer!: GPUBuffer
  cornerBuffer!: GPUBuffer
  capacity: number
  lineCapacity: number
  width: number
  height: number

  private constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, width: number, height: number) {
    this.device = device
    this.context = context
    this.format = format
    this.width = width
    this.height = height
    this.capacity = 4096
    this.lineCapacity = 8192
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('no adapter')
    const device = await adapter.requestDevice()
    const context = canvas.getContext('webgpu') as GPUCanvasContext
    const format = navigator.gpu.getPreferredCanvasFormat()
    const r = new WebGPURenderer(device, context, format, canvas.width, canvas.height)
    r.init(canvas)
    return r
  }

  private init(canvas: HTMLCanvasElement): void {
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })

    const module = this.device.createShaderModule({ code: WGSL })

    this.uniformBuffer = this.device.createBuffer({
      size: 80, // mat4(64) + vec2(8) + vec2 pad(8)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    this.bindGroup = this.device.createBindGroup({
      layout: this.device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }]
      }),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
    })

    // 每实例 7 个 float：position(3) color(3) size(1)
    this.pointBuffer = this.device.createBuffer({
      size: this.capacity * 7 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    // 四角（实例化点精灵）
    const corners = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ])
    this.cornerBuffer = this.device.createBuffer({
      size: corners.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    this.device.queue.writeBuffer(this.cornerBuffer, 0, corners)

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroup as unknown as GPUBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          { arrayStride: 2 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
          {
            arrayStride: 7 * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32' }
            ]
          }
        ]
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{ format: this.format, blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
        } }]
      },
      primitive: { topology: 'triangle-list' },
      multisample: { count: 1 }
    })

    this.lineBuffer = this.device.createBuffer({
      size: this.lineCapacity * 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    this.linePipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroup as unknown as GPUBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'line_vs',
        buffers: [{
          arrayStride: 6 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' }
          ]
        }]
      },
      fragment: { module, entryPoint: 'line_fs', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list' }
    })
  }

  resize(w: number, h: number): void {
    this.width = w
    this.height = h
  }

  render(cam: Camera, points: RenderPoint[], lines: RenderLine[]): void {
    const vp = viewProjMatrix(cam)
    const uniform = new Float32Array(20)
    uniform.set(vp, 0)
    uniform[16] = this.width
    uniform[17] = this.height
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniform.buffer, uniform.byteOffset, 80)

    if (points.length > this.capacity) this.growPointBuffer(points.length)
    const pointData = new Float32Array(points.length * 7)
    points.forEach((p, i) => {
      pointData.set([p.x, p.y, p.z, p.r / 255, p.g / 255, p.b / 255, p.size], i * 7)
    })
    this.device.queue.writeBuffer(this.pointBuffer, 0, pointData)

    if (lines.length * 2 > this.lineCapacity) this.growLineBuffer(lines.length * 2)
    const lineData = new Float32Array(lines.length * 2 * 6)
    lines.forEach((l, i) => {
      lineData.set([l.ax, l.ay, l.az, l.color[0], l.color[1], l.color[2]], i * 12)
      lineData.set([l.bx, l.by, l.bz, l.color[0], l.color[1], l.color[2]], i * 12 + 6)
    })
    this.device.queue.writeBuffer(this.lineBuffer, 0, lineData)

    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.03, g: 0.05, b: 0.09, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    })
    pass.setBindGroup(0, this.bindGroup)
    if (lines.length) {
      pass.setPipeline(this.linePipeline)
      pass.setVertexBuffer(0, this.lineBuffer)
      pass.draw(lines.length * 2)
    }
    if (points.length) {
      pass.setPipeline(this.pipeline)
      pass.setVertexBuffer(0, this.cornerBuffer)
      pass.setVertexBuffer(1, this.pointBuffer)
      pass.draw(6, points.length)
    }
    pass.end()
    this.device.queue.submit([encoder.finish()])
  }

  private growPointBuffer(needed: number): void {
    this.capacity = Math.ceil(needed * 1.5)
    this.pointBuffer.destroy()
    this.pointBuffer = this.device.createBuffer({
      size: this.capacity * 7 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
  }

  private growLineBuffer(neededVerts: number): void {
    this.lineCapacity = Math.ceil(neededVerts * 1.5)
    this.lineBuffer.destroy()
    this.lineBuffer = this.device.createBuffer({
      size: this.lineCapacity * 6 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
  }

  destroy(): void {
    this.pointBuffer.destroy()
    this.lineBuffer.destroy()
    this.cornerBuffer.destroy()
    this.uniformBuffer.destroy()
  }
}

// 保持 project 引用（视角旋转一致性测试用）
export { project }
