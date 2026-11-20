/** 2.0 AI 路由：analyze-object / battle-director / quest-director / evolution-guide。 */
import { randomUUID } from 'node:crypto';
import { AI_AVAILABLE, MODEL } from '../config.mjs';
import { rateLimited, readJsonBody, sendJson } from '../lib/http.mjs';
import {
  AnalyzeObjectRequestSchema,
  BattleDirectorV2RequestSchema,
  BattleDirectorV2OutputSchema,
  EvolutionGuideOutputSchema,
  EvolutionGuideRequestSchema,
  QuestDirectorOutputSchema,
  QuestDirectorRequestSchema,
  callAnalyzeObject,
  callBattleDirectorV2,
  callEvolutionGuide,
  callQuestDirector,
  cleanModelText,
  coerceAnalyzeObject,
} from '../lib/ai.mjs';

const ROUTES = new Set([
  '/api/ai/analyze-object',
  '/api/ai/battle-director',
  '/api/ai/quest-director',
  '/api/ai/evolution-guide',
]);

function methodAllowed(req, res) {
  if (req.method === 'POST') return true;
  sendJson(res, 405, { error: 'method_not_allowed' });
  return false;
}

function parseBodyError(res, body) {
  if (!body.error) return false;
  sendJson(res, body.error === 'payload_too_large' ? 413 : 400, { error: body.error });
  return true;
}

async function handleAnalyzeObject(req, res, ip) {
  if (rateLimited(ip, 'analyze-object', 30)) {
    sendJson(res, 429, { error: 'rate_limited', message: '请求太密集，等一分钟再试。' });
    return;
  }
  const body = await readJsonBody(req, 8 * 1024 * 1024);
  if (parseBodyError(res, body)) return;
  const parsed = AnalyzeObjectRequestSchema.safeParse(body.payload);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 4) });
    return;
  }
  if (!AI_AVAILABLE) {
    sendJson(res, 503, { error: 'AI_NOT_CONFIGURED', message: '未配置模型 Key，请使用本地标签规则。' });
    return;
  }
  const requestId = randomUUID();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  const onClientClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientClose);
  try {
    const { parsed: raw, meta } = await callAnalyzeObject(parsed.data, controller.signal);
    const plan = coerceAnalyzeObject(raw);
    if (!plan) {
      sendJson(res, 200, {
        mode: 'fallback',
        plan: null,
        meta: { model: MODEL, latencyMs: Date.now() - started, requestId, note: '模型没有给出合法标签，客户端将使用本地规则' },
      });
      return;
    }
    const observed = plan.observed.map((item) => ({ ...item, source: 'vision_observed' }));
    const inferred = plan.inferred.map((item) => ({ ...item, source: 'model_inferred' }));
    const latencyMs = Date.now() - started;
    console.log(`[analyze-object] ${requestId} tags=${observed.length + inferred.length} ${latencyMs}ms ok`);
    sendJson(res, 200, {
      mode: 'live_ai',
      plan: {
        observed,
        inferred,
        categorySuggestion: plan.categorySuggestion,
        roleHint: plan.roleHint,
        name: plan.name,
        flavor: plan.flavor,
        confidence: plan.confidence,
      },
      meta: { model: MODEL, latencyMs, requestId, note: '语义标签建议；数值与技能由规则编译器生成', reasoningChars: meta.reasoningChars ?? 0 },
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const clientGone = res.destroyed || !res.writable;
    console.warn(`[analyze-object] ${requestId} ${Date.now() - started}ms failed: ${aborted ? (clientGone ? 'client_abort' : 'timeout') : error?.message}`);
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? 'model_timeout' : 'model_error',
      message: aborted ? '模型 40 秒内没有回应。' : '模型调用失败。',
    });
  } finally {
    clearTimeout(timer);
    res.removeListener('close', onClientClose);
  }
}

async function handleBattleDirector(req, res, ip) {
  if (rateLimited(ip, 'battle-director', 60)) {
    sendJson(res, 429, { error: 'rate_limited', message: '决策请求太密集，等一分钟再试。' });
    return;
  }
  const body = await readJsonBody(req, 256 * 1024);
  if (parseBodyError(res, body)) return;
  const parsed = BattleDirectorV2RequestSchema.safeParse(body.payload);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 4) });
    return;
  }
  if (!AI_AVAILABLE) {
    sendJson(res, 503, { error: 'AI_NOT_CONFIGURED', message: '未配置模型 Key，由规则导演行动。' });
    return;
  }
  const requestId = randomUUID();
  const started = Date.now();
  const legal = new Set(parsed.data.actions.map((action) => action.id));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const onClientClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientClose);
  try {
    const { parsed: raw, meta } = await callBattleDirectorV2(parsed.data, controller.signal);
    const plan = BattleDirectorV2OutputSchema.safeParse(raw);
    if (!plan.success || !legal.has(plan.data.actionId)) {
      sendJson(res, 200, {
        mode: 'fallback',
        plan: null,
        meta: { model: MODEL, latencyMs: Date.now() - started, requestId, note: '模型没有给出合法行动，客户端将使用规则导演' },
      });
      return;
    }
    const reason = cleanModelText(plan.data.reason, 36) || '按当前局面行动';
    const taunt = cleanModelText(plan.data.taunt ?? '', 44);
    const latencyMs = Date.now() - started;
    console.log(`[battle-director] ${requestId} round=${parsed.data.round} action=${plan.data.actionId} ${latencyMs}ms ok`);
    sendJson(res, 200, {
      mode: 'live_ai',
      plan: { actionId: plan.data.actionId, reason, ...(taunt ? { taunt } : {}) },
      meta: { model: MODEL, latencyMs, requestId, note: 'AI 选行动，伤害/阶段/胜负仍由规则引擎执行', reasoningChars: meta.reasoningChars ?? 0 },
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    const clientGone = res.destroyed || !res.writable;
    console.warn(`[battle-director] ${requestId} ${Date.now() - started}ms failed: ${aborted ? (clientGone ? 'client_abort' : 'timeout') : error?.message}`);
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? 'model_timeout' : 'model_error',
      message: aborted ? 'AI 10 秒内没有给出行动。' : 'AI 决策失败。',
    });
  } finally {
    clearTimeout(timer);
    res.removeListener('close', onClientClose);
  }
}

async function handleQuestDirector(req, res, ip) {
  if (rateLimited(ip, 'quest-director', 30)) {
    sendJson(res, 429, { error: 'rate_limited', message: '请求太密集，等一分钟再试。' });
    return;
  }
  const body = await readJsonBody(req, 128 * 1024);
  if (parseBodyError(res, body)) return;
  const parsed = QuestDirectorRequestSchema.safeParse(body.payload);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 4) });
    return;
  }
  if (!AI_AVAILABLE) {
    sendJson(res, 503, { error: 'AI_NOT_CONFIGURED', message: '未配置模型 Key，由规则推荐任务。' });
    return;
  }
  const requestId = randomUUID();
  const started = Date.now();
  const legal = new Set(parsed.data.quests.map((quest) => quest.id));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const onClientClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientClose);
  try {
    const { parsed: raw, meta } = await callQuestDirector(parsed.data, controller.signal);
    const plan = QuestDirectorOutputSchema.safeParse(raw);
    if (!plan.success || !legal.has(plan.data.questId)) {
      sendJson(res, 200, {
        mode: 'fallback',
        plan: null,
        meta: { model: MODEL, latencyMs: Date.now() - started, requestId, note: '模型没有给出合法任务，客户端使用规则推荐' },
      });
      return;
    }
    const latencyMs = Date.now() - started;
    console.log(`[quest-director] ${requestId} quest=${plan.data.questId} ${latencyMs}ms ok`);
    sendJson(res, 200, {
      mode: 'live_ai',
      plan: {
        questId: plan.data.questId,
        reason: cleanModelText(plan.data.reason, 48),
        hint: cleanModelText(plan.data.hint, 48),
      },
      meta: { model: MODEL, latencyMs, requestId, note: 'AI 只推荐合法任务，奖励与进度仍由规则记录', reasoningChars: meta.reasoningChars ?? 0 },
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    console.warn(`[quest-director] ${requestId} failed: ${aborted ? 'timeout' : error?.message}`);
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? 'model_timeout' : 'model_error',
      message: aborted ? 'AI 8 秒内没有给出建议。' : 'AI 推荐失败。',
    });
  } finally {
    clearTimeout(timer);
    res.removeListener('close', onClientClose);
  }
}

async function handleEvolutionGuide(req, res, ip) {
  if (rateLimited(ip, 'evolution-guide', 30)) {
    sendJson(res, 429, { error: 'rate_limited', message: '请求太密集，等一分钟再试。' });
    return;
  }
  const body = await readJsonBody(req, 128 * 1024);
  if (parseBodyError(res, body)) return;
  const parsed = EvolutionGuideRequestSchema.safeParse(body.payload);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 4) });
    return;
  }
  if (!AI_AVAILABLE) {
    sendJson(res, 503, { error: 'AI_NOT_CONFIGURED', message: '未配置模型 Key，由规则推荐分支。' });
    return;
  }
  const requestId = randomUUID();
  const started = Date.now();
  const legal = new Set(parsed.data.branches.map((branch) => branch.id));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const onClientClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientClose);
  try {
    const { parsed: raw, meta } = await callEvolutionGuide(parsed.data, controller.signal);
    const plan = EvolutionGuideOutputSchema.safeParse(raw);
    if (!plan.success || !legal.has(plan.data.branchId)) {
      sendJson(res, 200, {
        mode: 'fallback',
        plan: null,
        meta: { model: MODEL, latencyMs: Date.now() - started, requestId, note: '模型没有给出合法分支，客户端使用规则推荐' },
      });
      return;
    }
    const latencyMs = Date.now() - started;
    console.log(`[evolution-guide] ${requestId} branch=${plan.data.branchId} ${latencyMs}ms ok`);
    sendJson(res, 200, {
      mode: 'live_ai',
      plan: {
        branchId: plan.data.branchId,
        reason: cleanModelText(plan.data.reason, 56),
        warning: cleanModelText(plan.data.warning, 56),
      },
      meta: { model: MODEL, latencyMs, requestId, note: 'AI 只推荐合法进化分支，数值由规则应用', reasoningChars: meta.reasoningChars ?? 0 },
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    console.warn(`[evolution-guide] ${requestId} failed: ${aborted ? 'timeout' : error?.message}`);
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? 'model_timeout' : 'model_error',
      message: aborted ? 'AI 8 秒内没有给出建议。' : 'AI 建议失败。',
    });
  } finally {
    clearTimeout(timer);
    res.removeListener('close', onClientClose);
  }
}

export async function handleV2Routes(req, res, url, ip) {
  if (!ROUTES.has(url.pathname)) return false;
  if (!methodAllowed(req, res)) return true;
  switch (url.pathname) {
    case '/api/ai/analyze-object':
      await handleAnalyzeObject(req, res, ip);
      return true;
    case '/api/ai/battle-director':
      await handleBattleDirector(req, res, ip);
      return true;
    case '/api/ai/quest-director':
      await handleQuestDirector(req, res, ip);
      return true;
    case '/api/ai/evolution-guide':
      await handleEvolutionGuide(req, res, ip);
      return true;
    default:
      return false;
  }
}
