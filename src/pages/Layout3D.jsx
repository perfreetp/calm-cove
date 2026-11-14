import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ThreeScene from '../components/ThreeScene.jsx'
import { useStore, statusName } from '../store'
import { OBJ_TYPES, SPACING_MODES, STATUS, uid } from '../constants'
import { validatePoint, computeStats, groundHeight } from '../lib/geometry'

export default function Layout3D() {
  const { id } = useParams()
  const nav = useNavigate()
  const archive = useStore((s) => s.archives.find((a) => a.id === id))
  const role = useStore((s) => s.role)
  const saveDraft = useStore((s) => s.saveDraft)
  const submitVersion = useStore((s) => s.submitVersion)
  const newVersionFromCurrent = useStore((s) => s.newVersionFromCurrent)

  const curVersion = archive?.versions.find((v) => v.version === archive.currentVersion)
  const editable =
    !!archive &&
    role === '设计员' &&
    (!curVersion || curVersion.status === 'draft' || curVersion.status === 'rejected')

  const [objects, setObjects] = useState([])
  const [spacingMode, setSpacingMode] = useState(5)
  const [selectedId, setSelectedId] = useState(null)
  const [transformMode, setTransformMode] = useState('translate')
  const [hud, setHud] = useState(null)
  const [pending, setPending] = useState(null)
  const [viewVersion, setViewVersion] = useState(null)
  const [note, setNote] = useState('')
  const stageRef = useRef(null)
  const initRef = useRef(null)

  // 载入版本数据
  useEffect(() => {
    if (!archive) return
    const ver = viewVersion
      ? archive.versions.find((v) => v.version === viewVersion)
      : archive.versions.find((v) => v.version === archive.currentVersion)
    initRef.current = ver?.id || 'empty'
    setObjects(structuredClone(ver?.objects || []))
    setSpacingMode(ver?.spacingMode || 5)
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive?.id, viewVersion, archive?.currentVersion])

  // 实时冲突
  const conflicts = useMemo(() => {
    if (!archive) return { ids: new Set(), map: {} }
    const map = {}
    for (const o of objects) {
      const res = validatePoint(
        o.x, o.z,
        archive.terrain.zones,
        archive.terrain.existingFences,
        [archive.terrain.width, archive.terrain.depth]
      )
      if (!res.ok) map[o.id] = res
    }
    return { ids: new Set(Object.keys(map)), map }
  }, [objects, archive])

  const stats = useMemo(
    () => computeStats(objects, spacingMode),
    [objects, spacingMode]
  )

  // 接收 three 层投放事件
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const handler = (e) => {
      const { type, x, z, res } = e.detail
      if (res.ok) {
        setObjects((prev) => [...prev, { id: uid(), type, x, z, rotY: 0 }])
      } else {
        setPending({ type, x, z, res })
      }
    }
    el.addEventListener('obj-drop', handler)
    return () => el.removeEventListener('obj-drop', handler)
  }, [])

  if (!archive) {
    return (
      <div className="page">
        <div className="empty" style={{ marginTop: 60 }}>
          请先在档案列表中选择或新建档案
          <div style={{ marginTop: 14 }}>
            <button onClick={() => nav('/')}>前往档案列表</button>
          </div>
        </div>
      </div>
    )
  }

  const onMove = (objId, patch, res) => {
    if (patch === null) {
      setObjects((prev) => prev.filter((o) => o.id !== objId))
      setSelectedId(null)
      return
    }
    setObjects((prev) => prev.map((o) => (o.id === objId ? { ...o, ...patch } : o)))
  }

  const acceptPending = () => {
    if (!pending) return
    const n = pending.res.nearest
    if (n) {
      setObjects((prev) => [...prev, { id: uid(), type: pending.type, x: n.x, z: n.z, rotY: 0 }])
    }
    setPending(null)
  }

  const doSave = (thenSubmit) => {
    if (conflicts.ids.size > 0) {
      alert('仍有构件处于冲突(红色)位置,请先处理后再保存提交')
      return
    }
    const vid = saveDraft(archive.id, objects, spacingMode, note || `V${archive.versions.length + 1} 布点草稿`)
    setNote('')
    if (thenSubmit) submitVersion(archive.id, vid)
  }

  const selected = objects.find((o) => o.id === selectedId)
  const viewingOther = viewVersion && viewVersion !== archive.currentVersion

  return (
    <div className="layout-wrap">
      {/* 左:构件库 */}
      <div className="side">
        <h3>构件库(拖入场景)</h3>
        {Object.values(OBJ_TYPES).map((t) => (
          <div
            key={t.key}
            className="lib-item"
            draggable={editable}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/obj-type', t.key)
              e.dataTransfer.effectAllowed = 'copy'
              window.__dragObjType = t.key
            }}
          >
            <span className="lib-swatch" style={{ background: t.color }} />
            <div>
              <div className="nm">{t.name}</div>
              <div className="ds">{t.desc}</div>
            </div>
          </div>
        ))}

        <h3 style={{ marginTop: 18 }}>设计规范</h3>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
          围栏高度:1.1 m<br />
          大门净宽:4 m<br />
          桩间距档位:3 m / 5 m(容差 ±0.8m)<br />
          禁放:河流、道路、牲畜通道、已有围栏<br />
          操作:左键拾取,手柄平移/旋转,Delete 删除
        </div>

        <h3 style={{ marginTop: 18 }}>桩间距档位</h3>
        <div className="btn-row">
          {SPACING_MODES.map((m) => (
            <button
              key={m}
              className={spacingMode === m ? '' : 'ghost'}
              disabled={!editable}
              onClick={() => setSpacingMode(m)}
            >
              {m} 米档
            </button>
          ))}
        </div>
      </div>

      {/* 中:三维舞台 */}
      <div className="stage" ref={stageRef}>
        <ThreeScene
          terrain={archive.terrain}
          objects={objects}
          spacingMode={spacingMode}
          selectedId={selectedId}
          transformMode={transformMode}
          readOnly={!editable || viewingOther}
          conflictIds={[...conflicts.ids]}
          onSelect={(sid) => setSelectedId(sid)}
          onMove={onMove}
          onHud={setHud}
        />
        <div className="hud">
          <div className="hud-pill">
            档案 <b className="mono">{archive.archiveNo}</b> · {archive.household} ·{' '}
            {curVersion ? `V${viewVersion || archive.currentVersion}(${statusName(curVersion.status)})` : '未建版本'}
          </div>
          {hud && (
            <div className={'hud-pill ' + (hud.kind === 'bad' ? 'hud-bad' : 'hud-ok')}>{hud.text}</div>
          )}
          {conflicts.ids.size > 0 && (
            <div className="hud-pill hud-bad">当前 {conflicts.ids.size} 个构件位置冲突(已标红)</div>
          )}
          {stats.spacingBad.length > 0 && (
            <div className="hud-pill hud-bad">
              {stats.spacingBad.length} 对桩距不符合 {spacingMode}m 档位
            </div>
          )}
        </div>
        <div className="hud-btns">
          <button
            className={'small ' + (transformMode === 'translate' ? '' : 'ghost')}
            disabled={!selected || !editable}
            onClick={() => setTransformMode('translate')}
          >
            平移手柄
          </button>
          <button
            className={'small ' + (transformMode === 'rotate' ? '' : 'ghost')}
            disabled={!selected || !editable}
            onClick={() => setTransformMode('rotate')}
          >
            旋转手柄
          </button>
        </div>

        {pending && (
          <div className="modal-mask" onClick={() => setPending(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>位置冲突</h2>
              <div className="alert alert-red">
                该位置与
                {pending.res.conflicts.map((c) => `「${c.name}」`).join('、')}
                冲突,不可放置。
              </div>
              {pending.res.nearest ? (
                <p className="muted">
                  系统推荐最近可放位置:
                  <b className="mono">({pending.res.nearest.x}, {pending.res.nearest.z})</b>
                  ,距当前位置 {pending.res.nearest.distance}m
                </p>
              ) : (
                <p className="muted">地块内未找到可放位置,请取消后手动选点。</p>
              )}
              <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button className="ghost" onClick={() => setPending(null)}>取消</button>
                <button onClick={acceptPending} disabled={!pending.res.nearest}>
                  放到推荐位置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右:对象与版本 */}
      <div className="side side-right">
        {!editable && (
          <div className="alert alert-amber">
            {viewingOther
              ? '正在浏览历史版本(只读)'
              : role !== '设计员'
              ? `当前角色「${role}」为只读,设计编辑请切换为设计员`
              : '当前版本已锁定,修改需新建版本'}
          </div>
        )}

        <h3>构件清单({objects.length})</h3>
        <div style={{ maxHeight: 240, overflow: 'auto' }}>
          {objects.length === 0 && <div className="muted" style={{ fontSize: 12 }}>从左侧拖入构件开始布点</div>}
          {objects.map((o, i) => (
            <div
              key={o.id}
              className={'obj-row' + (o.id === selectedId ? ' selected' : '') + (conflicts.ids.has(o.id) ? ' bad' : '')}
              onClick={() => setSelectedId(o.id)}
            >
              <span>
                {i + 1}. {OBJ_TYPES[o.type].name}{' '}
                <span className="muted mono">({o.x}, {o.z})</span>
              </span>
              {editable && (
                <button
                  className="small danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMove(o.id, null)
                  }}
                >
                  删
                </button>
              )}
            </div>
          ))}
        </div>

        {selected && (
          <>
            <h3 style={{ marginTop: 16 }}>选中构件属性</h3>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
              类型:{OBJ_TYPES[selected.type].name}<br />
              坐标 X:<b className="mono">{selected.x}</b> Z:<b className="mono">{selected.z}</b><br />
              朝向 Y:<b className="mono">{((selected.rotY * 180) / Math.PI).toFixed(1)}°</b><br />
              地面高程:<b className="mono">{groundHeight(selected.x, selected.z).toFixed(2)} m</b>(自动吸附)
            </div>
          </>
        )}

        <h3 style={{ marginTop: 16 }}>实时统计</h3>
        <div className="grid grid-2">
          <div className="kpi"><div className="num">{stats.postCount}<span className="unit">根</span></div><div className="lab">水泥桩</div></div>
          <div className="kpi"><div className="num">{stats.meshLength}<span className="unit">米</span></div><div className="lab">网片总长</div></div>
          <div className="kpi"><div className="num">{stats.gateCount}<span className="unit">樘</span></div><div className="lab">大门(净宽4m)</div></div>
          <div className="kpi"><div className="num">{stats.waterCount}<span className="unit">处</span></div><div className="lab">饮水点</div></div>
        </div>

        <h3 style={{ marginTop: 16 }}>版本链</h3>
        <div>
          {archive.versions.length === 0 && <div className="muted" style={{ fontSize: 12 }}>尚未保存任何版本</div>}
          {[...archive.versions].reverse().map((v) => (
            <div
              key={v.id}
              className="timeline-item"
              style={{ cursor: 'pointer', background: (viewVersion || archive.currentVersion) === v.version ? 'var(--panel-2)' : 'transparent', borderRadius: 8 }}
              onClick={() => setViewVersion(v.version === archive.currentVersion ? null : v.version)}
            >
              <b>V{v.version}</b> <span className={'tag ' + STATUS[v.status].cls}>{statusName(v.status)}</span>
              <div className="at">{v.createdAt}</div>
              <div className="muted" style={{ fontSize: 12 }}>{v.note}</div>
            </div>
          ))}
        </div>

        {editable && !viewingOther && (
          <>
            <h3 style={{ marginTop: 16 }}>版本说明</h3>
            <textarea
              placeholder="本版布点说明(可选)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button onClick={() => doSave(false)}>保存草稿版本</button>
              <button className="ghost" onClick={() => doSave(true)}>保存并提交审核</button>
            </div>
          </>
        )}
        {!editable && !viewingOther && role === '设计员' && curVersion?.status === 'approved' && (
          <button
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => {
              newVersionFromCurrent(archive.id)
              setViewVersion(null)
            }}
          >
            新建版本并修改
          </button>
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => nav(`/overview/${archive.id}`)}>去俯视统计 →</button>
        </div>
      </div>
    </div>
  )
}
