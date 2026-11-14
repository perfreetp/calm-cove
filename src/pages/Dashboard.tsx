import { createMemo, createSignal, For, Show } from "solid-js";
import { useDb } from "../store/db";
import { EXAM_POINTS } from "../types";

/** 班级看板: 按考点汇总错题(违规), 支持按班级筛选 */
export default function Dashboard() {
  const db = useDb();
  const classes = createMemo(() => [...new Set(db().users.filter((u) => u.role === "student").map((u) => u.className))]);
  const [cls, setCls] = createSignal<string>("全部");

  const subs = createMemo(() =>
    db().submissions.filter((s) => {
      if (cls() === "全部") return true;
      return db().users.find((u) => u.id === s.studentId)?.className === cls();
    }),
  );

  // 按考点统计违规次数
  const byPoint = createMemo(() => {
    const m = new Map<string, number>();
    for (const p of EXAM_POINTS) m.set(p, 0);
    for (const s of subs())
      for (const v of s.violations) m.set(v.examPoint, (m.get(v.examPoint) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });
  const maxCount = createMemo(() => Math.max(1, ...byPoint().map(([, n]) => n)));

  // 学员维度
  const byStudent = createMemo(() => {
    const m = new Map<string, { name: string; cls: string; errors: number; subs: number; avg: number[] }>();
    for (const s of subs()) {
      const u = db().users.find((x) => x.id === s.studentId);
      if (!u) continue;
      const cur = m.get(u.id) ?? { name: u.name, cls: u.className, errors: 0, subs: 0, avg: [] };
      cur.errors += s.violations.length;
      cur.subs += 1;
      if (s.totalScore !== null) cur.avg.push(s.totalScore);
      m.set(u.id, cur);
    }
    return [...m.values()].sort((a, b) => b.errors - a.errors);
  });

  return (
    <>
      <div class="card">
        <div class="row">
          <h2 style={{ margin: 0 }}>班级看板 — 错题按考点汇总</h2>
          <div class="spacer" />
          <select value={cls()} onChange={(e) => setCls(e.currentTarget.value)}>
            <option value="全部">全部班级</option>
            <For each={classes()}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </div>
      </div>

      <div class="layout-2">
        <div class="card">
          <h3>考点错误分布(共 {subs().reduce((a, s) => a + s.violations.length, 0)} 处)</h3>
          <For each={byPoint()}>
            {([p, n]) => (
              <div class="bar-row">
                <span class="lbl">{p}</span>
                <div class="bar"><div style={{ width: `${(n / maxCount()) * 100}%`, opacity: n ? 1 : 0.15 }} /></div>
                <span class="num">{n}</span>
              </div>
            )}
          </For>
          <Show when={subs().length === 0}><p class="muted">暂无提交数据</p></Show>
        </div>

        <div class="card">
          <h3>学员情况</h3>
          <table>
            <thead><tr><th>学员</th><th>班级</th><th>提交</th><th>错误数</th><th>平均总成绩</th></tr></thead>
            <tbody>
              <For each={byStudent()}>
                {(r) => (
                  <tr>
                    <td>{r.name}</td>
                    <td>{r.cls}</td>
                    <td>{r.subs}</td>
                    <td>{r.errors > 0 ? <span class="tag bad">{r.errors}</span> : <span class="tag ok">0</span>}</td>
                    <td>{r.avg.length ? Math.round(r.avg.reduce((a, b) => a + b, 0) / r.avg.length) : "—"}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
