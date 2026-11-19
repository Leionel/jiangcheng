import { describe, expect, it } from 'vitest';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';
import { ENEMIES, REGIONS, REGION_ORDER } from '../domain/region';
import { activeCreature, createExpeditionBattle, getLegalMainActions, getLegalSupportActions, resolveRound } from '../domain/battle2';
import { grantXp } from '../domain/growth';
import { applyEvolution, branchesFor } from '../domain/evolution';
import type { BuildPath, ExpeditionBattleState, PlayerRoundInput, RegionId, V2Creature } from '../domain/types';

const TEAMS: Array<{ id: string; paths: BuildPath[]; level: number; evolve?: boolean }> = [
  { id: '守护队', paths: ['guardian', 'trickster', 'mover'], level: 1 },
  { id: '爆发队', paths: ['striker', 'trickster', 'mover'], level: 2 },
  { id: '支援队', paths: ['support', 'guardian', 'mover'], level: 2 },
  { id: '进化队', paths: ['guardian', 'striker', 'support'], level: 3, evolve: true },
];

const SAMPLES = ['yusan', 'reganmian', 'lundu'];

function makeTeam(teamDef: (typeof TEAMS)[number], variant: number): V2Creature[] {
  return teamDef.paths.map((path, index) => {
    const sample = getSample(SAMPLES[index])!;
    let unit = compileCreature({
      vision: sample.vision,
      evidence: sample.evidence,
      buildPath: path,
      element: sample.element,
      source: 'sample',
      variant: variant + index,
    });
    if (teamDef.level > 1) unit = grantXp(unit, 30 + 70).creature;
    if (teamDef.level >= 3) unit = grantXp(unit, 120).creature;
    if (teamDef.evolve) {
      const branch = branchesFor(unit)[0];
      unit = applyEvolution(unit, branch);
    }
    return unit;
  });
}

function chooseRound(state: ExpeditionBattleState, roundIndex: number): PlayerRoundInput {
  const mainActions = getLegalMainActions(state);
  const supports = getLegalSupportActions(state);
  const active = activeCreature(state);
  const skills = mainActions.filter((action): action is { kind: 'skill'; skillId: string } => action.kind === 'skill');
  const swaps = mainActions.filter((action): action is { kind: 'swap'; targetIndex: number } => action.kind === 'swap');
  const link = supports.find((action) => action.kind === 'link');
  const support = link ?? (roundIndex % 2 === 0 ? supports.find((action) => action.kind === 'support') : undefined);
  if (active.hp / active.creature.stats.hp < 0.3 && swaps.length > 0) {
    return { main: swaps[0], ...(support ? { support } : {}) };
  }
  const strongest = Math.max(...state.team.filter((member) => member.alive).map((member) => member.creature.stats.atk));
  if (roundIndex % 2 === 0 && swaps.length > 0 && active.creature.stats.atk < strongest - 2) {
    const targetIndex = swaps[0].targetIndex;
    return { main: { kind: 'swap', targetIndex }, ...(support ? { support } : {}) };
  }
  const main = skills[0] ?? { kind: 'basic' as const };
  return { main, ...(support ? { support } : {}) };
}

function simulate(regionId: RegionId, teamDef: (typeof TEAMS)[number], seed: string): ExpeditionBattleState {
  let state = createExpeditionBattle({
    seed,
    team: makeTeam(teamDef, seed.length),
    enemy: ENEMIES[REGIONS[regionId].bossId],
    startResonance: 3,
    bondLevel: 2,
  });
  let guard = 0;
  while (!state.outcome && guard < 10) {
    state = resolveRound(state, chooseRound(state, guard));
    guard += 1;
  }
  return state;
}

describe('Batch 4：五区 Boss 平衡模拟（1000 局）', () => {
  it('每局都在上限内结束，每个 Boss 至少一条队伍构筑能击破', () => {
    const rows: Array<Record<string, string | number>> = [];
    const winsByBoss = new Map<RegionId, number[]>();
    let anomalies = 0;
    const seedsPerBoss = 50;
    for (const regionId of REGION_ORDER) {
      const boss = ENEMIES[REGIONS[regionId].bossId];
      const winRates: number[] = [];
      for (const teamDef of TEAMS) {
        let wins = 0;
        let totalRounds = 0;
        for (let seed = 0; seed < seedsPerBoss; seed += 1) {
          const state = simulate(regionId, teamDef, `bal-${regionId}-${teamDef.id}-${seed}`);
          totalRounds += state.round;
          if (state.outcome === 'win') wins += 1;
          if (
            !state.outcome ||
            state.round > state.maxRounds ||
            state.team.some((member) => !Number.isFinite(member.hp) || member.hp < 0) ||
            !Number.isFinite(state.enemy.hp)
          ) {
            anomalies += 1;
          }
        }
        const rate = wins / seedsPerBoss;
        winRates.push(rate);
        rows.push({
          区域: REGIONS[regionId].name,
          Boss: boss.name,
          队伍: teamDef.id,
          胜率: `${Math.round(rate * 100)}%`,
          平均回合: (totalRounds / seedsPerBoss).toFixed(1),
        });
      }
      winsByBoss.set(regionId, winRates);
    }
    // eslint-disable-next-line no-console
    console.table(rows);
    expect(anomalies).toBe(0);
    for (const [regionId, rates] of winsByBoss) {
      expect(Math.max(...rates), `${REGIONS[regionId].name} 至少一队可过`).toBeGreaterThanOrEqual(0.2);
      expect(rates.filter((rate) => rate >= 0.2).length, `${REGIONS[regionId].name} 至少两种构筑可过`).toBeGreaterThanOrEqual(2);
    }
    expect(REGION_ORDER.length * TEAMS.length * seedsPerBoss).toBeGreaterThanOrEqual(1000);
  });
});

