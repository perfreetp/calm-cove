import { useStore } from '../store'
import type { Canal, DocStatus, Feature, Layers } from '../types'
import { LEVEL_LABEL, LEVEL_ORDER, STATUS_LABEL, TYPE_CODE, TYPE_LABEL, TYPE_ORDER } from '../types'
import { stake } from '../lib/geo'
import { symbolPrims } from '../map/symbols'
import { WORLD_H, WORLD_W } from '../data/worldgen'

export interface ExportOptions {
  scope: 'canal' | 'all-approved' | 'selection'
  canalId?: string
  format: 'svg' | 'csv'
  includeArchived: boolean
}

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_')
}

export function downloadBlob(filename: string, content: string, mime: string) {
  // CSV 需要 BOM 才能被 Excel 正确识别为 UTF-8；SVG 不能带 BOM
  const payload = mime.startsWith('text/csv') ? '﻿' + content : content
  const blob = new Blob([payload], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export interface ExportBundle {
  filename: string
  mime: string
  content: string
  version: string
  featureCount: number
  canalCount: number
}

export function buildExport(opts: ExportOptions): ExportBundle | { error: string } {
  const s = useStore.getState()
  const stamp = todayStamp()
  let canals: Canal[] = []
  if (opts.scope === 'canal') {
    const c = opts.canalId ? s.meta.canalById.get(opts.canalId) : null
    if (!c) return { error: '未选择渠道' }
    canals = [c]
  } else if (opts.scope === 'all-approved') {
    canals = s.world.canals.filter((c) => c.status === 'approved' || (opts.includeArchived && c.status === 'archived'))
  } else {
    canals = s.world.canals.filter((c) => s.meta.byCanal.get(c.id)?.some((f) => f.status === 'archived'))
  }

  if (canals.length === 0) {
    return { error: '没有符合导出条件的档案（仅审核通过/已归档的渠道可导出）' }
  }

  canals = canals.filter((c) => c.status === 'approved' || (opts.includeArchived && c.status === 'archived'))
  if (canals.length === 0) {
    return { error: '所选范围内没有审核通过或已归档的档案，无法导出' }
  }

  const canalIds = new Set(canals.map((c) => c.id))
  const features: Feature[] = []
  for (const c of canals) {
    for (const f of s.meta.byCanal.get(c.id) || []) {
      if (f.status === 'archived' || f.status === 'approved') features.push(f)
      else if (opts.includeArchived) features.push(f)
    }
  }

  const version = `V${stamp}-${canals.length}C${features.length}F`

  if (opts.format === 'csv') {
    const header = [
      '档案版本',
      '要素编号',
      '要素短号',
      '要素名称',
      '类型',
      '渠系等级',
      '所属渠道编号',
      '所属渠道名称',
      '桩号',
      '桩号(m)',
      '平面X(m)',
      '平面Y(m)',
      '建成年代',
      '状态',
      '版本',
      '设计流量/规格',
      '最近更新',
    ]
    const rows = features
      .slice()
      .sort((a, b) => a.canalId.localeCompare(b.canalId) || a.chainage - b.chainage)
      .map((f) => {
        const c = s.meta.canalById.get(f.canalId)
        return [
          version,
          f.code,
          f.shortCode,
          f.name,
          TYPE_LABEL[f.type],
          LEVEL_LABEL[f.level],
          c?.code ?? '',
          c?.name ?? '',
          stake(f.chainage),
          f.chainage,
          (f.x * 4).toFixed(1),
          (f.y * 4).toFixed(1),
          f.builtYear,
          STATUS_LABEL[f.status],
          'v' + f.version,
          String(f.props['设计流量'] ?? f.props['量程'] ?? f.props['装机功率'] ?? ''),
          f.updatedAt,
        ]
          .map((v) => {
            const str = String(v ?? '')
            return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
          })
          .join(',')
      })
    const scopeName =
      opts.scope === 'canal'
        ? safeName(canals[0].code + '_' + canals[0].name)
        : opts.scope === 'all-approved'
          ? '灌区已通过档案'
          : '归档范围'
    return {
      filename: `要素清单_${scopeName}_${version}.csv`,
      mime: 'text/csv;charset=utf-8',
      content: [header.join(','), ...rows].join('\n'),
      version,
      featureCount: features.length,
      canalCount: canals.length,
    }
  }

  // SVG export
  const bbox = canals.reduce<[number, number, number, number]>(
    (acc, c) => [Math.min(acc[0], c.bbox[0]), Math.min(acc[1], c.bbox[1]), Math.max(acc[2], c.bbox[2]), Math.max(acc[3], c.bbox[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
  const pad = 60
  const x0 = bbox[0] - pad
  const y0 = bbox[1] - pad
  const w = bbox[2] - bbox[0] + pad * 2
  const h = bbox[3] - bbox[1] + pad * 2

  const legendTypes = TYPE_ORDER.filter((t) => features.some((f) => f.type === t))
  const titleBlockH = 96
  const totalH = h + titleBlockH
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${totalH.toFixed(0)}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${totalH.toFixed(1)}" font-family="'Noto Sans SC','Microsoft YaHei',sans-serif">`,
  )
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${w}" height="${totalH}" fill="#fbf7ec" stroke="#8b7f65" stroke-width="1"/>`,
  )
  // faint kilometre grid
  const gridStep = 500
  parts.push('<g stroke="#d9d0ba" stroke-width="0.6">')
  for (let gx = Math.floor(x0 / gridStep) * gridStep; gx < x0 + w; gx += gridStep) {
    parts.push(`<line x1="${gx}" y1="${y0}" x2="${gx}" y2="${y0 + h}"/>`)
  }
  for (let gy = Math.floor(y0 / gridStep) * gridStep; gy < y0 + h; gy += gridStep) {
    parts.push(`<line x1="${x0}" y1="${gy}" x2="${x0 + w}" y2="${gy}"/>`)
  }
  parts.push('</g>')

  // water colour tint under canals
  parts.push('<g fill="none" stroke-linecap="round">')
  for (const c of canals) {
    parts.push(`<path d="${c.d}" stroke="#8fc0d4" stroke-opacity="0.35" stroke-width="7"/>`)
  }
  parts.push('</g>')
  parts.push('<g fill="none" stroke-linecap="round">')
  for (const c of canals) {
    const width = c.level === 'trunk' ? 3.6 : c.level === 'branch' ? 2.4 : 1.6
    const color = c.level === 'trunk' ? '#185b7a' : c.level === 'branch' ? '#2f7f9b' : '#699fae'
    parts.push(`<path d="${c.d}" stroke="${color}" stroke-width="${width}"/>`)
  }
  parts.push('</g>')

  // canal labels
  parts.push('<g font-size="11" fill="#173c4c" font-weight="600">')
  for (const c of canals) {
    const m = midPoint(c.pts)
    let angle = m.angle
    if (angle > 90) angle -= 180
    if (angle < -90) angle += 180
    parts.push(
      `<text x="${m.x.toFixed(1)}" y="${(m.y - 5).toFixed(1)}" transform="rotate(${angle.toFixed(1)},${m.x.toFixed(1)},${m.y.toFixed(1)})" text-anchor="middle" paint-order="stroke" stroke="#fbf7ec" stroke-width="3">${esc(c.code)} ${esc(c.name)}</text>`,
    )
    parts.push(
      `<text x="${m.x.toFixed(1)}" y="${(m.y + 8).toFixed(1)}" transform="rotate(${angle.toFixed(1)},${m.x.toFixed(1)},${m.y.toFixed(1)})" text-anchor="middle" font-size="8" font-weight="400" fill="#456" paint-order="stroke" stroke="#fbf7ec" stroke-width="2.5">${stake(c.startChainage)}～${stake(c.endChainage)} · Q=${c.designFlow}m³/s · ${c.builtYear}</text>`,
    )
  }
  parts.push('</g>')

  // chainage ticks
  parts.push('<g font-size="7" fill="#22404c">')
  for (const c of canals) {
    const ticks = sampleTicks(c.pts, c.startChainage, c.endChainage, 500)
    for (const t of ticks) {
      parts.push(
        `<g transform="translate(${t.x.toFixed(1)},${t.y.toFixed(1)}) rotate(${t.angle.toFixed(1)})"><line x1="0" y1="-4" x2="0" y2="4" stroke="#22404c" stroke-width="0.8"/><text x="0" y="-6" text-anchor="middle" paint-order="stroke" stroke="#fbf7ec" stroke-width="2">${t.label}</text></g>`,
      )
    }
  }
  parts.push('</g>')

  // features
  for (const f of features) {
    const u = f.level === 'trunk' ? 7 : f.level === 'branch' ? 6 : 5
    parts.push(`<g transform="translate(${f.x.toFixed(1)},${f.y.toFixed(1)})">`)
    for (const p of symbolPrims(f.type, u)) {
      parts.push(
        `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${Math.max(0.9, p.sw * 1.4)}"${p.opacity ? ` stroke-opacity="${p.opacity}"` : ''}/>`,
      )
    }
    if (f.type === 'gate' || f.type === 'weir') {
      parts.push(
        `<text x="${u + 2}" y="${-u}" font-size="8" fill="#25343b" paint-order="stroke" stroke="#fbf7ec" stroke-width="2.2">${esc(f.shortCode)}</text>`,
      )
    }
    parts.push('</g>')
  }

  // legend
  const legX = x0 + w - 210
  const legY = y0 + 16
  parts.push(`<g transform="translate(${legX},${legY})" font-size="10">`)
  parts.push(`<rect width="190" height="${30 + legendTypes.length * 18}" fill="#fbf7ec" fill-opacity="0.92" stroke="#8b7f65" stroke-width="0.8"/>`)
  parts.push(`<text x="10" y="18" font-weight="700" fill="#173c4c">图例 · 要素 ${features.length} 个</text>`)
  legendTypes.forEach((t, i) => {
    const yy = 36 + i * 18
    const prims = symbolPrims(t, 6)
    parts.push(`<g transform="translate(20,${yy - 3}) scale(0.9)">`)
    for (const p of prims) parts.push(`<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${Math.max(1, p.sw)}"/>`)
    parts.push('</g>')
    const count = features.filter((f) => f.type === t).length
    parts.push(`<text x="42" y="${yy + 4}" fill="#25343b">${TYPE_LABEL[t]} · ${count}</text>`)
  })
  parts.push('</g>')

  // title block
  const tbY = y0 + h
  parts.push(`<g transform="translate(${x0},${tbY})">`)
  parts.push(`<rect width="${w}" height="${titleBlockH}" fill="#f4eddc" stroke="#8b7f65" stroke-width="0.8"/>`)
  parts.push(`<line x1="${w * 0.55}" y1="0" x2="${w * 0.55}" y2="${titleBlockH}" stroke="#8b7f65" stroke-width="0.8"/>`)
  parts.push(`<line x1="${w * 0.55}" y1="${titleBlockH / 2}" x2="${w}" y2="${titleBlockH / 2}" stroke="#8b7f65" stroke-width="0.8"/>`)
  parts.push(`<text x="16" y="26" font-size="17" font-weight="700" fill="#173c4c">青杠岭山区灌区渠系平面图</text>`)
  parts.push(`<text x="16" y="48" font-size="11" fill="#355">出图范围：${opts.scope === 'canal' ? esc(canals[0].code + ' ' + canals[0].name) : opts.scope === 'all-approved' ? '全灌区已通过档案' : '归档范围'} · 共 ${canals.length} 条渠道 / ${features.length} 个要素</text>`)
  parts.push(`<text x="16" y="68" font-size="11" fill="#355">比例 1:2000 · 1985 国家高程基准 · 高程单位 m</text>`)
  parts.push(`<text x="${w * 0.55 + 16}" y="26" font-size="13" font-weight="700" fill="#7a3b12">档案版本 ${version}</text>`)
  parts.push(`<text x="${w * 0.55 + 16}" y="46" font-size="10" fill="#355">导出时间 ${new Date().toLocaleString('zh-CN')}</text>`)
  parts.push(`<text x="${w * 0.55 + 16}" y="${titleBlockH / 2 + 18}" font-size="10" fill="#355">渠系等级：干渠 ${canals.filter((c) => c.level === 'trunk').length} / 支渠 ${canals.filter((c) => c.level === 'branch').length} / 斗渠 ${canals.filter((c) => c.level === 'lateral').length}</text>`)
  parts.push(`<text x="${w * 0.55 + 16}" y="${titleBlockH / 2 + 34}" font-size="10" fill="#355">制图：渠系档案加工系统 · 审核：已通过</text>`)
  parts.push('</g>')
  parts.push('</svg>')

  const scopeName =
    opts.scope === 'canal' ? safeName(canals[0].code) : opts.scope === 'all-approved' ? '全灌区' : '归档范围'
  return {
    filename: `渠系图_${scopeName}_${version}.svg`,
    mime: 'image/svg+xml;charset=utf-8',
    content: parts.join('\n'),
    version,
    featureCount: features.length,
    canalCount: canals.length,
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function midPoint(pts: [number, number][]) {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  let travelled = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (travelled + seg >= total / 2) {
      const t = (total / 2 - travelled) / Math.max(1e-6, seg)
      return {
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI,
      }
    }
    travelled += seg
  }
  return { x: pts[0][0], y: pts[0][1], angle: 0 }
}

function sampleTicks(pts: [number, number][], start: number, end: number, interval: number) {
  const out: { x: number; y: number; angle: number; label: string }[] = []
  let next = Math.ceil(start / interval) * interval
  let travelled = 0
  for (let i = 1; i < pts.length && next <= end && out.length < 200; i++) {
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
  return out
}
