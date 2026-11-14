import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2500));
// 拖动期间连续触发，测量交互重算延迟（从 post 到结果上屏）
const latency = await page.evaluate(async () => {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const el = document.querySelector('[data-role="hour"]');
    el.value = String(9 + i);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    // 等 daylight 标签变化（最多 3s）
    const target = document.querySelector('[data-role="daylight"]').textContent;
    await new Promise((res) => {
      const iv = setInterval(() => {
        if (document.querySelector('[data-role="daylight"]').textContent !== target
            || performance.now() - t0 > 3000) { clearInterval(iv); res(); }
      }, 30);
    });
    samples.push(Math.round(performance.now() - t0));
  }
  return samples;
});
console.log('重算上屏延迟(ms):', latency, '均值', Math.round(latency.reduce((a,b)=>a+b,0)/latency.length));
// 时段自然光曲线
const curve = [];
for (const h of [8, 10, 12, 14, 16, 18, 20]) {
  await page.$eval('[data-role="hour"]', (el, hh) => { el.value = String(hh); el.dispatchEvent(new Event('input', { bubbles: true })); }, h);
  await new Promise((r) => setTimeout(r, 500));
  curve.push(`${h}h=` + (await page.$eval('[data-role="daylight"]', (el) => el.textContent)).replace('窗入射参考 ', ''));
}
console.log('自然光曲线:', curve.join(' | '));
console.log('页面错误:', errors.length ? errors : '无');
await browser.close();
