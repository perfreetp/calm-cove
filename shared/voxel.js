// 体素网格核心：分层(牙冠/牙龈/邻牙)、画笔、镜像、选区、连通域分析
// 纯 JS，前端编辑器与后端质检共用。

export const LAYERS = ['crown', 'gingiva', 'adjacent'];
export const LAYER_NAMES = { crown: '牙冠', gingiva: '牙龈', adjacent: '邻牙' };
// 每层默认颜色
export const LAYER_COLORS = { crown: 0xe8e0d0, gingiva: 0xd98a8a, adjacent: 0x9fb8d8 };

export const GRID_SIZE = 32;          // 每颗牙 32^3 体素
export const VOXEL_MM = 0.25;         // 体素边长 0.25mm -> 单牙 8mm 见方
export const WALL_THICKNESS_MIN_MM = 1.5;
export const CONNECTOR_AREA_MIN_MM2 = 9;
export const FACE_COUNT_MAX = 30000;

export class VoxelGrid {
  constructor(size = GRID_SIZE) {
    this.size = size;
    // 每层一个 Uint8Array
    this.layers = {};
    for (const l of LAYERS) this.layers[l] = new Uint8Array(size * size * size);
  }
  idx(x, y, z) { return x + this.size * (y + this.size * z); }
  inBounds(x, y, z) {
    const s = this.size;
    return x >= 0 && y >= 0 && z >= 0 && x < s && y < s && z < s;
  }
  get(layer, x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.layers[layer][this.idx(x, y, z)];
  }
  set(layer, x, y, z, v) {
    if (!this.inBounds(x, y, z)) return false;
    this.layers[layer][this.idx(x, y, z)] = v ? 1 : 0;
    return true;
  }
  // 任意层有体素
  anyAt(x, y, z) {
    for (const l of LAYERS) if (this.get(l, x, y, z)) return 1;
    return 0;
  }
  // 打印实体层（牙冠+牙龈，邻牙仅参考不打印）
  solidAt(x, y, z) {
    return this.get('crown', x, y, z) || this.get('gingiva', x, y, z) ? 1 : 0;
  }
  count(layer = null) {
    let n = 0;
    const arrs = layer ? [this.layers[layer]] : LAYERS.map(l => this.layers[l]);
    for (const a of arrs) for (let i = 0; i < a.length; i++) n += a[i];
    return n;
  }
  countSolid() { return this.count('crown') + this.count('gingiva'); }

  // 球形画笔：add=true 增，false 减。返回改动数。
  brush(layer, cx, cy, cz, radius, add) {
    let changed = 0;
    const r = Math.max(0.5, radius);
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x - cx, dy = y - cy, dz = z - cz;
          if (dx * dx + dy * dy + dz * dz <= r * r) {
            const before = this.get(layer, x, y, z);
            const after = add ? 1 : 0;
            if (before !== after) { this.set(layer, x, y, z, after); changed++; }
          }
        }
    return changed;
  }

  // 左右镜像：绕 X 中轴翻转（同名牙对称编辑，如 11<->21）
  mirrorX(layer) {
    const s = this.size, src = this.layers[layer].slice();
    for (let z = 0; z < s; z++)
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++)
          this.layers[layer][this.idx(s - 1 - x, y, z)] = src[this.idx(x, y, z)];
  }
  // 镜像坐标
  mirrorCoord(x) { return this.size - 1 - x; }

  // 选区提取（含所有层）
  extractBox(min, max) {
    const sx = max.x - min.x + 1, sy = max.y - min.y + 1, sz = max.z - min.z + 1;
    const data = {};
    for (const l of LAYERS) {
      data[l] = new Uint8Array(sx * sy * sz);
      for (let z = 0; z < sz; z++)
        for (let y = 0; y < sy; y++)
          for (let x = 0; x < sx; x++)
            data[l][x + sx * (y + sy * z)] = this.get(l, min.x + x, min.y + y, min.z + z);
    }
    return { dims: { x: sx, y: sy, z: sz }, data };
  }
  // 粘贴到目标锚点（可跨牙位）
  pasteBox(clip, ax, ay, az) {
    const { dims, data } = clip;
    let pasted = 0;
    for (const l of LAYERS)
      for (let z = 0; z < dims.z; z++)
        for (let y = 0; y < dims.y; y++)
          for (let x = 0; x < dims.x; x++) {
            const v = data[l][x + dims.x * (y + dims.y * z)];
            if (v && this.set(l, ax + x, ay + y, az + z, 1)) pasted++;
          }
    return pasted;
  }

  // 连通域（实体层），返回 [{size, voxels:[idx...]}]，6 邻接
  connectedComponents() {
    const s = this.size, n = s * s * s;
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = (this.layers.crown[i] || this.layers.gingiva[i]) ? 1 : 0;
    const seen = new Uint8Array(n);
    const comps = [];
    const D = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (let i = 0; i < n; i++) {
      if (!solid[i] || seen[i]) continue;
      const voxels = [];
      const stack = [i]; seen[i] = 1;
      while (stack.length) {
        const c = stack.pop(); voxels.push(c);
        const cx = c % s, cy = ((c / s) | 0) % s, cz = (c / (s * s)) | 0;
        for (const [dx, dy, dz] of D) {
          const nx = cx + dx, ny = cy + dy, nz = cz + dz;
          if (!this.inBounds(nx, ny, nz)) continue;
          const ni = this.idx(nx, ny, nz);
          if (solid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
        }
      }
      comps.push({ size: voxels.length, voxels });
    }
    comps.sort((a, b) => b.size - a.size);
    return comps;
  }

  // 冠壁厚估计：对每个牙冠表面体素，沿内法线（空邻居方向的反方向）步进穿透实体，
  // 步长 0.5 体素，厚度 = 穿透距离(mm)。取所有表面体素的最小值。
  minWallThickness() {
    const s = this.size;
    let min = Infinity;
    let minPos = null;
    const D = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const STEP = 0.5, MAX_STEPS = s * 2;
    for (let z = 0; z < s; z++) for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (!this.get('crown', x, y, z)) continue;
      // 外法线 = 空邻居方向之和
      let nx = 0, ny = 0, nz = 0, empty = 0;
      for (const [dx, dy, dz] of D) {
        if (!this.solidAt(x + dx, y + dy, z + dz)) { nx += dx; ny += dy; nz += dz; empty++; }
      }
      if (!empty) continue; // 非表面
      const len = Math.hypot(nx, ny, nz) || 1;
      const ix = -nx / len, iy = -ny / len, iz = -nz / len; // 内法线
      // 从体素中心沿内法线步进，直到穿出实体
      let t = 0, steps = 0;
      let px = x + 0.5, py = y + 0.5, pz = z + 0.5;
      while (steps++ < MAX_STEPS) {
        px += ix * STEP; py += iy * STEP; pz += iz * STEP;
        t += STEP;
        if (!this.solidAt(Math.floor(px), Math.floor(py), Math.floor(pz))) break;
      }
      const thick = t * VOXEL_MM;
      if (thick < min) { min = thick; minPos = { x, y, z }; }
    }
    return { minMm: min === Infinity ? 0 : min, pos: minPos };
  }

  // 桥体连接体截面积估计：对桥体(connector)类型，取中部 X 切片实体体素数 * 体素面积
  connectorArea() {
    const s = this.size;
    let best = Infinity, bestZ = -1;
    for (let z = Math.floor(s * 0.3); z < Math.floor(s * 0.7); z++) {
      let area = 0;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (this.solidAt(x, y, z)) area++;
      const mm2 = area * VOXEL_MM * VOXEL_MM;
      if (area > 0 && mm2 < best) { best = mm2; bestZ = z; }
    }
    return { areaMm2: best === Infinity ? 0 : best, z: bestZ };
  }

  // 序列化：每层 RLE [count0, count1, ...] 交替游程
  serialize() {
    const out = { size: this.size, layers: {} };
    for (const l of LAYERS) {
      const a = this.layers[l];
      const rle = [];
      let cur = 0, run = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === cur) run++;
        else { rle.push(run); cur = a[i]; run = 1; }
      }
      rle.push(run);
      out.layers[l] = rle;
    }
    return out;
  }
  static deserialize(obj) {
    const g = new VoxelGrid(obj.size);
    for (const l of LAYERS) {
      const rle = obj.layers[l] || [0];
      const a = g.layers[l];
      let cur = 0, i = 0;
      for (const run of rle) { a.fill(cur, i, i + run); i += run; cur = 1 - cur; }
    }
    return g;
  }
}

// FDI 牙位 -> 镜像同名牙位（左右对称）
export function mirrorToothPosition(pos) {
  const n = parseInt(pos, 10);
  if (isNaN(n) || n < 11 || n > 48) return null;
  const q = Math.floor(n / 10), t = n % 10;
  const mq = { 1: 2, 2: 1, 3: 4, 4: 3 }[q];
  if (!mq) return null;
  return String(mq * 10 + t);
}

// 程序化生成初始牙形（牙冠椭圆顶 + 牙龈底座 + 两侧邻牙参考）
export function generateInitialTooth(grid, restorationType = 'crown') {
  const s = grid.size, c = (s - 1) / 2;
  const rx = s * 0.30, rz = s * 0.34;
  // 牙冠：上半椭球壳（含一定壁厚）
  for (let z = 0; z < s; z++) for (let y = Math.floor(s * 0.35); y < s; y++) for (let x = 0; x < s; x++) {
    const ny = (y - s * 0.35) / (s * 0.62);
    const shrink = 1 - ny * ny * 0.55;
    const dx = (x - c) / (rx * shrink), dz = (z - c) / (rz * shrink);
    const d = dx * dx + dz * dz;
    if (d <= 1 && ny <= 1) {
      // 壳体：外表面到内腔
      const inner = 1 - (WALL_THICKNESS_MIN_MM + 0.3) / VOXEL_MM / (rx * shrink);
      if (d >= inner * inner || y > s * 0.85) grid.set('crown', x, y, z, 1);
    }
  }
  // 牙龈底座
  for (let z = 0; z < s; z++) for (let y = Math.floor(s * 0.18); y <= Math.floor(s * 0.38); y++) for (let x = 0; x < s; x++) {
    const dx = (x - c) / (s * 0.36), dz = (z - c) / (s * 0.40);
    if (dx * dx + dz * dz <= 1) grid.set('gingiva', x, y, z, 1);
  }
  // 邻牙参考（两侧小块）
  for (const side of [-1, 1]) {
    const cx = c + side * s * 0.42;
    for (let z = Math.floor(c - 4); z <= Math.ceil(c + 4); z++)
      for (let y = Math.floor(s * 0.3); y <= Math.floor(s * 0.75); y++)
        for (let x = Math.floor(cx - 2); x <= Math.ceil(cx + 2); x++) {
          const dx = (x - cx) / 2.5, dy = (y - s * 0.5) / (s * 0.24), dz = (z - c) / 4.5;
          if (dx * dx + dy * dy + dz * dz <= 1) grid.set('adjacent', x, y, z, 1);
        }
  }
  // 桥体类型：加连接体杆
  if (restorationType === 'bridge') {
    for (let z = Math.floor(c - 2); z <= Math.ceil(c + 2); z++)
      for (let y = Math.floor(s * 0.45); y <= Math.floor(s * 0.6); y++)
        for (let x = 0; x < s; x++)
          grid.set('crown', x, y, z, 1);
  }
  return grid;
}
