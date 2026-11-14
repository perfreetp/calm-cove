// 原生 WebGL2 体素渲染器：轨道相机 + 网格块 + 层平面 + 选区/光标线框 + 拾取
const MESH_VS = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aNormal; in vec3 aColor;
uniform mat4 uMVP;
out vec3 vN; out vec3 vC;
void main(){ vN = aNormal; vC = aColor; gl_Position = uMVP * vec4(aPos, 1.0); }`

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC;
uniform vec3 uLight;
out vec4 frag;
void main(){
  float d = max(dot(normalize(vN), normalize(uLight)), 0.0);
  vec3 c = vC * (0.45 + 0.55 * d);
  frag = vec4(c, 1.0);
}`

const LINE_VS = `#version 300 es
precision highp float;
in vec3 aPos;
uniform mat4 uMVP;
void main(){ gl_Position = uMVP * vec4(aPos, 1.0); }`

const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 frag;
void main(){ frag = uColor; }`

// ---- 最小 mat4 ----
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far)
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]
}
function lookAt(eye, c, up) {
  let z = norm(sub(eye, c)), x = norm(cross(up, z)), y = cross(z, x)
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]
}
function mul(a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function invert(m) {
  const inv = new Array(16)
  const [a00,a01,a02,a03,a10,a11,a12,a13,a20,a21,a22,a23,a30,a31,a32,a33] = m
  const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10, b03=a01*a12-a02*a11
  const b04=a01*a13-a03*a11, b05=a02*a13-a03*a12, b06=a20*a31-a21*a30, b07=a20*a32-a22*a30
  const b08=a20*a33-a23*a30, b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32
  let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06
  if (!det) return null
  det = 1.0/det
  inv[0]=(a11*b11-a12*b10+a13*b09)*det; inv[1]=(a02*b10-a01*b11-a03*b09)*det
  inv[2]=(a31*b05-a32*b04+a33*b03)*det; inv[3]=(a22*b04-a21*b05-a23*b03)*det
  inv[4]=(a12*b08-a10*b11-a13*b07)*det; inv[5]=(a00*b11-a02*b08+a03*b07)*det
  inv[6]=(a32*b02-a30*b05-a33*b01)*det; inv[7]=(a20*b05-a22*b02+a23*b01)*det
  inv[8]=(a10*b10-a11*b08+a13*b06)*det; inv[9]=(a01*b08-a00*b10-a03*b06)*det
  inv[10]=(a30*b04-a31*b02+a33*b00)*det; inv[11]=(a21*b02-a20*b04-a23*b00)*det
  inv[12]=(a11*b07-a10*b10-a12*b06)*det; inv[13]=(a00*b10-a01*b07+a02*b06)*det
  inv[14]=(a31*b01-a30*b03-a32*b00)*det; inv[15]=(a20*b03-a21*b01+a22*b00)*det
  return inv
}
function xform(m, v) {
  const [x, y, z, w] = v
  const o = [0, 0, 0, 0]
  for (let r = 0; r < 4; r++) o[r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r] * w
  return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]
}
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]] }
function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2] }
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0]/l, a[1]/l, a[2]/l] }

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}
function program(gl, vs, fs) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  return p
}

export class VoxelRenderer {
  constructor(canvas) {
    this.canvas = canvas
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true })
    if (!gl) throw new Error('当前浏览器不支持 WebGL2')
    this.meshProg = program(gl, MESH_VS, MESH_FS)
    this.lineProg = program(gl, LINE_VS, LINE_FS)
    this.uMeshMVP = gl.getUniformLocation(this.meshProg, 'uMVP')
    this.uMeshLight = gl.getUniformLocation(this.meshProg, 'uLight')
    this.uLineMVP = gl.getUniformLocation(this.lineProg, 'uMVP')
    this.uLineColor = gl.getUniformLocation(this.lineProg, 'uColor')

    this.camera = { yaw: 0.8, pitch: 0.55, dist: 42, target: [0, 3, 0] }
    this.dims = [24, 12, 24]
    this.layer = 0
    this.selection = null
    this.cursor = null
    this.getVoxelFn = null
    this.gpuChunks = []
    this.gridVAO = null
    this.dynVAO = gl.createVertexArray()
    this.dynBuf = gl.createBuffer()
    this._setupDyn()
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
  }

  _setupDyn() {
    const gl = this.gl
    gl.bindVertexArray(this.dynVAO)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf)
    const loc = gl.getAttribLocation(this.lineProg, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
  }

  setChunks(chunks) {
    const gl = this.gl
    for (const c of this.gpuChunks) {
      gl.deleteVertexArray(c.vao)
      gl.deleteBuffer(c.vbo); gl.deleteBuffer(c.ibo)
    }
    this.gpuChunks = chunks.map(c => {
      const inter = new Float32Array(c.positions.length * 3)
      const n = c.positions.length / 3
      for (let i = 0; i < n; i++) {
        inter.set(c.positions.subarray(i * 3, i * 3 + 3), i * 9)
        inter.set(c.normals.subarray(i * 3, i * 3 + 3), i * 9 + 3)
        inter.set(c.colors.subarray(i * 3, i * 3 + 3), i * 9 + 6)
      }
      const vao = gl.createVertexArray()
      gl.bindVertexArray(vao)
      const vbo = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW)
      const p = gl.getAttribLocation(this.meshProg, 'aPos')
      const nn = gl.getAttribLocation(this.meshProg, 'aNormal')
      const co = gl.getAttribLocation(this.meshProg, 'aColor')
      gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 3, gl.FLOAT, false, 36, 0)
      gl.enableVertexAttribArray(nn); gl.vertexAttribPointer(nn, 3, gl.FLOAT, false, 36, 12)
      gl.enableVertexAttribArray(co); gl.vertexAttribPointer(co, 3, gl.FLOAT, false, 36, 24)
      const ibo = gl.createBuffer()
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, c.indices, gl.STATIC_DRAW)
      gl.bindVertexArray(null)
      return { vao, vbo, ibo, count: c.indices.length }
    })
  }

  setScene({ dims, layer, selection, cursor }) {
    if (dims) this.dims = dims
    if (layer !== undefined) this.layer = layer
    if (selection !== undefined) this.selection = selection
    if (cursor !== undefined) this.cursor = cursor
    this._rebuildGrid()
  }

  _rebuildGrid() {
    const gl = this.gl
    const [nx, , nz] = this.dims
    const ox = -nx / 2, oz = -nz / 2
    const lines = []
    // 地面网格
    for (let i = 0; i <= nx; i++) lines.push(ox + i, 0, oz, ox + i, 0, oz + nz)
    for (let k = 0; k <= nz; k++) lines.push(ox, 0, oz + k, ox + nx, 0, oz + k)
    // 当前层平面网格
    const y = this.layer + 1
    for (let i = 0; i <= nx; i++) lines.push(ox + i, y, oz, ox + i, y, oz + nz)
    for (let k = 0; k <= nz; k++) lines.push(ox, y, oz + k, ox + nx, y, oz + k)
    this.gridLineCount = lines.length / 3
    if (!this.gridBuf) this.gridBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW)
    if (!this.gridVAO) {
      this.gridVAO = gl.createVertexArray()
      gl.bindVertexArray(this.gridVAO)
      const loc = gl.getAttribLocation(this.lineProg, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
      gl.bindVertexArray(null)
    }
  }

  resize() {
    const c = this.canvas
    const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  }

  _vp() {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height)
    const proj = perspective(50 * Math.PI / 180, aspect, 0.1, 500)
    const { yaw, pitch, dist, target } = this.camera
    const eye = [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw)
    ]
    return { mvp: mul(proj, lookAt(eye, target, [0, 1, 0])), eye, proj, view: lookAt(eye, target, [0, 1, 0]) }
  }

  render() {
    const gl = this.gl
    this.resize()
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0.13, 0.15, 0.17, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const { mvp } = this._vp()
    const mvpF = new Float32Array(mvp)

    gl.useProgram(this.meshProg)
    gl.uniformMatrix4fv(this.uMeshMVP, false, mvpF)
    gl.uniform3f(this.uMeshLight, 0.5, 1.0, 0.35)
    for (const c of this.gpuChunks) {
      gl.bindVertexArray(c.vao)
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0)
    }

    gl.useProgram(this.lineProg)
    gl.uniformMatrix4fv(this.uLineMVP, false, mvpF)
    // 地面网格 + 当前层网格（一段缓冲，前后两半不同色）
    const [nx, , nz] = this.dims
    const perPlane = (nx + 1 + nz + 1) * 2
    if (this.gridVAO) {
      gl.bindVertexArray(this.gridVAO)
      gl.uniform4f(this.uLineColor, 0.35, 0.38, 0.42, 1)
      gl.drawArrays(gl.LINES, 0, perPlane)
      gl.uniform4f(this.uLineColor, 0.95, 0.75, 0.3, 1)
      gl.drawArrays(gl.LINES, perPlane, perPlane)
    }
    // 选区线框
    if (this.selection) this._drawBox(this.selection, [0.3, 0.85, 1.0, 1])
    // 光标线框
    if (this.cursor) {
      const [cx, cy, cz] = this.cursor
      this._drawBox({ x0: cx, y0: cy, z0: cz, x1: cx, y1: cy, z1: cz }, [1.0, 0.55, 0.2, 1])
    }
    gl.bindVertexArray(null)
  }

  _drawBox(b, color) {
    const gl = this.gl
    const [nx, , nz] = this.dims
    const x0 = b.x0 - nx / 2, x1 = b.x1 + 1 - nx / 2
    const z0 = b.z0 - nz / 2, z1 = b.z1 + 1 - nz / 2
    const y0 = b.y0, y1 = b.y1 + 1
    const v = [
      x0,y0,z0, x1,y0,z0,  x1,y0,z0, x1,y0,z1,  x1,y0,z1, x0,y0,z1,  x0,y0,z1, x0,y0,z0,
      x0,y1,z0, x1,y1,z0,  x1,y1,z0, x1,y1,z1,  x1,y1,z1, x0,y1,z1,  x0,y1,z1, x0,y1,z0,
      x0,y0,z0, x0,y1,z0,  x1,y0,z0, x1,y1,z0,  x1,y0,z1, x1,y1,z1,  x0,y0,z1, x0,y1,z1
    ]
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW)
    gl.bindVertexArray(this.dynVAO)
    gl.uniform4f(this.uLineColor, color[0], color[1], color[2], color[3])
    gl.drawArrays(gl.LINES, 0, 24)
  }

  // 屏幕坐标 → 世界射线
  screenRay(px, py) {
    const r = this.canvas.getBoundingClientRect()
    const x = (2 * (px - r.left)) / r.width - 1
    const y = 1 - (2 * (py - r.top)) / r.height
    const { eye, proj, view } = this._vp()
    const inv = invert(mul(proj, view))
    if (!inv) return null
    const p1 = xform(inv, [x, y, -1, 1])
    const p2 = xform(inv, [x, y, 1, 1])
    return { o: eye, d: norm(sub(p2, p1)) }
  }

  // 射线与当前编辑层平面的交点 → 体素格
  layerCell(ray) {
    if (!ray || Math.abs(ray.d[1]) < 1e-6) return null
    const planeY = this.layer + 1
    const t = (planeY - ray.o[1]) / ray.d[1]
    if (t < 0) return null
    const [nx, , nz] = this.dims
    const gx = ray.o[0] + ray.d[0] * t + nx / 2
    const gz = ray.o[2] + ray.d[2] * t + nz / 2
    const cx = Math.floor(gx), cz = Math.floor(gz)
    if (cx < 0 || cz < 0 || cx >= nx || cz >= nz) return null
    return [cx, this.layer, cz]
  }

  // DDA 步进求第一个命中的实心体素（用于擦除）
  raycastVoxel(ray) {
    if (!ray || !this.getVoxelFn) return null
    const [nx, ny, nz] = this.dims
    const o = [ray.o[0] + nx / 2, ray.o[1], ray.o[2] + nz / 2]
    const d = ray.d
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2])
    const stepX = Math.sign(d[0]), stepY = Math.sign(d[1]), stepZ = Math.sign(d[2])
    const tdx = Math.abs(1 / (d[0] || 1e-9)), tdy = Math.abs(1 / (d[1] || 1e-9)), tdz = Math.abs(1 / (d[2] || 1e-9))
    let tmx = (stepX > 0 ? (x + 1 - o[0]) : (o[0] - x)) * tdx
    let tmy = (stepY > 0 ? (y + 1 - o[1]) : (o[1] - y)) * tdy
    let tmz = (stepZ > 0 ? (z + 1 - o[2]) : (o[2] - z)) * tdz
    for (let i = 0; i < 256; i++) {
      if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && this.getVoxelFn(x, y, z)) return [x, y, z]
      if (tmx < tmy && tmx < tmz) { x += stepX; tmx += tdx }
      else if (tmy < tmz) { y += stepY; tmy += tdy }
      else { z += stepZ; tmz += tdz }
      if ((x < -1 || x > nx || y < -1 || y > ny || z < -1 || z > nz)) {
        if (tmx > 200 && tmy > 200 && tmz > 200) break
      }
    }
    return null
  }

  destroy() {
    const ext = this.gl.getExtension('WEBGL_lose_context')
    if (ext) ext.loseContext()
  }
}
