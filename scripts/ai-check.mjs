/**
 * 真实接口冒烟（P1）
 *
 * 用法：node scripts/ai-check.mjs
 * 前置：npm run preview（或 npm run api）已在 8787 启动，且 .env 配了可用的模型 Key。
 *
 * 检查：
 *  1. /api/health 报告模型可用
 *  2. /api/monsters/analyze 真实返回 live_ai 草稿
 *  3. /api/battle/plan 真实返回 live_ai 出招计划，且 skill 属于敌方白名单
 *
 * 失败会以非零码退出；无 Key 时跳过并给出说明（不伪装成功）。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';

const PLAYER = {
  name: '芝麻面儿',
  element: 'food',
  hp: 82,
  maxHp: 82,
  hpPercent: 100,
  stats: { hp: 82, attack: 32, defense: 10, speed: 15 },
  skills: ['BURST', 'RECOVER'],
};

const ENEMY = {
  id: 'fog',
  name: '江雾浮沫',
  element: 'water',
  hp: 86,
  maxHp: 86,
  hpPercent: 100,
  stats: { hp: 86, attack: 26, defense: 10, speed: 17 },
  skills: ['BURST', 'QUICK'],
  taunt: '雾里看不清，它却总能先动。',
};

const CANDIDATES = [
  {
    skill: 'BURST',
    name: '元素爆发',
    kind: 'attack',
    power: 24,
    priority: 0,
    elemental: true,
    estimate: 31,
    matchup: 1.25,
    effect: '本系高威力技能，受属性克制与天气修正影响。',
  },
  {
    skill: 'QUICK',
    name: '抢先一步',
    kind: 'attack',
    power: 15,
    priority: 3,
    elemental: false,
    estimate: 18,
    matchup: 1,
    effect: '本回合优先行动（先手判定优先于速度）。',
  },
];

const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

async function postJson(path, body, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON 响应由调用方报错 */
    }
    return { ok: res.ok, status: res.status, json, text, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`· 目标 ${BASE}`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
console.log('· /api/health', JSON.stringify(health));
assert(Boolean(health?.ok), '健康检查返回 ok');
const aiAvailable = Boolean(health?.ai?.available);
if (!aiAvailable) {
  console.log('\n服务端没有可用模型 Key：本次只验证服务与降级路径，不伪造 AI 结果。');
  console.log('（设置 .env 的 AI_API_KEY 后重跑，可验证真实 AI 链路）');
  process.exit(failures.length ? 1 : 0);
}

console.log('· /api/monsters/analyze（真实模型）');
const analyze = await postJson('/api/monsters/analyze', {
  source: 'demo',
  vision: {
    primaryObject: '一碗热干面',
    category: 'food',
    colors: ['#C9822F', '#E8C88A', '#5A3A1E'],
    features: ['圆柱面条', '芝麻颗粒', '酱色浓稠', '碗装'],
    confidence: 'high',
  },
});
assert(analyze.status === 200, `analyze HTTP 200（实际 ${analyze.status}）`);
assert(analyze.json?.mode === 'live_ai', 'analyze 返回 live_ai');
assert(typeof analyze.json?.draft?.name === 'string' && analyze.json.draft.name.length > 0, 'analyze 返回非空名称');
assert(analyze.json?.meta?.latencyMs >= 0, 'analyze 记录耗时');
console.log(
  `  卡名：${analyze.json?.draft?.name ?? '—'} / 属性：${analyze.json?.draft?.element ?? '—'} / ${analyze.latencyMs}ms`,
);

console.log('· /api/battle/plan（真实模型选招）');
const plan = await postJson('/api/battle/plan', {
  round: 1,
  maxRounds: 3,
  weather: { name: '江雾', boostElement: '江流' },
  player: PLAYER,
  enemy: ENEMY,
  candidates: CANDIDATES,
  lastPlayerSkill: null,
  lastPlayerSkillName: null,
  logTail: ['第 1 回合开始 · 天气：江雾'],
  situation: ['天气「江雾」加强 江流 属性技能'],
});
assert(plan.status === 200, `plan HTTP 200（实际 ${plan.status}）`);
assert(plan.json?.mode === 'live_ai', 'plan 返回 live_ai');
assert(ENEMY.skills.includes(plan.json?.plan?.skill), `plan skill 属于敌方白名单（${plan.json?.plan?.skill}）`);
assert(typeof plan.json?.plan?.reason === 'string' && plan.json.plan.reason.length > 0, 'plan 带战术理由');
assert(typeof plan.json?.meta?.model === 'string' && plan.json.meta.model.length > 0, 'plan 记录模型名');
console.log(
  `  出招：${plan.json?.plan?.skill} · 理由：${plan.json?.plan?.reason ?? '—'} · 播报：${plan.json?.plan?.taunt ?? '—'} / ${plan.latencyMs}ms`,
);

console.log('· /api/ai/analyze-object（2.0 语义标签）');
const analyzeObject = await postJson('/api/ai/analyze-object', {
  vision: {
    primaryObject: '一把合起的雨伞',
    category: 'everyday',
    colors: ['#3B4A63', '#8FA3B8', '#D9DEE6'],
    features: ['曲面伞面', '细长伞柄', '织物纹理', '金属伞骨'],
    confidence: 'high',
  },
});
assert(analyzeObject.status === 200, `analyze-object HTTP 200（实际 ${analyzeObject.status}）`);
assert(analyzeObject.json?.mode === 'live_ai', 'analyze-object 返回 live_ai');
assert(Array.isArray(analyzeObject.json?.plan?.observed), 'analyze-object 返回 observed 标签数组');
assert(Array.isArray(analyzeObject.json?.plan?.inferred), 'analyze-object 返回 inferred 标签数组');
const tags = [...(analyzeObject.json?.plan?.observed ?? []), ...(analyzeObject.json?.plan?.inferred ?? [])];
assert(tags.length > 0, 'analyze-object 至少给出一个标签');
assert(typeof analyzeObject.json?.plan?.roleHint === 'string', 'analyze-object 给出 roleHint');
console.log(
  `  标签：${tags.map((item) => item.tag).join(' / ')} · 倾向：${analyzeObject.json?.plan?.roleHint ?? '—'} · ${analyzeObject.latencyMs}ms`,
);

console.log('· /api/ai/battle-director（2.0 探索战导演）');
const director = await postJson('/api/ai/battle-director', {
  round: 2,
  maxRounds: 8,
  enemy: { name: '风雨电台', hpPercent: 62, phase: 1, kind: 'boss' },
  party: [
    { name: '伞跃跃', buildPath: 'guardian', hpPercent: 82, statuses: [] },
    { name: '芝香面儿', buildPath: 'trickster', hpPercent: 64, statuses: ['wet'] },
    { name: '江浪仔', buildPath: 'mover', hpPercent: 90, statuses: [] },
  ],
  resonance: 3,
  actions: [
    { id: 'strike', label: '单体攻击', estimate: 19 },
    { id: 'storm', label: '暴雨', estimate: 9 },
    { id: 'guard', label: '收拢防御', estimate: 0 },
  ],
  logTail: ['第 1 回合 · 江雾浮沫冲过来', '伞跃跃使用开伞屏障'],
});
assert(director.status === 200, `battle-director HTTP 200（实际 ${director.status}）`);
assert(director.json?.mode === 'live_ai', 'battle-director 返回 live_ai');
const legalActions = ['strike', 'storm', 'guard'];
assert(
  legalActions.includes(director.json?.plan?.actionId),
  `battle-director 行动属于合法候选（${director.json?.plan?.actionId}）`,
);
console.log(
  `  行动：${director.json?.plan?.actionId} · 理由：${director.json?.plan?.reason ?? '—'} · ${director.latencyMs}ms`,
);


console.log('· /api/ai/quest-director（2.0 任务指引）');
const questDirector = await postJson('/api/ai/quest-director', {
  region: '过早巷',
  quests: [
    { id: 'q_first_win', title: '第一场胜仗', desc: '在探索战里赢下一场。', progress: 1, target: 1 },
    { id: 'q_zao_clear', title: '过早巷的锅气', desc: '击破早味大厨。', progress: 2, target: 1 },
  ],
  party: [
    { name: '伞团团', buildPath: 'guardian', level: 3 },
    { name: '面咕噜', buildPath: 'trickster', level: 3 },
    { name: '渡江仔', buildPath: 'mover', level: 3 },
  ],
  materials: 4,
  tokens: 2,
  bond: '搭把手',
});
assert(questDirector.status === 200, `quest-director HTTP 200（实际 ${questDirector.status}）`);
assert(questDirector.json?.mode === 'live_ai', 'quest-director 返回 live_ai');
assert(['q_first_win', 'q_zao_clear'].includes(questDirector.json?.plan?.questId), 'quest-director 只选合法任务');
console.log(`  任务：${questDirector.json?.plan?.questId} · 理由：${questDirector.json?.plan?.reason ?? '—'} · ${questDirector.latencyMs}ms`);

console.log('· /api/ai/evolution-guide（2.0 进化指引）');
const evolutionGuide = await postJson('/api/ai/evolution-guide', {
  creature: { name: '伞团团', level: 3, buildPath: 'guardian', stats: { hp: 95, atk: 25, def: 17, spd: 11 } },
  branches: [
    { id: 'umbrella_guard', name: '伞骨卫士', path: 'guardian', desc: '更厚更稳', statBonus: { hp: 14, atk: 1, def: 3, spd: 0 } },
    { id: 'umbrella_striker', name: '雨幕刺客', path: 'striker', desc: '更快的输出', statBonus: { hp: 6, atk: 4, def: 0, spd: 2 } },
  ],
  party: [
    { name: '面咕噜', buildPath: 'trickster', level: 2 },
    { name: '渡江仔', buildPath: 'mover', level: 2 },
  ],
  region: '江风渡口',
});
assert(evolutionGuide.status === 200, `evolution-guide HTTP 200（实际 ${evolutionGuide.status}）`);
assert(evolutionGuide.json?.mode === 'live_ai', 'evolution-guide 返回 live_ai');
assert(['umbrella_guard', 'umbrella_striker'].includes(evolutionGuide.json?.plan?.branchId), 'evolution-guide 只选合法分支');
console.log(`  分支：${evolutionGuide.json?.plan?.branchId} · 理由：${evolutionGuide.json?.plan?.reason ?? '—'} · ${evolutionGuide.latencyMs}ms`);
if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：`);
  failures.forEach((item) => console.error(' -', item));
  process.exit(1);
}
console.log('\n真实 AI 链路全部通过（analyze + battle-plan + analyze-object + battle-director + quest-director + evolution-guide）。');

