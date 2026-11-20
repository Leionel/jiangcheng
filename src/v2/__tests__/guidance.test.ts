import { describe, expect, it } from 'vitest';
import { createDefaultSave, awakenLegacyCard, validateSave, LEGACY_KEY } from '../domain/save';
import { nextStepFor } from '../domain/guidance';
import { createRegionRun } from '../domain/region';

describe('Batch 2：v1 觉醒与指引', () => {
  it('旧卡觉醒生成新的 v2 造物，旧图鉴保留并标记 awakenedId', () => {
    const save = createDefaultSave(1);
    save.legacyCards = [{ id: 'old-1', name: '旧伞', element: 'tool', createdAt: 1, sourceKey: 'jcm.gallery.v1' }];
    const next = awakenLegacyCard(save, 'old-1');
    expect(next.collection.length).toBe(save.collection.length + 1);
    expect(next.legacyCards[0].awakenedId).toBeTruthy();
    expect(next.collection.some((item) => item.legacyMonsterId === 'old-1')).toBe(true);
    const again = awakenLegacyCard(next, 'old-1');
    expect(again).toBe(next);
    expect(next.legacyCards[0].sourceKey).toBe(LEGACY_KEY);
  });

  it('觉醒后的存档可序列化/校验', () => {
    const save = createDefaultSave(1);
    save.legacyCards = [{ id: 'old-1', name: '旧伞', element: 'tool', createdAt: 1, sourceKey: 'jcm.gallery.v1' }];
    const next = awakenLegacyCard(save, 'old-1');
    const parsed = validateSave(JSON.parse(JSON.stringify(next)));
    expect(parsed).not.toBeNull();
    expect(parsed!.legacyCards[0].awakenedId).toBeTruthy();
  });

  it('下一步指引随进度变化', () => {
    const save = createDefaultSave(1);
    expect(nextStepFor(save).screen).toBe('capture');
    const withCapture = { ...save, stats: { ...save.stats, captures: 1 }, party: { ...save.party, ids: [] } };
    expect(nextStepFor(withCapture).screen).toBe('party');
    const withParty = { ...withCapture, party: save.party };
    expect(nextStepFor(withParty).screen).toBe('map');
    const withRun = {
      ...withParty,
      regionRuns: { river: createRegionRun('river', 's') },
      activeRegionId: 'river' as const,
    };
    expect(nextStepFor(withRun).screen).toBe('map');

    // 已参战且手头有信物与 Lv.3 造物时，优先引导进化
    const canEvolveSave = {
      ...withParty,
      tokens: 1,
      stats: { ...withParty.stats, battles: 2 },
      collection: withParty.collection.map((item, idx) => (idx === 0 ? { ...item, level: 3 } : item)),
    };
    expect(nextStepFor(canEvolveSave).screen).toBe('party');

    // 已参战且无可进化项、无进行中区域但有可领奖励时，优先引导领奖
    const canClaimSave = {
      ...withParty,
      stats: { ...withParty.stats, battles: 2, wins: 1 },
    };
    expect(nextStepFor(canClaimSave).screen).toBe('quests');
  });
});
