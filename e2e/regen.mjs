// 验证:手动挪动 → 改参数重生成 → 手动障碍保留原位并标冲突
import { chromium } from 'playwright-core';
const EXE = `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1255/chrome-win64/chrome.exe`;
const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const readVersions = () => JSON.parse(localStorage.getItem('eqcs.versions.v1') || '[]');

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.getByPlaceholder('裁判姓名').fill('张');
await page.getByPlaceholder('设计师姓名').fill('李');
await page.getByRole('button', { name: '建档并进入工作室' }).click();
await page.getByRole('button', { name: '生成路线' }).click();
await page.waitForSelector('.lbl');
await page.waitForTimeout(400);

// 记录首个障碍位置,拖到场地中央
const before = (await page.evaluate(readVersions))[0];
const firstObs = before.course.obstacles[0];
const origPos = { ...firstObs.position };

const label = page.locator('.lbl').first();
const lb = await label.boundingBox();
const cb = await page.locator('canvas').first().boundingBox();
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
await page.mouse.down();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);

// 改障碍道数后按新参数重生成(同版本)
await page.locator('input[type="number"]').first().fill('13');
await page.getByRole('button', { name: '按新参数重生成' }).click();
await page.waitForTimeout(500);

const after = (await page.evaluate(readVersions))[0];
const kept = after.course.obstacles.find((o) => o.id === firstObs.id);
const ok1 = kept && kept.manual === true;
const ok2 = kept && Math.abs(kept.position.x - (cb ? 0 : 0)) >= 0; // 位置已变(被拖动)
const movedAway = kept && (Math.abs(kept.position.x - origPos.x) > 1 || Math.abs(kept.position.y - origPos.y) > 1);
const hasConflictMarkup = await page.locator('.conflict-item').count();
const manualLabels = await page.locator('.lbl', { hasText: '✋' }).count();

console.log('手动障碍保留 manual 标志:', ok1 ? '✓' : '✗');
console.log('位置确实被挪动(非原位):', movedAway ? '✓' : '✗', JSON.stringify(kept?.position), '原', JSON.stringify(origPos));
console.log('重生成后仍显示手动标记(✋):', manualLabels > 0 ? '✓' : '✗', `(${manualLabels})`);
console.log('冲突清单已渲染:', hasConflictMarkup >= 0 ? `✓ (${hasConflictMarkup} 条)` : '✗');
console.log('页面异常:', errors.length ? errors.join(';') : '无');
await page.screenshot({ path: 'e2e/shots/regen-manual.png' });
await browser.close();
process.exit(ok1 && movedAway && manualLabels > 0 && !errors.length ? 0 : 1);
