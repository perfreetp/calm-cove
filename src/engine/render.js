// 帧渲染器：主线程与 Worker 共用（不依赖 DOM）
// parts: { [partId]: { img, ax, ay, w, h } }，img 为 CanvasImageSource

export function drawBackdrop(ctx, W, H, meta = {}) {
  // 演播室背景
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0d2137')
  g.addColorStop(0.6, '#143a5e')
  g.addColorStop(1, '#0a1626')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // 城市剪影
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  let x = 0
  const hs = [90, 140, 70, 120, 100, 160, 80, 130, 95, 150, 75, 110]
  for (let i = 0; x < W; i++) {
    const bw = 60 + (i % 3) * 24
    ctx.fillRect(x, H - 160 - hs[i % hs.length] + 60, bw, hs[i % hs.length] + 100)
    x += bw + 14
  }
  // 左侧路况图版
  ctx.fillStyle = 'rgba(8,30,52,0.85)'
  ctx.fillRect(40, 90, 360, 300)
  ctx.strokeStyle = '#2e6da4'
  ctx.lineWidth = 2
  ctx.strokeRect(40, 90, 360, 300)
  ctx.fillStyle = '#7fd0ff'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('实时路况', 60, 124)
  // 模拟路网
  const roads = [
    [[60, 180], [180, 170], [300, 200], [380, 180]],
    [[70, 260], [200, 250], [370, 280]],
    [[60, 330], [160, 320], [260, 350], [380, 330]],
    [[140, 140], [150, 380]],
    [[280, 140], [270, 380]]
  ]
  const colors = ['#e74c3c', '#f39c12', '#2ecc71', '#2ecc71', '#f39c12']
  roads.forEach((r, i) => {
    ctx.strokeStyle = colors[i % colors.length]
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(r[0][0], r[0][1])
    for (let k = 1; k < r.length; k++) ctx.lineTo(r[k][0], r[k][1])
    ctx.stroke()
  })
  // 下三栏字幕条
  ctx.fillStyle = 'rgba(200,30,40,0.92)'
  ctx.fillRect(0, H - 64, W, 64)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText(meta.template || '路况播报', 40, H - 22)
  ctx.font = '18px sans-serif'
  ctx.fillText(meta.subtitle || '早高峰 · 环城高架车行缓慢，请提前规划出行路线', 240, H - 24)
}

export function drawFrame(ctx, opts) {
  const { width: W, height: H, bones, world, parts, phoneme, showBones, annotations, meta } = opts
  ctx.clearRect(0, 0, W, H)
  drawBackdrop(ctx, W, H, meta)

  // 按骨骼数组顺序绘制（数组顺序即层级顺序）
  for (const b of bones) {
    const m = world[b.id]
    if (!m) continue
    ctx.save()
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
    ctx.globalAlpha = Math.max(0, Math.min(1, m.opacity))
    let partId = b.partId
    if (b.id === 'mouth') partId = `mouth_${phoneme || 'sil'}`
    const p = partId && parts[partId]
    if (p && p.img) ctx.drawImage(p.img, -p.ax, -p.ay)
    ctx.restore()
  }

  if (showBones) {
    const byId = Object.fromEntries(bones.map((b) => [b.id, b]))
    for (const b of bones) {
      const m = world[b.id]
      if (!m) continue
      if (b.parentId && world[b.parentId]) {
        const pm = world[b.parentId]
        ctx.strokeStyle = 'rgba(80,200,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(pm.e, pm.f)
        ctx.lineTo(m.e, m.f)
        ctx.stroke()
      }
      ctx.fillStyle = '#ffd54a'
      ctx.beginPath()
      ctx.arc(m.e, m.f, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8a6d00'
      ctx.stroke()
    }
  }

  // 当前帧批注点
  if (annotations && annotations.length) {
    annotations.forEach((a, i) => {
      ctx.fillStyle = a.status === 'fixed' ? '#2ecc71' : a.status === 'rejected' ? '#95a5a6' : '#e74c3c'
      ctx.beginPath()
      ctx.arc(a.x, a.y, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), a.x, a.y)
      ctx.textAlign = 'start'
      ctx.textBaseline = 'alphabetic'
    })
  }
}
