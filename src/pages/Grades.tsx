import { For, Show } from "solid-js";
import { useDb } from "../store/db";
import { currentUser } from "../store/session";

export default function Grades() {
  const db = useDb();
  const me = currentUser()!;
  const isTeacher = me.role === "teacher";

  const rows = () =>
    db()
      .submissions.filter((s) => isTeacher || s.studentId === me.id)
      .slice()
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const qOf = (id: string) => db().questions.find((q) => q.id === id);
  const uOf = (id: string) => db().users.find((u) => u.id === id);

  return (
    <div class="card">
      <h2>{isTeacher ? "成绩总览" : "我的成绩"}</h2>
      <table>
        <thead>
          <tr>
            <Show when={isTeacher}><th>学员</th><th>班级</th></Show>
            <th>题目</th><th>合规分</th><th>参数分</th><th>主观分</th><th>总成绩</th><th>提交时间</th><th></th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(s) => (
              <tr>
                <Show when={isTeacher}>
                  <td>{uOf(s.studentId)?.name}</td>
                  <td>{uOf(s.studentId)?.className}</td>
                </Show>
                <td>{qOf(s.questionId)?.title ?? "(题目已删除)"}</td>
                <td>{s.complianceScore}</td>
                <td>{s.paramScore}</td>
                <td>{s.teacherScore ?? "—"}</td>
                <td>
                  {s.totalScore !== null
                    ? <span class="score-pill">{s.totalScore}</span>
                    : <span class="tag warn">待复核</span>}
                </td>
                <td class="muted">{new Date(s.submittedAt).toLocaleString()}</td>
                <td><button class="sm" onClick={() => (location.hash = `#/submission/${s.id}`)}>详情</button></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={rows().length === 0}><p class="muted">暂无成绩记录</p></Show>
    </div>
  );
}
