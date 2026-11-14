// ---------- 会话(当前登录用户) ----------
import { createSignal } from "solid-js";
import type { User } from "../types";

const KEY = "nb-studio-session";

function load(): User | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

const [currentUser, setCurrentUser] = createSignal<User | null>(load());

export function login(u: User) {
  sessionStorage.setItem(KEY, JSON.stringify(u));
  setCurrentUser(u);
}
export function logout() {
  sessionStorage.removeItem(KEY);
  setCurrentUser(null);
}
export { currentUser };
