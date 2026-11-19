import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeMonster,
  getHealth,
  modeLabel,
  planEnemyAction,
  resetHealthCache,
  callLog,
} from '../client';
import { SAMPLES } from '../../../features/monsters/samples';
import { localAnalyzer } from '../../../features/monsters/analyze';
import { buildMonster } from '../../../features/monsters/build';
import { ENEMIES } from '../../../features/monsters/enemies';
import { createBattle } from '../../../features/monsters/battle';
import { buildBattlePlanPayload } from '../../../features/monsters/plan';

const vision = SAMPLES[0].vision;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const validDraft = SAMPLES[0].draft;

describe('AI 适配器：三种模式与降级', () => {
  beforeEach(() => {
    resetHealthCache();
    callLog.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('演示模式不请求模型，日志标注 demo', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/api/health')
        ? jsonResponse({ ok: true, ai: { available: false, model: '', provider: 'x' } })
        : jsonResponse({}, 500),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeMonster({ source: 'demo', vision }, () => localAnalyzer(vision), {
      preferLive: false,
    });

    expect(result.mode).toBe('demo');
    expect(result.draft).not.toBeNull();
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/api/monsters/analyze'))).toBe(false);
    expect(callLog[0].mode).toBe('demo');
  });

  it('实时 AI 返回合法草稿时标记 live_ai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'test-model', provider: 'mock' } })
          : jsonResponse({
              mode: 'live_ai',
              vision,
              draft: validDraft,
              meta: { model: 'test-model', latencyMs: 12, requestId: 'r1', note: 'ok' },
            }),
      ),
    );

    const result = await analyzeMonster({ source: 'demo', vision }, () => localAnalyzer(vision), {
      preferLive: true,
    });

    expect(result.mode).toBe('live_ai');
    const monster = buildMonster({
      id: 'x',
      vision: result.vision,
      draft: result.draft,
      source: 'demo',
      generationMode: result.mode,
    });
    // 模型给的草稿不能改变数值区间
    expect(monster.stats.hp).toBeLessThanOrEqual(100);
    expect(monster.generationMode).toBe('live_ai');
    expect(callLog[0].mode).toBe('live_ai');
  });

  it('模型 500 时降级为规则生成，并记下失败原因', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'test-model', provider: 'mock' } })
          : jsonResponse({ error: 'model_error' }, 500),
      ),
    );

    const result = await analyzeMonster({ source: 'demo', vision }, () => localAnalyzer(vision), {
      preferLive: true,
    });

    expect(result.mode).toBe('fallback');
    expect(result.draft).not.toBeNull();
    expect(result.note).toContain('降级');
    expect(callLog[0].mode).toBe('fallback');
    expect(callLog[0].ok).toBe(false);
  });

  it('模型返回不合法 JSON 时不崩溃，回退到本地草稿', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'm', provider: 'mock' } })
          : jsonResponse({ mode: 'live_ai', vision, draft: { element: 'fire' } }),
      ),
    );

    const result = await analyzeMonster({ source: 'upload', vision }, () => localAnalyzer(vision), {
      preferLive: true,
    });

    expect(result.mode).toBe('fallback');
    expect(result.draft?.element).toBe('food');
  });

  it('没有后端时健康检查失败，仍可完整生成', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const health = await getHealth(true);
    expect(health.ok).toBe(false);
    expect(health.aiAvailable).toBe(false);

    const result = await analyzeMonster({ source: 'demo', vision }, () => localAnalyzer(vision), {
      preferLive: true,
    });
    expect(result.mode).toBe('demo');
    expect(result.draft).not.toBeNull();
  });

  it('模式标签对用户可读', () => {
    expect(modeLabel('live_ai')).toBe('实时 AI');
    expect(modeLabel('demo')).toBe('演示模式');
    expect(modeLabel('fallback')).toBe('降级模式');
  });
});

describe('敌方 AI 指挥官适配器（P1）', () => {
  const monster = buildMonster({
    id: 'plan-mon',
    vision: SAMPLES[0].vision,
    draft: SAMPLES[0].draft,
    source: 'demo',
    generationMode: 'demo',
  });
  const enemy = ENEMIES[0];
  const payload = () => buildBattlePlanPayload(createBattle(monster, enemy, 'plan-seed'), enemy);

  beforeEach(() => {
    resetHealthCache();
    callLog.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('演示模式不请求模型，返回 demo，由规则意图接管', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/api/health')
        ? jsonResponse({ ok: true, ai: { available: false, model: '', provider: 'x' } })
        : jsonResponse({}, 500),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await planEnemyAction(payload(), enemy.skills, { preferLive: false });
    expect(result.mode).toBe('demo');
    expect(result.plan).toBeNull();
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/api/battle/plan'))).toBe(false);
    expect(callLog[0].mode).toBe('demo');
  });

  it('实时 AI 返回合法计划时标记 live_ai，并再次用白名单校验', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'test-model', provider: 'mock' } })
          : jsonResponse({
              mode: 'live_ai',
              plan: { skill: 'QUICK', reason: '抢一下先手', taunt: '雾里先动' },
              meta: { model: 'test-model', latencyMs: 9, requestId: 'p1', note: 'ok' },
            }),
      ),
    );

    const result = await planEnemyAction(payload(), enemy.skills, { preferLive: true });
    expect(result.mode).toBe('live_ai');
    expect(result.plan?.skill).toBe('QUICK');
    expect(result.plan?.taunt).toBe('雾里先动');
    expect(callLog[0].endpoint).toBe('/api/battle/plan');
    expect(callLog[0].mode).toBe('live_ai');
  });

  it('模型给出白名单外招式时降级，不污染战斗', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'm', provider: 'mock' } })
          : jsonResponse({
              mode: 'live_ai',
              plan: { skill: 'RECOVER', reason: '偷偷回血' },
              meta: { model: 'm', latencyMs: 9, requestId: 'p2', note: '' },
            }),
      ),
    );

    const result = await planEnemyAction(payload(), enemy.skills, { preferLive: true });
    expect(result.mode).toBe('fallback');
    expect(result.plan).toBeNull();
    expect(callLog[0].ok).toBe(false);
  });

  it('接口 500 或超时不崩溃，回落到规则意图', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'm', provider: 'mock' } })
          : jsonResponse({ error: 'model_error' }, 500),
      ),
    );

    const result = await planEnemyAction(payload(), enemy.skills, { preferLive: true });
    expect(result.mode).toBe('fallback');
    expect(result.plan).toBeNull();
    expect(result.note).toContain('规则意图');
  });
});
