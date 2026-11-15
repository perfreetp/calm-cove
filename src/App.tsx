import { createSignal, Show } from 'solid-js';
import { useAppStore } from './store/app';
import StudentView from './components/StudentView';
import TeacherView from './components/TeacherView';
import { getMetric } from './data/constants';
import { STATUS_LABEL } from './types';

export default function App() {
  const store = useAppStore();
  const [aboutOpen, setAboutOpen] = createSignal(false);

  return (
    <div class="app-shell">
      <header class="app-header">
        <div>
          <div class="logo">🩸 血站采血操作规范骨骼动画教学考核系统</div>
          <div class="sub">SolidJS + WebGPU 实时骨骼形变 · 五节点流程质控</div>
        </div>
        <div class="spacer" />
        <Show when={store.role() === 'student'}>
          <label style={{ color: 'rgba(255,255,255,0.85)' }}>当前学员</label>
          <select
            value={store.currentStudentId()}
            onChange={(e) => store.setCurrentStudentId(e.currentTarget.value)}
          >
            {store.students().map((s) => (
              <option value={s.id}>
                {s.name}({s.no})
              </option>
            ))}
          </select>
        </Show>
        <div class="role-switch">
          <button
            class={store.role() === 'student' ? 'active' : ''}
            onClick={() => store.switchRole('student')}
          >
            学员端
          </button>
          <button
            class={store.role() === 'teacher' ? 'active' : ''}
            onClick={() => store.switchRole('teacher')}
          >
            质控科教师端
          </button>
        </div>
        <button
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
          onClick={() => setAboutOpen(true)}
        >
          规范说明
        </button>
      </header>

      {store.role() === 'student' ? <StudentView /> : <TeacherView />}

      <Show when={aboutOpen()}>
        <div class="modal-mask" onClick={() => setAboutOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style={{ 'max-width': '640px' }}>
            <h3>采血操作规范区间(系统判定依据)</h3>
            <table>
              <thead>
                <tr>
                  <th>动作节点</th>
                  <th>时长要求</th>
                  <th>指标区间</th>
                </tr>
              </thead>
              <tbody>
                {store.actionNodes.map((n) => (
                  <tr>
                    <td>{n.order}. {n.name}</td>
                    <td class="mono">
                      ≥ {n.minDuration}s{n.maxDuration !== null ? `,≤ ${n.maxDuration}s` : ''}
                    </td>
                    <td>
                      {n.metrics.length === 0
                        ? '—'
                        : n.metrics
                            .map((m) => {
                              const metric = getMetric(m);
                              return `${metric.name} ${metric.min}~${metric.max}${metric.unit}`;
                            })
                            .join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div class="spec-card mt16">
              消毒时长不少于 <b>30 秒</b>;进针角度 <b>15°~30°</b>;拔针后按压满 <b>3 分钟(180 秒)</b>。
              状态流转:{STATUS_LABEL.pending} → {STATUS_LABEL.reviewing} → {STATUS_LABEL.completed}(退回时为
              {STATUS_LABEL.returned},学员按段整改后重新提交)。
            </div>
            <div class="right mt16">
              <button class="primary" onClick={() => setAboutOpen(false)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
