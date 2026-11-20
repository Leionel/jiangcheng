/**
 * 江城万物怪 · 本地服务端（零依赖，Node 18+）
 *
 * 职责：
 *  1. 托管 dist 静态文件（生产预览）
 *  2. /api/health  暴露“是否有可用模型”，不泄露 Key
 *  3. /api/monsters/analyze  代理模型调用，密钥只在服务端；输入输出都用 zod 校验
 *
 * 启动：npm run build && npm run preview
 * 开发：npm run api（8787）+ npm run dev（5173，已配置 /api 代理）
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  AI_AVAILABLE,
  BASE_URL,
  DEMO_MODE_ENABLED,
  DIST,
  MODEL,
  PORT,
  PROVIDER,
} from './config.mjs';
import { rateLimited, send, sendJson, serveStatic } from './lib/http.mjs';
import {
  BattlePlanRequestSchema,
  DraftSchema,
  PlanOutputSchema,
  RequestSchema,
  VisionSchema,
  callBattlePlanner,
  callModel,
  cleanModelText,
} from './lib/ai.mjs';
import { handleV2Routes } from './routes/v2.mjs';
import { handleP1Routes } from './routes/p1.mjs';

/* --------------------------------- 服务 --------------------------------- */

const server = createServer(async (req, res) => {
  try {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const ip = req.socket.remoteAddress ?? 'unknown';

  if (url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      ai: { available: AI_AVAILABLE, model: AI_AVAILABLE ? MODEL : '', provider: PROVIDER },
      demoModeEnabled: process.env.DEMO_MODE_ENABLED !== 'false',
      time: new Date().toISOString(),
    });
    return;
  }

  if (await handleP1Routes(req, res, url, ip)) return;

  if (await handleV2Routes(req, res, url, ip)) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  await serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname);
  } catch (error) {
    console.error('[server] unhandled error:', error?.message ?? error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_error' });
    } else {
      try {
        res.end();
      } catch {
        /* 连接已断开 */
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`江城万物怪 · 服务已启动 http://localhost:${PORT}`);
  console.log(`  模型：${AI_AVAILABLE ? `${MODEL} @ ${BASE_URL}` : '未配置（仅演示模式）'}`);
  console.log(`  静态目录：${DIST}${existsSync(DIST) ? '' : '（尚不存在，请先 npm run build）'}`);
});

