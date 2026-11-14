// ============ CDP 端到端冒烟：登录三角色 + 遍历页面 + 抓取运行时错误 ============
const BASE = 'http://localhost:5199'

async function getTarget() {
  const list = await (await fetch('http://localhost:9222/json/list')).json()
  return list.find((t) => t.type === 'page')
}

const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()
const consoleErrors = []
const pageErrors = []
const failedRequests = []

function send(method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await new Promise((r) => (ws.onopen = r))
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a: any) => a.value ?? a.description ?? a.type).join(' '))
  } else if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
  } else if (m.method === 'Network.loadingFailed') {
    failedRequests.push(m.params.errorText)
  }
}

await send('Runtime.enable')
await send('Network.enable')
await send('Page.enable')

async function goto(hash: string) {
  await send('Page.navigate', { url: BASE + '/#' + hash })
  await new Promise((r) => setTimeout(r, 1800))
}

async function evalJs(expr: string) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  return r.result.value
}

const results = []
async function step(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn()
    results.push({ name, ok })
    console.log(`${ok ? '✓' : '✗'} ${name}`)
  } catch (e) {
    results.push({ name, ok: false })
    console.log(`✗ ${name} — ${(e as Error).message}`)
  }
}

async function loginAs(username: string) {
  await goto('/login')
  await evalJs(`
    (() => {
      const inputs = document.querySelectorAll('input');
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(inputs[0], '${username}');
      set(inputs[1], '123456');
    })()
  `)
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登')).click()`)
  await new Promise((r) => setTimeout(r, 1200))
}

// ---------- 策划 ----------
await loginAs('planner1')
await step('策划登录后进入工作台', async () => {
  const hash = await evalJs('location.hash')
  const text = await evalJs('document.body.innerText')
  return hash.includes('workbench') && text.includes('我的稿件')
})
await step('工作台显示在制/延期统计', async () =>
  (await evalJs('document.body.innerText')).includes('在制中'))
await goto('/planner/projects')
await step('策划稿件列表渲染', async () =>
  (await evalJs('document.querySelectorAll(".el-table__row").length')) > 0)
await goto('/planner/editor/p1')
await step('编排器与 3D 画布渲染', async () => {
  const text = await evalJs('document.body.innerText')
  const canvasOk = await evalJs(`!!document.querySelector('canvas') && document.querySelector('canvas').width > 0`)
  const gpuBadge = await evalJs(`document.querySelector('.gpu-badge')?.textContent ?? ''`)
  console.log('    GPU 徽标:', gpuBadge)
  return text.includes('编队骨架') && text.includes('时间轴') && canvasOk
})
await step('时间轴关键帧渲染', async () =>
  (await evalJs('document.querySelectorAll(".keyframe").length')) >= 3)
await step('安全校验可运行并产出结果', async () => {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('安全校验'))?.click()`)
  await new Promise((r) => setTimeout(r, 1500))
  const text = await evalJs('document.body.innerText')
  return text.includes('全部通过') || text.includes('第一架超限') || text.includes('超限')
})
await step('缓动曲线编辑器存在', async () =>
  (await evalJs(`document.querySelectorAll('.ease-canvas').length`)) > 0)
await step('导出对话框可打开', async () => {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('导出 PNG'))?.click()`)
  await new Promise((r) => setTimeout(r, 600))
  const ok = (await evalJs('document.body.innerText')).includes('帧率 FPS')
  await evalJs(`[...document.querySelectorAll('.el-dialog button')].filter(b => b.textContent.trim() === '关闭').pop()?.click()`)
  return ok
})

// ---------- 飞手 ----------
await loginAs('pilot1')
await goto('/pilot/schedule')
await step('飞手看到当天排期', async () => {
  const text = await evalJs('document.body.innerText')
  const rows = await evalJs('document.querySelectorAll(".el-table__row").length')
  return text.includes('当天排期') && rows > 0
})
await step('飞手可打开只读脚本预览', async () => {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('脚本预览'))?.click()`)
  await new Promise((r) => setTimeout(r, 1500))
  const ok = (await evalJs(`document.body.innerText.includes('飞手账号仅可预览')`))
  const canvasOk = await evalJs(`[...document.querySelectorAll('canvas')].some(c => c.width > 0)`)
  await evalJs(`[...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.includes('关闭') || b.getAttribute('aria-label') === 'Close')?.click()`)
  return ok && canvasOk
})
await step('飞手菜单不含编排入口（改不了稿）', async () => {
  const text = await evalJs('document.body.innerText')
  return !text.includes('我的稿件 / 编排')
})

// ---------- 后台 ----------
await loginAs('admin')
await step('后台工作台显示策划工作负荷', async () =>
  (await evalJs('document.body.innerText')).includes('策划工作负荷'))
const adminPages: [string, string][] = [
  ['/admin/customers', '演出立项'],
  ['/admin/projects', '稿件审核'],
  ['/admin/airspace', '空域申报'],
  ['/admin/rehearsal', '彩排记录'],
  ['/admin/receipt', '按场次统计'],
  ['/admin/stats', '统计看板']
]
for (const [hash, keyword] of adminPages) {
  await goto(hash)
  await step(`后台页面 ${hash}（含「${keyword}」）`, async () =>
    (await evalJs('document.body.innerText')).includes(keyword))
}
await goto('/admin/projects')
await step('退回对话框原因来自下拉', async () => {
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '退回')?.click()`)
  await new Promise((r) => setTimeout(r, 600))
  const opts = await evalJs(`[...document.querySelectorAll('.el-select-dropdown__item')].map(o => o.textContent).filter(Boolean)`)
  await evalJs(`[...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.trim() === '取消')?.click()`)
  console.log('    退回原因下拉项数:', opts.length)
  return opts.length >= 5
})
await goto('/admin/stats')
await step('ECharts 看板完成渲染', async () => {
  await new Promise((r) => setTimeout(r, 800))
  return (await evalJs(`document.querySelectorAll('canvas[_echarts_instance_], [_echarts_instance_]').length`)) >= 3
})

// ---------- 路由守卫 ----------
await step('飞手访问后台路由被拦截回工作台', async () => {
  await loginAs('pilot1')
  await goto('/admin/customers')
  const hash = await evalJs('location.hash')
  return hash.includes('workbench')
})

console.log('\n===== 运行时错误收集 =====')
console.log('console.error:', consoleErrors.length ? consoleErrors : '无')
console.log('未捕获异常:', pageErrors.length ? pageErrors : '无')
console.log('失败请求:', failedRequests.length ? [...new Set(failedRequests)] : '无')

const failed = results.filter((r) => !r.ok)
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
ws.close()
process.exit(failed.length || pageErrors.length ? 1 : 0)
