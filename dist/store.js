import { seedState } from './seed.js';
const KEY = 'orienteering-anim-qc-v1';
let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function load() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export let state = load() ?? seedState(uid);
const listeners = new Set();
let saveTimer = null;
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function update(fn, opts = {}) {
    fn(state);
    if (saveTimer)
        clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        }
        catch (e) {
            console.warn('保存失败', e);
        }
    }, 250);
    if (!opts.silent)
        listeners.forEach(f => f());
}
export function resetState() {
    localStorage.removeItem(KEY);
    location.reload();
}
//# sourceMappingURL=store.js.map