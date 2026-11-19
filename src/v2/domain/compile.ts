import type { Element, VisualRecipe } from '../../shared/types';
import { clamp, createRng, hashString } from '../../shared/rng';
import { CATEGORY_TO_ELEMENT, typeMultiplier } from '../../features/monsters/elements';
import { defaultRecipeFor, localName, localTheme } from '../../features/monsters/build';
import { ACTIVE_BY_ID, PASSIVE_BY_ID, PASSIVE_MODULES, SUPPORT_BY_ID } from '../content/modules';
import { PATH_META, pathScore, recommendPaths } from './tags';
import type {
  BuildPath,
  CreatureBuildInput,
  CreatureStats,
  FeatureEvidence,
  V2Creature,
  VisualRecipeV2,
} from './types';

/** 五条 build path 的初始数值底盘（预算 68–75，见 BALANCE_AND_ACCEPTANCE §1.2） */
const PATH_STATS: Record<BuildPath, CreatureStats> = {
  guardian: { hp: 90, atk: 24, def: 16, spd: 10 },
  striker: { hp: 74, atk: 32, def: 10, spd: 15 },
  trickster: { hp: 72, atk: 28, def: 9, spd: 18 },
  support: { hp: 84, atk: 24, def: 15, spd: 13 },
  mover: { hp: 78, atk: 26, def: 11, spd: 17 },
};

const PATH_ACTIVE_POOL: Record<BuildPath, string[]> = {
  guardian: ['A01', 'A08', 'A15', 'A13', 'A17', 'A20', 'A24'],
  striker: ['A10', 'A07', 'A16', 'A21', 'A05', 'A04'],
  trickster: ['A02', 'A18', 'A22', 'A04', 'A09', 'A11'],
  support: ['A12', 'A19', 'A23', 'A06', 'A15', 'A08'],
  mover: ['A03', 'A16', 'A24', 'A11', 'A05', 'A07'],
};

const PATH_PASSIVE_POOL: Record<BuildPath, string[]> = {
  guardian: ['P01', 'P05', 'P09'],
  striker: ['P07', 'P03', 'P04'],
  trickster: ['P02', 'P06', 'P04'],
  support: ['P06', 'P05', 'P09'],
  mover: ['P08', 'P04', 'P03'],
};

export const STAT_RANGES = {
  hp: [65, 100] as const,
  atk: [18, 35] as const,
  def: [5, 20] as const,
  spd: [5, 20] as const,
};

function moduleDealsDamage(moduleId: string): boolean {
  const module = ACTIVE_BY_ID.get(moduleId);
  if (!module) return false;
  return module.effect.kind === 'damage' || module.effect.kind === 'control';
}

function allocateStats(path: BuildPath, seed: string, element: Element): CreatureStats {
  const base = PATH_STATS[path];
  const rng = createRng(`${seed}|stats|${path}|${element}`);
  const stats: CreatureStats = {
    hp: base.hp + Math.round((rng() - 0.5) * 4),
    atk: base.atk + Math.round((rng() - 0.5) * 3),
    def: base.def + Math.round((rng() - 0.5) * 3),
    spd: base.spd + Math.round((rng() - 0.5) * 3),
  };
  stats.hp = clamp(stats.hp, STAT_RANGES.hp[0], STAT_RANGES.hp[1]);
  stats.atk = clamp(stats.atk, STAT_RANGES.atk[0], STAT_RANGES.atk[1]);
  stats.def = clamp(stats.def, STAT_RANGES.def[0], STAT_RANGES.def[1]);
  stats.spd = clamp(stats.spd, STAT_RANGES.spd[0], STAT_RANGES.spd[1]);

  const budget = () => stats.hp / 5 + stats.atk + stats.def + stats.spd;
  let guard = 0;
  while (budget() < 68 && guard < 8) {
    stats.hp = clamp(stats.hp + 2, STAT_RANGES.hp[0], STAT_RANGES.hp[1]);
    guard += 1;
  }
  guard = 0;
  while (budget() > 75 && guard < 8) {
    stats.hp = clamp(stats.hp - 2, STAT_RANGES.hp[0], STAT_RANGES.hp[1]);
    guard += 1;
  }
  return stats;
}

export function statBudget(stats: CreatureStats): number {
  return stats.hp / 5 + stats.atk + stats.def + stats.spd;
}

function pickActives(path: BuildPath, evidence: FeatureEvidence[], seed: string): string[] {
  const rng = createRng(`${seed}|actives`);
  const pool = PATH_ACTIVE_POOL[path];
  const scored = pool
    .map((id, index) => {
      const module = ACTIVE_BY_ID.get(id);
      const tagScore = (module?.tags ?? []).reduce(
        (score, tag) => score + (evidence.some((item) => item.tag === tag) ? 3 : 0),
        0,
      );
      return { id, score: tagScore + (pool.length - index) * 0.5 + rng() };
    })
    .sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, 3).map((item) => item.id);
  if (!picked.some(moduleDealsDamage)) {
    const damage = scored.map((item) => item.id).find((id) => moduleDealsDamage(id));
    if (damage && !picked.includes(damage)) picked[picked.length - 1] = damage;
  }
  // 保证装备的两个技能里至少有一个能造成伤害，避免“无输出”的死局
  const damageIndex = picked.findIndex((id) => moduleDealsDamage(id));
  if (damageIndex > 0) {
    const [damageId] = picked.splice(damageIndex, 1);
    picked.unshift(damageId);
  }
  return picked;
}

function pickPassive(path: BuildPath, evidence: FeatureEvidence[], seed: string): string {
  const rng = createRng(`${seed}|passive`);
  const pool = PATH_PASSIVE_POOL[path];
  const scored = pool
    .map((id) => {
      const module = PASSIVE_BY_ID.get(id);
      const tagScore = (module?.tags ?? []).reduce(
        (score, tag) => score + (evidence.some((item) => item.tag === tag) ? 2 : 0),
        0,
      );
      return { id, score: tagScore + rng() };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? PASSIVE_MODULES[0].id;
}

function buildVisual(vision: CreatureBuildInput['vision']): VisualRecipeV2 {
  const base: VisualRecipe = defaultRecipeFor(vision.category);
  const colors = vision.colors.filter((color) => /^#[0-9a-f]{6}$/i.test(color));
  const palette: [string, string, string] =
    colors.length >= 3
      ? [colors[0], colors[1], colors[2]]
      : [base.palette[0], base.palette[1], base.palette[2]];
  return {
    shape: base.shape,
    crest: base.crest,
    accessory: base.accessory,
    palette,
    evolutionLayers: [],
  };
}

/**
 * 物品语义编译器（纯函数、确定性）。
 * 输入：视觉摘要 + 证据 + 玩家选择的 build path + variant。
 * 输出：数值/技能/被动/外观全部合法的 V2Creature；AI 不参与数值。
 */
export function compileCreature(input: CreatureBuildInput): V2Creature {
  const evidence = input.evidence.filter((item) => item.tag);
  const categoryElement = CATEGORY_TO_ELEMENT[input.vision.category];
  const element: Element = input.element ?? categoryElement;
  const seed = `${input.vision.primaryObject}|${input.vision.category}|${input.vision.features.join('/')}|${input.variant}|${input.buildPath}`;
  const hash = hashString(seed);
  const id = `v2_${hash.toString(16)}`;
  const stats = allocateStats(input.buildPath, seed, element);
  const actives = pickActives(input.buildPath, evidence, seed);
  const passiveId = pickPassive(input.buildPath, evidence, seed);
  const supportCommandId = PATH_META[input.buildPath].supportId;
  const support = SUPPORT_BY_ID.get(supportCommandId);

  return {
    schemaVersion: 2,
    id,
    name: input.name?.slice(0, 8) || localName(input.vision, element),
    flavor: input.flavor?.slice(0, 60) || localTheme(input.vision, element),
    element,
    buildPath: input.buildPath,
    stats,
    evidence,
    actives,
    equipped: actives.slice(0, 2),
    passiveId,
    supportCommandId: support ? supportCommandId : 'SUP_BRACE',
    visual: buildVisual(input.vision),
    source: input.source,
    record: { wins: 0, losses: 0 },
    createdAt: input.createdAt ?? Date.now(),
    level: input.level ?? 1,
    xp: input.xp ?? 0,
    ...(input.evolutionId ? { evolutionId: input.evolutionId } : {}),
    evolutionHistory: input.evolutionId ? [input.evolutionId] : [],
    bondXp: 0,
  };
}

/** 供 UI 展示：某路径的首批能力与预算 */
export function previewBuild(
  vision: CreatureBuildInput['vision'],
  evidence: FeatureEvidence[],
  path: BuildPath,
): {
  path: BuildPath;
  name: string;
  stats: CreatureStats;
  actives: Array<{ id: string; name: string; text: string; cost: number; power: number }>;
  passive: { id: string; name: string; text: string };
  support: { id: string; name: string; text: string };
  budget: number;
} {
  const creature = compileCreature({
    vision,
    evidence,
    buildPath: path,
    source: 'sample',
    variant: 0,
  });
  return {
    path,
    name: creature.name,
    stats: creature.stats,
    actives: creature.actives.map((moduleId) => {
      const module = ACTIVE_BY_ID.get(moduleId)!;
      return { id: module.id, name: module.name, text: module.text, cost: module.cost, power: module.power };
    }),
    passive: (() => {
      const passive = PASSIVE_BY_ID.get(creature.passiveId)!;
      return { id: passive.id, name: passive.name, text: passive.text };
    })(),
    support: (() => {
      const command = SUPPORT_BY_ID.get(creature.supportCommandId)!;
      return { id: command.id, name: command.name, text: command.text };
    })(),
    budget: Math.round(statBudget(creature.stats) * 10) / 10,
  };
}

export function creatureMatchup(creature: V2Creature, enemyElement: Element): number {
  return typeMultiplier(creature.element, enemyElement);
}

export function recommendedPathsFor(evidence: FeatureEvidence[]): BuildPath[] {
  return recommendPaths(evidence);
}

export function evidenceTagSet(evidence: FeatureEvidence[]): Set<string> {
  return new Set(evidence.map((item) => item.tag));
}

export function pathScoreFor(evidence: FeatureEvidence[], path: BuildPath): number {
  return pathScore(evidence, path);
}
