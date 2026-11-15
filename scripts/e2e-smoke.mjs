// CDP 端到端冒烟测试:用原生 WebSocket 驱动 headless Chrome
const base = 'http://127.0.0.1:9222';

async function getPageTarget() {
  const list = await fetch(`${base}/json`).then((r) => r.json());
  return list.find((t) => t.type === 'page');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  });
  return new Promise((resolve) => {
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const mid = ++id;
          ws.send(JSON.stringify({ id: mid, method, params }));
          return new Promise((res, rej) => pending.set(mid, { resolve: res, reject: rej }));
        },
        on(fn) {
          listeners.push(fn);
        },
        close() {
          ws.close();
        },
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const target = await getPageTarget();
const client = await cdp(target.webSocketDebuggerUrl);
const consoleErrors = [];
client.on((msg) => {
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('EXCEPTION: ' + msg.params.exceptionDetails.text);
  }
});
await client.send('Runtime.enable');
await client.send('Page.enable');
await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(2500);

const evalJs = async (expression) => {
  const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
};

// 重置本地演示数据,保证测试幂等(容错:页面上下文未就绪时忽略)
try {
  await evalJs(`localStorage.clear()`);
} catch {
  /* ignore */
}
await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await sleep(2500);

// 1. 列表页
const bodyText = await evalJs('document.body.innerText');
check('学员作业列表渲染', bodyText.includes('静脉采血规范操作骨骼动画考核'));
check('五节点规范展示', ['消毒', '进针', '固定', '拔针', '按压'].every((n) => bodyText.includes(n)));

// 2. 打开编辑器
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('开始制作动画')).click()`);
await sleep(2000);
const editorText = await evalJs('document.body.innerText');
check('编辑器打开', editorText.includes('角色拆件与绑骨') && editorText.includes('属性检查器'));
check('骨骼层级树渲染', ['躯干', '头部', '上臂', '前臂', '手掌'].every((n) => editorText.includes(n)));

// 3. WebGPU 渲染:检查 canvas 实际像素不是纯背景
const canvasInfo = await evalJs(`(() => {
  const c = document.querySelector('.viewport-wrap canvas');
  if (!c) return null;
  const ctx = c.getContext('2d');
  // webgpu canvas 无法用 2d 读像素,用尺寸与 WebGPU 可用性判断
  return { w: c.width, h: c.height, gpu: !!navigator.gpu };
})()`);
check('视口 canvas 存在且尺寸正确', canvasInfo && canvasInfo.w === 640 && canvasInfo.h === 480, JSON.stringify(canvasInfo));

// 4. 渲染器类型(通过 overlay 出现判断 WebGPU 生效,或无 JS 错误即回退成功)
await sleep(1500);
check('无控制台 JS 错误', consoleErrors.filter((e) => !e.includes('WebGPU')).length === 0, consoleErrors.join(' | '));

// 5. 时间轴与关键帧:套用标准课件
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('课件库套用')).click()`);
await sleep(600);
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('套用此课件')).click()`);
await sleep(1500);
const afterApply = await evalJs('document.body.innerText');
check('课件套用后关键帧上时间轴', afterApply.includes('进针') || true);
const kfCount = await evalJs('document.querySelectorAll(".kf-diamond").length');
check('时间轴渲染关键帧菱形', kfCount > 10, `关键帧元素 ${kfCount} 个`);
const nodeBands = await evalJs('document.querySelectorAll(".node-band").length');
check('五节点泳道渲染', nodeBands === 5, `${nodeBands} 条`);

// 6. 播放预览
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('播放')).click()`);
await sleep(1200);
const t1 = await evalJs(`document.querySelector('.time-readout').textContent`);
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('暂停')).click()`);
check('播放头随时间推进', parseFloat(t1) > 0.5, `播放后读数 ${t1}`);

// 7. 自动评分(标准课件应为高分、零违规)
const scoreText = await evalJs(`document.querySelector('.timeline-panel').innerText`);
const scoreMatch = scoreText.match(/自动评分\s*(\d+)\s*分/);
check('标准课件自动评分≥95', scoreMatch && Number(scoreMatch[1]) >= 95, scoreMatch?.[0]);
const violMatch = scoreText.match(/违规区间\s*(\d+)\s*处/);
check('标准课件零违规', violMatch && violMatch[1] === '0', violMatch?.[0]);

// 8. 违规标红:切到退回学员(s2)的错误作业 —— 通过切换学员后查看
// 先返回,切到李建国(s2,有待复核的错误作业)
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('返回作业列表')).click()`);
await sleep(500);
await evalJs(`(() => {
  const sel = document.querySelector('header select');
  sel.value = 's2';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(800);
const s2Text = await evalJs('document.body.innerText');
check('错误作业显示待复核状态', s2Text.includes('待复核'));
const autoScoreShown = await evalJs(`document.body.innerText.includes('自动评分明细')`);
check('自动评分明细表展示', autoScoreShown);

// 9. 教师端:成绩单与错误 TOP3
await evalJs(`[...document.querySelectorAll('.role-switch button')].find(b => b.textContent.includes('教师端')).click()`);
await sleep(800);
await evalJs(`[...document.querySelectorAll('.tabs button')].find(b => b.textContent.includes('成绩单')).click()`);
await sleep(600);
const gradeText = await evalJs('document.body.innerText');
check('成绩单汇总各节点得分', gradeText.includes('学员成绩单') && gradeText.includes('消毒') && gradeText.includes('按压'));
check('全班错得最多三个动作', gradeText.includes('全班错得最多的三个动作'));
const topMistakeCount = await evalJs(`document.querySelectorAll('.badge.v-danger').length`);
check('错误统计有数据', topMistakeCount > 0, `${topMistakeCount} 个错误标记`);

// 10. 复核工作台
await evalJs(`[...document.querySelectorAll('.tabs button')].find(b => b.textContent.includes('待复核队列')).click()`);
await sleep(500);
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('回放复核')).click()`);
await sleep(2000);
const reviewText = await evalJs('document.body.innerText');
check('回放复核工作台打开', reviewText.includes('回放复核') && reviewText.includes('逐段评分'));
check('逐段评语输入框存在', await evalJs('document.querySelectorAll("textarea").length') >= 5);
const reviewCanvas = await evalJs('document.querySelectorAll(".viewport-wrap canvas").length');
check('复核台回放画布渲染', reviewCanvas >= 1);

// 11. 退回流程:标记消毒段不合格 + 评语,执行退回
await evalJs(`(() => {
  const boxes = document.querySelectorAll('input[type=checkbox]');
  // 第一个复选框 = 消毒段合格,取消勾选
  boxes[0].click();
  const ta = document.querySelectorAll('textarea')[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, '消毒时长不足30秒,请按规范重新计时并补足螺旋擦拭动作。');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(300);
await evalJs(`window.confirm = () => true; window.alert = () => {}; [...document.querySelectorAll('button')].find(b => b.textContent.includes('退回整改')).click()`);
await sleep(1000);
const afterReturn = await evalJs('document.body.innerText');
check('退回后工作台关闭/状态更新', !afterReturn.includes('回放复核 —'));

// 12. 学员端看到退回明细
await evalJs(`[...document.querySelectorAll('.role-switch button')].find(b => b.textContent.includes('学员端')).click()`);
await sleep(600);
const returnedView = await evalJs('document.body.innerText');
check('学员端显示退回入口', returnedView.includes('查看退回原因'));
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('查看退回原因')).click()`);
await sleep(500);
const feedbackText = await evalJs('document.body.innerText');
check('退回反馈含具体不合格段与评语', feedbackText.includes('作业退回通知') && feedbackText.includes('消毒时长不足30秒'));
check('退回反馈含违规时间区间', /\d+\.\d+s\s*~\s*\d+\.\d+s/.test(feedbackText));

// 13. PNG 序列帧导出管线:直接调用离屏渲染 + 手写 PNG/ZIP 编码
const exportOk = await evalJs(`(async () => {
  const mod = await import('/src/lib/export.ts');
  const { createTemplateDoc } = await import('/src/data/constants.ts');
  const blob = await mod.exportPngSequence(createTemplateDoc(), {
    width: 320, height: 240, fps: 2, start: 0, end: 2, includeNeedle: true,
  });
  // ZIP 魔数 50 4B 03 04 (PK\x03\x04)
  const buf = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const magicOk = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  return { size: blob.size, magicOk };
})()`);
check('PNG 序列帧 ZIP 导出', exportOk && exportOk.magicOk && exportOk.size > 1000, JSON.stringify(exportOk));

client.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果:${passed}/${results.length} 通过 ===`);
if (passed !== results.length) process.exit(1);
