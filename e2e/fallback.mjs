// Canvas2D 降级验证:屏蔽 navigator.gpu
import { chromium } from 'playwright-core';
const EXE = `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1255/chrome-win64/chrome.exe`;
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.getByPlaceholder('裁判姓名').fill('张');
await page.getByPlaceholder('设计师姓名').fill('李');
await page.getByRole('button', { name: '建档并进入工作室' }).click();
await page.getByRole('button', { name: '生成路线' }).click();
await page.waitForSelector('.lbl', { timeout: 8000 });
await page.waitForTimeout(500);
const backend = await page.locator('.toolbar .tag').first().textContent();
await page.screenshot({ path: 'e2e/shots/canvas2d.png' });
console.log('降级后端:', backend.trim());
console.log('页面异常:', errors.length ? errors.join('; ') : '无');
await browser.close();
process.exit(backend.includes('Canvas2D') && !errors.length ? 0 : 1);
