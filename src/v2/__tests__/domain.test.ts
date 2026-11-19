import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2_SAMPLES, getSample } from '../content/samples';
import { ACTIVE_BY_ID, ACTIVE_MODULES, LINKS, PASSIVE_MODULES, SUPPORT_COMMANDS } from '../content/modules';
import { validateContent } from '../content/validate';
import { compileCreature, previewBuild, statBudget } from '../domain/compile';
import { mergeEvidence, recommendPaths, toggleConfirmed } from '../domain/tags';
import type { FeatureEvidence, SaveV2, V2Creature } from '../domain/types';
import {
  BACKUP_KEY,
  LEGACY_KEY,
  SAVE_KEY,
  addCreature,
  createDefaultSave,
  exportSave,
  importSave,
  isV2Creature,
  loadSave,
  persistSave,
  recordBattleResult,
  setEquipped,
  setParty,
  toggleLock,
  validateSave,
} from '../domain/save';
import {
  ENEMIES,
  REGIONS,
  REGION_ORDER,
  applyEventChoice,
  completeNode,
  createRegionRun,
  currentNode,
} from '../domain/region';

function compileSample(id: string, pathOverride?: string): V2Creature {
  const sample = getSample(id)!;
  return compileCreature({
    vision: sample.vision,
    evidence: sample.evidence,
    buildPath: (pathOverride as never) ?? sample.recommendedPath,
    element: sample.element,
    source: 'sample',
    variant: 7,
    createdAt: 1_700_000_000_000,
  });
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('语义编译器', () => {
  it('8 个样本都能编译出合法角色：数值预算/技能/装备/被动', () => {
    for (const sample of V2_SAMPLES) {
      const creature = compileSample(sample.id);
      expect(creature.schemaVersion).toBe(2);
      expect(creature.actives).toHaveLength(3);
      expect(new Set(creature.actives).size).toBe(3);
      expect(creature.equipped).toHaveLength(2);
      expect(creature.equipped.every((id) => creature.actives.includes(id))).toBe(true);
      expect(ACTIVE_BY_ID.has(creature.passiveId)).toBe(false);
      expect(PASSIVE_MODULES.some((item) => item.id === creature.passiveId)).toBe(true);
      expect(SUPPORT_COMMANDS.some((item) => item.id === creature.supportCommandId)).toBe(true);
      const budget = statBudget(creature.stats);
      expect(budget).toBeGreaterThanOrEqual(68);
      expect(budget).toBeLessThanOrEqual(75);
      const equippedDamage = creature.equipped.some((id) => {
        const module = ACTIVE_BY_ID.get(id)!;
        return module.effect.kind === 'damage' || module.effect.kind === 'control';
      });
      expect(equippedDamage).toBe(true);
      expect(Number.isFinite(creature.stats.hp)).toBe(true);
    }
  });

  it('同输入同输出；不同 build 产生不同技能组合', () => {
    const a = compileSample('yusan');
    const b = compileSample('yusan');
    expect(a).toEqual(b);
    const guardian = compileSample('yusan', 'guardian');
    const striker = compileSample('yusan', 'striker');
    expect(guardian.actives).not.toEqual(striker.actives);
    expect(guardian.stats).not.toEqual(striker.stats);
    expect(guardian.buildPath).toBe('guardian');
  });

  it('每只角色至少有一个能造成伤害的技能', () => {
    for (const sample of V2_SAMPLES) {
      for (const path of ['guardian', 'striker', 'trickster', 'support', 'mover'] as const) {
        const creature = compileSample(sample.id, path);
        const hasDamage = creature.actives.some((id) => {
          const module = ACTIVE_BY_ID.get(id)!;
          return module.effect.kind === 'damage' || module.effect.kind === 'control';
        });
        expect(hasDamage).toBe(true);
      }
    }
  });

  it('证据合并优先级：用户确认 > 看见 > 推断', () => {
    const inferred: FeatureEvidence[] = [{ tag: 'protect', source: 'model_inferred', confidence: 0.3 }];
    const observed: FeatureEvidence[] = [{ tag: 'protect', source: 'vision_observed', evidenceText: '伞面' }];
    const confirmed: FeatureEvidence[] = [{ tag: 'protect', source: 'user_confirmed', evidenceText: '我确认' }];
    const merged = mergeEvidence(observed, inferred, confirmed);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('user_confirmed');
  });

  it('推荐路径与预览可用；确认/取消证据幂等', () => {
    const sample = getSample('yusan')!;
    const paths = recommendPaths(sample.evidence);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths[0]).toBe('guardian');
    const preview = previewBuild(sample.vision, sample.evidence, 'guardian');
    expect(preview.actives).toHaveLength(3);
    expect(preview.budget).toBeGreaterThanOrEqual(68);
    const once = toggleConfirmed(sample.evidence, 'protect');
    const twice = toggleConfirmed(once, 'protect');
    expect(twice.some((item) => item.tag === 'protect' && item.source === 'user_confirmed')).toBe(false);
  });
});

describe('内容白名单', () => {
  it('内容自检：无引用错误/非法枚举', () => {
    const issues = validateContent();
    const errors = issues.filter((issue) => issue.level === 'error');
    expect(errors).toEqual([]);
  });

  it('模块 ID 唯一、标签合法、支援/连携引用完整', () => {
    const ids = new Set<string>();
    for (const module of [...ACTIVE_MODULES, ...PASSIVE_MODULES]) {
      expect(ids.has(module.id)).toBe(false);
      ids.add(module.id);
      expect(module.tags.length).toBeGreaterThan(0);
    }
    expect(new Set(SUPPORT_COMMANDS.map((item) => item.id)).size).toBe(SUPPORT_COMMANDS.length);
    for (const link of LINKS) expect(link.requires.length).toBeGreaterThan(0);
  });

  it('五个区域均为 5 节点、Boss 指向正确、敌人可查', () => {
    expect(REGION_ORDER).toHaveLength(5);
    for (const id of REGION_ORDER) {
      const region = REGIONS[id];
      expect(region.nodes).toHaveLength(5);
      expect(region.nodes[4].type).toBe('boss');
      expect(region.nodes[4].enemyId).toBe(region.bossId);
      expect(ENEMIES[region.bossId]?.kind).toBe('boss');
    }
  });
});

describe('区域 run', () => {
  it('事件选择只生效一次，并修改开局共鸣/材料', () => {
    let run = createRegionRun('river', 'seed-1');
    expect(currentNode(run).type).toBe('event');
    run = applyEventChoice(run, 'ev_fog_lamp', 'light');
    expect(run.startResonance).toBe(4);
    const again = applyEventChoice(run, 'ev_fog_lamp', 'dark');
    expect(again.startResonance).toBe(4);
    expect(again.materials).toBe(run.materials);
  });

  it('节点推进与 Boss 完成', () => {
    let run = createRegionRun('river', 'seed-2');
    run = applyEventChoice(run, 'ev_fog_lamp', 'dark');
    expect(run.materials).toBe(2);
    run = completeNode(run, { materials: 1, tokens: 0 });
    expect(run.nodeIndex).toBe(1);
    run = completeNode(run, { materials: 2, tokens: 0 });
    run = completeNode(run, { materials: 2, tokens: 0 });
    run = completeNode(run, { materials: 2, tokens: 0 });
    run = completeNode(run, { materials: 2, tokens: 1 });
    expect(run.completed).toBe(true);
    expect(run.tokens).toBe(1);
  });
});

describe('存档 v2 / v1 迁移', () => {
  beforeEach(() => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
  });

  it('默认存档有 3 只 starter、队伍完整、可持久化读回', () => {
    const save = createDefaultSave(1_700_000_000_000);
    expect(save.collection).toHaveLength(3);
    expect(save.party.ids).toHaveLength(3);
    expect(save.collection.every(isV2Creature)).toBe(true);
    expect(persistSave(save)).toBe(true);
    const loaded = loadSave();
    expect(loaded.collection).toHaveLength(3);
    expect(loaded.regionRuns).toEqual({});
    expect(loaded.quests).toEqual({});
    expect(loaded.stats.nodeXpCounts).toEqual({});
  });

  it('Batch 1 旧存档（无 regionRuns/quests/成长字段）可迁移读取', () => {
    const base = createDefaultSave(1);
    const legacy = {
      ...base,
      run: {
        regionId: 'river',
        seed: 'old',
        nodeIndex: 2,
        materials: 3,
        tokens: 0,
        completed: false,
        startResonance: 2,
        eventChoices: {},
        log: [],
      },
      regionRuns: undefined,
      activeRegionId: undefined,
      unlockedRegions: undefined,
      bondPoints: undefined,
      quests: undefined,
      stats: undefined,
      collection: base.collection.map((item) => {
        const { level, xp, evolutionHistory, bondXp, evolutionBase, ...rest } = item;
        void level;
        void xp;
        void evolutionHistory;
        void bondXp;
        void evolutionBase;
        return rest;
      }),
    };
    const migrated = validateSave(JSON.parse(JSON.stringify(legacy)));
    expect(migrated).not.toBeNull();
    expect(migrated!.regionRuns.river?.nodeIndex).toBe(2);
    expect(migrated!.activeRegionId).toBe('river');
    expect(migrated!.collection[0].level).toBe(1);
    expect(migrated!.bondPoints).toBe(0);
    expect(migrated!.stats.battles).toBe(0);
  });

  it('v1 图鉴迁移：旧卡只读保留、备份写入、v2 键生成', () => {
    const legacy = [
      { id: 'm1', name: '芝麻旋旋', element: 'food', stats: { hp: 82, attack: 32, defense: 10, speed: 15 }, skills: ['BURST', 'RECOVER'], visualRecipe: {} },
      { id: 'm2', name: '伞跃跃', element: 'tool', stats: { hp: 86, attack: 28, defense: 11, speed: 16 }, skills: ['BURST', 'GUARD'], visualRecipe: {} },
    ];
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const save = loadSave();
    expect(save.legacyCards).toHaveLength(2);
    expect(save.migration.fromVersion).toBe(1);
    expect(localStorage.getItem(BACKUP_KEY)).toBeTruthy();
    expect(localStorage.getItem(SAVE_KEY)).toBeTruthy();
    // 再读一次不重复迁移、不丢旧卡
    const again = loadSave();
    expect(again.legacyCards).toHaveLength(2);
  });

  it('损坏的 v2 存档不崩溃、回退默认存档', () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const save = loadSave();
    expect(save.collection.length).toBeGreaterThan(0);
    expect(validateSave({ schemaVersion: 1 })).toBeNull();
  });

  it('收藏/锁定/队伍/装备/战绩/导入导出', () => {
    let save = createDefaultSave(1_700_000_000_000);
    const extra = compileSample('shuibei');
    save = addCreature(save, extra);
    expect(save.collection).toHaveLength(4);
    save = toggleLock(save, extra.id);
    expect(save.lockedIds).toContain(extra.id);
    const ids = save.collection.slice(0, 3).map((item) => item.id);
    save = setParty(save, ids, 1);
    expect(save.party.ids).toEqual(ids);
    expect(save.party.activeIndex).toBe(1);
    const first = save.collection[0];
    const equipped = first.actives.slice(1, 3);
    save = setEquipped(save, first.id, equipped);
    expect(save.collection.find((item) => item.id === first.id)!.equipped).toEqual(equipped);
    save = recordBattleResult(save, [first.id], 'win');
    expect(save.collection.find((item) => item.id === first.id)!.record.wins).toBe(1);
    const text = exportSave(save);
    const imported = importSave(text) as SaveV2;
    expect(imported.collection).toHaveLength(4);
    expect(importSave('not json')).toBeNull();
  });
});

