# 开发辅助脚本

这些脚本只用于本地验收，不属于应用运行时：

- `run-e2e.sh <script>` — 启动一个临时 Vite 服务再运行指定 Playwright 脚本，退出时关闭服务。
- `e2e.mjs` — 立项 → 编辑器 → 关节超限拦截 → 保存 → 提交 → 逐帧意见 → 退回的完整链路。
- `e2e-pack.mjs` — 打包交付并解压校验 ZIP、manifest 与 PNG。
- `e2e-copy.mjs` — 复制动作到下一镜头、动作库影响提示与同步、贝塞尔手柄拖动。
- `check.mjs` / `shots.mjs` / `learner.mjs` — 各页面截图。

用法：

```bash
sh scripts/run-e2e.sh scripts/e2e.mjs
```

需要本机已安装 `playwright-core` 与 Chromium（脚本内写死了 Windows 上的可执行路径，
换机器时改 `exe` 常量即可）。截图输出在 `scripts/out/`。
