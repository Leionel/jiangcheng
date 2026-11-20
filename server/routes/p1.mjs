/** P1 旧版路由：analyze / battle-plan（保持原行为，保护 1.x 回归）。 */
import { randomUUID } from 'node:crypto';
import { AI_AVAILABLE, MODEL } from '../config.mjs';
import { rateLimited, sendJson } from '../lib/http.mjs';
import {
  BattlePlanRequestSchema,
  DraftSchema,
  PlanOutputSchema,
  RequestSchema,
  VisionSchema,
  callBattlePlanner,
  callModel,
  cleanModelText,
} from '../lib/ai.mjs';

export async function handleP1Routes(req, res, url, ip) {
  if (url.pathname !== '/api/monsters/analyze' && url.pathname !== '/api/battle/plan') return false;
if (url.pathname === '/api/monsters/analyze') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (rateLimited(ip, 'analyze', 30)) {
      sendJson(res, 429, { error: 'rate_limited', message: '请求太密集，等一分钟再试。' });
      return true;
    }
    const chunks = [];
    let size = 0;
    const limit = 8 * 1024 * 1024;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        sendJson(res, 413, { error: 'payload_too_large', message: '图片太大，请压缩到 5MB 以内。' });
        req.destroy();
        return true;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (size > limit) return true;
      const requestId = randomUUID();
      const started = Date.now();

      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        sendJson(res, 400, { error: 'invalid_json' });
        return true;
      }

      const parsed = RequestSchema.safeParse(payload);
      if (!parsed.success) {
        sendJson(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 4) });
        return true;
      }

      if (!AI_AVAILABLE) {
        sendJson(res, 503, {
          error: 'AI_NOT_CONFIGURED',
          message: '服务端未配置 AI_API_KEY，请使用演示模式（本地规则生成）。',
        });
        return true;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 26_000);
      const onClientClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClientClose);

      try {
        const result = await callModel(parsed.data, controller.signal);
        const draft = DraftSchema.safeParse(result?.draft ?? result);
        if (!draft.success) {
          sendJson(res, 502, {
            error: 'invalid_model_output',
            message: '模型返回的字段不合法，请重试或使用演示模式。',
            issues: draft.error.issues.slice(0, 4),
          });
          return true;
        }

        const modelVision = VisionSchema.safeParse(result?.vision);
        const latencyMs = Date.now() - started;
        console.log(
          `[analyze] ${requestId} source=${parsed.data.source} image=${Boolean(parsed.data.imageDataUrl)} ${latencyMs}ms ok`,
        );

        sendJson(res, 200, {
          mode: 'live_ai',
          vision: modelVision.success ? modelVision.data : parsed.data.vision,
          draft: draft.data,
          meta: {
            model: MODEL,
            latencyMs,
            requestId,
            note: modelVision.success
              ? `模型读图并给出可见特征${draft.data.name ? '' : ''}`
              : '特征摘要来自本地，模型只负责设定',
            reasoningChars: result?._meta?.reasoningChars ?? 0,
          },
        });
      } catch (error) {
        const latencyMs = Date.now() - started;
        const aborted = error?.name === 'AbortError';
        const clientGone = res.destroyed || !res.writable;
        console.warn(
          `[analyze] ${requestId} ${latencyMs}ms failed: ${
            aborted ? (clientGone ? 'client_abort' : 'timeout') : error?.message
          }`,
        );
        sendJson(res, aborted ? 504 : 502, {
          error: aborted ? 'model_timeout' : 'model_error',
          message: aborted ? '模型 26 秒内没有回应。' : '模型调用失败。',
        });
      } finally {
        clearTimeout(timer);
        res.removeListener('close', onClientClose);
      }
    });
    return true;
  }

  if (url.pathname === '/api/battle/plan') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (rateLimited(ip, 'battle-plan', 60)) {
      sendJson(res, 429, { error: 'rate_limited', message: '决策请求太密集，等一分钟再试。' });
      return true;
    }

    const chunks = [];
    let size = 0;
    const limit = 256 * 1024;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        sendJson(res, 413, { error: 'payload_too_large', message: '战斗状态数据过大。' });
        req.destroy();
        return true;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (size > limit) return true;
      const requestId = randomUUID();
      const started = Date.now();

      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        sendJson(res, 400, { error: 'invalid_json' });
        return true;
      }

      const parsed = BattlePlanRequestSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('[battle-plan] invalid_request', JSON.stringify(parsed.error.issues.slice(0, 6)));
        sendJson(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 4) });
        return true;
      }
      if (!AI_AVAILABLE) {
        sendJson(res, 503, {
          error: 'AI_NOT_CONFIGURED',
          message: '服务端未配置 AI_API_KEY，敌方出招由规则引擎决定。',
        });
        return true;
      }

      const data = parsed.data;
      const allowed = new Set(data.enemy.skills);
      const candidateSkills = new Set(data.candidates.map((c) => c.skill));
      if (
        data.candidates.some((c) => !allowed.has(c.skill)) ||
        data.enemy.skills.some((s) => !candidateSkills.has(s))
      ) {
        console.warn('[battle-plan] invalid_candidates', data.enemy.skills, data.candidates.map((c) => c.skill));
        sendJson(res, 400, {
          error: 'invalid_candidates',
          message: '候选招式必须与敌方技能列表完全一致。',
        });
        return true;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18_000);
      const onClientClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', onClientClose);
      try {
        const { parsed: planRaw, meta } = await callBattlePlanner(data, controller.signal);
        const plan = PlanOutputSchema.safeParse(planRaw);
        if (!plan.success) {
          sendJson(res, 502, {
            error: 'invalid_model_output',
            message: '模型没有给出合法的出招计划。',
            issues: plan.error.issues.slice(0, 4),
          });
          return true;
        }
        if (!allowed.has(plan.data.skill) || !candidateSkills.has(plan.data.skill)) {
          sendJson(res, 502, {
            error: 'invalid_plan_skill',
            message: '模型选择了不在候选白名单里的招式。',
          });
          return true;
        }

        const reason = cleanModelText(plan.data.reason, 36) || '按当前局面选一招';
        const taunt = cleanModelText(plan.data.taunt ?? '', 44);
        const latencyMs = Date.now() - started;
        console.log(
          `[battle-plan] ${requestId} round=${data.round} skill=${plan.data.skill} ${latencyMs}ms ok`,
        );

        sendJson(res, 200, {
          mode: 'live_ai',
          plan: {
            skill: plan.data.skill,
            reason,
            ...(taunt ? { taunt } : {}),
          },
          meta: {
            model: MODEL,
            latencyMs,
            requestId,
            note: 'AI 选招，伤害与胜负仍由规则引擎结算',
            reasoningChars: meta.reasoningChars ?? 0,
          },
        });
      } catch (error) {
        const latencyMs = Date.now() - started;
        const aborted = error?.name === 'AbortError';
        const clientGone = res.destroyed || !res.writable;
        console.warn(
          `[battle-plan] ${requestId} ${latencyMs}ms failed: ${
            aborted ? (clientGone ? 'client_abort' : 'timeout') : error?.message
          }`,
        );
        sendJson(res, aborted ? 504 : 502, {
          error: aborted ? 'model_timeout' : 'model_error',
          message: aborted ? 'AI 18 秒内没有给出决策。' : 'AI 决策失败。',
        });
      } finally {
        clearTimeout(timer);
        res.removeListener('close', onClientClose);
      }
    });
    return true;
  }

  
  return false;
}
