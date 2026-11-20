import type { Monster } from '../../shared/types';
import type { Category, Element, VisionSummary } from '../../shared/types';
import { hashString } from '../../shared/rng';
import { ACTIVE_BY_ID, PASSIVE_BY_ID, SUPPORT_BY_ID } from '../content/modules';
import { EVOLUTION_BY_ID } from '../content/evolutions';
import { V2_SAMPLES, STARTER_SAMPLE_IDS, getSample } from '../content/samples';
import { compileCreature } from './compile';
import { inferTags, recommendPaths } from './tags';
import { applyEvolution, branchById, revertEvolution } from './evolution';
import { addBondXp, bondLevel, bondXpForBattle } from './bonds';
import { battleXp, grantXp } from './growth';
import { computeUnlockedRegions, createRegionRun, REGION_ORDER } from './region';
import type {
  BuildPath,
  EnemyKind,
  LegacyCard,
  RegionId,
  RegionRunState,
  SaveV2,
  V2Creature,
} from './types';

export const SAVE_KEY = 'jcm.v2.save';
export const LEGACY_KEY = 'jcm.gallery.v1';
export const BACKUP_KEY = 'jcm.backup.v1';
export const V2_COLLECTION_LIMIT = 120;

function storage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function starterCreatures(now: number): V2Creature[] {
  const paths: Record<string, BuildPath> = { yusan: 'guardian', reganmian: 'trickster', lundu: 'mover' };
  const starterNames: Record<string, string> = {
    yusan: '伞团团',
    reganmian: '面咕噜',
    lundu: '渡江仔',
  };
  return STARTER_SAMPLE_IDS.map((id) => {
    const sample = getSample(id)!;
    return compileCreature({
      vision: sample.vision,
      evidence: sample.evidence,
      buildPath: paths[id] ?? sample.recommendedPath,
      element: sample.element,
      name: starterNames[id],
      source: 'sample',
      variant: hashString(`starter-${id}`) % 97,
      createdAt: now,
    });
  });
}

function defaultStats(): SaveV2['stats'] {
  return {
    battles: 0,
    wins: 0,
    captures: 0,
    evolutions: 0,
    links: 0,
    bosses: 0,
    regionClears: 0,
    questsClaimed: 0,
    nodeXpCounts: {},
  };
}

export function createDefaultSave(now = Date.now()): SaveV2 {
  const collection = starterCreatures(now);
  const regionRuns: SaveV2['regionRuns'] = {};
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    collection,
    lockedIds: [],
    legacyCards: [],
    party: { ids: collection.map((item) => item.id), activeIndex: 0 },
    run: null,
    regionRuns,
    activeRegionId: 'river',
    unlockedRegions: ['river'],
    regionClears: 0,
    materials: 0,
    tokens: 0,
    bondPoints: 0,
    quests: {},
    stats: defaultStats(),
    settings: { aiMode: 'auto', reducedMotion: false },
    migration: { fromVersion: 0, migratedAt: now, sourceKey: null },
  };
}

function isFiniteInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function normalizeCreature(raw: Partial<V2Creature>): V2Creature | null {
  if (raw.schemaVersion !== 2) return null;
  if (typeof raw.id !== 'string' || !raw.id.startsWith('v2_')) return null;
  if (typeof raw.name !== 'string' || raw.name.length === 0) return null;
  if (typeof raw.element !== 'string') return null;
  if (!raw.stats) return null;
  if (!isFiniteInt(raw.stats.hp, 1, 300) || !isFiniteInt(raw.stats.atk, 1, 99)) return null;
  if (!isFiniteInt(raw.stats.def, 0, 99) || !isFiniteInt(raw.stats.spd, 1, 99)) return null;
  if (!Array.isArray(raw.actives) || raw.actives.length !== 3) return null;
  if (!Array.isArray(raw.equipped) || raw.equipped.length !== 2) return null;
  if (!raw.actives.every((id) => typeof id === 'string' && ACTIVE_BY_ID.has(id))) return null;
  if (!raw.equipped.every((id) => typeof id === 'string' && ACTIVE_BY_ID.has(id))) return null;
  if (typeof raw.passiveId !== 'string' || !PASSIVE_BY_ID.has(raw.passiveId)) return null;
  if (typeof raw.supportCommandId !== 'string' || !SUPPORT_BY_ID.has(raw.supportCommandId)) return null;
  if (!raw.visual || !Array.isArray(raw.visual.palette)) return null;
  const level = isFiniteInt(raw.level, 1, 5) ? raw.level : 1;
  const evolutionId =
    typeof raw.evolutionId === 'string' && EVOLUTION_BY_ID.has(raw.evolutionId) ? raw.evolutionId : undefined;
  return {
    ...(raw as V2Creature),
    schemaVersion: 2,
    level,
    xp: isFiniteInt(raw.xp, 0, 999) ? raw.xp : 0,
    ...(evolutionId ? { evolutionId } : {}),
    evolutionHistory: Array.isArray(raw.evolutionHistory)
      ? raw.evolutionHistory.filter((id): id is string => typeof id === 'string').slice(0, 12)
      : evolutionId
        ? [evolutionId]
        : [],
    ...(raw.evolutionBase && typeof raw.evolutionBase === 'object' ? { evolutionBase: raw.evolutionBase } : {}),
    bondXp: isFiniteInt(raw.bondXp, 0, 12) ? raw.bondXp : 0,
    record: {
      wins: isFiniteInt(raw.record?.wins, 0, 9999) ? raw.record!.wins : 0,
      losses: isFiniteInt(raw.record?.losses, 0, 9999) ? raw.record!.losses : 0,
    },
  };
}

export function isV2Creature(value: unknown): value is V2Creature {
  return Boolean(value && typeof value === 'object' && normalizeCreature(value as Partial<V2Creature>));
}

function sanitizeLegacyCards(raw: unknown): LegacyCard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Monster => Boolean(item && typeof item === 'object' && typeof (item as Monster).id === 'string'))
    .map((item) => ({
      id: item.id,
      name: typeof item.name === 'string' ? item.name.slice(0, 12) : '旧卡',
      element: typeof item.element === 'string' ? item.element : 'tool',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      sourceKey: LEGACY_KEY,
      ...(typeof (item as unknown as LegacyCard).awakenedId === 'string' ? { awakenedId: (item as unknown as LegacyCard).awakenedId } : {}),
    }));
}

function sanitizeRun(raw: unknown): RegionRunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const run = raw as Partial<RegionRunState>;
  if (typeof run.regionId !== 'string' || !REGION_ORDER.includes(run.regionId as RegionId)) return null;
  return {
    regionId: run.regionId as RegionId,
    seed: typeof run.seed === 'string' ? run.seed : 'migrated',
    nodeIndex: isFiniteInt(run.nodeIndex, 0, 20) ? run.nodeIndex : 0,
    materials: isFiniteInt(run.materials, 0, 9999) ? run.materials : 0,
    tokens: isFiniteInt(run.tokens, 0, 9999) ? run.tokens : 0,
    completed: Boolean(run.completed),
    startResonance: isFiniteInt(run.startResonance, 0, 6) ? run.startResonance : 2,
    startShield: isFiniteInt(run.startShield, 0, 30) ? run.startShield : 0,
    bossHpDelta: isFiniteInt(run.bossHpDelta, -60, 0) ? run.bossHpDelta : 0,
    flags: Array.isArray(run.flags) ? run.flags.filter((flag): flag is string => typeof flag === 'string').slice(0, 30) : [],
    eventChoices: run.eventChoices && typeof run.eventChoices === 'object' ? run.eventChoices : {},
    log: Array.isArray(run.log) ? run.log.filter((line): line is string => typeof line === 'string').slice(-20) : [],
  };
}

export function validateSave(raw: unknown): SaveV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<SaveV2>;
  if (candidate.schemaVersion !== 2) return null;
  if (!Array.isArray(candidate.collection)) return null;
  const collection = candidate.collection
    .map((item) => normalizeCreature(item as Partial<V2Creature>))
    .filter((item): item is V2Creature => Boolean(item));
  if (collection.length === 0) return null;
  const ids = new Set(collection.map((item) => item.id));
  const partyIds = Array.isArray(candidate.party?.ids)
    ? candidate.party!.ids.filter((id) => typeof id === 'string' && ids.has(id)).slice(0, 3)
    : [];
  while (partyIds.length < 3 && partyIds.length < collection.length) {
    const next = collection.find((item) => !partyIds.includes(item.id));
    if (!next) break;
    partyIds.push(next.id);
  }
  const activeIndex = isFiniteInt(candidate.party?.activeIndex, 0, 2) ? candidate.party!.activeIndex : 0;

  const regionRuns: Partial<Record<RegionId, RegionRunState>> = {};
  if (candidate.regionRuns && typeof candidate.regionRuns === 'object') {
    for (const regionId of REGION_ORDER) {
      const run = sanitizeRun((candidate.regionRuns as Record<string, unknown>)[regionId]);
      if (run && run.regionId === regionId) regionRuns[regionId] = run;
    }
  }
  // 兼容 Batch 1：旧 run 迁入 regionRuns
  const legacyRun = sanitizeRun(candidate.run);
  if (legacyRun && !regionRuns[legacyRun.regionId]) regionRuns[legacyRun.regionId] = legacyRun;
  const activeRegionId =
    candidate.activeRegionId && REGION_ORDER.includes(candidate.activeRegionId) ? candidate.activeRegionId : legacyRun?.regionId ?? 'river';
  const unlockedRegions = computeUnlockedRegions(regionRuns);
  if (!unlockedRegions.includes(activeRegionId)) unlockedRegions.unshift(activeRegionId);
  const statsCandidate = (candidate.stats ?? {}) as Partial<SaveV2['stats']>;
  const stats: SaveV2['stats'] = {
    ...defaultStats(),
    ...statsCandidate,
    nodeXpCounts: statsCandidate.nodeXpCounts && typeof statsCandidate.nodeXpCounts === 'object' ? statsCandidate.nodeXpCounts : {},
  };
  return {
    schemaVersion: 2,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    collection,
    lockedIds: Array.isArray(candidate.lockedIds)
      ? candidate.lockedIds.filter((id): id is string => typeof id === 'string' && ids.has(id))
      : [],
    legacyCards: Array.isArray(candidate.legacyCards) ? candidate.legacyCards.filter((card): card is LegacyCard => Boolean(card && typeof card.id === 'string')) : [],
    party: { ids: partyIds, activeIndex: Math.min(activeIndex, Math.max(0, partyIds.length - 1)) },
    run: regionRuns[activeRegionId] ?? null,
    regionRuns,
    activeRegionId,
    unlockedRegions,
    regionClears: isFiniteInt(candidate.regionClears, 0, 999) ? candidate.regionClears : 0,
    materials: isFiniteInt(candidate.materials, 0, 99999) ? candidate.materials : 0,
    tokens: isFiniteInt(candidate.tokens, 0, 9999) ? candidate.tokens : 0,
    bondPoints: isFiniteInt(candidate.bondPoints, 0, 99) ? candidate.bondPoints : 0,
    quests: candidate.quests && typeof candidate.quests === 'object' ? candidate.quests : {},
    stats,
    settings: {
      aiMode: candidate.settings?.aiMode === 'demo' ? 'demo' : 'auto',
      reducedMotion: Boolean(candidate.settings?.reducedMotion),
    },
    migration: candidate.migration && typeof candidate.migration === 'object'
      ? candidate.migration
      : { fromVersion: 0, migratedAt: Date.now(), sourceKey: null },
  };
}

/** 从 P1 图鉴迁移：只读保留旧卡（不静默删除、不改旧键） */
export function migrateLegacyCards(): LegacyCard[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(LEGACY_KEY);
    if (!raw) return [];
    return sanitizeLegacyCards(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function loadSave(): SaveV2 {
  const store = storage();
  if (!store) {
    const fallback = createDefaultSave();
    fallback.legacyCards = migrateLegacyCards();
    return fallback;
  }
  try {
    const raw = store.getItem(SAVE_KEY);
    if (raw) {
      const parsed = validateSave(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // 损坏时继续走迁移/默认存档
  }
  const save = createDefaultSave();
  const legacy = migrateLegacyCards();
  if (legacy.length) {
    save.legacyCards = legacy;
    save.migration = { fromVersion: 1, migratedAt: Date.now(), sourceKey: LEGACY_KEY };
    try {
      store.setItem(BACKUP_KEY, JSON.stringify(legacy));
    } catch {
      // 备份失败不阻断游戏
    }
  }
  persistSave(save);
  return save;
}

export function persistSave(save: SaveV2): boolean {
  const store = storage();
  if (!store) return false;
  const next = { ...save, updatedAt: Date.now() };
  try {
    store.setItem(SAVE_KEY, JSON.stringify(next));
    const verify = store.getItem(SAVE_KEY);
    return Boolean(verify && verify.length > 0);
  } catch {
    return false;
  }
}

/* ------------------------------ 生命周期辅助 ------------------------------ */

export function getActiveRun(save: SaveV2): RegionRunState | null {
  return save.regionRuns[save.activeRegionId] ?? save.run;
}

export function patchRegionRun(save: SaveV2, run: RegionRunState): SaveV2 {
  const regionRuns = { ...save.regionRuns, [run.regionId]: run };
  return {
    ...save,
    regionRuns,
    run: save.activeRegionId === run.regionId ? run : save.run,
    unlockedRegions: computeUnlockedRegions(regionRuns),
  };
}

export function setActiveRegion(save: SaveV2, regionId: RegionId): SaveV2 {
  return {
    ...save,
    activeRegionId: regionId,
    run: save.regionRuns[regionId] ?? null,
  };
}

export function startRegionRun(save: SaveV2, regionId: RegionId, seed: string): SaveV2 {
  const run = createRegionRun(regionId, seed);
  const regionRuns = { ...save.regionRuns, [regionId]: run };
  return {
    ...save,
    regionRuns,
    activeRegionId: regionId,
    run,
    unlockedRegions: computeUnlockedRegions(regionRuns),
  };
}

export function addCreature(save: SaveV2, creature: V2Creature): SaveV2 {
  const exists = save.collection.find((item) => item.id === creature.id);
  if (exists) return save;
  let collection = [creature, ...save.collection];
  if (collection.length > V2_COLLECTION_LIMIT) {
    const locked = new Set(save.lockedIds);
    const evictIndex = [...collection].reverse().findIndex((item) => !locked.has(item.id));
    if (evictIndex < 0) return save; // 全部锁定：拒绝新卡，避免静默丢失
    collection = collection.filter((_, index) => index !== collection.length - 1 - evictIndex);
  }
  const next: SaveV2 = {
    ...save,
    collection,
    stats: { ...save.stats, captures: save.stats.captures + 1 },
  };
  if (next.party.ids.length < 3) next.party = { ...next.party, ids: [...next.party.ids, creature.id] };
  return next;
}

export function toggleLock(save: SaveV2, id: string): SaveV2 {
  const locked = save.lockedIds.includes(id)
    ? save.lockedIds.filter((item) => item !== id)
    : [...save.lockedIds, id];
  return { ...save, lockedIds: locked };
}

export function deleteCreature(save: SaveV2, id: string): SaveV2 {
  if (save.lockedIds.includes(id)) return save;
  const collection = save.collection.filter((item) => item.id !== id);
  const partyIds = save.party.ids.filter((item) => item !== id);
  return {
    ...save,
    collection,
    party: { ids: partyIds, activeIndex: Math.min(save.party.activeIndex, Math.max(0, partyIds.length - 1)) },
  };
}

export function setParty(save: SaveV2, ids: string[], activeIndex: number): SaveV2 {
  const unique = [...new Set(ids)].filter((id) => save.collection.some((item) => item.id === id)).slice(0, 3);
  return { ...save, party: { ids: unique, activeIndex: Math.max(0, Math.min(activeIndex, unique.length - 1)) } };
}

export function setEquipped(save: SaveV2, creatureId: string, equipped: string[]): SaveV2 {
  const unique = [...new Set(equipped)].slice(0, 2);
  return {
    ...save,
    collection: save.collection.map((item) =>
      item.id === creatureId && unique.every((id) => item.actives.includes(id)) ? { ...item, equipped: unique } : item,
    ),
  };
}

export function recordBattleResult(save: SaveV2, creatureIds: string[], outcome: 'win' | 'lose' | 'draw'): SaveV2 {
  return {
    ...save,
    collection: save.collection.map((item) => {
      if (!creatureIds.includes(item.id)) return item;
      if (outcome === 'draw') return item;
      return {
        ...item,
        record: {
          wins: item.record.wins + (outcome === 'win' ? 1 : 0),
          losses: item.record.losses + (outcome === 'lose' ? 1 : 0),
        },
      };
    }),
  };
}

/** 单场战斗后的成长：XP（节点重复递减）+ 羁绊；返回升级数量用于 UI */
export function applyBattleGrowth(
  save: SaveV2,
  input: { partyIds: string[]; outcome: 'win' | 'lose' | 'draw'; enemyKind: EnemyKind; nodeKey: string },
): { save: SaveV2; levelsGained: number; xpGained: number } {
  const repeat = save.stats.nodeXpCounts[input.nodeKey] ?? 0;
  const xp = battleXp(input.enemyKind, input.outcome, repeat);
  let levelsGained = 0;
  const collection = save.collection.map((item) => {
    if (!input.partyIds.includes(item.id)) return item;
    const growth = grantXp(item, xp);
    levelsGained += growth.gained;
    return addBondXp(growth.creature, bondXpForBattle(input.outcome));
  });
  return {
    save: {
      ...save,
      collection,
      bondPoints: Math.min(30, save.bondPoints + bondXpForBattle(input.outcome)),
      stats: {
        ...save.stats,
        battles: save.stats.battles + 1,
        wins: save.stats.wins + (input.outcome === 'win' ? 1 : 0),
        nodeXpCounts: {
          ...save.stats.nodeXpCounts,
          [input.nodeKey]: repeat + 1,
        },
      },
    },
    levelsGained,
    xpGained: xp,
  };
}

export function bindLinkStat(save: SaveV2): SaveV2 {
  return { ...save, stats: { ...save.stats, links: save.stats.links + 1 } };
}

export function evolveCreature(save: SaveV2, creatureId: string, branchId: string): SaveV2 {
  const branch = branchById(branchId);
  if (!branch) return save;
  if (save.tokens < 1) return save;
  const target = save.collection.find((item) => item.id === creatureId);
  if (!target || target.evolutionId) return save;
  return {
    ...save,
    tokens: save.tokens - 1,
    collection: save.collection.map((item) => (item.id === creatureId ? applyEvolution(item, branch) : item)),
    stats: { ...save.stats, evolutions: save.stats.evolutions + 1 },
  };
}

export function deevolveCreature(save: SaveV2, creatureId: string): SaveV2 {
  if (save.tokens < 1) return save;
  return {
    ...save,
    tokens: save.tokens - 1,
    collection: save.collection.map((item) => (item.id === creatureId ? revertEvolution(item) : item)),
  };
}

export function completeRegion(save: SaveV2, run: RegionRunState): SaveV2 {
  if (!run.completed) return save;
  const already = save.regionRuns[run.regionId]?.completed && save.regionClears > 0;
  const regionRuns = { ...save.regionRuns, [run.regionId]: run };
  return {
    ...save,
    regionRuns,
    run: save.activeRegionId === run.regionId ? run : save.run,
    regionClears: Math.max(save.regionClears, Object.values(regionRuns).filter((item) => item?.completed).length),
    unlockedRegions: computeUnlockedRegions(regionRuns),
    stats: {
      ...save.stats,
      regionClears: Object.values(regionRuns).filter((item) => item?.completed).length,
      bosses: save.stats.bosses + (already ? 0 : 1),
    },
  };
}

export function bondLevelOf(save: SaveV2): number {
  return bondLevel(save.bondPoints);
}

const ELEMENT_TO_CATEGORY: Record<Element, Category> = {
  food: 'food',
  water: 'water',
  nature: 'nature',
  structure: 'building',
  tool: 'everyday',
};

const ELEMENT_COLORS: Record<Element, [string, string, string]> = {
  food: ['#C9822F', '#F2D9A6', '#5A3A1E'],
  water: ['#1B4E75', '#8FB6C6', '#D9DEE6'],
  nature: ['#D4798F', '#F2E6C9', '#7A4A5A'],
  structure: ['#6B5B4E', '#E8E2D2', '#3B3A33'],
  tool: ['#3B4A63', '#8FA3B8', '#D9DEE6'],
};

/** v1 卡“觉醒”为 2.0 造物：只读旧卡保留，新造物另存；同一旧卡只觉醒一次 */
export function awakenLegacyCard(save: SaveV2, cardId: string): SaveV2 {
  const card = save.legacyCards.find((item) => item.id === cardId);
  if (!card || card.awakenedId) return save;
  const element = (['food', 'water', 'nature', 'structure', 'tool'].includes(card.element) ? card.element : 'tool') as Element;
  const category = ELEMENT_TO_CATEGORY[element];
  const vision: VisionSummary = {
    primaryObject: card.name,
    category,
    colors: ELEMENT_COLORS[element],
    features: ['旧图鉴记忆', card.name.slice(0, 6)],
    confidence: 'medium',
  };
  const evidence = inferTags(vision).map((item) => ({ ...item, source: 'vision_observed' as const }));
  const path = recommendPaths(evidence)[0] ?? 'guardian';
  const creature = compileCreature({
    vision,
    evidence,
    buildPath: path,
    element,
    name: card.name,
    flavor: `从 P1 图鉴里醒过来的旧回响；它记得自己叫过「${card.name}」。`,
    source: 'legacy',
    variant: hashString(`legacy-${card.id}`) % 97,
    createdAt: Date.now(),
  });
  const withCreature = addCreature(save, { ...creature, legacyMonsterId: card.id });
  return {
    ...withCreature,
    legacyCards: withCreature.legacyCards.map((item) =>
      item.id === cardId ? { ...item, awakenedId: creature.id } : item,
    ),
  };
}

export function exportSave(save: SaveV2): string {
  return JSON.stringify({ ...save, exportedAt: Date.now() }, null, 2);
}

export function importSave(text: string): SaveV2 | null {
  try {
    return validateSave(JSON.parse(text));
  } catch {
    return null;
  }
}

export function sampleCatalog(): typeof V2_SAMPLES {
  return V2_SAMPLES;
}


