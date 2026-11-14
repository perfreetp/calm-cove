# 布草洗涤厂 · 照明布光与洗涤工单系统

原生 TypeScript + Web Components + Canvas2D，照度计算在 Web Worker 内用
OffscreenCanvas 逐像素完成（直射 + 软阴影 + 窗户自然光），主线程只负责交互层绘制。

## 运行

```bash
npm install
npm run build      # esbuild 打包到 dist/
npm start          # http://localhost:4174
# 或 npm run watch 监听源码
```

测试（驱动本机 Chrome，需可访问 `C:/Program Files/Google/Chrome/Application/chrome.exe`）：

```bash
npm run test:e2e   # 23 项端到端：Worker 计算、拖拽重算、工单全流程、导出
npm run test:perf  # 重算延迟与自然光曲线
npm run typecheck  # strict 类型检查
```

## 架构

```
src/
├── main.ts                     入口，注册 6 个 Web Component 与标签页
├── types.ts                    灯光 / Worker 消息 / 工单 全部领域类型
├── factory.ts                  厂房平面：5 区 + 通道、设备遮挡、北墙窗、种子灯具/师傅
├── lighting.ts                 光束余弦定律、光通量标定、太阳高度、色阶映射、色温转 RGB
├── domain.ts                   5% 抽查、返洗率、看板 KPI、CSV 导出
├── store.ts                    localStorage 持久化 + Worker 调度（防抖/在途合并/版本追平）
├── workers/
│   └── illuminance.worker.ts   OffscreenCanvas 软阴影 + 逐像素 lux + 区域统计（可 transfer 回传）
└── components/
    ├── lighting-studio.ts      交互层 Canvas（拖灯/选灯/滑杆/暗区清单/色阶图例）
    ├── front-desk.ts           前台送洗单录入
    ├── dispatch-board.ts       按区域 + 班次分派师傅
    ├── wash-desk.ts            师傅洗涤提交（拍照 + 水温/时长/洗涤剂）
    ├── qc-desk.ts              5% 抽查、合格/打回返洗、关联质检台布光方案
    └── dashboard.ts            看板统计与两个 CSV 导出
```

## 关键设计

- **主线程 / Worker 分工**：主线程 Canvas2D 只画区域、设备、灯具、光束圈、暗区斜纹等交互层；
  逐像素照度（480×288）全部在 Worker 的 OffscreenCanvas 里算，结果以 `ImageBitmap` +
  `Float32Array` transfer 零拷贝回传。
- **软阴影**：每盏灯复用一张半分辨率 OffscreenCanvas，把设备矩形沿灯—物方向投射成阴影体、
  `filter: blur()` 做软边、径向渐变裁切光照范围，读 alpha 得遮挡系数后双线性采样。
- **实时性**：每灯只遍历其光照包围盒像素；拖动/改高度经 90ms 防抖触发，在途请求合并、
  回包后按最新版本追平，单帧约 350–450ms 上屏。
- **自然光**：8:00–20:00 按太阳高度角调制，北墙窗带按进深/横向距离衰减，色温随时段变化。
- **暗区规则**：质检台（qc 区）平均 <300 lux、通道 <150 lux 自动标红斜纹并列入清单。
- **存储分离**：布光方案 (`llw.lightingPlans`) 与工单 (`llw.workOrders`) 分开持久化，
  工单在质检时通过 `qcPlanId` 关联到某方案绑定的质检台。
- **质检**：按总件数 5% 抽查（≤20 件全检），不合格打回并记录返洗原因，返洗率进看板。

## 出厂数据说明

默认布光刻意保留两处可识别的欠照，便于演示暗区规则：通道顶灯通量偏低、质检台 3 的工位灯
关闭。在灯具面板补光或启用该灯后，暗区清单会实时消除。
