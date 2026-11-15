<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import Icon from '../components/Icon.svelte';
  import { compassName, STATUS_META } from '../lib/ui';
  import { formatStamp, shortDay } from '../lib/geo';
  import type { Session } from '../lib/types';

  const coachList = $derived(app.data.coaches);
  let editingId = $state<string | null>(null);
  let creating = $state(false);
  let draft = $state<Partial<Session>>({});
  let showWind = $state(false);

  const sessions = $derived(
    [...app.data.sessions].sort((a, b) => (b.day + b.startTime).localeCompare(a.day + a.startTime))
  );

  function startEdit(s: Session) {
    editingId = s.id;
    creating = false;
    draft = {
      code: s.code,
      subject: s.subject,
      focus: s.focus,
      coachId: s.coachId,
      day: s.day,
      startTime: s.startTime,
      durationMin: s.durationMin,
      lanes: [...s.lanes],
      startMark: s.startMark,
      endMark: s.endMark,
      wind: { ...s.wind },
      plannedBoats: s.plannedBoats,
      timeLimitMin: s.timeLimitMin,
      note: s.note
    };
  }

  function startCreate() {
    creating = true;
    editingId = null;
    draft = {
      code: '',
      subject: '',
      focus: '',
      coachId: app.actorId,
      day: '2026-11-16',
      startTime: '08:00',
      durationMin: 60,
      lanes: [2, 3, 4],
      startMark: 0,
      endMark: 4,
      wind: { fromDeg: 240, toDeg: 300, minMs: 1, maxMs: 4 },
      plannedBoats: 3,
      timeLimitMin: 5,
      note: ''
    };
    showWind = false;
  }

  function cancel() {
    editingId = null;
    creating = false;
    draft = {};
  }

  function save() {
    if (!draft.subject?.trim()) {
      app.notify('请填写科目名称', 'warn');
      return;
    }
    if (editingId) {
      app.saveSession({ ...draft, id: editingId }, '修改');
      app.notify(`已保存 ${draft.code}`);
    } else {
      const id = app.saveSession(draft, '新建');
      app.notify('已新建草稿科目');
      editingId = id;
      creating = false;
    }
  }

  function toggleLane(no: number) {
    const cur = draft.lanes ?? [];
    const next = cur.includes(no) ? cur.filter((x) => x !== no) : [...cur, no].sort((a, b) => a - b);
    draft = { ...draft, lanes: next };
  }

  const distance = $derived(((draft.endMark ?? 0) - (draft.startMark ?? 0)) * 250);
  const laneConflict = $derived.by(() => {
    if (!draft.day || !draft.startTime) return null;
    const start = Date.parse(`${draft.day}T${draft.startTime}:00`);
    const end = start + (draft.durationMin ?? 60) * 60000;
    for (const s of app.data.sessions) {
      if (s.id === editingId) continue;
      if (s.day !== draft.day) continue;
      const sStart = Date.parse(`${s.day}T${s.startTime}:00`);
      const sEnd = sStart + s.durationMin * 60000;
      if (start < sEnd && end > sStart) {
        const overlap = (s.lanes ?? []).filter((l) => (draft.lanes ?? []).includes(l));
        if (overlap.length) return { session: s, lanes: overlap };
      }
    }
    return null;
  });

  const editing = $derived(sessions.find((s) => s.id === editingId) ?? null);
  const runsOf = (id: string) => app.data.runs.filter((r) => r.sessionId === id);
  let filter = $state<'all' | 'draft' | 'published' | 'closed'>('all');
  const filtered = $derived(
    filter === 'all' ? sessions : sessions.filter((s) => s.status === filter)
  );
</script>

<div class="page">
  <header class="ph">
    <div>
      <h1>训练编排</h1>
      <p class="ph-sub">配置训练科目 · 航道编号、起止浮标、风向区间、计划艇数与时限 · 发布后观众端同步</p>
    </div>
    <div class="ph-actions">
      <div class="filters">
        {#each [['all', '全部'], ['draft', '草稿'], ['published', '已发布'], ['closed', '已结课']] as [k, l] (k)}
          {@const n = k === 'all' ? sessions.length : sessions.filter((s) => s.status === k).length}
          <button class="fchip" class:on={filter === k} onclick={() => (filter = k as typeof filter)}>
            {l}<span class="mono">{n}</span>
          </button>
        {/each}
      </div>
      <button class="btn primary" onclick={startCreate}>
        <Icon name="plus" size={13} />
        新建科目
      </button>
    </div>
  </header>

  <div class="body">
    <div class="list">
      {#each filtered as s (s.id)}
        {@const runs = runsOf(s.id)}
        {@const flagged = runs.filter((r) => r.detections.length).length}
        <button class="session-card" class:on={editingId === s.id} onclick={() => startEdit(s)}>
          <div class="sc-top">
            <span class="sc-code mono">{s.code}</span>
            <span class="badge {STATUS_META[s.status].tone}">{STATUS_META[s.status].label}</span>
            <span class="sc-ver mono">v{s.version}</span>
            {#if flagged}
              <span class="sc-flag"><Icon name="warn" size={10} />{flagged}</span>
            {/if}
          </div>
          <div class="sc-subject">{s.subject}</div>
          <div class="sc-meta">
            <span class="mono">{shortDay(s.day)} {s.startTime}</span>
            <span class="dotSep">·</span>
            <span class="mono">M{s.startMark}–M{s.endMark}</span>
            <span class="dotSep">·</span>
            <span class="mono">{s.lanes.length} 道</span>
            <span class="dotSep">·</span>
            <span class="mono">{runs.length}/{s.plannedBoats} 艇</span>
          </div>
          <div class="sc-wind">
            <Icon name="wind" size={10} />
            {compassName(s.wind.fromDeg)} {s.wind.minMs}–{s.wind.maxMs} m/s
          </div>
        </button>
      {/each}
    </div>

    <aside class="editor">
      {#if creating || editingId}
        <div class="ed-head">
          <div class="ed-title">
            <span class="eyebrow">{creating ? '新建科目' : '编辑科目'}</span>
            <h2>{draft.subject || '未命名科目'}</h2>
          </div>
          <button class="x" onclick={cancel} aria-label="关闭"><Icon name="close" size={13} /></button>
        </div>

        <div class="ed-scroll">
          <div class="frow">
            <label class="field" style="flex:1">
              <span>科目编号</span>
              <input type="text" bind:value={draft.code} placeholder="TR-1116-H" />
            </label>
            <label class="field" style="flex:1.4">
              <span>科目名称</span>
              <input type="text" bind:value={draft.subject} placeholder="2000 m 稳定配速" />
            </label>
          </div>

          <label class="field">
            <span>训练重点</span>
            <input type="text" bind:value={draft.focus} placeholder="全程每 500 m 配速差 ≤ 2 s" />
          </label>

          <div class="frow">
            <label class="field">
              <span>日期</span>
              <input type="date" bind:value={draft.day} />
            </label>
            <label class="field" style="flex:0.7">
              <span>开始</span>
              <input type="time" bind:value={draft.startTime} />
            </label>
            <label class="field" style="flex:0.7">
              <span>时长 (min)</span>
              <input type="number" min="10" max="240" step="5" bind:value={draft.durationMin} />
            </label>
          </div>

          <div class="field">
            <span>主责教练</span>
            <select bind:value={draft.coachId}>
              {#each coachList as c (c.id)}
                <option value={c.id}>{c.name} · {c.role}</option>
              {/each}
            </select>
          </div>

          <hr class="hairline" />

          <div class="field">
            <span>航道编号 <em>可多选</em></span>
            <div class="lane-pick">
              {#each [1, 2, 3, 4, 5, 6] as no (no)}
                <button class="lane-btn" class:on={(draft.lanes ?? []).includes(no)} onclick={() => toggleLane(no)}>
                  {no}
                </button>
              {/each}
            </div>
          </div>

          <div class="field">
            <span>浮标区间 <em class="mono">{distance} m</em></span>
            <div class="mark-range">
              <div class="mr-track">
                {#each Array.from({ length: 9 }) as _, i (i)}
                  {@const inRange = i >= (draft.startMark ?? 0) && i <= (draft.endMark ?? 0)}
                  <button
                    class="mr-node"
                    class:in={inRange}
                    class:isStart={i === draft.startMark}
                    class:isEnd={i === draft.endMark}
                    onclick={() => {
                      if (i === draft.startMark) return;
                      if (i < (draft.endMark ?? 0)) draft = { ...draft, startMark: i };
                      else draft = { ...draft, endMark: i };
                    }}
                    title={`M${i} · ${i * 250} m`}
                  >
                    <span class="node"></span>
                    <span class="mr-lab mono">{i}</span>
                  </button>
                {/each}
              </div>
              <div class="mr-read">
                <span class="mono">M{draft.startMark} → M{draft.endMark}</span>
                <span class="mr-hint">点左侧改起点 · 点右侧改终点</span>
              </div>
            </div>
          </div>

          <div class="field">
            <span>
              风向区间
              <em class="mono">{draft.wind?.fromDeg}°–{draft.wind?.toDeg}° · {draft.wind?.minMs}–{draft.wind?.maxMs} m/s</em>
            </span>
            <div class="wind-editor">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="#1d4a4f" stroke-width="1" />
                <circle cx="36" cy="36" r="22" fill="none" stroke="#143639" stroke-width="0.8" stroke-dasharray="2 3" />
                {#each [0, 45, 90, 135, 180, 225, 270, 315] as deg (deg)}
                  <line
                    x1={36 + Math.cos(((deg - 90) * Math.PI) / 180) * 27}
                    y1={36 + Math.sin(((deg - 90) * Math.PI) / 180) * 27}
                    x2={36 + Math.cos(((deg - 90) * Math.PI) / 180) * 30}
                    y2={36 + Math.sin(((deg - 90) * Math.PI) / 180) * 30}
                    stroke="#2a6469"
                    stroke-width="0.8"
                  />
                {/each}
                <path
                  d={(() => {
                    const a0 = ((draft.wind!.fromDeg - 90) * Math.PI) / 180;
                    const a1 = ((draft.wind!.toDeg - 90) * Math.PI) / 180;
                    const r = 30;
                    const span = ((draft.wind!.toDeg - draft.wind!.fromDeg + 360) % 360) * (Math.PI / 180);
                    return `M36 36 L${36 + Math.cos(a0) * r} ${36 + Math.sin(a0) * r} A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${36 + Math.cos(a1) * r} ${36 + Math.sin(a1) * r} Z`;
                  })()}
                  fill="rgba(111,211,216,0.18)"
                  stroke="rgba(111,211,216,0.55)"
                  stroke-width="0.9"
                />
                <text x="36" y="5" text-anchor="middle" class="rose-n">N</text>
              </svg>
              <div class="wind-inputs">
                <div class="wi-row">
                  <label for="wind-from">起始</label>
                  <input id="wind-from" type="number" min="0" max="359" step="5" bind:value={draft.wind!.fromDeg} />
                  <span class="mono unit">°</span>
                </div>
                <div class="wi-row">
                  <label for="wind-to">结束</label>
                  <input id="wind-to" type="number" min="0" max="359" step="5" bind:value={draft.wind!.toDeg} />
                  <span class="mono unit">°</span>
                </div>
                <div class="wi-row">
                  <label for="wind-min">风速</label>
                  <input id="wind-min" type="number" min="0" max="20" step="0.5" bind:value={draft.wind!.minMs} />
                  <span class="dash">–</span>
                  <input type="number" min="0" max="20" step="0.5" bind:value={draft.wind!.maxMs} aria-label="最大风速" />
                  <span class="mono unit">m/s</span>
                </div>
              </div>
            </div>
          </div>

          <div class="frow">
            <label class="field">
              <span>计划艇数</span>
              <input type="number" min="1" max="12" bind:value={draft.plannedBoats} />
            </label>
            <label class="field">
              <span>单艇时限 (min)</span>
              <input type="number" min="1" max="30" bind:value={draft.timeLimitMin} />
            </label>
          </div>

          <label class="field">
            <span>备注</span>
            <textarea rows="2" bind:value={draft.note} placeholder="水温、天气、航线注意事项"></textarea>
          </label>

          {#if laneConflict}
            <div class="conflict">
              <Icon name="warn" size={13} />
              <div>
                <b>与 {laneConflict.session.code} 时间重叠</b>
                <span>航道 {laneConflict.lanes.join('、')} 在 {laneConflict.session.startTime} 已被占用，建议错开或改用其他航道。</span>
              </div>
            </div>
          {/if}

          {#if editing && editing.status !== 'draft'}
            <div class="pub-note">
              <Icon name="check" size={12} />
              已发布至观众端 · v{editing.version} · 修改后立即同步
            </div>
          {/if}
        </div>

        <footer class="ed-foot">
          {#if editing && !creating}
            <button class="btn danger sm" onclick={() => { app.deleteSession(editing.id); cancel(); }}>
              删除
            </button>
          {/if}
          <span class="spacer"></span>
          <button class="btn sm" onclick={cancel}>取消</button>
          {#if editing && !creating}
            {#if editing.status === 'published' || editing.status === 'closed'}
              <button class="btn sm" onclick={() => { app.setSessionStatus(editing.id, 'closed'); }}>
                结课
              </button>
            {:else}
              <button class="btn sm primary" onclick={() => { app.saveSession({ ...draft, id: editing.id }, '修改'); app.setSessionStatus(editing.id, 'published'); }}>
                发布
              </button>
            {/if}
          {:else}
            <button class="btn sm primary" onclick={save}>保存草稿</button>
          {/if}
          <button class="btn sm" class:primary={false} onclick={save} style={editing && editing.status !== 'draft' ? 'border-color:var(--line-bright)' : ''}>
            保存
          </button>
        </footer>
      {:else}
        <div class="ed-empty">
          <Icon name="sessions" size={24} />
          <p>选择一个科目进行编辑</p>
          <span>或在左上角新建科目</span>
          <div class="ed-steps">
            <div class="step"><span class="sn mono">01</span>设置航道与浮标区间</div>
            <div class="step"><span class="sn mono">02</span>圈定风向与风速范围</div>
            <div class="step"><span class="sn mono">03</span>发布，观众端同步可见</div>
          </div>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .ph {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--line-soft); flex: none;
  }
  h1 { font-size: 19px; font-weight: 500; }
  .ph-sub { margin-top: 5px; font-size: 11px; color: var(--muted); }
  .ph-actions { display: flex; align-items: center; gap: 12px; }
  .filters { display: flex; gap: 2px; padding: 2px; background: var(--bg-deep); border: 1px solid var(--line-soft); border-radius: var(--radius); }
  .fchip {
    display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px;
    border-radius: 2px; font-size: 11px; color: var(--muted);
  }
  .fchip:hover { color: var(--ink-2); }
  .fchip.on { background: var(--panel-3); color: var(--ink); }
  .fchip .mono { font-size: 9px; color: var(--muted-2); }
  .fchip.on .mono { color: var(--amber); }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 408px; overflow: hidden; }
  .list { overflow-y: auto; padding: 14px 18px 26px 24px; display: flex; flex-direction: column; gap: 6px; }

  .session-card {
    text-align: left; padding: 11px 13px; border: 1px solid var(--line-soft);
    border-radius: var(--radius-lg); background: var(--panel); transition: border-color .14s, background .14s;
  }
  .session-card:hover { border-color: var(--line); background: var(--panel-2); }
  .session-card.on { border-color: rgba(233,177,84,.42); background: rgba(233,177,84,.05); }
  .sc-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .sc-code { font-size: 9.5px; color: var(--teal); letter-spacing: .05em; }
  .sc-ver { font-size: 8.5px; color: var(--muted-2); margin-left: auto; }
  .sc-flag { display: inline-flex; align-items: center; gap: 3px; font-size: 9px; color: var(--amber); }
  .sc-subject { font-size: 12.5px; color: var(--ink); margin-bottom: 5px; }
  .sc-meta { display: flex; align-items: center; gap: 7px; font-size: 9.5px; color: var(--muted); }
  .dotSep { color: #34565b; }
  .sc-wind { display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: var(--muted-2); margin-top: 4px; }

  .editor { border-left: 1px solid var(--line-soft); background: rgba(6,24,28,.6); display: flex; flex-direction: column; min-height: 0; }
  .ed-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 15px 18px 12px; border-bottom: 1px solid var(--line-soft); }
  .ed-title h2 { font-size: 14.5px; font-weight: 500; margin-top: 3px; }
  .x { color: var(--muted); width: 22px; height: 22px; display: grid; place-items: center; border-radius: 2px; }
  .x:hover { background: var(--panel-3); color: var(--ink); }
  .ed-scroll { flex: 1; overflow-y: auto; padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 11px; }
  .frow { display: flex; gap: 8px; }
  .field em { font-style: normal; font-size: 9px; color: var(--muted-2); letter-spacing: .02em; text-transform: none; font-family: var(--font); float: right; }

  .lane-pick { display: flex; gap: 4px; }
  .lane-btn {
    flex: 1; height: 30px; border-radius: 2px; border: 1px solid var(--line);
    background: var(--bg-deep); color: var(--muted); font-family: var(--mono); font-size: 12px;
    transition: all .13s;
  }
  .lane-btn:hover { border-color: var(--line-bright); color: var(--ink-2); }
  .lane-btn.on { background: rgba(111,211,216,.13); border-color: rgba(111,211,216,.5); color: var(--teal); }

  .mark-range { display: flex; flex-direction: column; gap: 4px; }
  .mr-track { display: flex; gap: 0; align-items: flex-end; }
  .mr-node { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 2px 0; }
  .node { width: 100%; height: 3px; background: var(--line); position: relative; transition: background .13s; }
  .mr-node.in .node { background: rgba(111,211,216,.5); }
  .mr-node.isStart .node, .mr-node.isEnd .node { background: var(--amber); height: 4px; }
  .mr-lab { font-size: 8px; color: var(--muted-2); }
  .mr-node.in .mr-lab { color: var(--teal); }
  .mr-read { display: flex; align-items: baseline; justify-content: space-between; margin-top: 2px; }
  .mr-read .mono { font-size: 10.5px; color: var(--ink-2); }
  .mr-hint { font-size: 8.5px; color: var(--muted-2); }

  .wind-editor { display: flex; gap: 14px; align-items: center; padding: 9px; background: var(--bg-deep); border: 1px solid var(--line-soft); border-radius: var(--radius); }
  .rose-n { fill: #4d757a; font-size: 7px; font-family: var(--mono); }
  .wind-inputs { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .wi-row { display: flex; align-items: center; gap: 5px; }
  .wi-row:nth-child(3) input { max-width: 52px; }
  .wi-row label { font-size: 9px; color: var(--muted-2); width: 30px; flex: none; white-space: nowrap; }
  .wi-row input { height: 25px; font-size: 11px; padding: 0 6px; min-width: 0; }
  .unit { font-size: 8.5px; color: var(--muted-2); width: 26px; flex: none; }
  .dash { color: var(--muted-2); font-size: 10px; }

  .conflict {
    display: flex; gap: 8px; padding: 9px 10px; border-radius: var(--radius);
    background: rgba(233,177,84,.09); border: 1px solid rgba(233,177,84,.3); color: var(--amber);
  }
  .conflict b { display: block; font-size: 11px; font-weight: 500; margin-bottom: 2px; }
  .conflict span { font-size: 10px; color: var(--amber-soft); line-height: 1.5; }
  .pub-note {
    display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--teal);
    padding: 6px 9px; background: rgba(111,211,216,.06); border-radius: 2px;
  }

  .ed-foot {
    display: flex; align-items: center; gap: 6px; padding: 10px 18px;
    border-top: 1px solid var(--line-soft); background: rgba(4,16,19,.6);
  }
  .spacer { flex: 1; }

  .ed-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 5px; color: var(--muted-2); padding: 24px;
  }
  .ed-empty p { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
  .ed-empty span { font-size: 10px; }
  .ed-steps { margin-top: 22px; display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 230px; }
  .step { display: flex; align-items: center; gap: 9px; font-size: 10.5px; color: var(--muted); }
  .sn { font-size: 9px; color: var(--amber); }
</style>
