import { describe, expect, it } from 'vitest';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';
import { MAX_LEVEL, battleXp, grantXp, levelStats, xpPercent, xpToNext } from '../domain/growth';

function creature() {
  const sample = getSample('yusan')!;
  return compileCreature({ vision: sample.vision, evidence: sample.evidence, buildPath: 'guardian', element: sample.element, source: 'sample', variant: 1 });
}

describe('Batch 2：熟练度与等级', () => {
  it('升级门槛 / 属性增长 / 上限 5 级', () => {
    let unit = creature();
    expect(unit.level).toBe(1);
    expect(xpToNext(1)).toBe(30);
    const base = unit.stats;
    unit = grantXp(unit, 30).creature;
    expect(unit.level).toBe(2);
    expect(unit.stats.hp).toBe(base.hp + 4);
    expect(unit.stats.atk).toBe(base.atk + 1);
    unit = grantXp(unit, 9999).creature;
    expect(unit.level).toBe(MAX_LEVEL);
    expect(xpPercent(unit)).toBe(100);
    const capped = grantXp(unit, 999).creature;
    expect(capped).toBe(unit);
  });

  it('重复刷同一节点收益递减，且等级属性可复算', () => {
    const first = battleXp('boss', 'win', 0);
    const repeat = battleXp('boss', 'win', 3);
    expect(repeat).toBeLessThan(first);
    expect(repeat).toBeGreaterThanOrEqual(Math.round(first * 0.4));
    const unit = grantXp(creature(), 30).creature;
    const expected = levelStats({ hp: unit.stats.hp - 4, atk: unit.stats.atk - 1, def: unit.stats.def - 1, spd: unit.stats.spd - 1 }, unit.level);
    expect(expected).toEqual(unit.stats);
  });
});
