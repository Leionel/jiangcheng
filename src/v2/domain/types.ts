/**
 * 江城万物怪 2.0 · 领域类型（Batch 1 纵向切片）
 *
 * 与 P1 的关系：
 * - 复用 P1 的 Element / Category / VisualRecipe / typeMultiplier；
 * - 规则版本独立为 expedition_v2，不改 quick_v1 的 BattleState；
 * - AI 只输出意图/标签/台词，数值全部由本文件的纯函数与 content 表决定。
 */
import type {
  AccessoryKind,
  Category,
  CrestKind,
  Element,
  ShapeKind,
  VisionSummary,
  VisualRecipe,
} from '../../shared/types';

/* ------------------------------- 语义标签 ------------------------------- */

export type CategoryTag =
  | 'food'
  | 'tool'
  | 'nature'
  | 'vehicle'
  | 'building'
  | 'stationery'
  | 'textile'
  | 'toy'
  | 'other';
export type ShapeTag = 'round' | 'long' | 'flat' | 'foldable' | 'layered' | 'branched' | 'hollow';
export type TextureTag = 'smooth' | 'rough' | 'woven' | 'soft' | 'rigid' | 'liquid_like';
export type FunctionTag =
  | 'protect'
  | 'carry'
  | 'connect'
  | 'bind'
  | 'illuminate'
  | 'nourish'
  | 'propel'
  | 'decorate';
export type ThemeTag =
  | 'river'
  | 'rain'
  | 'flower'
  | 'street_food'
  | 'bridge'
  | 'campus'
  | 'invention'
  | 'generic';
export type Tag = CategoryTag | ShapeTag | TextureTag | FunctionTag | ThemeTag;
export type EvidenceSource = 'vision_observed' | 'model_inferred' | 'user_confirmed';

export type FeatureEvidence = {
  tag: Tag;
  source: EvidenceSource;
  confidence?: number;
  evidenceText?: string;
};

export type BuildPath = 'guardian' | 'striker' | 'trickster' | 'support' | 'mover';

/* --------------------------------- 能力 --------------------------------- */

export type StatusId = 'wet' | 'vulnerable' | 'shield' | 'charge' | 'guard' | 'mark' | 'bind' | 'heat';
export type StatusStack = { id: StatusId; stacks: number; turns: number };

export type ActiveEffect =
  | { kind: 'damage'; power: number; status?: StatusId; stacks?: number }
  | { kind: 'shield'; amount: number; team?: boolean }
  | { kind: 'heal'; amount: number; cleanse?: StatusId }
  | { kind: 'charge'; stacks: number }
  | { kind: 'guard'; turns: number }
  | { kind: 'mark'; turns: number }
  | { kind: 'control'; damage: number }
  | { kind: 'resonance'; amount: number; damage?: number };

export type ActiveModule = {
  id: string;
  name: string;
  kind: 'attack' | 'guard' | 'heal' | 'control' | 'buff';
  power: number;
  cost: number;
  cooldown: number;
  tags: Tag[];
  effect: ActiveEffect;
  text: string;
};

export type PassiveModule = {
  id: string;
  name: string;
  tags: Tag[];
  text: string;
};

export type SupportCommand = {
  id: string;
  name: string;
  cost: number;
  cooldown: number;
  text: string;
  effect:
    | { kind: 'shield'; amount: number }
    | { kind: 'heal'; amount: number; cleanse?: StatusId }
    | { kind: 'charge'; stacks: number }
    | { kind: 'scout' }
    | { kind: 'ferry' };
};

export type VisualRecipeV2 = VisualRecipe & {
  evolutionLayers: string[];
};

/* --------------------------------- 角色 --------------------------------- */

export type CreatureStats = { hp: number; atk: number; def: number; spd: number };

export type V2Creature = {
  schemaVersion: 2;
  id: string;
  name: string;
  flavor: string;
  element: Element;
  buildPath: BuildPath;
  stats: CreatureStats;
  evidence: FeatureEvidence[];
  actives: string[];
  equipped: string[];
  passiveId: string;
  supportCommandId: string;
  visual: VisualRecipeV2;
  source: 'sample' | 'upload' | 'legacy';
  legacyMonsterId?: string;
  record: { wins: number; losses: number };
  createdAt: number;
  /** Batch 2：熟练度与进化 */
  level: number;
  xp: number;
  evolutionId?: string;
  evolutionHistory: string[];
  evolutionBase?: {
    stats: CreatureStats;
    actives: string[];
    equipped: string[];
    palette: [string, string, string];
  };
  /** 每只造物的羁绊经验（队伍一起战斗获得） */
  bondXp: number;
};

/* -------------------------------- 战斗 --------------------------------- */

export type BattleEventKind = 'round' | 'skill' | 'support' | 'link' | 'swap' | 'guard' | 'enemy' | 'status' | 'end';
export type BattleEvent = {
  round: number;
  kind: BattleEventKind;
  text: string;
  detail?: string;
  actor?: 'player' | 'enemy';
  damage?: number;
};

export type EnemyKind = 'normal' | 'elite' | 'boss';
export type BossRule = 'storm' | 'heat' | 'lock' | 'record' | 'thunder';
export type EnemyDef = {
  id: string;
  name: string;
  element: Element;
  maxHp: number;
  atk: number;
  def: number;
  kind: EnemyKind;
  taunt: string;
  /** 五区 Boss 的规则机制；普通/精英不填 */
  bossRule?: BossRule;
};

export type EnemyActionId =
  | 'strike'
  | 'guard'
  | 'gather'
  | 'storm'
  | 'deluge'
  | 'heat_wave'
  | 'lock'
  | 'record'
  | 'overload';

export type EnemyIntent = {
  action: EnemyActionId;
  text: string;
  estimate: number;
  source: 'ai' | 'rule' | 'script';
  reason?: string;
  taunt?: string;
  model?: string;
  latencyMs?: number;
};

export type BattleCreatureState = {
  creature: V2Creature;
  hp: number;
  statuses: StatusStack[];
  cooldowns: Record<string, number>;
  supportCd: number;
  alive: boolean;
  /** 每场一次触发的被动标记 */
  passiveUsed: boolean;
  /** 热度积累等被动需要记录上一招 */
  lastSkillId?: string;
  /** 桥接/换位后的下一击加成 */
  swapBonus: number;
};

export type EnemyState = {
  def: EnemyDef;
  hp: number;
  phase: number;
  shield: number;
  charge: number;
  statuses: StatusStack[];
};

export type BattleOutcomeV2 = 'win' | 'lose' | 'draw';

export type PlanRecord = {
  round: number;
  action: EnemyActionId;
  source: 'ai' | 'rule';
  reason?: string;
  taunt?: string;
  model?: string;
  latencyMs?: number;
};

export type PlayerMainAction =
  | { kind: 'skill'; skillId: string }
  | { kind: 'swap'; targetIndex: number }
  | { kind: 'guard' }
  | { kind: 'basic' };

export type PlayerSupportAction =
  | { kind: 'support'; reserveIndex: number }
  | { kind: 'link'; linkId: string };

export type PlayerRoundInput = {
  main: PlayerMainAction;
  support?: PlayerSupportAction;
};

export type ExpeditionBattleState = {
  schemaVersion: 2;
  rulesetVersion: 'expedition_v2';
  seed: string;
  round: number;
  maxRounds: number;
  resonance: number;
  team: BattleCreatureState[];
  activeIndex: number;
  enemy: EnemyState;
  intent: EnemyIntent | null;
  log: BattleEvent[];
  planLog: PlanRecord[];
  outcome: BattleOutcomeV2 | null;
  linkUsed: boolean;
  /** Batch 2：队伍羁绊等级，决定高级连携是否可用 */
  bondLevel: number;
  /** 桥影守卫的封锁：该回合之前支援不可用 */
  supportLockedRound: number;
  /** 樱信档案员记录的上一个玩家技能 */
  recordedSkill?: string;
  rewards: { materials: number; tokens: number };
  fingerprint: string;
};
export type BattleRewards = { materials: number; tokens: number };

/* -------------------------------- 区域 --------------------------------- */

export type RegionId = 'river' | 'zao' | 'bridge' | 'sakura' | 'thunder';
export type RegionNodeType = 'event' | 'battle' | 'elite' | 'boss';

export type EventChoice = {
  id: string;
  label: string;
  desc: string;
  requiresFlag?: string;
  /** 可选：需要队伍中至少 1 只造物携带该物性标签，才可选择 */
  requiresTag?: Tag;
  /** 可选：队伍含该物性标签时触发的额外增益与文案 */
  bonusTag?: Tag;
  bonusDesc?: string;
  bonusEffect?: EventChoice['effect'];
  /** 选择后写入 run.flags，作为后续事件/战斗的持久影响 */
  flags?: string[];
  effect:
    | { kind: 'runResonance'; amount: number }
    | { kind: 'materials'; amount: number }
    | { kind: 'tokens'; amount: number }
    | { kind: 'bond'; amount: number }
    | { kind: 'startShield'; amount: number }
    | { kind: 'bossHp'; amount: number }
    | { kind: 'flag'; flag: string }
    | { kind: 'none' };
};

export type GameEvent = {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
};

export type RegionNodeDef = {
  id: string;
  type: RegionNodeType;
  title: string;
  desc: string;
  eventId?: string;
  enemyId?: string;
};

export type RegionDef = {
  id: RegionId;
  name: string;
  subtitle: string;
  accent: string;
  nodes: RegionNodeDef[];
  bossId: string;
  /** Batch 3/5：解锁条件 */
  unlockAfter?: RegionId;
  landmark: string;
  blurb: string;
  /** 额外事件池：第二事件节点按 seed 轮换，提供 20 个事件的内容量 */
  extraEvents?: string[];
};

export type RegionRunState = {
  regionId: RegionId;
  seed: string;
  nodeIndex: number;
  materials: number;
  tokens: number;
  completed: boolean;
  startResonance: number;
  /** Batch 2：事件留下的长期影响 */
  startShield: number;
  bossHpDelta: number;
  flags: string[];
  eventChoices: Record<string, string>;
  log: string[];
};

/* -------------------------------- 存档 --------------------------------- */

export type LegacyCard = {
  id: string;
  name: string;
  element: string;
  createdAt: number;
  sourceKey: 'jcm.gallery.v1';
  awakenedId?: string;
};

export type SaveV2 = {
  schemaVersion: 2;
  createdAt: number;
  updatedAt: number;
  collection: V2Creature[];
  lockedIds: string[];
  legacyCards: LegacyCard[];
  party: { ids: string[]; activeIndex: number };
  /** 兼容字段：始终指向 activeRegionId 对应的 run */
  run: RegionRunState | null;
  regionRuns: Partial<Record<RegionId, RegionRunState>>;
  activeRegionId: RegionId;
  unlockedRegions: RegionId[];
  regionClears: number;
  materials: number;
  tokens: number;
  bondPoints: number;
  quests: Record<string, { claimed: boolean; progress: number }>;
  stats: {
    battles: number;
    wins: number;
    captures: number;
    evolutions: number;
    links: number;
    bosses: number;
    regionClears: number;
    questsClaimed: number;
    /** 每个节点的重复战斗次数，用于经验递减 */
    nodeXpCounts: Record<string, number>;
  };
  settings: { aiMode: 'auto' | 'demo'; reducedMotion: boolean };
  migration: { fromVersion: 1 | 0; migratedAt: number; sourceKey: string | null };
};

export type QuestDef = {
  id: string;
  title: string;
  desc: string;
  kind: 'story' | 'growth' | 'collection' | 'challenge';
  target: number;
  progress: (save: SaveV2) => number;
  reward: { materials?: number; tokens?: number; xp?: number };
  prereq?: string[];
};

export type EvolutionBranch = {
  id: string;
  groupId: string;
  name: string;
  desc: string;
  path: BuildPath;
  statBonus: { hp: number; atk: number; def: number; spd: number };
  moduleId: string;
  palette: [string, string, string];
  visualLayers: string[];
};

export type EvolutionGroup = {
  id: string;
  name: string;
  /** 用来源物品或主标签匹配；都不匹配时作为通用组 */
  sampleIds: string[];
  tag?: Tag;
  branches: EvolutionBranch[];
};

/* ------------------------------ AI 合约 --------------------------------- */

export type AnalyzeObjectIntent = {
  observed: FeatureEvidence[];
  inferred: FeatureEvidence[];
  categorySuggestion: CategoryTag;
  roleHint: BuildPath;
  name: string;
  flavor: string;
  confidence: 'high' | 'medium' | 'low';
};

export type BattleDirectorPlan = {
  actionId: EnemyActionId;
  reason: string;
  taunt: string;
};

export type QuestDirectorPlan = {
  questId: string;
  reason: string;
  hint: string;
};

export type EvolutionGuidePlan = {
  branchId: string;
  reason: string;
  warning: string;
};

export type CreatureBuildInput = {
  vision: VisionSummary;
  evidence: FeatureEvidence[];
  buildPath: BuildPath;
  element?: Element;
  name?: string;
  flavor?: string;
  source: 'sample' | 'upload' | 'legacy';
  variant: number;
  createdAt?: number;
  /** Batch 2：成长数据可选，默认 1 级 0 XP */
  level?: number;
  xp?: number;
  evolutionId?: string;
};

export type VisionLite = Pick<VisionSummary, 'primaryObject' | 'category' | 'colors' | 'features' | 'confidence'>;

export type RecipeParts = {
  shape: ShapeKind;
  crest: CrestKind;
  accessory: AccessoryKind;
  palette: [string, string, string];
  element: Element;
};

export type CategoryLike = Category;

export type VisionSummaryLike = VisionSummary;
