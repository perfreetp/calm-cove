<script>
  import {
    round, recommendedOffset, evaluateModel, unfoldPattern, sampleProfile, decimate,
    findAbrupt, offsetSamples, detectSelfIntersections, pressureProfile,
  } from '../lib/geometry.js';
  import {
    submitWork, submissionsFor, studentErrorProfile,
  } from '../lib/store.js';
  import { exportPatternSVG, exportReportHTML, printPattern, downloadBlob } from '../lib/export.js';
  import ProfileEditor from '../components/ProfileEditor.svelte';
  import PatternView from '../components/PatternView.svelte';
  import ScarMap from '../components/ScarMap.svelte';
  import CurvatureChart from '../components/CurvatureChart.svelte';

  let { db = $bindable(), studentId, onRefresh = () => {}, onToast = () => {} } = $props();

  let taskId = $state(db.session.taskId ?? db.tasks[0].id);
  const task = $derived(db.tasks.find((t) => t.id === taskId) ?? db.tasks[0]);
  const student = $derived(db.students.find((s) => s.id === studentId) ?? db.students[0]);

  const history = $derived(submissionsFor(db, task.id, studentId));
  const latest = $derived(history[0] ?? null);

  let points = $state([]);
  let offsetMM = $state(6);
  let tab = $state('model');
  let offsetAuto = $state(true);
  let showRef = $state(false);
  let showComb = $state(true);
  let showSeam = $state(false);
  let selected = $state(-1);
  let submittedNotice = $state(null);
  let patternViewApi = $state(null);

  const rec = $derived(recommendedOffset(task.fabric));

  function initFromMeasurements(t) {
    return t.measurements.map((m) => ({ x: m.pos, y: round(m.circ / (2 * Math.PI), 2) }));
  }

  function loadTask(t) {
    const recent = submissionsFor(db, t.id, studentId)[0];
    if (recent) {
      points = recent.points.map((p) => ({ ...p }));
      offsetMM = recent.offsetMM;
      offsetAuto = false;
      submittedNotice = recent;
      tab = recent.status === 'graded' ? 'result' : 'model';
    } else {
      points = initFromMeasurements(t);
      offsetMM = recommendedOffset(t.fabric);
      offsetAuto = true;
      submittedNotice = null;
      tab = 'model';
    }
    selected = -1;
  }

  $effect(() => {
    if (!points.length) loadTask(task);
  });

  $effect(() => {
    if (offsetAuto) offsetMM = rec;
  });

  $effect(() => {
    const t = db.session.taskId;
    if (t && t !== taskId && db.tasks.some((x) => x.id === t)) {
      taskId = t;
      loadTask(db.tasks.find((x) => x.id === t));
    }
  });

  function selectTask(id) {
    taskId = id;
    db.session.taskId = id;
    onRefresh();
    loadTask(db.tasks.find((t) => t.id === id));
  }

  const samplesLive = $derived(points.length >= 2 ? sampleProfile(points, 220) : []);

  const live = $derived.by(() => {
    if (samplesLive.length < 2) return null;
    let maxKappa = 0;
    for (const p of samplesLive) if (p.kappa > maxKappa) maxKappa = p.kappa;
    return {
      maxKappa,
      minRadius: maxKappa > 0 ? 1 / maxKappa : Infinity,
      abrupt: findAbrupt(samplesLive, task.curvatureThreshold),
      selfX: detectSelfIntersections(decimate(offsetSamples(samplesLive, offsetMM), 2)),
      pressure: pressureProfile(samplesLive, task.fabric),
      n: samplesLive.length,
    };
  });

  const preview = $derived.by(() => {
    if (!points.length || points.length < 2) return null;
    return evaluateModel(points, task, offsetMM);
  });

  const pattern = $derived.by(() => {
    if (!points.length || points.length < 2) return null;
    const samples = sampleProfile(points, 200);
    return unfoldPattern(decimate(samples, 2), Math.abs(offsetMM));
  });

  const deadlineState = $derived.by(() => {
    const ms = new Date(task.deadline).getTime() - Date.now();
    return { expired: ms < 0, ms };
  });

  function fmtDT(d) {
    return new Date(d).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  const offsetHint = $derived.by(() => {
    const d = Math.abs(offsetMM - rec);
    if (d <= 0.5) return { tone: 'ok', text: '与弹性换算值一致' };
    if (d <= 1.5) return { tone: 'warn', text: '略偏离推荐值' };
    return { tone: 'danger', text: '明显偏离推荐值' };
  });

  function doSubmit() {
    if (points.length < 3) return;
    const sub = submitWork(db, { taskId: task.id, studentId, points, offsetMM });
    submittedNotice = sub;
    tab = 'result';
    onRefresh();
    onToast(sub.late ? '已提交 · 超过截止时间，标记为补交' : '已提交，等待教师复核');
  }

  function redo() {
    points = initFromMeasurements(task);
    offsetMM = rec;
    offsetAuto = true;
    selected = -1;
    submittedNotice = null;
    tab = 'model';
    onToast(`已开始第 ${history.length + 1} 次作答，历史成绩保留`);
  }

  const shown = $derived(submittedNotice ?? latest);
  const resultEval = $derived(shown?.evaluation ?? null);


  const oversize = $derived.by(() => {
    if (!pattern) return null;
    const w = pattern.lengthMM + 44;
    const h = pattern.maxWidthMM + 64;
    if (w > 276 || h > 190) return `${w.toFixed(0)} × ${h.toFixed(0)} mm`;
    return null;
  });

  function downloadSVG() {
    if (!pattern) return;
    exportPatternSVG(pattern, {
      taskTitle: task.title,
      studentName: student.name,
      limbName: task.limb,
      offsetMM,
    });
    onToast('已导出 SVG（打印 100% 即 1:1）');
  }

  function downloadPNG() {
    const c = patternViewApi?.getCanvas();
    if (!c) return;
    c.toBlob((b) => {
      if (b) downloadBlob(b, `下料图_${task.title}_${student.name}.png`);
    }, 'image/png');
    onToast('已导出 PNG');
  }

  function doPrint() {
    const c = patternViewApi?.getCanvas();
    if (!c) return;
    printPattern(c, {
      taskTitle: task.title,
      studentName: student.name,
      offsetMM,
      areaCM2: (pattern?.areaCM2 ?? 0).toFixed(0),
      perimeterCM: (pattern?.perimeterCM ?? 0).toFixed(1),
      printWidthMM: 260,
      oversize: oversize ?? '',
      note: '打印缩放请选「实际大小」；图上 1 mm 对应实物 1 mm。',
    });
  }

  function exportReport() {
    if (!shown) return;
    exportReportHTML(db, shown);
    onToast('考核报告已导出');
  }

  const tabs = [
    { id: 'model', label: '建模' },
    { id: 'seam', label: '缝份与展开' },
    { id: 'result', label: '成绩与错题' },
    { id: 'history', label: '历史作答' },
  ];

  const errorProfile = $derived(studentErrorProfile(db, studentId));

  const report = $derived.by(() => {
    if (!shown || !resultEval) return null;
    return {
      ...resultEval,
      finalScore: shown.finalScore,
      teacherComment: shown.teacherComment,
      teacherDeduction: shown.teacherDeduction,
      status: shown.status,
      late: shown.late,
      attempt: shown.attempt,
      submittedAt: shown.submittedAt,
    };
  });
</script>

<div class="page">
  <!-- 左栏：任务说明 -->
  <aside class="left scroll">
    <div class="task-switch">
      <span class="muted tiny">我的任务</span>
      <select value={task.id} onchange={(e) => selectTask(e.currentTarget.value)}>
        {#each db.tasks as t}
          <option value={t.id}>{t.title} · {fmtDT(t.deadline)}</option>
        {/each}
      </select>
    </div>

    <div class="card task-card">
      <div class="row" style="justify-content:space-between">
        <span class="tag-task">{task.id}</span>
        {#if deadlineState.expired}
          <span class="pill danger">已过截止</span>
        {:else}
          <span class="pill ok">进行中</span>
        {/if}
      </div>
      <h2>{task.title}</h2>
      <p class="brief">{task.brief}</p>
      <div class="row wrap" style="gap:6px;margin-top:8px">
        <span class="pill accent">{task.fabric.name}</span>
        <span class="pill violet">压力档 {task.pressureTier.min}–{task.pressureTier.max} mmHg</span>
        <span class="pill">截止 {fmtDT(task.deadline)}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="dot"></span>肢体围度测量表</div>
      <table class="grid">
        <thead>
          <tr><th>位置</th><th>标记点</th><th class="num">围度 mm</th><th class="num">半径 mm</th></tr>
        </thead>
        <tbody>
          {#each task.measurements as m}
            <tr>
              <td class="mono">{m.pos}</td>
              <td class="muted">{m.label}</td>
              <td class="num">{m.circ}</td>
              <td class="num">{round(m.circ / (2 * Math.PI), 1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="hint">半径 = 围度 / 2π，建模时纵轴为半径。曲线须覆盖首末标记点。</p>
    </div>

    <div class="card">
      <div class="card-title"><span class="dot"></span>瘢痕位置示意</div>
      <ScarMap scars={task.scars} span={task.span} limbName={task.limb} height={132} />
      <div class="scar-list">
        {#each task.scars as s}
          <div class="scar-row">
            <span class="scar-dot"></span>
            <span class="mono">{s.start}–{s.end} mm</span>
            <span class="pill">{s.severity}</span>
            <span class="muted small">{s.note}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="dot"></span>面料与工艺参数</div>
      <div class="kv">
        <span class="k">张力（单向拉伸）</span><span class="v">{task.fabric.tensionNPerMM.toFixed(2)} N/mm</span>
        <span class="k">基准缝份</span><span class="v">{task.fabric.baseSeamMM} mm</span>
        <span class="k">弹性系数 k</span><span class="v">{task.fabric.elasticity.toFixed(2)}</span>
        <span class="k">推荐缝份 = 基准 × (1+k)</span><span class="v" style="color:var(--accent)">{rec} mm</span>
        <span class="k">曲率突变阈值</span><span class="v">{task.curvatureThreshold}</span>
        <span class="k">偏差红色阈值</span><span class="v">5 mm</span>
      </div>
      <p class="hint">压力估算按拉普拉斯定律 P = 7500 × T / r，仅作档位校核。</p>
    </div>

    <div class="card history-mini">
      <div class="card-title"><span class="dot"></span>我的作答记录
      </div>
      {#if history.length === 0}
        <p class="hint">还没有提交记录。</p>
      {:else}
        {#each history as h}
          <div class="hist-row" class:cur={shown?.id === h.id}>
            <span class="mono muted">第 {h.attempt} 次</span>
            <span class="mono small">{fmtDT(h.submittedAt)}</span>
            {#if h.late}<span class="pill warn">补交</span>{/if}
            {#if h.status === 'graded'}
              <span class="pill ok mono">{h.finalScore}</span>
            {:else}
              <span class="pill mono">待批</span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- 右栏：工作区 -->
  <main class="main col">
    <div class="topbar">
      <div class="charline">
        <div class="avatar">{student.avatar}</div>
        <div class="col" style="gap:1px">
          <b>{student.name}</b>
          <span class="muted small">{student.id} · {student.cohort}</span>
        </div>
      </div>
      <div class="seg">
        {#each tabs as t}
          <button class={tab === t.id ? 'on' : ''} onclick={() => (tab = t.id)}>{t.label}</button>
        {/each}
      </div>
      <button class="small ghost" onclick={() => (tab = 'history')}>成绩记录</button>
    </div>

    {#if tab === 'model' || tab === 'seam'}
      <div class="toolbar row wrap">
        <div class="row">
          <button class="segbtn" class:on={showComb} onclick={() => (showComb = !showComb)}>曲率梳</button>
          <button class="segbtn" class:on={showSeam} onclick={() => (showSeam = !showSeam)}>缝份偏移</button>
          <button class="segbtn" class:on={showRef} onclick={() => (showRef = !showRef)}>叠加参考</button>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <span class="muted small">缝份</span>
          <input class="num-in mono" type="number" min="1" max="18" step="0.1" value={offsetMM}
            oninput={(e) => { offsetAuto = false; offsetMM = Math.max(0.5, Math.min(20, +e.currentTarget.value)); }} />
          <span class="muted small">mm</span>
          <button class="small" onclick={() => { offsetAuto = true; offsetMM = rec; }}>按弹性换算 {rec}</button>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <button class="small" onclick={() => { points = initFromMeasurements(task); selected = -1; onToast('已按测量表重建控制点'); }}>以测量表重置</button>
        </div>
      </div>

      <ProfileEditor
        bind:points
        {task}
        {offsetMM}
        mode="edit"
        showReference={showRef}
        showComb={showComb}
        showSeam={showSeam}
        height={tab === 'seam' ? 300 : 430}
        onSelectIndex={(i) => (selected = i)}
      />

      <div class="stats-strip">
        <div class="stat">
          <span class="k">最大曲率</span>
          <span class="v mono" class:alert={live && live.maxKappa > (1 / 6)}>
            {live ? (live.maxKappa * 1000).toFixed(2) : '—'}
          </span>
          <span class="u">×10⁻³/mm</span>
        </div>
        <div class="stat">
          <span class="k">最小曲率半径</span>
          <span class="v mono">{live ? (live.minRadius === Infinity ? '∞' : live.minRadius.toFixed(0)) : '—'}</span>
          <span class="u">mm</span>
        </div>
        <div class="stat" class:alert={live?.abrupt?.length}>
          <span class="k">曲率突变区段</span>
          <span class="v mono">{live?.abrupt?.length ?? 0}</span>
          <span class="u">处 · 标黄</span>
        </div>
        <div class="stat" class:alert={live?.selfX?.length}>
          <span class="k">缝份自交</span>
          <span class="v mono">{live?.selfX?.length ?? 0}</span>
          <span class="u">点</span>
        </div>
        <div class="stat">
          <span class="k">估算压力</span>
          <span class="v mono" style="color:{live && live.pressure && Math.abs(live.pressure.mean - (task.pressureTier.min + task.pressureTier.max) / 2) < 8 ? 'var(--ok)' : 'var(--warn)'}">
            {live?.pressure ? live.pressure.mean.toFixed(1) : '—'}
          </span>
          <span class="u">mmHg（目标 {task.pressureTier.min}–{task.pressureTier.max}）</span>
        </div>
      </div>

      {#if tab === 'model'}
      <div class="card kappa-card">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <div class="card-title" style="margin:0"><span class="dot" style="background:var(--accent-2)"></span>曲率分布 · κ–x 曲线</div>
          <span class="hint">黄色竖带 = 曲率突变区段（|dκ/ds| &gt; {task.curvatureThreshold}）</span>
        </div>
        <CurvatureChart samples={samplesLive} abrupt={live?.abrupt ?? []} threshold={task.curvatureThreshold} height={88} />
      </div>
      {/if}

      {#if tab === 'seam'}
        <div class="card seam-card fade-in">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="card-title" style="margin-bottom:2px"><span class="dot"></span>等距偏移 · 缝份自检</div>
              <p class="hint">偏移量按面料弹性系数换算：基准缝份 {task.fabric.baseSeamMM} mm × (1 + k {task.fabric.elasticity.toFixed(2)}) = <b style="color:var(--accent)">{rec} mm</b>。当前 {offsetMM.toFixed(1)} mm。</p>
            </div>
            <span class="pill {offsetHint.tone}">{offsetHint.text}</span>
          </div>

          <div class="seam-grid">
            <div class="col" style="gap:8px">
              <div class="selflist">
                {#if live?.selfX?.length}
                  <div class="alertline">检测到 {live.selfX.length} 处自交，偏移线在凹弯处会折叠，需减小缝份或平缓轮廓。</div>
                  {#each live.selfX.slice(0, 4) as h}
                    <div class="mono small">交点 x {h.x.toFixed(1)} · r {h.y.toFixed(1)} mm</div>
                  {/each}
                {:else}
                  <div class="okline">✓ 偏移线无自交，缝份可安全展开</div>
                {/if}
                <div class="kv small" style="margin-top:6px">
                  <span class="k">偏移线长度</span><span class="v mono">{pattern ? pattern.lengthMM.toFixed(0) : '—'} mm</span>
                  <span class="k">下料宽度</span><span class="v mono">{pattern ? pattern.maxWidthMM.toFixed(0) : '—'} mm</span>
                  <span class="k">面积</span><span class="v mono">{pattern ? pattern.areaCM2.toFixed(0) : '—'} cm²</span>
                  <span class="k">周长</span><span class="v mono">{pattern ? pattern.perimeterCM.toFixed(1) : '—'} cm</span>
                </div>
              </div>
            </div>
            <div class="col pattern-col">
              <PatternView
                bind:this={patternViewApi}
                {pattern}
                {offsetMM}
                taskTitle={task.title}
                studentName={student.name}
                height={300}
                paper={'1 : 10'}
              />
              <div class="row" style="margin-top:8px">
                <button class="small primary" onclick={doPrint}>打印下料图（1:1）</button>
                <button class="small" onclick={downloadSVG}>导出 SVG</button>
                <button class="small" onclick={downloadPNG}>导出 PNG</button>
                <span class="hint">
                  {#if oversize}
                    <span style="color:var(--warn)">⚠ 图幅 {oversize} 超过 A4 横向可打印范围，需分幅或改用 A3。</span>
                  {:else}
                    按比例导出，制作间打印请选「实际大小」
                  {/if}
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <div class="submit-bar">
        <div class="col" style="gap:2px">
          <span class="muted small">自动预评分（未提交）</span>
          <span class="mono" style="font-size:19px;color:var(--accent)">{preview ? preview.autoScore.toFixed(1) : '—'}<span class="muted" style="font-size:11px"> / 100</span></span>
        </div>
        <div class="mini-metrics">
          <span class="muted small">RMS</span><b class="mono">{preview ? preview.rms.toFixed(2) : '—'}</b><span class="muted small">mm</span>
          <span class="divider"></span>
          <span class="muted small">超 5 mm</span><b class="mono" style="color:var(--danger)">{preview?.deviationSegments.length ?? 0}</b><span class="muted small">处</span>
          <span class="divider"></span>
          <span class="muted small">自交</span><b class="mono">{preview?.selfIntersectCount ?? 0}</b><span class="muted small">处</span>
        </div>
        {#if deadlineState.expired}
          <span class="pill warn" title="已过截止时间，本次提交将标记为补交">已过截止 · 提交记为补交</span>
        {/if}
        <div class="spacer"></div>
        <button class="ghost small" onclick={redo}>重新作答</button>
        <button class="primary" onclick={doSubmit} disabled={points.length < 3}>
          {deadlineState.expired ? '提交（补交）' : '提交考核'}
        </button>
      </div>
    {/if}

    {#if tab === 'result'}
      {#if !report}
        <div class="empty">
          <p>本任务还没有提交记录。</p>
          <button class="primary" onclick={() => (tab = 'model')}>去建模</button>
        </div>
      {:else}
        <div class="card result-head fade-in">
          <div class="row" style="align-items:flex-start;justify-content:space-between">
            <div>
              <div class="card-title" style="margin-bottom:4px">
                <span class="dot"></span>第 {report.attempt} 次提交结果
                {#if report.late}<span class="pill warn">补交</span>{/if}
                {#if report.status === 'graded'}<span class="pill ok">已复核</span>{:else}<span class="pill">待教师复核</span>{/if}
              </div>
              <span class="muted small">提交于 {fmtDT(report.submittedAt)}</span>
            </div>
            <div class="row">
              <button class="small" onclick={exportReport}>导出报告</button>
              <button class="small primary" onclick={redo}>重新作答</button>
            </div>
          </div>

          <div class="score-row">
            <div class="score-main">
              <span class="muted small">{report.status === 'graded' ? '最终成绩' : '自动评分（待复核）'}</span>
              <div class="big mono">{report.finalScore ?? report.autoScore.toFixed(1)}</div>
              <span class="muted small">
                {#if report.status === 'graded'}
                  自动 {report.autoScore.toFixed(1)} · 教师扣 {report.teacherDeduction ?? 0}
                {:else}
                  教师复核后可能追加扣分
                {/if}
              </span>
            </div>
            <div class="breakdown">
              {#each [['轮廓贴合', report.breakdown.contour, 60], ['曲率平滑', report.breakdown.smooth, 20], ['缝份展开', report.breakdown.seam, 10], ['压力档位', report.breakdown.pressure, 10]] as [label, val, max]}
                <div class="bd-row">
                  <span class="k">{label}</span>
                  <div class="bar"><div class="fill" style="width:{Math.max(2, (val / max) * 100)}%; background:{val / max > 0.75 ? 'var(--ok)' : val / max > 0.4 ? 'var(--accent)' : 'var(--warn)'}"></div></div>
                  <span class="v mono">{val.toFixed(1)}<span class="muted">/{max}</span></span>
                </div>
              {/each}
            </div>
          </div>
        </div>

        {#if report.teacherComment}
          <div class="card comment-card fade-in">
            <div class="card-title"><span class="dot" style="background:var(--violet)"></span>教师评语</div>
            <p class="comment-text">{report.teacherComment}</p>
          </div>
        {/if}

        <div class="card fade-in">
          <div class="card-title"><span class="dot" style="background:var(--danger)"></span>错题区段 · 与参考轮廓偏差 &gt; 5 mm</div>
          <ProfileEditor
            bind:points
            {task}
            {offsetMM}
            mode="review"
            showReference
            showComb
            showSeam={false}
            deviation={report}
            height={340}
          />
          {#if report.deviationSegments.length}
            <table class="grid" style="margin-top:10px">
              <thead><tr><th>区段（距起点）</th><th class="num">最大偏差</th><th>方向</th><th class="num">峰值位置</th><th>提示</th></tr></thead>
              <tbody>
                {#each report.deviationSegments as s}
                  <tr>
                    <td class="mono">{s.startMM} – {s.endMM} mm</td>
                    <td class="num" style="color:var(--danger)">{s.maxAbs.toFixed(1)} mm</td>
                    <td>{s.signed >= 0 ? '偏外（过松）' : '偏内（过紧）'}</td>
                    <td class="num">{s.peakX} mm</td>
                    <td class="muted small">{s.signed >= 0 ? '压力不足，需收紧轮廓' : '压力过高，可能压疮'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="hint" style="color:var(--ok)">✓ 全部区段偏差均在 5 mm 以内。</p>
          {/if}
        </div>

        <div class="two-col">
          <div class="card fade-in">
            <div class="card-title"><span class="dot" style="background:var(--warn)"></span>曲率突变区段</div>
            {#if report.abruptSegments.length}
              <table class="grid">
                <thead><tr><th>区段</th><th class="num">峰值 κ</th><th class="num">突变斜率</th></tr></thead>
                <tbody>
                  {#each report.abruptSegments as s}
                    <tr><td class="mono">{s.startMM} – {s.endMM} mm</td><td class="num">{s.peakKappa}</td><td class="num">{s.peakSlope}</td></tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="hint" style="color:var(--ok)">✓ 无曲率突变，曲线过渡平滑。</p>
            {/if}
          </div>
          <div class="card fade-in">
            <div class="card-title"><span class="dot" style="background:var(--accent-2)"></span>工艺与下料</div>
            <div class="kv">
              <span class="k">估算压力</span><span class="v mono">{report.pressure.mean.toFixed(1)} / {report.pressure.min.toFixed(1)}–{report.pressure.max.toFixed(1)} mmHg</span>
              <span class="k">档位判定</span><span class="v">{report.pressure.inTier ? '✓ 在档' : report.pressure.nearTier ? '接近档位' : '× 未达档'}</span>
              <span class="k">缝份 / 推荐</span><span class="v mono">{report.offsetMM} / {report.offsetRecommended} mm</span>
              <span class="k">缝份自交</span><span class="v mono">{report.selfIntersectCount} 处</span>
              <span class="k">下料面积</span><span class="v mono">{report.pattern.areaCM2} cm²</span>
              <span class="k">下料周长</span><span class="v mono">{report.pattern.perimeterCM} cm</span>
            </div>
            <button class="small" style="margin-top:10px" onclick={() => (tab = 'seam')}>查看展开下料图 →</button>
          </div>
        </div>
      {/if}
    {/if}

    {#if tab === 'history'}
      <div class="card fade-in">
        <div class="card-title"><span class="dot"></span>历史作答与成绩留存</div>
        {#if history.length === 0}
          <p class="hint">暂无提交记录。</p>
        {:else}
          <table class="grid">
            <thead>
              <tr><th>次数</th><th>提交时间</th><th>状态</th><th class="num">自动分</th><th class="num">教师扣分</th><th class="num">最终分</th><th class="num">RMS</th><th class="num">超限区段</th><th>评语</th></tr>
            </thead>
            <tbody>
              {#each history as h}
                <tr class="{submittedNotice?.id === h.id ? 'hl' : ''}">
                  <td class="mono">第 {h.attempt} 次</td>
                  <td class="mono muted">{fmtDT(h.submittedAt)} {#if h.late}<span class="pill warn">补交</span>{/if}</td>
                  <td>{#if h.status === 'graded'}<span class="pill ok">已复核</span>{:else}<span class="pill">待复核</span>{/if}</td>
                  <td class="num">{h.autoScore.toFixed(1)}</td>
                  <td class="num">{h.teacherDeduction ?? '—'}</td>
                  <td class="num" style="font-weight:650">{h.finalScore ?? '—'}</td>
                  <td class="num">{h.evaluation.rms.toFixed(2)}</td>
                  <td class="num">{h.evaluation.deviationSegments.length}</td>
                  <td class="muted small" style="max-width:260px">{h.teacherComment || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="row" style="margin-top:10px">
            <button class="small" onclick={() => { points = history[0].points.map(p => ({...p})); offsetMM = history[0].offsetMM; tab = 'model'; onToast('已载入最近一次作答'); }}>载入最近作答继续改</button>
            <button class="small" onclick={redo}>从测量表重做</button>
          </div>
        {/if}
      </div>

      <div class="card fade-in">
        <div class="card-title"><span class="dot" style="background:var(--warn)"></span>我的常见错误统计</div>
        <div class="err-grid">
          {#each errorProfile as e}
            <div class="err-item">
              <span class="err-dot"></span>
              <b>{e.label}</b>
              <span class="mono muted">{e.count} 次 / {e.taskCount} 个任务</span>
            </div>
          {:else}
            <p class="hint">暂无错误记录。</p>
          {/each}
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: 336px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }
  @media (max-width: 1180px) {
    .page { grid-template-columns: 1fr; height: auto; overflow-y: auto; }
    .left { border-right: 0; border-bottom: 1px solid var(--line-soft); }
  }

  .left {
    border-right: 1px solid var(--line-soft);
    background: rgba(9, 15, 24, .45);
    padding: 12px;
    display: flex; flex-direction: column; gap: 10px;
    min-height: 0;
  }

  .main > * { flex: 0 0 auto; }
  .main {
    min-width: 0; min-height: 0;
    padding: 12px 16px 76px;
    display: flex; flex-direction: column; gap: 10px;
    overflow-y: auto;
  }

  .topbar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding-bottom: 9px; border-bottom: 1px solid var(--line-soft);
  }
  .charline { display: flex; align-items: center; gap: 9px; }
  .avatar {
    width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
    font-weight: 700; font-size: 13px; color: #04211f;
    background: linear-gradient(145deg, #4ee0d2, #2196a0);
  }

  .task-card h2 { margin: 8px 0 6px; font-size: 16px; letter-spacing: .01em; }
  .task-switch { display: flex; flex-direction: column; gap: 3px; flex: 0 0 auto; }
  .task-switch select { width: 100%; font-size: 12px; }
  .tiny { font-size: 10.5px; }
  .tag-task {
    font-family: var(--mono); font-size: 10.5px; color: var(--text-3);
    padding: 2px 7px; border: 1px solid var(--line); border-radius: 5px;
  }
  .brief { margin: 0; font-size: 12px; line-height: 1.72; color: var(--text-2); }

  .scar-list { display: flex; flex-direction: column; gap: 5px; margin-top: 9px; }
  .scar-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 11px; }
  .scar-dot { width: 7px; height: 7px; border-radius: 2px; background: rgba(255,138,128,.7); flex: 0 0 auto; }
  .small { font-size: 11px; }

  .history-mini .hist-row {
    display: flex; align-items: center; gap: 8px; padding: 5px 0;
    border-bottom: 1px solid var(--line-soft); font-size: 11px;
  }
  .history-mini .hist-row:last-child { border-bottom: 0; }
  .history-mini .hist-row.cur { background: rgba(70,211,197,.05); }
  .history-mini .hist-row span::first-child { flex: 0 0 auto; }

  .toolbar {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 10px; background: var(--panel); border: 1px solid var(--line-soft);
    border-radius: 9px; font-size: 12px;
  }
  .segbtn {
    font-size: 11.5px; padding: 4px 10px; border-radius: 6px;
    background: transparent; border: 1px solid var(--line); color: var(--text-2);
  }
  .segbtn.on { background: rgba(70,211,197,.12); border-color: rgba(70,211,197,.45); color: var(--accent); }
  .num-in { width: 68px; padding: 3px 6px; font-size: 11.5px; text-align: right; }

  .stats-strip {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px;
    background: var(--line-soft); border: 1px solid var(--line-soft);
    border-radius: 9px; overflow: hidden;
  }
  .stat {
    background: var(--panel); padding: 7px 11px;
    display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap;
  }
  .stat .k { font-size: 10.5px; color: var(--text-3); flex: 0 0 100%; }
  .stat .v { font-size: 15px; font-weight: 620; }
  .stat .u { font-size: 10px; color: var(--text-3); }
  .stat.alert { background: linear-gradient(180deg, rgba(243,193,75,.10), rgba(17,27,41,.9)); }
  .stat.alert .v { color: var(--warn); }

  .seam-card { display: flex; flex-direction: column; gap: 10px; }
  .seam-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 14px; }
  @media (max-width: 1080px) { .seam-grid { grid-template-columns: 1fr; } }
  .selflist { font-size: 11.5px; }
  .alertline {
    color: #ffb3a8; background: rgba(255,107,107,.09);
    border: 1px solid rgba(255,107,107,.28); border-radius: 7px;
    padding: 7px 10px; margin-bottom: 6px; line-height: 1.55;
  }
  .okline {
    color: #9ef0be; background: rgba(84,217,140,.08);
    border: 1px solid rgba(84,217,140,.26); border-radius: 7px;
    padding: 7px 10px; line-height: 1.55;
  }

  .submit-bar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 14px; margin-bottom: 12px;
    background: linear-gradient(180deg, rgba(22,34,51,.95), rgba(13,21,33,.95));
    border: 1px solid var(--line); border-radius: 10px;
    position: sticky; bottom: 0; z-index: 3;
  }
  .mini-metrics { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
  .mini-metrics b { font-size: 13px; }
  .mini-metrics .divider { width: 1px; height: 12px; background: var(--line); margin: 0 5px; }

  .result-head { display: flex; flex-direction: column; gap: 12px; }
  .score-row { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; align-items: center; }
  @media (max-width: 900px) { .score-row { grid-template-columns: 1fr; } }
  .score-main { display: flex; flex-direction: column; gap: 1px; }
  .score-main .big { font-size: 44px; font-weight: 680; line-height: 1.05; color: var(--accent); }
  .breakdown { display: flex; flex-direction: column; gap: 7px; }
  .bd-row { display: grid; grid-template-columns: 66px 1fr 74px; gap: 9px; align-items: center; }
  .bd-row .k { font-size: 11.5px; color: var(--text-2); }
  .bd-row .bar { height: 6px; background: #0a1420; border-radius: 999px; overflow: hidden; }
  .bd-row .fill { height: 100%; border-radius: 999px; }
  .bd-row .v { font-size: 11.5px; text-align: right; }

  .comment-card .comment-text {
    margin: 0; font-size: 12.5px; line-height: 1.7; color: var(--text-2);
    background: rgba(167,139,250,.06); border-left: 3px solid var(--violet);
    padding: 9px 13px; border-radius: 0 7px 7px 0;
  }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 1000px) { .two-col { grid-template-columns: 1fr; } }

  .empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; padding: 80px 0; color: var(--text-3);
  }

  tr.hl { background: rgba(70,211,197,.06); }
  .err-grid { display: flex; flex-direction: column; gap: 6px; }
  .err-item { display: flex; align-items: center; gap: 9px; font-size: 12px; padding: 4px 0; }
  .err-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
  .pattern-col { min-width: 0; }
</style>
