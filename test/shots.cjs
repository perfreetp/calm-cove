const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(8978, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  for (const r of ['animator', 'metrics', 'rigging', 'coach']) {
    await page.goto(`http://localhost:8978/index.html#/${r}`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test/shot-${r}.png`, fullPage: r === 'metrics' });
  }
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
