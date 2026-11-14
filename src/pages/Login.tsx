import { For } from "solid-js";
import { useDb } from "../store/db";
import { login } from "../store/session";

export default function Login() {
  const db = useDb();
  return (
    <main>
      <div class="login-wrap">
        <div class="card">
          <h2>公路声屏障立面设计与实训考核系统</h2>
          <p class="muted">交通职业院校 · 道路与桥梁工程专业 · 请选择身份登录(演示环境免密)</p>
          <For each={db().users}>
            {(u) => (
              <div class="login-user" onClick={() => { login(u); location.hash = "/tasks"; }}>
                <span>
                  <strong>{u.name}</strong>
                  <span class="muted"> · {u.className}</span>
                </span>
                <span class={`tag ${u.role === "teacher" ? "warn" : ""}`}>
                  {u.role === "teacher" ? "教师" : "学员"}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </main>
  );
}
