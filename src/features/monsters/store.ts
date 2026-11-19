import type { BattleOutcome, Monster, MonsterRecord } from '../../shared/types';

const KEY = 'jcm.gallery.v1';
export const GALLERY_LIMIT = 24;

function isMonster(value: unknown): value is Monster {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<Monster>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.element === 'string' &&
    Boolean(m.stats) &&
    Array.isArray(m.skills) &&
    m.skills.length === 2 &&
    Boolean(m.visualRecipe)
  );
}

export function loadGallery(): Monster[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMonster).slice(0, GALLERY_LIMIT);
  } catch {
    return [];
  }
}

export function persistGallery(list: Monster[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, GALLERY_LIMIT)));
  } catch {
    // 存储写满或被禁用：图鉴不持久化，不影响本局游玩
  }
}

export function addMonster(list: Monster[], monster: Monster): Monster[] {
  const next = [monster, ...list.filter((m) => m.id !== monster.id)].slice(0, GALLERY_LIMIT);
  persistGallery(next);
  return next;
}

export function removeMonster(list: Monster[], id: string): Monster[] {
  const next = list.filter((m) => m.id !== id);
  persistGallery(next);
  return next;
}

export function serialOf(list: Monster[], id: string): string {
  const index = list.findIndex((m) => m.id === id);
  if (index < 0) return '—';
  return String(list.length - index).padStart(3, '0');
}

/* ------------------------------ 战绩（P1） ------------------------------ */

export function emptyRecord(): MonsterRecord {
  return { wins: 0, losses: 0, draws: 0, battles: 0, streak: 0, bestStreak: 0 };
}

/** 读取战绩：旧版本 localStorage 里没有 record 字段时按 0 处理，不破坏旧图鉴。 */
export function getRecord(monster: Monster): MonsterRecord {
  const raw = monster.record;
  if (!raw || typeof raw !== 'object') return emptyRecord();
  return {
    wins: Math.max(0, Math.floor(Number(raw.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(raw.losses) || 0)),
    draws: Math.max(0, Math.floor(Number(raw.draws) || 0)),
    battles: Math.max(0, Math.floor(Number(raw.battles) || 0)),
    streak: Math.max(0, Math.floor(Number(raw.streak) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(raw.bestStreak) || 0)),
    ...(raw.lastOutcome === 'win' || raw.lastOutcome === 'lose' || raw.lastOutcome === 'draw'
      ? { lastOutcome: raw.lastOutcome }
      : {}),
  };
}

/** 纯函数：把一次对局结果结算进战绩 */
export function applyOutcome(record: MonsterRecord, outcome: BattleOutcome): MonsterRecord {
  const wins = record.wins + (outcome === 'win' ? 1 : 0);
  const losses = record.losses + (outcome === 'lose' ? 1 : 0);
  const draws = record.draws + (outcome === 'draw' ? 1 : 0);
  const battles = record.battles + 1;
  const streak = outcome === 'win' ? record.streak + 1 : 0;
  return {
    wins,
    losses,
    draws,
    battles,
    streak,
    bestStreak: Math.max(record.bestStreak, streak),
    lastOutcome: outcome,
  };
}

/** 把结果写回图鉴中的对应精灵（会持久化）；找不到 id 时原样返回。 */
export function recordBattle(list: Monster[], id: string, outcome: BattleOutcome): Monster[] {
  let found = false;
  const next = list.map((monster) => {
    if (monster.id !== id) return monster;
    found = true;
    return { ...monster, record: applyOutcome(getRecord(monster), outcome) };
  });
  if (found) persistGallery(next);
  return next;
}

export function winRate(record: MonsterRecord): number {
  if (record.battles <= 0) return 0;
  return Math.round((record.wins / record.battles) * 100);
}
