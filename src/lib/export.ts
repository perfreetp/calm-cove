import type { AnimationDoc, ExportOptions } from '../types';
import { buildScene, preloadPartImages } from './scene';
import { Offscreen2DRenderer } from '../renderer/renderer';
import { downloadBlob, encodePNG, encodeZIP } from '../renderer/encoder';

export interface ExportProgress {
  frame: number;
  total: number;
}

/** 逐帧离屏渲染并打包 PNG 序列帧 ZIP */
export async function exportPngSequence(
  doc: AnimationDoc,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  await preloadPartImages(doc);
  const totalFrames = Math.max(
    1,
    Math.round(((options.end - options.start) * options.fps) / 1) + 1,
  );
  const renderer = new Offscreen2DRenderer(options.width, options.height);
  const entries: { name: string; data: Uint8Array }[] = [];
  const pad = String(totalFrames).length;

  for (let i = 0; i < totalFrames; i++) {
    const t = Number((options.start + i / options.fps).toFixed(3));
    const scene = buildScene(doc, Math.min(t, options.end), {
      showSkeleton: false,
      showGuides: options.includeNeedle,
    });
    renderer.render(scene);
    const image = renderer.ctx.getImageData(0, 0, options.width, options.height);
    const png = encodePNG(image);
    entries.push({ name: `frame_${String(i + 1).padStart(pad, '0')}.png`, data: png });
    onProgress?.({ frame: i + 1, total: totalFrames });
    // 让出主线程,避免长时间阻塞 UI
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  renderer.dispose();
  return encodeZIP(entries);
}

export async function exportAndDownload(
  doc: AnimationDoc,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const blob = await exportPngSequence(doc, options, onProgress);
  downloadBlob(blob, `采血动画序列帧_${options.width}x${options.height}_${options.fps}fps.zip`);
}

/** 导出当前单帧 PNG(预览快照) */
export async function exportSnapshot(doc: AnimationDoc, time: number): Promise<void> {
  await preloadPartImages(doc);
  const renderer = new Offscreen2DRenderer(960, 720);
  renderer.render(buildScene(doc, time, { showSkeleton: false, showGuides: true }));
  const image = renderer.ctx.getImageData(0, 0, 960, 720);
  const png = encodePNG(image);
  const pngBuffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  downloadBlob(
    new Blob([pngBuffer], { type: 'image/png' }),
    `采血动画快照_t${time.toFixed(1)}s.png`,
  );
  renderer.dispose();
}
