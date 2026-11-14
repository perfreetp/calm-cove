import { chromium } from 'playwright-core';
const exe = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5179/#/projects', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
for (const [name, hash] of [
  ['p-fetus', '#/editor/shot-7'],
  ['p-pelvis', '#/editor/shot-5'],
  ['p-canal', '#/editor/shot-6'],
  ['library', '#/library'],
  ['newproject', '#/projects'],
]) {
  await page.goto('http://localhost:5179/' + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  if (name === 'library') {
    await page.locator('.grid-projects .card, .card').first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `scripts/out/${name}.png` });
}
await browser.close();
