# 标版通 · 公路交通标志牌版面制作与版本审片平台

面向标志牌制版厂与交安工程审核方的单页应用：在 Canvas2D 矢量图层里做版面，
用 Babylon.js 把版面挤出成薄板看立体与侧向视认效果，按「制作—审核—结项」流转，
结项后导出可直接上刻字机的 SVG 与投产包。

## 运行

```bash
npm install
npm run dev      # http://localhost:5233
npm run build    # 产物在 dist/
```

首次打开会载入嵌入的思源黑体子集（GB2312 + 拉丁），汉字按「字高/字宽」参数实时
矢量化为路径。数据保存在浏览器 localStorage，可在控制台执行
`window.__bbt` 调试，或 `localStorage.clear()` 重置为演示数据。

## 能力对照

| 需求 | 实现 |
| --- | --- |
| Vue3 + Babylon.js | `src/components/*.vue`，`src/core/viewer.js` |
| Canvas2D 矢量图层编辑 | `src/components/SignCanvas.vue` + `src/core/editor.js` |
| 路径并集/差集/交集/异或 | `src/core/geom.js`（polygon-clipping + 自研曲线展平/环归组） |
| 8 px 网格 + 已有点吸附 | `SignCanvas.snapPoint`，端点 10 px 半径优先，其余落 8 px 网格 |
| 撤销/重做 ≥ 50 步 | `src/core/store.js`，上限 120 步，快照式历史，工具栏显示当前深度 |
| 干净 SVG 交刻字机 | `src/core/export.js`：mm 单位、1:1、文字转曲、无 transform/`<text>`、描边转闭合轮廓、按色分组 |
| Babylon.js 薄板挤出 + 侧向视认 | `src/core/viewer.js`，轮廓挤出 + 正反投影贴图，15°/30°/45° 预设与角度滑杆 |
| 国标模板起稿（禁令/指示/指路） | `src/core/model.js` 的 `TEMPLATES`，11 套基础模板 |
| 可调圆角/线宽/行距/字距 | 右侧属性面板（`Inspector.vue`） |
| 汉字字高、字宽两参数 | 文本图层 `charHeight` / `charWidth`，逐字矢量化时分别缩放 X/Y |
| 安全边距 + 最小视认距离参考线 | 画布虚线安全边距；底部视认距离标尺随字高实时换算 |
| 一版做完提交版本 | 流程面板「提交 V1」→ 状态待审核 |
| 画面任意打点批注 | 审片页「画面打点批注」，内嵌批注输入框，标记落在版面坐标 |
| 图层列表对元素提意见 | 审片页右侧图层栏的批注按钮 / 属性面板「元素批注」 |
| 制作方逐条回复：已处理 / 不改理由 | 批注卡片回复框，不改理由需 ≥ 6 字 |
| 审核人确认关闭 | 「确认关闭」/「仍不满意，退回」 |
| 批注没关完不能结项 | `approveVersion` 在存在未关闭批注时拒绝，提示剩余条数 |
| 结项版本才能导出投产包 | `canExportPackage` 三重校验：已结项 + 版本已通过 + 批注全关 |
| V1/V2 版本号 | 标志牌内递增版本，可基于任一版本「＋ 新版本」 |
| 并排 / 叠加 / 仅差异对比 | `CompareView.vue`，差异按图层签名比对并画外包框 |
| 投产包：SVG + 材料清单 + 工艺说明 | JSZip 打包，另附开料说明、版本清单、审片记录、差异清单 |
| 项目列表状态/修改轮次/超期天数 | `SignList.vue`：制版中/待审核/退回修改/已结项 + R n + 超期 n 天 |

## 关键设计说明

- **坐标与单位**：全部以毫米为单位、y 轴向下，版面原点在左上角；导出 SVG 的
  `viewBox` 与 `width/height` 都是 mm，1:1。
- **曲线**：图层几何可以带三次贝塞尔手柄；布尔运算前按 0.18 mm 容差展平，
  运算结果回到闭合折线。描边图层在导出时被转换成闭合轮廓，刻字机按填充切割即可。
- **SVG 叠放顺序**：按「底板优先、面积从大到小」排序，所有环归入 `<g>` 内单独的
  `<path>` 并使用 `fill-rule="evenodd"`，避免挖空被填实。
- **历史**：每次提交/拖拽结束/属性变更记录一次完整版面快照（JSON），
  上限 120 步，超出丢弃最旧记录；撤销/重做直接替换当前版面的 `doc`。
- **批注迁移**：提交新版本时，上一版本未关闭的批注自动挂到新版本（`carriedFrom`
  保留来源），因此审核方不必重打一遍。

## 目录

```
src/core/geom.js      几何：子路径、曲线展平、环归组、布尔运算、描边轮廓
src/core/font.js      字体加载、逐字矢量化、字高/字宽/字距/行距排版
src/core/model.js     图层模型、模板库、基础图元、视认换算、BOM、工艺卡
src/core/editor.js    画布渲染器、命中测试、吸附、编辑操作、版本差异
src/core/viewer.js    Babylon 薄板挤出与侧向视认相机
src/core/export.js    干净 SVG、投产包（JSZip）
src/core/store.js     数据、流程、批注、撤销历史、localStorage
src/components/*.vue  界面
```
