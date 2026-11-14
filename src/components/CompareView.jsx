import React, { useMemo } from 'react';
import { computeGrid, findDarkZones, statsAll, ugrAt } from '../lib/lighting.js';
import { MODE, MODES } from '../lib/modes.js';
import { heatDataUrl } from '../lib/heatmap.js';
import { CAT, CCT_TINT } from '../lib/catalog.js';
import { runChecks } from '../lib/qc.js';

/** 并排比照同一库房多套方案的照度热力图 */
export default function CompareView({ state, ui, setUi, onToast }) {
  const compareIds = ui.compareIds ?? [];
  const designs = state.designs.filter((d) => compareIds.includes(d.id));
  const modeKey = ui.mode ?? 'night';

  const cards = useMemo(
    () =>
      designs.map((d) => {
        const grid = computeGrid(d, {
          cell: Math.max(0.5, ui.cell ?? 0.5),
          ambient: MODE[modeKey].ambient,
          powerScale: MODE[modeKey].powerScale,
        });
        const dark = findDarkZones(grid, 150);
        const all = statsAll(grid);
        const qc = runChecks(d);
        let minUgr = Infinity, maxUgr = -Infinity;
        for (const f of d.fixtures.filter((f) => f.kind === 'aisle')) {
          const v = ugrAt(d, { x: f.x + f.w / 2, y: f.y + f.h / 2 });
          if (v < minUgr) minUgr = v;
          if (v > maxUgr) maxUgr = v;
        }
        return {
          design: d,
          grid,
          dark,
          all,
          qc,
          ugr: maxUgr,
          url: heatDataUrl(grid, { tintAmt: 0.3, shadowAmt: 0.8 }),
        };
      }),
    [designs, modeKey, ui.cell]
  );

  // 统一色标：以各方案平均照度的量级对齐（比较用）
  const toggle = (id) => {
    setUi((u) => {
      const cur = u.compareIds ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (next.length > 4) {
        onToast?.('最多并排 4 套方案', 'danger');
        return u;
      }
      return { ...u, compareIds: next };
    });
  };

  return (
    <div className="compare-layout">
      <div className="compare-bar">
        <span className="cb-label">并排方案</span>
        {state.designs.map((d) => (
          <button
            key={d.id}
            className={`chip ${compareIds.includes(d.id) ? 'on' : ''}`}
            onClick={() => toggle(d.id)}
          >
            {d.code} · {d.name.split('·').pop().trim()}
          </button>
        ))}
        <div className="grow" />
        <span className="dim" style={{ fontSize: 11 }}>工况</span>
        <div className="seg">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={modeKey === m.key ? 'on' : ''}
              onClick={() => setUi((u) => ({ ...u, mode: m.key }))}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          className="btn sm"
          onClick={() => setUi((u) => ({ ...u, compareIds: state.designs.map((d) => d.id).slice(0, 3) }))}
        >
          重置
        </button>
      </div>

      {cards.length === 0 && (
        <div className="empty">
          <span className="e-icon">⊞</span>
          选择 2–4 套方案开始并排比照。
        </div>
      )}

      <div className="compare-grid">
        {cards.map(({ design, grid, dark, all, qc, ugr, url }) => {
          const minLux = all.min;
          const avg = all.avg;
          return (
            <div key={design.id} className="cmp-card">
              <div className="cc-hd">
                <span className="batch-code">{design.code}</span>
                <span className="cc-name">{design.name.split('·').pop().trim()}</span>
                <span className="dim mono" style={{ fontSize: 10.5 }}>{design.lamps.length} 盏</span>
              </div>
              <div className={`tc-body`} style={{ position: 'relative', lineHeight: 0 }}>
                <svg
                  viewBox={`-2 -2 ${design.room.w + 4} ${design.room.h + 4}`}
                  style={{ width: '100%', display: 'block', aspectRatio: `${design.room.w + 4} / ${design.room.h + 4}`, background: '#080b10' }}
                >
                  <image href={url} x="0" y="0" width={design.room.w} height={design.room.h} preserveAspectRatio="none" />
                  <rect x="0" y="0" width={design.room.w} height={design.room.h} fill="none" stroke="#7b96b3" strokeWidth="1.1" />
                  {design.fixtures.map((f) => {
                    if (f.kind === 'trench') return <rect key={f.id} x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke="rgba(120,190,255,0.55)" strokeWidth="0.3" />;
                    if (f.kind === 'platform') return <rect key={f.id} x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(140,170,200,0.18)" stroke="rgba(200,225,245,0.6)" strokeWidth="0.32" />;
                    if (f.kind === 'column') return <circle key={f.id} cx={f.cx} cy={f.cy} r={f.r} fill="rgba(220,235,250,0.35)" />;
                    if (f.kind === 'cabinet') return <rect key={f.id} x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(220,235,250,0.28)" />;
                    if (f.kind === 'aisle') return <rect key={f.id} x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke="rgba(120,190,255,0.22)" strokeWidth="0.28" strokeDasharray="1.4 1.1" />;
                    return null;
                  })}
                  {dark.slice(0, 12).map((z) => (
                    <rect key={z.id} x={z.bbox.x} y={z.bbox.y} width={z.bbox.w} height={z.bbox.h} fill="none" stroke="#ef5b5b" strokeWidth="0.45" strokeDasharray="0.9 0.7" />
                  ))}
                  {design.lamps.map((l) => (
                    <circle
                      key={l.id}
                      cx={l.x}
                      cy={l.y}
                      r={l.emergency ? 0.72 : 0.52}
                      fill={CCT_TINT[l.cct]}
                      stroke={l.emergency ? '#f0b84c' : 'rgba(0,0,0,0.55)'}
                      strokeWidth={l.emergency ? 0.3 : 0.16}
                      opacity="0.95"
                    />
                  ))}
                </svg>
              </div>
              <div className="cc-stats">
                <div>
                  <div className="v" style={{ color: avg >= 200 ? '#8ee3b0' : avg >= 150 ? '#ffd98a' : '#ff9b9b' }}>{Math.round(avg)}</div>
                  <div className="l">平均 lx</div>
                </div>
                <div>
                  <div className="v" style={{ color: minLux >= 150 ? '#8ee3b0' : '#ff9b9b' }}>{Math.round(minLux)}</div>
                  <div className="l">最小 lx</div>
                </div>
                <div>
                  <div className="v" style={{ color: dark.length ? '#ff9b9b' : '#8ee3b0' }}>{dark.length}</div>
                  <div className="l">暗区数</div>
                </div>
                <div>
                  <div className="v" style={{ color: ugr > 22 ? '#ffd98a' : '#8ee3b0' }}>{ugr.toFixed(1)}</div>
                  <div className="l">最大 UGR</div>
                </div>
              </div>
              <div className="cc-stats" style={{ borderTop: '1px solid var(--line)' }}>
                <div><div className="v">{all.uniformity.toFixed(2)}</div><div className="l">均匀度</div></div>
                <div><div className="v">{Math.round(qc.metrics.emergency.coverage * 100)}%</div><div className="l">应急覆盖</div></div>
                <div><div className="v">{qc.findings.filter((f) => f.severity === 'serious').length}</div><div className="l">严重问题</div></div>
                <div><div className="v">{design.lamps.filter((l) => l.emergency).length}</div><div className="l">应急灯</div></div>
              </div>
            </div>
          );
        })}
      </div>

      {cards.length > 1 && (
        <div style={{ padding: '0 16px 16px' }}>
          <div className="panel" style={{ padding: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>照度差值对照（相对首套方案）</div>
            <table className="batch-table" style={{ fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th>方案</th>
                  <th>平均照度</th>
                  <th>较首套</th>
                  <th>最小照度</th>
                  <th>暗区数</th>
                  <th>均匀度</th>
                  <th>最大 UGR</th>
                  <th>应急覆盖</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(({ design, dark, all, qc, ugr }, i) => {
                  const base = cards[0].all.avg;
                  const delta = all.avg - base;
                  return (
                    <tr key={design.id}>
                      <td>
                        <span className="batch-code">{design.code}</span>
                      </td>
                      <td className="mono">{Math.round(all.avg)} lx</td>
                      <td className="mono" style={{ color: delta > 0 ? '#8ee3b0' : delta < 0 ? '#ff9b9b' : 'var(--ink-3)' }}>
                        {i === 0 ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta)} lx`}
                      </td>
                      <td className="mono">{Math.round(all.min)} lx</td>
                      <td className="mono">{dark.length}</td>
                      <td className="mono">{all.uniformity.toFixed(2)}</td>
                      <td className="mono">{ugr.toFixed(1)}</td>
                      <td className="mono">{Math.round(qc.metrics.emergency.coverage * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
