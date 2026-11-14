# 无人机灯光秀编队编排与运营后台系统

基于 **Vue 3 + TypeScript + Vite + WebGPU（WGSL）+ Pinia + Element Plus + ECharts** 的纯前端系统，
数据通过 localStorage 持久化（模拟后端，所有写操作集中在 `src/store/index.ts`，可平滑替换为真实 API）。

## 启动

```bash
npm install
npm run dev        # 开发，默认 http://localhost:5199
npm run build      # 生产构建
npm run type-check # 类型检查
npm run smoke      # 核心算法单元测试（12 项）
# 端到端测试需先启动 dev，并以 --remote-debugging-port=9222 启动 Chrome：
npx tsx scripts/e2e.ts          # 21 项界面/工作流冒烟
npx tsx scripts/e2e-export.ts   # PNG 序列帧导出验证
```

## 演示账号（密码均为 123456）

| 角色 | 账号 | 能力 |
| --- | --- | --- |
| 表演策划 | `planner1` / `planner2` | 编队骨架编排、关键帧/缓动、安全校验、PNG 导出、提交稿件 |
| 现场飞手 | `pilot1` / `pilot2` / `pilot3` | 仅看**当天**自己的排期、只读预览、确认执行、回报异常、执行回执 |
| 运营后台 | `admin` | 客户订单、立项、稿件审核（退回/通过）、空域、彩排、回执、统计看板 |

## 需求 → 实现对照

| 需求 | 实现位置 |
| --- | --- |
| 画布上把图形拆成编队骨架，无人机按编号绑骨节点 | `FormationPanel.vue` + `geometry.ts`（矩形/圆环/心形/星形预设、节点-编号绑定、重复绑定拦截、最小机间距） |
| 时间轴打起飞/队形变换/散开降落关键帧 | `TimelineTrack.vue`，关键帧类型 `takeoff/transform/land` |
| 两段之间拉缓动曲线 | `EasingCurveEditor.vue` + `easing.ts`（三次贝塞尔，预设+可拖控制点自定义） |
| 速度/加速度超限当场标红并说明哪一架先超 | `script.ts#runSafetyCheck`（解析包络+采样兜底），编辑器右侧告警显示**第一架超限**编号/时刻/数值，画布与列表同步标红 |
| 导出 PNG 序列帧给飞控预演 | `export-png.ts`，1280×720 逐帧离屏渲染 + JSZip 打包 + manifest.txt |
| 飞手登录只看当天排期、确认执行、回报异常、改不了稿 | `PilotScheduleView.vue` + 路由角色守卫 + 只读预览 `ScriptPreviewDialog.vue` |
| 客户订单/演出立项/空域申报/彩排/执行回执 | `admin/` 五个页面 |
| 每次提交生成版本并记录操作人和时间 | `store#submitScript/returnScript/approveScript/finishSchedule` → `versions` 表 |
| 退回原因必须从下拉选，退回稿回策划工位 | `RETURN_REASONS` 下拉 + 状态机 `submitted → returned` |
| 按场次统计编队架次、用机时长、异常次数 | `ReceiptView.vue` + `store#statsByProject` |
| 策划在制稿数量与延期稿数 | `store#plannerWorkload` + `StatsView.vue` ECharts 看板 |
| WebGPU | `webgpu-renderer.ts`（WGSL 点精灵实例化渲染），不支持时自动回退 Canvas2D（`canvas-renderer.ts`） |

## 目录结构

```
src/
├─ db/            持久化与种子数据
├─ lib/           缓动、几何、轨迹插值与安全校验、枚举映射
├─ render/        WebGPU/Canvas2D 渲染器、相机、场景组装、PNG 导出
├─ store/         Pinia 仓库（工作流状态机、版本、统计）
├─ components/    场景画布、时间轴、缓动编辑器、编队面板、飞手预览
├─ views/         planner / pilot / admin 三类角色页面
└─ router/        路由与角色守卫
```

## 安全校验原理

每架无人机在一个段内沿直线从位置 A 到 B，路径长 L、段时长 D：

- 速度包络：`v(t) = (L/D)·|dy/dt|`
- 加速度包络：`a(t) = (L/D²)·|d²y/dt²|`（缓动曲线数值微分）

对每段 40 点求峰值，超过 `limits.maxSpeed/maxAccel` 即记录违规（含无人机编号与时刻），
另加 4Hz 全场采样兜底。违规按时刻排序，第一条即「第一架超限」。
