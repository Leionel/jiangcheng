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

export type StatusId = 'wet' | 'vulnerable' | 'shield' | 'charge' | 'guard' | 'mark' | 'bind';
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
export type EnemyDef = {
  id: string;
  name: string;
  element: Element;
  maxHp: number;
  atk: number;
  def: number;
  kind: EnemyKind;
  taunt: string;
};

export type EnemyActionId = 'strike' | 'guard' | 'gather' | 'storm' | 'deluge';

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
  rewards: { materials: number; tokens: number };
  fingerprint: string;
};

export type BattleRewards = { materials: number; tokens: number };

/* -------------------------------- 区域 --------------------------------- */

export type RegionId = 'river';
export type RegionNodeType = 'event' | 'battle' | 'elite' | 'boss';

export type EventChoice = {
  id: string;
  label: string;
  desc: string;
  effect:
    | { kind: 'runResonance'; amount: number }
    | { kind: 'materials'; amount: number }
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
};

export type RegionRunState = {
  regionId: RegionId;
  seed: string;
  nodeIndex: number;
  materials: number;
  tokens: number;
  completed: boolean;
  startResonance: number;
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
};

export type SaveV2 = {
  schemaVersion: 2;
  createdAt: number;
  updatedAt: number;
  collection: V2Creature[];
  lockedIds: string[];
  legacyCards: LegacyCard[];
  party: { ids: string[]; activeIndex: number };
  run: RegionRunState | null;
  regionClears: number;
  materials: number;
  tokens: number;
  settings: { aiMode: 'auto' | 'demo'; reducedMotion: boolean };
  migration: { fromVersion: 1 | 0; migratedAt: number; sourceKey: string | null };
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
