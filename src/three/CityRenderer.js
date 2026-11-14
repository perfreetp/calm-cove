import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { resolveBuilding } from '../core/city.js'
import { TINTS } from '../core/city.js'
import { facadeTexture, facadeRepeat } from './textures.js'

export function makeLabelSprite(text, { color = '#dbe7ef', bg = 'rgba(9,20,28,0.78)', border = 'rgba(120,180,200,0.45)', size = 15, scale = 1 } = {}) {
  const pad = 14
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = `${size}px "Microsoft YaHei", "PingFang SC", sans-serif`
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2
  const h = size + pad * 1.6
  canvas.width = w * 2
  canvas.height = h * 2
  ctx.scale(2, 2)
  ctx.font = font
  ctx.fillStyle = bg
  roundRect(ctx, 1, 1, w - 2, h - 2, 7)
  ctx.fill()
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  roundRect(ctx, 1, 1, w - 2, h - 2, 7)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad, h / 2 + 0.5)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
  )
  sprite.scale.set((w / h) * 6 * scale, 6 * scale, 1)
  sprite.center.set(0.5, 0)
  sprite.renderOrder = 20
  sprite.userData.labelHeight = 6 * scale
  sprite.userData.labelRatio = w / h
  return sprite
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function makeRouteRibbon(line, { width = 24, color = 0x3c4f59, y = 0.12 } = {}) {
  const group = new THREE.Group()
  const pos = []
  const idx = []
  for (let i = 0; i < line.length; i++) {
    const p = line[i]
    const q = line[Math.min(line.length - 1, i + 1)]
    const a = Math.atan2(q.z - p.z, q.x - p.x)
    const nx = -Math.sin(a) * (width / 2)
    const nz = Math.cos(a) * (width / 2)
    pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz)
    if (i > 0) {
      const b = (i - 1) * 2
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  group.add(mesh)

  // 车道中心虚线
  const dashGeo = new THREE.BufferGeometry()
  const dpos = []
  for (let i = 1; i < line.length; i++) {
    if (i % 3 !== 0) continue
    const p = line[i]
    const q = line[Math.min(line.length - 1, i + 1)]
    const a = Math.atan2(q.z - p.z, q.x - p.x)
    const nx = -Math.sin(a) * 0.55
    const nz = Math.cos(a) * 0.55
    const len = 7
    dpos.push(p.x - Math.cos(a) * len, y + 0.02, p.z - Math.sin(a) * len)
    dpos.push(p.x + Math.cos(a) * len, y + 0.02, p.z + Math.sin(a) * len)
  }
  dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3))
  const dashes = new THREE.LineSegments(dashGeo, new THREE.LineBasicMaterial({ color: 0xc8d5cf, transparent: true, opacity: 0.35 }))
  group.add(dashes)
  return group
}

export class CityRenderer {
  constructor(container, opts = {}) {
    this.container = container
    this.opts = opts
    this.buildings = new Map()
    this.stationGroup = new THREE.Group()
    this.highlightGroup = new THREE.Group()
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.selectedId = null
    this.hoverId = null
    this.disposed = false

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1d27)
    scene.fog = new THREE.FogExp2(0x0d1d27, 0.00036)
    this.scene = scene

    const camera = new THREE.PerspectiveCamera(46, 1, 0.6, 26000)
    camera.position.set(-560, 720, 900)
    this.camera = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.maxPolarAngle = Math.PI * 0.487
    controls.minDistance = 90
    controls.maxDistance = 5200
    controls.target.set(0, 0, 0)
    this.controls = controls

    scene.add(new THREE.HemisphereLight(0xb6d8ea, 0x2b3238, 1.55))
    const sun = new THREE.DirectionalLight(0xffe9cc, 2.6)
    sun.position.set(-620, 900, 520)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const cam = sun.shadow.camera
    cam.near = 100
    cam.far = 3600
    cam.left = -1600
    cam.right = 1600
    cam.top = 1600
    cam.bottom = -1600
    sun.shadow.bias = -0.0006
    scene.add(sun)
    this.sun = sun
    const fill = new THREE.DirectionalLight(0x86b8d6, 0.9)
    fill.position.set(700, 400, -600)
    scene.add(fill)

    this.buildGround()
    scene.add(this.stationGroup)
    scene.add(this.highlightGroup)

    this.clock = new THREE.Clock()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onClick = this.onClick.bind(this)
    renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    renderer.domElement.addEventListener('click', this.onClick)
    this.animate()
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2b33, roughness: 1 })
    const ground = new THREE.Mesh(geo, mat)
    ground.receiveShadow = true
    ground.position.y = -0.02
    this.scene.add(ground)

    const grid = new THREE.GridHelper(9000, 90, 0x2a4a57, 0x1d3540)
    grid.position.y = 0.01
    grid.material.transparent = true
    grid.material.opacity = 0.5
    this.scene.add(grid)
  }

  setDistrict(district) {
    this.clearDistrict()
    this.district = district
    if (!district) return
    this.scene.add(makeRouteRibbon(district.line, { width: 26 }))
    this.routeGroup = this.scene.children[this.scene.children.length - 1]

    const matCache = new Map()
    for (const b of district.buildings) {
      const s = resolveBuilding(b)
      const geo = new THREE.BoxGeometry(s.width, s.height, s.depth)
      geo.translate(0, s.height / 2, 0)
      const key = `${s.styleKey}|${s.tint}|${district.seed}`
      let mats = matCache.get(key)
      if (!mats) {
        const tex = facadeTexture(s.styleKey, s.tint, district.seed)
        const rep = facadeRepeat({ ...b, overrides: {} }, district.seed)
        const side = new THREE.MeshStandardMaterial({
          map: tex.clone(),
          roughness: s.styleKey === 'glass' ? 0.28 : 0.86,
          metalness: s.styleKey === 'glass' ? 0.55 : 0.08
        })
        side.map.needsUpdate = true
        side.map.wrapS = THREE.RepeatWrapping
        side.map.repeat.set(Math.max(1, Math.round(b.base.width / 18)), Math.max(1, Math.round((b.base.floors || 6) / 4)))
        const top = new THREE.MeshStandardMaterial({ color: new THREE.Color(TINTS[s.tint]).multiplyScalar(0.62), roughness: 0.95 })
        mats = [side, side, top, top, side, side]
        matCache.set(key, mats)
      }
      const mesh = new THREE.Mesh(geo, mats)
      mesh.position.set(b.position.x, 0, b.position.z)
      mesh.rotation.y = b.rotationY
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.buildingId = b.id
      mesh.userData.baseHeight = s.height
      this.scene.add(mesh)
      this.buildings.set(b.id, mesh)

      if (s.roofType === 'setback' && s.height > 30) {
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(s.width * 0.62, s.height * 0.18, s.depth * 0.62),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(TINTS[s.tint]).multiplyScalar(0.5), roughness: 0.9 })
        )
        crown.position.set(b.position.x, s.height + s.height * 0.09, b.position.z)
        crown.rotation.y = b.rotationY
        crown.castShadow = true
        crown.userData.buildingId = b.id
        this.scene.add(crown)
        this.buildings.set(`${b.id}__crown`, crown)
      }
      if (s.roofType === 'gable') {
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(s.width * 0.76, 4.2, 4),
          new THREE.MeshStandardMaterial({ color: 0x5a4a44, roughness: 0.95 })
        )
        roof.rotation.y = b.rotationY + Math.PI / 4
        roof.position.set(b.position.x, s.height + 2.1, b.position.z)
        roof.castShadow = true
        roof.userData.buildingId = b.id
        this.scene.add(roof)
        this.buildings.set(`${b.id}__roof`, roof)
      }
    }
    this.fitCamera(0.3)
  }

  clearDistrict() {
    for (const [id, mesh] of this.buildings) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
      else mesh.material.dispose()
    }
    this.buildings.clear()
    for (const obj of this.scene.children.slice()) {
      if (obj.userData?.isStation || obj.userData?.isRoute) this.scene.remove(obj)
    }
  }

  setLabelVisibility(visible) {
    this.stationGroup.traverse((o) => {
      if (o.isSprite) o.visible = visible
    })
    this.showLabels = visible
  }

  setStations(stations, district, opts = {}) {
    this.stationGroup.clear()
    if (!district) return
    for (const st of stations) {
      const group = new THREE.Group()
      const color = st.level === 'bad' ? 0xe0524a : st.level === 'warn' ? 0xe0a63a : st.transfer ? 0x62b0c8 : 0x8fd0b6
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.5, 2.2),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: 0.22 })
      )
      platform.position.y = 0.25
      platform.castShadow = true
      group.add(platform)
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 30, 8),
        new THREE.MeshStandardMaterial({ color: 0xeaf4f8, emissive: color, emissiveIntensity: 0.85 })
      )
      pole.position.y = 15
      group.add(pole)
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(6.4, 8.6, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
      )
      halo.rotation.x = -Math.PI / 2
      halo.position.y = 0.06
      group.add(halo)
      // 竖向光柱：远景也能一眼看到站点位置
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 2.6, 66, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
          depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
        })
      )
      beam.position.y = 33
      beam.renderOrder = 12
      group.add(beam)
      group.position.set(st.x, 0, st.z)
      group.rotation.y = st.angle || 0
      group.userData.isStation = true
      group.userData.stationId = st.stationId
      group.userData.level = st.level || 'ok'

      const label = makeLabelSprite(`${st.order}. ${st.name}`, {
        color: st.level === 'bad' ? '#ffd9d6' : '#e2eef4',
        border: st.level === 'bad' ? 'rgba(224,82,74,0.9)' : 'rgba(126,200,196,0.55)',
        bg: st.level === 'bad' ? 'rgba(70,20,18,0.88)' : 'rgba(8,22,30,0.82)',
        size: 13,
        scale: 1
      })
      label.position.set(0, 46, 0)
      label.visible = opts.labels !== false
      group.add(label)
      this.stationGroup.add(group)
    }
  }

  setHighlights(list = []) {
    this.highlightGroup.clear()
    for (const h of list) {
      const geo = new THREE.CylinderGeometry(h.radius || 26, h.radius || 26, 0.3, 40, 1, true)
      const mat = new THREE.MeshBasicMaterial({
        color: h.color || 0xe0a63a,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false
      })
      const ring = new THREE.Mesh(geo, mat)
      ring.position.set(h.x, 0.2, h.z)
      this.highlightGroup.add(ring)
    }
  }

  selectBuilding(id) {
    this.selectedId = id
    this.applySelection()
  }

  applySelection() {
    for (const [key, mesh] of this.buildings) {
      const baseId = mesh.userData.buildingId
      const isSel = baseId === this.selectedId
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => {
          if (!m.emissive) return
          m.emissive.setHex(isSel ? 0x2a7086 : 0x000000)
          m.emissiveIntensity = isSel ? 0.55 : 0
        })
      }
    }
  }

  fitCamera(fraction = 1) {
    if (!this.district) return
    const pts = this.district.line
    const n = pts.length
    // routeSpan: 要覆盖的线路长度（米）。默认聚焦线首 700m，楼栋与站台看得清。
    const routeSpan = fraction >= 1 ? Infinity : fraction >= 0.62 ? 2600 : fraction >= 0.4 ? 1900 : 1350
    let idxB = n - 1
    if (Number.isFinite(routeSpan)) {
      const cum = this.district.line.map((p, i) =>
        i === 0 ? 0 : Math.hypot(p.x - this.district.line[i - 1].x, p.z - this.district.line[i - 1].z)
      )
      let acc = 0
      idxB = 1
      for (let i = 1; i < n; i++) {
        acc += cum[i]
        if (acc >= routeSpan) { idxB = i; break }
      }
    }
    const a = pts[0]
    const b = pts[idxB]
    const cx = (a.x + b.x) / 2
    const cz = (a.z + b.z) / 2
    const span = Math.max(120, Math.hypot(b.x - a.x, b.z - a.z))
    const aspect = this.camera.aspect || 1.6
    const vFov = (this.camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const dist = span / (2 * Math.tan(hFov / 2)) / 0.86
    this.controls.target.set(cx, 10, cz)
    this.camera.position.set(cx - span * 0.12, Math.max(120, dist * 0.58), cz + dist * 0.72)
    this.camera.far = Math.max(12000, dist * 6)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  focusStation(st) {
    if (!st) return
    this.controls.target.set(st.x, 0, st.z)
    const dist = 150
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    const target = new THREE.Vector3(st.x, 0, st.z).add(dir.multiplyScalar(dist))
    this.animateCamera(target, new THREE.Vector3(st.x, 4, st.z))
  }

  animateCamera(pos, target, duration = 900) {
    const fromPos = this.camera.position.clone()
    const fromTarget = this.controls.target.clone()
    const start = performance.now()
    const step = () => {
      if (this.disposed) return
      const t = Math.min(1, (performance.now() - start) / duration)
      const e = t < 0.5 ? 2 * t * t : 1 - (1 - t) ** 2 * 2
      this.camera.position.lerpVectors(fromPos, pos, e)
      this.controls.target.lerpVectors(fromTarget, target, e)
      this.controls.update()
      if (t < 1) requestAnimationFrame(step)
    }
    step()
  }

  setView(preset) {
    if (!this.district) return
    if (preset === 'top') {
      const t = this.controls.target
      this.animateCamera(new THREE.Vector3(t.x, 1400, t.z + 1), new THREE.Vector3(t.x, 0, t.z))
    } else if (preset === 'street') {
      // 站在车行道中心线上、沿线路方向望向远处，避免把相机放进楼里
      const line = this.district.line
      const i = Math.floor(line.length * 0.24)
      const j = Math.min(line.length - 1, i + 12)
      const p = line[i]
      const q = line[j]
      const ang = Math.atan2(q.z - p.z, q.x - p.x)
      const back = 60
      const px = p.x - Math.cos(ang) * back
      const pz = p.z - Math.sin(ang) * back
      const tx = p.x + Math.cos(ang) * 130
      const tz = p.z + Math.sin(ang) * 130
      this.animateCamera(new THREE.Vector3(px, 8.5, pz), new THREE.Vector3(tx, 9, tz))
    } else if (preset === 'full') {
      this.fitCamera(1)
      this.animateCamera(this.camera.position.clone(), this.controls.target.clone())
    } else {
      this.fitCamera(0.3)
    }
  }

  onPointerMove(e) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes = [...this.buildings.values()]
    const hits = this.raycaster.intersectObjects(meshes, false)
    const id = hits[0]?.object.userData.buildingId || null
    if (id !== this.hoverId) {
      this.hoverId = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      if (this.opts.onHover) this.opts.onHover(id)
    }
  }

  onClick(e) {
    // 不依赖 pointermove 的悬停缓存：点击时自行投射，触屏/快速点击也能选中
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects([...this.buildings.values()], false)
    const id = hits[0]?.object.userData.buildingId || null
    if (id && this.opts.onPick) this.opts.onPick(id)
  }

  resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
  }

  animate() {
    if (this.disposed) return
    this.raf = requestAnimationFrame(() => this.animate())
    this.controls.update()
    this.updateSpriteScale()
    this.renderer.render(this.scene, this.camera)
  }

  /** 站点标注保持近似恒定的屏幕尺寸，远景近景都可读 */
  updateSpriteScale() {
    const groups = this.stationGroup.children
    if (!groups.length) return
    const vFov = (this.camera.fov * Math.PI) / 180
    for (const g of groups) {
      // 每个 sprite 按自身到相机的距离缩放，近处字大、远处字小但始终可读
      const camPos = this.camera.position
      for (const child of g.children) {
        if (!child.isSprite || !child.userData.labelHeight) continue
        child.getWorldPosition(this._tmp || (this._tmp = new THREE.Vector3()))
        const d = camPos.distanceTo(this._tmp)
        const screenH = 0.038 // 约占视口高度的 2.6%
        const k = (2 * Math.tan(vFov / 2) * d * screenH) / child.userData.labelHeight
        const h = child.userData.labelHeight * k
        child.scale.set(h * (child.userData.labelRatio || 4), h, 1)
      }
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.clearDistrict()
    this.stationGroup.clear()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
