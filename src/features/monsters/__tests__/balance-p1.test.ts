import { describe, expect, it } from 'vitest';
import type { BattleState, Monster, SkillId, TacticId } from '../../../shared/types';
import { SAMPLES } from '../samples';
import { buildMonster } from '../build';
import { ENEMIES } from '../enemies';
import { createBattle, hpPercent, takeTurn } from '../battle';
import { typeMultiplier } from '../elements';
import { recommendTactic, TACTIC_LIST } from '../tactics';
import { variantOf } from '../analyze';

/**
 * P1 平衡报告：对比「无战术」与「按属性关系推荐战术」。
 * 这是调平衡的唯一依据（与 P0 的平衡表同一策略基线）。
 */

function monsterFromSample(index: number): Monster {
  const sample = SAMPLES[index];
  return buildMonster({
    id: `t-${sample.id}`,
    vision: sample.vision,
    draft: sample.draft,
    source: 'demo',
    generationMode: 'demo',
    variant: variantOf(sample.vision),
    createdAt: 1_700_000_000_000,
  });
}

/**
 * P1 基线策略：一步前瞻。
 * 玩家在界面上本来就能看到敌方意图与每招预计伤害，因此「算这一招打下去会不会赢」是合理操作，
 * 用它评估战术更接近真实玩家，而不是用一个只会固定顺序的脚本。
 */
function policy(state: BattleState): SkillId {
  let best: SkillId = state.player.skills[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const skill of state.player.skills) {
    const next = takeTurn(state, skill);
    let score: number;
    if (next.outcome === 'win') score = 10_000;
    else if (next.outcome === 'lose') score = -10_000;
    else if (next.outcome === 'draw') score = 0;
    else score = hpPercent(next.player) - hpPercent(next.enemy);
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }
  return best;
}

function simulate(monster: Monster, enemyIndex: number, tactic: TacticId | null, seeds = 60) {
  const enemy = ENEMIES[enemyIndex];
  let wins = 0;
  let kos = 0;
  let rounds = 0;
  for (let i = 0; i < seeds; i += 1) {
    let state = createBattle(monster, enemy, `p1-${enemy.id}-${i}`, { tactic });
    let guard = 0;
    while (!state.outcome && guard < 6) {
      state = takeTurn(state, policy(state));
      guard += 1;
    }
    if (state.outcome === 'win') wins += 1;
    if (state.enemy.hp <= 0) kos += 1;
    rounds += state.round;
  }
  return {
    win: Math.round((wins / seeds) * 100),
    ko: Math.round((kos / seeds) * 100),
    rounds: rounds / seeds,
  };
}

describe('P1 平衡：战术对胜率的影响', () => {
  it('输出无战术 / 推荐战术 / 三战术对比', () => {
    const rows: Array<Record<string, string | number>> = [];
    const countered: number[] = [];
    const favored: number[] = [];

    for (let s = 0; s < SAMPLES.length; s += 1) {
      const monster = monsterFromSample(s);
      for (let e = 0; e < ENEMIES.length; e += 1) {
        const enemy = ENEMIES[e];
        const mult = typeMultiplier(monster.element, enemy.element);
        const rec = recommendTactic(mult);
        const base = simulate(monster, e, null);
        const withTactic = simulate(monster, e, rec);
        if (mult < 0.99) countered.push(withTactic.win);
        if (mult > 1.01) favored.push(withTactic.win);
        rows.push({
          精灵: monster.name,
          对手: enemy.name,
          属性关系: mult > 1.01 ? '克制' : mult < 0.99 ? '被克' : '中性',
          推荐战术: rec,
          无战术胜率: `${base.win}%`,
          战术胜率: `${withTactic.win}%`,
          无战术击倒: `${base.ko}%`,
          战术击倒: `${withTactic.ko}%`,
          平均回合: withTactic.rounds.toFixed(1),
        });
      }
    }
    // eslint-disable-next-line no-console
    console.table(rows);

    const tacticRows = SAMPLES.flatMap((_sample, s) =>
      ENEMIES.map((enemy, e) => {
        const monster = monsterFromSample(s);
        return {
          组合: `${monster.name} 对 ${enemy.name}`,
          ...Object.fromEntries(
            TACTIC_LIST.map((t) => [t.name, `${simulate(monster, e, t.id).win}%`]),
          ),
        };
      }),
    );
    // eslint-disable-next-line no-console
    console.table(tacticRows);

    expect(countered.length).toBeGreaterThan(0);
    expect(favored.length).toBeGreaterThan(0);

    // P1 验收：被克组合选对战术后有真实翻盘机会（用一步前瞻的合理操作模拟）
    expect(Math.min(...countered)).toBeGreaterThanOrEqual(25);
    // 优势局不会被战术反噬
    expect(Math.min(...favored)).toBeGreaterThanOrEqual(70);
    // 三回合封顶仍然成立
    rows.forEach((row) => expect(Number(row.平均回合)).toBeLessThanOrEqual(3.1));
    // 无战术的被克组合仍然很难，说明战术是有效变量而不是白送
    const noTacticCountered = rows
      .filter((row) => row.属性关系 === '被克')
      .map((row) => Number(String(row.无战术胜率).replace('%', '')));
    expect(Math.min(...noTacticCountered)).toBeLessThan(25);
  });
});
