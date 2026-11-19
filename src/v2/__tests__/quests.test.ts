import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../domain/save';
import { QUEST_BY_ID, QUEST_DEFS, claimQuest, completedQuestCount, questProgress, questState } from '../domain/quests';
import { createRegionRun } from '../domain/region';

describe('Batch 2：任务系统', () => {
  it('软锁/前置/完成/领取幂等', () => {
    const save = createDefaultSave(1);
    const locked = QUEST_BY_ID.get('q_zao_clear')!;
    expect(questState(locked, save)).toBe('locked');
    const first = QUEST_BY_ID.get('q_first_win')!;
    expect(questState(first, save)).toBe('active');
    expect(claimQuest(save, first.id)).toBe(save); // 未完成不能领

    const afterWin = { ...save, stats: { ...save.stats, wins: 1 } };
    expect(questState(first, afterWin)).toBe('complete');
    expect(questProgress(first, afterWin)).toBe(1);
    const claimed = claimQuest(afterWin, first.id);
    expect(claimed.quests[first.id]?.claimed).toBe(true);
    expect(claimed.materials).toBe(afterWin.materials + (first.reward.materials ?? 0));
    expect(claimQuest(claimed, first.id)).toBe(claimed);
    expect(completedQuestCount(claimed)).toBe(1);
  });

  it('区域完成会依次解锁任务链', () => {
    const save = createDefaultSave(1);
    const riverRun = { ...createRegionRun('river', 's'), completed: true };
    const afterRiver = {
      ...save,
      regionRuns: { river: riverRun },
      stats: { ...save.stats, wins: 1 },
    };
    const qRiver = QUEST_BY_ID.get('q_river_clear')!;
    expect(questState(qRiver, afterRiver)).toBe('complete');
    const claimed = claimQuest(afterRiver, qRiver.id);
    expect(questState(QUEST_BY_ID.get('q_zao_clear')!, claimed)).toBe('active');
    expect(QUEST_DEFS.length).toBeGreaterThanOrEqual(12);
  });
});
