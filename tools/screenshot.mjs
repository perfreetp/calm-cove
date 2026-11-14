// Dev helper: capture the key screens with Playwright (requires the dev servers).
//   node tools/screenshot.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || 'data/screens';
const base = process.env.BASE_URL || 'http://localhost:5173';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 980 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));

await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-dashboard.png` });

await page.goto(`${base}/projects/1/draw`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/02-overview.png` });

await page.locator('.seg button', { hasText: '1:500' }).first().click({ force: true });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/03-detail-1-500.png` });

const box = await page.locator('#plan-canvas').boundingBox();
await page.mouse.click(box.x + box.width * 0.18, box.y + box.height * 0.66);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/04-selection.png` });

await page.goto(`${base}/projects/1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/05-project.png` });
await page.locator('.sidebar-tabs button', { hasText: '送审与审核' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/06-review.png` });

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
