import React from 'react'
import * as d3 from 'd3'
import { useStore } from '../store'
import { LEVEL_COLOR, STATUS_COLOR, TYPE_COLOR, TYPE_LABEL } from '../types'
import { lodFor, featureVisible, screenToWorld, viewport } from './pick'
import { symbolPrims, weirRuler } from './symbols'
import { buildScanSheet, buildTerrainImage } from './raster'
import { SHEETS, WORLD_H, WORLD_W } from '../data/worldgen'
import { intersects, niceScale, stake } from '../lib/geo'
import type { Feature, Rejection } from '../types'

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

function viewRect(cam: { x: number; y: number; k: number }, padFactor = 0.55): Rect {
  const halfW = viewport.w / 2 / cam.k
  const halfH = viewport.h / 2 / cam.k
  const padX = halfW * padFactor
  const padY = halfH * padFactor
  return {
    x0: cam.x - halfW - padX,
    y0: cam.y - halfH - padY,
    x1: cam.x + halfW + padX,
    y1: cam.y + halfH + padY,
  }
}

function pathFromRejection(canalPts: [number, number][], fromM: number, toM: number): string {
  const total = canalPts.reduce(
    (acc, p, i) => (i ? acc + Math.hypot(p[0] - canalPts[i - 1][0], p[1] - canalPts[i - 1][1]) : 0),
    0,
  )
  const unitLen = total
  const a = Math.max(0, Math.min(unitLen, fromM / 4))
  const b = Math.max(0, Math.min(unitLen, toM / 4))
  const out: [number, number][] = []
  let travelled = 0
  for (let i = 1; i < canalPts.length; i++) {
    const [ax, ay] = canalPts[i - 1]
    const [bx, by] = canalPts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    const t0 = Math.max(0, (a - travelled) / seg)
    const t1 = Math.min(1, (b - travelled) / seg)
    if (t1 > t0) {
      out.push([ax + (bx - ax) * t0, ay + (by - ay) * t0])
      out.push([ax + (bx - ax) * t1, ay + (by - ay) * t1])
    }
    travelled += seg
    if (travelled > b) break
  }
  if (out.length === 0) return ''
  return 'M' + out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')
}

export default function MapView() {
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const worldRef = React.useRef<SVGGElement | null>(null)
  const terrainRef = React.useRef<SVGGElement | null>(null)
  const rasterRef = React.useRef<SVGGElement | null>(null)
  const canalRef = React.useRef<SVGGElement | null>(null)
  const rejRef = React.useRef<SVGGElement | null>(null)
  const featureRef = React.useRef<SVGGElement | null>(null)
  const overlayRef = React.useRef<SVGGElement | null>(null)
  const drawRef = React.useRef<SVGGElement | null>(null)
  const hitRef = React.useRef<SVGGElement | null>(null)
  const nodeMap = React.useRef(new Map<string, SVGGElement>())
  const camera = React.useRef({ x: WORLD_W / 2, y: WORLD_H / 2, k: 0.34 })
  const zoomRef = React.useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const lastViewKey = React.useRef('')
  const rafPending = React.useRef<number | null>(null)
  const suppressClick = React.useRef(false)
  const onClickBackgroundRef = React.useRef<((e: React.MouseEvent<SVGSVGElement>) => void) | null>(null)
  const dragState = React.useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; el: SVGGElement; moved: boolean } | null>(null)
  const [uiCam, setUiCam] = React.useState(camera.current)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ w: 1200, h: 800 })
  const [terrainUrl, setTerrainUrl] = React.useState<string>('')
  const [sheetUrls, setSheetUrls] = React.useState<Record<string, string>>({})
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; f: Feature } | null>(null)
  const [hoverCanal, setHoverCanal] = React.useState<string | null>(null)
  const [cursorWorld, setCursorWorld] = React.useState<[number, number] | null>(null)
  const [clipHolder, setClipHolder] = React.useState<{ x: number; y: number; text: string } | null>(null)

  const store = useStore
  const storeSheets = store((s) => s.sheets)

  const world = store((s) => s.world)
  const layers = store((s) => s.layers)
  const selectionId = store((s) => s.selectionId)
  const compareVersions = store((s) => s.compareVersions)
  const cameraRequest = store((s) => s.cameraRequest)
  const tool = store((s) => s.tool)
  const rejections = store((s) => s.rejections)
  const drawPts = store((s) => s.drawPts)
  const measurePts = store((s) => s.measurePts)
  const review = store((s) => s.review)
  const selectedCanalId = store((s) => s.selectedCanalId)
  const role = store((s) => s.role)
  const rasterOn = store((s) => s.rasterOn)
  const showShortcuts = store((s) => s.showShortcuts)
  const editMode = store((s) => s.editMode)

  /* ---------------- sizing ---------------- */
  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((prev) =>
        Math.abs(prev.w - Math.round(r.width)) < 1 && Math.abs(prev.h - Math.round(r.height)) < 1
          ? prev
          : { w: Math.max(320, Math.round(r.width)), h: Math.max(240, Math.round(r.height)) },
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  React.useEffect(() => {
    viewport.w = size.w
    viewport.h = size.h
  }, [size])

  /* ---------------- images ---------------- */
  React.useEffect(() => {
    let alive = true
    const id = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 60))
    id(() => {
      if (!alive) return
      setTerrainUrl(buildTerrainImage(900, 640, WORLD_W, WORLD_H))
      const urls: Record<string, string> = {}
      SHEETS.forEach((s, i) => {
        urls[s.id] = buildScanSheet(101 + i * 37, 900, 620, (['blueprint', 'pencil', 'photo', 'blue'] as const)[i % 4])
      })
      setSheetUrls(urls)
    })
    return () => {
      alive = false
    }
  }, [])

  /* ---------------- camera <-> transform ---------------- */
  const applyTransform = React.useCallback(() => {
    const cam = camera.current
    const t = d3.zoomIdentity.translate(viewport.w / 2 - cam.k * cam.x, viewport.h / 2 - cam.k * cam.y).scale(cam.k)
    d3.select(worldRef.current).attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`)
    return t
  }, [])

  const scheduleUi = React.useRef(false)
  const syncUi = React.useCallback(() => {
    if (scheduleUi.current) return
    scheduleUi.current = true
    requestAnimationFrame(() => {
      scheduleUi.current = false
      setUiCam({ ...camera.current })
    })
  }, [])

  const keyFor = (cam: { x: number; y: number; k: number }) => {
    const lod = lodFor(cam.k)
    const r = viewRect(cam, 0.55)
    return `${lod}|${Math.floor(r.x0 / 300)}|${Math.floor(r.y0 / 300)}|${Math.floor(r.x1 / 300)}|${Math.floor(r.y1 / 300)}|${Math.round(cam.k * 100)}`
  }

  /* ---------------- drawing ---------------- */
  const drawCanals = React.useCallback(() => {
    const s = useStore.getState()
    const cam = camera.current
    const lod = lodFor(cam.k)
    const r = viewRect(cam)
    const g = d3.select(canalRef.current)
    const pad = 60 / cam.k
    const visible = s.world.canals.filter((c) => {
      if (!s.layers.levels[c.level]) return false
      if (lod === 1 && c.level !== 'trunk') return false
      return intersects(c.bbox, [r.x0, r.y0, r.x1, r.y1], pad)
    })
    const sel = g
      .selectAll<SVGPathElement, (typeof visible)[number]>('path.canal-line')
      .data(visible, (d: any) => d.id)
    sel.exit().remove()
    sel
      .enter()
      .append('path')
      .attr('class', 'canal-line')
      .merge(sel as any)
      .attr('d', (d: any) => d.d)
      .attr('fill', 'none')
      .attr('stroke', (d: any) => LEVEL_COLOR[d.level as 'trunk' | 'branch' | 'lateral'])
      .attr('stroke-width', (d: any) => (d.level === 'trunk' ? 3.4 : d.level === 'branch' ? 2.3 : 1.5))
      .attr('stroke-opacity', (d: any) =>
        s.selectedCanalId === d.id || (s.selectionId && s.meta.featureById.get(s.selectionId)?.canalId === d.id) ? 1 : 0.9,
      )
      .attr('stroke-linecap', 'round')
      .attr('vector-effect', 'non-scaling-stroke')

    // canal under review gets a soft band as well
    const reviewCanalId = s.review?.open ? s.review.canalId : null
    const reviewCanal = reviewCanalId ? visible.find((c) => c.id === reviewCanalId) : null
    if (reviewCanal) {
      g.selectAll('path.canal-review').data([reviewCanal]).join('path').attr('class', 'canal-review')
        .attr('d', reviewCanal.d)
        .attr('fill', 'none')
        .attr('stroke', '#e8a93a')
        .attr('stroke-width', 16)
        .attr('stroke-opacity', 0.2)
        .attr('stroke-linecap', 'round')
        .attr('vector-effect', 'non-scaling-stroke')
    } else {
      g.selectAll('path.canal-review').remove()
    }

    // selected canal emphasis
    const selCanal = visible.find((c) => c.id === s.selectedCanalId)
    const halo = g.selectAll('path.canal-halo').data(selCanal ? [selCanal] : [], (d: any) => d.id)
    halo.exit().remove()
    halo
      .enter()
      .append('path')
      .attr('class', 'canal-halo')
      .merge(halo as any)
      .attr('d', (d: any) => d.d)
      .attr('fill', 'none')
      .attr('stroke', '#f2c14e')
      .attr('stroke-width', 10)
      .attr('stroke-opacity', 0.55)
      .attr('vector-effect', 'non-scaling-stroke')

    // canal name labels
    const labelG = d3.select(canalRef.current).selectAll('g.canal-labels').data([0])
    const lg = labelG.enter().append('g').attr('class', 'canal-labels').merge(labelG as any)
    const claims: { x: number; y: number }[] = []
    lg.selectAll('*').remove()
    const fsName = (lod === 1 ? 13 : 12) / cam.k
    if (s.layers.showLabels) {
      for (const c of visible) {
        if (lod === 1) continue
        if (!s.layers.levels[c.level]) continue
        const mid = medianPoint(c.pts)
        if (claims.some((q) => Math.hypot(q.x - mid.x, q.y - mid.y) < 48 / cam.k)) continue
        claims.push(mid)
        const label = lg
          .append('text')
          .attr('x', mid.x)
          .attr('y', mid.y - fsName * 0.72)
          .attr('transform', `rotate(${mid.angle},${mid.x},${mid.y})`)
          .attr('text-anchor', 'middle')
          .attr('font-size', fsName)
          .attr('fill', c.id === s.selectedCanalId ? '#7a5a00' : '#173c4c')
          .attr('paint-order', 'stroke')
          .attr('stroke', '#f7f2e6')
          .attr('stroke-width', fsName * 0.32)
          .attr('stroke-opacity', 1)
          .attr('font-weight', 700)
          .text(c.name)
        if (lod === 3) {
          label
            .append('tspan')
            .attr('x', mid.x)
            .attr('dy', fsName * 1.15)
            .attr('font-size', fsName * 0.74)
            .attr('font-weight', 400)
            .text(`${c.code} · 设计 ${c.designFlow} m³/s · ${c.builtYear}`)
        }
      }
    }

    // chainage ticks along visible canals
    const tickG = lg.append('g').attr('class', 'chainage-ticks')
    if (s.layers.showChainage && cam.k >= 3.2) {
      const interval = cam.k > 6 ? 100 : 250
      for (const c of visible) {
        const ticks = buildChainageTicks(c.pts, c.startChainage ?? 0, c.endChainage ?? 0, interval)
        for (const t of ticks) {
          if (ticks.length > 140) break // guard
          const tickPx = 4.2 / cam.k
          const gg = lg.append('g').attr('transform', `translate(${t.x},${t.y}) rotate(${t.angle})`)
          gg.append('line')
            .attr('x1', 0)
            .attr('y1', -tickPx)
            .attr('x2', 0)
            .attr('y2', tickPx)
            .attr('stroke', '#173c4c')
            .attr('stroke-width', 1)
            .attr('vector-effect', 'non-scaling-stroke')
            .attr('stroke-opacity', 0.85)
          const tickFs = 9 / cam.k
          gg.append('text')
            .attr('x', 0)
            .attr('y', -tickPx * 1.55)
            .attr('font-size', tickFs)
            .attr('text-anchor', 'middle')
            .attr('fill', '#22404c')
            .attr('paint-order', 'stroke')
            .attr('stroke', '#f7f2e6')
            .attr('stroke-width', tickFs * 0.28)
            .text(t.label)
        }
      }
    }
  }, [])

  const drawRejections = React.useCallback(() => {
    // rejection bands are drawn under canals
    const s = useStore.getState()
    const g = d3.select(rejRef.current)
    g.selectAll('*').remove()
    if (!s.layers.showRejections) return
    const cam = camera.current
    const r = viewRect(cam)
    const lod = lodFor(cam.k)
    for (const rej of s.rejections) {
      const canal = s.meta.canalById.get(rej.canalId)
      if (!canal || !s.layers.levels[canal.level]) continue
      if (lod === 1 && canal.level !== 'trunk') continue
      if (!intersects(canal.bbox, [r.x0, r.y0, r.x1, r.y1], 80 / cam.k)) continue
      const d = pathFromRejection(canal.pts, rej.startChainage, rej.endChainage)
      if (!d) continue
      g.append('path')
        .attr('d', d)
        .attr('fill', 'none')
        .attr('stroke', STATUS_COLOR.rejected)
        .attr('stroke-width', 13)
        .attr('stroke-opacity', 0.28)
        .attr('stroke-dasharray', '5 4')
        .attr('vector-effect', 'non-scaling-stroke')
    }
  }, [])

  const drawFeatures = React.useCallback(() => {
    const s = useStore.getState()
    const cam = camera.current
    const lod = lodFor(cam.k)
    const r = viewRect(cam)
    const idx: number[] = []
    const accept = (f: Feature) => s.layers.types[f.type] && s.layers.levels[f.level] && featureVisible(f, lod)
    // query the grid index for the padded viewport
    s.meta.index.query(r.x0, r.y0, r.x1, r.y1, idx, accept)

    const g = d3.select(featureRef.current)
    let data = idx.map((i) => s.world.features[i])

    // 屏幕空间抽稀：概览级别密集区按格网保留代表性要素，避免符号糊成一片
    const minPx = lod === 1 ? 46 : lod === 2 ? 22 : 7
    if (minPx > 0 && data.length > 0) {
      const occupied = new Set<string>()
      const keep: Feature[] = []
      // 选中的要素永远保留
      const sorted = data.slice().sort((a, b) => {
        if (a.id === s.selectionId) return -1
        if (b.id === s.selectionId) return 1
        return 0
      })
      for (const f of sorted) {
        const gx = Math.floor((f.x * cam.k) / minPx)
        const gy = Math.floor((f.y * cam.k) / minPx)
        const key = gx + ':' + gy
        if (f.id === s.selectionId) {
          keep.push(f)
          occupied.add(key)
          continue
        }
        if (occupied.has(key)) continue
        occupied.add(key)
        keep.push(f)
      }
      data = keep
    }

    const sel = g.selectAll<SVGGElement, Feature>('g.feat').data(data, (d: any) => d.id)
    sel.exit().each(function () {
      const el = this as SVGGElement
      nodeMap.current.delete((el as any).__data?.id)
    })
    sel.exit().remove()

    const entered = sel
      .enter()
      .append('g')
      .attr('class', 'feat')
      .attr('data-id', (d: any) => d.id)
      .on('pointerenter', function (ev: PointerEvent, d: Feature) {
        if (!dragState.current) {
          ;(this as SVGGElement).classList.add('hovered')
          setTooltip({ x: ev.clientX, y: ev.clientY, f: d })
        }
      })
      .on('pointerleave', function () {
        ;(this as SVGGElement).classList.remove('hovered')
        setTooltip(null)
      })
      .on('pointerdown', function (ev: PointerEvent, d: Feature) {
        beginFeatureDrag(ev, d, this as SVGGElement)
      })

    const all = entered.merge(sel as any)

    // 屏幕空间标注去重：同一 40px 格网只保留一个编号，避免字号重叠
    const labelClaimed = new Set<string>()
    const labelCells = new Set<string>()
    const cellW = lod === 2 ? 78 : 52
    const cellH = lod === 2 ? 22 : 19
    for (const d of data) {
      if (lod === 2 && !(d.type === 'gate' && d.level !== 'lateral')) continue
      const gx = Math.floor(((d.x - cam.x) * cam.k + viewport.w / 2) / cellW)
      const gy = Math.floor(((d.y - cam.y) * cam.k + viewport.h / 2) / cellH)
      const key = gx + ':' + gy
      if (labelCells.has(key)) continue
      labelCells.add(key)
      labelClaimed.add(d.id)
    }
    if (s.selectionId) labelClaimed.add(s.selectionId)

    // 量水堰刻度说明同样抽稀：相邻过密的堰只保留符号，避免文字成团
    const rulerClaimed = new Set<string>()
    if (lod === 3) {
      const rulerCells = new Set<string>()
      for (const d of data) {
        if (d.type !== 'weir') continue
        const gx = Math.floor(((d.x - cam.x) * cam.k + viewport.w / 2) / 74)
        const gy = Math.floor(((d.y - cam.y) * cam.k + viewport.h / 2) / 52)
        const key = gx + ':' + gy
        if (rulerCells.has(key)) continue
        rulerCells.add(key)
        rulerClaimed.add(d.id)
      }
      if (s.selectionId) rulerClaimed.add(s.selectionId)
    }

    all.each(function (d) {
      const el = this as SVGGElement
      nodeMap.current.set(d.id, el)
      el.setAttribute('transform', `translate(${d.x},${d.y})`)
      buildFeatureGlyph(el, d, cam.k, s, lod, labelClaimed.has(d.id), rulerClaimed.has(d.id))
    })
    g.node()?.classList.toggle('detail', lod === 3)
    g.node()?.classList.toggle('overview', lod === 1)
  }, [])

  const buildFeatureGlyph = (
    el: SVGGElement,
    f: Feature,
    k: number,
    s: ReturnType<typeof useStore.getState>,
    lod: 1 | 2 | 3,
    mayLabel: boolean,
    mayRuler: boolean,
  ) => {
    while (el.firstChild) el.removeChild(el.firstChild)
    const ns = 'http://www.w3.org/2000/svg'
    const add = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(ns, tag)
      for (const key in attrs) n.setAttribute(key, String(attrs[key]))
      el.appendChild(n)
      return n
    }

    // glyph radius and label size, expressed in world units so that on screen
    // they stay a constant number of pixels across every zoom level
    const px = lod === 1 ? 7.6 : lod === 2 ? 7.5 : 6.4
    const u = px / k
    const labelPx = lod === 1 ? 10.5 : lod === 2 ? 10 : 9.5
    const fs = labelPx / k

    const color = TYPE_COLOR[f.type]
    const status = f.status
    const isSel = s.selectionId === f.id
    el.classList.toggle('sel', isSel)
    el.classList.toggle('archived', status === 'archived')
    el.classList.toggle('rejected', status === 'rejected')
    el.classList.toggle('draft', status === 'draft' || status === 'submitted')

    if (isSel) {
      add('circle', { r: u * 1.9, fill: '#f2c14e', 'fill-opacity': 0.3, stroke: '#a8791c', 'stroke-width': u * 0.16 })
      add('circle', { r: u * 1.3, fill: 'none', stroke: '#a8791c', 'stroke-width': u * 0.12 })
    } else if (status === 'rejected') {
      add('rect', {
        x: -u * 1.5,
        y: -u * 1.5,
        width: u * 3,
        height: u * 3,
        fill: 'none',
        stroke: STATUS_COLOR.rejected,
        'stroke-width': u * 0.18,
        'stroke-dasharray': `${u * 0.45} ${u * 0.3}`,
        rx: u * 0.25,
      })
    }

    for (const p of symbolPrims(f.type, u)) {
      add('path', {
        d: p.d,
        fill: p.fill,
        stroke: p.stroke,
        'stroke-width': p.sw,
        'stroke-opacity': p.opacity ?? 1,
        'fill-opacity': f.status === 'archived' ? 0.92 : 1,
      })
    }

    // 量水堰刻度：只在详图级别画出，刻度值随水位量程标注
    if (lod === 3 && f.type === 'weir' && mayRuler) {
      const reading = Number(String(f.props['量程'] ?? '0.45').split(' ')[0]) || 0.45
      const ruler = weirRuler(u, reading)
      add('path', { d: ruler.ticks, fill: 'none', stroke: color, 'stroke-width': u * 0.13, 'stroke-opacity': 0.9 })
      const n = Math.max(1, ruler.labels.length - 1)
      ruler.labels.forEach((lab, i) => {
        const y = -u * 1.15 + (i * u * 2.3) / n
        add('text', {
          x: u * 2.05,
          y: y + fs * 0.32,
          'font-size': fs * 0.86,
          fill: '#33265e',
          'text-anchor': 'start',
          'paint-order': 'stroke',
          stroke: '#fbf7ec',
          'stroke-width': fs * 0.3,
          'font-weight': 600,
        }).textContent = lab
      })
      add('text', {
        x: u * 1.1,
        y: u * 2.7,
        'font-size': fs * 0.84,
        fill: '#4a3a82',
        'text-anchor': 'middle',
        'paint-order': 'stroke',
        stroke: '#fbf7ec',
        'stroke-width': fs * 0.28,
        'font-weight': 700,
      }).textContent = '刻度 m³/s'
    }

    // 编号标注：详图级别显示闸门/涵洞/跌水短号，中景显示干线闸门短号
    const label =
      mayLabel && s.layers.showLabels
        ? lod === 3
          ? f.shortCode
          : lod === 2 && f.type === 'gate' && f.level !== 'lateral'
            ? f.shortCode
            : null
        : null
    const labelY = f.type === 'weir' ? -u * 1.95 : -u * 1.5
    if (label) {
      add('text', {
        x: f.type === 'weir' ? u * 1.35 : u * 1.15,
        y: labelY,
        'font-size': fs,
        fill: lod === 3 ? '#25343b' : '#5b666f',
        'text-anchor': 'start',
        'paint-order': 'stroke',
        stroke: '#f7f2e6',
        'stroke-width': fs * 0.3,
        'font-weight': 600,
      }).textContent = label
    }

    if (lod === 3 && s.layers.showLabels && f.type === 'pump') {
      add('text', {
        x: 0,
        y: u * 2.4,
        'font-size': fs * 0.72,
        fill: '#4a4040',
        'text-anchor': 'middle',
        'paint-order': 'stroke',
        stroke: '#f7f2e6',
        'stroke-width': fs * 0.24,
      }).textContent = f.name.replace(/[^\s]+渠\s*/, '')
    }

    if (lod === 3 && s.layers.showChainage && isSel) {
      add('text', {
        x: 0,
        y: u * 3.6,
        'font-size': fs * 0.92,
        fill: '#173c4c',
        'text-anchor': 'middle',
        'paint-order': 'stroke',
        stroke: '#f7f2e6',
        'stroke-width': fs * 0.3,
        'font-weight': 700,
      }).textContent = `桩号 ${stake(f.chainage)}`
    }

    // 命中区域：屏幕上至少 9px 半径
    add('circle', { r: Math.max(u * 1.35, 9 / k), fill: 'transparent', 'pointer-events': 'all' })
  }

  function beginFeatureDrag(ev: PointerEvent, f: Feature, el: SVGGElement) {
    const s = useStore.getState()
    if (ev.button !== 0) return
    ev.stopPropagation()
    ev.preventDefault()
    const placing =
      s.tool === 'gate' || s.tool === 'weir' || s.tool === 'pump' || s.tool === 'drop' || s.tool === 'culvert'
    if (s.tool === 'measure' || s.tool === 'draw' || placing) {
      // these tools operate on the map surface, not on existing symbols.
      // handle here and mark the upcoming click as consumed so the svg
      // handler does not add a second point.
      onClickBackgroundRef.current?.(ev as unknown as React.MouseEvent<SVGSVGElement>)
      suppressClick.current = true
      return
    }
    if (s.role === 'reviewer' || !s.editMode || s.tool !== 'select') {
      // click select only
      s.selectFeature(f.id)
      return
    }
    if (f.status === 'archived') {
      s.selectFeature(f.id)
      s.notify('已归档档案位置锁定，不可拖动', 'warn')
      return
    }
    const cam = camera.current
    const startWorld = screenToWorld(cam, ev.clientX, ev.clientY)
    dragState.current = { id: f.id, sx: ev.clientX, sy: ev.clientY, ox: f.x, oy: f.y, el, moved: false }
    el.classList.add('dragging')
    const onMove = (e: PointerEvent) => {
      const ds = dragState.current
      if (!ds) return
      if (Math.abs(e.clientX - ds.sx) + Math.abs(e.clientY - ds.sy) > 4) ds.moved = true
      if (!ds.moved) return
      const w = screenToWorld(cam, e.clientX, e.clientY)
      const nx = ds.ox + (w[0] - startWorld[0])
      const ny = ds.oy + (w[1] - startWorld[1])
      ds.el.setAttribute('transform', `translate(${nx},${ny})`)
      setClipHolder({ x: e.clientX, y: e.clientY, text: `新建位置 ${(nx * 4).toFixed(0)}, ${(ny * 4).toFixed(0)} · 桩号重算中` })
    }
    const onUp = (e: PointerEvent) => {
      const ds = dragState.current
      dragState.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setClipHolder(null)
      el.classList.remove('dragging')
      if (!ds) return
      suppressClick.current = true
      if (ds.moved) {
        const w = screenToWorld(cam, e.clientX, e.clientY)
        const nx = Math.round((ds.ox + (w[0] - startWorld[0])) * 10) / 10
        const ny = Math.round((ds.oy + (w[1] - startWorld[1])) * 10) / 10
        useStore.getState().moveFeature(ds.id, nx, ny)
        const updated = useStore.getState().meta.featureById.get(ds.id)
        useStore
          .getState()
          .notify(`要素移动至桩号 ${stake(updated?.chainage ?? 0)}，已生成待复核变更`, 'ok')
        redraw()
      } else {
        useStore.getState().selectFeature(ds.id)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /* version comparison overlay */
  const drawCompare = React.useCallback(() => {
    const s = useStore.getState()
    const g = d3.select(overlayRef.current)
    g.selectAll('*').remove()
    const id = s.selectionId
    if (!id) return
    const f = s.meta.featureById.get(id)
    if (!f) return
    const [a, b] = s.compareVersions
    const versions = f.revisions.filter((r) => r.version === a || r.version === b)
    if (versions.length === 0) return
    const k = camera.current.k
    const colors = ['#8f5bd6', '#d05a34']
    const fs = 10.5 / k
    versions.forEach((r, i) => {
      const col = colors[i % 2]
      g.append('circle')
        .attr('cx', r.x)
        .attr('cy', r.y)
        .attr('r', 13 / k)
        .attr('fill', col)
        .attr('fill-opacity', 0.09)
        .attr('stroke', col)
        .attr('stroke-width', 1.6)
        .attr('vector-effect', 'non-scaling-stroke')
      g.append('circle')
        .attr('cx', r.x)
        .attr('cy', r.y)
        .attr('r', 2.6 / k)
        .attr('fill', col)
      g.append('line')
        .attr('x1', r.x)
        .attr('y1', r.y)
        .attr('x2', f.x)
        .attr('y2', f.y)
        .attr('stroke', col)
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '4 3')
        .attr('vector-effect', 'non-scaling-stroke')
      const label = g
        .append('text')
        .attr('x', r.x + 8 / k)
        .attr('y', r.y - 11 / k)
        .attr('font-size', fs)
        .attr('fill', col)
        .attr('paint-order', 'stroke')
        .attr('stroke', '#fffdf6')
        .attr('stroke-width', fs * 0.34)
        .attr('font-weight', 700)
        .text(`v${r.version} · ${r.date}`)
      label
        .append('tspan')
        .attr('x', r.x + 8 / k)
        .attr('dy', fs * 1.15)
        .attr('font-weight', 400)
        .attr('font-size', fs * 0.86)
        .text(`桩号 ${stake(r.chainage)}`)
    })
    if (versions.length === 2) {
      const d = Math.hypot(versions[0].x - versions[1].x, versions[0].y - versions[1].y) * 4
      const dc = versions[1].chainage - versions[0].chainage
      const midX = (versions[0].x + versions[1].x) / 2
      const midY = (versions[0].y + versions[1].y) / 2
      const pill = g.append('g').attr('transform', `translate(${midX},${midY - 26 / k})`)
      const txt = `位移 ${d.toFixed(1)} m · 桩号差 ${dc >= 0 ? '+' : ''}${dc} m`
      pill
        .append('rect')
        .attr('x', -txt.length * fs * 0.31)
        .attr('y', -fs * 1.05)
        .attr('width', txt.length * fs * 0.62)
        .attr('height', fs * 1.55)
        .attr('rx', 3 / k)
        .attr('fill', '#432d10')
        .attr('fill-opacity', 0.9)
      pill
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 0)
        .attr('font-size', fs)
        .attr('fill', '#ffe9b0')
        .attr('font-weight', 700)
        .text(txt)

      // current position marker
      g.append('circle')
        .attr('cx', f.x)
        .attr('cy', f.y)
        .attr('r', 9 / k)
        .attr('fill', 'none')
        .attr('stroke', '#1f6941')
        .attr('stroke-width', 1.4)
        .attr('stroke-dasharray', '3 2')
        .attr('vector-effect', 'non-scaling-stroke')
      g.append('text')
        .attr('x', f.x + 11 / k)
        .attr('y', f.y + 16 / k)
        .attr('font-size', fs * 0.9)
        .attr('fill', '#1f6941')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#fffdf6')
        .attr('stroke-width', fs * 0.3)
        .attr('font-weight', 600)
        .text(`现状 v${f.version}`)
    }
  }, [])

  /* drawing preview */
  const drawPreview = React.useCallback(() => {
    const s = useStore.getState()
    const g = d3.select(drawRef.current)
    g.selectAll('*').remove()
    const drawMode = s.tool === 'draw'
    const measureMode = s.tool === 'measure'
    if (drawMode && s.drawPts.length) {
      const pts = [...s.drawPts]
      if (cursorWorld && !s.drawPts.some((p) => Math.hypot(p[0] - cursorWorld[0], p[1] - cursorWorld[1]) < 0.01)) pts.push(cursorWorld)
      g.append('path')
        .attr('d', 'M' + pts.map((p) => p.join(',')).join('L'))
        .attr('fill', 'none')
        .attr('stroke', '#a8791c')
        .attr('stroke-width', 2.4)
        .attr('stroke-dasharray', '8 5')
        .attr('vector-effect', 'non-scaling-stroke')
      for (const p of s.drawPts) {
        g.append('rect')
          .attr('x', p[0] - 4 / camera.current.k)
          .attr('y', p[1] - 4 / camera.current.k)
          .attr('width', 8 / camera.current.k)
          .attr('height', 8 / camera.current.k)
          .attr('fill', '#f2c14e')
          .attr('stroke', '#7a5a00')
          .attr('stroke-width', 1)
          .attr('vector-effect', 'non-scaling-stroke')
      }
      if (pts.length > 1) {
        const len = pts.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0)
        g.append('text')
          .attr('x', pts[pts.length - 1][0] + 8 / camera.current.k)
          .attr('y', pts[pts.length - 1][1])
          .attr('font-size', 11 / camera.current.k)
          .attr('fill', '#5a4100')
          .attr('paint-order', 'stroke')
          .attr('stroke', '#fffdf6')
          .attr('stroke-width', 2)
          .text(`${(len * 4).toFixed(1)} m`)
      }
    }
    if (measureMode && s.measurePts.length) {
      const pts = [...s.measurePts]
      if (cursorWorld) pts.push(cursorWorld)
      g.append('path')
        .attr('d', 'M' + pts.map((p) => p.join(',')).join('L'))
        .attr('fill', 'none')
        .attr('stroke', '#2f6fae')
        .attr('stroke-width', 1.8)
        .attr('stroke-dasharray', '6 4')
        .attr('vector-effect', 'non-scaling-stroke')
      for (const p of s.measurePts) {
        g.append('circle')
          .attr('cx', p[0])
          .attr('cy', p[1])
          .attr('r', 4 / camera.current.k)
          .attr('fill', '#2f6fae')
      }
      const len = pts.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0)
      g.append('text')
        .attr('x', pts[pts.length - 1][0] + 10 / camera.current.k)
        .attr('y', pts[pts.length - 1][1] - 4 / camera.current.k)
        .attr('font-size', 12 / camera.current.k)
        .attr('fill', '#12406b')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#fffdf6')
        .attr('stroke-width', 2.4)
        .text(`量距 ${(len * 4).toFixed(1)} m`)
    }
    void drawMode
  }, [cursorWorld])

  const redraw = React.useCallback(() => {
    drawCanals()
    drawRejections()
    drawFeatures()
    drawCompare()
    drawPreview()
  }, [drawCanals, drawRejections, drawFeatures, drawCompare, drawPreview])

  const redrawRef = React.useRef(redraw)
  redrawRef.current = redraw

  /* ---------------- redraw scheduling ---------------- */
  const scheduleRedraw = React.useCallback((force = false) => {
    if (rafPending.current !== null) {
      if (!force) return
      cancelAnimationFrame(rafPending.current)
    }
    rafPending.current = requestAnimationFrame(() => {
      rafPending.current = null
      const key = keyFor(camera.current)
      if (!force && key === lastViewKey.current) return
      lastViewKey.current = key
      redrawRef.current()
    })
  }, [])

  /* redraw when world / layers / selection / compare changes */
  React.useEffect(() => {
    lastViewKey.current = ''
    scheduleRedraw(true)
  }, [world, layers, selectionId, compareVersions, rejections, selectedCanalId, scheduleRedraw])

  React.useEffect(() => {
    drawCompare()
  }, [compareVersions, selectionId, world, drawCompare])

  React.useEffect(() => {
    drawPreview()
  }, [drawPts, measurePts, cursorWorld, tool, drawPreview])

  /* ---------------- zoom behaviour ---------------- */
  React.useEffect(() => {
    const svgEl = svgRef.current!
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.32, 8])
      .filter((event: any) => {
        if (event.type === 'wheel') return !event.ctrlKey || true
        if (event.button && event.button !== 0) return false
        if (event.target && event.target.closest && event.target.closest('g.feat')) return false
        return true
      })
      .on('zoom', (event) => {
        const t = event.transform
        camera.current = {
          x: (viewport.w / 2 - t.x) / t.k,
          y: (viewport.h / 2 - t.y) / t.k,
          k: t.k,
        }
        applyTransform()
        syncUi()
        scheduleRedraw(false)
      })
      .on('end', () => {
        useStore.getState().setCamera(camera.current.x, camera.current.y, camera.current.k)
        scheduleRedraw(true)
        syncUi()
      })
    zoomRef.current = zoom
    d3.select(svgEl).call(zoom).on('dblclick.zoom', null)
    // restore persisted camera (or fit world)
    const persisted = useStore.getState().camera
    if (persisted && Number.isFinite(persisted.k)) {
      camera.current = persisted
    } else {
      const k = Math.min(viewport.w / (WORLD_W + 120), viewport.h / (WORLD_H + 120))
      camera.current = { x: WORLD_W / 2, y: WORLD_H / 2, k: Math.max(0.32, Math.min(0.55, k)) }
    }
    const t = d3.zoomIdentity
      .translate(viewport.w / 2 - camera.current.k * camera.current.x, viewport.h / 2 - camera.current.k * camera.current.y)
      .scale(camera.current.k)
    d3.select(svgEl).call(zoom.transform, t)
    applyTransform()
    scheduleRedraw(true)
    syncUi()

    // wheel needs passive:false for preventDefault inside d3 — d3 handles that itself.
    return () => {
      d3.select(svgEl).on('.zoom', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  /* fly-to requests */
  React.useEffect(() => {
    if (!cameraRequest || !zoomRef.current || !svgRef.current) return
    const [x0, y0, x1, y1] = cameraRequest.bbox
    const w = Math.max(20, x1 - x0)
    const h = Math.max(20, y1 - y0)
    let k = Math.min(viewport.w / w, viewport.h / h) * 0.82
    if (cameraRequest.maxK) k = Math.min(k, cameraRequest.maxK)
    k = Math.max(0.32, Math.min(8, k))
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const target = d3.zoomIdentity.translate(viewport.w / 2 - k * cx, viewport.h / 2 - k * cy).scale(k)
    d3.select(svgRef.current)
      .transition()
      .duration(620)
      .ease(d3.easeCubicOut)
      .call(zoomRef.current.transform as any, target)
      .on('end', () => {
        useStore.getState().setCamera(cx, cy, k)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRequest])

  /* keyboard shortcuts */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      const s = useStore.getState()
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        s.setShowShortcuts(!s.showShortcuts)
      } else if (e.key === 'Escape') {
        s.selectFeature(null)
        s.setTool('select')
        s.clearDraw()
      } else if (e.key === 'Enter' && s.tool === 'draw') {
        ;(window as any).__finishDraw?.()
      } else if (e.key === 'f' || e.key === 'F') {
        if (s.selectionId) {
          const f = s.meta.featureById.get(s.selectionId)
          if (f) s.flyTo([f.x - 30, f.y - 30, f.x + 30, f.y + 30], 4.2)
        }
      } else if (/^[1-5]$/.test(e.key)) {
        const types = ['gate', 'weir', 'pump', 'drop', 'culvert']
        if (s.role !== 'reviewer') s.setTool(types[Number(e.key) - 1] as any)
      } else if (e.key === 'v' || e.key === 'V') {
        s.setTool('select')
      } else if (e.key === 'm' || e.key === 'M') {
        s.setTool('measure')
      } else if (e.key === 'p' || e.key === 'P') {
        s.setTool('pan')
      } else if (e.key === '+' || e.key === '=') {
        zoomBy(1.35)
      } else if (e.key === '-') {
        zoomBy(1 / 1.35)
      }
    }
    const zoomBy = (factor: number) => {
      if (!zoomRef.current || !svgRef.current) return
      d3.select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy as any, factor)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ---------------- pointer interactions on background ---------------- */
  const screenToWorldCam = (cx: number, cy: number) => screenToWorld(camera.current, cx, cy)

  const onSvgPointerMove = React.useCallback((e: React.PointerEvent) => {
    const [wx, wy] = screenToWorldCam(e.clientX, e.clientY)
    const s = useStore.getState()
    if (s.tool === 'draw' || s.tool === 'measure' || s.tool === 'gate' || s.tool === 'weir' || s.tool === 'pump' || s.tool === 'drop' || s.tool === 'culvert' || s.tool === 'select') {
      setCursorWorld([wx, wy])
    }
    if (dragState.current) return
    // hover picking via spatial index
    const cam = camera.current
    const lod = lodFor(cam.k)
    const R = 12 / cam.k
    const idx: number[] = []
    s.meta.index.query(wx - R, wy - R, wx + R, wy + R, idx, (f: Feature) => s.layers.types[f.type] && s.layers.levels[f.level] && featureVisible(f, lod))
    let best: Feature | null = null
    let bd = Infinity
    for (const i of idx) {
      const f = s.world.features[i]
      const d = Math.hypot((f.x - wx) * cam.k, (f.y - wy) * cam.k)
      if (d < bd && d < 13) {
        bd = d
        best = f
      }
    }
    if (best) {
      if (tooltip?.f.id !== best.id) setTooltip({ x: e.clientX, y: e.clientY, f: best })
      else setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
    } else if (tooltip) setTooltip(null)
    // canal hover
    if (!best && s.layers.showLabels) {
      let hc: string | null = null
      let nd = Infinity
      for (const c of s.world.canals) {
        if (!s.layers.levels[c.level]) continue
        if (!intersects(c.bbox, [wx - 20, wy - 20, wx + 20, wy + 20])) continue
        const d = distToPolyline(c.pts, wx, wy)
        if (d < nd && d < 10 / cam.k) {
          nd = d
          hc = c.id
        }
      }
      setHoverCanal(hc)
    } else {
      setHoverCanal(null)
    }
  }, [tooltip, tool])

  const onClickBackground = React.useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // clicks that originate on a symbol or drag were already handled
    const el = e.target as Element
    if (el.closest && el.closest('g.feat')) return
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    const s = useStore.getState()
    const [wx, wy] = screenToWorld(camera.current, e.clientX, e.clientY)
    if (s.tool === 'draw') {
      s.pushDrawPoint([Math.round(wx * 10) / 10, Math.round(wy * 10) / 10])
      return
    }
    if (s.tool === 'measure') {
      s.setMeasure([...s.measurePts, [wx, wy]])
      return
    }
    if (s.tool === 'gate' || s.tool === 'weir' || s.tool === 'pump' || s.tool === 'drop' || s.tool === 'culvert') {
      s.addFeature(s.tool, wx, wy)
      return
    }
    s.selectFeature(null)
    s.selectCanal(null)
  }, [])

  onClickBackgroundRef.current = onClickBackground

  /* finish draw logic exposed for canal form */
  React.useEffect(() => {
    ;(window as any).__finishDraw = () => {
      const s = useStore.getState()
      if (s.drawPts.length < 2) {
        s.notify('至少需要两个节点才能形成渠道走向', 'warn')
        return
      }
      ;(window as any).__requestCanalForm?.()
    }
    return () => {
      delete (window as any).__finishDraw
    }
  }, [])

  /* ---------------- rulers / minimap ---------------- */
  const scale = niceScale(4 / uiCam.k)
  const lod = lodFor(uiCam.k)
  const lodText = lod === 1 ? '概览 · 仅干渠与泵站' : lod === 2 ? '中景 · 支渠以上' : '详图 · 全要素'

  const cursorScreen = cursorWorld
    ? [(cursorWorld[0] - uiCam.x) * uiCam.k + size.w / 2, (cursorWorld[1] - uiCam.y) * uiCam.k + size.h / 2]
    : null

  return (
    <div className="map-root" ref={rootRef}>
      <svg
        ref={svgRef}
        className={`map-svg tool-${tool} ${dragState.current ? 'dragging' : ''}`}
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerMove={onSvgPointerMove}
        onClick={onClickBackground}
        onPointerLeave={() => {
          setTooltip(null)
          setHoverCanal(null)
        }}
      >
        <defs>
          <pattern id="paper" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#eee8d8" />
            <circle cx="3" cy="5" r="0.7" fill="#d8d0b9" />
            <circle cx="12" cy="11" r="0.5" fill="#d8d0b9" />
          </pattern>
          <filter id="labelHalo" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology operator="dilate" radius="1.2" in="SourceAlpha" result="d" />
            <feFlood floodColor="#f7f2e6" result="f" />
            <feComposite in="f" in2="d" operator="in" result="h" />
            <feMerge>
              <feMergeNode in="h" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect className="paper-bg" width={size.w} height={size.h} fill="url(#paper)" />
        <g ref={worldRef} className="world">
          <g ref={terrainRef} className="terrain" opacity={layers.showTerrain ? 0.95 : 0}>
            {terrainUrl && (
              <image href={terrainUrl} x={0} y={0} width={WORLD_W} height={WORLD_H} preserveAspectRatio="xMidYMid slice" />
            )}
          </g>
          <g ref={rasterRef} className="raster" opacity={rasterOn && layers.showRaster ? 1 : 0}>
            {storeSheets.map((s) =>
              s.url || sheetUrls[s.id] ? (
                <image
                  key={s.id}
                  href={s.url || sheetUrls[s.id]}
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  opacity={s.opacity}
                  preserveAspectRatio="none"
                  style={{ mixBlendMode: 'multiply' }}
                />
              ) : null,
            )}
          </g>
          <g ref={rejRef} className="rejections" />
          <g ref={canalRef} className="canals" />
          <g ref={featureRef} className="features" />
          <g ref={overlayRef} className="version-overlay" />
          <g ref={drawRef} className="draw-preview" />
        </g>
      </svg>

      <div className="map-overlay top-left">
        <div className="map-title-block">
          <div className="sheet-code">青杠岭山区灌区 · 渠系平面图</div>
          <div className="sheet-sub">1:2000 档案加工底图 · 坐标系 1985 国家高程</div>
        </div>
      </div>

      <div className="map-overlay bottom-right">
        <div className="scalebar">
          <div className="scalebar-line" style={{ width: scale.px }} />
          <span>{scale.label}</span>
          <span className="scalebar-note">{Math.round(4 / uiCam.k * 100) / 100} m/px</span>
        </div>
      </div>

      <div className="map-overlay bottom-left">
        <div className="coord-readout">
          <span className="lod-chip">{lodText}</span>
          {cursorScreen && (
            <span className="coords">
              X {(cursorWorld![0] * 4).toFixed(0)} m · Y {(cursorWorld![1] * 4).toFixed(0)} m · 桩号
            </span>
          )}
          <span className="zoom-readout">缩放 {uiCam.k.toFixed(2)}×</span>
        </div>
      </div>

      {tooltip && (
        <div
          className="feature-tooltip"
          style={{
            left: Math.min(tooltip.x + 16, size.w - 260),
            top: Math.min(tooltip.y + 14, size.h - 120),
          }}
        >
          <div className="ft-head">
            <span className="ft-type" style={{ color: TYPE_COLOR[tooltip.f.type] }}>
              {TYPE_LABEL[tooltip.f.type]}
            </span>
            <span className="ft-code">{tooltip.f.shortCode}</span>
          </div>
          <div className="ft-name">{tooltip.f.name}</div>
          <div className="ft-meta">
            桩号 {stake(tooltip.f.chainage)} · v{tooltip.f.version} · {STATUS_COLOR[tooltip.f.status] ? '' : ''}
          </div>
          <div className="ft-hint">单击查看档案卡 · 拖拽调整位置</div>
        </div>
      )}

      {clipHolder && (
        <div className="drag-callout" style={{ left: clipHolder.x + 14, top: clipHolder.y + 12 }}>
          {clipHolder.text}
        </div>
      )}

      {drawPts.length > 0 && (
        <div className="draw-banner">
          <span>矢量化绘制中 · 已布 {drawPts.length} 个节点 · 点击继续、双击或 Enter 完成</span>
          <button className="btn tiny" onClick={() => useStore.getState().clearDraw()}>
            取消
          </button>
          <button className="btn tiny primary" onClick={() => (window as any).__finishDraw?.()}>
            完成并录入
          </button>
        </div>
      )}

      <Minimap cam={uiCam} size={size} />
      <Legend />
      <KeyHints hidden={!showShortcuts} />
      {role === 'reviewer' && <div className="review-banner">审核模式 · 仅可核对与退回，不可修改要素</div>}
      {review.open && <ReviewSpotlight />}
    </div>
  )
}

/* ---------------- helpers ---------------- */

function buildChainageTicks(pts: [number, number][], start: number, end: number, interval: number) {
  const total = polyLen(pts)
  const out: { x: number; y: number; angle: number; label: string }[] = []
  let next = Math.ceil(start / interval) * interval
  let travelled = 0
  for (let i = 1; i < pts.length && next <= end && out.length < 400; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    const sM = travelled * 4
    const eM = (travelled + seg) * 4
    while (next <= eM && next <= end) {
      const t = (next - sM) / Math.max(1e-6, eM - sM)
      out.push({
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI,
        label: `${Math.floor(next / 1000)}+${String(Math.round(next % 1000)).padStart(3, '0')}`,
      })
      next += interval
    }
    travelled += seg
  }
  void total
  return out
}

function polyLen(pts: [number, number][]) {
  let t = 0
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return t
}

function medianPoint(pts: [number, number][]) {
  const total = polyLen(pts)
  let travelled = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (travelled + seg >= total / 2) {
      const t = (total / 2 - travelled) / Math.max(1e-6, seg)
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180
      return { x, y, angle }
    }
    travelled += seg
  }
  const [x, y] = pts[0]
  return { x, y, angle: 0 }
}

function distToPolyline(pts: [number, number][], x: number, y: number) {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    let t = l2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / l2
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t))
    if (d < best) best = d
  }
  return best
}

/* ---------------- sub components ---------------- */

function Minimap({ cam, size }: { cam: { x: number; y: number; k: number }; size: { w: number; h: number } }) {
  const mw = 176
  const mh = Math.round((mw * WORLD_H) / WORLD_W)
  const sx = mw / WORLD_W
  const sy = mh / WORLD_H
  const vw = (size.w / cam.k) * sx
  const vh = (size.h / cam.k) * sy
  const vx = cam.x * sx - vw / 2
  const vy = cam.y * sy - vh / 2
  const canals = useStore((s) => s.world.canals)
  const [draft, setDraft] = React.useState(false)
  return (
    <div className={`minimap ${draft ? 'draft' : ''}`} title="小比例尺索引图 · 点击定位">
      <svg
        width={mw}
        height={mh}
        onClick={(e) => {
          const r = (e.target as SVGElement).ownerSVGElement!.getBoundingClientRect()
          const x = (e.clientX - r.left) / sx
          const y = (e.clientY - r.top) / sy
          useStore.getState().flyTo([x - 200, y - 140, x + 200, y + 140], Math.max(0.9, cam.k))
        }}
      >
        <rect width={mw} height={mh} fill="#f3eee0" stroke="#b9ae92" strokeWidth={1} />
        {canals
          .filter((c) => c.level !== 'lateral')
          .map((c) => (
            <path
              key={c.id}
              d={c.d}
              fill="none"
              stroke={c.level === 'trunk' ? '#20607c' : '#6f9aa7'}
              strokeWidth={c.level === 'trunk' ? 1.4 : 0.8}
              transform={`scale(${sx},${sy})`}
            />
          ))}
        <rect x={vx} y={vy} width={vw} height={vh} fill="rgba(242,193,78,0.20)" stroke="#a8791c" strokeWidth={1.2} />
      </svg>
      <div className="minimap-caption">索引图</div>
    </div>
  )
}

function Legend() {
  const layers = useStore((s) => s.layers)
  return (
    <div className="legend map-overlay">
      <div className="legend-title">图例</div>
      <div className="legend-grid">
        <div className="legend-item">
          <span className="swatch" style={{ background: LEVEL_COLOR.trunk }} />
          干渠
        </div>
        <div className="legend-item">
          <span className="swatch" style={{ background: LEVEL_COLOR.branch }} />
          支渠
        </div>
        <div className="legend-item">
          <span className="swatch" style={{ background: LEVEL_COLOR.lateral }} />
          斗渠
        </div>
        {(['gate', 'weir', 'pump', 'drop', 'culvert'] as const).map((t) => (
          <div className="legend-item" key={t} style={{ opacity: layers.types[t] ? 1 : 0.4 }}>
            <span className="legend-sym" dangerouslySetInnerHTML={{ __html: symSvg(t) }} />
            {TYPE_LABEL[t]}
          </div>
        ))}
      </div>
    </div>
  )
}

function symSvg(type: 'gate' | 'weir' | 'pump' | 'drop' | 'culvert'): string {
  const prims = symbolPrims(type, 8)
  return `<svg width="17" height="17" viewBox="-9 -9 18 18">${prims
    .map((p) => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${Math.max(0.9, p.sw)}" />`)
    .join('')}</svg>`
}

function KeyHints({ hidden }: { hidden: boolean }) {
  if (hidden) return null
  return (
    <div className="key-hints">
      <div className="kh-title">操作速查</div>
      <div className="kh-row"><kbd>滚轮</kbd> 以光标为锚缩放</div>
      <div className="kh-row"><kbd>拖动</kbd> 平移 · 拖动要素可改位置</div>
      <div className="kh-row"><kbd>1</kbd>–<kbd>5</kbd> 切换闸门/量水堰/泵站/跌水/涵洞</div>
      <div className="kh-row"><kbd>V</kbd> 选择 · <kbd>M</kbd> 量距 · <kbd>F</kbd> 聚焦选中</div>
      <div className="kh-row"><kbd>Enter</kbd> 完成描线 · <kbd>Esc</kbd> 取消</div>
      <div className="kh-row"><kbd>?</kbd> 显示/隐藏本面板</div>
    </div>
  )
}

function ReviewSpotlight() {
  const review = useStore((s) => s.review)
  const meta = useStore((s) => s.meta)
  const canal = review.canalId ? meta.canalById.get(review.canalId) : null
  const fs = review.canalId ? meta.byCanal.get(review.canalId) || [] : []
  const f = fs[Math.min(review.index, fs.length - 1)]
  React.useEffect(() => {
    if (f) useStore.getState().flyTo([f.x - 26, f.y - 26, f.x + 26, f.y + 26], 3.6)
  }, [f?.id])
  if (!canal || !f) return null
  return (
    <div className="review-spotlight">
      <div className="rs-label">逐条核对</div>
      <div className="rs-main">
        {canal.code} · {f.shortCode} · 桩号 <strong>{stake(f.chainage)}</strong>
      </div>
      <div className="rs-sub">
        第 {review.index + 1} / {fs.length} 条 · 单击要素可核对属性
      </div>
    </div>
  )
}
