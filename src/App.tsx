import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { currentUser, logout } from "./store/session";
import Login from "./pages/Login";
import Bank from "./pages/Bank";
import Tasks from "./pages/Tasks";
import Designer from "./pages/Designer";
import SubmissionView from "./pages/Submission";
import Review from "./pages/Review";
import Grades from "./pages/Grades";
import Dashboard from "./pages/Dashboard";

function parseHash(): { name: string; param: string | null } {
  const h = location.hash.replace(/^#\/?/, "");
  const [name, param] = h.split("/");
  return { name: name || "tasks", param: param ?? null };
}

export default function App() {
  const [route, setRoute] = createSignal(parseHash());
  const onHash = () => setRoute(parseHash());
  onMount(() => window.addEventListener("hashchange", onHash));
  onCleanup(() => window.removeEventListener("hashchange", onHash));

  const nav = (to: string) => (location.hash = to);

  return (
    <>
      <Show when={currentUser()} fallback={<Login />}>
        {(u) => (
          <>
            <header class="topbar">
              <div class="brand">🛣 声屏障立面设计实训平台</div>
              <nav>
                <a href="#/tasks" class={route().name === "tasks" ? "active" : ""}>任务</a>
                <Show when={u().role === "teacher"}>
                  <a href="#/bank" class={route().name === "bank" ? "active" : ""}>题库</a>
                </Show>
                <a href="#/grades" class={route().name === "grades" ? "active" : ""}>成绩</a>
                <Show when={u().role === "teacher"}>
                  <a href="#/dashboard" class={route().name === "dashboard" ? "active" : ""}>班级看板</a>
                </Show>
              </nav>
              <div class="who">
                {u().name} · {u().role === "teacher" ? "教师" : "学员"} · {u().className}
                <button class="sm" onClick={() => { logout(); nav("/login"); }}>退出</button>
              </div>
            </header>
            <main>
              {route().name === "tasks" && <Tasks />}
              {route().name === "bank" && <Bank />}
              {route().name === "designer" && <Designer taskId={route().param!} />}
              {route().name === "submission" && <SubmissionView id={route().param!} />}
              {route().name === "review" && <Review id={route().param!} />}
              {route().name === "grades" && <Grades />}
              {route().name === "dashboard" && <Dashboard />}
            </main>
          </>
        )}
      </Show>
    </>
  );
}
