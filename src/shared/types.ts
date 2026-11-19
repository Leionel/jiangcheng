/**
 * 全局数据协议：与规格书 §7.3 保持一致。
 * 原则：AI 只提出候选（草稿），所有战斗数值由本文件的规则函数计算。
 */

export type ExecutionMode = 'live_ai' | 'demo' | 'fallback';

/** 精灵战斗属性（固定 5 种） */
export type Element = 'food' | 'water' | 'structure' | 'nature' | 'tool';

/** 图片可见物体的粗分类（AI 或本地像素分析输出） */
export type Category = 'food' | 'water' | 'building' | 'nature' | 'everyday';

export type Confidence = 'high' | 'medium' | 'low';

export type SkillId = 'STRIKE' | 'GUARD' | 'BURST' | 'RECOVER' | 'QUICK' | 'FEINT';

/** 赛前一次性战术（P1）。整场生效，选择后不可更换。 */
export type TacticId = 'desperado' | 'steady' | 'swift';

export type TacticDef = {
  id: TacticId;
  name: string;
  short: string;
  desc: string;
  detail: string;
};

export type ShapeKind = 'blob' | 'round' | 'spike' | 'tall' | 'wing' | 'shard';

export type CrestKind = 'sesame' | 'wave' | 'petal' | 'gear' | 'frame' | 'none';

export type AccessoryKind = 'bowl' | 'umbrella' | 'cup' | 'wing' | 'none';

/** 视觉配方：只影响绘制，不影响战斗数值 */
export type VisualRecipe = {
  shape: ShapeKind;
  crest: CrestKind;
  accessory: AccessoryKind;
  palette: [string, string, string];
};

export type MonsterStats = {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
};

/** AI/像素分析产出的“可见特征”摘要 */
export type VisionSummary = {
  primaryObject: string;
  category: Category;
  colors: string[];
  features: string[];
  confidence: Confidence;
  culturalHint?: string;
};

/** AI 可自由发挥的部分（有边界） */
export type MonsterDraft = {
  name: string;
  theme: string;
  element: Element;
  preferredSkillIds: SkillId[];
  visualRecipe: VisualRecipe;
};

/** 精灵战绩：P1 起持久化，给重复游玩一个可累积的目标 */
export type MonsterRecord = {
  wins: number;
  losses: number;
  draws: number;
  battles: number;
  /** 当前连胜（负/平清零） */
  streak: number;
  bestStreak: number;
  lastOutcome?: BattleOutcome;
};

export type Monster = {
  id: string;
  name: string;
  theme: string;
  element: Element;
  source: 'demo' | 'upload';
  stats: MonsterStats;
  skills: [SkillId, SkillId];
  visualRecipe: VisualRecipe;
  evidenceTags: string[];
  confidence: Confidence;
  generationMode: ExecutionMode;
  /** 实际产出这张卡的模型名（仅 live_ai 时有值） */
  model?: string;
  /** 战绩（旧版本 localStorage 中没有该字段，读取时按 0 处理） */
  record?: MonsterRecord;
  createdAt: number;
};

export type WeatherId = 'sun' | 'fog' | 'smoke' | 'wind' | 'night';

export type Weather = {
  id: WeatherId;
  name: string;
  boostElement: Element | null;
  desc: string;
};

export type Enemy = {
  id: string;
  name: string;
  element: Element;
  stats: MonsterStats;
  skills: SkillId[];
  visualRecipe: VisualRecipe;
  taunt: string;
  weakness: SkillId;
};

/** 战术加成：只由规则引擎读取，AI 与 UI 都不能在战斗中改写 */
export type BattleBoons = {
  /** 造成伤害倍率 */
  damageMult: number;
  /** 受到伤害倍率 */
  damageTakenMult: number;
  /** 首回合先手（优先于速度） */
  firstStrike: boolean;
  /** 属性被克时把克制系数抬到该值（null = 不启用） */
  comebackMult: number | null;
};

/** 单场战斗中的一方 */
export type BattleSide = {
  name: string;
  element: Element;
  stats: MonsterStats;
  skills: SkillId[];
  visualRecipe: VisualRecipe;
  hp: number;
  guard: boolean;
  recoverUsed: boolean;
  recoverBlocked?: boolean;
  /** 佯攻为下一次攻击提供的额外威力 */
  feintBonus: number;
  boons: BattleBoons;
};

export type BattleEventKind =
  | 'round-start'
  | 'tactic'
  | 'skill'
  | 'damage'
  | 'guard'
  | 'recover'
  | 'feint'
  | 'faint'
  | 'end';

export type BattleEvent = {
  kind: BattleEventKind;
  round: number;
  actor?: 'player' | 'enemy';
  skill?: SkillId;
  text: string;
  damage?: number;
  hpAfter?: number;
  note?: string;
};

export type BattleOutcome = 'win' | 'lose' | 'draw';

/** 敌方本回合的计划记录：证明哪一回合由 AI 决策、哪一回合回落到规则 */
export type BattlePlanRecord = {
  round: number;
  source: 'ai' | 'rule';
  skill: SkillId;
  reason: string;
  /** AI 战况播报（仅 live_ai 时） */
  taunt?: string;
  model?: string;
  latencyMs?: number;
  /** 降级原因（超时 / schema 不过 / 未配置等） */
  fallbackNote?: string;
};

export type BattleState = {
  seed: string;
  tactic: TacticId | null;
  weather: Weather;
  round: number;
  maxRounds: number;
  player: BattleSide;
  enemy: BattleSide;
  log: BattleEvent[];
  outcome: BattleOutcome | null;
  /** 敌方当前意图（用于对战前提示，规则可预测） */
  intent: EnemyIntent | null;
  /** 每回合敌方决策来源，结算页用于展示 AI 参与度 */
  planLog: BattlePlanRecord[];
};

export type EnemyIntent = {
  skill: SkillId;
  estimatedDamage: number;
  priority: boolean;
  reason: string;
  /** 这一招是 AI 选的还是规则算的；UI 必须如实标注 */
  source: 'ai' | 'rule';
  /** AI 给出的战况播报（不影响数值） */
  taunt?: string;
};

/** 调用日志：证明 AI 是否真的被请求过（不含图片内容） */
export type CallLogEntry = {
  requestId: string;
  endpoint: string;
  mode: ExecutionMode;
  ok: boolean;
  latencyMs: number;
  note: string;
  at: number;
};
