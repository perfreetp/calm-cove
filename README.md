# 中药房药斗柜与调剂区 · 体素排布设计与审片系统

面向中药房装修交付场景的等轴测体素排布工具:药师按实际调剂流程布置药柜、调剂台、
称量区、复核台;药师长在图上打点审片;制作方逐条闭环回复;版本可对比、可追溯,
最终导出 GLB 模型与药位清单进入施工交付。

## 技术栈

- **Vue 3**(组合式 API,`<script setup>`)+ **Vite 5** + vue-router(hash 模式)
- **SVG + D3 v7**:等轴测体素渲染、滚轮缩放 / 中键平移、框选、拖拽
- 零重型 3D 依赖:**手写 glTF 2.0 GLB 二进制导出器**(按材质合批,带法线与包围盒)
- localStorage 持久化,内置 3 院区 / 5 方案演示数据,可一键重置

## 启动

```bash
npm install
npm run dev        # http://127.0.0.1:5180
npm run build      # 生产构建
node scripts/smoke.mjs   # 22 项核心逻辑测试
node scripts/e2e.mjs     # 24 项端到端业务流程测试
```

## 功能与需求对照

| 需求 | 实现位置 |
| --- | --- |
| 平面网格按调剂流程布置药柜/调剂台/称量区/复核台 | `views/Editor.vue` + `components/VoxelCanvas.vue` |
| 等轴测投影体素块、画家算法排序、三面着色 | `lib/geometry.js` |
| 多层编辑(第 1–4 层,不同高度柜体,上层半透显示) | Editor 层切换 + Canvas `showUpperGhost` |
| 镜像对称,左右同时生成(绕网格中轴) | Editor `onPlace` |
| 选区复制 / 粘贴 / 整体平移(冲突与越界校验) | Editor `copySel/pasteSel/onTranslate` |
| 毒麻药柜与普通药斗分开着色 + 独立图层开关 | `constants.js` VOXEL_TYPES / LAYER_DEFS |
| 药斗格数、单斗容量、常用药位单独设置 | Editor 右侧属性面板 |
| 合并相邻同材质体素并减面(条块合并 + 面数统计) | `geometry.js mergeVoxels` |
| 导出 GLB 与药位清单(CSV,带 BOM,Excel 直开) | `lib/exporter.js` |
| 提交方案生成版本号(V1.0 → V1.1…) | `store.js submitVersion` |
| 药师长图上打点批注(距离/黄金区/其他) | `views/Review.vue` |
| 规则:药斗离调剂台 >2m、常用药位不在黄金区、毒麻柜管理、设施完整性 | `lib/rules.js`,支持一键转批注 |
| 制作方逐条回复「已改 / 保留原因」并闭环 | Review 批注线程 |
| 处理完提交新版本 | 编辑器提交,版本链 `basedOn` |
| 两版本左右对比,高亮增(绿)/删(红)/改(橙),视角联动 | `views/Diff.vue` |
| 审核通过 → 施工交付状态流 | `store.js approve/deliver` |
| 版本历史:每轮批注数、未闭环条数、操作人、时间 | `views/History.vue` |
| 首页看板:各院区待审量、平均返工次数、常用药位覆盖率 | `views/Dashboard.vue` |

## 关键设计说明

- **坐标体系**:网格坐标 `(x, y, z)`,每格 500mm,层高 0.4m;2m 限值 = 4 格,
  用欧氏距离校核。黄金区为平面中央 6×4 格(X7–12, Y5–8),画布金色底纹标识。
- **面剔除**:仅绘制未被同格邻居遮挡的顶/左/右三个面,多层堆叠时自动隐藏。
- **减面统计**:按 `type`(材质)分组,每个 `(y,z)` 行内将 x 连续体素合并为条块,
  外露面数前后对比得到减面率,随版本快照保存。
- **GLB 导出**:每种材质一个 primitive(POSITION/NORMAL/indices + PBR 材质),
  uint16 索引,4 字节对齐,严格 glTF 2.0 二进制布局,可直接导入 Blender / CAD 软件。
- **三角色**:药师(设计)、药师长(审核)、制作方(回复),顶栏切换;
  写操作按角色禁用(如仅药师长可批注/通过,仅制作方可回复)。
- **版本模型**:版本是体素的不可变深拷贝快照;工作区改动不影响已提交版本,
  提交时才生成新版本并切换方案状态。

## 目录结构

```
src/
  components/VoxelCanvas.vue   等轴测 SVG 画布(D3 缩放/框选/拖拽/标注点)
  views/
    Dashboard.vue              首页看板(院区统计)
    ProjectList.vue            方案管理/新建
    Editor.vue                 排布编辑器(多层/镜像/选区/属性/校核/导出/提交)
    Review.vue                 审片(打点批注/回复/通过/交付)
    Diff.vue                   版本左右对比与增删改高亮
    History.vue                版本历史与闭环记录
  lib/
    constants.js               类型字典、图层、黄金区、距离阈值
    geometry.js                等轴测投影、面剔除、合并减面
    exporter.js                GLB 二进制导出 + 药位清单 CSV
    rules.js                   自动校核规则
    store.js                   localStorage 仓库与状态流
scripts/
  smoke.mjs                    几何/减面/GLB/规则单元测试
  e2e.mjs                      提交→批注→回复→新版本→对比→交付全流程
```
