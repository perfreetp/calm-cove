import { For, Show, createMemo, createSignal } from 'solid-js';
import { appState, projectById, saveDelivery, shotById } from '../store';
import { toast, Modal } from '../components/ui';
import { navigate, routes } from '../router';
import { buildSnapshot, fileNameForZip, formatBytes, frameCountOf, packDelivery } from '../core/delivery';
import { encodePng } from '../render/png';
import { rasterizeParts } from '../render/raster';
import { fmtDateTime } from '../core/workflow';
import type { DeliveryPackage, Shot } from '../core/types';

interface PackProgress {
  shotId: string;
  phase: 'rendering' | 'packing' | 'done';
  frame: number;
  total: number;
}

export function DeliveriesPage() {
  const [progress, setProgress] = createSignal<PackProgress | null>(null);
  const [preview, setPreview] = createSignal<DeliveryPackage | null>(null);

  const approved = createMemo(() =>
    appState.shots
      .filter((s) => s.status === 'approved')
      .map((s) => ({ shot: s, project: projectById(s.projectId) }))
      .sort((a, b) => (a.project?.dueDate ?? '').localeCompare(b.project?.dueDate ?? '')),
  );

  const packages = createMemo(() => [...appState.deliveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  const runPack = async (
    shot: Shot,
    project: { resolution: { width: number; height: number; label: string }; fps: number; courseName: string },
  ) => {
    const version = shot.versions[shot.versions.length - 1]?.version ?? 1;
    const fps = project.fps;
    const total = frameCountOf(shot.duration, fps);
    setProgress({ shotId: shot.id, phase: 'rendering', frame: 0, total });
    const snapshot = buildSnapshot(shot, project.courseName);
    snapshot.fps = fps;

    const frames: Array<{ index: number; data: Uint8Array }> = [];
    for (let i = 0; i < total; i++) {
      const t = i / fps;
      // Yield to the UI thread every few frames so the progress bar updates.
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      const rgba = rasterizeParts(
        snapshot.rig,
        snapshot.tracks,
        t,
        project.resolution.width,
        project.resolution.height,
      );
      frames.push({ index: i, data: encodePng(project.resolution.width, project.resolution.height, rgba) });
      setProgress({ shotId: shot.id, phase: 'rendering', frame: i + 1, total });
    }

    setProgress({ shotId: shot.id, phase: 'packing', frame: total, total });
    const result = packDelivery({
      shot: { ...shot, rig: snapshot.rig, tracks: snapshot.tracks, duration: shot.duration },
      courseName: project.courseName,
      version,
      resolution: project.resolution,
      fps,
      frames,
      actor: appState.currentUser.name,
    });
    saveDelivery(result.package);
    setProgress({ shotId: shot.id, phase: 'done', frame: total, total });
    downloadZip(result.zip, fileNameForZip(shot.code, version));
    toast(`已打包 ${shot.code} v${version}：${total} 帧 + 动作数据。`, 'ok', 5000);
    setTimeout(() => setProgress(null), 900);
  };

  return (
    <div class="page">
      <div class="page-head">
        <div style={{ flex: 1 }}>
          <h1>交付打包</h1>
          <p>审核通过的镜头可锁定版本，导出序列帧 + 动作数据文件（ZIP），供课件团队接入。</p>
        </div>
        <button class="small" onClick={() => navigate(routes.learner())}>
          学员端回放
        </button>
      </div>

      <div class="row" style={{ 'margin-bottom': '8px' }}>
        <h2 style={{ flex: 1 }}>待打包镜头</h2>
        <span class="muted small">仅审核通过或已锁版的镜头出现在此</span>
      </div>

      <Show when={approved().length} fallback={<div class="empty">暂无待打包镜头。先在审核队列里通过一个镜头。</div>}>
        <div class="col" style={{ gap: '8px', 'margin-bottom': '26px' }}>
          <For each={approved()}>
            {(item) => {
              const busy = () => progress()?.shotId === item.shot.id;
              return (
                <div class="card" style={{ padding: '12px 14px' }}>
                  <div class="row wrap">
                    <b>{item.project?.courseName}</b>
                    <span class="badge info mono">{item.shot.code}</span>
                    <span class="muted">{item.shot.title}</span>
                    <span class="badge ok">
                      已通过 v{item.shot.versions[item.shot.versions.length - 1]?.version ?? 1}
                    </span>
                    <Show when={item.shot.reworkCount > 0}>
                      <span class="badge warn">返工 {item.shot.reworkCount} 次</span>
                    </Show>
                    <div style={{ flex: 1 }} />
                    <span class="badge">{item.project?.resolution.label}</span>
                    <span class="badge">{item.project?.fps}fps</span>
                    <button
                      class="small primary"
                      disabled={!!progress()}
                      onClick={() => runPack(item.shot, item.project!)}
                    >
                      {busy() ? '打包中…' : '打包并下载'}
                    </button>
                  </div>
                  <Show when={busy()}>
                    <div style={{ 'margin-top': '10px' }}>
                      <div class="row small muted" style={{ 'justify-content': 'space-between' }}>
                        <span>
                          {progress()!.phase === 'rendering'
                            ? `渲染序列帧 ${progress()!.frame}/${progress()!.total}`
                            : progress()!.phase === 'packing'
                              ? '压缩打包中…'
                              : '完成'}
                        </span>
                        <span class="mono">
                          {Math.round((progress()!.frame / Math.max(1, progress()!.total)) * 100)}%
                        </span>
                      </div>
                      <div class="progress" style={{ 'margin-top': '4px' }}>
                        <span style={{ width: `${(progress()!.frame / Math.max(1, progress()!.total)) * 100}%` }} />
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <div class="row" style={{ 'margin-bottom': '8px' }}>
        <h2 style={{ flex: 1 }}>交付记录</h2>
        <span class="muted small">{packages().length} 个包</span>
      </div>
      <Show when={packages().length} fallback={<div class="empty">还没有交付记录。</div>}>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>镜头</th>
                <th>课程</th>
                <th>版本</th>
                <th>帧数</th>
                <th>分辨率</th>
                <th>大小</th>
                <th>校验码</th>
                <th>打包时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <For each={packages()}>
                {(pkg) => (
                  <tr>
                    <td class="mono">{pkg.manifest.shotCode}</td>
                    <td>{pkg.manifest.courseName}</td>
                    <td>
                      <span class="badge ok">v{pkg.version}</span>
                    </td>
                    <td class="mono">{pkg.frameCount}</td>
                    <td class="mono">{pkg.resolution.label}</td>
                    <td class="mono">{formatBytes(pkg.sizeBytes)}</td>
                    <td class="mono small">{pkg.checksum}</td>
                    <td class="muted small">{fmtDateTime(pkg.createdAt)}</td>
                    <td>
                      <div class="row" style={{ gap: '4px' }}>
                        <button class="small" onClick={() => setPreview(pkg)}>
                          清单
                        </button>
                        <button class="small primary" onClick={() => repack(pkg)}>
                          重新下载
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={preview()}>
        <ManifestModal pkg={preview()!} onClose={() => setPreview(null)} />
      </Show>
    </div>
  );
}

function repack(pkg: DeliveryPackage): void {
  const shot = shotById(pkg.shotId);
  if (!shot) {
    toast('原镜头已不存在，无法重新打包。', 'error');
    return;
  }
  const total = pkg.frameCount;
  const frames: Array<{ index: number; data: Uint8Array }> = [];
  for (let i = 0; i < total; i++) {
    const t = i / pkg.fps;
    const rgba = rasterizeParts(pkg.snapshot.rig, pkg.snapshot.tracks, t, pkg.resolution.width, pkg.resolution.height);
    frames.push({ index: i, data: encodePng(pkg.resolution.width, pkg.resolution.height, rgba) });
  }
  // Rebuild from the locked snapshot so a re-download never picks up later edits.
  const result = packDelivery({
    shot: { ...shot, rig: pkg.snapshot.rig, tracks: pkg.snapshot.tracks, duration: pkg.snapshot.duration },
    courseName: pkg.manifest.courseName,
    version: pkg.version,
    resolution: pkg.resolution,
    fps: pkg.fps,
    frames,
    actor: appState.currentUser.name,
    now: pkg.createdAt,
  });
  downloadZip(result.zip, fileNameForZip(pkg.manifest.shotCode, pkg.version));
  toast('已按锁定版本重新生成交付包。', 'ok');
}

function downloadZip(data: Uint8Array, fileName: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function ManifestModal(props: { pkg: DeliveryPackage; onClose: () => void }) {
  const json = createMemo(() => JSON.stringify(props.pkg.manifest, null, 2));
  return (
    <Modal
      title={`交付清单 · ${props.pkg.manifest.shotCode} v${props.pkg.version}`}
      wide
      onClose={props.onClose}
      footer={
        <>
          <button onClick={() => copyText(json())}>复制清单</button>
          <button class="primary" onClick={props.onClose}>
            关闭
          </button>
        </>
      }
    >
      <div class="row wrap">
        <span class="badge">{props.pkg.resolution.label}</span>
        <span class="badge">{props.pkg.fps} fps</span>
        <span class="badge">{props.pkg.frameCount} 帧</span>
        <span class="badge">{props.pkg.duration.toFixed(2)}s</span>
        <span class="badge">{formatBytes(props.pkg.sizeBytes)}</span>
        <span class="badge info">校验 {props.pkg.checksum}</span>
      </div>
      <div class="hint">
        目录：frames/{props.pkg.manifest.framePattern} · data/{props.pkg.manifest.shotCode}.action.json · manifest.json
        <br />
        动作数据包含骨骼层级、关节活动范围与逐骨骼关键帧（含缓动曲线定义）。
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px',
          background: 'var(--bg-0)',
          border: '1px solid var(--line)',
          'border-radius': '8px',
          'font-size': '12px',
          'max-height': '420px',
          overflow: 'auto',
          'line-height': 1.5,
        }}
      >
        {json()}
      </pre>
    </Modal>
  );
}

function copyText(text: string): void {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast('已复制到剪贴板。', 'ok'))
    .catch(() => toast('复制失败，请手动选择文本。', 'error'));
}
