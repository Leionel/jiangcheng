import type { CreatureStats, EnemyKind, V2Creature } from './types';

export const MAX_LEVEL = 5;
/** 从 1 级升到 2/3/4/5 级所需经验 */
export const LEVEL_XP = [30, 70, 120, 180];

export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return LEVEL_XP[level - 1] ?? 0;
}

export function levelStats(base: CreatureStats, level: number): CreatureStats {
  const extra = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return {
    hp: base.hp + extra * 4,
    atk: base.atk + extra,
    def: base.def + extra,
    spd: base.spd + extra,
  };
}

/** 清除等级加成，得到 1 级基础值 */
export function baseStatsOf(creature: V2Creature): CreatureStats {
  const extra = Math.max(0, creature.level - 1);
  return {
    hp: Math.max(1, creature.stats.hp - extra * 4),
    atk: Math.max(1, creature.stats.atk - extra),
    def: Math.max(0, creature.stats.def - extra),
    spd: Math.max(1, creature.stats.spd - extra),
  };
}

export function grantXp(creature: V2Creature, amount: number): { creature: V2Creature; gained: number } {
  if (creature.level >= MAX_LEVEL) return { creature, gained: 0 };
  let level = creature.level;
  let xp = creature.xp + Math.max(0, Math.round(amount));
  while (level < MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
  }
  if (level === MAX_LEVEL) xp = 0;
  const extra = level - creature.level;
  if (extra === 0) return { creature: { ...creature, xp }, gained: 0 };
  return {
    creature: {
      ...creature,
      level,
      xp,
      stats: {
        hp: creature.stats.hp + extra * 4,
        atk: creature.stats.atk + extra,
        def: creature.stats.def + extra,
        spd: creature.stats.spd + extra,
      },
    },
    gained: extra,
  };
}

/** 战斗经验：普通/精英/Boss；重复刷同一节点收益递减（最低 40%） */
export function battleXp(kind: EnemyKind, outcome: 'win' | 'lose' | 'draw', repeatCount: number): number {
  const base = kind === 'boss' ? 32 : kind === 'elite' ? 18 : 10;
  const factor = outcome === 'win' ? 1 : outcome === 'draw' ? 0.7 : 0.5;
  const repeatFactor = Math.max(0.4, 1 / (1 + Math.max(0, repeatCount) * 0.3));
  return Math.round(base * factor * repeatFactor);
}

export function xpPercent(creature: V2Creature): number {
  if (creature.level >= MAX_LEVEL) return 100;
  return Math.min(100, Math.round((creature.xp / Math.max(1, xpToNext(creature.level))) * 100));
}
