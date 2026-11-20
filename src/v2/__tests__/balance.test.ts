import { describe, expect, it } from 'vitest';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';
import type { BattleCreatureState, BuildPath, EnemyDef, ExpeditionBattleState, PlayerRoundInput, V2Creature } from '../domain/types';
import {
  activeCreature,
  createExpeditionBattle,
  getLegalMainActions,
  getLegalSupportActions,
  resolveRound,
} from '../domain/battle2';
import { ENEMIES } from '../domain/region';

type TeamDef = { id: string; paths: BuildPath[] };

const TEAMS: TeamDef[] = [
  { id: '守护队', paths: ['guardian', 'trickster', 'mover'] },
  { id: '爆发队', paths: ['striker', 'trickster', 'mover'] },
  { id: '支援队', paths: ['support', 'guardian', 'mover'] },
];

const ENEMY_POOL: EnemyDef[] = [ENEMIES.riv_mist, ENEMIES.riv_elite, ENEMIES.riv_boss];

function makeTeam(paths: BuildPath[], seed: number): V2Creature[] {
  const ids = ['yusan', 'reganmian', 'lundu'];
  return paths.map((path, index) => {
    const sample = getSample(ids[index])!;
    return compileCreature({
      vision: sample.vision,
      evidence: sample.evidence,
      buildPath: path,
      element: sample.element,
      source: 'sample',
      variant: seed,
      createdAt: 1_700_000_000_000,
    });
  });
}

function memberAlive(member: BattleCreatureState): boolean {
  return member.alive;
}

function chooseRound(state: ExpeditionBattleState, roundIndex: number): PlayerRoundInput {
  const mainActions = getLegalMainActions(state);
  const supports = getLegalSupportActions(state);
  const active = activeCreature(state);
  const skills = mainActions.filter((action): action is { kind: 'skill'; skillId: string } => action.kind === 'skill');
  const swaps = mainActions.filter((action): action is { kind: 'swap'; targetIndex: number } => action.kind === 'swap');
  const link = supports.find((action) => action.kind === 'link');
  const support = link ?? (roundIndex % 3 === 1 ? supports.find((action) => action.kind === 'support') : undefined);
  const lowHp = active.hp / active.creature.stats.hp < 0.3;
  if (lowHp && swaps.length > 0 && state.team.some((member) => memberAlive(member) && member !== active)) {
    return { main: swaps[0], ...(support ? { support } : {}) };
  }
  const main = skills[0] ?? { kind: 'basic' as const };
  return { main, ...(support ? { support } : {}) };
}

function simulate(team: V2Creature[], enemy: EnemyDef, seed: string) {
  let state = createExpeditionBattle({ seed, team, enemy, startResonance: 2 });
  let guard = 0;
  while (!state.outcome && guard < 12) {
    state = resolveRound(state, chooseRound(state, guard));
    guard += 1;
  }
  const hpLeft = state.team.reduce((sum, member) => sum + Math.max(0, member.hp), 0);
  const hpMax = state.team.reduce((sum, member) => sum + member.creature.stats.hp, 0);
  return { state, hpRatio: hpLeft / hpMax };
}

describe('2.0 探索战平衡模拟（Batch 1 初版）', () => {
  it('三套队伍 × 三种敌人的胜率/回合/异常报告', () => {
    const rows: Array<Record<string, string | number>> = [];
    const results = new Map<string, { win: number; total: number; rounds: number; hp: number }>();
    let anomalies = 0;
    for (const team of TEAMS) {
      const creatures = makeTeam(team.paths, 3);
      for (const enemy of ENEMY_POOL) {
        let wins = 0;
        let rounds = 0;
        let hp = 0;
        const seeds = 30;
        for (let i = 0; i < seeds; i += 1) {
          const { state, hpRatio } = simulate(creatures, enemy, `balance-${team.id}-${enemy.id}-${i}`);
          if (state.outcome === 'win') wins += 1;
          rounds += state.round;
          hp += hpRatio;
          if (
            !state.outcome ||
            state.round > state.maxRounds ||
            state.team.some((member) => !Number.isFinite(member.hp) || member.hp < 0) ||
            !Number.isFinite(state.enemy.hp)
          ) {
            anomalies += 1;
          }
        }
        const key = `${team.id}/${enemy.id}`;
        results.set(key, { win: wins, total: seeds, rounds: rounds / seeds, hp: hp / seeds });
        rows.push({
          队伍: team.id,
          敌人: enemy.name,
          胜率: `${Math.round((wins / seeds) * 100)}%`,
          平均回合: (rounds / seeds).toFixed(1),
          剩余HP: `${Math.round((hp / seeds) * 100)}%`,
        });
      }
    }
    // eslint-disable-next-line no-console
    console.table(rows);
    expect(anomalies).toBe(0);
    // 普通战：至少一套队伍能稳定通过
    const normalWins = [...results.entries()]
      .filter(([key]) => key.endsWith('riv_mist'))
      .map(([, value]) => value.win / value.total);
    expect(Math.max(...normalWins)).toBeGreaterThanOrEqual(0.6);
    // Boss：并非必胜，也不是完全不可战胜
    const bossWins = [...results.entries()]
      .filter(([key]) => key.endsWith('riv_boss'))
      .map(([, value]) => value.win / value.total);
    expect(Math.max(...bossWins)).toBeGreaterThanOrEqual(0.1);
    // 回合上限内结束是硬约束
    for (const value of results.values()) {
      expect(value.rounds).toBeLessThanOrEqual(8);
    }
  });
});

