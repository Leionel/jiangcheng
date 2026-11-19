import type { Monster } from '../../shared/types';
import { hashString } from '../../shared/rng';
import { ACTIVE_BY_ID, PASSIVE_BY_ID, SUPPORT_BY_ID } from '../content/modules';
import { V2_SAMPLES, STARTER_SAMPLE_IDS, getSample } from '../content/samples';
import { compileCreature } from './compile';
import type { BuildPath, LegacyCard, SaveV2, V2Creature } from './types';

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

export function createDefaultSave(now = Date.now()): SaveV2 {
  const collection = starterCreatures(now);
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    collection,
    lockedIds: [],
    legacyCards: [],
    party: { ids: collection.map((item) => item.id), activeIndex: 0 },
    run: null,
    regionClears: 0,
    materials: 0,
    tokens: 0,
    settings: { aiMode: 'auto', reducedMotion: false },
    migration: { fromVersion: 0, migratedAt: now, sourceKey: null },
  };
}

function isFiniteInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function isV2Creature(value: unknown): value is V2Creature {
  if (!value || typeof value !== 'object') return false;
  const creature = value as Partial<V2Creature>;
  if (creature.schemaVersion !== 2) return false;
  if (typeof creature.id !== 'string' || !creature.id.startsWith('v2_')) return false;
  if (typeof creature.name !== 'string' || creature.name.length === 0) return false;
  if (typeof creature.element !== 'string') return false;
  if (!creature.stats) return false;
  if (!isFiniteInt(creature.stats.hp, 1, 200)) return false;
  if (!isFiniteInt(creature.stats.atk, 1, 99)) return false;
  if (!isFiniteInt(creature.stats.def, 1, 99)) return false;
  if (!isFiniteInt(creature.stats.spd, 1, 99)) return false;
  if (!Array.isArray(creature.actives) || creature.actives.length !== 3) return false;
  if (!Array.isArray(creature.equipped) || creature.equipped.length !== 2) return false;
  if (!creature.actives.every((id) => typeof id === 'string' && ACTIVE_BY_ID.has(id))) return false;
  if (!creature.equipped.every((id) => typeof id === 'string' && ACTIVE_BY_ID.has(id))) return false;
  if (typeof creature.passiveId !== 'string' || !PASSIVE_BY_ID.has(creature.passiveId)) return false;
  if (typeof creature.supportCommandId !== 'string' || !SUPPORT_BY_ID.has(creature.supportCommandId)) return false;
  if (!creature.visual || !Array.isArray(creature.visual.palette)) return false;
  return true;
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
    }));
}

export function validateSave(raw: unknown): SaveV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<SaveV2>;
  if (candidate.schemaVersion !== 2) return null;
  if (!Array.isArray(candidate.collection)) return null;
  const collection = candidate.collection.filter(isV2Creature);
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
    run: candidate.run && typeof candidate.run === 'object' ? candidate.run : null,
    regionClears: typeof candidate.regionClears === 'number' ? candidate.regionClears : 0,
    materials: typeof candidate.materials === 'number' ? candidate.materials : 0,
    tokens: typeof candidate.tokens === 'number' ? candidate.tokens : 0,
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
    const parsed = JSON.parse(raw);
    return sanitizeLegacyCards(parsed);
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

export function addCreature(save: SaveV2, creature: V2Creature): SaveV2 {
  const exists = save.collection.find((item) => item.id === creature.id);
  if (exists) return save;
  const collection = [creature, ...save.collection].slice(0, V2_COLLECTION_LIMIT);
  const next: SaveV2 = { ...save, collection, materials: save.materials };
  // 新角色默认进入空位；队伍满 3 时不自动替换
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

export function exportSave(save: SaveV2): string {
  return JSON.stringify({ ...save, exportedAt: Date.now() }, null, 2);
}

export function importSave(text: string): SaveV2 | null {
  try {
    const parsed = validateSave(JSON.parse(text));
    return parsed;
  } catch {
    return null;
  }
}

export function sampleCatalog(): typeof V2_SAMPLES {
  return V2_SAMPLES;
}
