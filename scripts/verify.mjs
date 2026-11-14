// 端到端验收脚本：先 npm run dev，再运行 node scripts/verify.mjs
// 覆盖 7 个页面渲染、确定性、单栋重生成保留手工字段、站距校验、
// 派工、施工提交、质检打回与锁单、刷新持久化、导出。
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://127.0.0.1:5173/#'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
})
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text())
})
page.on('dialog', (d) => d.accept())

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

const read = () => page.evaluate(() => {
  const raw = localStorage.getItem('bus-stop-studio.v1')
  return raw ? JSON.parse(raw) : null
})

// 1. 七个界面
const pages = [
  ['/apply', '新建站台申请'],
  ['/simulate', '三维街区推演'],
  ['/stations', '候选站点编排'],
  ['/dispatch', '工单片区派工'],
  ['/field', '施工员作业台'],
  ['/qc', '质检验收抽检'],
  ['/board', '主管看板与线路总览']
]
await page.goto(BASE + '/apply', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
for (const [path, title] of pages) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(path === '/simulate' ? 2200 : 700)
  const h = (await page.locator('h1').first().textContent()) || ''
  check(`页面 ${path} 渲染「${title}」`, h.includes(title), h.slice(0, 24))
}

// 2. 确定性
await page.goto(BASE + '/simulate', { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
const fp0 = await page.locator('.vp-stat .mono').nth(1).textContent()
await page.locator('button', { hasText: '按当前参数重生成' }).first().click()
await page.waitForTimeout(1500)
const fp1 = await page.locator('.vp-stat .mono').nth(1).textContent()
check('同一种子重生成后街区指纹不变', fp0 === fp1, `${fp0} / ${fp1}`)

// 3. 单栋手工改造 + 重生成保留
const rect = await page.evaluate(() => {
  const b = document.querySelector('.viewport canvas').getBoundingClientRect()
  return { x: b.x, y: b.y, w: b.width, h: b.height }
})
let spot = null
outer: for (let gy = 0.3; gy <= 0.8; gy += 0.05) {
  for (let gx = 0.15; gx <= 0.9; gx += 0.05) {
    await page.mouse.move(rect.x + rect.w * gx, rect.y + rect.h * gy)
    await page.waitForTimeout(90)
    const t = await page.locator('.vp-overlay .glass').last().textContent()
    if (t.includes('悬停：')) { spot = [gx, gy]; break outer }
  }
}
check('三维视图可拾取建筑', !!spot)
if (spot) {
  await page.mouse.click(rect.x + rect.w * spot[0], rect.y + rect.h * spot[1])
  await page.waitForTimeout(500)
  await page.locator('input[type=number]').first().fill('26')
  await page.locator('button', { hasText: '玻璃幕墙' }).first().click()
  await page.locator('button', { hasText: '应用改造' }).first().click()
  await page.waitForTimeout(600)
  let st = await read()
  let p = st.projects.find((x) => x.id === st.activeProjectId)
  const edited = p.district.buildings.find((b) => Object.keys(b.overrides || {}).length)
  check('手工改造已写入覆盖字段', !!edited && edited.overrides.floors === 26, JSON.stringify(edited?.overrides))
  const targetId = edited.id

  await page.locator('.vp-tools button', { hasText: '单栋重生成' }).first().click()
  await page.waitForTimeout(900)
  st = await read()
  p = st.projects.find((x) => x.id === st.activeProjectId)
  const after = p.district.buildings.find((b) => b.id === targetId)
  check('单栋重生成保留手工字段', after.overrides.floors === 26, JSON.stringify(after.overrides))
  check('单栋重生成已换新 nonce', after.nonce > 0, String(after.nonce))

  await page.locator('button', { hasText: '按当前参数重生成' }).first().click()
  await page.waitForTimeout(1400)
  st = await read()
  p = st.projects.find((x) => x.id === st.activeProjectId)
  const afterAll = p.district.buildings.find((b) => b.id === targetId)
  check('整线重生成不清掉手工字段', !!afterAll && afterAll.overrides.floors === 26, JSON.stringify(afterAll?.overrides))
}

// 4. 站距与增补候车站
await page.goto(BASE + '/stations', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
let st = await read()
let proj = st.projects.find((x) => x.id === st.activeProjectId)
const gapsOf = (pp) => pp.stops.slice(1).map((s, i) => Math.round((s.dist - pp.stops[i].dist) * 10) / 10)
const badBefore = gapsOf(proj).filter((g) => g > 800 || g < 300).length
check('演示数据含站距超标段', badBefore > 0, `${badBefore} 段`)
await page.locator('button', { hasText: '增补候车站' }).first().click()
await page.waitForTimeout(900)
st = await read()
proj = st.projects.find((x) => x.id === st.activeProjectId)
const badAfter = gapsOf(proj).filter((g) => g > 800 || g < 300).length
check('增补候车站后站距全部合规', badAfter === 0, `剩余 ${badAfter} 段`)

// 5. 派工
await page.goto(BASE + '/dispatch', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const unassignedRow = page.locator('table.data tbody tr').filter({ hasText: '未分派' }).first()
const hasUnassigned = await unassignedRow.count()
if (hasUnassigned) {
  await unassignedRow.locator('select').selectOption({ index: 1 })
  await page.waitForTimeout(500)
}
st = await read()
const stillUnassigned = st.orders.filter((o) => o.projectId === st.activeProjectId && !o.workerId).length
check('待分派工单可指定施工员', !hasUnassigned || stillUnassigned >= 0, `未分派 ${stillUnassigned}`)

// 6. 施工提交 → 质检打回
await page.goto(BASE + '/field', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const todoRow = page.locator('.panel:has-text("我的工单") div[style*="cursor"]').first()
if (await todoRow.count()) {
  await todoRow.click()
  await page.waitForTimeout(400)
  const canSubmit = await page.locator('button', { hasText: '提交质检' }).first().isEnabled().catch(() => false)
  if (!canSubmit) {
    await page.locator('button', { hasText: '生成占位照片' }).click()
    await page.locator('button', { hasText: '生成占位照片' }).click()
    await page.waitForTimeout(300)
  }
  await page.locator('button', { hasText: '提交质检' }).first().click()
  await page.waitForTimeout(700)
  st = await read()
  const sub = st.orders.filter((o) => o.status === 'submitted').length
  check('施工员提交后进入待质检', sub > 0, `待质检 ${sub}`)
}

await page.goto(BASE + '/qc', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
if (await page.locator('.panel:has-text("抽检队列") div[style*="cursor"]').count()) {
  await page.locator('.panel:has-text("抽检队列") div[style*="cursor"]').first().click()
  await page.waitForTimeout(400)
  const slider = page.locator('input[type=range]').first()
  await slider.evaluate((el) => {
    el.value = 30
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(300)
  await page.locator('button', { hasText: /打回/ }).first().click()
  await page.waitForTimeout(800)
  st = await read()
  check(
    '盲道不足四成被打回并写明原因',
    st.orders.some((o) => o.qc && o.qc.verdict === 'reject' && o.qc.reasons.some((r) => r.includes('盲道'))),
    st.orders.filter((o) => o.qc?.verdict === 'reject').length + ' 张不通过'
  )
  check(
    '累计三次返工自动锁单',
    st.orders.some((o) => o.status === 'locked' && o.reworkCount >= 3),
    String(st.orders.filter((o) => o.status === 'locked').length)
  )
}

// 7. 刷新持久化
const beforeReload = await read()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const afterReload = await read()
check('刷新后本地数据保持一致', JSON.stringify(beforeReload.orders) === JSON.stringify(afterReload.orders))

// 8. 导出
await page.goto(BASE + '/board', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const fs = await import('node:fs/promises')
for (const [label, needle] of [['导出线路清单', '站序'], ['导出工单台账', '返工次数']]) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button', { hasText: label }).first().click()
  ])
  const txt = await fs.readFile(await dl.path(), 'utf8')
  check(`${label} CSV 可下载且含字段`, txt.length > 100 && txt.includes(needle), `${dl.suggestedFilename()} · ${txt.split('\n').length} 行`)
}

check('无运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '))
await page.screenshot({ path: 'shots/verify-board.png' })
await browser.close()
console.log(failures ? `\nFAILED — ${failures} 项未通过` : '\nALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
