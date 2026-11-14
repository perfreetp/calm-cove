import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { OBJ_TYPES, FENCE_HEIGHT } from '../constants'
import {
  groundHeight,
  validatePoint,
  buildFenceChain
} from '../lib/geometry'

const ZONE_STYLE = {
  river: { color: 0x2b7fb8, opacity: 0.42 },
  road: { color: 0x8a8f98, opacity: 0.35 },
  cattle: { color: 0xd98a2b, opacity: 0.38 }
}

// 沿路径生成带状地面贴条
function makeRibbon(path, width, color, opacity, raised = 0.03) {
  const pts = path.map(([x, z]) => new THREE.Vector2(x, z))
  const verts = []
  const indices = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dz = next.y - prev.y
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    const half = width / 2
    const lx = p.x + nx * half
    const lz = p.y + nz * half
    const rx = p.x - nx * half
    const rz = p.y - nz * half
    verts.push(lx, groundHeight(lx, lz) + raised, lz)
    verts.push(rx, groundHeight(rx, rz) + raised, rz)
    if (i < pts.length - 1) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  return new THREE.Mesh(geo, mat)
}

// 已有围栏:半透明矮墙
function makeFenceWall(path) {
  const group = new THREE.Group()
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]
    const [bx, bz] = path[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const geo = new THREE.BoxGeometry(0.4, FENCE_HEIGHT, len)
    const mat = new THREE.MeshStandardMaterial({ color: 0x9c6b41, transparent: true, opacity: 0.55 })
    const mesh = new THREE.Mesh(geo, mat)
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    mesh.position.set(mx, groundHeight(mx, mz) + FENCE_HEIGHT / 2, mz)
    mesh.rotation.y = Math.atan2(bx - ax, bz - az)
    group.add(mesh)
  }
  return group
}

function makeObjectMesh(obj, conflict) {
  const y = groundHeight(obj.x, obj.z)
  const conf = !!conflict
  const group = new THREE.Group()
  group.position.set(obj.x, y, obj.z)
  group.rotation.y = obj.rotY || 0
  group.userData.objId = obj.id

  const matColor = conf ? 0xe05252 : new THREE.Color(OBJ_TYPES[obj.type].color).getHex()
  const mat = new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.7 })

  if (obj.type === 'post') {
    const geo = new THREE.BoxGeometry(0.18, 1.1, 0.18)
    const m = new THREE.Mesh(geo, mat)
    m.position.y = 0.55
    m.castShadow = true
    group.add(m)
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10),
      new THREE.MeshStandardMaterial({ color: conf ? 0xff8080 : 0x777064 })
    )
    cap.position.y = 1.13
    group.add(cap)
  } else if (obj.type === 'gate') {
    const w = 4
    const postGeo = new THREE.BoxGeometry(0.2, 1.3, 0.2)
    const barMat = new THREE.MeshStandardMaterial({ color: conf ? 0xff8080 : 0x2f6fb0, metalness: 0.3, roughness: 0.5 })
    for (const sx of [-w / 2, w / 2]) {
      const p = new THREE.Mesh(postGeo, barMat)
      p.position.set(sx, 0.65, 0)
      p.castShadow = true
      group.add(p)
    }
    const barTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, 0.12), barMat)
    barTop.position.y = 1.25
    group.add(barTop)
    const barMid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.07), barMat)
    barMid.position.y = 0.65
    group.add(barMid)
  } else if (obj.type === 'water') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.65, 0.25, 20),
      new THREE.MeshStandardMaterial({ color: conf ? 0xff8080 : 0x1f9ed4 })
    )
    base.position.y = 0.125
    base.castShadow = true
    group.add(base)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: conf ? 0xffb0b0 : 0x9edcff })
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.26
    group.add(rim)
  }
  return group
}

export default function ThreeScene({
  terrain,
  objects,
  spacingMode,
  selectedId,
  transformMode,
  readOnly,
  conflictIds,
  onSelect,
  onMove,
  onHud
}) {
  const mountRef = useRef(null)
  const stateRef = useRef(null)
  const propsRef = useRef({})
  propsRef.current = { terrain, objects, spacingMode, selectedId, transformMode, readOnly, conflictIds, onSelect, onMove, onHud }

  // 初始化 three.js,只执行一次
  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1220)
    scene.fog = new THREE.Fog(0x0b1220, 120, 240)

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 500)
    camera.position.set(58, 48, 64)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08
    orbit.maxPolarAngle = Math.PI / 2.15
    orbit.target.set(0, 0, 0)

    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x3a3326, 0.85))
    const sun = new THREE.DirectionalLight(0xffffff, 1.35)
    sun.position.set(40, 60, 25)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -70
    sun.shadow.camera.right = 70
    sun.shadow.camera.top = 70
    sun.shadow.camera.bottom = -70
    sun.shadow.camera.far = 200
    scene.add(sun)

    // 起伏地形
    const groundGeo = new THREE.PlaneGeometry(terrain.width, terrain.depth, 80, 64)
    groundGeo.rotateX(-Math.PI / 2)
    const pos = groundGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, groundHeight(x, z))
    }
    groundGeo.computeVertexNormals()
    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 1 })
    )
    ground.receiveShadow = true
    scene.add(ground)

    const grid = new THREE.GridHelper(
      Math.max(terrain.width, terrain.depth),
      Math.max(terrain.width, terrain.depth) / 2,
      0x4a7a55,
      0x35563f
    )
    grid.position.y = 0.05
    grid.material.transparent = true
    grid.material.opacity = 0.35
    scene.add(grid)

    // 交互用隐形水平面
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(terrain.width, terrain.depth),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    plane.rotation.x = -Math.PI / 2
    plane.userData.pickPlane = true
    scene.add(plane)

    // 禁放区
    const zoneGroup = new THREE.Group()
    zoneGroup.name = 'zones'
    for (const zone of terrain.zones) {
      const st = ZONE_STYLE[zone.kind] || { color: 0x888888, opacity: 0.35 }
      zoneGroup.add(makeRibbon(zone.path, zone.width, st.color, st.opacity))
    }
    for (const f of terrain.existingFences) {
      zoneGroup.add(makeFenceWall(f.path))
    }
    scene.add(zoneGroup)

    // 动态对象层
    const objGroup = new THREE.Group()
    objGroup.name = 'objects'
    scene.add(objGroup)

    // 围栏线形层
    const lineGroup = new THREE.Group()
    lineGroup.name = 'lines'
    scene.add(lineGroup)

    // TransformControls 手柄
    const tControls = new TransformControls(camera, renderer.domElement)
    tControls.setSize(0.9)
    tControls.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value
    })
    tControls.addEventListener('objectChange', () => {
      const obj = tControls.object
      if (!obj) return
      const p = propsRef.current
      const id = obj.userData.objId
      // 桩位自动吸附地面
      obj.position.y = groundHeight(obj.position.x, obj.position.z)
      const res = validatePoint(
        obj.position.x,
        obj.position.z,
        p.terrain.zones,
        p.terrain.existingFences,
        [p.terrain.width, p.terrain.depth]
      )
      if (!res.ok) {
        p.onHud({
          kind: 'bad',
          text: `冲突:${res.conflicts.map((c) => c.name).join('、')} | 最近可放位置 (${res.nearest?.x}, ${res.nearest?.z}) 距此 ${res.nearest?.distance}m`
        })
      } else {
        p.onHud({ kind: 'ok', text: `位置 (${obj.position.x.toFixed(1)}, ${obj.position.z.toFixed(1)}) 可放置` })
      }
      p.onMove(id, {
        x: Math.round(obj.position.x * 10) / 10,
        z: Math.round(obj.position.z * 10) / 10,
        rotY: Math.round(obj.rotation.y * 100) / 100
      }, res)
    })
    tControls.addEventListener('mouseUp', () => {
      propsRef.current.onHud(null)
    })
    scene.add(tControls.getHelper ? tControls.getHelper() : tControls)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const setPointer = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    const planeHit = (e) => {
      setPointer(e)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(plane, false)[0]
      return hit ? hit.point : null
    }
    const pickObject = (e) => {
      setPointer(e)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(objGroup.children, true)
      if (!hits.length) return null
      let node = hits[0].object
      while (node && !node.userData.objId) node = node.parent
      return node?.userData.objId || null
    }

    // ---- 投放预览 ghost ----
    let ghost = null
    const onDragOver = (e) => {
      e.preventDefault()
      const p = propsRef.current
      if (p.readOnly) return
      const hit = planeHit(e)
      if (!hit) return
      const type = e.dataTransfer.types.includes('text/obj-type')
        ? e.dataTransfer.getData('text/obj-type')
        : window.__dragObjType
      if (!type) return
      if (!ghost || ghost.userData.type !== type) {
        if (ghost) scene.remove(ghost)
        ghost = makeObjectMesh({ id: 'ghost', type, x: 0, z: 0, rotY: 0 }, false)
        ghost.userData.type = type
        ghost.traverse((c) => {
          if (c.isMesh) {
            c.material = c.material.clone()
            c.material.transparent = true
            c.material.opacity = 0.65
          }
        })
        scene.add(ghost)
      }
      const gx = Math.round(hit.x * 10) / 10
      const gz = Math.round(hit.z * 10) / 10
      ghost.position.set(gx, groundHeight(gx, gz), gz)
      const res = validatePoint(
        gx, gz,
        p.terrain.zones,
        p.terrain.existingFences,
        [p.terrain.width, p.terrain.depth]
      )
      ghost.traverse((c) => {
        if (c.isMesh) c.material.color.set(res.ok ? 0x35a06b : 0xe05252)
      })
      if (!res.ok) {
        p.onHud({
          kind: 'bad',
          text: `此处不可放:${res.conflicts.map((c) => c.name).join('、')} | 最近可放 (${res.nearest?.x}, ${res.nearest?.z}) 距此 ${res.nearest?.distance}m`
        })
      } else {
        p.onHud({ kind: 'ok', text: `松开投放${OBJ_TYPES[type].name} 于 (${gx}, ${gz})` })
      }
    }
    const onDragLeave = () => {
      if (ghost) {
        scene.remove(ghost)
        ghost = null
      }
      propsRef.current.onHud(null)
    }
    const onDrop = (e) => {
      e.preventDefault()
      const p = propsRef.current
      if (p.readOnly) return
      const type = e.dataTransfer.getData('text/obj-type') || window.__dragObjType
      const hit = planeHit(e)
      if (ghost) {
        scene.remove(ghost)
        ghost = null
      }
      p.onHud(null)
      if (!type || !hit) return
      const gx = Math.round(hit.x * 10) / 10
      const gz = Math.round(hit.z * 10) / 10
      const res = validatePoint(
        gx, gz,
        p.terrain.zones,
        p.terrain.existingFences,
        [p.terrain.width, p.terrain.depth]
      )
      window.__dropResult = { type, x: gx, z: gz, res }
      // 由 React 层监听自定义事件完成入库
      renderer.domElement.dispatchEvent(new CustomEvent('obj-drop', { detail: window.__dropResult }))
    }

    // ---- 点击拾取 ----
    const onPointerDown = (e) => {
      if (e.button !== 0 || tControls.dragging) return
      const id = pickObject(e)
      propsRef.current.onSelect(id)
    }
    const onKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && propsRef.current.selectedId && !propsRef.current.readOnly) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        propsRef.current.onMove(propsRef.current.selectedId, null)
      }
    }

    const dom = renderer.domElement
    dom.addEventListener('dragover', onDragOver)
    dom.addEventListener('dragleave', onDragLeave)
    dom.addEventListener('drop', onDrop)
    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)

    let raf
    const tick = () => {
      raf = requestAnimationFrame(tick)
      orbit.update()
      renderer.render(scene, camera)
    }
    tick()

    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    stateRef.current = { scene, objGroup, lineGroup, tControls, renderer, orbit, dom, ro }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      dom.removeEventListener('dragover', onDragOver)
      dom.removeEventListener('dragleave', onDragLeave)
      dom.removeEventListener('drop', onDrop)
      dom.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      tControls.dispose()
      orbit.dispose()
      renderer.dispose()
      mount.removeChild(dom)
      stateRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 同步动态对象与线形
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const { objGroup, lineGroup, tControls } = st
    const p = propsRef.current

    // 重建对象
    while (objGroup.children.length) objGroup.remove(objGroup.children[0])
    const meshes = []
    for (const obj of objects) {
      const mesh = makeObjectMesh(obj, conflictIds.includes(obj.id))
      // 选中描边
      if (obj.id === selectedId) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.05, 8, 28),
          new THREE.MeshBasicMaterial({ color: 0xffd34d })
        )
        ring.rotation.x = Math.PI / 2
        ring.position.y = 0.06
        ring.userData.isRing = true
        mesh.add(ring)
      }
      objGroup.add(mesh)
      meshes.push(mesh)
    }

    // 重建围栏线形
    while (lineGroup.children.length) lineGroup.remove(lineGroup.children[0])
    const { edges } = buildFenceChain(objects, spacingMode)
    const byId = new Map(objects.map((o) => [o.id, o]))
    const goodPts = []
    const badSet = new Set(conflictIds)
    const badPts = []
    for (const [aId, bId] of edges) {
      const a = byId.get(aId)
      const b = byId.get(bId)
      if (!a || !b) continue
      const arr = badSet.has(aId) || badSet.has(bId) ? badPts : goodPts
      for (const h of [0.55, 1.05]) {
        arr.push(a.x, groundHeight(a.x, a.z) + h, a.z)
        arr.push(b.x, groundHeight(b.x, b.z) + h, b.z)
      }
    }
    const mkLines = (pts, color) => {
      if (!pts.length) return
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      const mat = new THREE.LineBasicMaterial({ color })
      lineGroup.add(new THREE.LineSegments(geo, mat))
    }
    mkLines(goodPts, 0x6fdc8c)
    mkLines(badPts, 0xff6b6b)

    // 手柄绑定
    if (selectedId && !readOnly) {
      const target = meshes.find((m) => m.userData.objId === selectedId)
      if (target) {
        tControls.attach(target)
        tControls.setMode(transformMode === 'rotate' ? 'rotate' : 'translate')
        tControls.showX = true
        tControls.showZ = true
        tControls.showY = transformMode === 'rotate'
      }
    } else {
      tControls.detach()
    }
  }, [objects, selectedId, transformMode, readOnly, conflictIds, spacingMode])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
