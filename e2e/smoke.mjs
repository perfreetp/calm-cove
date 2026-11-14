// 浏览器端到端冒烟测试:建档 → 生成 → 拖拽 → 双视角 → 比对 → 工作流 → 导出
// 用法: node e2e/smoke.mjs  (需先启动 dev server)
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const EXE = process.env.CHROME_EXE ||
  `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1255/chrome-win64/chrome.exe`;
const BASE = 'http://localhost:5173';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? '✓' : '✗'} ${name} ${extra}`);
};

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => check('页面无未捕获异常', false, e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160));
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1. 建档
  await page.getByPlaceholder('裁判姓名').fill('张裁判');
  await page.getByPlaceholder('设计师姓名').fill('李设计');
  await page.getByRole('button', { name: '建档并进入工作室' }).click();
  await page.waitForTimeout(300);
  check('建档后进入工作室', (await page.locator('h2').first().textContent()).includes('EQ-'));

  // 2. 生成路线
  await page.getByRole('button', { name: '生成路线' }).click();
  await page.waitForSelector('.lbl', { timeout: 8000 });
  await page.waitForTimeout(500);
  const backend = await page.locator('.toolbar .tag').first().textContent();
  check('渲染器已初始化', /WebGPU|Canvas2D/.test(backend), `(${backend.trim()})`);

  const labelCount = await page.locator('.lbl').count();
  check('障碍/标注覆盖层已渲染', labelCount >= 10, `${labelCount} 个标注`);

  const shot1 = await page.screenshot();
  check('俯视截图非空', shot1.length > 20000, `${shot1.length} bytes`);

  // 3. 骑手视角
  await page.getByRole('button', { name: '骑手视角' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '下一道 ▶' }).click();
  await page.waitForTimeout(300);
  check('骑手视角可切换并逐道浏览', true);
  await page.screenshot({ path: 'e2e/shots/rider.png' });
  await page.getByRole('button', { name: '俯视' }).click();
  await page.waitForTimeout(400);

  // 4. 拖拽第一个障碍 → 手动标记
  const firstLabel = page.locator('.lbl').first();
  const box = await firstLabel.boundingBox();
  const canvas = await page.locator('canvas').first().boundingBox();
  const sx = box.x + box.width / 2 - canvas.x;
  const sy = box.y + box.height / 2 - canvas.y;
  await page.mouse.move(canvas.x + sx, canvas.y + sy);
  await page.mouse.down();
  await page.mouse.move(canvas.x + sx + 60, canvas.y + sy + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const manualCount = await page.locator('.lbl', { hasText: '✋' }).count();
  check('拖拽后障碍标记为手动(✋)', manualCount > 0, `${manualCount} 个手动障碍`);
  await page.screenshot({ path: 'e2e/shots/top-manual.png' });

  // 5. 再生成一个新版本并进入比对
  await page.getByRole('button', { name: '生成新版本' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '版本比对' }).click();
  await page.waitForTimeout(600);
  const compareCanvas = await page.locator('canvas').count();
  check('版本比对并排渲染', compareCanvas >= 2, `${compareCanvas} 个画布`);
  const diffText = await page.locator('.detail').textContent().catch(() => '');
  check('比对视图含改动明细', diffText.includes('改动明细'));
  await page.screenshot({ path: 'e2e/shots/compare.png', fullPage: false });

  // 6. 季度报告
  await page.getByRole('button', { name: '季度报告' }).click();
  await page.waitForTimeout(300);
  const reportText = await page.locator('table').first().textContent();
  check('季度报告表格渲染', reportText.includes('Q1') && reportText.includes('通过率'));

  // 7. 工作流:设计师提交 → 裁判通过
  await page.getByRole('button', { name: '路线工作室' }).click();
  await page.waitForTimeout(300);
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '提交审查' }).click();
  await page.waitForTimeout(400);
  const submitted = await page.locator('.tag.submitted').count();
  check('设计师提交成功(待审查标签)', submitted > 0);

  await page.getByRole('button', { name: '裁判' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '审查通过' }).click();
  await page.waitForTimeout(300);
  const approved = await page.locator('.tag.approved').count();
  check('裁判审查通过', approved > 0);

  // 8. 导出 SVG / CSV
  const [dl1] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.getByRole('button', { name: '路线图 SVG' }).click(),
  ]);
  check('路线图 SVG 导出', dl1.suggestedFilename().endsWith('.svg'), dl1.suggestedFilename());
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.getByRole('button', { name: '步距表 CSV' }).click(),
  ]);
  check('步距表 CSV 导出', dl2.suggestedFilename().endsWith('.csv'), dl2.suggestedFilename());

  // 9. 档案室检索
  await page.getByRole('button', { name: '档案室' }).click();
  await page.waitForTimeout(300);
  const rows = await page.locator('tbody tr').count();
  check('档案室可检索到新建赛事', rows >= 1, `${rows} 行`);
} catch (e) {
  check('冒烟流程异常中断', false, e.message);
  await page.screenshot({ path: 'e2e/shots/error.png' }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length ? 1 : 0);
