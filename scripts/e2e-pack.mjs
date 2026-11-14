import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const exe = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('dialog', (d) => d.accept());
const log = (...a) => console.log(...a);

await page.goto('http://localhost:5179/#/projects', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// project 2 shot S01 starts approved -> pack it
await page.goto('http://localhost:5179/#/deliveries', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const packs = await page.getByRole('button', { name: '打包并下载' }).count();
log('PACKABLE:', packs);
if (packs > 0) {
  const dlPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: '打包并下载' }).first().click();
  const dl = await dlPromise;
  mkdirSync('scripts/out/pack', { recursive: true });
  const path = 'scripts/out/pack/' + dl.suggestedFilename();
  await dl.saveAs(path);
  log('DOWNLOADED:', dl.suggestedFilename());
  const zip = unzipSync(new Uint8Array(readFileSync(path)));
  const names = Object.keys(zip).sort();
  log('FILES:', names.length, names.slice(0, 4).join(', '), '...', names.slice(-3).join(', '));
  const manifest = JSON.parse(strFromU8(zip['manifest.json']));
  log('MANIFEST:', manifest.format, manifest.frameCount, manifest.resolution.label, manifest.checksum);
  const action = JSON.parse(strFromU8(zip[`data/${manifest.shotCode}.action.json`]));
  log('ACTION:', action.format, Object.keys(action.tracks), 'bones', action.bones.length);
  const png = zip[names.find((n) => n.endsWith('.png'))];
  log('PNG MAGIC:', [...png.slice(0, 4)].join('.'), 'bytes', png.length);
  writeFileSync('scripts/out/pack/frame0.png', png);
}
await page.screenshot({ path: 'scripts/out/deliveries-packed.png' });
await browser.close();
