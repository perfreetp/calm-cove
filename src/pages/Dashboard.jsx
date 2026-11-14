import { createResource, createSignal, For, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { api } from '../lib/api.js';
import { formatDate, formatChainage, DRAWING_SPECS, SHEET_SIZES_MM } from '../../shared/domain.js';

const RISK = {
  overdue: { label: '已超期', cls: 'bad', meter: 100, color: '#f87171' },
  high: { label: '高风险', cls: 'bad', meter: 82, color: '#f87171' },
  medium: { label: '需关注', cls: 'warn', meter: 55, color: '#fbbf24' },
  low: { label: '正常', cls: 'ok', meter: 24, color: '#4ade80' },
  done: { label: '已交付', cls: 'muted', meter: 100, color: '#5eead4' },
};

export default function Dashboard() {
  const [data, { refetch }] = createResource(() => api.dashboard());
  const [showNew, setShowNew] = createSignal(false);
  const [filter, setFilter] = createSignal('all');
  const navigate = useNavigate();

  const projects = () => {
    const list = data()?.projects || [];
    const f = filter();
    if (f === 'all') return list;
    if (f === 'risk') return list.filter((p) => ['high', 'overdue'].includes(p.risk));
    if (f === 'active') return list.filter((p) => p.status !== 'delivered');
    return list.filter((p) => p.status === 'delivered');
  };

  return (
    <div class="page">
      <div class="page-head">
        <div>
          <h1>项目看板</h1>
          <p>隧道机电通风系统图档的排产、审校与交付进度；红标为超期风险项目。</p>
        </div>
        <div class="spacer" />
        <div class="seg">
          <For each={[['all', '全部'], ['active', '进行中'], ['risk', '超期风险'], ['delivered', '已交付']]}>
            {([key, label]) => (
              <button class={filter() === key ? 'on' : ''} onClick={() => setFilter(key)}>{label}</button>
            )}
          </For>
        </div>
        <button class="btn primary" onClick={() => setShowNew(true)}>＋ 新建项目订单</button>
      </div>

      <Show when={data()} fallback={<div class="card empty">正在加载项目…</div>}>
        <div class="stat-grid">
          <Stat k="项目总数" v={data().totals.projects} d={`进行中 ${data().projects.filter((p) => p.status !== 'delivered').length} 个`} />
          <Stat k="要素总量" v={num(data().totals.elements)} d="射流风机 / 风阀 / 传感器 / 机房设备" />
          <Stat k="区段通过率" v={`${pct(data().totals.approved, data().totals.sections)}%`} d={`${data().totals.approved} / ${data().totals.sections} 区段已审核`} />
          <Stat k="待处理问题" v={data().totals.issues} d="系统自动校验结果" tone={data().totals.issues ? 'bad' : 'ok'} />
          <Stat k="累计返工" v={data().totals.rework} d="退回计入返工次数" tone={data().totals.rework ? 'warn' : 'ok'} />
          <Stat k="超期风险" v={data().totals.atRisk} d={`其中已超期 ${data().totals.overdue} 个`} tone={data().totals.overdue ? 'bad' : data().totals.atRisk ? 'warn' : 'ok'} />
        </div>

        <div class="project-grid">
          <For each={projects()} fallback={<div class="card empty">当前筛选下没有项目</div>}>
            {(p) => {
              const risk = () => RISK[p.risk] || RISK.low;
              return (
                <div class="card project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div class="pc-top">
                    <div style={{ flex: 1 }}>
                      <div class="id">{p.code} · {formatDate(p.delivery_date)} 交付</div>
                      <h3>{p.name}</h3>
                      <div class="client">{p.client_name}{p.segment ? ` · ${p.segment}` : ''}</div>
                    </div>
                    <span class={`chip ${risk().cls}`}>{risk().label}</span>
                  </div>
                  <div class="pc-mid" style={{ 'margin-bottom': '12px' }}>
                    <div class="m">长度 / 车道<b>{p.length_m} m · {p.lanes} 车道</b></div>
                    <div class="m">要素总数<b>{num(p.element_count)}</b></div>
                    <div class="m">待处理问题<b style={{ color: p.open_issues ? '#ffb3b3' : undefined }}>{p.open_issues}</b></div>
                  </div>
                  <div class="pc-bottom">
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
                      <div class="progress" style={{ flex: 1 }}><i style={{ width: `${p.progress}%` }} /></div>
                      <span style={{ 'font-size': '11.5px', color: '#a7bacd', 'font-variant-numeric': 'tabular-nums' }}>
                        {p.approved_sections}/{p.total_sections} 区段
                      </span>
                    </div>
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'font-size': '11.5px', color: '#7d93a8' }}>
                      <span>返工 <b style={{ color: p.rework_count ? '#f8d784' : '#a7bacd' }}>{p.rework_count}</b> 次</span>
                      <span>待审 <b style={{ color: '#a7bacd' }}>{p.submitted_sections}</b></span>
                      <span style={{ 'margin-left': 'auto', 'font-variant-numeric': 'tabular-nums', color: p.days_left < 0 ? '#f87171' : p.days_left <= 2 ? '#fbbf24' : '#7d93a8' }}>
                        {p.days_left < 0 ? `超期 ${Math.abs(p.days_left)} 天` : `剩余 ${p.days_left} 天`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <Show when={data().recentAudit?.length}>
          <div class="card" style={{ 'margin-top': '18px' }}>
            <div class="card-head"><h2>最近操作</h2></div>
            <div style={{ 'max-height': '220px', overflow: 'auto' }}>
              <table class="table">
                <tbody>
                  <For each={data().recentAudit}>
                    {(a) => (
                      <tr>
                        <td style={{ width: '58px', color: '#7d93a8' }}>{a.created_at.slice(5, 16).replace('T', ' ')}</td>
                        <td style={{ width: '56px', color: '#bfe9fc' }}>{a.project_code || '—'}</td>
                        <td style={{ width: '92px' }}>{a.actor}</td>
                        <td>{a.action}</td>
                        <td style={{ color: '#7d93a8' }}>{a.detail}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>
      </Show>

      <Show when={showNew()}>
        <NewProjectModal onClose={() => setShowNew(false)} onCreated={(p) => { setShowNew(false); refetch(); navigate(`/projects/${p.id}`); }} />
      </Show>
    </div>
  );
}

function Stat(props) {
  return (
    <div class="card stat">
      <div class="k">{props.k}</div>
      <div class="v" style={{
        color: props.tone === 'bad' ? '#ffb3b3' : props.tone === 'warn' ? '#f8d784' : props.tone === 'ok' ? '#9ef0bb' : undefined,
      }}>{props.v}</div>
      <div class="d">{props.d}</div>
    </div>
  );
}

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function NewProjectModal(props) {
  const [form, setForm] = createSignal({
    name: '', client_name: '', segment: '',
    length_m: 3600, lanes: 4, bores: 2,
    delivery_date: defaultDelivery(), drawing_spec: 'A1', notes: '',
  });
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [preview, setPreview] = createSignal(null);

  const set = (k, v) => setForm({ ...form(), [k]: v });
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await api.createProject({
        ...form(),
        length_m: Number(form().length_m),
        lanes: Number(form().lanes),
        bores: Number(form().bores),
      });
      props.onCreated(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const estimate = () => {
    const L = Number(form().length_m) || 0;
    const bores = Number(form().bores) || 1;
    const sections = Math.max(2, Math.ceil(L / 250)) * bores;
    const fans = Math.round(L / 24) * (Number(form().lanes) >= 6 ? 3 : 2) * bores;
    const sensors = Math.round(L / 25) * bores;
    return { sections, fans, sensors };
  };

  return (
    <div class="modal-veil" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal">
        <div class="modal-head">
          <h2>新建项目订单</h2>
          <div class="spacer" />
          <button class="btn ghost small" onClick={props.onClose}>关闭</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field full">
              <label>项目名称 *</label>
              <input value={form().name} placeholder="如：青石岭隧道机电通风系统图档"
                onInput={(e) => set('name', e.currentTarget.value)} />
            </div>
            <div class="field">
              <label>委托单位 *</label>
              <input value={form().client_name} placeholder="客户单位名称"
                onInput={(e) => set('client_name', e.currentTarget.value)} />
            </div>
            <div class="field">
              <label>里程范围</label>
              <input value={form().segment} placeholder="如 K5+200 ~ K9+800"
                onInput={(e) => set('segment', e.currentTarget.value)} />
            </div>
            <div class="field">
              <label>隧道长度（m）*</label>
              <input type="number" min="100" max="40000" value={form().length_m}
                onInput={(e) => set('length_m', e.currentTarget.value)} />
              <span class="hint">100–40000 m，决定区段划分与要素规模</span>
            </div>
            <div class="field">
              <label>车道数 *</label>
              <select value={form().lanes} onChange={(e) => set('lanes', e.currentTarget.value)}>
                <option value="2">2 车道（单洞双向）</option>
                <option value="4">4 车道（双洞单向）</option>
                <option value="6">6 车道（双洞单向）</option>
              </select>
            </div>
            <div class="field">
              <label>洞线数</label>
              <select value={form().bores} onChange={(e) => set('bores', e.currentTarget.value)}>
                <option value="1">单洞</option>
                <option value="2">双洞（左右线）</option>
              </select>
            </div>
            <div class="field">
              <label>交付日期 *</label>
              <input type="date" value={form().delivery_date}
                onInput={(e) => set('delivery_date', e.currentTarget.value)} />
            </div>
            <div class="field">
              <label>图纸规格 *</label>
              <select value={form().drawing_spec} onChange={(e) => set('drawing_spec', e.currentTarget.value)}>
                <For each={DRAWING_SPECS}>
                  {(s) => <option value={s}>{s}（{SHEET_SIZES_MM[s][0]}×{SHEET_SIZES_MM[s][1]} mm）</option>}
                </For>
              </select>
            </div>
            <div class="field full">
              <label>技术要求 / 备注</label>
              <textarea rows="3" value={form().notes}
                placeholder="如：纵向通风方案、风机间距要求、传感器挂接范围等"
                onInput={(e) => set('notes', e.currentTarget.value)} />
            </div>
          </div>

          <div class="notice">
            按当前参数预估：<b>{estimate().sections}</b> 个区段 · 约 <b>{num(estimate().fans)}</b> 台射流风机 ·
            约 <b>{num(estimate().sensors)}</b> 个 CO/VI 检测器。下单后系统将自动生成分层平面图要素。
          </div>

          <Show when={error()}>
            <div class="notice bad">{error()}</div>
          </Show>
        </div>
        <div class="modal-foot">
          <button class="btn" onClick={props.onClose}>取消</button>
          <button class="btn primary" disabled={busy()} onClick={submit}>
            {busy() ? '正在创建…' : '提交订单并生成要素'}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultDelivery() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
