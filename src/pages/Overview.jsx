import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as d3 from 'd3'
import { useStore, statusName } from '../store'
import { OBJ_TYPES, STATUS, GATE_WIDTH, FENCE_HEIGHT } from '../constants'
import {
  computeStats,
  diffVersions,
  buildFenceChain,
  findTurningPoints,
  validatePoint
} from '../lib/geometry'

const ZONE_COLOR = { river: '#2b7fb8', road: '#8a8f98', cattle: '#d98a2b' }
const ZONE_LABEL = { river: '河流', road: '道路', cattle: '牲畜通道' }

// 路径带状多边形
function ribbonPath(line, width) {
  const left = []
  const right = []
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i]
    const prev = line[Math.max(0, i - 1)]
    const next = line[Math.min(line.length - 1, i + 1)]
    const dx = next[0] - prev[0]
    const dz = next[1] - prev[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    left.push([x + nx * width / 2, z + nz * width / 2])
    right.push([x - nx * width / 2, z - nz * width / 2])
  }
  return [...left, ...right.reverse()]
}

export default function Overview() {
  const { id } = useParams()
  const nav = useNavigate()
  const archives = useStore((s) => s.archives)
  const archive = archives.find((a) => a.id === id)
  const [verPick, setVerPick] = useState(null)
  const [compareA, setCompareA] = useState(null)
  const [compareB, setCompareB] = useState(null)
  const [tip, setTip] = useState(null)
  const wrapRef = useRef(null)

  const version = useMemo(() => {
    if (!archive) return null
    if (verPick) return archive.versions.find((v) => v.version === verPick)
    return archive.versions.find((v) => v.version === archive.currentVersion) || null
  }, [archive, verPick])

  const objects = version?.objects || []
  const spacingMode = version?.spacingMode || 5
  const stats = useMemo(() => computeStats(objects, spacingMode), [objects, spacingMode])
  const { chain, edges } = useMemo(() => buildFenceChain(objects, spacingMode), [objects, spacingMode])
  const turns = useMemo(() => findTurningPoints(chain), [chain])

  const conflictMap = useMemo(() => {
    if (!archive) return {}
    const m = {}
    for (const o of objects) {
      const r = validatePoint(
        o.x, o.z,
        archive.terrain.zones,
        archive.terrain.existingFences,
        [archive.terrain.width, archive.terrain.depth]
      )
      if (!r.ok) m[o.id] = r.conflicts.map((c) => c.name).join('、')
    }
    return m
  }, [objects, archive])

  const diff = useMemo(() => {
    if (!archive || compareA == null || compareB == null) return null
    const va = archive.versions.find((v) => v.version === compareA)
    const vb = archive.versions.find((v) => v.version === compareB)
    if (!va || !vb) return null
    return { data: diffVersions(va.stats, va.objects, vb.stats, vb.objects), va, vb }
  }, [archive, compareA, compareB])

  // ---- D3 比例尺 ----
  const W = 760
  const H = 600
  const { xScale, zScale } = useMemo(() => {
    if (!archive) return {}
    const pad = 36
    const sx = d3.scaleLinear().domain([-archive.terrain.width / 2, archive.terrain.width / 2]).range([pad, W - pad])
    const sz = d3.scaleLinear().domain([-archive.terrain.depth / 2, archive.terrain.depth / 2]).range([pad, H - pad])
    return { xScale: sx, zScale: sz }
  }, [archive])

  const lineGen = d3
    .line()
    .x((d) => xScale(d[0]))
    .y((d) => zScale(d[1]))
    .curve(d3.curveMonotoneX)

  if (!archive) {
    return (
      <div className="page">
        <div className="page-pad">
          <div className="card">
            <h2>选择档案查看俯视统计</h2>
            {archives.length === 0 ? (
              <div className="empty">暂无档案</div>
            ) : (
              <table>
                <tbody>
                  {archives.map((a) => (
                    <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/overview/${a.id}`)}>
                      <td className="mono">{a.archiveNo}</td>
                      <td>{a.household}</td>
                      <td>{a.fenceType}</td>
                      <td><span className={'tag ' + STATUS[a.status].cls}>{statusName(a.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  const byId = new Map(objects.map((o) => [o.id, o]))
  const showTip = (e, text) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ text, x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 14 })
  }

  const bom = [
    { name: '水泥桩(1.1m)', spec: '0.18×0.18m 预制混凝土桩', qty: stats.postCount, unit: '根' },
    { name: '3m 网片', spec: `高 ${FENCE_HEIGHT}m`, qty: stats.panels3, unit: '片' },
    { name: '5m 网片', spec: `高 ${FENCE_HEIGHT}m`, qty: stats.panels5, unit: '片' },
    { name: '网片合计', spec: '按桩间净距扣门宽', qty: stats.meshLength, unit: '米' },
    { name: '围栏大门', spec: `净宽 ${GATE_WIDTH}m`, qty: stats.gateCount, unit: '樘' },
    { name: '饮水点设施', spec: '半径 0.6m 圆形点位', qty: stats.waterCount, unit: '处' }
  ]

  const printInstructions = () => {
    const win = window.open('', '_blank')
    const rows = bom.map((b) => `<tr><td>${b.name}</td><td>${b.spec}</td><td>${b.qty}${b.unit}</td></tr>`).join('')
    const turnRows = turns.map((t, i) => `<tr><td>${i + 1}</td><td>(${t.x}, ${t.z})</td><td>${t.angle}°</td></tr>`).join('')
    win.document.write(`<html><head><meta charset="utf-8"><title>施工说明 ${archive.archiveNo}</title>
      <style>body{font-family:"Microsoft YaHei";padding:32px;max-width:900px;margin:auto}
      table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #888;padding:6px 10px}
      h2{border-left:5px solid #2f7fd4;padding-left:10px}</style></head><body>
      <h1>围栏工程施工说明</h1>
      <p>档案号:<b>${archive.archiveNo}</b> | 草场编号:${archive.pastureNo} | 面积:${archive.area}亩 |
      围栏类型:${archive.fenceType} | 牧户:${archive.household} | 版本:V${version.version} | 出图时间:${version.createdAt}</p>
      <h2>一、设计规范</h2>
      <p>围栏高度 ${FENCE_HEIGHT}m;大门净宽 ${GATE_WIDTH}m;桩间距按 ${spacingMode}m 档位控制(容差 ±0.8m);
      桩位自动吸附地面;布点避让河流、道路、牲畜通道及邻接地块已有围栏。</p>
      <h2>二、物料清单</h2><table><tr><th>材料</th><th>规格</th><th>数量</th></tr>${rows}</table>
      <h2>三、拐点坐标(共 ${turns.length} 处)</h2>
      <table><tr><th>序号</th><th>平面坐标 (X, Z)</th><th>转角</th></tr>${turnRows || '<tr><td colspan=3>无</td></tr>'}</table>
      <h2>四、施工要求</h2>
      <p>1. 按俯视图桩位放线,桩坑深度不小于 0.4m,桩顶高程随地形自然过渡;<br/>
      2. 网片张拉平顺,相邻网片在桩位搭接固定;<br/>
      3. 大门两侧采用加强桩,门轴与锁扣现场焊接防腐;<br/>
      4. 饮水点周边 1m 范围内不得打桩,预留牲畜回旋空间;<br/>
      5. ${stats.spacingBad.length ? `存在 ${stats.spacingBad.length} 处桩距偏差,施工前须与设计员复核确认。` : '桩距全部符合档位要求。'}</p>
      </body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="overview-wrap">
      <div className="svg-card" ref={wrapRef} style={{ position: 'relative' }}>
        <div className="toolbar">
          <b>俯视线形图</b>
          <select value={verPick || archive.currentVersion} onChange={(e) => setVerPick(Number(e.target.value))}>
            {archive.versions.map((v) => (
              <option key={v.id} value={v.version}>V{v.version} · {statusName(v.status)}</option>
            ))}
          </select>
          <span className="muted">比例:每格 2m | 坐标原点为地块中心</span>
        </div>

        {!version ? (
          <div className="empty">该档案还没有保存过版本,请先在三维布置中保存草稿</div>
        ) : (
          <svg width={W} height={H} style={{ background: '#0e1a14', borderRadius: 8 }}>
            {/* 地块边界 */}
            <rect
              x={xScale(-archive.terrain.width / 2)}
              y={zScale(-archive.terrain.depth / 2)}
              width={xScale(archive.terrain.width / 2) - xScale(-archive.terrain.width / 2)}
              height={zScale(archive.terrain.depth / 2) - zScale(-archive.terrain.depth / 2)}
              fill="#16301f"
              stroke="#4a7a55"
              strokeWidth={2}
            />
            {/* 网格 */}
            {d3.range(-archive.terrain.width / 2, archive.terrain.width / 2 + 1, 10).map((g) => (
              <line key={'gx' + g} x1={xScale(g)} x2={xScale(g)} y1={zScale(-archive.terrain.depth / 2)} y2={zScale(archive.terrain.depth / 2)} stroke="#1e3a28" strokeWidth={0.5} />
            ))}
            {d3.range(-archive.terrain.depth / 2, archive.terrain.depth / 2 + 1, 10).map((g) => (
              <line key={'gz' + g} y1={zScale(g)} y2={zScale(g)} x1={xScale(-archive.terrain.width / 2)} x2={xScale(archive.terrain.width / 2)} stroke="#1e3a28" strokeWidth={0.5} />
            ))}

            {/* 禁放区 */}
            {archive.terrain.zones.map((z) => (
              <g key={z.id}>
                <polygon
                  points={ribbonPath(z.path, z.width).map((p) => `${xScale(p[0])},${zScale(p[1])}`).join(' ')}
                  fill={ZONE_COLOR[z.kind]}
                  opacity={0.4}
                  stroke={ZONE_COLOR[z.kind]}
                />
                <text
                  x={xScale(z.path[Math.floor(z.path.length / 2)][0])}
                  y={zScale(z.path[Math.floor(z.path.length / 2)][1]) - z.width}
                  fill="#cfe0f0"
                  fontSize={12}
                  textAnchor="middle"
                >
                  {ZONE_LABEL[z.kind]}·{z.name}
                </text>
              </g>
            ))}

            {/* 已有围栏 */}
            {archive.terrain.existingFences.map((f) => (
              <g key={f.id}>
                <path d={lineGen(f.path)} fill="none" stroke="#c98a52" strokeWidth={5} opacity={0.6} strokeDasharray="8 5" />
                <text x={xScale(f.path[0][0]) - 8} y={zScale(f.path[0][1])} fill="#e4b58c" fontSize={11} textAnchor="end">
                  {f.name}
                </text>
              </g>
            ))}

            {/* 围栏线形 */}
            {edges.map(([aId, bId], i) => {
              const a = byId.get(aId)
              const b = byId.get(bId)
              if (!a || !b) return null
              const bad = conflictMap[aId] || conflictMap[bId]
              return (
                <line
                  key={i}
                  x1={xScale(a.x)} y1={zScale(a.z)}
                  x2={xScale(b.x)} y2={zScale(b.z)}
                  stroke={bad ? '#e05252' : '#6fdc8c'}
                  strokeWidth={2.5}
                />
              )
            })}

            {/* 版本对比叠加 */}
            {diff && (
              <g>
                {diff.data.removed.map((p) => (
                  <circle key={'rm' + p.id} cx={xScale(p.x)} cy={zScale(p.z)} r={8} fill="none" stroke="#e05252" strokeWidth={2} />
                ))}
                {diff.data.added.map((p) => (
                  <circle key={'ad' + p.id} cx={xScale(p.x)} cy={zScale(p.z)} r={8} fill="none" stroke="#35a06b" strokeWidth={2} />
                ))}
              </g>
            )}

            {/* 构件 */}
            {objects.map((o) => {
              const cx = xScale(o.x)
              const cy = zScale(o.z)
              const bad = conflictMap[o.id]
              const tipText = `${OBJ_TYPES[o.type].name}\n坐标 (${o.x}, ${o.z})${bad ? `\n冲突:${bad}` : ''}`
              if (o.type === 'post') {
                return (
                  <circle
                    key={o.id}
                    cx={cx} cy={cy} r={5}
                    fill={bad ? '#e05252' : '#d7d2c6'}
                    stroke="#222"
                    onMouseMove={(e) => showTip(e, tipText)}
                    onMouseLeave={() => setTip(null)}
                  />
                )
              }
              if (o.type === 'gate') {
                return (
                  <g key={o.id} onMouseMove={(e) => showTip(e, tipText)} onMouseLeave={() => setTip(null)}>
                    <rect x={cx - 9} y={cy - 9} width={18} height={18} fill="#2f6fb0" stroke="#0e2a47" />
                    <text x={cx} y={cy + 4} fontSize={10} fill="#fff" textAnchor="middle">门</text>
                  </g>
                )
              }
              return (
                <g key={o.id} onMouseMove={(e) => showTip(e, tipText)} onMouseLeave={() => setTip(null)}>
                  <circle cx={cx} cy={cy} r={7} fill="#1f9ed4" stroke="#0b4a66" />
                  <text x={cx} y={cy + 4} fontSize={10} fill="#fff" textAnchor="middle">水</text>
                </g>
              )
            })}

            {/* 拐点标记 */}
            {turns.map((t) => (
              <g key={'t' + t.id}>
                <circle cx={xScale(t.x)} cy={zScale(t.z)} r={10} fill="none" stroke="#ffd34d" strokeWidth={1.6} />
                <text x={xScale(t.x) + 12} y={zScale(t.z) - 8} fill="#ffd34d" fontSize={11}>拐点 {t.angle}°</text>
              </g>
            ))}
          </svg>
        )}

        <div className="legend">
          <span><i style={{ background: '#d7d2c6' }}></i>水泥桩</span>
          <span><i style={{ background: '#2f6fb0' }}></i>大门(4m)</span>
          <span><i style={{ background: '#1f9ed4' }}></i>饮水点</span>
          <span><i style={{ background: '#6fdc8c' }}></i>围栏线形</span>
          <span><i style={{ background: '#e05252' }}></i>冲突点</span>
          <span><i style={{ background: '#ffd34d' }}></i>拐点</span>
          <span><i style={{ background: '#2b7fb8' }}></i>河流</span>
          <span><i style={{ background: '#8a8f98' }}></i>道路</span>
          <span><i style={{ background: '#d98a2b' }}></i>牲畜通道</span>
          {diff && (
            <>
              <span><i style={{ background: 'none', border: '2px solid #35a06b' }}></i>新增桩</span>
              <span><i style={{ background: 'none', border: '2px solid #e05252' }}></i>减少桩</span>
            </>
          )}
        </div>
        {tip && <div className="svg-tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      </div>

      <div className="side" style={{ borderRadius: 10 }}>
        <div className="grid grid-2">
          <div className="kpi"><div className="num">{stats.postCount}<span className="unit">根</span></div><div className="lab">水泥桩</div></div>
          <div className="kpi"><div className="num">{stats.meshLength}<span className="unit">m</span></div><div className="lab">网片米数</div></div>
          <div className="kpi"><div className="num">{stats.gateCount}<span className="unit">樘</span></div><div className="lab">大门</div></div>
          <div className="kpi"><div className="num">{turns.length}<span className="unit">处</span></div><div className="lab">拐点</div></div>
        </div>

        {stats.spacingBad.length > 0 && (
          <div className="alert alert-red" style={{ marginTop: 12 }}>
            {stats.spacingBad.length} 对桩距不符合 {spacingMode}m 档位(容差 ±0.8m),请回三维布置调整
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>拐点坐标</h3>
        <div style={{ maxHeight: 150, overflow: 'auto' }}>
          <table>
            <thead><tr><th>#</th><th>X</th><th>Z</th><th>转角</th></tr></thead>
            <tbody>
              {turns.length === 0 && <tr><td colSpan={4} className="muted">无明显拐点</td></tr>}
              {turns.map((t, i) => (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td className="mono">{t.x}</td>
                  <td className="mono">{t.z}</td>
                  <td>{t.angle}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 16 }}>物料清单</h3>
        <table>
          <thead><tr><th>材料</th><th>数量</th></tr></thead>
          <tbody>
            {bom.map((b) => (
              <tr key={b.name}>
                <td>{b.name}<div className="muted" style={{ fontSize: 11 }}>{b.spec}</div></td>
                <td className="mono">{b.qty} {b.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: 16 }}>版本对比(桩位增减 / 材料差额)</h3>
        <div className="btn-row">
          <select value={compareA ?? ''} onChange={(e) => setCompareA(Number(e.target.value) || null)}>
            <option value="">选择旧版本</option>
            {archive.versions.map((v) => <option key={v.id} value={v.version}>V{v.version}</option>)}
          </select>
          <span>→</span>
          <select value={compareB ?? ''} onChange={(e) => setCompareB(Number(e.target.value) || null)}>
            <option value="">选择新版本</option>
            {archive.versions.map((v) => <option key={v.id} value={v.version}>V{v.version}</option>)}
          </select>
        </div>
        {diff && (
          <div style={{ marginTop: 10 }}>
            <div className="alert">
              V{diff.va.version} → V{diff.vb.version}:新增桩 <b style={{ color: '#93e0b6' }}>{diff.data.added.length}</b> 根,
              减少桩 <b style={{ color: '#ffb3b3' }}>{diff.data.removed.length}</b> 根
            </div>
            <table>
              <thead><tr><th>材料</th><th>旧</th><th>新</th><th>差额</th></tr></thead>
              <tbody>
                {diff.data.materials.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td className="mono">{m.from}{m.unit}</td>
                    <td className="mono">{m.to}{m.unit}</td>
                    <td className="mono" style={{ color: m.delta > 0 ? '#ffb3b3' : m.delta < 0 ? '#93e0b6' : undefined }}>
                      {m.delta > 0 ? '+' : ''}{m.delta}{m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button onClick={printInstructions} disabled={!version}>生成并打印施工说明</button>
          <button className="ghost" onClick={() => nav(`/layout/${archive.id}`)}>回三维布置</button>
          <button className="ghost" onClick={() => nav(`/review/${archive.id}`)}>去审核 →</button>
        </div>
      </div>
    </div>
  )
}
