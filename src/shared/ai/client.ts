import type { CallLogEntry, ExecutionMode, MonsterDraft, SkillId, VisionSummary } from '../types';
import { AnalyzeResponseSchema, BattlePlanResponseSchema } from './schemas';
import { randomId } from '../rng';
import type { BattlePlanPayload, SanitizedPlan } from '../../features/monsters/plan';
import { sanitizePlan } from '../../features/monsters/plan';

/**
 * 唯一的 AI 出口。所有组件都通过它请求模型，避免把 fetch 与密钥散落在 UI 里。
 * 只与本地 server/server.mjs 通信；密钥永远不进浏览器（见 .env.example）。
 */

export type HealthInfo = {
  ok: boolean;
  aiAvailable: boolean;
  model: string;
  provider: string;
  demoModeEnabled: boolean;
};

const DEFAULT_HEALTH: HealthInfo = {
  ok: false,
  aiAvailable: false,
  model: '',
  provider: '',
  demoModeEnabled: true,
};

let healthCache: HealthInfo | null = null;
let healthPromise: Promise<HealthInfo> | null = null;

export const callLog: CallLogEntry[] = [];
const listeners = new Set<() => void>();

export function subscribeLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function pushLog(entry: CallLogEntry) {
  callLog.unshift(entry);
  if (callLog.length > 30) callLog.pop();
  listeners.forEach((fn) => fn());
}

export async function getHealth(force = false): Promise<HealthInfo> {
  if (!force && healthCache) return healthCache;
  if (!force && healthPromise) return healthPromise;
  healthPromise = (async () => {
    try {
      const res = await fetch('/api/health', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Partial<HealthInfo> & {
        ai?: { available?: boolean; model?: string; provider?: string };
      };
      healthCache = {
        ok: true,
        aiAvailable: Boolean(json.ai?.available ?? json.aiAvailable),
        model: String(json.ai?.model ?? json.model ?? ''),
        provider: String(json.ai?.provider ?? json.provider ?? ''),
        demoModeEnabled: json.demoModeEnabled !== false,
      };
    } catch {
      // 静态托管/未启动后端：明确进入演示模式，而不是白屏
      healthCache = { ...DEFAULT_HEALTH };
    }
    return healthCache;
  })();
  return healthPromise;
}

export type AnalyzePayload = {
  source: 'demo' | 'upload';
  vision: VisionSummary;
  imageDataUrl?: string;
};

export type AnalyzeResult = {
  mode: ExecutionMode;
  model: string;
  vision: VisionSummary;
  draft: MonsterDraft | null;
  note: string;
  requestId: string;
};

/** 演示模式：完全本地、可复现，不做任何网络请求 */
export type LocalAnalyzer = (vision: VisionSummary) => MonsterDraft;

export async function analyzeMonster(
  payload: AnalyzePayload,
  localAnalyzer: LocalAnalyzer,
  options: { preferLive?: boolean; signal?: AbortSignal } = {},
): Promise<AnalyzeResult> {
  const requestId = randomId('req');
  const health = await getHealth();

  if (!options.preferLive || !health.aiAvailable) {
    pushLog({
      requestId,
      endpoint: '/api/monsters/analyze',
      mode: 'demo',
      ok: true,
      latencyMs: 0,
      note: health.aiAvailable ? '用户选择演示策略（未请求模型）' : '后端未配置模型 Key，本地规则生成',
      at: Date.now(),
    });
    return {
      mode: 'demo',
      model: '',
      vision: payload.vision,
      draft: localAnalyzer(payload.vision),
      note: health.aiAvailable ? '演示模式：本地规则生成' : '演示模式：服务端未配置模型 Key',
      requestId,
    };
  }

  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch('/api/monsters/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: payload.source,
        vision: payload.vision,
        imageDataUrl: payload.imageDataUrl,
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const parsed = AnalyzeResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error('模型返回未通过 schema 校验');

    const latencyMs = Math.round(performance.now() - started);
    pushLog({
      requestId,
      endpoint: '/api/monsters/analyze',
      mode: parsed.data.mode,
      ok: true,
      latencyMs,
      note: `${parsed.data.meta.model || 'model'} · ${parsed.data.meta.note || 'ok'}`,
      at: Date.now(),
    });

    return {
      mode: parsed.data.mode,
      model: parsed.data.meta.model,
      vision: parsed.data.vision,
      draft: parsed.data.draft,
      note: parsed.data.meta.note,
      requestId,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const aborted = (error as Error)?.name === 'AbortError';
    pushLog({
      requestId,
      endpoint: '/api/monsters/analyze',
      mode: 'fallback',
      ok: false,
      latencyMs,
      note: aborted ? '模型超时，规则引擎接管' : `调用失败：${(error as Error)?.message ?? '未知错误'}`,
      at: Date.now(),
    });
    return {
      mode: 'fallback',
      model: '',
      vision: payload.vision,
      draft: localAnalyzer(payload.vision),
      note: aborted ? '实时 AI 超时，已切换到降级模式（规则引擎按可见特征生成）' : '实时 AI 失败，已切换到降级模式',
      requestId,
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export type BattleDecisionMode = 'live_ai' | 'demo' | 'fallback';

export type BattleDecisionResult = {
  mode: BattleDecisionMode;
  /** 合法计划；为 null 时调用方必须回落到规则意图 */
  plan: SanitizedPlan | null;
  model: string;
  latencyMs: number;
  note: string;
  requestId: string;
};

/**
 * 敌方 AI 指挥官：请模型在「合法招式」里选一招。
 *
 * - 演示模式 / 无 Key / 未开启实时 AI：不请求，返回 demo，调用方用规则意图。
 * - 超时、HTTP 失败、schema 不过：返回 fallback，调用方用规则意图，界面必须标注降级。
 * - 成功：返回 live_ai 计划；skill 已按敌方技能白名单二次校验。
 */
export async function planEnemyAction(
  payload: BattlePlanPayload,
  allowedSkills: SkillId[],
  options: { preferLive?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<BattleDecisionResult> {
  const requestId = randomId('plan');
  const health = await getHealth();
  const timeoutMs = options.timeoutMs ?? 7000;

  if (!options.preferLive || !health.aiAvailable) {
    pushLog({
      requestId,
      endpoint: '/api/battle/plan',
      mode: 'demo',
      ok: true,
      latencyMs: 0,
      note: health.aiAvailable ? '规则出招（用户选择演示模式，未请求模型）' : '规则出招（无可用模型 Key）',
      at: Date.now(),
    });
    return {
      mode: 'demo',
      plan: null,
      model: '',
      latencyMs: 0,
      note: health.aiAvailable ? '演示模式：规则出招' : '演示模式：服务端未配置模型 Key',
      requestId,
    };
  }

  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch('/api/battle/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const parsed = BattlePlanResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error('计划未通过 schema 校验');

    const plan = sanitizePlan(parsed.data.plan, allowedSkills);
    if (!plan) throw new Error('模型给出的招式不在白名单内');

    const latencyMs = Math.round(performance.now() - started);
    pushLog({
      requestId,
      endpoint: '/api/battle/plan',
      mode: 'live_ai',
      ok: true,
      latencyMs,
      note: `${parsed.data.meta.model || 'model'} · ${plan.reason}`,
      at: Date.now(),
    });
    return {
      mode: 'live_ai',
      plan,
      model: parsed.data.meta.model,
      latencyMs,
      note: parsed.data.meta.note,
      requestId,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const aborted = (error as Error)?.name === 'AbortError';
    pushLog({
      requestId,
      endpoint: '/api/battle/plan',
      mode: 'fallback',
      ok: false,
      latencyMs,
      note: aborted ? 'AI 决策超时，规则意图接管' : `AI 决策失败：${(error as Error)?.message ?? '未知错误'}`,
      at: Date.now(),
    });
    return {
      mode: 'fallback',
      plan: null,
      model: '',
      latencyMs,
      note: aborted ? 'AI 决策超时，已回落到规则意图' : 'AI 决策失败，已回落到规则意图',
      requestId,
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export function modeLabel(mode: ExecutionMode): string {
  switch (mode) {
    case 'live_ai':
      return '实时 AI';
    case 'demo':
      return '演示模式';
    default:
      return '降级模式';
  }
}

export function resetHealthCache() {
  healthCache = null;
  healthPromise = null;
}
