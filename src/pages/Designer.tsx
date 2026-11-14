import { createMemo, createSignal, For, Show } from "solid-js";
import { getSubmissionByTask, updateTask, upsertSubmission, uid, useDb } from "../store/db";
import { currentUser } from "../store/session";
import { generateSpans, regenerateSpans, overallTransparentRatio, estimateNoiseReduction } from "../core/generate";
import { validateElevation } from "../core/validate";
import { complianceScore, paramScore } from "../core/scoring";
import { formatStake } from "../core/stake";
import ElevationCanvas from "../components/ElevationCanvas";
import { MATERIAL_NAMES, type GenParams, type HistoryEntry, type PanelMaterial, type Span, type Submission } from "../types";

export default function Designer(props: { taskId: string }) {
  const db = useDb();
  const me = currentUser()!;
  const task = () => db().tasks.find((t) => t.id === props.taskId);
  const question = () => db().questions.find((q) => q.id === task()?.questionId);

  // 已有提交则续作
  const existing = getSubmissionByTask(props.taskId);

  const q0 = question();
  const [params, setParams] = createSignal<GenParams>(
    existing?.params ?? {
      colSpacing: q0?.colSpacingStd ?? 2.0,
      baseHeight: q0 ? Math.round(q0.maxHeight * 0.9 * 10) / 10 : 3.5,
      transparentRatio: q0 ? q0.transparentRatioMin + 0.05 : 0.3,
      panelHeight: 0.5,
      arcRise: 0.4,
      seed: q0?.seed ?? 1,
    },
  );
  const [spans, setSpans] = createSignal<Span[]>(existing?.spans ?? []);
  const [history, setHistory] = createSignal<HistoryEntry[]>(existing?.history ?? []);
  const [selected, setSelected] = createSignal<number | null>(null);
  const [seamY, setSeamY] = createSignal(1.0);

  const violations = createMemo(() => (question() ? validateElevation(question()!, spans()) : []));
  const selSpan = createMemo(() => spans().find((s) => s.index === selected()) ?? null);
  const stats = createMemo(() => ({
    ratio: overallTransparentRatio(spans()),
    noise: estimateNoiseReduction(spans()),
    count: spans().length,
  }));

  function log(action: string, detail: string) {
    setHistory([...history(), { time: new Date().toLocaleString(), action, detail }]);
  }

  function generate() {
    const q = question();
    if (!q) return;
    if (spans().some((s) => s.locked)) {
      setSpans(regenerateSpans(q, params(), spans()));
      log("重新生成", "保留锁定跨, 其余跨按当前参数与种子重算");
    } else {
      setSpans(generateSpans(q, params()));
      log("生成", `参数: 间距${params().colSpacing}m 基准高${params().baseHeight}m 透明${(params().transparentRatio * 100).toFixed(0)}% 种子${params().seed}`);
    }
  }

  function editSpan(index: number, patch: Partial<Span>, action: string, detail: string) {
    setSpans(
      spans().map((s) =>
        s.index === index ? { ...s, ...patch, locked: true, edited: true } : s,
      ),
    );
    log(action, `第${index + 1}跨: ${detail}`);
  }

  function unlockSpan(index: number) {
    const q = question();
    if (!q) return;
    const fresh = generateSpans(q, params()).find((f) => f.index === index);
    if (!fresh) return;
    setSpans(spans().map((s) => (s.index === index ? fresh : s)));
    log("解除锁定", `第${index + 1}跨恢复为程序生成结果`);
  }

  function submit() {
    const q = question();
    const t = task();
    if (!q || !t) return;
    if (spans().length === 0) return alert("请先生成立面排布");
    const v = violations();
    const cs = complianceScore(v);
    const ps = paramScore(q, params());
    const sub: Submission = {
      id: existing?.id ?? uid("sub"),
      taskId: t.id,
      questionId: q.id,
      studentId: me.id,
      params: params(),
      spans: spans(),
      violations: v,
      history: history(),
      complianceScore: cs,
      paramScore: ps,
      teacherScore: existing?.teacherScore ?? null,
      teacherComment: existing?.teacherComment ?? "",
      spanNotes: existing?.spanNotes ?? {},
      totalScore: null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
    };
    upsertSubmission(sub);
    updateTask(t.id, { status: "submitted" });
    location.hash = `#/submission/${sub.id}`;
  }

  return (
    <Show when={task() && question()} fallback={<div class="card">任务不存在</div>}>
      <div class="card">
        <div class="row">
          <h2 style={{ margin: 0 }}>设计工作台 — {question()!.title}</h2>
          <div class="spacer" />
          <span class="muted">
            {formatStake(question()!.stakeStart)} ~ {formatStake(question()!.stakeEnd)} ·
            总高≤{question()!.maxHeight}m · 间距{question()!.colSpacingMin}~{question()!.colSpacingMax}m ·
            透明≥{(question()!.transparentRatioMin * 100).toFixed(0)}% · 降噪≥{question()!.noiseReqDb}dB
          </span>
        </div>
      </div>

      <div class="layout-2">
        <div>
          <div class="card">
            <ElevationCanvas
              spans={spans()}
              violations={violations()}
              selectedSpan={selected()}
              onSelectSpan={setSelected}
              height={380}
            />
            <div class="row" style={{ "margin-top": "10px" }}>
              <span class="tag">跨数 {stats().count}</span>
              <span class={`tag ${stats().ratio >= question()!.transparentRatioMin ? "ok" : "bad"}`}>
                透明屏 {(stats().ratio * 100).toFixed(1)}%
              </span>
              <span class={`tag ${stats().noise >= question()!.noiseReqDb ? "ok" : "bad"}`}>
                估算降噪 {stats().noise}dB
              </span>
              <span class="tag warn">锁定 {spans().filter((s) => s.locked).length} 跨</span>
            </div>
          </div>

          <div class="card">
            <h3>实时合规检查</h3>
            <Show when={violations().length === 0 && spans().length > 0}>
              <div class="ok-box">✓ 全部检查通过: 高度、立柱间距、透明屏占比、桩号核算、降噪量均满足要求</div>
            </Show>
            <Show when={spans().length === 0}><p class="muted">尚未生成, 请在右侧填写参数并点击「生成立面」</p></Show>
            <For each={violations()}>
              {(v) => (
                <div class="viol-item">
                  <strong>[{v.examPoint}]</strong> {v.message}
                  <Show when={v.spanIndex !== null}>
                    <button class="sm" style={{ "margin-left": "8px" }} onClick={() => setSelected(v.spanIndex)}>定位</button>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <div class="card">
            <h3>修改历史({history().length})</h3>
            <Show when={history().length === 0}><p class="muted">暂无记录</p></Show>
            <For each={[...history()].reverse()}>
              {(h) => (
                <div class="muted" style={{ "margin-bottom": "4px" }}>
                  <span class="tag">{h.action}</span> {h.detail} <span style={{ color: "#9ca3af" }}>· {h.time}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        <div>
          <div class="card">
            <h3>生成参数</h3>
            <div class="field"><label>立柱间距(m) · 允许 {question()!.colSpacingMin}~{question()!.colSpacingMax}</label>
              <input type="number" step="0.1" value={params().colSpacing} onInput={(e) => setParams({ ...params(), colSpacing: +e.currentTarget.value })} /></div>
            <div class="field"><label>基准屏高(m) · 限值 {question()!.maxHeight}</label>
              <input type="number" step="0.1" value={params().baseHeight} onInput={(e) => setParams({ ...params(), baseHeight: +e.currentTarget.value })} /></div>
            <div class="field"><label>目标透明屏比例 · ≥{question()!.transparentRatioMin}</label>
              <input type="number" step="0.05" value={params().transparentRatio} onInput={(e) => setParams({ ...params(), transparentRatio: +e.currentTarget.value })} /></div>
            <div class="field"><label>单块吸声板高(m)</label>
              <input type="number" step="0.1" value={params().panelHeight} onInput={(e) => setParams({ ...params(), panelHeight: +e.currentTarget.value })} /></div>
            <div class="field"><label>顶部弧形板矢高(m)</label>
              <input type="number" step="0.1" value={params().arcRise} onInput={(e) => setParams({ ...params(), arcRise: +e.currentTarget.value })} /></div>
            <div class="field"><label>随机种子(同参同种子结果一致)</label>
              <input type="number" value={params().seed} onInput={(e) => setParams({ ...params(), seed: +e.currentTarget.value })} /></div>
            <div class="row" style={{ "margin-top": "10px" }}>
              <button class="primary" onClick={generate}>
                {spans().length === 0 ? "生成立面" : "重新生成(保留锁定跨)"}
              </button>
            </div>
          </div>

          <Show when={selSpan()}>
            {(s) => (
              <div class="card">
                <h3>
                  第{s().index + 1}跨 手动调整
                  <Show when={s().locked}><span class="tag warn" style={{ "margin-left": "6px" }}>🔒已锁定</span></Show>
                </h3>
                <div class="field"><label>屏体高度(m) · 当前 {s().height.toFixed(2)}</label>
                  <input type="number" step="0.1" value={s().height}
                    onInput={(e) => editSpan(s().index, { height: +e.currentTarget.value }, "改高度", `高度 → ${e.currentTarget.value}m`)} /></div>
                <div class="field"><label>板材</label>
                  <select value={s().material}
                    onChange={(e) => editSpan(s().index, { material: e.currentTarget.value as PanelMaterial }, "换板材", `板材 → ${MATERIAL_NAMES[e.currentTarget.value as PanelMaterial]}`)}>
                    <For each={Object.entries(MATERIAL_NAMES)}>{([k, n]) => <option value={k}>{n}</option>}</For>
                  </select></div>
                <div class="field"><label>立柱位置微调(m) · 当前 {s().columnOffset.toFixed(2)}</label>
                  <input type="number" step="0.05" min="-0.4" max="0.4" value={s().columnOffset}
                    onInput={(e) => editSpan(s().index, { columnOffset: +e.currentTarget.value }, "调立柱", `立柱偏移 → ${e.currentTarget.value}m`)} /></div>
                <div class="field"><label>插装饰缝 · 距跨底高度(m)</label>
                  <div class="row">
                    <input type="number" step="0.1" style={{ width: "90px" }} value={seamY()} onInput={(e) => setSeamY(+e.currentTarget.value)} />
                    <button class="sm" onClick={() => {
                      if (seamY() > 0 && seamY() < s().height)
                        editSpan(s().index, { seams: [...s().seams, seamY()].sort((a, b) => a - b) }, "插装饰缝", `在 ${seamY()}m 处插入装饰缝`);
                    }}>插入</button>
                  </div>
                  <Show when={s().seams.length > 0}>
                    <div class="muted" style={{ "margin-top": "4px" }}>
                      已有: {s().seams.map((y) => `${y}m`).join(", ")}
                      <button class="sm" style={{ "margin-left": "6px" }}
                        onClick={() => editSpan(s().index, { seams: [] }, "清除装饰缝", "清除全部装饰缝")}>清除</button>
                    </div>
                  </Show>
                </div>
                <Show when={s().locked}>
                  <button class="sm danger" onClick={() => unlockSpan(s().index)}>解除锁定并恢复生成值</button>
                </Show>
              </div>
            )}
          </Show>

          <div class="card">
            <button class="primary" style={{ width: "100%" }} disabled={spans().length === 0} onClick={submit}>
              提交作业(自动评分)
            </button>
            <p class="muted" style={{ "margin-bottom": 0 }}>
              提交时按当前状态计算合规分与参数分; 教师复核后合成总成绩。
            </p>
          </div>
        </div>
      </div>
    </Show>
  );
}
