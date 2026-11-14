import { For, Show, createMemo } from 'solid-js';
import type { PartGroup, Rig } from '../core/types';
import { boneMap, topoSortBones } from '../core/skeleton';

export interface RigTreeProps {
  rig: Rig;
  selectedPartId: string | null;
  selectedBoneId: string | null;
  violatingBones: Set<string>;
  edited: boolean;
  onSelectPart: (partId: string) => void;
  onSelectBone: (boneId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onTogglePartVisible: (partId: string) => void;
  onRenamePart: (partId: string, name: string) => void;
  onRenameBone: (boneId: string, name: string) => void;
}

function boneDepth(rig: Rig, boneId: string): number {
  const bones = boneMap(rig.bones);
  let depth = 0;
  let cur = bones.get(boneId)?.parentId ?? null;
  while (cur && depth < 12) {
    depth += 1;
    cur = bones.get(cur)?.parentId ?? null;
  }
  return depth;
}

export function RigTree(props: RigTreeProps) {
  const groups = createMemo(() => props.rig.groups);
  const partsOf = (groupId: string) => props.rig.parts.filter((p) => p.groupId === groupId);

  return (
    <div class="tree">
      <For each={groups()}>
        {(group: PartGroup) => (
          <div class="tree-group" classList={{ active: group.collapsed === false }}>
            <div class="tree-row" onClick={() => props.onToggleGroup(group.id)}>
              <span class="caret">{group.collapsed ? '▸' : '▾'}</span>
              <span
                class="swatch"
                style={{ background: `rgba(${group.color.map((c) => Math.round(c * 255)).join(',')})` }}
              />
              <span class="name">{group.name}</span>
              <span class="meta">{partsOf(group.id).length}</span>
            </div>
            <Show when={!group.collapsed}>
              <For each={partsOf(group.id)}>
                {(part) => (
                  <div
                    class="tree-row child"
                    classList={{ selected: props.selectedPartId === part.id }}
                    onClick={() => props.onSelectPart(part.id)}
                  >
                    <span
                      class="swatch"
                      style={{ background: `rgba(${part.fill.map((c) => Math.round(c * 255)).join(',')})` }}
                    />
                    <span class="name">{part.name}</span>
                    <button
                      class="icon small ghost"
                      title={part.visible ? '隐藏部件' : '显示部件'}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onTogglePartVisible(part.id);
                      }}
                      style={{ opacity: part.visible ? 1 : 0.45 }}
                    >
                      {part.visible ? '👁' : '🚫'}
                    </button>
                  </div>
                )}
              </For>
            </Show>
          </div>
        )}
      </For>
      <div class="divider" />
      <div class="panel-head" style={{ background: 'transparent', border: 'none', padding: '4px 6px' }}>
        <span style={{ 'font-size': '11px', 'letter-spacing': '0.05em', color: 'var(--text-2)' }}>骨骼层级</span>
      </div>
      <For each={topoSortBones(props.rig.bones)}>
        {(bone) => (
          <div
            class="tree-row child"
            style={{ 'padding-left': `${10 + boneDepth(props.rig, bone.id) * 12}px` }}
            classList={{ selected: props.selectedBoneId === bone.id }}
            onClick={() => props.onSelectBone(bone.id)}
            title={`关节范围 ${bone.minAngle}° ~ ${bone.maxAngle}°`}
          >
            <span style={{ color: props.violatingBones.has(bone.id) ? 'var(--danger)' : 'var(--accent-dim)' }}>◇</span>
            <span class="name">{bone.name}</span>
            <Show when={props.violatingBones.has(bone.id)}>
              <span class="warn-dot" />
            </Show>
            <span class="meta">
              {bone.minAngle}~{bone.maxAngle}°
            </span>
          </div>
        )}
      </For>
      <div class="hint" style={{ padding: '8px 6px' }}>
        部件与骨骼一一绑定。拖动骨骼手柄做旋转预览，切换骨架/画面层可检查遮挡关系。
      </div>
    </div>
  );
}
