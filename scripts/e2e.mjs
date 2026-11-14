import { chromium } from 'playwright-core';

const exe = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

const log = (...a) => console.log(...a);
await page.goto('http://localhost:5179/#/projects', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// ---- 1. create a project with a custom shot list
await page.getByRole('button', { name: /新建立项/ }).click();
await page.waitForTimeout(300);
const inputs = page.locator('.modal input');
await inputs.nth(0).fill('分娩镇痛与产程观察');
await inputs.nth(1).fill('安心月子中心');
await page.locator('.modal input[type=number]').first().fill('5');
await page.getByRole('button', { name: /立项目并生成镜头条目/ }).click();
await page.waitForTimeout(800);
log('PROJECT HEAD:', await page.locator('h1').first().innerText());
log('SHOT ROWS:', await page.locator('table.data tbody tr').count());

// ---- 2. open the first shot in the editor
await page.locator('table.data tbody tr').first().getByRole('button', { name: '编辑器' }).click();
await page.waitForTimeout(1800);
log('EDITOR HUD:', await page.locator('.stage-hud .pill').allInnerTexts());

// ---- 3. drag the fetal head bone well outside its range
const canvas = page.locator('.stage canvas');
const box = await canvas.boundingBox();
const hudBone = await page.locator('.stage-hud .pill').nth(2).innerText().catch(() => '');
log('SELECTED START:', hudBone);
// click roughly on the head area (centre-bottom of the figure)
await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.62);
await page.waitForTimeout(300);
const selected = await page.locator('.stage-hud .pill').allInnerTexts();
log('AFTER CLICK:', selected);

// drag from the joint outward horizontally to rotate
const jointX = box.x + box.width / 2;
const jointY = box.y + box.height * 0.62;
await page.mouse.move(jointX, jointY);
await page.mouse.down();
await page.mouse.move(jointX + 260, jointY, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
const alertText = await page.locator('.stage-alert').innerText().catch(() => '');
log('ALERT:', alertText);

const saveDisabled = await page.getByRole('button', { name: '保存' }).first().isDisabled();
log('SAVE DISABLED (expect true when violating):', saveDisabled);
const keyCount = await page.locator('.tl-key').count();
log('TIMELINE KEYS:', keyCount);

await page.screenshot({ path: 'scripts/out/e2e-editor.png' });

// ---- 4. verify persistence blocked then fix by setting angle into range
await page.waitForTimeout(200);
const rotInput = page
  .locator('.section')
  .filter({ hasText: '当前帧姿态' })
  .locator('input[type=number]')
  .first();
log('ROT INPUTS BEFORE:', await page.locator('.section').filter({ hasText: '当前帧姿态' }).locator('input[type=number]').evaluateAll((els) => els.map((e) => e.value)));
await rotInput.fill('10');
await page.waitForTimeout(400);
log('ROT INPUTS AFTER:', await page.locator('.section').filter({ hasText: '当前帧姿态' }).locator('input[type=number]').evaluateAll((els) => els.map((e) => e.value)));
log('ALERT AFTER FIX:', await page.locator('.stage-alert').innerText().catch(() => 'none'));
log('ISSUE LIST:', await page.locator('.inspector .issue').allInnerTexts());
const saveEnabled = await page.getByRole('button', { name: '保存' }).first().isEnabled();
log('SAVE ENABLED AFTER FIX:', saveEnabled);
if (saveEnabled) {
  await page.getByRole('button', { name: '保存' }).first().click();
  await page.waitForTimeout(500);
}
log('SAVED TOAST:', await page.locator('.toast').allInnerTexts());

// ---- 5. submit for review
await page.getByRole('button', { name: '提交审核' }).click();
await page.waitForTimeout(1200);
log('URL AFTER SUBMIT:', page.url());
log('REVIEW HUD:', await page.locator('.stage-hud .pill').allInnerTexts());

// write a per-frame comment
await page.locator('.review-side textarea').fill('胎头俯屈幅度不足，下颌未贴胸');
await page.getByRole('button', { name: /记录到第/ }).click();
await page.waitForTimeout(300);
log('COMMENTS:', await page.locator('.review-side .comment').count());

// reject
await page.getByRole('button', { name: '退回返工' }).click();
await page.waitForTimeout(300);
await page.locator('.modal').getByRole('button', { name: '退回返工' }).click();
await page.waitForTimeout(800);
log('URL AFTER REJECT:', page.url());
log('QUEUE EMPTY:', await page.locator('.empty').innerText().catch(() => ''));

// back to editor: rework count should be 1
await page.goto(page.url().replace('#/review', '#/projects/proj-1'), { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const rows = page.locator('table.data tbody tr');
log('PROJ1 ROWS:', await rows.count());
log('E2E ERRORS:', errors.slice(0, 5));
await browser.close();
