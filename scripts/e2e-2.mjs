/**
 * 江城万物怪 2.0 · 探索切片 E2E（CDP，零依赖）
 * 用法：npm run shots:2
 * 前置：npm run build && npm run preview（8787）
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const OUT = resolve(process.env.SHOTS_OUT || 'docs/shots-2');
const PORT = 9334;
const PROFILE = join(os.tmpdir(), `jcm-cdp2-${Date.now()}`);

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
const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const cdp = await connect(target.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
cdp.on((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails?.text ?? 'unknown exception');
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    const text = msg.params.entry.text ?? 'unknown log error';
    // AI 模型的 502/504 是产品允许的降级路径，客户端会回落规则；不作为 E2E 失败
    if (/50[24]/.test(text) && /模型|Gateway|Bad Gateway/.test(text)) {
      console.warn(`  （允许的 AI 降级错误）${text}`);
    } else {
      errors.push(text);
    }
  }
});

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluate failed');
  return result.result.value;
}

async function waitFor(selector, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return true;
    await sleep(120);
  }
  throw new Error(`等待元素超时：${selector}`);
}

async function waitForExpression(expression, timeout = 10000, label = '条件') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(150);
  }
  throw new Error(`等待超时：${label}`);
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
  if (!ok) throw new Error(`找不到可点击元素：${text}`);
}

async function setViewport(width, height, mobile) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: Boolean(mobile) });
}

async function shot(name) {
  await sleep(350);
  const metrics = await cdp.send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize ?? metrics.contentSize;
  const clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 4000), scale: 1 };
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  console.log(`  截图 ${file}`);
}

try {
  console.log('· 捕获站');
  await setViewport(1440, 1000, false);
  await cdp.send('Page.navigate', { url: `${BASE}/?v2=1` });
  await waitFor('.v2-app');
  await waitFor('.v2-sample');
  await shot('01-v2-capture');

  const health = await evaluate(`fetch('/api/health').then((r) => r.json())`);
  console.log(`  模型：${health?.ai?.available ? health.ai.model : '不可用（规则模式）'}`);

  console.log('· 选雨伞 → 证据确认');
  await clickText('雨伞', '.v2-sample');
  await waitFor('.v2-confirm');
  const chips = await evaluate(`document.querySelectorAll('.v2-chip').length`);
  if (chips < 3) errors.push(`证据标签过少：${chips}`);
  // 模拟一次用户确认：点击第一个非确认标签
  await evaluate(`(() => {
    const chip = [...document.querySelectorAll('.v2-chip')].find((n) => n.getAttribute('data-source') !== 'user_confirmed');
    if (chip) chip.click();
    return Boolean(chip);
  })()`);
  await shot('02-v2-confirm');

  console.log('· 召唤');
  await clickText('召唤它', '.v2-btn');
  await waitFor('.v2-summon-overlay', 5000);
  await shot('03-v2-summon');
  await waitFor('.v2-party-slots', 6000);
  await shot('04-v2-party');

  console.log('· 出发 / 地图事件');
  await clickText('打开江城地图', '.v2-btn');
  await waitFor('.v2-world-map');
  await clickText('开始探索 · 江风渡口', '.v2-btn');
  await waitFor('.v2-node-panel');
  await waitFor('.v2-choice');
  await shot('05-v2-map');
  await clickText('点灯', '.v2-choice');
  await sleep(600);
  const nodeText = await evaluate(`(document.querySelector('.v2-node-panel')?.textContent || '')`);
  if (!/当前节点/.test(nodeText) && !/队伍全灭|进入战斗|挑战 Boss/.test(nodeText)) {
    errors.push('事件选择后地图没有推进或没有进入下一节点');
  }
  await shot('06-v2-map-after-event');

  console.log('· 进入战斗');
  await clickText('进入战斗', '.v2-btn');
  await waitFor('.v2-battle');
  if (health?.ai?.available) {
    await waitForExpression(
      `Boolean(document.querySelector('.v2-intent[data-source="ai"]')) || Boolean(document.querySelector('.v2-battle-end'))`,
      15000,
      'AI 选招或战斗结束',
    ).catch(() => console.warn('  注意：首回合 AI 未在 15s 内返回，规则意图继续'));
  }
  await shot('07-v2-battle');

  console.log('· 打完整场');
  for (let i = 0; i < 14; i += 1) {
    if (await evaluate(`Boolean(document.querySelector('.v2-result'))`)) break;
    if (health?.ai?.available) {
      await waitForExpression(
        `document.querySelector('.v2-intent')?.getAttribute('data-source') === 'ai' || Boolean(document.querySelector('.v2-result'))`,
        7000,
        '本回合 AI 选招',
      ).catch(() => console.warn('  注意：本回合 AI 未在 7s 内返回，规则意图继续'));
    }
    const clicked = await evaluate(`(() => {
      const enabled = [...document.querySelectorAll('.v2-skill:not(:disabled)')];
      const target = enabled[0];
      if (!target) return false;
      target.click();
      return true;
    })()`);
    if (!clicked) {
      await evaluate(`(() => { const g = document.querySelector('.v2-skill-guard:not(:disabled)'); if (g) g.click(); return Boolean(g); })()`);
    }
    await sleep(850);
  }
  await waitFor('.v2-result', 8000);
  const resultText = await evaluate(`(document.querySelector('.v2-result')?.textContent || '')`);
  if (!/胜|负|平/.test(resultText)) errors.push('结算页没有胜负文案');
  if (!/决策来源/.test(resultText)) errors.push('结算页没有决策来源');
  await shot('08-v2-result');

  const storeCheck = await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return { ok: false };
    const save = JSON.parse(raw);
    return { ok: true, count: save.collection.length, party: save.party.ids.length, run: Boolean(save.run), legacy: save.legacyCards.length };
  })()`);
  console.log(`  存档：${JSON.stringify(storeCheck)}`);
  if (!storeCheck.ok || storeCheck.count < 4) errors.push('召唤后存档没有持久化新角色');

  console.log('· 回到地图 / 图鉴');
  await clickText('回到地图', '.v2-btn').catch(async () => {
    await clickText('回地图', '.v2-btn');
  });
  await waitFor('.v2-node-panel');
  await shot('09-v2-map-progress');
  await clickText('图鉴', '.v2-nav-tab');
  await waitFor('.v2-codex-grid');
  await shot('10-v2-codex');
  await clickText('指引', '.v2-nav-tab');
  await waitFor('.v2-guide-panel');
  await shot('22-v2-guide');
  await clickText('关闭', '.v2-btn');
  const codexText = await evaluate(`(document.querySelector('.v2-panel')?.textContent || '')`);
  if (!/只/.test(codexText)) errors.push('图鉴没有显示造物数量');

  console.log('· 上传照片 → 语义标签（真实 AI）');
  await clickText('捕获站', '.v2-nav-tab');
  await waitFor('.v2-sample');
  await cdp.send('DOM.enable');
  const { root: uploadRoot } = await cdp.send('DOM.getDocument');
  const { nodeId: uploadNode } = await cdp.send('DOM.querySelector', {
    nodeId: uploadRoot.nodeId,
    selector: 'input[type=file]',
  });
  if (!uploadNode) throw new Error('找不到上传输入框');
  await cdp.send('DOM.setFileInputFiles', {
    nodeId: uploadNode,
    files: [resolve('docs/shots/09-mobile-card.png')],
  });
  await waitFor('.v2-confirm', 30000);
  await waitForExpression(
    `(document.querySelector('.v2-confirm')?.textContent || '').includes('实时 AI 语义') || (document.querySelector('.v2-confirm')?.textContent || '').includes('AI 识别失败') || (document.querySelector('.v2-confirm')?.textContent || '').includes('本地像素与标签规则')`,
    60000,
    '上传语义识别完成',
  );
  const uploadText = await evaluate(`(document.querySelector('.v2-confirm')?.textContent || '')`);
  if (health?.ai?.available && !/实时 AI 语义/.test(uploadText)) {
    console.warn('  注意：模型可用，但上传链路走了降级/本地模式');
  }
  await shot('15-v2-upload');

  console.log('· Boss 阶段预览（直接推进到 Boss 节点）');
  await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return false;
    const save = JSON.parse(raw);
    if (!save.run) return false;
    if (save.run) save.run.nodeIndex = 4;
    if (save.regionRuns?.river) save.regionRuns.river.nodeIndex = 4;
    save.run.completed = false;
    save.run.startResonance = 2;
    localStorage.setItem('jcm.v2.save', JSON.stringify(save));
    return true;
  })()`);
  await cdp.send('Page.navigate', { url: `${BASE}/?v2=1` });
  await waitFor('.v2-app');
  await clickText('江城地图', '.v2-nav-tab');
  await waitFor('.v2-node-panel');
  await clickText('挑战 Boss', '.v2-btn');
  await waitFor('.v2-battle');
  if (health?.ai?.available) {
    await waitForExpression(
      `Boolean(document.querySelector('.v2-intent[data-source="ai"]'))`,
      15000,
      'Boss 首回合 AI 选招',
    ).catch(() => console.warn('  注意：Boss 首回合 AI 未返回，规则意图继续'));
  }
  await shot('13-v2-boss');
  for (let i = 0; i < 16; i += 1) {
    if (await evaluate(`Boolean(document.querySelector('.v2-result'))`)) break;
    if (health?.ai?.available) {
      await waitForExpression(
        `document.querySelector('.v2-intent')?.getAttribute('data-source') === 'ai' || Boolean(document.querySelector('.v2-result'))`,
        7000,
        'Boss 回合 AI 选招',
      ).catch(() => {});
    }
    const clicked = await evaluate(`(() => {
      const enabled = [...document.querySelectorAll('.v2-skill:not(:disabled)')];
      if (!enabled[0]) return false;
      enabled[0].click();
      return true;
    })()`);
    if (!clicked) {
      await evaluate(`(() => { const g = document.querySelector('.v2-skill-basic:not(:disabled)'); if (g) g.click(); return Boolean(g); })()`);
    }
    await sleep(850);
  }
  await waitFor('.v2-result', 8000);
  const bossResult = await evaluate(`(document.querySelector('.v2-result')?.textContent || '')`);
  console.log(`  Boss 结果：${/胜/.test(bossResult) ? '胜' : /负/.test(bossResult) ? '负' : '平'}`);
  if (!/AI 参与/.test(bossResult)) errors.push('Boss 结算页没有 AI 参与统计');
  await shot('14-v2-boss-result');

  console.log('· 第二区解锁 / 任务 / 进化');
  await clickText('回到地图', '.v2-btn').catch(async () => {
    await clickText('回地图', '.v2-btn');
  });
  await waitFor('.v2-world-map');
  const progress = await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return null;
    const save = JSON.parse(raw);
    return { unlocked: save.unlockedRegions, clears: save.stats.regionClears, quests: save.quests };
  })()`);
  console.log(`  五区进度：${JSON.stringify(progress)}`);
  if (progress && !progress.unlocked.includes('zao')) errors.push('江风渡口完成后没有解锁过早巷');
  await clickText('过早巷', '.v2-world-label');
  await waitFor('.v2-region-layout');
  await clickText('开始探索 · 过早巷', '.v2-btn');
  await waitFor('.v2-node-panel');
  await waitFor('.v2-choice');
  await shot('16-v2-second-region');

  await clickText('任务', '.v2-nav-tab');
  await waitFor('.v2-quest-grid');
  const claimed = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.v2-quest')].find((node) => (node.textContent || '').includes('第一场胜仗'));
    const button = card?.querySelector('button:not(:disabled)');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!claimed) console.warn('  注意：第一场胜仗任务不在可领取状态');
  await sleep(400);
  await shot('17-v2-quests');
  if (health?.ai?.available) {
    await clickText('AI 推荐下一步', '.v2-btn');
    await waitFor('.v2-guidance-bar', 12000);
    await shot('23-v2-quest-ai');
  }
  const questStore = await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return null;
    const save = JSON.parse(raw);
    return { claimed: Boolean(save.quests['q_first_win']?.claimed), materials: save.materials };
  })()`);
  if (questStore && !questStore.claimed) errors.push('任务奖励领取后没有写入存档');

  await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return false;
    const save = JSON.parse(raw);
    if (!save.collection.length) return false;
    for (const unit of save.collection) {
      unit.level = Math.max(3, unit.level);
      unit.xp = 0;
    }
    save.tokens = Math.max(3, save.tokens);
    localStorage.setItem('jcm.v2.save', JSON.stringify(save));
    return true;
  })()`);
  await cdp.send('Page.navigate', { url: `${BASE}/?v2=1` });
  await waitFor('.v2-app');
  await clickText('我的队伍', '.v2-nav-tab');
  await waitFor('.v2-party-slots');
  await clickText('成长', '.v2-btn');
  await waitFor('.v2-evolve-panel');
  if (health?.ai?.available) {
    await clickText('AI 推荐一条', '.v2-btn');
    await waitFor('.v2-evolve-card[data-recommended="true"]', 12000).catch(() => console.warn('  注意：进化 AI 未返回推荐'));
  }
  await shot('18-v2-evolve');
  const evolved = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.v2-evolve-card button')].find((node) => !node.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!evolved) errors.push('进化面板没有可用分支');
  await sleep(700);
  const evolutionStore = await evaluate(`(() => {
    const raw = localStorage.getItem('jcm.v2.save');
    if (!raw) return null;
    const save = JSON.parse(raw);
    return { evolution: save.collection[0]?.evolutionId ?? null, tokens: save.tokens, evolutions: save.stats.evolutions };
  })()`);
  console.log(`  进化结果：${JSON.stringify(evolutionStore)}`);
  if (!evolutionStore?.evolution) errors.push('进化后存档没有进化 ID');
  await shot('19-v2-evolved');

  console.log('· 移动端 375');
  await setViewport(375, 812, true);
  await cdp.send('Page.navigate', { url: `${BASE}/?v2=1` });
  await waitFor('.v2-app');
  await waitFor('.v2-sample');
  await shot('11-v2-mobile-capture');
  await clickText('雨伞', '.v2-sample');
  await waitFor('.v2-confirm');
  await shot('12-v2-mobile-confirm');
  const overflow = await evaluate(`({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })`);
  if (overflow.scroll > overflow.inner + 1) errors.push(`移动端横向溢出：${overflow.scroll} > ${overflow.inner}`);
  console.log('· 移动端地图 / 任务');
  await clickText('我的队伍', '.v2-nav-tab');
  await waitFor('.v2-party-slots');
  await clickText('打开江城地图', '.v2-btn');
  await waitFor('.v2-world-mobile');
  await waitFor('.v2-node-panel');
  await shot('20-v2-mobile-map');
  const mapOverflow = await evaluate(`({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })`);
  if (mapOverflow.scroll > mapOverflow.inner + 1) errors.push(`移动端地图横向溢出：${mapOverflow.scroll} > ${mapOverflow.inner}`);
  await clickText('任务', '.v2-nav-tab');
  await waitFor('.v2-quest-grid');
  await shot('21-v2-mobile-quests');
} catch (error) {
  errors.push(String(error?.message ?? error));
  await shot('99-v2-failure').catch(() => {});
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
console.log('\n2.0 探索切片 E2E 全部通过，截图在 docs/shots-2/');


