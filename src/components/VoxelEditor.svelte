<script>
  // 体素编辑器：分层查看(牙冠/牙龈/邻牙)、可调画笔增减、左右镜像、
  // 选区框选复制粘贴、Y 向切片、本地合并减面(≤3万面)、STL 导出、问题体素定位
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import {
    VoxelGrid, LAYERS, LAYER_NAMES, LAYER_COLORS, GRID_SIZE, VOXEL_MM,
    generateInitialTooth
  } from '../../shared/voxel.js';
  import { mergeAndDecimate, exportSTL } from '../../shared/mesh.js';
  import { FACE_COUNT_MAX } from '../../shared/voxel.js';

  export let restorationType = 'crown';
  export let initialVoxelData = null;   // 已保存的序列化体素
  export let readOnly = false;          // 复核定位模式
  export let focusVoxel = null;         // {x,y,z} 复核员点击问题时定位
  export let clipboard = null;          // 跨牙位复制的剪贴板（父组件持有）

  const dispatch = createEventDispatcher();

  let container;
  let renderer, scene, camera, controls;
  let layerMeshes = {};                 // layer -> InstancedMesh
  let grid;
  let boxMesh;                          // 不可见包围盒（射线检测用）
  let brushGhost, selectHelper, focusMarker;

  // UI 状态
  let activeLayer = 'crown';
  let brushSize = 2;
  let mirrorOn = false;
  let tool = 'brush';                   // brush | select | paste
  let sliceY = GRID_SIZE;               // 切片：只显示 y < sliceY
  let layerVisible = { crown: true, gingiva: true, adjacent: true };
  let selA = null, selB = null;
  let stats = { crown: 0, gingiva: 0, adjacent: 0, solid: 0, faces: 0 };
  let message = '';

  const S = GRID_SIZE, V = VOXEL_MM;
  const toWorld = (x, y, z) => new THREE.Vector3((x + 0.5) * V, (y + 0.5) * V, (z + 0.5) * V);

  onMount(() => {
    grid = initialVoxelData ? VoxelGrid.deserialize(initialVoxelData) : generateInitialTooth(new VoxelGrid(S), restorationType);
    initScene();
    rebuildInstances();
    updateStats();
    animate();
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    renderer?.dispose();
    container?.removeChild(renderer?.domElement);
  });

  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d24);
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500);
    camera.position.set(14, 12, 14);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(S * V / 2, S * V / 2, S * V / 2);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(10, 20, 10);
    scene.add(dir);
    const gridHelper = new THREE.GridHelper(S * V, S, 0x334, 0x334);
    scene.add(gridHelper);

    // 每层一个 InstancedMesh
    const geo = new THREE.BoxGeometry(V * 0.96, V * 0.96, V * 0.96);
    for (const l of LAYERS) {
      const mat = new THREE.MeshLambertMaterial({
        color: LAYER_COLORS[l],
        transparent: l === 'adjacent',
        opacity: l === 'adjacent' ? 0.35 : 1
      });
      const im = new THREE.InstancedMesh(geo, mat, S * S * S);
      im.count = 0;
      layerMeshes[l] = im;
      scene.add(im);
    }
    // 不可见包围盒
    boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(S * V, S * V, S * V),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    boxMesh.position.set(S * V / 2, S * V / 2, S * V / 2);
    scene.add(boxMesh);
    // 画笔预览
    brushGhost = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x4fc3f7, wireframe: true, transparent: true, opacity: 0.5 })
    );
    brushGhost.visible = false;
    scene.add(brushGhost);
    // 问题定位标记
    focusMarker = new THREE.Mesh(
      new THREE.SphereGeometry(V * 1.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.85 })
    );
    focusMarker.visible = false;
    scene.add(focusMarker);

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', () => { painting = false; rebuildInstances(); updateStats(); });
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // 重建实例矩阵（按切片过滤）
  const tmpM = new THREE.Matrix4();
  function rebuildInstances() {
    for (const l of LAYERS) {
      const im = layerMeshes[l];
      let n = 0;
      for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!grid.get(l, x, y, z) || y >= sliceY) continue;
        tmpM.setPosition((x + 0.5) * V, (y + 0.5) * V, (z + 0.5) * V);
        im.setMatrixAt(n++, tmpM);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      im.visible = layerVisible[l];
    }
  }

  function updateStats() {
    stats = {
      crown: grid.count('crown'), gingiva: grid.count('gingiva'),
      adjacent: grid.count('adjacent'), solid: grid.countSolid(),
      faces: stats.faces
    };
  }

  // 体素 DDA 射线：返回 {hit:{x,y,z}, prev:{x,y,z}} prev 为命中前的空格（用于添加）
  function voxelRaycast(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hitBox = raycaster.intersectObject(boxMesh);
    let origin;
    if (hitBox.length) {
      origin = hitBox[0].point.clone().addScaledVector(raycaster.ray.direction, -0.001);
    } else {
      // 射线没打到包围盒：用与中心平面的最近点
      origin = raycaster.ray.origin.clone();
    }
    // 转到体素坐标系
    const o = origin.clone().divideScalar(V);
    const d = raycaster.ray.direction.clone();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const stepX = Math.sign(d.x) || 1, stepY = Math.sign(d.y) || 1, stepZ = Math.sign(d.z) || 1;
    const tDeltaX = Math.abs(1 / (d.x || 1e-9)), tDeltaY = Math.abs(1 / (d.y || 1e-9)), tDeltaZ = Math.abs(1 / (d.z || 1e-9));
    let tMaxX = tDeltaX * (stepX > 0 ? (x + 1 - o.x) : (o.x - x));
    let tMaxY = tDeltaY * (stepY > 0 ? (y + 1 - o.y) : (o.y - y));
    let tMaxZ = tDeltaZ * (stepZ > 0 ? (z + 1 - o.z) : (o.z - z));
    let prev = { x, y, z };
    for (let i = 0; i < 256; i++) {
      if (grid.inBounds(x, y, z) && grid.anyAt(x, y, z)) return { hit: { x, y, z }, prev };
      prev = { x, y, z };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; tMaxX += tDeltaX; }
      else if (tMaxY < tMaxZ) { y += stepY; tMaxY += tDeltaY; }
      else { z += stepZ; tMaxZ += tDeltaZ; }
      if (x < -1 || y < -1 || z < -1 || x > S || y > S || z > S) break;
    }
    return null;
  }

  let painting = false;
  let paintAdd = true;
  let lastPaintKey = '';

  function onPointerMove(e) {
    if (readOnly) return;
    const rc = voxelRaycast(e);
    if (rc && tool === 'brush') {
      const cell = paintAdd ? rc.prev : rc.hit;
      brushGhost.visible = true;
      brushGhost.position.copy(toWorld(cell.x, cell.y, cell.z));
      brushGhost.scale.setScalar(Math.max(0.5, brushSize) * V);
      if (painting) {
        const key = `${cell.x},${cell.y},${cell.z}`;
        if (key !== lastPaintKey) { lastPaintKey = key; applyBrush(cell, paintAdd); }
      }
    } else {
      brushGhost.visible = false;
    }
  }

  function onPointerDown(e) {
    if (readOnly) return;
    if (e.button === 1) return; // 中键留给 OrbitControls
    const rc = voxelRaycast(e);
    if (!rc) return;
    if (tool === 'brush') {
      painting = true;
      paintAdd = e.button === 0; // 左键增，右键减
      const cell = paintAdd ? rc.prev : rc.hit;
      lastPaintKey = `${cell.x},${cell.y},${cell.z}`;
      applyBrush(cell, paintAdd);
    } else if (tool === 'select') {
      if (!selA || (selA && selB)) { selA = rc.hit; selB = null; message = '已选起点，再点终点'; }
      else { selB = rc.hit; showSelection(); message = '选区完成，可复制'; }
    } else if (tool === 'paste') {
      doPaste(rc.prev);
    }
  }

  function applyBrush(cell, add) {
    grid.brush(activeLayer, cell.x, cell.y, cell.z, brushSize, add);
    if (mirrorOn) grid.brush(activeLayer, grid.mirrorCoord(cell.x), cell.y, cell.z, brushSize, add);
    throttledRebuild();
    dispatch('edit');
  }

  let rebuildTimer = null;
  function throttledRebuild() {
    if (rebuildTimer) return;
    rebuildTimer = setTimeout(() => { rebuildTimer = null; rebuildInstances(); updateStats(); }, 60);
  }

  // 选区框
  function showSelection() {
    if (selectHelper) scene.remove(selectHelper);
    if (!selA || !selB) return;
    const min = { x: Math.min(selA.x, selB.x), y: Math.min(selA.y, selB.y), z: Math.min(selA.z, selB.z) };
    const max = { x: Math.max(selA.x, selB.x), y: Math.max(selA.y, selB.y), z: Math.max(selA.z, selB.z) };
    const box = new THREE.Box3(
      new THREE.Vector3(min.x * V, min.y * V, min.z * V),
      new THREE.Vector3((max.x + 1) * V, (max.y + 1) * V, (max.z + 1) * V)
    );
    selectHelper = new THREE.Box3Helper(box, 0xffee58);
    scene.add(selectHelper);
  }

  function copySelection() {
    if (!selA || !selB) { message = '请先框选'; return; }
    const min = { x: Math.min(selA.x, selB.x), y: Math.min(selA.y, selB.y), z: Math.min(selA.z, selB.z) };
    const max = { x: Math.max(selA.x, selB.x), y: Math.max(selA.y, selB.y), z: Math.max(selA.z, selB.z) };
    clipboard = grid.extractBox(min, max);
    dispatch('clipboard', clipboard);
    message = `已复制选区 ${clipboard.dims.x}×${clipboard.dims.y}×${clipboard.dims.z}，可切换到其他牙位粘贴`;
    selA = selB = null;
    if (selectHelper) scene.remove(selectHelper);
  }

  function doPaste(anchor) {
    if (!clipboard) { message = '剪贴板为空，请先在源牙位框选并复制'; return; }
    const n = grid.pasteBox(clipboard, anchor.x, anchor.y, anchor.z);
    message = `已粘贴 ${n} 个体素`;
    rebuildInstances(); updateStats();
    dispatch('edit');
  }

  // 合并减面 + 导出 STL
  function doExport() {
    const { mesh, faceCountBefore, faceCountAfter, withinLimit } = mergeAndDecimate(grid);
    stats.faces = faceCountAfter;
    if (!withinLimit) { message = `减面后仍 ${faceCountAfter} 面，超过 ${FACE_COUNT_MAX} 上限，无法导出`; return null; }
    const buf = exportSTL(mesh, `tooth`);
    const blob = new Blob([buf], { type: 'model/stl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tooth_${Date.now()}.stl`;
    a.click();
    URL.revokeObjectURL(a.href);
    message = `合并前 ${faceCountBefore} 面 → 减面后 ${faceCountAfter} 面，STL 已导出`;
    return { faceCount: faceCountAfter };
  }

  // 保存模型到服务器
  async function doSave() {
    const merged = mergeAndDecimate(grid);
    if (!merged.withinLimit) { message = `面数 ${merged.faceCountAfter} 超上限，请先减面`; return; }
    stats.faces = merged.faceCountAfter;
    dispatch('save', {
      voxelData: grid.serialize(),
      voxelCount: grid.countSolid(),
      faceCount: merged.faceCountAfter
    });
    message = '模型已保存';
  }

  // 复核定位：聚焦到问题体素
  $: if (focusVoxel && scene) {
    focusMarker.position.copy(toWorld(focusVoxel.x, focusVoxel.y, focusVoxel.z));
    focusMarker.visible = true;
    controls.target.copy(focusMarker.position);
    const dir = camera.position.clone().sub(controls.target).normalize().multiplyScalar(6);
    camera.position.copy(focusMarker.position.clone().add(dir));
    // 自动切片到问题所在层，保证可见
    if (focusVoxel.y >= sliceY) { sliceY = focusVoxel.y + 1; rebuildInstances(); }
  }

  let raf;
  function animate() {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
</script>

<div class="editor-wrap">
  <div class="viewport" bind:this={container}></div>
  <div class="toolbar">
    {#if !readOnly}
      <div class="row">
        <span class="lbl">工具</span>
        {#each [['brush', '画笔'], ['select', '框选'], ['paste', '粘贴']] as [t, name]}
          <button class:active={tool === t} on:click={() => { tool = t; message = t === 'paste' ? '点击目标位置粘贴' : ''; }}>{name}</button>
        {/each}
        <button on:click={copySelection} disabled={tool !== 'select'}>复制选区</button>
      </div>
      <div class="row">
        <span class="lbl">图层</span>
        {#each LAYERS as l}
          <button class:active={activeLayer === l} on:click={() => activeLayer = l}>{LAYER_NAMES[l]}</button>
        {/each}
        <label class="chk"><input type="checkbox" bind:checked={mirrorOn} /> 左右镜像</label>
      </div>
      <div class="row">
        <span class="lbl">显示</span>
        {#each LAYERS as l}
          <label class="chk"><input type="checkbox" bind:checked={layerVisible[l]} on:change={rebuildInstances} /> {LAYER_NAMES[l]}</label>
        {/each}
        <span class="lbl">切片Y</span>
        <input type="range" min="1" max={S} bind:value={sliceY} on:input={rebuildInstances} />
        <span>{sliceY}</span>
      </div>
      <div class="row">
        <span class="lbl">画笔尺寸</span>
        <input type="range" min="0.5" max="6" step="0.5" bind:value={brushSize} />
        <span>{brushSize} 体素</span>
        <span class="hint">左键增 / 右键减 / 拖动旋转</span>
      </div>
      <div class="row">
        <button class="primary" on:click={doSave}>保存模型</button>
        <button on:click={doExport}>合并减面并导出 STL</button>
        <span class="hint">面数上限 {FACE_COUNT_MAX}</span>
      </div>
    {:else}
      <div class="row">
        <span class="lbl">显示</span>
        {#each LAYERS as l}
          <label class="chk"><input type="checkbox" bind:checked={layerVisible[l]} on:change={rebuildInstances} /> {LAYER_NAMES[l]}</label>
        {/each}
        <span class="lbl">切片Y</span>
        <input type="range" min="1" max={S} bind:value={sliceY} on:input={rebuildInstances} />
        <span>{sliceY}</span>
      </div>
    {/if}
    <div class="row stats">
      <span>牙冠 {stats.crown}</span><span>牙龈 {stats.gingiva}</span><span>邻牙 {stats.adjacent}</span>
      <span>实体 {stats.solid}</span><span>面数 {stats.faces || '-'}</span>
      {#if message}<span class="msg">{message}</span>{/if}
    </div>
  </div>
</div>

<style>
  .editor-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .viewport { flex: 1; min-height: 320px; border-radius: 6px; overflow: hidden; }
  .toolbar { padding: 8px; background: #23262e; border-radius: 6px; margin-top: 6px; font-size: 13px; }
  .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; flex-wrap: wrap; }
  .lbl { color: #8a90a0; min-width: 56px; }
  .hint { color: #6a7080; font-size: 12px; }
  .chk { display: flex; align-items: center; gap: 3px; color: #c8ccd8; }
  button { background: #2e3340; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  button.active { background: #2f6fed; border-color: #2f6fed; color: #fff; }
  button.primary { background: #1f9d55; border-color: #1f9d55; color: #fff; }
  button:disabled { opacity: 0.4; cursor: default; }
  .stats { color: #9aa0b0; gap: 14px; }
  .msg { color: #ffd54f; }
  input[type="range"] { width: 110px; }
</style>
