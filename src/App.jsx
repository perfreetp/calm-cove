import { A } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { currentActor, setActor } from './lib/api.js';

const ROLES = [
  { name: '主管 周敏', role: '主管 · 审核' },
  { name: '制作员 陈昊', role: '制作员' },
  { name: '制作员 李雨桐', role: '制作员' },
  { name: '制作员 王铎', role: '制作员' },
  { name: '客户端', role: '委托方' },
];

export default function App(props) {
  const [actor, setActorState] = createSignal(currentActor());

  const changeActor = (e) => {
    const v = e.currentTarget.value;
    setActor(v);
    setActorState(v);
  };

  const roleOf = () => ROLES.find((r) => r.name === actor())?.role || '访客';
  const initials = () => (actor().includes('周敏') ? 'ZM'
    : actor().includes('陈昊') ? 'CH'
      : actor().includes('李雨桐') ? 'LY'
        : actor().includes('王铎') ? 'WD' : 'CL');

  return (
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">隧</div>
          <div>
            隧道机电图档平台
            <small>通风系统图档制作与交付</small>
          </div>
        </div>
        <nav>
          <A href="/" end activeClass="active">项目看板</A>
        </nav>
        <div class="spacer" />
        <div class="user-chip">
          <div class="avatar">{initials()}</div>
          <div class="meta">
            <b>{actor()}</b>
            <span>{roleOf()}</span>
          </div>
          <select
            aria-label="切换操作身份"
            style={{ 'max-width': '112px', background: 'transparent', border: '0', color: '#7d93a8' }}
            value={actor()}
            onInput={changeActor}
          >
            {ROLES.map((r) => <option value={r.name}>{r.name}</option>)}
          </select>
        </div>
      </header>
      <main>{props.children}</main>
    </div>
  );
}
