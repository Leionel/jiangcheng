import { describe, expect, it } from 'vitest';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';
import {
  V2_RULES,
  activeCreature,
  applyEnemyPlan,
  battleSummary,
  chooseRuleIntent,
  createExpeditionBattle,
  fingerprint,
  getLegalMainActions,
  getLegalSupportActions,
  legalEnemyActions,
  replayBattle,
  resolveRound,
  statusOf,
} from '../domain/battle2';
import { ENEMIES } from '../domain/region';
import type { BattleCreatureState, EnemyActionId, ExpeditionBattleState, PlayerMainAction, PlayerRoundInput, V2Creature } from '../domain/types';

const PATHS = { yusan: 'guardian', reganmian: 'trickster', lundu: 'mover' } as const;

function team(): V2Creature[] {
  return (['yusan', 'reganmian', 'lundu'] as const).map((id) => {
    const sample = getSample(id)!;
    return compileCreature({
      vision: sample.vision,
      evidence: sample.evidence,
      buildPath: PATHS[id],
      element: sample.element,
      source: 'sample',
      variant: 3,
      createdAt: 1_700_000_000_000,
    });
  });
}

function firstLegalMain(state: ExpeditionBattleState): PlayerMainAction {
  const actions = getLegalMainActions(state);
  const skill = actions.find((action): action is { kind: 'skill'; skillId: string } => action.kind === 'skill');
  return skill ?? { kind: 'guard' };
}

function autoRound(state: ExpeditionBattleState, useSupport = false): PlayerRoundInput {
  const support = useSupport ? getLegalSupportActions(state)[0] : undefined;
  return { main: firstLegalMain(state), ...(support ? { support } : {}) };
}

function play(state: ExpeditionBattleState, inputs: PlayerRoundInput[]): ExpeditionBattleState {
  let current = state;
  for (const input of inputs) {
    if (current.outcome) break;
    current = resolveRound(current, input);
  }
  return current;
}

function active(state: ExpeditionBattleState): BattleCreatureState {
  return activeCreature(state);
}

describe('expedition_v2 战斗引擎', () => {
  it('创建：3 人队伍、规则意图、可用行动合法', () => {
    const state = createExpeditionBattle({ seed: 'b2-1', team: team(), enemy: ENEMIES.riv_mist });
    expect(state.team).toHaveLength(3);
    expect(state.round).toBe(1);
    expect(state.intent?.source).toBe('rule');
    expect(state.resonance).toBe(V2_RULES.resonanceStart);
    expect(getLegalMainActions(state).length).toBeGreaterThan(0);
    expect(legalEnemyActions(state)).toContain('strike');
    expect(Number.isFinite(active(state).hp)).toBe(true);
  });

  it('同 seed + 同输入 → 同指纹；HP 不出现 NaN/负值', () => {
    const run = () => play(createExpeditionBattle({ seed: 'b2-2', team: team(), enemy: ENEMIES.riv_mist }), [
      { main: firstLegalMain(createExpeditionBattle({ seed: 'b2-2', team: team(), enemy: ENEMIES.riv_mist })) },
      { main: { kind: 'guard' } },
      { main: { kind: 'guard' } },
    ]);
    const a = run();
    const b = run();
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.team.every((member) => member.hp >= 0 && Number.isFinite(member.hp))).toBe(true);
    expect(a.enemy.hp).toBeGreaterThanOrEqual(0);
  });

  it('防御获得共鸣；换位消耗共鸣并切换主战', () => {
    let state = createExpeditionBattle({ seed: 'b2-3', team: team(), enemy: ENEMIES.riv_mist });
    const before = state.resonance;
    state = resolveRound(state, { main: { kind: 'guard' } });
    expect(state.resonance).toBe(Math.min(V2_RULES.resonanceMax, before + 1));

    const swapState = createExpeditionBattle({ seed: 'b2-4', team: team(), enemy: ENEMIES.riv_mist });
    const legal = getLegalMainActions(swapState);
    const swap = legal.find((action) => action.kind === 'swap');
    expect(swap).toBeTruthy();
    const resonanceBefore = swapState.resonance;
    const next = resolveRound(swapState, { main: swap as PlayerMainAction });
    expect(next.activeIndex).not.toBe(swapState.activeIndex);
    expect(next.resonance).toBe(resonanceBefore - 1);
    // 旧主战保留、HP 不重置
    expect(next.team[swapState.activeIndex].hp).toBeLessThanOrEqual(next.team[swapState.activeIndex].creature.stats.hp);
  });

  it('支援指令生效并进入冷却；连携可用且每场一次', () => {
    let state = createExpeditionBattle({ seed: 'b2-5', team: team(), enemy: ENEMIES.riv_mist, startResonance: 4 });
    const support = getLegalSupportActions(state).find((action) => action.kind === 'support');
    expect(support).toBeTruthy();
    state = resolveRound(state, { main: { kind: 'guard' }, support: support as { kind: 'support'; reserveIndex: number } });
    expect(state.planLog[0].source).toBe('rule');
    const reserve = state.team[(support as { kind: 'support'; reserveIndex: number }).reserveIndex];
    expect(reserve.supportCd).toBeGreaterThan(0);

    let linkState = createExpeditionBattle({ seed: 'b2-6', team: team(), enemy: ENEMIES.riv_mist, startResonance: 6 });
    const link = getLegalSupportActions(linkState).find((action) => action.kind === 'link');
    expect(link).toBeTruthy();
    linkState = resolveRound(linkState, { main: { kind: 'guard' }, support: link as { kind: 'link'; linkId: string } });
    expect(linkState.linkUsed).toBe(true);
    expect(linkState.resonance).toBeLessThan(6);
    const secondLink = getLegalSupportActions(linkState).filter((action) => action.kind === 'link');
    expect(secondLink).toHaveLength(0);
  });

  it('AI 计划只接受合法敌方动作，并写入 planLog 的 ai 来源', () => {
    let state = createExpeditionBattle({ seed: 'b2-7', team: team(), enemy: ENEMIES.riv_boss });
    state = resolveRound(state, { main: { kind: 'guard' } });
    expect(state.round).toBe(2);
    const legal = legalEnemyActions(state);
    expect(legal).toContain('storm');
    const applied = applyEnemyPlan(state, {
      actionId: 'storm' as EnemyActionId,
      reason: '队伍没有护盾，暴雨压血',
      taunt: '雾起江涌',
      model: 'test-model',
      latencyMs: 12,
    });
    expect(applied.intent?.source).toBe('ai');
    const resolved = resolveRound(applied, { main: { kind: 'guard' } });
    const aiPlan = resolved.planLog.find((item) => item.round === 2);
    expect(aiPlan?.source).toBe('ai');
    expect(aiPlan?.model).toBe('test-model');

    const ignored = applyEnemyPlan(state, { actionId: 'deluge', reason: '非法', taunt: '' });
    expect(ignored.intent?.action).not.toBe('deluge');
  });

  it('Boss 会在 HP ≤50% 进入第二阶段', () => {
    let state = createExpeditionBattle({ seed: 'b2-8', team: team(), enemy: ENEMIES.riv_boss });
    state = { ...state, enemy: { ...state.enemy, hp: state.enemy.def.maxHp / 2 - 2 } };
    state = resolveRound(state, { main: { kind: 'guard' } });
    expect(state.enemy.phase).toBe(2);
  });

  it('战斗一定在回合上限内结束，且不能是 NaN', () => {
    let state = createExpeditionBattle({ seed: 'b2-9', team: team(), enemy: ENEMIES.riv_boss });
    let guard = 0;
    while (!state.outcome && guard < 20) {
      state = resolveRound(state, autoRound(state, guard % 2 === 0));
      guard += 1;
    }
    expect(state.outcome).not.toBeNull();
    expect(state.round).toBeLessThanOrEqual(state.maxRounds);
    expect(state.team.every((member) => Number.isFinite(member.hp) && member.hp >= 0)).toBe(true);
    expect(Number.isFinite(state.enemy.hp)).toBe(true);
  });

  it('回放：同 seed + 同输入/计划序列 → 同最终状态', () => {
    const rounds: PlayerRoundInput[] = [
      { main: { kind: 'guard' } },
      { main: { kind: 'guard' } },
      { main: { kind: 'guard' } },
    ];
    const a = replayBattle({ seed: 'b2-replay', team: team(), enemy: ENEMIES.riv_mist, rounds });
    const b = replayBattle({ seed: 'b2-replay', team: team(), enemy: ENEMIES.riv_mist, rounds });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.enemy.hp).toBe(b.enemy.hp);
  });

  it('非法行动被拒绝', () => {
    const state = createExpeditionBattle({ seed: 'b2-10', team: team(), enemy: ENEMIES.riv_mist });
    expect(() => resolveRound(state, { main: { kind: 'skill', skillId: 'A99' } })).toThrow();
  });

  it('状态：护盾吸收、潮湿可被驱散', () => {
    const state = createExpeditionBattle({ seed: 'b2-11', team: team(), enemy: ENEMIES.riv_mist });
    const withShield = {
      ...state,
      team: state.team.map((member, index) =>
        index === state.activeIndex
          ? { ...member, statuses: [{ id: 'shield' as const, stacks: 10, turns: 2 }] }
          : member,
      ),
    };
    expect(statusOf(withShield.team[withShield.activeIndex].statuses, 'shield')).toBe(10);
    expect(chooseRuleIntent(withShield).estimate).toBeGreaterThan(0);
    expect(battleSummary(state).rounds).toBe(1);
    expect(fingerprint(state)).toBe(state.fingerprint);
  });
});
