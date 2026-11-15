import { createSignal, Show } from 'solid-js';
import type { AnimationDoc, ExportOptions } from '../types';
import { exportAndDownload, exportSnapshot } from '../lib/export';

interface Props {
  doc: AnimationDoc;
  onClose: () => void;
}

export default function ExportDialog(props: Props) {
  const [opts, setOpts] = createSignal<ExportOptions>({
    width: 640,
    height: 480,
    fps: 10,
    start: 0,
    end: Math.min(props.doc.duration, 30),
    includeNeedle: true,
  });
  const [progress, setProgress] = createSignal<{ frame: number; total: number } | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [snapBusy, setSnapBusy] = createSignal(false);

  const update = (patch: Partial<ExportOptions>) => setOpts({ ...opts(), ...patch });

  async function doExport() {
    setBusy(true);
    try {
      await exportAndDownload(props.doc, opts(), (p) => setProgress(p));
    } catch (err) {
      alert(`导出失败:${(err as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function doSnapshot() {
    setSnapBusy(true);
    try {
      // 时间轴总时长可能较长,快照取当前文档首帧附近的进针段中点
      const insert = props.doc.nodeRanges.insert;
      await exportSnapshot(props.doc, insert ? (insert.start + insert.end) / 2 : 0);
    } finally {
      setSnapBusy(false);
    }
  }

  const frameCount = () =>
    Math.round((opts().end - opts().start) * opts().fps) + 1;

  return (
    <div class="modal-mask" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h3>导出 PNG 序列帧(ZIP 打包)</h3>
        <div class="grid cols-2">
          <div class="field">
            <label>宽度(px)</label>
            <input type="number" value={opts().width} onChange={(e) => update({ width: Number(e.currentTarget.value) })} />
          </div>
          <div class="field">
            <label>高度(px)</label>
            <input type="number" value={opts().height} onChange={(e) => update({ height: Number(e.currentTarget.value) })} />
          </div>
          <div class="field">
            <label>帧率 fps</label>
            <input type="number" min={1} max={30} value={opts().fps} onChange={(e) => update({ fps: Number(e.currentTarget.value) })} />
          </div>
          <div class="field">
            <label>辅助线</label>
            <select
              value={opts().includeNeedle ? '1' : '0'}
              onChange={(e) => update({ includeNeedle: e.currentTarget.value === '1' })}
            >
              <option value="1">包含规范辅助线</option>
              <option value="0">纯角色画面</option>
            </select>
          </div>
          <div class="field">
            <label>起始(s)</label>
            <input
              type="number"
              step={0.5}
              value={opts().start}
              onChange={(e) => update({ start: Math.max(0, Number(e.currentTarget.value)) })}
            />
          </div>
          <div class="field">
            <label>结束(s)</label>
            <input
              type="number"
              step={0.5}
              max={props.doc.duration}
              value={opts().end}
              onChange={(e) => update({ end: Math.min(props.doc.duration, Number(e.currentTarget.value)) })}
            />
          </div>
        </div>
        <div class="small muted">
          将生成 <b class="mono">{frameCount()}</b> 张 PNG(从 {opts().start.toFixed(1)}s 到 {opts().end.toFixed(1)}s
          @ {opts().fps}fps),打包为 ZIP 下载。按压段长达 180 秒,建议分段导出避免帧数过多。
        </div>

        <Show when={progress()}>
          {(p) => (
            <div class="mt16">
              <div class="progress-bar">
                <div style={{ width: `${(p().frame / p().total) * 100}%` }} />
              </div>
              <div class="small muted mt8">
                正在渲染 {p().frame}/{p().total} 帧…
              </div>
            </div>
          )}
        </Show>

        <div class="row-flex mt16" style={{ 'justify-content': 'flex-end' }}>
          <button onClick={doSnapshot} disabled={snapBusy() || busy()}>
            {snapBusy() ? '渲染中…' : '📷 导出当前规范快照'}
          </button>
          <button onClick={props.onClose} disabled={busy()}>
            取消
          </button>
          <button class="primary" onClick={doExport} disabled={busy()}>
            {busy() ? '打包中…' : '导出序列帧 ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
