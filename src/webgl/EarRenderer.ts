export type ViewMode = 'solid' | 'curv' | 'thick';

export interface RenderModel {
  nu: number;
  nv: number;
  pos: Float32Array;
  nrm: Float32Array;
  curv: Float32Array;
  thick: Float32Array;
  inner: Float32Array;
  lattice?: Float32Array;
  handlePos: Float32Array;
  handleFrames: Float32Array;
}

export interface Camera {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
}

const SURF_VS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNrm;
in float aCurv;
in float aThick;
in vec2 aUV;
in float aInner;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vN;
out vec3 vP;
out float vCurv;
out float vThick;
out vec2 vUV;
out float vInner;
void main() {
  vec4 vp = uView * vec4(aPos, 1.0);
  vP = vp.xyz;
  vN = mat3(uView) * aNrm;
  vCurv = aCurv;
  vThick = aThick;
  vUV = aUV;
  vInner = aInner;
  gl_Position = uProj * vp;
}`;

const SURF_FS = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vP;
in float vCurv;
in float vThick;
in vec2 vUV;
in float vInner;
uniform int uMode;
uniform float uThreshold;
uniform float uTime;
uniform float uAccent;
out vec4 outColor;

vec3 curvRamp(float t) {
  vec3 c0 = vec3(0.045, 0.20, 0.31);
  vec3 c1 = vec3(0.09, 0.55, 0.55);
  vec3 c2 = vec3(0.86, 0.72, 0.36);
  vec3 c3 = vec3(0.98, 0.24, 0.16);
  if (t < 0.55) return mix(c0, c1, smoothstep(0.02, 0.55, t));
  if (t < 0.88) return mix(c1, c2, smoothstep(0.55, 0.88, t));
  return mix(c2, c3, smoothstep(0.88, 1.02, t));
}

vec3 thickRamp(float t) {
  vec3 a = vec3(0.10, 0.52, 0.52);
  vec3 b = vec3(0.35, 0.78, 0.66);
  vec3 c = vec3(0.93, 0.76, 0.45);
  vec3 d = vec3(0.92, 0.46, 0.30);
  float x = clamp((t - 0.55) / 1.75, 0.0, 1.0);
  if (x < 0.5) return mix(a, mix(b, c, x * 2.0), smoothstep(0.0, 0.5, x));
  return mix(c, d, smoothstep(0.5, 1.0, x));
}

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vP);
  vec3 L1 = normalize(vec3(0.42, 0.66, 0.62));
  vec3 L2 = normalize(vec3(-0.65, 0.15, 0.35));
  vec3 L3 = normalize(vec3(0.1, -0.7, -0.3));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  float d3 = max(dot(N, L3), 0.0);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 46.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);

  vec3 base;
  if (uMode == 1) {
    float t = vCurv / uThreshold;
    base = curvRamp(t);
    float over = smoothstep(0.94, 1.0, t);
    float pulse = 0.5 + 0.5 * sin(uTime * 2.6 + vP.x * 0.35 + vP.y * 0.2);
    base = mix(base, vec3(1.0, 0.16, 0.10), over * (0.32 + 0.22 * pulse));
    if (over > 0.5) {
      float ring = sin(vUV.x * 96.0 + vUV.y * 40.0 - uTime * 2.0);
      base *= 0.94 + 0.10 * smoothstep(0.4, 1.0, ring);
    }
  } else if (uMode == 2) {
    base = thickRamp(vThick);
  } else {
    base = vec3(0.42, 0.50, 0.58);
    float sheen = smoothstep(0.3, 1.0, dot(N, normalize(vec3(0.2, 0.9, 0.35))));
    base += sheen * 0.045;
  }

  // iso-grid on the shell
  vec2 g = vec2(vUV.x * 11.0, vUV.y * 23.0);
  vec2 gf = abs(fract(g) - 0.5);
  float line = smoothstep(0.46, 0.5, max(gf.x, gf.y));
  base = mix(base, base * 0.72 + vec3(0.02, 0.06, 0.07), line * 0.55);

  float rimAmt = uMode == 0 ? 0.55 : 0.25;
  base += vec3(0.16, 0.52, 0.46) * fres * rimAmt;

  vec3 col = base * (0.34 + 0.66 * d1 + 0.30 * d2 + 0.14 * d3);
  col += spec * 0.42;
  col += vec3(0.05, 0.16, 0.15) * fres * 0.9;

  if (vInner > 0.5) {
    vec3 innerTint = uMode == 0 ? vec3(0.16, 0.19, 0.23) : base * 0.72;
    col = mix(col * 0.32 + vec3(0.055, 0.065, 0.08), innerTint * 0.55, 0.35);
  }
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  outColor = vec4(col, 1.0);
}`;

const POINT_VS = `#version 300 es
precision highp float;
in vec3 aPos;
in float aSel;
in float aHot;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uDpr;
out float vSel;
out float vHot;
out float vDepth;
void main() {
  vec4 vp = uView * vec4(aPos, 1.0);
  vDepth = -vp.z;
  vSel = aSel;
  vHot = aHot;
  gl_Position = uProj * vp;
  float scale = clamp(120.0 / max(1.0, -vp.z), 0.5, 1.7);
  gl_PointSize = (aSel > 0.5 ? 15.0 : 10.0) * scale * uDpr;
}`;

const POINT_FS = `#version 300 es
precision highp float;
in float vSel;
in float vHot;
in float vDepth;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float core = smoothstep(1.0, 0.72, r);
  float ring = smoothstep(0.60, 0.70, r) * smoothstep(0.94, 0.80, r);
  vec3 face = vSel > 0.5 ? vec3(1.0, 0.83, 0.55) : vec3(0.62, 0.93, 0.86);
  if (vHot > 0.5 && vSel < 0.5) face = vec3(1.0, 0.55, 0.45);
  vec3 col = mix(face, vec3(0.04, 0.07, 0.09), ring * 0.85);
  float alpha = core * (vSel > 0.5 ? 1.0 : 0.92);
  outColor = vec4(col, alpha);
}`;

const LINE_VS = `#version 300 es
precision highp float;
in vec3 aPos;
uniform mat4 uView;
uniform mat4 uProj;
void main() { gl_Position = uProj * uView * vec4(aPos, 1.0); }`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor, 0.42); }`;

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function normalize(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: number[], b: number[]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function lookAt(eye: number[], center: number[], up: number[]): Float32Array {
  const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export class EarRenderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  private surfProg: WebGLProgram;
  private ptProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private ptVao: WebGLVertexArrayObject;
  private buffers: Record<string, WebGLBuffer> = {};
  private indexBuffer: WebGLBuffer | null = null;
  private ptPosBuffer: WebGLBuffer | null = null;
  private ptSelBuffer: WebGLBuffer | null = null;
  private ptHotBuffer: WebGLBuffer | null = null;
  private lineBuffer: WebGLBuffer | null = null;
  private latticeCount = 0;
  private latticeProg: WebGLProgram;
  private latticeVao: WebGLVertexArrayObject | null = null;
  showLattice = true;
  userFramed = false;
  private indexCount = 0;
  private handleCount = 0;
  private model: RenderModel | null = null;
  private selBufferData: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private hotBufferData: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private proj: Float32Array<ArrayBufferLike> = new Float32Array(16);
  private view: Float32Array<ArrayBufferLike> = new Float32Array(16);
  private eye = [0, 0, 0];
  private time = 0;
  private dpr = 1;
  mode: ViewMode = 'solid';
  threshold = 1.15;
  selection = -1;
  hover = -1;
  camera: Camera = { yaw: -0.72, pitch: 0.3, dist: 62, target: [0, 4, -7] };
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 不可用');
    this.gl = gl;
    this.surfProg = program(gl, SURF_VS, SURF_FS);
    this.ptProg = program(gl, POINT_VS, POINT_FS);
    this.latticeProg = program(gl, LINE_VS, LINE_FS);
    this.vao = gl.createVertexArray()!;
    this.ptVao = gl.createVertexArray()!;
    ['pos', 'nrm', 'curv', 'thick', 'uv', 'inner'].forEach((k) => {
      this.buffers[k] = gl.createBuffer()!;
    });
    this.indexBuffer = gl.createBuffer();
    this.ptPosBuffer = gl.createBuffer();
    this.ptSelBuffer = gl.createBuffer();
    this.ptHotBuffer = gl.createBuffer();
    this.lineBuffer = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setModel(model: RenderModel) {
    const gl = this.gl;
    const nu = model.nu;
    const nv = model.nv;
    const N = nu * nv;
    this.model = model;
    this.frameModel();

    const pos = new Float32Array(N * 6);
    const nrm = new Float32Array(N * 6);
    const curv = new Float32Array(N * 2);
    const thick = new Float32Array(N * 2);
    const uv = new Float32Array(N * 4);
    const inner = new Float32Array(N * 2);
    for (let v = 0; v < N; v++) {
      const i = Math.floor(v / nv);
      const j = v % nv;
      const u = i / (nu - 1);
      const w = j / (nv - 1);
      for (let c = 0; c < 3; c++) {
        pos[v * 3 + c] = model.pos[v * 3 + c];
        pos[(N + v) * 3 + c] = model.inner[v * 3 + c];
        nrm[v * 3 + c] = model.nrm[v * 3 + c];
        nrm[(N + v) * 3 + c] = -model.nrm[v * 3 + c];
      }
      curv[v] = model.curv[v];
      curv[N + v] = model.curv[v];
      thick[v] = model.thick[v];
      thick[N + v] = model.thick[v];
      uv[v * 2] = u;
      uv[v * 2 + 1] = w;
      uv[(N + v) * 2] = u;
      uv[(N + v) * 2 + 1] = w;
      inner[v] = 0;
      inner[N + v] = 1;
    }

    const uBuf = new Float32Array(nu * nv * 8);
    const idx: number[] = [];
    // orientation check for the outer surface
    const p = (i: number, j: number) => {
      const k = (i * nv + j) * 3;
      return [model.pos[k], model.pos[k + 1], model.pos[k + 2]];
    };
    const a = p(0, 0);
    const b = p(0, 1);
    const c = p(1, 0);
    const cr = cross(
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    );
    const n0 = [model.nrm[0], model.nrm[1], model.nrm[2]];
    const flip = dot(cr, n0) < 0;

    const quad = (i: number, j: number, base: number, reverse: boolean) => {
      const k00 = base + i * nv + j;
      const k01 = base + i * nv + j + 1;
      const k10 = base + (i + 1) * nv + j;
      const k11 = base + (i + 1) * nv + j + 1;
      if (reverse) {
        idx.push(k00, k01, k10, k01, k11, k10);
      } else {
        idx.push(k00, k10, k01, k01, k10, k11);
      }
    };
    for (let i = 0; i < nu - 1; i++) {
      for (let j = 0; j < nv - 1; j++) {
        quad(i, j, 0, flip);
        quad(i, j, N, !flip);
      }
    }
    // rim rings at both u ends
    const rimBand = (i: number) => {
      for (let j = 0; j < nv - 1; j++) {
        const o0 = i * nv + j;
        const o1 = i * nv + j + 1;
        const in0 = N + o0;
        const in1 = N + o1;
        idx.push(o0, in0, o1, o1, in0, in1);
        idx.push(o1, in0, o0, in1, in0, o1); // double-sided rim
      }
    };
    rimBand(0);
    rimBand(nu - 1);

    const gl2 = gl;
    gl2.bindVertexArray(this.vao);
    const setAttr = (name: string, data: Float32Array, size: number) => {
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.buffers[name.slice(1).toLowerCase()]);
      gl2.bufferData(gl2.ARRAY_BUFFER, data, gl2.DYNAMIC_DRAW);
      const loc = gl2.getAttribLocation(this.surfProg, name);
      if (loc >= 0) {
        gl2.enableVertexAttribArray(loc);
        gl2.vertexAttribPointer(loc, size, gl2.FLOAT, false, 0, 0);
      }
    };
    setAttr('aPos', pos, 3);
    setAttr('aNrm', nrm, 3);
    setAttr('aCurv', curv, 1);
    setAttr('aThick', thick, 1);
    setAttr('aUV', uv, 2);
    setAttr('aInner', inner, 1);

    gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    const idxArr = new Uint32Array(idx);
    gl2.bufferData(gl2.ELEMENT_ARRAY_BUFFER, idxArr, gl2.STATIC_DRAW);
    this.indexCount = idxArr.length;
    gl2.bindVertexArray(null);

    // handles
    this.handleCount = model.handlePos.length / 3;
    this.selBufferData = new Float32Array(this.handleCount);
    this.hotBufferData = new Float32Array(this.handleCount);
    gl2.bindVertexArray(this.ptVao);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.ptPosBuffer);
    gl2.bufferData(gl2.ARRAY_BUFFER, model.handlePos, gl2.DYNAMIC_DRAW);
    const pLoc = gl2.getAttribLocation(this.ptProg, 'aPos');
    gl2.enableVertexAttribArray(pLoc);
    gl2.vertexAttribPointer(pLoc, 3, gl2.FLOAT, false, 0, 0);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.ptSelBuffer);
    gl2.bufferData(gl2.ARRAY_BUFFER, this.selBufferData, gl2.DYNAMIC_DRAW);
    const sLoc = gl2.getAttribLocation(this.ptProg, 'aSel');
    gl2.enableVertexAttribArray(sLoc);
    gl2.vertexAttribPointer(sLoc, 1, gl2.FLOAT, false, 0, 0);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.ptHotBuffer);
    gl2.bufferData(gl2.ARRAY_BUFFER, this.hotBufferData, gl2.DYNAMIC_DRAW);
    const hLoc = gl2.getAttribLocation(this.ptProg, 'aHot');
    gl2.enableVertexAttribArray(hLoc);
    gl2.vertexAttribPointer(hLoc, 1, gl2.FLOAT, false, 0, 0);
    gl2.bindVertexArray(null);

    this.latticeCount = model.lattice ? model.lattice.length / 3 : 0;
    this.latticeVao = gl2.createVertexArray()!;
    gl2.bindVertexArray(this.latticeVao);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, this.lineBuffer);
    gl2.bufferData(gl2.ARRAY_BUFFER, model.lattice ?? new Float32Array(0), gl2.DYNAMIC_DRAW);
    const lLoc = gl2.getAttribLocation(this.latticeProg, 'aPos');
    gl2.enableVertexAttribArray(lLoc);
    gl2.vertexAttribPointer(lLoc, 3, gl2.FLOAT, false, 0, 0);
    gl2.bindVertexArray(null);
    void uBuf;
  }

  setSelection(index: number, hotIndices: number[] = []) {
    this.selection = index;
    this.selBufferData.fill(0);
    this.hotBufferData.fill(0);
    if (index >= 0 && index < this.selBufferData.length) this.selBufferData[index] = 1;
    for (const h of hotIndices) if (h >= 0 && h < this.hotBufferData.length) this.hotBufferData[h] = 1;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptSelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.selBufferData, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptHotBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.hotBufferData, gl.DYNAMIC_DRAW);
  }

  private updateCamera() {
    const { yaw, pitch, dist, target } = this.camera;
    const cp = Math.cos(pitch);
    const eye = [
      target[0] + dist * Math.cos(yaw) * cp,
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.sin(yaw),
    ];
    this.eye = eye;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    this.proj = perspective((32 * Math.PI) / 180, aspect, 1, 400);
    this.view = lookAt(eye, target, [0, 1, 0]);
  }

  render(time: number) {
    if (this.disposed || !this.model) return;
    const gl = this.gl;
    this.resize();
    this.time = time;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.updateCamera();

    gl.useProgram(this.surfProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfProg, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfProg, 'uProj'), false, this.proj);
    gl.uniform1i(
      gl.getUniformLocation(this.surfProg, 'uMode'),
      this.mode === 'curv' ? 1 : this.mode === 'thick' ? 2 : 0,
    );
    gl.uniform1f(gl.getUniformLocation(this.surfProg, 'uThreshold'), this.threshold);
    gl.uniform1f(gl.getUniformLocation(this.surfProg, 'uTime'), time);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    if (this.showLattice && this.latticeVao && this.latticeCount > 0) {
      gl.useProgram(this.latticeProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.latticeProg, 'uView'), false, this.view);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.latticeProg, 'uProj'), false, this.proj);
      gl.uniform3f(gl.getUniformLocation(this.latticeProg, 'uColor'), 0.36, 0.72, 0.68);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.latticeVao);
      gl.drawArrays(gl.LINES, 0, this.latticeCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    gl.useProgram(this.ptProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.ptProg, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.ptProg, 'uProj'), false, this.proj);
    gl.uniform1f(gl.getUniformLocation(this.ptProg, 'uDpr'), this.dpr);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.ptVao);
    gl.drawArrays(gl.POINTS, 0, this.handleCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  private projectRaw(x: number, y: number, z: number) {
    const m = this.view;
    const p = this.proj;
    const vx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const vy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const vz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
    const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12];
    const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
    const w = cw || 1e-5;
    const nx = cx / w;
    const ny = cy / w;
    return {
      x: (nx * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (1 - (ny * 0.5 + 0.5)) * this.canvas.clientHeight,
      depth: w,
      visible: cw > 0,
      ndc: { x: nx, y: ny },
    };
  }

  projectHandle(i: number) {
    if (!this.model) return null;
    const p = this.model.handlePos;
    return this.projectRaw(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }

  getHandleBasis(i: number) {
    if (!this.model) return null;
    const p = this.model.handlePos;
    const f = this.model.handleFrames;
    const o = this.projectRaw(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const nx = f[i * 6];
    const ny = f[i * 6 + 1];
    const nz = f[i * 6 + 2];
    const tx = f[i * 6 + 3];
    const ty = f[i * 6 + 4];
    const tz = f[i * 6 + 5];
    const a = this.projectRaw(p[i * 3] + nx * 1.0, p[i * 3 + 1] + ny * 1.0, p[i * 3 + 2] + nz * 1.0);
    const b = this.projectRaw(p[i * 3] + tx * 1.0, p[i * 3 + 1] + ty * 1.0, p[i * 3 + 2] + tz * 1.0);
    return {
      origin: { x: o.x, y: o.y },
      dr: { x: a.x - o.x, y: a.y - o.y },
      dz: { x: b.x - o.x, y: b.y - o.y },
    };
  }

  pick(clientX: number, clientY: number): number {
    if (!this.model) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best = -1;
    let bestD = 15;
    const count = this.handleCount;
    for (let i = 0; i < count; i++) {
      const pr = this.projectHandle(i);
      if (!pr || !pr.visible) continue;
      const d = Math.hypot(pr.x - mx, pr.y - my);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  orbit(dx: number, dy: number) {
    this.userFramed = true;
    this.camera.yaw += dx * 0.0072;
    const lim = Math.PI / 2 - 0.06;
    this.camera.pitch = Math.max(-lim, Math.min(lim, this.camera.pitch - dy * 0.0062));
  }

  zoom(delta: number) {
    this.userFramed = true;
    this.camera.dist = Math.max(28, Math.min(140, this.camera.dist * Math.exp(delta * 0.0011)));
  }

  pan(dx: number, dy: number) {
    this.userFramed = true;
    const s = this.camera.dist * 0.0016;
    const { yaw } = this.camera;
    const right = [Math.cos(yaw), 0, Math.sin(yaw)];
    const upv = [0, 1, 0];
    this.camera.target = [
      this.camera.target[0] - right[0] * dx * s + upv[0] * dy * s,
      this.camera.target[1] - right[1] * dx * s + upv[1] * dy * s,
      this.camera.target[2] - right[2] * dx * s + upv[2] * dy * s,
    ];
  }

  fit() {
    this.camera.yaw = -0.72;
    this.camera.pitch = 0.3;
    this.frameModel(true);
  }

  private frameModel(force = false) {
    const model = this.model;
    if (!model) return;
    if (this.userFramed && !force) return;
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    for (let i = 0; i < model.pos.length; i += 3) {
      minX = Math.min(minX, model.pos[i]); maxX = Math.max(maxX, model.pos[i]);
      minY = Math.min(minY, model.pos[i + 1]); maxY = Math.max(maxY, model.pos[i + 1]);
      minZ = Math.min(minZ, model.pos[i + 2]); maxZ = Math.max(maxZ, model.pos[i + 2]);
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    this.camera.target = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    this.camera.dist = Math.max(40, span * 2.0);
  }

  dispose() {
    this.disposed = true;
    const gl = this.gl;
    gl.deleteProgram(this.surfProg);
    gl.deleteProgram(this.ptProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.ptVao);
    if (this.latticeVao) gl.deleteVertexArray(this.latticeVao);
    gl.deleteProgram(this.latticeProg);
    if (this.lineBuffer) gl.deleteBuffer(this.lineBuffer);
    Object.values(this.buffers).forEach((b) => gl.deleteBuffer(b));
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
  }
}
