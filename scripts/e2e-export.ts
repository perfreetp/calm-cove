const list = await (await fetch('http://localhost:9222/json/list')).json()
const target = list.find((t: any) => t.type === 'page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method: string, params: any = {}) => new Promise((res, rej) => {
  const mid = ++id
  pending.set(mid, { res, rej })
  ws.send(JSON.stringify({ id: mid, method, params }))
})
await new Promise((r) => (ws.onopen = r))
ws.onmessage = (ev: any) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
}
await send('Runtime.enable')
// 拦截下载，捕获 blob 内容
await send('Page.enable')
const blobs: any[] = []
ws.addEventListener('message', (ev: any) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Page.downloadWillBegin') blobs.push(m.params)
})
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: 'D:\\ccfb\\runs\\10246\\workspace\\.download-test', eventsEnabled: true }).catch(() => {})

const expr = `(async () => {
  location.hash = '#/login'; await new Promise(r => setTimeout(r, 400));
  const inputs = document.querySelectorAll('input');
  const setVal = (el, v) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v);
  setVal(inputs[0], 'planner1'); inputs[0].dispatchEvent(new Event('input', {bubbles:true}));
  setVal(inputs[1], '123456'); inputs[1].dispatchEvent(new Event('input', {bubbles:true}));
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('登')).click();
  await new Promise(r => setTimeout(r, 900));
  location.hash = '#/planner/editor/p2';
  await new Promise(r => setTimeout(r, 2500));
  // 通过 UI 走完整导出流程（2fps，脚本 110s => 221 帧）
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出 PNG')).click();
  await new Promise(r => setTimeout(r, 500));
  [...document.querySelectorAll('.el-radio-button')].find(b => b.textContent.trim() === '2').click();
  [...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.includes('开始导出')).click();
  // 等待进度完成
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const pct = document.querySelector('.el-progress__text')?.textContent || '';
    const btn = [...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.includes('开始导出'));
    if (!document.querySelector('.el-dialog')) break;
    await new Promise(r => setTimeout(r, 500));
  }
  return 'export flow finished, dialog open=' + !!document.querySelector('.el-dialog');
})()`
const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr })
console.log(r.result.value || r.result)
await new Promise(r => setTimeout(r, 2000))
console.log('download events:', JSON.stringify(blobs))
ws.close()
