import { beforeEach, describe, expect, it } from 'vitest';
import type { BattleState, Monster, SkillId, TacticId } from '../../../shared/types';
import { SAMPLES } from '../samples';
import { buildMonster } from '../build';
import { ENEMIES } from '../enemies';
import {
  applyEnemyPlan,
  chooseIntent,
  computeDamage,
  createBattle,
  isValidEnemyAction,
  takeTurn,
} from '../battle';
import { typeMultiplier } from '../elements';
import { buildBattlePlanPayload, cleanPlanText, sanitizePlan } from '../plan';
import { TACTICS, recommendTactic, tacticBoons } from '../tactics';
import { applyOutcome, emptyRecord, getRecord, recordBattle, winRate } from '../store';
import { variantOf } from '../analyze';

function monsterFromSample(index: number, mode: Monster['generationMode'] = 'demo'): Monster {
  const sample = SAMPLES[index];
  return buildMonster({
    id: `p1-${sample.id}`,
    vision: sample.vision,
    draft: sample.draft,
    source: 'demo',
    generationMode: mode,
    variant: variantOf(sample.vision),
    createdAt: 1_700_000_000_000,
  });
}

function playOut(state: BattleState, skills: SkillId[], max = 6): BattleState {
  let current = state;
  for (const skill of skills) {
    if (current.outcome) break;
    current = takeTurn(current, skill);
    if (current.outcome) break;
    max -= 1;
    if (max <= 0) break;
  }
  return current;
}

describe('P1 战术：系数只按属性关系生效，且不破坏可复现性', () => {
  it('无战术时与 P0 的非战术路径一致（同种子同出招）', () => {
    const monster = monsterFromSample(0);
    const a = playOut(createBattle(monster, ENEMIES[0], 'tactic-null'), ['BURST', 'BURST', 'BURST']);
    const b = playOut(createBattle(monster, ENEMIES[0], 'tactic-null', { tactic: null }), [
      'BURST',
      'BURST',
      'BURST',
    ]);
    expect(a).toEqual(b);
    expect(a.player.boons).toEqual({
      damageMult: 1,
      damageTakenMult: 1,
      firstStrike: false,
      comebackMult: null,
    });
  });

  it('背水一战只在被克时给出完整加成，克制/中性时近乎无效', () => {
    const monster = monsterFromSample(0); // food
    const countered = ENEMIES[0]; // water 克制 food
    expect(typeMultiplier(monster.element, countered.element)).toBeLessThan(1);

    const base = createBattle(monster, countered, 'boon-test');
    const withTactic = createBattle(monster, countered, 'boon-test', { tactic: 'desperado' });
    expect(withTactic.player.boons.comebackMult).toBeGreaterThan(1);
    expect(withTactic.player.boons.damageTakenMult).toBeLessThan(1);
    expect(tacticBoons('desperado', false).comebackMult).toBeNull();
    expect(tacticBoons('desperado', false).damageMult).toBeLessThan(tacticBoons('desperado', true).damageMult);

    const before = computeDamage(base.player, base.enemy, 'BURST', base.weather);
    const after = computeDamage(withTactic.player, withTactic.enemy, 'BURST', withTactic.weather);
    expect(after.damage).toBeGreaterThan(before.damage);
    // 同战术同 seed 完全复现
    const again = createBattle(monster, countered, 'boon-test', { tactic: 'desperado' });
    expect(again).toEqual(withTactic);
  });

  it('快人一步只在首回合改变出手顺序', () => {
    const monster = monsterFromSample(2); // nature, 速度 12
    const enemy = ENEMIES[0]; // water, 速度 17
    const normal = createBattle(monster, enemy, 'swift-seed');
    const swift = createBattle(monster, enemy, 'swift-seed', { tactic: 'swift' });
    const first = takeTurn(swift, 'BURST');
    const firstNormal = takeTurn(normal, 'BURST');
    expect(first.round).toBe(2);
    expect(first.log).not.toEqual(firstNormal.log);
    const second = takeTurn(first, 'BURST');
    const secondNormal = takeTurn(firstNormal, 'BURST');
    // 第二回合起先手权回到速度比较：两边行动顺序恢复正常
    const orderOf = (state: BattleState) => {
      const events = state.log.filter((event) => event.kind === 'skill').slice(-2);
      return events.map((event) => event.actor).join(',');
    };
    expect(orderOf(second)).toBe(orderOf(secondNormal));
  });

  it('三个战术各有明确效果，推荐函数随属性关系变化', () => {
    expect(TACTICS.desperado.name).toBe('背水一战');
    expect(tacticBoons('steady').damageTakenMult).toBeLessThan(1);
    expect(tacticBoons('swift').firstStrike).toBe(true);
    expect(recommendTactic(0.8)).toBe('desperado');
    expect(recommendTactic(1.25)).toBe('swift');
    expect(recommendTactic(1)).toBe('steady');
  });
});

describe('P1 AI 决策协议：合法性、降级与可复现', () => {
  const monster = monsterFromSample(0);
  const enemy = ENEMIES[0];

  it('buildBattlePlanPayload 只包含可见状态与合法候选', () => {
    const state = createBattle(monster, enemy, 'plan-payload');
    const payload = buildBattlePlanPayload(state, enemy);
    expect(payload.round).toBe(1);
    expect(payload.enemy.id).toBe(enemy.id);
    expect(payload.candidates.map((c) => c.skill).sort()).toEqual([...enemy.skills].sort());
    payload.candidates.forEach((c) => {
      expect(c.estimate).toBeGreaterThanOrEqual(0);
      expect(c.estimate).toBeLessThanOrEqual(45);
    });
    expect(payload.player.skills).toEqual(monster.skills);
  });

  it('sanitizePlan 拒绝越界招式，清理文本，非法输入返回 null', () => {
    expect(sanitizePlan({ skill: 'BURST', reason: '压上去' }, ['BURST', 'QUICK'])?.skill).toBe('BURST');
    expect(sanitizePlan({ skill: 'RECOVER' }, ['BURST', 'QUICK'])).toBeNull();
    expect(sanitizePlan(null, ['BURST'])).toBeNull();
    expect(sanitizePlan({ skill: 'BURST', reason: '<b>坏</b>文本\u0001' }, ['BURST'])?.reason).toBe('b坏/b文本');
    expect(cleanPlanText('a'.repeat(99), 8)).toBe('aaaaaaaa');
  });

  it('applyEnemyPlan 只改意图来源，结算仍走纯函数；非法/过期计划被忽略', () => {
    const state = createBattle(monster, enemy, 'apply-seed');
    const beforeDamage = computeDamage(state.enemy, state.player, 'QUICK', state.weather).damage;

    const applied = applyEnemyPlan(
      state,
      { skill: 'QUICK', reason: '抢先手', taunt: '雾里先动' },
      { model: 'test-model', latencyMs: 12 },
    );
    expect(applied.intent?.source).toBe('ai');
    expect(applied.intent?.skill).toBe('QUICK');
    expect(applied.intent?.taunt).toBe('雾里先动');
    expect(applied.planLog).toHaveLength(1);
    expect(applied.planLog[0].source).toBe('ai');
    expect(applied.planLog[0].model).toBe('test-model');
    // 预计伤害仍是规则计算
    const expected = computeDamage(applied.enemy, applied.player, 'QUICK', applied.weather).damage;
    expect(applied.intent?.estimatedDamage).toBe(expected);
    expect(beforeDamage).toBeGreaterThan(0);

    // 非法招式 / 已记录计划的同一回合：忽略
    expect(applyEnemyPlan(state, { skill: 'RECOVER', reason: 'x' }, {})).toBe(state);
    const afterExecute = takeTurn(applied, 'BURST');
    expect(afterExecute.planLog).toHaveLength(1);
    expect(afterExecute.planLog[0].skill).toBe('QUICK');
    expect(afterExecute.round).toBe(2);
    const secondPlan = applyEnemyPlan(afterExecute, { skill: 'QUICK', reason: 'x' }, {});
    expect(secondPlan.intent?.source).toBe('ai');
    expect(secondPlan.intent?.skill).toBe('QUICK');

    // 同 seed + 同计划 + 同出招 = 同结果
    const run = () => {
      let s = createBattle(monster, enemy, 'apply-seed');
      s = applyEnemyPlan(s, { skill: 'QUICK', reason: '抢先手' }, {});
      s = takeTurn(s, 'BURST');
      s = applyEnemyPlan(s, { skill: 'QUICK', reason: '抢先手' }, {});
      return takeTurn(s, 'BURST');
    };
    expect(run()).toEqual(run());
  });

  it('规则意图的 planLog 记录为 rule，AI 未参与时结算页可如实区分', () => {
    const state = createBattle(monster, enemy, 'rule-plan');
    const next = takeTurn(state, 'BURST');
    expect(next.planLog[0].source).toBe('rule');
    expect(chooseIntent(state).source).toBe('rule');
    expect(isValidEnemyAction(state, 'BURST')).toBe(true);
    expect(isValidEnemyAction(state, 'RECOVER')).toBe(false);
  });

  it('越界战术 ID 被忽略（旧数据/被篡改输入不会破坏战斗）', () => {
    const state = createBattle(monster, enemy, 'bad-tactic', { tactic: 'hack' as TacticId });
    expect(state.tactic).toBeNull();
    expect(state.player.boons.damageMult).toBe(1);
  });
});

describe('P1 战绩：向后兼容、累加与连胜', () => {
  beforeEach(() => {
    // 测试环境没有 localStorage，store 会跳过持久化；这里只测纯函数
  });

  it('空战绩从 0 开始，胜利累加并更新最佳连胜', () => {
    let record = emptyRecord();
    record = applyOutcome(record, 'win');
    expect(record).toMatchObject({ wins: 1, losses: 0, battles: 1, streak: 1, bestStreak: 1 });
    record = applyOutcome(record, 'win');
    expect(record.streak).toBe(2);
    expect(record.bestStreak).toBe(2);
    record = applyOutcome(record, 'lose');
    expect(record.streak).toBe(0);
    expect(record.bestStreak).toBe(2);
    record = applyOutcome(record, 'draw');
    expect(record.draws).toBe(1);
    expect(winRate(record)).toBe(50);
  });

  it('旧版本卡没有 record 字段时按空战绩读取；recordBattle 只更新目标卡', () => {
    const chain = recordBattle([monsterFromSample(0), monsterFromSample(1)], 'p1-reganmian', 'win');
    expect(getRecord(chain[0]).wins).toBe(1);
    expect(getRecord(chain[1]).wins).toBe(0);
    const legacy = { ...monsterFromSample(0), record: undefined };
    expect(getRecord(legacy)).toEqual(emptyRecord());
    // 找不到 id 时不崩溃
    expect(recordBattle([legacy], 'missing', 'win')).toHaveLength(1);
  });
});
