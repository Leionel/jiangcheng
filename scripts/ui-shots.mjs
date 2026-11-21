/**
 * 2.0 UI 走查截图（CDP，零依赖）
 * 用法：UI_SHOTS_LABEL=before node scripts/ui-shots.mjs
 * 前置：npm run build && npm run preview
 * 产物：docs/ui-shots/<label>/*.png（viewport 与整页）
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const LABEL = process.env.UI_SHOTS_LABEL || 'current';
const OUT = resolve('docs/ui-shots', LABEL);
const PORT = 9336;
const PROFILE = join(os.tmpdir(), `jcm-ui-${Date.now()}`);

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path));
if (!chromePath) throw new Error('找不到 Chrome/Edge');

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

async function waitDevtools() {
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
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
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
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, reject) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

await mkdir(OUT, { recursive: true });
await waitDevtools();
const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const cdp = await connect(target.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluate failed');
  return result.result.value;
}

async function waitFor(selector, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(100);
  }
  throw new Error(`等待元素超时：${selector}`);
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
  if (!ok) throw new Error(`找不到：${text}`);
}

async function setViewport(width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
}

async function shot(name, full = false, keepScroll = false) {
  await sleep(500);
  if (!keepScroll) await evaluate('window.scrollTo(0, 0)');
  let params = { format: 'png', captureBeyondViewport: full };
  if (full) {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize;
    params = {
      ...params,
      clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
    };
  }
  const { data } = await cdp.send('Page.captureScreenshot', params);
  const file = join(OUT, `${name}.png`);
  const buf = Buffer.from(data, 'base64');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await writeFile(file, buf);
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await rm(file, { force: true }).catch(() => {});
      await sleep(200);
    }
  }
}

async function disableAi() {
  await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return false;
    const save = JSON.parse(raw);
    save.settings = { ...save.settings, aiMode: 'demo' };
    localStorage.setItem('jcm.v2.save', JSON.stringify(save));
    return true;
  })()`);
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor('.v2-app');
}

try {
  await setViewport(1440, 900);
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor('.v2-app');
  await disableAi();

  console.log('· capture empty');
  await shot('01-capture-fold');
  await shot('01-capture-page', true);

  console.log('· capture confirm');
  await clickText('雨伞', '.v2-sample');
  await waitFor('.v2-confirm');
  await shot('02-confirm-fold');
  await shot('02-confirm-page', true);

  console.log('· summon / party');
  await clickText('召唤它', '.v2-btn');
  await waitFor('.v2-summon-overlay', 5000);
  await clickText('去队伍调整', '.v2-summon-overlay .v2-btn');
  await waitFor('.v2-party-slots', 6000);
  await shot('03-party-fold');
  await shot('03-party-page', true);

  console.log('· map');
  await clickText('打开江城地图', '.v2-btn');
  await waitFor('.v2-world-map');
  await clickText('开始探索 · 江风渡口', '.v2-btn');
  await waitFor('.v2-node-panel');
  await shot('04-map-fold');
  await shot('04-map-page', true);

  console.log('· battle');
  await clickText('点灯', '.v2-choice');
  await sleep(300);
  await clickText('进入战斗', '.v2-btn');
  await waitFor('.v2-battle');
  await shot('05-battle-fold');
  await shot('05-battle-page', true);
  const clicked = await evaluate(`(() => {
    const target = document.querySelector('.v2-skill:not(:disabled)');
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (clicked) await sleep(600);
  await shot('06-battle-action');

  console.log('· codex');
  await clickText('图鉴', '.v2-nav-tab');
  await waitFor('.v2-codex-grid');
  await shot('07-codex-fold');
  await shot('07-codex-page', true);

  console.log('· mobile');
  await setViewport(390, 844);
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor('.v2-app');
  await waitFor('.v2-sample');
  await shot('08-mobile-capture');
  await clickText('雨伞', '.v2-sample');
  await waitFor('.v2-confirm');
  await shot('09-mobile-confirm', false, true);
  await clickText('召唤它', '.v2-btn');
  await waitFor('.v2-summon-overlay', 5000);
  await clickText('去队伍调整', '.v2-summon-overlay .v2-btn');
  await waitFor('.v2-party-slots', 6000);
  await clickText('打开江城地图', '.v2-btn');
  await waitFor('.v2-node-panel');
  const enteredBattle = await evaluate(`(() => {
    const target = [...document.querySelectorAll('.v2-btn')].find((node) => /进入战斗|挑战 Boss/.test(node.textContent || ''));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (enteredBattle) {
    await waitFor('.v2-battle');
    await shot('10-mobile-battle');
  } else {
    await shot('10-mobile-map');
  }
  console.log(`UI shots → ${OUT}`);
} finally {
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
}


