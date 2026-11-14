// 质检规则：网格封闭、冠壁厚、桥体连接体面积、法线朝向、悬空体素块
// 分级：fatal(致命) / warning(警告) / info(提示)。致命未修完整批不能放行。
import { VoxelGrid, WALL_THICKNESS_MIN_MM, CONNECTOR_AREA_MIN_MM2, VOXEL_MM } from './voxel.js';
import { voxelToMesh, checkWatertight, checkNormals } from './mesh.js';

export const SEVERITY_NAMES = { fatal: '致命', warning: '警告', info: '提示' };
export const CHECK_NAMES = {
  watertight: '网格封闭性',
  wall_thickness: '冠壁厚度',
  connector_area: '桥体连接体面积',
  normals: '法线朝向',
  floating: '悬空体素块',
  voxel_count: '体素数量'
};

// 对单颗牙执行全部检查，返回问题列表
// issue: {toothPosition, checkType, severity, message, location:{x,y,z}|null}
export function runChecksOnTooth(toothPosition, serializedGrid, restorationType) {
  const grid = serializedGrid instanceof VoxelGrid ? serializedGrid : VoxelGrid.deserialize(serializedGrid);
  const issues = [];
  const loc = (p) => p ? { x: p.x, y: p.y, z: p.z } : null;

  // 1. 悬空体素块（实体层连通域 > 1，最大块之外的都算悬空）
  const comps = grid.connectedComponents();
  if (comps.length > 1) {
    for (let i = 1; i < comps.length; i++) {
      const c = comps[i];
      const s = grid.size;
      const first = c.voxels[0];
      issues.push({
        toothPosition, checkType: 'floating', severity: 'warning',
        message: `发现悬空体素块（${c.size} 个体素，未与主体连接）`,
        location: { x: first % s, y: ((first / s) | 0) % s, z: (first / (s * s)) | 0 }
      });
    }
  }

  // 2. 冠壁厚 < 1.5mm
  const wall = grid.minWallThickness();
  if (wall.minMm > 0 && wall.minMm < WALL_THICKNESS_MIN_MM) {
    issues.push({
      toothPosition, checkType: 'wall_thickness', severity: 'fatal',
      message: `冠壁厚 ${wall.minMm.toFixed(2)}mm，低于 ${WALL_THICKNESS_MIN_MM}mm 下限`,
      location: loc(wall.pos)
    });
  }

  // 3. 桥体连接体面积 < 9mm²（仅桥体类型）
  if (restorationType === 'bridge') {
    const conn = grid.connectorArea();
    if (conn.areaMm2 < CONNECTOR_AREA_MIN_MM2) {
      issues.push({
        toothPosition, checkType: 'connector_area', severity: 'fatal',
        message: `桥体连接体截面积 ${conn.areaMm2.toFixed(2)}mm²，小于 ${CONNECTOR_AREA_MIN_MM2}mm² 下限`,
        location: conn.z >= 0 ? { x: Math.floor(grid.size / 2), y: Math.floor(grid.size / 2), z: conn.z } : null
      });
    }
  }

  // 4. 网格封闭性 + 法线（基于体素生成的网格本身封闭，减面/编辑可能破坏）
  const mesh = voxelToMesh(grid);
  const wt = checkWatertight(mesh);
  if (!wt.watertight) {
    issues.push({
      toothPosition, checkType: 'watertight', severity: 'fatal',
      message: `网格不封闭，存在 ${wt.openEdges} 条开放边`,
      location: null
    });
  }
  const nm = checkNormals(mesh);
  if (!nm.consistent) {
    issues.push({
      toothPosition, checkType: 'normals', severity: 'warning',
      message: `法线朝向反转（有符号体积为负 ${nm.signedVolume.toFixed(1)}mm³）`,
      location: null
    });
  }

  // 5. 体素数量提示
  const solidCount = grid.countSolid();
  if (solidCount < 200) {
    issues.push({
      toothPosition, checkType: 'voxel_count', severity: 'info',
      message: `实体体素数 ${solidCount} 偏少，模型可能不完整`,
      location: null
    });
  }

  return { issues, voxelCount: solidCount, faceCount: mesh.faceCount };
}

// 对整批模型跑检查
export function runBatchChecks(models) {
  const results = [];
  for (const m of models) {
    const r = runChecksOnTooth(m.toothPosition, m.voxelData, m.restorationType);
    results.push({ toothPosition: m.toothPosition, ...r });
  }
  return results;
}

export function hasOpenFatal(batch) {
  return batch.issues.some(i => i.severity === 'fatal' && i.status === 'open');
}
