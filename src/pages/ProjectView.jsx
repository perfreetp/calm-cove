import { createSignal, createResource, createMemo, For, Show } from 'solid-js';
import { useParams, useNavigate, A } from '@solidjs/router';
import { api, downloadUrl } from '../lib/api.js';
import {
  STATUS_LABELS, TASK_STATUS_STYLE, ISSUE_TYPES, LAYERS, formatDate, formatChainage, formatBytes,
} from '../../shared/domain.js';

const RISK = {
  overdue: { label: '已超期', cls: 'bad' },
  high: { label: '高风险', cls: 'bad' },
  medium: { label: '需关注', cls: 'warn' },
  low: { label: '正常', cls: 'ok' },
  done: { label: '已交付', cls: 'muted' },
};

export default function ProjectView() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => Number(params.id);
  const [data, { refetch }] = createResource(id, (pid) => api.project(pid));
  const [tab, setTab] = createSignal('sections');
  const [toast, setToast] = createSignal(null);
  const [busy, setBusy] = createSignal(false);

  const notify = (msg, bad = false) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3400);
  };

  const makers = () => (data()?.makers || []);
  const summary = () => data()?.summary;
  const sections = () => data()?.sections || [];
  const pending = () => data()?.pending || [];
  const issues = () => data()?.issues || [];
  const openIssues = () => issues().filter((i) => i.status === 'open');
  const handledIssues = () => issues().filter((i) => i.status !== 'open');

  const grouped = createMemo(() => {
    const bores = new Map();
    for (const s of sections()) {
      if (!bores.has(s.bore_index)) bores.set(s.bore_index, []);
      bores.get(s.bore_index).push(s);
    }
    return [...bores.entries()].sort((a, b) => a[0] - b[0]);
  });

  async function action(fn) {
    try {
      setBusy(true);
      await fn();
      await refetch();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function submitSection(section) {
    await action(async () => {
      const out = await api.submitSection(id(), section.id, '');
      const n = out.issues.length;
      notify(n
        ? `区段 ${section.code} 已送审，自动校验发现 ${n} 项问题待处理`
        : `区段 ${section.code} 已送审，无自动校验问题`);
      setTab('review');
    });
  }

  async function review(sub, decision, reason = '') {
    if (decision === 'reject' && !String(reason).trim()) {
      notify('退回必须填写原因', true);
      return false;
    }
    return action(async () => {
      await api.review(id(), sub.id, decision, decision === 'reject' ? reason : '');
      notify(decision === 'approve'
        ? `区段 ${sub.section_code} 审核通过`
        : `区段 ${sub.section_code} 已退回，返工次数 +1`);
    });
  }

  async function buildPackage() {
    await action(async () => {
      const out = await api.buildDelivery(id(), summary()?.drawing_spec);
      notify(`交付包已生成：${out.file_name}（${formatBytes(out.size_bytes)}，${out.files.length} 个文件）`);
      setTab('delivery');
    });
  }

  return (
    <div class="page">
      <Show when={data()} fallback={<div class="card empty">正在加载项目…</div>}>
        <div class="page-head">
          <div>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
              <span style={{ color: '#7dd3fc', 'font-weight': '600', 'letter-spacing': '.5px' }}>{summary().code}</span>
              <span class={`chip ${RISK[summary().risk]?.cls}`}>{RISK[summary().risk]?.label}</span>
              <Show when={summary().status !== 'delivered'}>
                <span class="chip muted">{summary().status === 'active' ? '进行中' : '策划中'}</span>
              </Show>
            </div>
            <h1 style={{ 'margin-top': '4px' }}>{summary().name}</h1>
            <p>
              {summary().client_name}{summary().segment ? ` · ${summary().segment}` : ''} ·
              全长 {summary().length_m} m · {summary().lanes} 车道 · {summary().bores} 洞 ·
              图纸规格 {summary().drawing_spec} · {formatDate(summary().delivery_date)} 交付
            </p>
          </div>
          <div class="spacer" />
          <button class="btn" onClick={() => navigate(`/projects/${id()}/draw`)}>进入绘图工作台</button>
          <button class="btn primary" disabled={busy()} onClick={buildPackage}>打包生成 DXF / PDF</button>
        </div>

        <div class="stat-grid">
          <Stat k="区段进度" v={`${summary().approved_sections}/${summary().total_sections}`} d={`完成 ${summary().progress}% · 待审 ${summary().submitted_sections}`} />
          <Stat k="要素总量" v={num(summary().element_count)} d="分层平面图要素" />
          <Stat k="待处理问题" v={openIssues().length}
            d={`已豁免/整改 ${handledIssues().length} · 合计 ${data().issueSummary.active}`}
            tone={openIssues().length ? 'bad' : handledIssues().length ? 'warn' : 'ok'} />
          <Stat k="累计返工" v={summary().rework_count} d="退回计入返工次数" tone={summary().rework_count ? 'warn' : 'ok'} />
          <Stat k="交付倒排" v={summary().days_left < 0 ? `超期 ${Math.abs(summary().days_left)} 天` : `${summary().days_left} 天`}
            d={`预计还需 ${summary().est_days} 天`} tone={summary().days_left < 0 ? 'bad' : summary().days_left <= 3 ? 'warn' : 'ok'} />
          <Stat k="交付包" v={data().deliveries.length} d={data().deliveries[0] ? `最近 ${data().deliveries[0].created_at.slice(0, 10)}` : '尚未生成'} />
        </div>

        <div class="card" style={{ 'margin-top': '16px' }}>
          <div class="sidebar-tabs" style={{ 'border-bottom': '1px solid var(--line)' }}>
            <For each={[
              ['sections', `区段派发（${sections().length}）`],
              ['review', `送审与审核（${pending().length}）`],
              ['issues', `校验问题（${openIssues().length}）`],
              ['delivery', `交付包（${data().deliveries.length}）`],
              ['history', '操作记录'],
            ]}>
              {([k, label]) => (
                <button class={tab() === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
              )}
            </For>
          </div>

          <Show when={tab() === 'sections'}>
            <SectionsPanel
              groups={grouped()} makers={makers()} busy={busy()}
              onAssign={(sectionIds, makerId) => action(async () => {
                await api.assignSections(id(), sectionIds, makerId);
                notify(`已派发 ${sectionIds.length} 个区段`);
              })}
              onUnassign={(sec) => action(async () => { await api.unassignSection(id(), sec.id); notify(`区段 ${sec.code} 已取消分配`); })}
              onProgress={(sec, status) => action(async () => { await api.sectionProgress(id(), sec.id, status); notify(`区段 ${sec.code} → ${STATUS_LABELS[status]}`); })}
              onSubmit={submitSection}
              onFocusSection={(sec) => navigate(`/projects/${id()}/draw`)}
            />
          </Show>

          <Show when={tab() === 'review'}>
            <ReviewPanel pending={pending()} history={data().submissions} busy={busy()} onReview={review} />
          </Show>

          <Show when={tab() === 'issues'}>
            <IssuesPanel
              issues={issues()} summary={data().issueSummary} busy={busy()}
              onLocate={(issue) => navigate(`/projects/${id()}/draw`)}
              onRerun={() => action(async () => {
                const out = await api.runChecks(id());
                notify(`校验完成：新增 ${out.created} 项，保留 ${out.kept} 项，失效 ${out.superseded} 项`);
              })}
              onStatus={(issue, status, note) => action(async () => {
                await api.setIssueStatus(id(), issue.id, status, note);
                notify(status === 'waived' ? `问题 #${issue.id} 已确认豁免` : `问题 #${issue.id} 已标记整改`);
              })}
            />
          </Show>

          <Show when={tab() === 'delivery'}>
            <DeliveryPanel
              projectId={id()} deliveries={data().deliveries} busy={busy()}
              spec={summary().drawing_spec}
              onBuild={buildPackage}
              notify={notify}
            />
          </Show>

          <Show when={tab() === 'history'}>
            <HistoryPanel projectId={id()} />
          </Show>
        </div>
      </Show>

      <Show when={toast()}>
        <div class={`toast ${toast().bad ? 'bad' : ''}`}>{toast().msg}</div>
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

function SectionsPanel(props) {
  const [selected, setSelected] = createSignal(new Set());
  const [maker, setMaker] = createSignal('');

  const toggle = (sid) => {
    const s = new Set(selected());
    s.has(sid) ? s.delete(sid) : s.add(sid);
    setSelected(s);
  };

  const selectedIds = () => [...selected()];

  return (
    <div>
      <div class="bulk-bar" style={{ background: 'rgba(79,195,247,.05)' }}>
        <span style={{ 'font-size': '12px', color: '#bfe9fc' }}>已选 {selected().size} 个区段</span>
        <select value={maker()} onChange={(e) => setMaker(e.currentTarget.value)}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', 'border-radius': '6px', padding: '4px 8px' }}>
          <option value="">选择制作员</option>
          <For each={props.makers}>{((m) => <option value={m.id}>{m.name}</option>)}</For>
        </select>
        <button class="btn small primary" disabled={!selected().size || !maker() || props.busy}
          onClick={() => { props.onAssign(selectedIds(), Number(maker())); setSelected(new Set()); }}>
          派发任务
        </button>
        <button class="btn small ghost" onClick={() => setSelected(new Set())}>清除选择</button>
        <div style={{ 'margin-left': 'auto', display: 'flex', gap: '6px', 'font-size': '11.5px', color: '#7d93a8' }}>
          <span>● 待制作</span><span>● 制作中</span><span>● 待审核</span><span>● 已通过</span>
        </div>
      </div>

      <For each={props.groups}>
        {([bore, list]) => (
          <div>
            <div style={{
              padding: '8px 14px', background: 'var(--bg-2)', 'border-bottom': '1px solid var(--line-soft)',
              'font-size': '11.5px', color: '#a7bacd', display: 'flex', gap: '12px',
            }}>
              <b style={{ color: '#7dd3fc' }}>第 {bore + 1} 洞线</b>
              <span>{list.length} 个区段</span>
              <span>已通过 {list.filter((s) => s.status === 'approved').length}</span>
              <span>累计返工 {list.reduce((a, s) => a + s.rework_count, 0)}</span>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th style={{ width: '28px' }} />
                  <th style={{ width: '58px' }}>区段</th>
                  <th>范围 / 桩号</th>
                  <th style={{ width: '86px' }}>要素</th>
                  <th style={{ width: '64px' }}>状态</th>
                  <th style={{ width: '96px' }}>制作员</th>
                  <th style={{ width: '56px' }} class="num">返工</th>
                  <th style={{ width: '64px' }} class="num">问题</th>
                  <th style={{ width: '210px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <For each={list}>
                  {(sec) => (
                    <tr>
                      <td>
                        <input type="checkbox" checked={selected().has(sec.id)}
                          onChange={() => toggle(sec.id)} />
                      </td>
                      <td><b style={{ color: '#7dd3fc' }}>{sec.code}</b></td>
                      <td>
                        <div style={{ color: '#a7bacd' }}>
                          {Math.round(sec.start_m)}–{Math.round(sec.end_m)} m
                          <span style={{ color: '#7d93a8', 'margin-left': '8px' }}>
                            {formatChainage(sec.start_m)}–{formatChainage(sec.end_m)}
                          </span>
                        </div>
                        <div style={{ 'font-size': '10.5px', color: '#7d93a8' }}>
                          风机 {sec.kinds.jet_fan || 0} · 风阀 {sec.kinds.damper || 0} · 传感器 {(sec.kinds.co_sensor || 0) + (sec.kinds.vi_sensor || 0)} · 机房 {(sec.kinds.fan_equip || 0)}
                        </div>
                      </td>
                      <td>{sec.element_count}</td>
                      <td><span class={`chip ${TASK_STATUS_STYLE[sec.status] || 'muted'}`}>{STATUS_LABELS[sec.status]}</span></td>
                      <td>{sec.assignee_name || <span style={{ color: '#7d93a8' }}>未分配</span>}</td>
                      <td class="num" style={{ color: sec.rework_count ? '#f8d784' : '#7d93a8' }}>{sec.rework_count}</td>
                      <td class="num" style={{ color: sec.open_issues ? '#ffb3b3' : '#7d93a8' }}>{sec.open_issues}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', 'flex-wrap': 'wrap' }}>
                          <Show when={!sec.assignee_id && sec.status === 'todo'}>
                            <select onChange={(e) => {
                              if (e.currentTarget.value) props.onAssign([sec.id], Number(e.currentTarget.value));
                            }} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', 'border-radius': '5px', padding: '2px 4px', 'font-size': '11px' }}>
                              <option value="">派给…</option>
                              <For each={props.makers}>{((m) => <option value={m.id}>{m.name}</option>)}</For>
                            </select>
                          </Show>
                          <Show when={sec.assignee_id && ['assigned', 'in_progress'].includes(sec.status)}>
                            <button class="btn tiny" onClick={() => props.onProgress(sec, sec.status === 'in_progress' ? 'rework' : 'in_progress')}>
                              {sec.status === 'in_progress' ? '标记需修改' : '开始制作'}
                            </button>
                          </Show>
                          <Show when={sec.assignee_id && ['assigned', 'in_progress', 'rework'].includes(sec.status)}>
                            <button class="btn tiny primary" disabled={props.busy} onClick={() => props.onSubmit(sec)}>提交送审</button>
                          </Show>
                          <Show when={sec.status === 'submitted'}>
                            <span class="chip accent">等待主管审核</span>
                          </Show>
                          <Show when={['approved', 'todo'].includes(sec.status) && sec.assignee_id}>
                            <button class="btn tiny ghost" onClick={() => props.onUnassign(sec)}>取消分配</button>
                          </Show>
                          <button class="btn tiny ghost" onClick={() => props.onFocusSection(sec)}>定位</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </For>
    </div>
  );
}

function ReviewPanel(props) {
  const [reason, setReason] = createSignal({});

  return (
    <div>
      <Show when={props.pending.length} fallback={
        <div class="empty">暂无待审核的送审记录。<br />制作员在区段列表点击「提交送审」后，记录会出现在这里。</div>
      }>
        <For each={props.pending}>
          {(sub) => (
            <div style={{ 'border-bottom': '1px solid var(--line-soft)', padding: '14px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '8px' }}>
                <b style={{ color: '#7dd3fc' }}>{sub.section_code}</b>
                <span class="chip accent">第 {sub.round} 轮送审</span>
                <span style={{ color: '#7d93a8', 'font-size': '11.5px' }}>{sub.maker_name} · {formatDate(sub.created_at)}</span>
                <span style={{ 'margin-left': 'auto', color: sub.issue_snapshot.length ? '#ffb3b3' : '#9ef0bb', 'font-size': '12px' }}>
                  {sub.issue_snapshot.length
                    ? `自动校验：${sub.issue_snapshot.length} 项问题，需先整改或豁免`
                    : '自动校验：无问题'}
                </span>
              </div>
              <Show when={sub.issue_snapshot.length}>
                <div class="notice bad" style={{ 'margin-bottom': '8px' }}>
                  <For each={sub.issue_snapshot}>{((i) => <div>· {i.message}</div>)}</For>
                </div>
              </Show>
              <div style={{ display: 'flex', gap: '8px', 'align-items': 'flex-start' }}>
                <textarea rows="2" placeholder="退回原因（退回必填）"
                  value={reason()[sub.id] || ''}
                  onInput={(e) => setReason({ ...reason(), [sub.id]: e.currentTarget.value })}
                  style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line)', 'border-radius': '7px', padding: '7px 10px', resize: 'vertical' }}
                />
                <button class="btn primary" disabled={props.busy || sub.issue_snapshot.length > 0}
                  title={sub.issue_snapshot.length ? '区段仍有未处理问题，请先在「校验问题」中标整改或确认豁免' : ''}
                  onClick={() => props.onReview(sub, 'approve')}>通过</button>
                <button class="btn danger" disabled={props.busy}
                  onClick={async () => {
                    const ok = await props.onReview(sub, 'reject', reason()[sub.id] || '');
                    if (ok) setReason({ ...reason(), [sub.id]: '' });
                  }}>退回</button>
              </div>
            </div>
          )}
        </For>
      </Show>

      <Show when={props.history?.length}>
        <div style={{ padding: '12px 14px', 'border-top': '1px solid var(--line)' }}>
          <div class="card-head" style={{ padding: '0 0 8px' }}><h2>送审记录</h2></div>
          <table class="table">
            <thead><tr>
              <th>区段</th><th>轮次</th><th>状态</th><th>结论 / 原因</th><th>时间</th>
            </tr></thead>
            <tbody>
              <For each={props.history.slice(0, 60)}>
                {(h) => (
                  <tr>
                    <td><b style={{ color: '#7dd3fc' }}>{h.section_code}</b></td>
                    <td>第 {h.round} 轮</td>
                    <td>
                      <span class={`chip ${h.status === 'approved' ? 'ok' : h.status === 'rejected' ? 'bad' : 'accent'}`}>
                        {h.status === 'approved' ? '通过' : h.status === 'rejected' ? '退回' : '待审'}
                      </span>
                    </td>
                    <td style={{ color: h.status === 'rejected' ? '#ffcaca' : '#a7bacd' }}>{h.reason || '—'}</td>
                    <td style={{ color: '#7d93a8' }}>{formatDate(h.decided_at || h.created_at)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}

function IssuesPanel(props) {
  const [typeFilter, setTypeFilter] = createSignal('all');
  const [waive, setWaive] = createSignal(null);
  const [waiveNote, setWaiveNote] = createSignal('');

  const filtered = () => props.issues.filter((i) => typeFilter() === 'all' || i.check_type === typeFilter());

  return (
    <div>
      <div class="bulk-bar" style={{ background: 'rgba(248,113,113,.05)' }}>
        <span style={{ 'font-size': '12px', color: '#ffb3b3' }}>
          待处理 {props.issues.filter((i) => i.status === 'open').length} 项
          <span style={{ color: '#7d93a8' }}> · 已处理 {props.issues.filter((i) => i.status !== 'open').length} 项</span>
        </span>
        <For each={Object.entries(ISSUE_TYPES)}>
          {([k, v]) => (
            <button class={`btn small ${typeFilter() === k ? 'primary' : ''}`}
              onClick={() => setTypeFilter(typeFilter() === k ? 'all' : k)}>
              {v.label} {props.summary.byType[k] || 0}
            </button>
          )}
        </For>
        <button class="btn small ghost" onClick={() => setTypeFilter('all')}>全部</button>
        <div class="spacer" style={{ flex: 1 }} />
        <button class="btn small" disabled={props.busy} onClick={props.onRerun}>⟳ 重新运行校验</button>
      </div>

      <Show when={filtered().length} fallback={<div class="empty">该筛选下没有待处理问题。</div>}>
        <table class="table">
          <thead><tr>
            <th style={{ width: '64px' }}>类型</th>
            <th style={{ width: '64px' }}>区段</th>
            <th>说明</th>
            <th style={{ width: '78px' }}>状态</th>
            <th style={{ width: '188px' }}>操作</th>
          </tr></thead>
          <tbody>
            <For each={filtered()}>
              {(issue) => (
                <tr>
                  <td><span class={`issue-type ${issue.check_type}`}>{issue.type_short}</span></td>
                  <td style={{ color: '#7dd3fc' }}>{issue.section_code || '—'}</td>
                  <td>{issue.message}</td>
                  <td>
                    <span class={`chip ${issue.status === 'open' ? 'bad' : issue.status === 'waived' ? 'muted' : 'ok'}`}>
                      {issue.status === 'open' ? '待处理' : issue.status === 'waived' ? '已豁免' : '已整改'}
                    </span>
                    <Show when={issue.note}><div style={{ 'font-size': '10.5px', color: '#7d93a8' }}>{issue.note}</div></Show>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px', 'flex-wrap': 'wrap' }}>
                      <button class="btn tiny" onClick={() => props.onLocate(issue)}>定位</button>
                      <button class="btn tiny" disabled={props.busy}
                        onClick={() => props.onStatus(issue, 'resolved', '')}>标整改</button>
                      <button class="btn tiny ghost" disabled={props.busy}
                        onClick={() => { setWaive(issue); setWaiveNote(''); }}>豁免</button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={waive()}>
        {(issue) => (
          <div class="modal-veil" onClick={(e) => e.target === e.currentTarget && setWaive(null)}>
            <div class="modal" style={{ width: '480px' }}>
              <div class="modal-head">
                <h2>确认豁免问题</h2>
                <div class="spacer" />
                <span class={`issue-type ${issue().check_type}`}>{issue().type_label}</span>
              </div>
              <div class="modal-body">
                <div class="notice">{issue().message}</div>
                <div class="field">
                  <label>豁免说明（必填，将写入校验报告与审计记录）</label>
                  <textarea rows="3" value={waiveNote()} placeholder="如：经现勘复核，该处满足现场安装条件，同意豁免。"
                    onInput={(e) => setWaiveNote(e.currentTarget.value)} />
                </div>
              </div>
              <div class="modal-foot">
                <button class="btn" onClick={() => setWaive(null)}>取消</button>
                <button class="btn primary" disabled={!waiveNote().trim() || props.busy}
                  onClick={() => { props.onStatus(issue(), 'waived', waiveNote()); setWaive(null); }}>
                  确认豁免
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

function DeliveryPanel(props) {
  const [detail, setDetail] = createSignal(null);
  const [search, setSearch] = createSignal({ section: '', q: '' });
  const [searchResult, setSearchResult] = createSignal(null);

  async function openDetail(d) {
    try {
      const full = await api.delivery(props.projectId, d.id);
      setDetail(full);
      setSearchResult(null);
    } catch (e) { props.notify(e.message, true); }
  }

  async function runSearch() {
    const d = detail();
    if (!d) return;
    try {
      const out = await api.deliverySearch(props.projectId, d.id, {
        section: search().section, q: search().q,
      });
      setSearchResult(out);
    } catch (e) { props.notify(e.message, true); }
  }

  return (
    <div>
      <div class="bulk-bar">
        <span style={{ 'font-size': '12px', color: '#a7bacd' }}>
          交付包包含：DXF（分图层 + 全图层）、PDF 图纸、校验报告、区段要素清单、要素明细 CSV、交付清单 JSON
        </span>
        <div style={{ flex: 1 }} />
        <button class="btn primary small" disabled={props.busy} onClick={props.onBuild}>
          {props.busy ? '正在打包…' : `打包生成（${props.spec}）`}
        </button>
      </div>

      <Show when={props.deliveries.length} fallback={<div class="empty">尚未生成交付包。</div>}>
        <table class="table">
          <thead><tr>
            <th>文件名</th><th style={{ width: '100px' }}>大小</th><th style={{ width: '90px' }}>校验结论</th>
            <th style={{ width: '110px' }}>生成时间</th><th style={{ width: '180px' }}>操作</th>
          </tr></thead>
          <tbody>
            <For each={props.deliveries}>
              {(d) => (
                <tr>
                  <td><b>{d.file_name}</b></td>
                  <td>{formatBytes(d.size_bytes)}</td>
                  <td>
                    <span class={`chip ${d.manifest?.verdict === 'passed' ? 'ok' : 'bad'}`}>
                      {d.manifest?.verdict === 'passed' ? '校验通过' : `待整改 ${d.manifest?.blocking_issues || 0} 项`}
                    </span>
                  </td>
                  <td style={{ color: '#7d93a8' }}>{d.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <a class="btn tiny" href={downloadUrl(props.projectId, d.id)} download>下载 ZIP</a>
                      <button class="btn tiny" onClick={() => openDetail(d)}>包内检索</button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={detail()}>
        {(d) => (
          <div style={{ padding: '14px', 'border-top': '1px solid var(--line)' }}>
            <div class="card-head" style={{ padding: '0 0 10px' }}>
              <h2>交付包内容 · {d().file_name}</h2>
              <div class="spacer" />
              <span class="chip muted">校验编号 {d().manifest.qc_id}</span>
            </div>

            <div class="form-grid" style={{ 'margin-bottom': '12px' }}>
              <div class="field">
                <label>按区段检索</label>
                <select value={search().section} onChange={(e) => setSearch({ ...search(), section: e.currentTarget.value })}>
                  <option value="">全部区段</option>
                  <For each={d().manifest.section_manifest}>
                    {(m) => <option value={m.code}>{m.code}（{m.total} 项）</option>}
                  </For>
                </select>
              </div>
              <div class="field">
                <label>关键字</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={search().q} placeholder="编号 / 型号 / 区段"
                    onInput={(e) => setSearch({ ...search(), q: e.currentTarget.value })} />
                  <button class="btn" onClick={runSearch}>检索</button>
                </div>
              </div>
            </div>

            <Show when={searchResult()}>
              <div class="notice" style={{ 'margin-bottom': '10px' }}>
                交付包 {searchResult().delivery.file_name} 内：区段 {searchResult().sections.length} 个，匹配要素 {searchResult().total} 项。
              </div>
              <div style={{ 'max-height': '300px', overflow: 'auto', border: '1px solid var(--line)', 'border-radius': '7px' }}>
                <table class="table">
                  <thead><tr>
                    <th>区段</th><th>类型</th><th>编号</th><th>型号</th><th>桩号</th><th>状态</th>
                  </tr></thead>
                  <tbody>
                    <For each={searchResult().elements.slice(0, 300)}>
                      {(e) => (
                        <tr>
                          <td style={{ color: '#7dd3fc' }}>{e.section_code || '未挂接'}</td>
                          <td>{LAYERS[e.layer]?.name}</td>
                          <td><code>{e.code}</code></td>
                          <td>{e.model}</td>
                          <td>{formatChainage(e.chainage)}</td>
                          <td>{e.mounted ? '已挂接' : <span style={{ color: '#ffb3b3' }}>未挂接</span>}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>

            <div style={{ 'margin-top': '12px' }}>
              <div class="card-head" style={{ padding: '0 0 8px' }}><h2>包内文件与校验和</h2></div>
              <table class="table">
                <thead><tr><th>文件</th><th>类型</th><th class="num">大小</th><th>SHA 校验和</th></tr></thead>
                <tbody>
                  <For each={d().manifest.files}>
                    {(f) => (
                      <tr>
                        <td>{f.name}</td>
                        <td>{f.kind}</td>
                        <td class="num">{formatBytes(f.size)}</td>
                        <td><code style={{ 'font-size': '11px' }}>{f.checksum}</code></td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <div style={{ 'margin-top': '12px' }}>
              <div class="card-head" style={{ padding: '0 0 8px' }}><h2>DXF 结构校验</h2></div>
              <table class="table">
                <thead><tr><th>文件</th><th class="num">实体数</th><th>图层</th><th>结果</th></tr></thead>
                <tbody>
                  <For each={d().manifest.dxf_validation}>
                    {(v) => (
                      <tr>
                        <td>{v.name}</td>
                        <td class="num">{num(v.entityCount)}</td>
                        <td>{v.layers.join('、')}</td>
                        <td>{v.ok ? <span class="chip ok">通过</span> : <span class="chip bad">失败</span>}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

function HistoryPanel(props) {
  const [rows] = createResource(() => props.projectId, (pid) => api.audit(pid));
  return (
    <Show when={rows()} fallback={<div class="empty">加载中…</div>}>
      <table class="table">
        <thead><tr><th style={{ width: '140px' }}>时间</th><th style={{ width: '120px' }}>操作者</th><th style={{ width: '140px' }}>动作</th><th>详情</th></tr></thead>
        <tbody>
          <For each={rows()}>
            {(a) => (
              <tr>
                <td style={{ color: '#7d93a8' }}>{a.created_at.slice(0, 16).replace('T', ' ')}</td>
                <td>{a.actor}</td>
                <td>{a.action}</td>
                <td style={{ color: '#a7bacd' }}>{a.detail}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  );
}

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
