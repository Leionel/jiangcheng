import { describe, expect, it } from 'vitest';
import { EVOLUTION_GROUPS } from '../content/evolutions';
import { ACTIVE_BY_ID } from '../content/modules';
import { getSample } from '../content/samples';
import { applyEvolution, branchesFor, canEvolve, evolutionGroupFor, previewEvolution, revertEvolution } from '../domain/evolution';
import { compileCreature } from '../domain/compile';
import { createDefaultSave, evolveCreature, deevolveCreature } from '../domain/save';
import { grantXp } from '../domain/growth';
import type { V2Creature } from '../domain/types';

function level3Creature(sampleId = 'yusan'): V2Creature {
  const sample = getSample(sampleId)!;
  const base = compileCreature({ vision: sample.vision, evidence: sample.evidence, buildPath: sample.recommendedPath, element: sample.element, source: 'sample', variant: 7 });
  return grantXp(grantXp(base, 30).creature, 70).creature;
}

describe('Batch 2：六组进化', () => {
  it('六组、每组两条分支、模块全部在白名单内', () => {
    expect(EVOLUTION_GROUPS).toHaveLength(10);
    for (const group of EVOLUTION_GROUPS) {
      expect(group.branches).toHaveLength(2);
      for (const branch of group.branches) {
        expect(ACTIVE_BY_ID.has(branch.moduleId)).toBe(true);
        expect(branch.statBonus.hp).toBeGreaterThan(0);
      }
    }
  });

  it('3 级才能进化；应用后属性/技能/配色变化，回退恢复', () => {
    const low = level3Creature();
    const branch = branchesFor({ ...low, level: 2 })[0];
    expect(canEvolve({ ...low, level: 2 })).toBe(false);
    expect(() => applyEvolution({ ...low, level: 2 }, branch)).toThrow();
    expect(canEvolve(low)).toBe(true);
    const preview = previewEvolution(low, branch);
    expect(preview.stats.hp).toBe(low.stats.hp + branch.statBonus.hp);
    const evolved = applyEvolution(low, branch);
    expect(evolved.evolutionId).toBe(branch.id);
    expect(evolved.actives).toContain(branch.moduleId);
    expect(evolved.stats.hp).toBe(preview.stats.hp);
    expect(evolved.visual.palette).toEqual(branch.palette);
    const reverted = revertEvolution(evolved);
    expect(reverted.evolutionId).toBeUndefined();
    expect(reverted.stats).toEqual(low.stats);
    expect(reverted.actives).toEqual(low.actives);
  });

  it('进化/回退消耗信物，重复操作幂等', () => {
    const save = createDefaultSave(1);
    const unit = level3Creature();
    save.collection = [unit, ...save.collection];
    save.tokens = 2;
    const branch = evolutionGroupFor(unit).branches[0];
    const evolved = evolveCreature(save, unit.id, branch.id);
    expect(evolved.tokens).toBe(1);
    expect(evolutionGroupFor(evolved.collection[0])).toBeTruthy();
    const again = evolveCreature(evolved, unit.id, branch.id);
    expect(again.collection[0].evolutionId).toBe(branch.id);
    const reverted = deevolveCreature(evolved, unit.id);
    expect(reverted.tokens).toBe(0);
    expect(reverted.collection[0].evolutionId).toBeUndefined();
  });
});

