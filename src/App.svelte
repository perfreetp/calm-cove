<script>
  import TechnicianView from './components/TechnicianView.svelte';
  import ReviewerView from './components/ReviewerView.svelte';
  import DoctorView from './components/DoctorView.svelte';
  import OutsourcerView from './components/OutsourcerView.svelte';

  const ROLES = [
    { key: 'technician', name: '修复科技师' },
    { key: 'reviewer', name: '复核员' },
    { key: 'doctor', name: '医生' },
    { key: 'outsourcer', name: '外协方' }
  ];
  const DOCTORS = ['张医生', '陈医生'];
  let role = 'technician';
  let doctor = DOCTORS[0];
</script>

<div class="app">
  <header>
    <h1>牙列体素建模与打印批次质检系统</h1>
    <nav>
      {#each ROLES as r}
        <button class:active={role === r.key} on:click={() => role = r.key}>{r.name}</button>
      {/each}
      {#if role === 'doctor'}
        <select bind:value={doctor}>
          {#each DOCTORS as d}<option>{d}</option>{/each}
        </select>
      {/if}
    </nav>
  </header>
  <main>
    {#if role === 'technician'}
      <TechnicianView />
    {:else if role === 'reviewer'}
      <ReviewerView />
    {:else if role === 'doctor'}
      <DoctorView {doctor} />
    {:else}
      <OutsourcerView />
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; background: #16181d; color: #dfe3ec; font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; }
  .app { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; background: #1e2129; border-bottom: 1px solid #2c3038; }
  h1 { font-size: 17px; margin: 0; }
  nav { display: flex; gap: 6px; align-items: center; }
  nav button { background: #2a2e38; color: #c8ccd8; border: 1px solid #3a4050; border-radius: 4px; padding: 6px 14px; cursor: pointer; }
  nav button.active { background: #2f6fed; color: #fff; border-color: #2f6fed; }
  select { background: #2a2e38; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 5px 8px; }
  main { flex: 1; overflow: auto; padding: 14px 18px; }
</style>
