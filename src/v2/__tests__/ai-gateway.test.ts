import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeObject, battleDirector, v2AiLog } from '../ai/gateway';
import { resetHealthCache } from '../../shared/ai/client';
import type { EnemyActionId, VisionLite } from '../domain/types';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const VISION: VisionLite = {
  primaryObject: '一把雨伞',
  category: 'everyday',
  colors: ['#3B4A63', '#8FA3B8', '#D9DEE6'],
  features: ['曲面伞面', '可折叠'],
  confidence: 'high',
};

describe('2.0 AI 网关：合法性与降级', () => {
  beforeEach(() => {
    resetHealthCache();
    v2AiLog.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('无实时模式时全部走本地，不发请求', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/api/health') ? jsonResponse({ ok: true, ai: { available: false } }) : jsonResponse({}, 500),
    );
    vi.stubGlobal('fetch', fetchMock);
    const analyze = await analyzeObject(VISION, undefined, { preferLive: true });
    expect(analyze.mode).toBe('demo');
    expect(analyze.intent).toBeNull();
    const plan = await battleDirector(
      {
        round: 1,
        maxRounds: 8,
        enemy: { name: '江雾浮沫', hpPercent: 100, phase: 1, kind: 'normal' },
        party: [{ name: '伞跃跃', buildPath: 'guardian', hpPercent: 100, statuses: [] }],
        resonance: 2,
        actions: [{ id: 'strike', label: '单体攻击', estimate: 12 }],
        logTail: [],
      },
      ['strike'],
      { preferLive: true },
    );
    expect(plan.mode).toBe('demo');
    expect(plan.plan).toBeNull();
  });

  it('analyze-object 合法标签被接受，非法标签被过滤；live_ai 记录日志', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'mock-model' } })
          : jsonResponse({
              mode: 'live_ai',
              plan: {
                observed: [
                  { tag: 'foldable', confidence: 0.9, evidenceText: '可折叠' },
                  { tag: 'hack_tag', confidence: 1 },
                ],
                inferred: [{ tag: 'rain', confidence: 0.7 }],
                categorySuggestion: 'tool',
                roleHint: 'guardian',
                name: '伞跃跃',
                flavor: '下雨的时候最爱逞强。',
                confidence: 'high',
              },
              meta: { model: 'mock-model', latencyMs: 12, requestId: 'r1', note: 'ok' },
            }),
      ),
    );
    const result = await analyzeObject(VISION, 'data:image/jpeg;base64,xxx', { preferLive: true });
    expect(result.mode).toBe('live_ai');
    expect(result.intent?.observed).toHaveLength(1);
    expect(result.intent?.observed[0].tag).toBe('foldable');
    expect(result.intent?.inferred[0].tag).toBe('rain');
    expect(result.intent?.name).toBe('伞跃跃');
    expect(v2AiLog[0].mode).toBe('live_ai');
  });

  it('battle-director 只接受合法 actionId；越界即降级', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'mock-model' } })
          : jsonResponse({
              mode: 'live_ai',
              plan: { actionId: 'deluge', reason: '偷一个非法动作', taunt: '雨来' },
              meta: { model: 'mock-model', latencyMs: 9, requestId: 'r2', note: '' },
            }),
      ),
    );
    const payload = {
      round: 1,
      maxRounds: 8,
      enemy: { name: '江雾浮沫', hpPercent: 100, phase: 1, kind: 'normal' },
      party: [{ name: '伞跃跃', buildPath: 'guardian', hpPercent: 100, statuses: [] as string[] }],
      resonance: 2,
      actions: [{ id: 'strike' as EnemyActionId, label: '单体攻击', estimate: 12 }],
      logTail: [] as string[],
    };
    const result = await battleDirector(payload, ['strike'], { preferLive: true });
    expect(result.mode).toBe('fallback');
    expect(result.plan).toBeNull();
    expect(v2AiLog[0].ok).toBe(false);
  });

  it('battle-director 合法计划返回 live_ai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, ai: { available: true, model: 'mock-model' } })
          : jsonResponse({
              mode: 'live_ai',
              plan: { actionId: 'storm', reason: '队伍没有护盾，暴雨压血', taunt: '雨来了' },
              meta: { model: 'mock-model', latencyMs: 9, requestId: 'r3', note: '' },
            }),
      ),
    );
    const payload = {
      round: 2,
      maxRounds: 8,
      enemy: { name: '江雾浮沫', hpPercent: 80, phase: 1, kind: 'normal' },
      party: [{ name: '伞跃跃', buildPath: 'guardian', hpPercent: 90, statuses: [] as string[] }],
      resonance: 2,
      actions: [{ id: 'storm' as EnemyActionId, label: '暴雨', estimate: 9 }],
      logTail: [] as string[],
    };
    const result = await battleDirector(payload, ['storm'], { preferLive: true });
    expect(result.mode).toBe('live_ai');
    expect(result.plan?.actionId).toBe('storm');
    expect(result.plan?.reason).toContain('暴雨');
  });
});
