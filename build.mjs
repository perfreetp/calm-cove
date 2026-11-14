import { context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const dist = resolve(root, 'dist');

if (existsSync(dist)) await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const ctx = await context({
  entryPoints: ['src/main.ts', 'src/workers/illuminance.worker.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
});

await ctx.rebuild();
await cp(resolve(root, 'index.html'), resolve(dist, 'index.html'));
await cp(resolve(root, 'src/styles.css'), resolve(dist, 'styles.css'));

if (watch) {
  await ctx.watch();
  console.log('esbuild watching...');
} else {
  await ctx.dispose();
  console.log('build done -> dist/');
}
