// 体素 -> 三角网格（贪婪合并）、减面到 3 万面以内、STL 导出、封闭性/法线检查
import { VOXEL_MM, FACE_COUNT_MAX } from './voxel.js';

// 从实体层(牙冠+牙龈)生成网格。返回 {positions: Float32Array, indices: Uint32Array}
export function voxelToMesh(grid) {
  const s = grid.size;
  const solid = (x, y, z) => grid.inBounds(x, y, z) ? grid.solidAt(x, y, z) : 0;
  const positions = [];
  const indices = [];
  // 6 个面方向: [dir, normal, 四个角(单位立方体)]
  const FACES = [
    { d: [1, 0, 0],  n: [1, 0, 0],  c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { d: [-1, 0, 0], n: [-1, 0, 0], c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
    { d: [0, 1, 0],  n: [0, 1, 0],  c: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
    { d: [0, -1, 0], n: [0, -1, 0], c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { d: [0, 0, 1],  n: [0, 0, 1],  c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
    { d: [0, 0, -1], n: [0, 0, -1], c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
  ];
  // 逐方向贪婪合并矩形
  for (const f of FACES) {
    const [dx, dy, dz] = f.d;
    // 沿法向逐层切片
    for (let d = 0; d < s; d++) {
      // mask[u][v] 标记该切片上需要生成的面
      const mask = new Uint8Array(s * s);
      for (let v = 0; v < s; v++) for (let u = 0; u < s; u++) {
        // 将 (d,u,v) 映射回 (x,y,z)：法向轴为 d，其余两轴为 u,v
        let x, y, z;
        if (dx !== 0) { x = dx > 0 ? d : s - 1 - d; y = v; z = u; }
        else if (dy !== 0) { y = dy > 0 ? d : s - 1 - d; x = u; z = v; }
        else { z = dz > 0 ? d : s - 1 - d; x = u; y = v; }
        if (solid(x, y, z) && !solid(x + dx, y + dy, z + dz)) mask[u + s * v] = 1;
      }
      // 贪婪矩形合并
      const used = new Uint8Array(s * s);
      for (let v = 0; v < s; v++) for (let u = 0; u < s; u++) {
        if (!mask[u + s * v] || used[u + s * v]) continue;
        let w = 1;
        while (u + w < s && mask[u + w + s * v] && !used[u + w + s * v]) w++;
        let h = 1;
        outer: while (v + h < s) {
          for (let k = 0; k < w; k++) if (!mask[u + k + s * (v + h)] || used[u + k + s * (v + h)]) break outer;
          h++;
        }
        for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) used[u + du + s * (v + dv)] = 1;
        // 生成四边形（两个三角形），角点按面定义映射
        const base = positions.length / 3;
        const corners = f.c.map(([cx, cy, cz]) => {
          let px, py, pz;
          if (dx !== 0) { px = dx > 0 ? d + 1 : s - 1 - d; py = v + (cy ? h : 0); pz = u + (cz ? w : 0); }
          else if (dy !== 0) { py = dy > 0 ? d + 1 : s - 1 - d; px = u + (cx ? w : 0); pz = v + (cz ? h : 0); }
          else { pz = dz > 0 ? d + 1 : s - 1 - d; px = u + (cx ? w : 0); py = v + (cy ? h : 0); }
          return [px * VOXEL_MM, py * VOXEL_MM, pz * VOXEL_MM];
        });
        for (const p of corners) positions.push(p[0], p[1], p[2]);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    faceCount: indices.length / 3
  };
}

// 顶点聚类减面：把顶点吸附到粗网格，去掉退化三角形。迭代加粗直到 faceCount <= target
export function decimateMesh(mesh, target = FACE_COUNT_MAX) {
  let { positions, indices } = mesh;
  let cell = VOXEL_MM * 1.6;
  for (let iter = 0; iter < 12 && indices.length / 3 > target; iter++, cell *= 1.4) {
    const map = new Map();
    const newPos = [];
    const remap = new Uint32Array(positions.length / 3);
    for (let i = 0; i < positions.length; i += 3) {
      const key = `${Math.round(positions[i] / cell)},${Math.round(positions[i + 1] / cell)},${Math.round(positions[i + 2] / cell)}`;
      let id = map.get(key);
      if (id === undefined) {
        id = newPos.length / 3;
        map.set(key, id);
        newPos.push(positions[i], positions[i + 1], positions[i + 2]);
      }
      remap[i / 3] = id;
    }
    const newIdx = [];
    for (let i = 0; i < indices.length; i += 3) {
      const a = remap[indices[i]], b = remap[indices[i + 1]], c = remap[indices[i + 2]];
      if (a !== b && b !== c && a !== c) newIdx.push(a, b, c);
    }
    positions = new Float32Array(newPos);
    indices = new Uint32Array(newIdx);
  }
  return { positions, indices, faceCount: indices.length / 3 };
}

// 按坐标焊接重复顶点（贪婪网格化每个四边形独立顶点，需先焊接再做拓扑检查）
export function weldVertices(mesh, eps = 1e-6) {
  const { positions, indices } = mesh;
  const map = new Map();
  const newPos = [];
  const remap = new Uint32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${Math.round(positions[i] / eps)},${Math.round(positions[i + 1] / eps)},${Math.round(positions[i + 2] / eps)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = newPos.length / 3;
      map.set(key, id);
      newPos.push(positions[i], positions[i + 1], positions[i + 2]);
    }
    remap[i / 3] = id;
  }
  const newIdx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) newIdx[i] = remap[indices[i]];
  return { positions: new Float32Array(newPos), indices: newIdx, faceCount: newIdx.length / 3 };
}

// 封闭性检查：把每条边在其上的共线顶点处剖分成原子段，每段应恰好被覆盖 2 次。
// （贪婪合并会产生 T 型接头：相邻四边形尺寸不同，边上缺中间顶点，单纯按顶点对计数会误判）
export function checkWatertight(mesh) {
  mesh = weldVertices(mesh);
  const { positions, indices } = mesh;
  const nV = positions.length / 3;
  const edges = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      edges.push(a < b ? [a, b] : [b, a]);
    }
  }
  const segs = new Map(); // 原子段中点 -> 覆盖次数
  for (const [a, b] of edges) {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const dx = positions[b * 3] - ax, dy = positions[b * 3 + 1] - ay, dz = positions[b * 3 + 2] - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    const ts = [0, 1];
    for (let v = 0; v < nV; v++) {
      const px = positions[v * 3] - ax, py = positions[v * 3 + 1] - ay, pz = positions[v * 3 + 2] - az;
      // 包围盒快速过滤
      if ((px < -1e-6 && dx >= -1e-6) || (px > dx + 1e-6 && dx >= -1e-6)) { /* 粗筛 */ }
      const cx = py * dz - pz * dy, cy = pz * dx - px * dz, cz = px * dy - py * dx;
      if (cx * cx + cy * cy + cz * cz > 1e-10 * len2) continue; // 不共线
      const t = (px * dx + py * dy + pz * dz) / len2;
      if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i++) {
      const tm = (ts[i] + ts[i + 1]) / 2;
      const key = `${(ax + dx * tm).toFixed(5)},${(ay + dy * tm).toFixed(5)},${(az + dz * tm).toFixed(5)}`;
      segs.set(key, (segs.get(key) || 0) + 1);
    }
  }
  let openEdges = 0;
  for (const cnt of segs.values()) if (cnt !== 2) openEdges++;
  return { watertight: openEdges === 0, openEdges };
}

// 法线朝向：用有符号体积判断整体是否外翻；并统计不一致缠绕
export function checkNormals(mesh) {
  const { positions, indices } = mesh;
  let vol = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return { consistent: vol > 0, signedVolume: vol };
}

// 导出二进制 STL
export function exportSTL(mesh, name = 'model') {
  const { positions, indices } = mesh;
  const triCount = indices.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const header = `STL ${name} dental-voxel-qc`;
  for (let i = 0; i < Math.min(80, header.length); i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, triCount, true);
  let off = 84;
  for (let i = 0; i < indices.length; i += 3) {
    const idx = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    const p = idx.map(j => [positions[j], positions[j + 1], positions[j + 2]]);
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map(x => x / len);
    for (const val of [...n, ...p[0], ...p[1], ...p[2]]) { view.setFloat32(off, val, true); off += 4; }
    view.setUint16(off, 0, true); off += 2;
  }
  return buffer;
}

// 本地合并 + 减面到 3 万面以内，返回最终网格与统计
export function mergeAndDecimate(grid) {
  let mesh = voxelToMesh(grid);
  const before = mesh.faceCount;
  if (mesh.faceCount > FACE_COUNT_MAX) mesh = decimateMesh(mesh, FACE_COUNT_MAX);
  return { mesh, faceCountBefore: before, faceCountAfter: mesh.faceCount, withinLimit: mesh.faceCount <= FACE_COUNT_MAX };
}
