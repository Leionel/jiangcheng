/**
 * 端到端冒烟 + 截图（零依赖，走 Chrome DevTools Protocol）
 *
 * 用法：node scripts/e2e-shots.mjs
 * 前置：npm run build && node server/server.mjs（默认 http://127.0.0.1:8787）
 * 产物：docs/shots/*.png
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const OUT = resolve('docs/shots');
const PORT = 9333;
const PROFILE = join(os.tmpdir(), `jcm-cdp-${Date.now()}`);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error('找不到 Chrome/Edge，可设置 CHROME_PATH 后重试');
  process.exit(1);
}

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error('Chrome DevTools 未就绪');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
      this.listeners.forEach((fn) => fn(msg));
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((res, reject) => {
      this.pending.set(id, { resolve: res, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 20000);
    });
  }

  on(fn) {
    this.listeners.push(fn);
  }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, reject) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

const errors = [];

await mkdir(OUT, { recursive: true });
await waitForDevtools();

const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) =>
  r.json(),
);
const cdp = await connect(target.webSocketDebuggerUrl);

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
cdp.on((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails?.text ?? 'unknown exception');
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(msg.params.entry.text);
  }
});

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'evaluate failed');
  }
  return result.result.value;
}

async function waitFor(selector, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) return true;
    await sleep(120);
  }
  throw new Error(`等待元素超时：${selector}`);
}

async function waitForExpression(expression, timeout = 8000, label = '条件') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(150);
  }
  throw new Error(`等待超时：${label}`);
}

async function setViewport(width, height, mobile) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: Boolean(mobile),
  });
}

async function shot(name, { full = true } = {}) {
  await sleep(420);
  let clip;
  if (full) {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize;
    clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
  }
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
    ...(clip ? { clip } : {}),
  });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  console.log(`  截图 ${file}`);
}

async function clickText(text, selector = 'button') {
  const ok = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const target = nodes.find((n) => (n.textContent || '').includes(${JSON.stringify(text)}));
    if (!target) return false;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return true;
  })()`);
  if (!ok) throw new Error(`找不到按钮：${text}`);
}

async function click(selector, index = 0) {
  const ok = await evaluate(`(() => {
    const nodes = document.querySelectorAll(${JSON.stringify(selector)});
    const node = nodes[${index}];
    if (!node) return false;
    node.scrollIntoView({ block: 'center' });
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`点击失败：${selector}[${index}]`);
}

try {
  console.log('· 首页');
  await setViewport(1440, 1000, false);
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor('.capture');
  await shot('01-home');
  const health = await evaluate(`fetch('/api/health').then((r) => r.json())`);
  console.log(`· 模型状态：${health?.ai?.available ? health.ai.model : '不可用（演示模式）'}`);

  console.log('· 捕捉热干面 → 精灵卡');
  await click('.featured-btn');
  await waitFor('.modal', 3000);
  await shot('02-analyzing', { full: false });
  await waitFor('.reveal', 8000);
  await shot('03-card');

  const tacticCount = await evaluate(`document.querySelectorAll('.tactic-option').length`);
  if (tacticCount !== 3) errors.push(`战术选项应为 3 个，实际 ${tacticCount}`);

  console.log('· 出战');
  await clickText('出战 · 三回合');
  await waitFor('.battle');

  // P1：首回合会等敌方 AI 决策（最多 7 秒），按钮在等待期间是 disabled
  await waitForExpression(
    `Boolean(document.querySelector('.move:not(:disabled)'))`,
    16000,
    'AI 决策完成或降级后出招按钮可用',
  );
  const intentSource = await evaluate(
    `(document.querySelector('.intent')?.getAttribute('data-source') || 'none')`,
  );
  const intentText = await evaluate(
    `(document.querySelector('.intent-text')?.textContent || '').trim()`,
  );
  console.log(`  意图来源：${intentSource} · ${intentText.slice(0, 60)}`);
  if (intentSource === 'pending') errors.push('AI 决策等待超时后仍处于 pending');
  if (health.ai?.available && intentSource !== 'ai') {
    // 不直接判失败（模型偶发超时是产品要能承受的），但必须留下可见记录
    console.warn(`  注意：模型可用，但首回合意图来源为 ${intentSource}（已按降级展示）`);
  }
  await shot('04-battle');

  console.log('· 连打出招');
  for (let i = 0; i < 3; i += 1) {
    const done = await evaluate(`Boolean(document.querySelector('.result-banner'))`);
    if (done) break;
    // 后续回合不阻塞玩家输入；E2E 主动等 AI 决策到达，以验证 AI 每回合都真实参与
    if (health.ai?.available) {
      await waitForExpression(
        `(document.querySelector('.intent')?.getAttribute('data-source') === 'ai')`,
        20000,
        '下一回合 AI 选招',
      ).catch(() => {
        console.warn('  注意：本回合 AI 决策未在 20 秒内到达，已按规则意图继续');
      });
    }
    await evaluate(
      `(() => {
        const node = document.querySelector('.move:not(:disabled)');
        if (!node) return false;
        node.click();
        return true;
      })()`,
    );
    await sleep(1150);
  }
  await waitFor('.result-banner', 5000);
  await shot('05-battle-end');

  console.log('· 结算');
  await clickText('查看结算');
  await waitFor('.result');
  const resultText = await evaluate(`(document.querySelector('.result')?.textContent || '')`);
  if (!/战绩/.test(resultText)) errors.push('结算页缺少战绩展示');
  if (!/本局决策复盘/.test(resultText)) errors.push('结算页缺少决策复盘');
  const resultSeed = await evaluate(
    `((document.querySelector('.calc-note')?.textContent || '').match(/种子\\s+(seed-[a-z0-9]+)/) || [])[1] || ''`,
  );
  await shot('06-result');

  console.log('· 复现本局');
  await clickText('复现本局');
  await waitFor('.battle');
  const replaySeed = await evaluate(
    `(Array.from(document.querySelectorAll('.battle-meta .mono')).map((n) => n.textContent || '').find((t) => t.includes('种子')) || '')`,
  );
  if (!resultSeed || !replaySeed.includes(resultSeed.slice(-5))) {
    errors.push(`复现本局种子不一致：结算 ${resultSeed || '—'} / 对战 ${replaySeed || '—'}`);
  }
  await clickText('退出对战');
  await waitFor('.reveal');

  console.log('· 图鉴');
  await clickText('图鉴');
  await waitFor('.gallery');
  const recordText = await evaluate(
    `(document.querySelector('.gallery-record')?.textContent || '').trim()`,
  );
  console.log(`  图鉴战绩：${recordText || '—'}`);
  if (!recordText) errors.push('图鉴没有展示战绩');
  await shot('07-gallery');

  console.log('· 上传真实图片（走模型视觉）');
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor('.capture');
  await cdp.send('DOM.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'input[type=file]',
  });
  await cdp.send('DOM.setFileInputFiles', {
    nodeId,
    files: [resolve('docs/shots/09-mobile-card.png')],
  });
  await waitFor('.reveal', 45000);
  await shot('10-live-upload');
  const cardMode = await evaluate(
    `(document.querySelector('.card-mode')?.textContent || '').trim()`,
  );
  const cardName = await evaluate(
    `(document.querySelector('.card-name')?.textContent || '').trim()`,
  );
  const firstTag = await evaluate(
    `(document.querySelector('.reveal-body .tag')?.textContent || '').trim()`,
  );
  console.log(`  卡面：${cardName} / ${cardMode} / 首个证据：${firstTag}`);
  if (health?.ai?.available && cardMode !== '实时 AI') {
    errors.push(`模型可用，但上传链路没有走实时 AI（当前 ${cardMode}）`);
  }

  console.log('· 移动端 375');
  await setViewport(375, 812, true);
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor('.capture');
  await shot('08-mobile-home');
  await click('.featured-btn');
  await waitFor('.reveal', 8000);
  await shot('09-mobile-card');

  const overflow = await evaluate(
    `({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })`,
  );
  if (overflow.scroll > overflow.inner + 1) {
    errors.push(`移动端出现横向溢出：${overflow.scroll} > ${overflow.inner}`);
  }
} catch (error) {
  errors.push(String(error?.message ?? error));
  await shot('99-failure', { full: false }).catch(() => {});
} finally {
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
}

if (errors.length) {
  console.error('\n失败：');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\n全部通过，截图在 docs/shots/');
