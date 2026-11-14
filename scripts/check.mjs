import { chromium } from 'playwright-core';

const exe = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5179/#/projects', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const shots = [
  ['projects', '#/projects'],
  ['project', '#/projects/proj-1'],
  ['editor', '#/editor/shot-2'],
  ['review', '#/review'],
  ['reviewshot', '#/review/shot-2'],
  ['library', '#/library'],
  ['deliveries', '#/deliveries'],
  ['learner', '#/learner'],
  ['activity', '#/activity'],
];
for (const [name, hash] of shots) {
  await page.goto(`http://localhost:5179/${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(name === 'editor' || name === 'reviewshot' ? 1800 : 600);
  await page.screenshot({ path: `scripts/out/${name}.png` });
  console.log(name, 'ok', (await page.locator('body').innerText()).slice(0, 60).replace(/\n/g, ' | '));
}
console.log('LOGS:\n' + logs.slice(0, 20).join('\n'));
await browser.close();
