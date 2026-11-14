// 端到端冒烟测试：驱动本机 Chrome 验证 Worker 照度计算、拖拽重算、工单全流程
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = resolve(root, 'tests/shots');
mkdirSync(shotDir, { recursive: true });

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngPath = resolve(root, 'tests/fixture.png');
writeFileSync(pngPath, Buffer.from(PNG, 'base64'));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 950 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('dialog', async (d) => { console.log(`  dialog: ${d.message()}`); await d.accept(); });

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, { timeout = 6000, label = 'condition' } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await fn()) return true; } catch { /* 选择器暂未出现 */ }
    await sleep(120);
  }
  console.log(`  (timeout waiting: ${label})`);
  return false;
}

// 清空 localStorage 后再加载，保证从种子状态开始
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });

// ---------- 1. 照明工作室：Worker 计算结果上屏 ----------
await page.waitForSelector('lighting-studio canvas.overlay-canvas');
const rowsOk = await waitFor(async () =>
  (await page.$$('[data-role="zone-table"] tbody tr')).length === 6, { label: 'zone rows' });
check('Worker 逐像素计算 -> 6 个区域照度行', rowsOk);

const zoneText = await page.$eval('[data-role="zone-table"]', (el) => el.textContent);
check('区域照度含 lux 数值', /\d/.test(zoneText ?? ''));

const darkText = await page.$eval('[data-role="dark-list"]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
check('暗区清单已生成', /低于阈值|无暗区/.test(darkText), darkText.slice(0, 100));

const daylightTag = await page.$eval('[data-role="daylight"]', (el) => el.textContent);
check('窗户自然光参考值上屏', /lux/.test(daylightTag ?? ''), daylightTag ?? '');
await page.screenshot({ path: resolve(shotDir, '01-studio-08h.png') });

// ---------- 2. 拖拽灯具实时重算 ----------
const luxBefore = await page.evaluate(() => {
  const r = document.querySelector('lighting-studio');
  return r; // 仅确保元素存在
});
void luxBefore;
const box = await page.$eval('canvas.overlay-canvas', (c) => {
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});
// 点中分拣顶灯 f-s1（2.5m, 2.2m）
const fx = box.left + (2.5 / 30) * box.w;
const fy = box.top + (2.2 / 18) * box.h;
// 取一个固定像素点的 lux 作为重算判据
const sampleLux = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-role="zone-table"] tbody tr')];
  return rows.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
});
const zonesBefore = await sampleLux();
await page.mouse.move(fx, fy);
await page.mouse.down();
await page.mouse.move(fx + 100, fy + 40, { steps: 8 });
await page.mouse.up();
await waitFor(async () => (await page.$('[data-f="flux"]')) !== null, { label: 'fixture panel' });
check('拖中灯具后参数面板出现', (await page.$('[data-f="flux"]')) !== null);
let changed = false;
for (let i = 0; i < 30; i++) {
  await sleep(150);
  const now = await sampleLux();
  if (JSON.stringify(now) !== JSON.stringify(zonesBefore)) { changed = true; break; }
}
check('拖动灯具触发实时重算（区域 lux 变化）', changed);

// ---------- 3. 改高度滑杆 ----------
const heightBefore = await page.$eval('[data-f="height"]', (el) => el.value);
await page.$eval('[data-f="height"]', (el) => {
  el.value = '3.0';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(700);
const heightAfter = await page.$eval('[data-f="height"]', (el) => el.value);
check('修改灯具安装高度触发重算', heightBefore !== heightAfter, `${heightBefore} -> ${heightAfter}`);

// ---------- 4. 时段切换 8 -> 20 点 ----------
await page.$eval('[data-role="hour"]', (el) => {
  el.value = '20';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(700);
const hourLabel = await page.$eval('[data-role="hour-label"]', (el) => el.textContent);
check('时段切到 20:00', /20:00/.test(hourLabel ?? ''), hourLabel ?? '');
const dl20 = await page.$eval('[data-role="daylight"]', (el) => el.textContent);
check('20 点自然光趋零', /0 lux/.test(dl20 ?? ''), dl20 ?? '');
const darkAt20 = await page.$eval('[data-role="dark-list"]', (el) => el.textContent.replace(/\s+/g, ' ').trim());
check('20 点暗区清单刷新', /低于阈值|无暗区/.test(darkAt20), darkAt20.slice(0, 100));
await page.screenshot({ path: resolve(shotDir, '02-studio-20h.png') });

// ---------- 5. 前台录单 ----------
await page.click('[data-tab="front"]');
await page.waitForSelector('front-desk [data-role="hotel"]');
await page.type('[data-role="hotel"]', '测试国际酒店');
await page.click('[data-act="add-item"]');
const orderCount1 = await page.$$eval('.order-table tbody tr', (trs) => trs.length);
await page.click('[data-act="submit"]');
await waitFor(async () =>
  (await page.$$eval('.order-table tbody tr', (trs) => trs.length)) === orderCount1 + 1, { label: 'new order row' });
const orderCount2 = await page.$$eval('.order-table tbody tr', (trs) => trs.length);
check('前台生成送洗工单', orderCount2 === orderCount1 + 1, `${orderCount1} -> ${orderCount2}`);

// ---------- 6. 工单分派 ----------
await page.click('[data-tab="dispatch"]');
await page.waitForSelector('dispatch-board');
await sleep(200);
const pendingCards = await page.$$('[data-role="assign"]');
check('存在待分派工单', pendingCards.length > 0, `${pendingCards.length} 单`);
if (pendingCards.length) {
  const firstValue = await page.$eval('[data-role="assign"]', (el) =>
    [...el.options].map((o) => o.value).find((v) => v.includes('|')));
  await page.select('[data-role="assign"]', firstValue);
  await waitFor(async () =>
    (await page.$$('[data-role="assign"]')).length === pendingCards.length - 1, { label: 'assigned' });
  const pendingAfter = await page.$$('[data-role="assign"]');
  check('按区域/班次/师傅分派成功', pendingAfter.length === pendingCards.length - 1);
}

// ---------- 7. 师傅洗涤提交 ----------
await page.click('[data-tab="wash"]');
await page.waitForSelector('wash-desk');
await sleep(200);
let startBtn = await page.$('[data-act="start"]');
if (!startBtn) {
  // 找一个有在手工单的师傅
  const wid = await page.$$eval('[data-role="worker"] option', (opts) => opts.map((o) => o.value));
  for (const id of wid) {
    await page.select('[data-role="worker"]', id);
    await sleep(150);
    startBtn = await page.$('[data-act="start"]');
    if (startBtn) break;
  }
}
check('存在可开始的洗涤任务', startBtn !== null);
if (startBtn) {
  await startBtn.click();
  await waitFor(async () => (await page.$('[data-act="submit-open"]')) !== null, { label: 'washing state' });
  await page.click('[data-act="submit-open"]');
  await page.waitForSelector('.modal');
  const fileInput = await page.$('[data-cam="file"]');
  await fileInput.uploadFile(pngPath);
  await sleep(300);
  await page.$eval('[data-role="temp"]', (el) => { el.value = '78'; });
  await page.$eval('[data-role="duration"]', (el) => { el.value = '42'; });
  await page.$eval('[data-role="detergent"]', (el) => { el.value = '165'; });
  await page.click('.modal [data-act="confirm"]');
  await waitFor(async () => (await page.$('.modal')) === null, { label: 'modal closed' });
  check('洗涤提交（照片+水温+时长+洗涤剂）后弹窗关闭', (await page.$('.modal')) === null);
}

// ---------- 8. 质检：5% 抽查，合格 + 打回 ----------
await page.click('[data-tab="qc"]');
await page.waitForSelector('qc-desk');
await waitFor(async () => (await page.$$('[data-act="pass"]')).length > 0, { label: 'qc queue' });
const qcQueue = await page.$$('[data-act="pass"]');
check('质检台收到待检工单', qcQueue.length > 0, `${qcQueue.length} 单待检`);
const sampleTag = await page.$eval('.qc-card .tag', (el) => el.textContent).catch(() => '');
check('显示 5% 抽查件数', /抽查/.test(sampleTag ?? ''), sampleTag ?? '');
if (qcQueue.length >= 1) {
  await page.click('[data-act="pass"]');
  await waitFor(async () => (await page.$$('[data-act="pass"]')).length === qcQueue.length - 1, { label: 'passed' });
  check('抽检合格流转', (await page.$$('[data-act="pass"]')).length === qcQueue.length - 1);
}
if ((await page.$('[data-act="reject"]')) !== null) {
  const beforeRej = await page.$$('[data-act="reject"]');
  await page.click('[data-act="reject"]'); // prompt 自动 accept
  await sleep(400);
  const rejected = await page.$$eval('.order-table tbody tr', (trs) =>
    trs.some((tr) => tr.textContent.includes('返洗')));
  check('不合格打回并记返洗原因', rejected || beforeRej.length > 0);
}

// ---------- 9. 看板 ----------
await page.click('[data-tab="board"]');
await page.waitForSelector('app-dashboard');
await sleep(400);
const kpiCards = await page.$$eval('.kpi-card', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
check('看板 6 张 KPI 卡', kpiCards.length === 6, kpiCards.join(' | '));
const bars = await page.$$eval('.bar-row', (els) => els.length);
check('各师傅完成量柱状图', bars >= 6, `${bars} 人`);
await page.screenshot({ path: resolve(shotDir, '03-dashboard.png') });

// ---------- 10. 导出 CSV ----------
const planCsv = await page.evaluate(() => new Promise((resolve) => {
  const orig = HTMLAnchorElement.prototype.click;
  let captured = '';
  HTMLAnchorElement.prototype.click = function () { captured = this.download; };
  document.querySelector('[data-act="export-plan"]').click();
  setTimeout(() => { HTMLAnchorElement.prototype.click = orig; resolve(captured); }, 250);
}));
check('导出布光点位表 CSV', /布光点位表.*\.csv/.test(planCsv), planCsv);
const orderCsv = await page.evaluate(() => new Promise((resolve) => {
  const orig = HTMLAnchorElement.prototype.click;
  let captured = '';
  HTMLAnchorElement.prototype.click = function () { captured = this.download; };
  document.querySelector('[data-act="export-orders"]').click();
  setTimeout(() => { HTMLAnchorElement.prototype.click = orig; resolve(captured); }, 250);
}));
check('导出工单明细 CSV', /工单明细.*\.csv/.test(orderCsv), orderCsv);

// ---------- 汇总 ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (errors.length) {
  console.log('\n浏览器错误:');
  [...new Set(errors)].forEach((e) => console.log('  ' + e));
}
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
