// ============ WebGPU 能力检测 ============
export async function detectWebGPU(): Promise<{ supported: boolean; reason?: string; adapter?: GPUAdapter }> {
  if (!('gpu' in navigator)) {
    return { supported: false, reason: '当前浏览器不支持 WebGPU（navigator.gpu 不存在），已自动切换 Canvas2D 渲染' }
  }
  try {
    // 超时兜底：部分环境 requestAdapter 会悬挂而不 reject
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
    ])
    if (!adapter) {
      return { supported: false, reason: '未获取到 GPU 适配器（可能被浏览器禁用或显卡驱动过旧），已切换 Canvas2D' }
    }
    return { supported: true, adapter }
  } catch (e) {
    return { supported: false, reason: `WebGPU 初始化失败：${(e as Error).message}，已切换 Canvas2D` }
  }
}
