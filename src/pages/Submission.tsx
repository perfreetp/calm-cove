import { createSignal, For, Show } from "solid-js";
import { useDb } from "../store/db";
import { currentUser } from "../store/session";
import ElevationCanvas from "../components/ElevationCanvas";
import { formatStake } from "../core/stake";

export default function SubmissionView(props: { id: string }) {
  const db = useDb();
  const me = currentUser()!;
  const sub = () => db().submissions.find((s) => s.id === props.id);
  const q = () => db().questions.find((x) => x.id === sub()?.questionId);
  const student = () => db().users.find((u) => u.id === sub()?.studentId);
  const [selected, setSelected] = createSignal<number | null>(null);

  return (
    <Show when={sub() && q()} fallback={<div class="card">提交记录不存在</div>}>
      <div class="card">
        <div class="row">
          <h2 style={{ margin: 0 }}>提交详情 — {q()!.title}</h2>
          <div class="spacer" />
          <span class="muted">{student()?.name} · 提交于 {new Date(sub()!.submittedAt).toLocaleString()}</span>
        </div>
        <div class="row" style={{ "margin-top": "8px" }}>
          <span class="score-pill">合规 {sub()!.complianceScore}</span>
          <span class="score-pill">参数 {sub()!.paramScore}</span>
          <span class="score-pill">主观 {sub()!.teacherScore ?? "待评"}</span>
          <span class="score-pill" style="background:#0f2a5c;color:#fff">
            总成绩 {sub()!.totalScore ?? "待合成"}
          </span>
        </div>
      </div>

      <div class="card">
        <h3>立面图({formatStake(q()!.stakeStart)} ~ {formatStake(q()!.stakeEnd)}, 共{sub()!.spans.length}跨)</h3>
        <ElevationCanvas spans={sub()!.spans} violations={sub()!.violations} selectedSpan={selected()} onSelectSpan={setSelected} height={380} />
      </div>

      <div class="layout-2">
        <div>
          <div class="card">
            <h3>合规检查结果</h3>
            <Show when={sub()!.violations.length === 0}>
              <div class="ok-box">✓ 全部检查通过</div>
            </Show>
            <For each={sub()!.violations}>
              {(v) => <div class="viol-item"><strong>[{v.examPoint}]</strong> {v.message}</div>}
            </For>
          </div>
          <div class="card">
            <h3>修改历史</h3>
            <For each={[...sub()!.history].reverse()}>
              {(h) => <div class="muted" style={{ "margin-bottom": "4px" }}><span class="tag">{h.action}</span> {h.detail} · {h.time}</div>}
            </For>
          </div>
        </div>
        <div>
          <div class="card">
            <h3>生成参数</h3>
            <table>
              <tbody>
                <tr><td class="muted">立柱间距</td><td>{sub()!.params.colSpacing} m</td></tr>
                <tr><td class="muted">基准屏高</td><td>{sub()!.params.baseHeight} m</td></tr>
                <tr><td class="muted">目标透明比例</td><td>{(sub()!.params.transparentRatio * 100).toFixed(0)}%</td></tr>
                <tr><td class="muted">吸声板高</td><td>{sub()!.params.panelHeight} m</td></tr>
                <tr><td class="muted">弧形矢高</td><td>{sub()!.params.arcRise} m</td></tr>
                <tr><td class="muted">种子</td><td>{sub()!.params.seed}</td></tr>
                <tr><td class="muted">手动调整</td><td>{sub()!.spans.filter((s) => s.edited).length} 跨</td></tr>
              </tbody>
            </table>
          </div>
          <Show when={sub()!.teacherComment}>
            <div class="card">
              <h3>教师评语</h3>
              <p>{sub()!.teacherComment}</p>
            </div>
          </Show>
          <Show when={me.role === "teacher" && sub()!.teacherScore === null}>
            <button class="primary" style={{ width: "100%" }} onClick={() => (location.hash = `#/review/${sub()!.id}`)}>
              前往复核评分
            </button>
          </Show>
        </div>
      </div>
    </Show>
  );
}
