import { For, Show } from 'solid-js';
import type { SubmissionRecord } from '../types';
import { VIOLATION_TYPE_LABEL } from '../lib/rules';

interface Props {
  submission: SubmissionRecord;
  onClose: () => void;
}

/** 退回时学员看到的"具体哪一段不合格"明细 */
export default function ReturnFeedback(props: Props) {
  const sub = () => props.submission;
  const nodeName = (id: string) =>
    ({ disinfect: '消毒', insert: '进针', fix: '固定', withdraw: '拔针', press: '按压' })[id] ?? id;

  return (
    <div class="modal-mask" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()} style={{ 'min-width': '620px' }}>
        <h3>
          ↩️ 作业退回通知(第 {sub().revision} 次)
        </h3>
        <div class="spec-card">
          老师已退回你的作业。请根据下面<b>逐段不合格明细</b>整改对应时间轴区间,完成后重新提交。
        </div>

        <h3 style={{ margin: '16px 0 8px', 'font-size': '14px' }}>老师评语</h3>
        <Show when={sub().generalComment} fallback={<div class="small muted">无总评</div>}>
          <div class="metric-box">{sub().generalComment}</div>
        </Show>

        <h3 style={{ margin: '16px 0 8px', 'font-size': '14px' }}>逐段复核结果</h3>
        <table>
          <thead>
            <tr>
              <th>动作段</th>
              <th>是否合格</th>
              <th>老师扣分/评语</th>
            </tr>
          </thead>
          <tbody>
            <For each={sub().review}>
              {(r) => (
                <tr>
                  <td>{nodeName(r.nodeId)}</td>
                  <td>
                    <span class={`badge ${r.qualified ? 'completed' : 'returned'}`}>
                      {r.qualified ? '合格' : '不合格'}
                    </span>
                    <Show when={r.teacherScore !== null}>
                      <span class="score-pill mid" style={{ 'margin-left': '6px' }}>
                        {r.teacherScore}
                      </span>
                    </Show>
                  </td>
                  <td class="small">{r.comment || <span class="muted">—</span>}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        <h3 style={{ margin: '16px 0 8px', 'font-size': '14px' }}>系统检测到的违规时间区间(时间轴标红处)</h3>
        <table>
          <thead>
            <tr>
              <th>动作段</th>
              <th>类型</th>
              <th>问题描述</th>
              <th>时间区间</th>
            </tr>
          </thead>
          <tbody>
            <For each={sub().autoScore?.violations ?? []}>
              {(v) => (
                <tr>
                  <td>{nodeName(v.nodeId)}</td>
                  <td>
                    <span class={`badge v-${v.type}`}>{VIOLATION_TYPE_LABEL[v.type]}</span>
                  </td>
                  <td class="small">{v.message}</td>
                  <td class="mono small">
                    {v.start.toFixed(1)}s ~ {v.end.toFixed(1)}s
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        <div class="right mt16">
          <button class="primary" onClick={props.onClose}>
            我知道了,去整改
          </button>
        </div>
      </div>
    </div>
  );
}
