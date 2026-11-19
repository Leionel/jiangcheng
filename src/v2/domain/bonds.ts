import type { BuildPath, V2Creature } from './types';

export const BOND_THRESHOLDS = [0, 3, 8, 15] as const;

export function bondLevel(points: number): number {
  let level = 0;
  BOND_THRESHOLDS.forEach((threshold, index) => {
    if (points >= threshold) level = index;
  });
  return Math.min(3, level);
}

export function bondLabel(points: number): string {
  return ['初识', '搭把手', '一起走', '过命的'][bondLevel(points)] ?? '初识';
}

export function partyBondPoints(party: V2Creature[]): number {
  const paths = new Set<BuildPath>(party.map((item) => item.buildPath));
  const pairBonus = paths.size >= 3 ? 2 : paths.size === 2 ? 1 : 0;
  return party.reduce((sum, item) => sum + item.bondXp, 0) + pairBonus;
}

/** 每场战斗后的羁绊经验：胜利 +2，失败也 +1；同一队伍重复战斗有上限 */
export function bondXpForBattle(outcome: 'win' | 'lose' | 'draw'): number {
  return outcome === 'win' ? 2 : 1;
}

export function addBondXp(creature: V2Creature, amount: number): V2Creature {
  return { ...creature, bondXp: Math.min(12, creature.bondXp + amount) };
}
