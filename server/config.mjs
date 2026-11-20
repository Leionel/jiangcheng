/** 服务端配置：环境变量、模型、静态目录。Key 只在服务端。 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function loadEnv() {
  const root = resolve(process.cwd());
  const file = join(root, '.env');
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

export const ROOT = resolve(process.cwd());
export const DIST = join(ROOT, 'dist');
export const PORT = Number(process.env.PORT || 8787);
export const PROVIDER = process.env.AI_PROVIDER || 'openai-compatible';
export const BASE_URL = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
export const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
export const API_KEY = process.env.AI_API_KEY || '';
export const JSON_MODE = process.env.AI_JSON_MODE !== 'off';
export const AI_AVAILABLE = Boolean(API_KEY);
export const DEMO_MODE_ENABLED = process.env.DEMO_MODE_ENABLED !== 'false';
