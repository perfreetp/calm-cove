import { createSignal, For, Show } from "solid-js";
import { addQuestion, deleteQuestion, addTask, uid, useDb } from "../store/db";
import { currentUser } from "../store/session";
import { formatStake, parseStake } from "../core/stake";
import { EXAM_POINTS, type Question } from "../types";

export default function Bank() {
  const db = useDb();
  const me = currentUser()!;
  const [showForm, setShowForm] = createSignal(false);
  const [assignQ, setAssignQ] = createSignal<string | null>(null);

  // 表单状态
  const [title, setTitle] = createSignal("");
  const [stakeA, setStakeA] = createSignal("K12+300");
  const [stakeB, setStakeB] = createSignal("K12+540");
  const [maxH, setMaxH] = createSignal(4.0);
  const [std, setStd] = createSignal(2.0);
  const [sMin, setSMin] = createSignal(1.8);
  const [sMax, setSMax] = createSignal(2.5);
  const [ratio, setRatio] = createSignal(0.25);
  const [noise, setNoise] = createSignal(20);
  const [seed, setSeed] = createSignal(20260101);
  const [points, setPoints] = createSignal<string[]>([...EXAM_POINTS.slice(0, 5)]);
  const [err, setErr] = createSignal("");

  const students = () => db().users.filter((u) => u.role === "student");

  function togglePoint(p: string) {
    setPoints(points().includes(p) ? points().filter((x) => x !== p) : [...points(), p]);
  }

  function submit() {
    const a = parseStake(stakeA());
    const b = parseStake(stakeB());
    if (!title().trim()) return setErr("请填写题目名称");
    if (a === null || b === null || b <= a) return setErr("桩号范围非法, 终点须大于起点");
    if (sMin() <= 0 || sMax() < sMin() || std() < sMin() || std() > sMax())
      return setErr("立柱间距区间非法, 需满足 最小 ≤ 标准 ≤ 最大");
    if (maxH() <= 0 || maxH() > 12) return setErr("屏体总高需在 0~12m 之间");
    if (ratio() < 0 || ratio() > 0.8) return setErr("透明屏比例需在 0~0.8 之间");
    const q: Question = {
      id: uid("q"),
      title: title().trim(),
      examPoints: points(),
      stakeStart: a,
      stakeEnd: b,
      maxHeight: maxH(),
      colSpacingStd: std(),
      colSpacingMin: sMin(),
      colSpacingMax: sMax(),
      transparentRatioMin: ratio(),
      noiseReqDb: noise(),
      seed: seed(),
      createdBy: me.id,
      createdAt: new Date().toISOString(),
    };
    addQuestion(q);
    setShowForm(false);
    setErr("");
    setTitle("");
  }

  function assign(qid: string, studentId: string) {
    addTask({
      id: uid("task"),
      questionId: qid,
      studentId,
      status: "pending",
      deadline: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    setAssignQ(null);
  }

  return (
    <>
      <div class="card">
        <div class="row">
          <h2 style={{ margin: 0 }}>题库管理</h2>
          <div class="spacer" />
          <button class="primary" onClick={() => setShowForm(!showForm())}>
            {showForm() ? "收起" : "＋ 新建题目"}
          </button>
        </div>
        <Show when={showForm()}>
          <div style={{ "margin-top": "14px" }}>
            <div class="form-grid">
              <div class="field"><label>题目名称</label><input value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="如: 城市高架桥段声屏障设计" /></div>
              <div class="field"><label>起点桩号</label><input value={stakeA()} onInput={(e) => setStakeA(e.currentTarget.value)} /></div>
              <div class="field"><label>终点桩号</label><input value={stakeB()} onInput={(e) => setStakeB(e.currentTarget.value)} /></div>
              <div class="field"><label>屏体总高限值(m)</label><input type="number" step="0.1" value={maxH()} onInput={(e) => setMaxH(+e.currentTarget.value)} /></div>
              <div class="field"><label>标准立柱间距(m)</label><input type="number" step="0.1" value={std()} onInput={(e) => setStd(+e.currentTarget.value)} /></div>
              <div class="field"><label>间距下限(m)</label><input type="number" step="0.1" value={sMin()} onInput={(e) => setSMin(+e.currentTarget.value)} /></div>
              <div class="field"><label>间距上限(m)</label><input type="number" step="0.1" value={sMax()} onInput={(e) => setSMax(+e.currentTarget.value)} /></div>
              <div class="field"><label>透明屏占比下限(0~1)</label><input type="number" step="0.05" value={ratio()} onInput={(e) => setRatio(+e.currentTarget.value)} /></div>
              <div class="field"><label>降噪要求(dB)</label><input type="number" value={noise()} onInput={(e) => setNoise(+e.currentTarget.value)} /></div>
              <div class="field"><label>基准种子</label><input type="number" value={seed()} onInput={(e) => setSeed(+e.currentTarget.value)} /></div>
            </div>
            <h3>考点</h3>
            <div class="row">
              <For each={EXAM_POINTS}>
                {(p) => (
                  <button class="sm" style={points().includes(p) ? "background:#dbeafe;border-color:#1d4ed8;color:#1d4ed8" : ""} onClick={() => togglePoint(p)}>
                    {p}
                  </button>
                )}
              </For>
            </div>
            <Show when={err()}><p style={{ color: "var(--danger)" }}>{err()}</p></Show>
            <div class="row" style={{ "margin-top": "12px" }}>
              <button class="primary" onClick={submit}>保存题目</button>
            </div>
          </div>
        </Show>
      </div>

      <div class="card">
        <table>
          <thead>
            <tr>
              <th>题目</th><th>桩号范围</th><th>总高限值</th><th>立柱间距</th>
              <th>透明屏</th><th>降噪</th><th>考点</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <For each={db().questions}>
              {(q) => (
                <tr>
                  <td>{q.title}</td>
                  <td>{formatStake(q.stakeStart)} ~ {formatStake(q.stakeEnd)}</td>
                  <td>≤{q.maxHeight}m</td>
                  <td>{q.colSpacingStd}m ({q.colSpacingMin}~{q.colSpacingMax})</td>
                  <td>≥{(q.transparentRatioMin * 100).toFixed(0)}%</td>
                  <td>≥{q.noiseReqDb}dB</td>
                  <td><For each={q.examPoints}>{(p) => <span class="tag">{p}</span>}</For></td>
                  <td>
                    <div class="row">
                      <button class="sm" onClick={() => setAssignQ(assignQ() === q.id ? null : q.id)}>布置任务</button>
                      <button class="sm danger" onClick={() => confirm("删除该题及其未完成任务?") && deleteQuestion(q.id)}>删除</button>
                    </div>
                    <Show when={assignQ() === q.id}>
                      <div style={{ "margin-top": "6px" }}>
                        <For each={students()}>
                          {(s) => (
                            <button class="sm" style={{ "margin-right": "6px" }} onClick={() => assign(q.id, s.id)}>
                              → {s.name}({s.className})
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </>
  );
}
