<script>
  import StudentView from './views/StudentView.svelte';
  import TeacherView from './views/TeacherView.svelte';
  import { loadDb, saveDb, resetDb, setSession } from './lib/store.js';
  import { offscreenAvailable } from './lib/offscreen.js';

  let db = $state(loadDb());
  let role = $state(db.session.role ?? 'student');
  let studentId = $state(db.session.studentId ?? db.students[0].id);
  let toast = $state(null);
  let toastTimer = null;
  let showReset = $state(false);

  function refresh() {
    db = { ...db };
    saveDb(db);
  }

  function onToast(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 2400);
  }

  function switchRole(next) {
    role = next;
    db.session.role = next;
    db.session.studentId = studentId;
    saveDb(db);
  }

  function onStudentPick(id) {
    studentId = id;
    db.session.studentId = id;
    db = { ...db };
    saveDb(db);
  }

  function resetAll() {
    db = resetDb();
    role = db.session.role;
    studentId = db.session.studentId;
    showReset = false;
    onToast('演示数据已重置');
  }

  const oka = offscreenAvailable();
</script>

<div class="shell">
  <header class="appbar">
    <div class="brand">
      <div class="logo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
          <path d="M3 17c3.5-1 5-9 9-9s5.5 8 9 9" />
          <circle cx="7" cy="14" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="17" cy="14" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div class="col" style="gap:0">
        <b>压力衣曲面建模与考核</b>
        <span class="muted tiny">Burn Garment Surface Studio · 康复治疗师培训</span>
      </div>
    </div>

    <div class="spacer"></div>

    <div class="role-switch seg">
      <button class={role === 'student' ? 'on' : ''} onclick={() => switchRole('student')}>学员端</button>
      <button class={role === 'teacher' ? 'on' : ''} onclick={() => switchRole('teacher')}>教师端</button>
    </div>

    {#if role === 'student'}
      <label class="picker">
        <span class="muted tiny">以学员身份查看</span>
        <select value={studentId} onchange={(e) => onStudentPick(e.currentTarget.value)}>
          {#each db.students as s}
            <option value={s.id}>{s.name} · {s.id}</option>
          {/each}
        </select>
      </label>
    {/if}

    <button class="small ghost" onclick={() => (showReset = true)}>重置数据</button>
    <span class="pill {oka ? 'ok' : 'warn'}" title="所有画布均通过 OffscreenCanvas 离屏渲染">
      {oka ? 'OffscreenCanvas 已启用' : '离屏回退模式'}
    </span>
  </header>

  <div class="content">
    {#if role === 'student'}
      {#key studentId + (db.session.taskId ?? '')}
        <StudentView {db} {studentId} onRefresh={refresh} onToast={onToast} />
      {/key}
    {:else}
      <TeacherView {db} onRefresh={refresh} onToast={onToast} />
    {/if}
  </div>

  {#if toast}
    <div class="toast fade-in">{toast}</div>
  {/if}

  {#if showReset}
    <div class="modal-bg" onclick={() => (showReset = false)} role="presentation">
      <div class="modal card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>重置演示数据？</h3>
        <p class="dim">将清除本地所有提交、评分与评语，恢复为初始种子数据（7 名学员、3 个任务、10 份提交）。</p>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button onclick={() => (showReset = false)}>取消</button>
          <button class="danger" onclick={resetAll}>确认重置</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .shell { display: flex; flex-direction: column; height: 100%; }
  .appbar {
    display: flex; align-items: center; gap: 14px;
    padding: 9px 16px; border-bottom: 1px solid var(--line-soft);
    background: rgba(9, 15, 24, .82); backdrop-filter: blur(10px);
    flex: 0 0 auto; z-index: 5;
  }
  .brand { display: flex; align-items: center; gap: 9px; }
  .brand b { font-size: 13.5px; letter-spacing: .01em; }
  .tiny { font-size: 10.5px; }
  .logo {
    width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center;
    background: linear-gradient(145deg, rgba(78,224,210,.22), rgba(42,167,255,.12));
    border: 1px solid rgba(78,224,210,.35); color: var(--accent);
  }
  .picker { display: flex; flex-direction: column; gap: 1px; }
  .picker select { padding: 3px 8px; font-size: 11.5px; }

  .content { flex: 1; min-height: 0; overflow: hidden; }

  .toast {
    position: fixed; bottom: 20px; right: 22px; max-width: 380px;
    background: rgba(18, 30, 46, .96); border: 1px solid var(--line);
    color: var(--text); padding: 9px 18px; border-radius: 9px;
    box-shadow: 0 10px 34px rgba(0,0,0,.5); font-size: 12.5px; z-index: 50;
    backdrop-filter: blur(8px);
  }

  .modal-bg {
    position: fixed; inset: 0; background: rgba(4, 8, 14, .68);
    display: grid; place-items: center; z-index: 60; backdrop-filter: blur(3px);
  }
  .modal { width: 400px; max-width: 90vw; }
  .modal h3 { margin: 0 0 8px; font-size: 15px; }
  .modal p { margin: 0; font-size: 12.5px; line-height: 1.65; }
</style>
