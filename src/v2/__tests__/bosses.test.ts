import { describe, expect, it } from 'vitest';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';
import { ENEMIES, REGIONS } from '../domain/region';
import { applyEnemyPlan, createExpeditionBattle, getLegalSupportActions, legalEnemyActions, resolveRound } from '../domain/battle2';
import type { RegionId, V2Creature } from '../domain/types';

function team(): V2Creature[] {
  return ['yusan', 'reganmian', 'lundu'].map((id, index) => {
    const sample = getSample(id)!;
    return compileCreature({
      vision: sample.vision,
      evidence: sample.evidence,
      buildPath: (['guardian', 'trickster', 'mover'] as const)[index],
      element: sample.element,
      source: 'sample',
      variant: index,
    });
  });
}

function bossBattle(regionId: RegionId) {
  return createExpeditionBattle({
    seed: `boss-${regionId}`,
    team: team(),
    enemy: ENEMIES[REGIONS[regionId].bossId],
    startResonance: 4,
  });
}

describe('Batch 2-5：Boss 规则机制', () => {
  it('每个 Boss 都有合法机制动作', () => {
    const heat = bossBattle('zao');
    heat.round = 2;
    expect(legalEnemyActions(heat)).toContain('heat_wave');
    const lock = bossBattle('bridge');
    lock.round = 2;
    expect(legalEnemyActions(lock)).toContain('lock');
    const record = bossBattle('sakura');
    record.round = 2;
    expect(legalEnemyActions(record)).toContain('record');
    const thunder = bossBattle('thunder');
    thunder.enemy.phase = 2;
    thunder.round = 2;
    expect(legalEnemyActions(thunder)).toContain('storm');
    thunder.enemy.phase = 3;
    expect(legalEnemyActions(thunder)).toContain('overload');
  });

  it('桥影守卫封锁后，下一回合支援不可用', () => {
    let battle = bossBattle('bridge');
    battle.round = 2;
    battle = applyEnemyPlan(battle, { actionId: 'lock', reason: 'test', taunt: '' });
    battle = resolveRound(battle, { main: { kind: 'guard' } });
    expect(battle.supportLockedRound).toBeGreaterThanOrEqual(3);
    expect(getLegalSupportActions(battle)).toEqual([]);
  });

  it('早味大厨热度积累并抬升阶段', () => {
    let battle = bossBattle('zao');
    for (let i = 0; i < 3 && !battle.outcome; i += 1) {
      battle = resolveRound(battle, { main: { kind: 'basic' } });
    }
    const heat = battle.enemy.statuses.find((status) => status.id === 'heat')?.stacks ?? 0;
    expect(heat).toBeGreaterThan(0);
    if (heat >= 3) expect(battle.enemy.phase).toBeGreaterThanOrEqual(2);
  });

  it('造物夜主脑有三阶段阈值', () => {
    let battle = bossBattle('thunder');
    battle.enemy.hp = Math.ceil(battle.enemy.def.maxHp * 0.65);
    battle = resolveRound(battle, { main: { kind: 'guard' } });
    expect(battle.enemy.phase).toBeGreaterThanOrEqual(2);
    battle.enemy.hp = Math.max(1, Math.floor(battle.enemy.def.maxHp * 0.3));
    battle = resolveRound(battle, { main: { kind: 'guard' } });
    expect(battle.enemy.phase).toBe(3);
  });
});
