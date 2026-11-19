import { describe, expect, it } from 'vitest';
import { REGIONS, REGION_ORDER, computeUnlockedRegions, createRegionRun, completeNode } from '../domain/region';
import { createDefaultSave } from '../domain/save';
import { LINKS } from '../content/modules';
import { createExpeditionBattle, getLegalSupportActions } from '../domain/battle2';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';

describe('Batch 2-5：五区与解锁链', () => {
  it('五区各有 5 节点和 Boss；解锁链逐区推进', () => {
    expect(REGION_ORDER).toHaveLength(5);
    for (const id of REGION_ORDER) {
      expect(REGIONS[id].nodes).toHaveLength(5);
      expect(REGIONS[id].nodes[4].type).toBe('boss');
    }
    expect(computeUnlockedRegions({})).toEqual(['river']);
    const runs = { river: { ...createRegionRun('river', 's'), completed: true } };
    expect(computeUnlockedRegions(runs)).toEqual(['river', 'zao']);
    const all = {
      river: { ...createRegionRun('river', 's'), completed: true },
      zao: { ...createRegionRun('zao', 's'), completed: true },
      bridge: { ...createRegionRun('bridge', 's'), completed: true },
      sakura: { ...createRegionRun('sakura', 's'), completed: true },
      thunder: { ...createRegionRun('thunder', 's'), completed: true },
    };
    expect(computeUnlockedRegions(all)).toHaveLength(5);
  });

  it('六条连携按羁绊等级过滤，每场一次', () => {
    expect(LINKS).toHaveLength(6);
    const triTeam = ['yusan', 'reganmian', 'lundu'].map((id, index) => {
      const sample = getSample(id)!;
      return compileCreature({
        vision: sample.vision,
        evidence: sample.evidence,
        buildPath: (['guardian', 'striker', 'support'] as const)[index],
        element: sample.element,
        source: 'sample',
        variant: index,
      });
    });
    const battle = createExpeditionBattle({
      seed: 'links',
      team: triTeam,
      enemy: { id: 't', name: '测试', element: 'structure', maxHp: 40, atk: 10, def: 4, kind: 'normal', taunt: '' },
      startResonance: 6,
      bondLevel: 0,
    });
    const low = getLegalSupportActions(battle).filter((action) => action.kind === 'link');
    expect(low.some((action) => action.kind === 'link' && action.linkId === 'LINK_RIVER')).toBe(false);
    const high = createExpeditionBattle({
      seed: 'links',
      team: triTeam,
      enemy: { id: 't', name: '测试', element: 'structure', maxHp: 40, atk: 10, def: 4, kind: 'normal', taunt: '' },
      startResonance: 6,
      bondLevel: 2,
    });
    const advanced = getLegalSupportActions(high).filter((action) => action.kind === 'link');
    expect(advanced.some((action) => action.kind === 'link' && action.linkId === 'LINK_RIVER')).toBe(true);
  });

  it('事件/战斗节点推进与 Boss 完成不越界', () => {
    let run = createRegionRun('zao', 'seed');
    for (let i = 0; i < 6; i += 1) run = completeNode(run, { materials: 1, tokens: 0 });
    expect(run.completed).toBe(true);
    expect(run.nodeIndex).toBe(4);
    expect(createDefaultSave().unlockedRegions).toEqual(['river']);
  });
});


