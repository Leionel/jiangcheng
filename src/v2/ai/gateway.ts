import { getHealth } from '../../shared/ai/client';
import type {
  AnalyzeObjectIntent,
  BattleDirectorPlan,
  EnemyActionId,
  FeatureEvidence,
  VisionLite,
} from '../domain/types';
import { isBuildPath, isTag } from '../domain/tags';

export type AiLogEntry = {
  at: number;
  endpoint: '/api/ai/analyze-object' | '/api/ai/battle-director';
  mode: 'live_ai' | 'fallback' | 'demo';
  ok: boolean;
  latencyMs: number;
  note: string;
};

export const v2AiLog: AiLogEntry[] = [];

function log(entry: AiLogEntry): void {
  v2AiLog.unshift(entry);
  if (v2AiLog.length > 30) v2AiLog.pop();
}

function push(entry: Omit<AiLogEntry, 'at'>): void {
  log({ ...entry, at: Date.now() });
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; json: T | null; latencyMs: number }> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, json, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------- analyze_object --------------------------- */

function parseEvidence(raw: unknown): FeatureEvidence[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { tag: string; source?: string; confidence?: number; evidenceText?: string } =>
      Boolean(item && typeof item === 'object' && typeof (item as { tag?: unknown }).tag === 'string'),
    )
    .filter((item) => isTag(item.tag))
    .map((item) => ({
      tag: item.tag as FeatureEvidence['tag'],
      source: (item.source === 'user_confirmed' || item.source === 'vision_observed'
        ? item.source
        : 'model_inferred') as FeatureEvidence['source'],
      confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : undefined,
      evidenceText: typeof item.evidenceText === 'string' ? item.evidenceText.slice(0, 16) : undefined,
    }))
    .slice(0, 8);
}

export type AnalyzeObjectResult = {
  mode: 'live_ai' | 'fallback' | 'demo';
  intent: AnalyzeObjectIntent | null;
  latencyMs: number;
  note: string;
};

export async function analyzeObject(
  vision: VisionLite,
  imageDataUrl: string | undefined,
  options: { preferLive: boolean; timeoutMs?: number } = { preferLive: false },
): Promise<AnalyzeObjectResult> {
  if (!options.preferLive) {
    push({ endpoint: '/api/ai/analyze-object', mode: 'demo', ok: true, latencyMs: 0, note: '演示模式：本地标签推断' });
    return { mode: 'demo', intent: null, latencyMs: 0, note: '演示模式：本地标签推断' };
  }
  const health = await getHealth();
  if (!health.aiAvailable) {
    push({ endpoint: '/api/ai/analyze-object', mode: 'demo', ok: true, latencyMs: 0, note: '无可用模型 Key，本地标签推断' });
    return { mode: 'demo', intent: null, latencyMs: 0, note: '无可用模型 Key，本地标签推断' };
  }
  try {
    const response = await postJson<{
      mode?: string;
      plan?: Record<string, unknown>;
      meta?: { model?: string; latencyMs?: number; note?: string };
    }>(
      '/api/ai/analyze-object',
      { vision, ...(imageDataUrl ? { imageDataUrl } : {}) },
      options.timeoutMs ?? 45000,
    );
    if (!response.ok || !response.json?.plan) throw new Error(`HTTP ${response.status}`);
    const plan = response.json.plan;
    const observed = parseEvidence(plan.observed);
    const inferred = parseEvidence(plan.inferred);
    const category = typeof plan.categorySuggestion === 'string' ? plan.categorySuggestion : '';
    const roleHint = typeof plan.roleHint === 'string' && isBuildPath(plan.roleHint) ? plan.roleHint : null;
    const name = typeof plan.name === 'string' ? plan.name.replace(/[<>\s]/g, '').slice(0, 8) : '';
    const flavor = typeof plan.flavor === 'string' ? plan.flavor.replace(/[<>]/g, '').slice(0, 60) : '';
    if (observed.length === 0 && inferred.length === 0) throw new Error('模型未给出合法标签');
    const intent: AnalyzeObjectIntent = {
      observed,
      inferred,
      categorySuggestion: isTag(category) ? (category as AnalyzeObjectIntent['categorySuggestion']) : (vision.category as AnalyzeObjectIntent['categorySuggestion']),
      roleHint: roleHint ?? 'guardian',
      name,
      flavor,
      confidence: plan.confidence === 'high' || plan.confidence === 'low' ? plan.confidence : 'medium',
    };
    const latencyMs = response.json.meta?.latencyMs ?? response.latencyMs;
    push({
      endpoint: '/api/ai/analyze-object',
      mode: 'live_ai',
      ok: true,
      latencyMs,
      note: `${response.json.meta?.model ?? 'model'} · 标签 ${observed.length + inferred.length} 个`,
    });
    return { mode: 'live_ai', intent, latencyMs, note: response.json.meta?.note ?? '模型读图并给出标签建议' };
  } catch (error) {
    const message = (error as Error).message ?? '未知错误';
    push({ endpoint: '/api/ai/analyze-object', mode: 'fallback', ok: false, latencyMs: 0, note: message });
    return { mode: 'fallback', intent: null, latencyMs: 0, note: `AI 识别失败，已用本地规则：${message}` };
  }
}

/* --------------------------- battle_director --------------------------- */

export type BattleDirectorResult = {
  mode: 'live_ai' | 'fallback' | 'demo';
  plan: BattleDirectorPlan | null;
  model: string;
  latencyMs: number;
  note: string;
};

export async function battleDirector(
  payload: {
    round: number;
    maxRounds: number;
    enemy: { name: string; hpPercent: number; phase: number; kind: string };
    party: Array<{ name: string; buildPath: string; hpPercent: number; statuses: string[] }>;
    resonance: number;
    actions: Array<{ id: EnemyActionId; label: string; estimate: number }>;
    logTail: string[];
  },
  legalActions: EnemyActionId[],
  options: { preferLive: boolean; timeoutMs?: number } = { preferLive: false },
): Promise<BattleDirectorResult> {
  if (!options.preferLive) {
    return { mode: 'demo', plan: null, model: '', latencyMs: 0, note: '规则出招（演示模式）' };
  }
  const health = await getHealth();
  if (!health.aiAvailable) {
    return { mode: 'demo', plan: null, model: '', latencyMs: 0, note: '规则出招（无可用模型 Key）' };
  }
  try {
    const response = await postJson<{
      mode?: string;
      plan?: { actionId?: string; reason?: string; taunt?: string };
      meta?: { model?: string; latencyMs?: number; note?: string };
    }>('/api/ai/battle-director', payload, options.timeoutMs ?? 6000);
    if (!response.ok || !response.json?.plan) throw new Error(`HTTP ${response.status}`);
    const actionId = response.json.plan.actionId;
    if (!actionId || !legalActions.includes(actionId as EnemyActionId)) throw new Error('模型选择了不合法动作');
    const plan: BattleDirectorPlan = {
      actionId: actionId as EnemyActionId,
      reason: (response.json.plan.reason ?? '按当前局面选招').replace(/[<>]/g, '').slice(0, 36),
      taunt: (response.json.plan.taunt ?? '').replace(/[<>]/g, '').slice(0, 44),
    };
    const latencyMs = response.json.meta?.latencyMs ?? response.latencyMs;
    push({ endpoint: '/api/ai/battle-director', mode: 'live_ai', ok: true, latencyMs, note: `${response.json.meta?.model ?? 'model'} · ${plan.reason}` });
    return { mode: 'live_ai', plan, model: response.json.meta?.model ?? 'model', latencyMs, note: response.json.meta?.note ?? 'AI 选招' };
  } catch (error) {
    const message = (error as Error).message ?? '未知错误';
    push({ endpoint: '/api/ai/battle-director', mode: 'fallback', ok: false, latencyMs: 0, note: message });
    return { mode: 'fallback', plan: null, model: '', latencyMs: 0, note: `AI 决策失败，规则接管：${message}` };
  }
}
