import { createSignal, For, Show } from 'solid-js';
import type { EditorStore } from '../store/editor';
import type { BoneDef, PartDef } from '../types';
import { uid } from '../data/constants';
import { partDragData } from './Viewport';

interface Props {
  editor: EditorStore;
}

export default function BindingPanel(props: Props) {
  const editor = props.editor;
  const [importError, setImportError] = createSignal('');

  const childrenOf = (parentId: string | null): BoneDef[] =>
    editor.doc.bones.filter((b) => b.parentId === parentId);

  const renderBone = (bone: BoneDef, depth: number) => {
    const selected = () => editor.selection().kind === 'bone' && editor.selection().id === bone.id;
    return (
      <div>
        <div
          class={`tree-item ${selected() ? 'selected' : ''}`}
          onClick={() => editor.setSelection({ kind: 'bone', id: bone.id })}
        >
          <span class="indent" style={{ width: `${depth * 14}px` }} />
          <span>🦴</span>
          <span style={{ flex: 1 }}>{bone.name}</span>
          <span class="muted small mono">
            {bone.minAngle}°~{bone.maxAngle}°
          </span>
        </div>
        <For each={childrenOf(bone.id)}>{(child) => renderBone(child, depth + 1)}</For>
      </div>
    );
  };

  async function onImportFiles(files: FileList | null) {
    setImportError('');
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setImportError(`${file.name} 不是图片文件,已跳过`);
        continue;
      }
      try {
        const dataUrl = await readAsDataURL(file);
        const dim = await imageSize(dataUrl);
        const part: PartDef = {
          id: uid('part'),
          name: file.name.replace(/\.[^.]+$/, ''),
          builtin: null,
          src: dataUrl,
          width: dim.w,
          height: dim.h,
          pivotX: dim.w / 2,
          pivotY: dim.h / 2,
          boneId: null,
          zOrder: editor.doc.parts.length,
        };
        editor.addPart(part);
      } catch (err) {
        setImportError(`${file.name} 读取失败:${(err as Error).message}`);
      }
    }
  }

  return (
    <div class="panel" style={{ height: '100%' }}>
      <div class="panel-header">🪆 角色拆件与绑骨</div>
      <div class="panel-body">
        <div class="small muted mb8">骨骼层级(点击选中,右侧调父子层级与旋转范围)</div>
        <For each={childrenOf(null)}>{(bone) => renderBone(bone, 0)}</For>

        <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
        <div class="small muted mb8">分层拆件(拖拽到视口关节处绑骨)</div>

        <label class="drop-zone" style={{ display: 'block', cursor: 'pointer', 'margin-bottom': '10px' }}>
          📁 点击导入分层 PNG(可多选)
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => onImportFiles(e.currentTarget.files)}
          />
        </label>
        <Show when={importError()}>
          <div class="small" style={{ color: 'var(--danger)' }}>
            {importError()}
          </div>
        </Show>

        <For each={[...editor.doc.parts].sort((a, b) => a.zOrder - b.zOrder)}>
          {(part) => {
            const bone = () => editor.doc.bones.find((b) => b.id === part.boneId);
            const selected = () => editor.selection().kind === 'part' && editor.selection().id === part.id;
            return (
              <div
                class={`tree-item ${selected() ? 'selected' : ''}`}
                draggable
                onDragStart={(e) => {
                  const data = partDragData(part);
                  Object.entries(data).forEach(([k, v]) => e.dataTransfer?.setData(k, v));
                  e.dataTransfer!.effectAllowed = 'move';
                }}
                onClick={() => editor.setSelection({ kind: 'part', id: part.id })}
              >
                <span class={`bind-dot ${part.boneId ? '' : 'none'}`} />
                <span style={{ flex: 1 }}>{part.name}</span>
                <Show when={bone()} fallback={<span class="muted small">未绑骨</span>}>
                  <span class="small" style={{ color: 'var(--success)' }}>
                    → {bone()!.name}
                  </span>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('文件读取失败'));
    r.readAsDataURL(file);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('尺寸解析失败'));
    img.src = src;
  });
}
