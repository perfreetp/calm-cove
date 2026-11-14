import { chromium } from 'playwright-core';
const exe = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('dialog', (d) => d.accept());
const log = (...a) => console.log(...a);

await page.goto('http://localhost:5179/#/projects', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// --- copy motion from S03 to S04 (project 1)
await page.goto('http://localhost:5179/#/editor/shot-3', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
log('S03 keys:', await page.locator('.tl-key').count());
await page.getByRole('button', { name: /复制到下一镜头/ }).click();
await page.waitForTimeout(1500);
log('URL:', page.url());
log('S04 keys:', await page.locator('.tl-key').count());
log('TOAST:', await page.locator('.toast').allInnerTexts());
log('TOOLBAR CODE:', await page.locator('.editor-toolbar .mono').first().innerText());
await page.screenshot({ path: 'scripts/out/copied.png' });

// --- library: change easing of an action used by S01, check impact list
await page.goto('http://localhost:5179/#/library', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('.card').filter({ hasText: '俯屈' }).first().click();
await page.waitForTimeout(400);
await page.locator('.easing-grid button', { hasText: '线性' }).first().click();
await page.waitForTimeout(500);
log('IMPACT MODAL:', await page.locator('.modal h2').innerText().catch(() => 'none'));
log('IMPACT BODY:', (await page.locator('.modal-body').innerText().catch(() => '')).slice(0, 220).replace(/\n/g, ' | '));
await page.screenshot({ path: 'scripts/out/library-impact.png' });
await page.locator('.modal-foot').getByRole('button', { name: /确认修改并同步/ }).click();
await page.waitForTimeout(900);
log('AFTER SYNC TOAST:', await page.locator('.toast').allInnerTexts());
await page.goto('http://localhost:5179/#/activity', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
log('ACTIVITY TOP:', (await page.locator('.card').first().innerText()).replace(/\n/g, ' | '));

// --- bezier handle drag in editor
await page.goto('http://localhost:5179/#/editor/shot-1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.locator('.tl-key').nth(1).click();
await page.waitForTimeout(300);
await page.locator('.easing-grid button', { hasText: '自定义' }).click();
await page.waitForTimeout(400);
const svg = page.locator('.bezier-editor svg');
const h = await svg.locator('.bezier-handle').first().boundingBox();
if (h) {
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 40, h.y - 10, { steps: 8 });
  await page.mouse.up();
}
await page.waitForTimeout(400);
log('EASING LABEL:', await page.locator('.section').filter({ hasText: '关键帧 · 插值' }).locator('.hint').first().innerText().catch(() => ''));
await page.screenshot({ path: 'scripts/out/bezier.png' });
await browser.close();
