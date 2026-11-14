import { For, Show } from "solid-js";
import { getSubmissionByTask, updateTask, useDb } from "../store/db";
import { currentUser } from "../store/session";
import { formatStake } from "../core/stake";
import type { TaskStatus } from "../types";

const STATUS_TEXT: Record<TaskStatus, string> = {
  pending: "待领取",
  claimed: "进行中",
  submitted: "已提交",
  reviewed: "已复核",
};
const STATUS_CLS: Record<TaskStatus, string> = {
  pending: "tag",
  claimed: "tag warn",
  submitted: "tag ok",
  reviewed: "tag ok",
};

export default function Tasks() {
  const db = useDb();
  const me = currentUser()!;
  const isTeacher = me.role === "teacher";

  const tasks = () =>
    (isTeacher ? db().tasks : db().tasks.filter((t) => t.studentId === me.id))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const qOf = (qid: string) => db().questions.find((q) => q.id === qid);
  const uOf = (uid: string) => db().users.find((u) => u.id === uid);

  function claim(taskId: string) {
    updateTask(taskId, { status: "claimed" });
    location.hash = `#/designer/${taskId}`;
  }

  return (
    <div class="card">
      <h2>{isTeacher ? "全部任务" : "我的任务"}</h2>
      <table>
        <thead>
          <tr>
            <th>题目</th>
            <Show when={isTeacher}><th>学员</th></Show>
            <th>桩号范围</th><th>设计要求</th><th>截止</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <For each={tasks()}>
            {(t) => {
              const q = () => qOf(t.questionId);
              const sub = () => getSubmissionByTask(t.id);
              return (
                <tr>
                  <td>{q()?.title ?? "(题目已删除)"}</td>
                  <Show when={isTeacher}><td>{uOf(t.studentId)?.name}</td></Show>
                  <td>{q() && `${formatStake(q()!.stakeStart)}~${formatStake(q()!.stakeEnd)}`}</td>
                  <td class="muted">
                    {q() && `≤${q()!.maxHeight}m · 间距${q()!.colSpacingMin}~${q()!.colSpacingMax}m · 透明≥${(q()!.transparentRatioMin * 100).toFixed(0)}% · ≥${q()!.noiseReqDb}dB`}
                  </td>
                  <td>{t.deadline}</td>
                  <td><span class={STATUS_CLS[t.status]}>{STATUS_TEXT[t.status]}</span></td>
                  <td>
                    <Show when={!isTeacher && (t.status === "pending" || t.status === "claimed")}>
                      <button class="sm primary" onClick={() => claim(t.id)}>
                        {t.status === "pending" ? "领取并开始设计" : "继续设计"}
                      </button>
                    </Show>
                    <Show when={sub()}>
                      <button class="sm" onClick={() => (location.hash = `#/submission/${sub()!.id}`)}>查看提交</button>
                    </Show>
                    <Show when={isTeacher && t.status === "submitted" && sub()}>
                      <button class="sm primary" onClick={() => (location.hash = `#/review/${sub()!.id}`)}>复核评分</button>
                    </Show>
                  </td>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <Show when={tasks().length === 0}><p class="muted">暂无任务</p></Show>
    </div>
  );
}
