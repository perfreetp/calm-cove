import { State } from './types.js';
import { seedState } from './seed.js';

const KEY = 'orienteering-anim-qc-v1';

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch { return null; }
}

export let state: State = load() ?? seedState(uid);

type Listener = () => void;
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(fn: (s: State) => void, opts: { silent?: boolean } = {}): void {
  fn(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('保存失败', e); }
  }, 250);
  if (!opts.silent) listeners.forEach(f => f());
}

export function resetState(): void {
  localStorage.removeItem(KEY);
  location.reload();
}
