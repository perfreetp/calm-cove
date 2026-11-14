import { chromium } from 'playwright-core';
const exe = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
await page.goto('http://localhost:5179/#/projects', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const pages = [
  ['projects', '#/projects'], ['project', '#/projects/proj-1'], ['editor', '#/editor/shot-2'],
  ['review', '#/review'], ['reviewshot', '#/review/shot-2'], ['library', '#/library'],
  ['deliveries', '#/deliveries'], ['learner', '#/learner'], ['learnershot', '#/learner/shot-1'],
  ['activity', '#/activity'],
];
for (const [name, hash] of pages) {
  await page.goto('http://localhost:5179/' + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(name.includes('editor') || name.includes('shot') ? 1600 : 500);
  const canvasDrawn = await page.locator('.stage canvas').count() > 0
    ? await page.locator('.stage canvas').first().evaluate((c) => c.width > 0 && c.height > 0)
    : null;
  const hud = await page.locator('.stage-hud .pill').allInnerTexts().catch(() => []);
  await page.screenshot({ path: `scripts/out/final-${name}.png` });
  console.log(name.padEnd(12), 'canvasDrawn=', canvasDrawn, 'hud=', hud.join('/') || '-');
}
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
