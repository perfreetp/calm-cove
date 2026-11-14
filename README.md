# 马术场地障碍路线生成与档案加工系统

基于 **Svelte 5 + TypeScript + WebGPU** 的纯前端应用,覆盖路线过程式生成、手动调整与冲突检测、
双视角三维渲染、版本档案与审查工作流、多条件检索与季度报告导出。

## 启动

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 生产构建
npm run test       # 核心逻辑单测(Vitest,15 项)
```

端到端验证(需先 `npm run dev`,另开终端):

```bash
node e2e/smoke.mjs      # 全流程冒烟(建档→生成→拖拽→双视角→比对→审查→导出)
node e2e/regen.mjs      # 手动障碍重生成保留与冲突标注
node e2e/fallback.mjs   # 屏蔽 WebGPU,验证 Canvas2D 降级
```

## 功能与实现对照

| 需求 | 实现 |
| --- | --- |
| 输入场地长宽/障碍道数/距离档位/难度 | `src/lib/generator.ts` 参数面板 |
| 过程式生成摆位、起步线、回转弧线、步距标注 | 蛇形巷道场站 + 相切圆弧 `geometry.arcPath` + `timing.buildStrideMarks` |
| 同种子+同参数结果完全一致 | xmur3 哈希 + mulberry32 PRNG(`rng.ts`),所有随机决策顺序固定;单测断言 JSON 逐位相等 |
| 手动障碍重生成保留原位并标冲突 | 障碍 `manual` 标志 + `preserveManual`;冲突引擎检测步距不足/线路交叉/落地区越界 |
| WebGPU 渲染 + 俯视/骑手视角 | `renderer.ts` WGSL 实例化三角形;俯视平面 2D 图元,骑手透视 3D;不支持时自动降级 Canvas2D |
| 赛事建档(编号/级别/日期/裁判/场地) | `ArchiveView.svelte` + localStorage 持久化 |
| 路线版本化、历史版本并排比对、改动高亮 | `store.svelte.ts` 版本快照 + `diff.ts` + `CompareView.svelte` |
| 设计师/裁判双身份与审查工作流 | 提交 → 待审查 → 通过/退回(退回必填原因) |
| 通过后导出路线图与步距表 | SVG 平面图 + 带 BOM 的 CSV 步距表(`export.ts`) |
| 全程预计时间、人马安全距离 | 级别速度表 `SPEED_BY_LEVEL`;`computeTiming` / `computeSafetyDistances` |
| 多条件档案检索 | 级别/日期区间/设计师/障碍数量区间 |
| 季度报告与退回原因分布 | `quarterlyReport` / `returnReasonStats` + CSV 导出 |

## 目录结构

```
src/lib/
  rng.ts          确定性 PRNG
  constants.ts    步幅、距离档位、速度、高度等马术规则常量
  geometry.ts     向量、线段相交、相切回转弧
  generator.ts    过程式生成主流程(蛇形布局、组合障碍、重叠修复、手动保留)
  conflicts.ts    三类冲突检测
  timing.ts       行进线、步距标注、计时、安全距离
  diff.ts         版本差异
  renderer.ts     WebGPU 渲染器 + Canvas2D 降级
  export.ts       SVG / CSV 导出
  store.svelte.ts Svelte 5 runes 全局状态与持久化
src/components/   四个主视图 + 画布组件
e2e/              Playwright 端到端脚本
```

## 关键规则参数(可在 `constants.ts` 调整)

- 平均步幅 3.5 m;起跳+落地余量 3.6 m
- 关联距离三档:近距 7.1–8.4 m(约 1 步)、中距 10.6–11.8 m(约 2 步)、远距 14.1–15.4 m(约 3 步)
- 级别速度 325–400 m/min,障碍高度 0.85–1.45 m
- 边界安全余量 3 m,落地区半径 2.2 m,回转侧向净距 2.5 m

数据保存在浏览器 localStorage,无需后端;清除站点数据即重置。
