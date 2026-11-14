// 内置演示角色「主播·小畅」：程序化绘制拆件（透明底），锚点即关节点
// part: { id, name, w, h, ax, ay, canvas }  渲染时 drawImage(canvas, -ax, -ay)

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function part(id, name, w, h, ax, ay, draw) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')
  draw(ctx, w, h)
  return { id, name, w, h, ax, ay, canvas, src: canvas.toDataURL() }
}

const SKIN = '#f2c9a4'
const SUIT = '#1f4e79'
const SUIT_DARK = '#163a5c'
const HAIR = '#2b2b2b'

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function buildDemoParts() {
  const parts = []

  // 躯干（西装，锚点在颈部下方）
  parts.push(part('torso', '躯干', 140, 170, 70, 10, (ctx) => {
    ctx.fillStyle = SUIT
    rr(ctx, 8, 0, 124, 160, 26)
    ctx.fill()
    ctx.fillStyle = SUIT_DARK
    ctx.fillRect(66, 6, 8, 150)
    ctx.fillStyle = '#fff'
    ctx.beginPath() // 衬衫领
    ctx.moveTo(48, 2); ctx.lineTo(70, 34); ctx.lineTo(92, 2); ctx.lineTo(92, 0); ctx.lineTo(48, 0)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#c0392b' // 领带
    ctx.beginPath()
    ctx.moveTo(64, 30); ctx.lineTo(76, 30); ctx.lineTo(72, 96); ctx.lineTo(70, 104); ctx.lineTo(68, 96)
    ctx.closePath(); ctx.fill()
  }))

  // 头（锚点在颈部）
  parts.push(part('head', '头部', 120, 130, 60, 118, (ctx) => {
    ctx.fillStyle = SKIN
    ctx.beginPath(); ctx.ellipse(60, 62, 48, 54, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = HAIR // 头发
    ctx.beginPath(); ctx.ellipse(60, 34, 50, 30, 0, Math.PI, Math.PI * 2); ctx.fill()
    ctx.fillRect(10, 30, 12, 26); ctx.fillRect(98, 30, 12, 26)
    ctx.fillStyle = HAIR // 眉毛
    ctx.fillRect(30, 52, 22, 5); ctx.fillRect(68, 52, 22, 5)
  }))

  // 眼睛（锚点即眼球中心）——眨眼轨道作用在 scaleY
  for (const side of ['L', 'R']) {
    parts.push(part(`eye${side}`, side === 'L' ? '左眼' : '右眼', 22, 14, 11, 7, (ctx) => {
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.ellipse(11, 7, 10, 6.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#222'
      ctx.beginPath(); ctx.arc(11, 7, 4, 0, Math.PI * 2); ctx.fill()
    }))
  }

  // 嘴型部件：每个音素一个（锚点在嘴中心）
  const mouths = {
    sil: (ctx) => { ctx.strokeStyle = '#a35a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(32, 12); ctx.stroke() },
    A: (ctx) => { ctx.fillStyle = '#7a2e2e'; ctx.beginPath(); ctx.ellipse(20, 14, 13, 11, 0, 0, Math.PI * 2); ctx.fill() },
    E: (ctx) => { ctx.fillStyle = '#7a2e2e'; ctx.beginPath(); ctx.ellipse(20, 12, 15, 7, 0, 0, Math.PI * 2); ctx.fill() },
    I: (ctx) => { ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(4, 12); ctx.lineTo(36, 12); ctx.stroke() },
    O: (ctx) => { ctx.fillStyle = '#7a2e2e'; ctx.beginPath(); ctx.ellipse(20, 13, 9, 10, 0, 0, Math.PI * 2); ctx.fill() },
    U: (ctx) => { ctx.fillStyle = '#7a2e2e'; ctx.beginPath(); ctx.ellipse(20, 13, 6, 7, 0, 0, Math.PI * 2); ctx.fill() },
    M: (ctx) => { ctx.strokeStyle = '#a35a4a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, 12); ctx.quadraticCurveTo(20, 16, 30, 12); ctx.stroke() },
    FV: (ctx) => { ctx.fillStyle = '#7a2e2e'; ctx.fillRect(8, 8, 24, 4); ctx.fillStyle = '#fff'; ctx.fillRect(8, 8, 24, 2) },
    L: (ctx) => { ctx.fillStyle = '#7a2e2e'; ctx.beginPath(); ctx.ellipse(20, 12, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d96a6a'; ctx.fillRect(15, 12, 10, 5) }
  }
  for (const [key, draw] of Object.entries(mouths)) {
    parts.push(part(`mouth_${key}`, `嘴型-${key}`, 40, 26, 20, 13, draw))
  }

  // 手臂（上臂锚点在肩，前臂锚点在肘，手锚点在腕）
  for (const side of ['L', 'R']) {
    const label = side === 'L' ? '左' : '右'
    parts.push(part(`upperArm${side}`, `${label}上臂`, 34, 84, 17, 10, (ctx) => {
      ctx.fillStyle = SUIT
      rr(ctx, 2, 0, 30, 80, 14); ctx.fill()
    }))
    parts.push(part(`foreArm${side}`, `${label}前臂`, 28, 76, 14, 8, (ctx) => {
      ctx.fillStyle = SUIT_DARK
      rr(ctx, 2, 0, 24, 72, 12); ctx.fill()
    }))
    parts.push(part(`hand${side}`, `${label}手`, 26, 30, 13, 6, (ctx) => {
      ctx.fillStyle = SKIN
      ctx.beginPath(); ctx.ellipse(13, 14, 12, 13, 0, 0, Math.PI * 2); ctx.fill()
    }))
  }

  return parts
}

// 默认骨骼装配（舞台 960x540，角色站位居中偏右，给左侧路况图版留位）
export function buildDemoRig() {
  return [
    { id: 'root', name: '根骨骼', parentId: null, x: 620, y: 520, rotation: 0, length: 60, partId: null, minAngle: -45, maxAngle: 45 },
    { id: 'torso', name: '躯干', parentId: 'root', x: 0, y: -160, rotation: 0, length: 80, partId: 'torso', minAngle: -20, maxAngle: 20 },
    { id: 'head', name: '头', parentId: 'torso', x: 0, y: -10, rotation: 0, length: 50, partId: 'head', minAngle: -25, maxAngle: 25 },
    { id: 'eyeL', name: '左眼', parentId: 'head', x: -18, y: -52, rotation: 0, length: 10, partId: 'eyeL', minAngle: 0, maxAngle: 0 },
    { id: 'eyeR', name: '右眼', parentId: 'head', x: 18, y: -52, rotation: 0, length: 10, partId: 'eyeR', minAngle: 0, maxAngle: 0 },
    { id: 'mouth', name: '嘴', parentId: 'head', x: 0, y: -30, rotation: 0, length: 10, partId: null, minAngle: 0, maxAngle: 0 },
    { id: 'upperArmL', name: '左上臂', parentId: 'torso', x: -62, y: 6, rotation: 12, length: 74, partId: 'upperArmL', minAngle: -90, maxAngle: 160 },
    { id: 'foreArmL', name: '左前臂', parentId: 'upperArmL', x: 0, y: 74, rotation: 8, length: 68, partId: 'foreArmL', minAngle: -10, maxAngle: 150 },
    { id: 'handL', name: '左手', parentId: 'foreArmL', x: 0, y: 68, rotation: 0, length: 20, partId: 'handL', minAngle: -60, maxAngle: 60 },
    { id: 'upperArmR', name: '右上臂', parentId: 'torso', x: 62, y: 6, rotation: -12, length: 74, partId: 'upperArmR', minAngle: -160, maxAngle: 90 },
    { id: 'foreArmR', name: '右前臂', parentId: 'upperArmR', x: 0, y: 74, rotation: -8, length: 68, partId: 'foreArmR', minAngle: -150, maxAngle: 10 },
    { id: 'handR', name: '右手', parentId: 'foreArmR', x: 0, y: 68, rotation: 0, length: 20, partId: 'handR', minAngle: -60, maxAngle: 60 }
  ]
}

// 默认循环轨道：眨眼 + 呼吸
export function buildDemoLoops() {
  return [
    { id: 'blinkL', name: '眨眼·左', boneId: 'eyeL', prop: 'scaleY', period: 110, min: 1, max: 0.08, phase: 0, enabled: true, mode: 'override', duty: 0.12 },
    { id: 'blinkR', name: '眨眼·右', boneId: 'eyeR', prop: 'scaleY', period: 110, min: 1, max: 0.08, phase: 0, enabled: true, mode: 'override', duty: 0.12 },
    { id: 'breath', name: '呼吸', boneId: 'torso', prop: 'scaleY', period: 90, min: 1, max: 1.03, phase: 0, enabled: true, mode: 'override', duty: 1 }
  ]
}

// 音素表
export const PHONEMES = [
  { key: 'sil', label: '闭口 sil' },
  { key: 'A', label: '啊 A' },
  { key: 'E', label: '诶 E' },
  { key: 'I', label: '衣 I' },
  { key: 'O', label: '喔 O' },
  { key: 'U', label: '乌 U' },
  { key: 'M', label: '抿嘴 M' },
  { key: 'FV', label: '咬唇 FV' },
  { key: 'L', label: '翘舌 L' }
]
