<script>
  import {
    classProgress, errorStats, gradeSubmission, ungradeSubmission, setDeadline,
    updateTask, taskById, studentById,
  } from '../lib/store.js';
  import { exportGradebookCSV } from '../lib/export.js';
  import ProfileEditor from '../components/ProfileEditor.svelte';
  import TaskForm from '../components/TaskForm.svelte';
  import { round, recommendedOffset } from '../lib/geometry.js';

  let { db = $bindable(), onRefresh = () => {}, onToast = () => {}, teacherId } = $props();

  let tab = $state('progress');
  let creatingTask = $state(false);
  let taskId = $state(db.session.teacherTaskId ?? db.tasks[0].id);
  const task = $derived(db.tasks.find((t) => t.id === taskId) ?? db.tasks[0]);

  let gradingId = $state(null);
  const grading = $derived(gradingId ? db.submissions.find((s) => s.id === gradingId) : null);
  const gradingStudent = $derived(grading ? studentById(db, grading.studentId) : null);
  const gradingTask = $derived(grading ? taskById(db, grading.taskId) : null);

  let deduction = $state('');
  let comment = $state('');
  let gPoints = $state([]);
  let gOffset = $state(6);
  let gMetrics = $state(null);

  const progress = $derived(classProgress(db, task.id, null));
  const stats = $derived(errorStats(db, task.id));
  const globalStats = $derived(errorStats(db, null));

  const summary = $derived.by(() => {
    const submitted = progress.filter((p) => p.latest);
    const graded = progress.filter((p) => p.latest?.status === 'graded');
    const pending = progress.filter((p) => p.latest?.status === 'pending');
    const late = progress.filter((p) => p.latest?.late);
    const scores = progress.map((p) => p.latest?.finalScore ?? p.latest?.autoScore).filter((v) => v != null);
    return {
      total: progress.length,
      submitted: submitted.length,
      graded: graded.length,
      pending: pending.length,
      late: late.length,
      unsubmitted: progress.length - submitted.length,
      avg: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length, 1) : null,
    };
  });

  const attention = $derived(
    progress.filter((p) => p.latest?.status === 'pending' || (p.latest?.late ?? false) || (p.latest && (p.latest.finalScore ?? p.latest.autoScore) < 70))
  );

  function openGrading(subId) {
    gradingId = subId;
    const sub = db.submissions.find((s) => s.id === subId);
    if (!sub) return;
    deduction = sub.teacherDeduction != null ? String(sub.teacherDeduction) : '';
    comment = sub.teacherComment ?? '';
    gPoints = sub.points.map((p) => ({ ...p }));
    gOffset = sub.offsetMM;
  }

  function saveGrade(ungrade) {
    if (!grading) return;
    if (ungrade) {
      ungradeSubmission(db, grading.id);
      onRefresh();
      onToast('已撤销复核，回到待批');
      gradingId = null;
      return;
    }
    const dd = Math.max(0, Number(deduction) || 0);
    gradeSubmission(db, grading.id, { deduction: dd, comment });
    onRefresh();
    onToast(`已复核：扣 ${dd} 分`);
    gradingId = null;
  }

  function fmtDT(d) {
    return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function deadlineLocal(v) {
    const d = new Date(v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  let deadlineDraft = $state('');
  $effect(() => {
    deadlineDraft = deadlineLocal(task.deadline);
  });

  function commitDeadline() {
    const iso = new Date(deadlineDraft).toISOString();
    setDeadline(db, task.id, iso);
    onRefresh();
    onToast('截止时间已更新，逾期提交将标记为补交');
  }

  const maxErr = $derived(stats.length ? Math.max(...stats.map((s) => s.studentCount)) : 1);

  function errTone(type) {
    return {
      contour: 'var(--danger)',
      curvature: 'var(--warn)',
      seam: 'var(--accent-2)',
      pressure: 'var(--violet)',
      measurement: 'var(--text-2)',
    }[type] ?? 'var(--text-2)';
  }

  let studentFilter = $state('');
  const progressShown = $derived(
    studentFilter
      ? progress.filter((p) => p.student.name.includes(studentFilter) || p.student.id.includes(studentFilter))
      : progress
  );
</script>

<div class="page">
  <div class="main-wide col">
    <div class="topbar">
      <div class="charline">
        <div class="avatar t">{db.teacher.name.slice(0, 1)}</div>
        <div class="col" style="gap:1px">
          <b>{db.teacher.name} · 教师端</b>
          <span class="muted small">{db.teacher.title}</span>
        </div>
      </div>
      <div class="seg">
        <button class={tab === 'progress' ? 'on' : ''} onclick={() => (tab = 'progress')}>班级进度</button>
        <button class={tab === 'grade' ? 'on' : ''} onclick={() => (tab = 'grade')}>复核打分</button>
        <button class={tab === 'errors' ? 'on' : ''} onclick={() => (tab = 'errors')}>常见错误</button>
        <button class={tab === 'tasks' ? 'on' : ''} onclick={() => (tab = 'tasks')}>任务与截止</button>
        <button class={tab === 'gradebook' ? 'on' : ''} onclick={() => (tab = 'gradebook')}>成绩单</button>
      </div>
    </div>

    <div class="taskbar row wrap">
      <span class="muted small">当前任务</span>
      <select bind:value={taskId} onchange={() => (db.session.teacherTaskId = taskId, onRefresh())}>
        {#each db.tasks as t}
          <option value={t.id}>{t.id} · {t.title}</option>
        {/each}
      </select>
      <span class="pill accent">{task.fabric.name}</span>
      <span class="pill violet">{task.pressureTier.min}–{task.pressureTier.max} mmHg</span>
      <span class="pill {new Date(task.deadline) < new Date() ? 'danger' : 'ok'}">截止 {fmtDT(task.deadline)}</span>
      <div class="spacer"></div>
      <button class="small" onclick={() => exportGradebookCSV(db, { title: `成绩单 · ${task.title}` })}>导出成绩单 CSV</button>
    </div>

    {#if tab === 'progress'}
      <div class="kpi-row">
        <div class="kpi"><span class="muted small">应交人数</span><b class="mono">{summary.total}</b></div>
        <div class="kpi"><span class="muted small">已提交</span><b class="mono" style="color:var(--accent)">{summary.submitted}</b></div>
        <div class="kpi"><span class="muted small">待复核</span><b class="mono" style="color:var(--warn)">{summary.pending}</b></div>
        <div class="kpi"><span class="muted small">已复核</span><b class="mono" style="color:var(--ok)">{summary.graded}</b></div>
        <div class="kpi"><span class="muted small">补交</span><b class="mono" style="color:var(--danger)">{summary.late}</b></div>
        <div class="kpi"><span class="muted small">平均分</span><b class="mono">{summary.avg ?? '—'}</b></div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:10px">
          <div class="card-title" style="margin:0"><span class="dot"></span>班级进度表 · {task.title}</div>
          <input class="search" placeholder="搜索学员姓名 / 学号" bind:value={studentFilter} />
        </div>
        <div class="table-wrap scroll">
          <table class="grid">
            <thead>
              <tr>
                <th>学员</th><th>学号</th><th>状态</th><th class="num">作答次数</th>
                <th>最近提交</th><th class="num">自动分</th><th class="num">最终分</th>
                <th class="num">RMS</th><th class="num">超限段</th><th class="num">自交</th><th class="num">提升</th><th></th>
              </tr>
            </thead>
            <tbody>
              {#each progressShown as p}
                <tr>
                  <td>
                    <div class="row" style="gap:7px">
                      <div class="ava-mini">{p.student.avatar}</div>
                      <span>{p.student.name}</span>
                    </div>
                  </td>
                  <td class="mono muted">{p.student.id}</td>
                  <td>
                    {#if !p.latest}
                      <span class="pill">未提交</span>
                    {:else if p.latest.status === 'pending'}
                      <span class="pill warn">待复核</span>
                    {:else}
                      <span class="pill ok">已复核</span>
                    {/if}
                    {#if p.latest?.late}<span class="pill danger">补交</span>{/if}
                  </td>
                  <td class="num">{p.attempts || '—'}</td>
                  <td class="mono muted small">{p.latest ? fmtDT(p.latest.submittedAt) : '—'}</td>
                  <td class="num">{p.latest ? p.latest.autoScore.toFixed(1) : '—'}</td>
                  <td class="num strong">{p.latest?.finalScore ?? '—'}</td>
                  <td class="num">{p.latest ? p.latest.evaluation.rms.toFixed(2) : '—'}</td>
                  <td class="num" style="color:{(p.latest?.evaluation.deviationSegments.length ?? 0) > 0 ? 'var(--danger)' : 'inherit'}">
                    {p.latest?.evaluation.deviationSegments.length ?? '—'}
                  </td>
                  <td class="num">{p.latest?.evaluation.selfIntersectCount ?? '—'}</td>
                  <td class="num" style="color:{(p.improved ?? 0) > 0 ? 'var(--ok)' : 'inherit'}">
                    {p.improved != null ? (p.improved > 0 ? '+' : '') + p.improved : '—'}
                  </td>
                  <td>
                    {#if p.latest}
                      <button class="small" onclick={() => { openGrading(p.latest.id); tab = 'grade'; }}>
                        {p.latest.status === 'pending' ? '复核' : '查看'}
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-title"><span class="dot" style="background:var(--warn)"></span>需要关注</div>
          {#if attention.length === 0}
            <p class="hint" style="color:var(--ok)">✓ 无待复核或低分学员。</p>
          {:else}
            <div class="attn-list">
              {#each attention as p}
                <div class="attn">
                  <span class="ava-mini">{p.student.avatar}</span>
                  <span>{p.student.name}</span>
                  {#if p.latest?.status === 'pending'}<span class="pill warn">待复核</span>{/if}
                  {#if p.latest?.late}<span class="pill danger">补交</span>{/if}
                  {#if p.latest && (p.latest.finalScore ?? p.latest.autoScore) < 70}
                    <span class="pill danger mono">{p.latest.finalScore ?? p.latest.autoScore.toFixed(1)}</span>
                  {/if}
                  <div class="spacer"></div>
                  <button class="small ghost" onclick={() => { if (p.latest) { openGrading(p.latest.id); tab = 'grade'; } }}>查看</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="card">
          <div class="card-title"><span class="dot" style="background:var(--danger)"></span>本任务错误分布</div>
          {#if stats.length === 0}
            <p class="hint">暂无数据。</p>
          {:else}
            <div class="errbars">
              {#each stats as s}
                <div class="errbar">
                  <span class="lbl">{s.label}</span>
                  <div class="track">
                    <div class="b" style="width:{Math.max(6, (s.studentCount / maxErr) * 100)}%; background:{errTone(s.type)}"></div>
                  </div>
                  <span class="mono small">{s.studentCount} 人 · {s.occurrences} 处</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if tab === 'grade'}
      {#if !grading}
        <div class="card">
          <div class="card-title"><span class="dot"></span>待复核 / 已复核提交</div>
          <div class="table-wrap scroll">
            <table class="grid">
              <thead><tr><th>学员</th><th>任务</th><th>提交</th><th>状态</th><th class="num">自动分</th><th class="num">最终分</th><th></th></tr></thead>
              <tbody>
                {#each [...db.submissions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)) as s}
                  <tr>
                    <td>{studentById(db, s.studentId)?.name}</td>
                    <td class="muted small">{taskById(db, s.taskId)?.title}</td>
                    <td class="mono muted small">
                      第 {s.attempt} 次 · {fmtDT(s.submittedAt)}
                      {#if s.late}<span class="pill danger">补交</span>{/if}
                    </td>
                    <td>{#if s.status === 'graded'}<span class="pill ok">已复核</span>{:else}<span class="pill warn">待复核</span>{/if}</td>
                    <td class="num">{s.autoScore.toFixed(1)}</td>
                    <td class="num strong">{s.finalScore ?? '—'}</td>
                    <td><button class="small" onclick={() => openGrading(s.id)}>{s.status === 'graded' ? '查看' : '复核'}</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else}
        <div class="card grading-card fade-in">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="card-title" style="margin-bottom:4px">
                <span class="dot"></span>复核 · {gradingStudent?.name} · {gradingTask?.title}
                {#if grading.late}<span class="pill warn">补交</span>{/if}
              </div>
              <span class="muted small">第 {grading.attempt} 次提交 · {fmtDT(grading.submittedAt)} · 自动分 {grading.autoScore.toFixed(1)}</span>
            </div>
            <button class="small ghost" onclick={() => (gradingId = null)}>← 返回列表</button>
          </div>

          <div class="grade-grid">
            <div class="col" style="gap:10px">
              <ProfileEditor
                bind:points={gPoints}
                task={gradingTask}
                offsetMM={gOffset}
                bind:metrics={gMetrics}
                mode="review"
                showReference
                showComb
                showSeam
                deviation={grading.evaluation}
                height={360}
              />
              <div class="auto-summary">
                {#each [['轮廓', grading.evaluation.breakdown.contour, 60], ['平滑', grading.evaluation.breakdown.smooth, 20], ['缝份', grading.evaluation.breakdown.seam, 10], ['压力', grading.evaluation.breakdown.pressure, 10]] as [k, v, max]}
                  <div class="as"><span class="muted small">{k}</span><b class="mono">{v.toFixed(1)}</b><span class="muted small">/{max}</span></div>
                {/each}
                <div class="spacer"></div>
                <div class="as"><span class="muted small">RMS</span><b class="mono">{grading.evaluation.rms.toFixed(2)} mm</b></div>
                <div class="as"><span class="muted small">超 5mm</span><b class="mono" style="color:var(--danger)">{grading.evaluation.deviationSegments.length} 段</b></div>
                <div class="as"><span class="muted small">压力</span><b class="mono">{grading.evaluation.pressure.mean.toFixed(1)}</b></div>
              </div>
            </div>

            <div class="col grade-panel">
              <div class="card-title" style="margin-bottom:8px">追加扣分与评语</div>
              <div class="kv">
                <span class="k">自动分</span><span class="v">{grading.autoScore.toFixed(1)}</span>
              </div>
              <label class="field">
                <span class="muted small">教师扣分（0–100）</span>
                <input class="mono" type="number" min="0" max="100" step="0.5" bind:value={deduction} placeholder="0" />
              </label>
              <div class="quick">
                {#each [0, 2, 4, 6, 8, 10] as d}
                  <button class="small" class:near={deduction === String(d)} onclick={() => (deduction = String(d))}>{d === 0 ? '不扣' : `-${d}`}</button>
                {/each}
              </div>
              <label class="field">
                <span class="muted small">评语（学员可见）</span>
                <textarea rows="5" bind:value={comment} placeholder="指出具体区段与改进方向，例如：200–240 mm 区段偏松 6 mm，压力不足…"></textarea>
              </label>
              <div class="final-line">
                <span class="muted small">最终成绩</span>
                <b class="mono">{round(Math.max(0, grading.autoScore - (Number(deduction) || 0)), 1)}</b>
              </div>
              <div class="row" style="margin-top:10px">
                <button class="primary" onclick={() => saveGrade(false)}>保存复核</button>
                {#if grading.status === 'graded'}
                  <button class="small danger" onclick={() => saveGrade(true)}>撤销复核</button>
                {/if}
              </div>
              {#if grading.status === 'graded'}
                <p class="hint" style="margin-top:8px">已于 {fmtDT(grading.gradedAt)} 复核，扣 {grading.teacherDeduction} 分。</p>
              {/if}

              {#if grading.evaluation.deviationSegments.length}
                <hr class="sep" />
                <span class="muted small">偏差超限区段（可据此写评语）</span>
                <div class="segtags">
                  {#each grading.evaluation.deviationSegments as s}
                    <button class="segtag" onclick={() => (comment = (comment ? comment + '；' : '') + `${s.startMM}–${s.endMM} mm 区段偏差 ${s.maxAbs.toFixed(1)} mm（${s.signed >= 0 ? '偏外' : '偏内'}）`)}>
                      {s.startMM}–{s.endMM}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    {/if}

    {#if tab === 'errors'}
      <div class="card">
        <div class="card-title"><span class="dot" style="background:var(--danger)"></span>常见错误统计 · 按学员最近一次作答</div>
        <div class="table-wrap">
          <table class="grid">
            <thead><tr><th>错误类型</th><th class="num">涉及学员</th><th class="num">出现次数</th><th>涉及学员名单</th></tr></thead>
            <tbody>
              {#each globalStats as s}
                <tr>
                  <td><span class="dotmark" style="background:{errTone(s.type)}"></span>{s.label}</td>
                  <td class="num strong">{s.studentCount} / {db.students.length}</td>
                  <td class="num">{s.occurrences}</td>
                  <td class="muted small">{s.students.map((id) => studentById(db, id)?.name).join('、')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot"></span>学员错误画像</div>
        <div class="profile-grid">
          {#each db.students as st}
            <div class="prof">
              <div class="row" style="gap:7px"><div class="ava-mini">{st.avatar}</div><b>{st.name}</b></div>
              <div class="col" style="gap:4px;margin-top:6px">
                {#each errorStats(db, null) as s}
                  {#if s.students.includes(st.id)}
                    <div class="mini-err"><span class="dotmark" style="background:{errTone(s.type)}"></span>{s.label}</div>
                  {/if}
                {/each}
                {#if !errorStats(db, null).some((s) => s.students.includes(st.id))}
                  <span class="muted small">暂无</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if tab === 'tasks'}
      {#if creatingTask}
        <TaskForm
          {db}
          onDone={(t) => { creatingTask = false; taskId = t.id; db.session.teacherTaskId = t.id; onRefresh(); onToast(`任务「${t.title}」已发布`); tab = 'progress'; }}
          onCancel={() => (creatingTask = false)}
        />
      {:else}
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="card-title" style="margin-bottom:4px"><span class="dot" style="background:var(--accent-2)"></span>现行任务</div>
              <p class="hint" style="margin:0">任务含测量表、瘢痕示意、压力档位与评分参数，发布后学员端立即可见。</p>
            </div>
            <button class="small primary" onclick={() => (creatingTask = true)}>＋ 新建任务</button>
          </div>
          <div class="task-list">
            {#each db.tasks as t}
              <button class="task-item" class:on={t.id === taskId} onclick={() => { taskId = t.id; db.session.teacherTaskId = t.id; onRefresh(); }}>
                <div class="col" style="gap:2px;align-items:flex-start">
                  <b>{t.title}</b>
                  <span class="muted small">{t.id} · {t.measurements.length} 个测量点 · {t.scars.length} 处瘢痕</span>
                </div>
                <div class="row" style="gap:5px">
                  <span class="pill accent">{t.fabric.name}</span>
                  <span class="pill violet">{t.pressureTier.min}–{t.pressureTier.max} mmHg</span>
                  <span class="pill {new Date(t.deadline) < new Date() ? 'danger' : 'ok'}">{fmtDT(t.deadline)}</span>
                </div>
              </button>
            {/each}
          </div>
        </div>

      <div class="card">
        <div class="card-title"><span class="dot"></span>任务截止时间设置</div>
        <div class="deadline-row">
          <div class="col" style="gap:4px">
            <b>{task.title}</b>
            <span class="muted small">{task.id} · {task.limb}</span>
          </div>
          <div class="spacer"></div>
          <input type="datetime-local" class="mono" bind:value={deadlineDraft} />
          <button class="small primary" onclick={commitDeadline}>保存截止时间</button>
        </div>
        <p class="hint">截止时间之后的提交会自动标记为「补交」，成绩单中保留标记但不影响自动评分。</p>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot" style="background:var(--violet)"></span>任务参数（考核标准）</div>
        <div class="param-grid">
          <label class="field"><span class="muted small">曲率突变阈值 |dκ/ds|</span>
            <input class="mono" type="number" step="0.0001" value={task.curvatureThreshold}
              onchange={(e) => { updateTask(db, task.id, { curvatureThreshold: +e.currentTarget.value }); onRefresh(); onToast('阈值已更新，自动分已重算'); }} />
          </label>
          <label class="field"><span class="muted small">压力档位下限 mmHg</span>
            <input class="mono" type="number" value={task.pressureTier.min}
              onchange={(e) => { updateTask(db, task.id, { pressureTier: { ...task.pressureTier, min: +e.currentTarget.value } }); onRefresh(); }} />
          </label>
          <label class="field"><span class="muted small">压力档位上限 mmHg</span>
            <input class="mono" type="number" value={task.pressureTier.max}
              onchange={(e) => { updateTask(db, task.id, { pressureTier: { ...task.pressureTier, max: +e.currentTarget.value } }); onRefresh(); }} />
          </label>
          <div class="field"><span class="muted small">推荐缝份（弹性换算）</span>
            <b class="mono">{recommendedOffset(task.fabric)} mm</b>
          </div>
        </div>
        <p class="hint">参数修改后，未复核提交的自动分立即重算；已复核成绩保持不变。</p>
      </div>
      {/if}
    {/if}

    {#if tab === 'gradebook'}
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:10px">
          <div class="card-title" style="margin:0"><span class="dot"></span>成绩单 · 全班留档</div>
          <div class="row">
            <button class="small" onclick={() => exportGradebookCSV(db, { title: '成绩单 · 全班' })}>导出 CSV（Excel）</button>
            <button class="small ghost" onclick={() => window.print()}>打印</button>
          </div>
        </div>

        <div class="table-wrap scroll">
          <table class="grid">
            <thead>
              <tr>
                <th>学员</th><th>学号</th>
                {#each db.tasks as t}
                  <th class="num">{t.limb}<br /><span class="muted tiny">{t.pressureTier.label}</span></th>
                {/each}
                <th class="num">平均</th><th class="num">补交</th>
              </tr>
            </thead>
            <tbody>
              {#each db.students as st}
                {@const subs = db.submissions.filter((s) => s.studentId === st.id)}
                {@const scored = subs.map((s) => s.finalScore ?? s.autoScore)}
                <tr>
                  <td>
                    <div class="row" style="gap:7px">
                      <div class="ava-mini">{st.avatar}</div>
                      <span>{st.name}</span>
                    </div>
                  </td>
                  <td class="mono muted">{st.id}</td>
                  {#each db.tasks as t}
                    {@const list = subs.filter((s) => s.taskId === t.id).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))}
                    {@const last = list[0]}
                    <td class="num">
                      {#if !last}
                        <span class="muted">—</span>
                      {:else}
                        <span class="mono" class:strong={!!last.finalScore}>{last.finalScore ?? last.autoScore.toFixed(1)}</span>
                        {#if last.late}<span class="tiny warn-dot" title="补交">补</span>{/if}
                        {#if list.length > 1}<span class="tiny muted">×{list.length}</span>{/if}
                      {/if}
                    </td>
                  {/each}
                  <td class="num strong">{scored.length ? round(scored.reduce((a, b) => a + b, 0) / scored.length, 1) : '—'}</td>
                  <td class="num" style="color:{subs.filter((s) => s.late).length ? 'var(--danger)' : 'inherit'}">
                    {subs.filter((s) => s.late).length || '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="hint">成绩单按「每位学员 × 每个任务」显示最近一次成绩，角标为作答次数；补交标记不改变分数计算规则。</p>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot" style="background:var(--violet)"></span>全部提交明细（含重做历史）</div>
        <div class="table-wrap scroll" style="max-height:420px">
          <table class="grid">
            <thead>
              <tr><th>学员</th><th>任务</th><th>次数</th><th>提交时间</th><th>补交</th><th class="num">自动</th><th class="num">扣分</th><th class="num">最终</th><th>评语</th></tr>
            </thead>
            <tbody>
              {#each [...db.submissions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)) as s}
                <tr>
                  <td>{studentById(db, s.studentId)?.name}</td>
                  <td class="muted small">{taskById(db, s.taskId)?.title}</td>
                  <td class="mono">#{s.attempt}</td>
                  <td class="mono muted small">{fmtDT(s.submittedAt)}</td>
                  <td>{#if s.late}<span class="pill danger">补交</span>{:else}<span class="muted tiny">按时</span>{/if}</td>
                  <td class="num">{s.autoScore.toFixed(1)}</td>
                  <td class="num">{s.teacherDeduction ?? '—'}</td>
                  <td class="num strong">{s.finalScore ?? '—'}</td>
                  <td class="muted small" style="max-width:220px">{s.teacherComment || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .main-wide { flex: 1; min-width: 0; padding: 14px 18px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .topbar {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding-bottom: 10px; border-bottom: 1px solid var(--line-soft);
  }
  .charline { display: flex; align-items: center; gap: 9px; }
  .avatar {
    width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
    font-weight: 700; font-size: 13px; color: #04211f;
    background: linear-gradient(145deg, #4ee0d2, #2196a0);
  }
  .avatar.t { background: linear-gradient(145deg, #b9a4ff, #6d54c9); color: #160b33; }
  .taskbar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; background: var(--panel); border: 1px solid var(--line-soft); border-radius: 10px;
  }
  .taskbar select { min-width: 260px; }

  .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
  .kpi {
    background: linear-gradient(180deg, rgba(22,34,51,.85), rgba(15,24,37,.85));
    border: 1px solid var(--line-soft); border-radius: 10px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .kpi b { font-size: 21px; font-weight: 650; }

  .search { width: 200px; font-size: 12px; }
  .table-wrap { overflow-x: auto; }
  table.grid .strong { font-weight: 650; }
  .ava-mini {
    width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
    font-size: 11px; font-weight: 650; background: #1c2b40; color: var(--text-2);
  }
  .tiny { font-size: 10px; }
  .warn-dot { color: var(--danger); margin-left: 3px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 1200px) { .two-col { grid-template-columns: 1fr; } .kpi-row { grid-template-columns: repeat(3, 1fr); } }

  .attn-list { display: flex; flex-direction: column; gap: 6px; }
  .attn { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--line-soft); }
  .attn:last-child { border-bottom: 0; }

  .errbars { display: flex; flex-direction: column; gap: 9px; }
  .errbar { display: grid; grid-template-columns: 150px 1fr auto; gap: 10px; align-items: center; }
  .errbar .lbl { font-size: 12px; color: var(--text-2); }
  .errbar .track { height: 7px; background: #0b1420; border-radius: 999px; overflow: hidden; }
  .errbar .b { height: 100%; border-radius: 999px; }

  .grading-card { display: flex; flex-direction: column; gap: 12px; }
  .grade-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, .85fr); gap: 14px; }
  @media (max-width: 1150px) { .grade-grid { grid-template-columns: 1fr; } }
  .grade-panel {
    background: rgba(11,20,32,.55); border: 1px solid var(--line-soft);
    border-radius: 10px; padding: 12px;
  }
  .field { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
  .field input, .field textarea { width: 100%; }
  .quick { display: flex; gap: 5px; margin-top: 7px; flex-wrap: wrap; }
  .quick button.near { border-color: var(--accent); color: var(--accent); }
  .final-line {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line-soft);
  }
  .final-line b { font-size: 24px; color: var(--accent); }
  .segtags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .segtag {
    font-size: 10.5px; padding: 2px 7px; border-radius: 5px;
    background: rgba(255,107,107,.1); border-color: rgba(255,107,107,.3); color: #ffb3b3;
    font-family: var(--mono);
  }
  .auto-summary { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; padding: 6px 2px; }
  .as { display: flex; align-items: baseline; gap: 3px; }
  .as b { font-size: 13px; }

  .deadline-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .param-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 1000px) { .param-grid { grid-template-columns: repeat(2, 1fr); } }
  .param-grid .field { margin-top: 0; }

  .dotmark { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; vertical-align: 1px; }
  .profile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 10px; }
  .prof { background: rgba(11,20,32,.5); border: 1px solid var(--line-soft); border-radius: 9px; padding: 9px 11px; }
  .mini-err { font-size: 11.5px; color: var(--text-2); }

  .task-list { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
  .task-item {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    width: 100%; text-align: left; padding: 9px 12px; border-radius: 9px;
    background: rgba(11,20,32,.55); border: 1px solid var(--line-soft);
  }
  .task-item.on { border-color: rgba(70,211,197,.5); background: rgba(70,211,197,.07); }
  .task-item b { font-size: 12.5px; font-weight: 620; }
</style>
