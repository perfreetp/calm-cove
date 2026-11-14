/* 冒烟测试：遍历 7 个界面，收集控制台错误，并演练关键交互 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8977, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

  const routes = ['dashboard', 'rigging', 'animator', 'metrics', 'qc', 'coach', 'export'];
  for (const r of routes) {
    await page.goto(`http://localhost:8977/index.html#/${r}`);
    await page.waitForTimeout(600);
    const txt = await page.locator('#outlet').innerText();
    console.log(`ROUTE ${r}: ${txt.slice(0, 60).replace(/\n/g, ' | ')}`);
  }

  // 交互演练：动画师界面打关键帧/切插值
  await page.goto('http://localhost:8977/index.html#/animator');
  await page.waitForTimeout(400);
  await page.click('#play'); await page.waitForTimeout(500); await page.click('#play');
  const segs = await page.locator('.tl-seg').count();
  if (segs > 0) await page.locator('.tl-seg').first().click();
  console.log('animator interactions ok, segments:', segs);

  // 质检：复核员确认/驳回 + 退回
  await page.selectOption('#role-select', 'reviewer');
  await page.goto('http://localhost:8977/index.html#/qc');
  await page.waitForTimeout(400);
  const okBtns = await page.locator('[data-issue-ok]:not([disabled])').count();
  const noBtns = await page.locator('[data-issue-no]:not([disabled])').count();
  console.log('qc open issues: confirmable =', okBtns, 'rejectable =', noBtns);
  if (okBtns) await page.locator('[data-issue-ok]:not([disabled])').first().click();
  await page.waitForTimeout(300);
  // 全部确认后应出现"退回供应方"可用
  for (let i = 0; i < 10; i++) {
    const b = page.locator('[data-issue-ok]:not([disabled])').first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(200); }
    const r = page.locator('[data-issue-no]:not([disabled])').first();
    if (await r.count()) { await r.click(); await page.waitForTimeout(200); }
    if (!(await page.locator('[data-issue-ok]:not([disabled])').count()) && !(await page.locator('[data-issue-no]:not([disabled])').count())) break;
  }
  await page.waitForTimeout(300);
  const retDisabled = await page.locator('#btn-return').isDisabled().catch(() => 'n/a');
  const relDisabled = await page.locator('#btn-release').isDisabled().catch(() => 'n/a');
  console.log('after review: return disabled =', retDisabled, ', release disabled =', relDisabled);

  // 导出：序列帧 zip
  await page.selectOption('#role-select', 'animator');
  await page.goto('http://localhost:8977/index.html#/export');
  await page.waitForTimeout(400);
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#ex-frames');
  const download = await dl;
  console.log('frames zip download:', download.suggestedFilename());
  const dl2 = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#ex-report');
  console.log('report download:', (await dl2).suggestedFilename());

  // 教练端只看放行
  await page.selectOption('#role-select', 'coach');
  await page.waitForTimeout(400);
  const navText = await page.locator('#main-nav').innerText();
  console.log('coach nav:', navText.replace(/\n/g, ','));

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
