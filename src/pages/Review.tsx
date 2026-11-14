import { createSignal, For, Show } from "solid-js";
import { updateTask, upsertSubmission, useDb } from "../store/db";
import { totalScore } from "../core/scoring";
import ElevationCanvas from "../components/ElevationCanvas";
import { formatStake } from "../core/stake";
import { MATERIAL_NAMES } from "../types";

export default function Review(props: { id: string }) {
  const db = useDb();
  const sub = () => db().submissions.find((s) => s.id === props.id);
  const q = () => db().questions.find((x) => x.id === sub()?.questionId);
  const student = () => db().users.find((u) => u.id === sub()?.studentId);

  const [selected, setSelected] = createSignal<number | null>(null);
  const [score, setScore] = createSignal<number>(sub()?.teacherScore ?? 80);
  const [comment, setComment] = createSignal(sub()?.teacherComment ?? "");
  const [notes, setNotes] = createSignal<Record<number, string>>({ ...(sub()?.spanNotes ?? {}) });

  const selSpan = () => sub()?.spans.find((s) => s.index === selected()) ?? null;

  function save() {
    const s = sub();
    if (!s) return;
    const total = totalScore(s.complianceScore, s.paramScore, score());
    upsertSubmission({
      ...s,
      teacherScore: score(),
      teacherComment: comment(),
      spanNotes: notes(),
      totalScore: total,
      reviewedAt: new Date().toISOString(),
    });
    updateTask(s.taskId, { status: "reviewed" });
    location.hash = `#/submission/${s.id}`;
  }

  return (
    <Show when={sub() && q()} fallback={<div class="card">提交记录不存在</div>}>
      <div class="card">
        <div class="row">
          <h2 style={{ margin: 0 }}>教师复核 — {student()?.name} · {q()!.title}</h2>
          <div class="spacer" />
          <span class="score-pill">合规 {sub()!.complianceScore}</span>
          <span class="score-pill">参数 {sub()!.paramScore}</span>
        </div>
      </div>

      <div class="card">
        <h3>立面大图(点击跨可逐跨批注)</h3>
        <ElevationCanvas spans={sub()!.spans} violations={sub()!.violations} selectedSpan={selected()} onSelectSpan={setSelected} height={420} />
      </div>

      <div class="layout-2">
        <div class="card">
          <h3>逐跨复核</h3>
          <Show when={selSpan()} fallback={<p class="muted">在上方立面图中点击一跨进行批注</p>}>
            {(sp) => (
              <>
                <p class="muted">
                  第{sp().index + 1}跨 · {formatStake(sp().startStake)}起 · 宽{sp().width.toFixed(2)}m ·
                  高{sp().height.toFixed(2)}m · {MATERIAL_NAMES[sp().material]}
                  {sp().edited && <span class="tag warn" style={{ "margin-left": "6px" }}>手动调整过</span>}
                </p>
                <textarea
                  style={{ width: "100%", "min-height": "70px" }}
                  placeholder={`对第${sp().index + 1}跨的复核意见…`}
                  value={notes()[sp().index] ?? ""}
                  onInput={(e) => setNotes({ ...notes(), [sp().index]: e.currentTarget.value })}
                />
              </>
            )}
          </Show>
          <Show when={Object.keys(notes()).length > 0}>
            <h3>已写批注</h3>
            <For each={Object.entries(notes())}>
              {([idx, text]) => text && <div class="muted">第{+idx + 1}跨: {text}</div>}
            </For>
          </Show>
        </div>

        <div class="card">
          <h3>主观评分与评语</h3>
          <div class="field">
            <label>主观分(0~100): {score()}</label>
            <input type="range" min="0" max="100" style={{ width: "100%" }} value={score()} onInput={(e) => setScore(+e.currentTarget.value)} />
          </div>
          <div class="field">
            <label>评语</label>
            <textarea style={{ width: "100%", "min-height": "90px" }} value={comment()} onInput={(e) => setComment(e.currentTarget.value)}
              placeholder="立面整体协调性、构造处理、工程合理性…" />
          </div>
          <p class="muted">
            合成预览: 合规{sub()!.complianceScore}×40% + 参数{sub()!.paramScore}×30% + 主观{score()}×30%
            = <strong>{Math.round(sub()!.complianceScore * 0.4 + sub()!.paramScore * 0.3 + score() * 0.3)}</strong>
          </p>
          <button class="primary" style={{ width: "100%" }} onClick={save}>保存复核结果</button>
        </div>
      </div>
    </Show>
  );
}
