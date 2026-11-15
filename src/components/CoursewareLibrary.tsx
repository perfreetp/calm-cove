import { For, Show } from 'solid-js';
import { useAppStore } from '../store/app';
import type { AnimationDoc } from '../types';
import { autoScore } from '../lib/rules';

interface Props {
  onClose: () => void;
  onApply: (doc: AnimationDoc) => void;
}

/** 标准动作课件库:内置与教师/学员保存的课件均可复用 */
export default function CoursewareLibrary(props: Props) {
  const store = useAppStore();

  return (
    <div class="modal-mask" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()} style={{ 'min-width': '680px' }}>
        <h3>📚 标准动作课件库(可复用模板)</h3>
        <div class="small muted mb8">
          套用后会将课件的骨骼、拆件、关键帧与节点区间整体载入当前编辑器(覆盖当前内容)。
        </div>
        <For each={store.coursewares()} fallback={<div class="empty-hint">课件库为空</div>}>
          {(cw) => {
            const preview = autoScore(cw.doc);
            return (
              <div class="metric-box" style={{ display: 'block' }}>
                <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
                  <b>{cw.name}</b>
                  <div class="row-flex gap">
                    <Show when={cw.builtin}>
                      <span class="badge completed">内置标准课件</span>
                    </Show>
                    <span class="score-pill high">规范分 {preview.total}</span>
                  </div>
                </div>
                <div class="small muted mt8" style={{ 'line-height': 1.7 }}>
                  {cw.description}
                </div>
                <div class="small mono mt8">
                  时长 {cw.doc.duration}s · 关键帧 {cw.doc.keyframes.length} 个 · 违规 {preview.violations.length} 处
                </div>
                <div class="row-flex mt8" style={{ 'justify-content': 'flex-end' }}>
                  <Show when={!cw.builtin}>
                    <button class="danger" onClick={() => store.deleteCourseware(cw.id)}>
                      删除
                    </button>
                  </Show>
                  <button
                    class="primary"
                    onClick={() => {
                      props.onApply(structuredClone(cw.doc));
                    }}
                  >
                    套用此课件
                  </button>
                </div>
              </div>
            );
          }}
        </For>
        <div class="right mt16">
          <button onClick={props.onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
