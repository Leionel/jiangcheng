# 江城万物怪 2.0 · 技术架构与迁移方案

> 版本：V1.0（2026-11-19）｜依据：仓库实测（2026-11-19 18:40–18:50）+ `JIANGCHENG_2_GDD.md`
> 标记：**【已验证】**=本次实际运行/读代码；**【设计】**=本方案决定；**【风险】**=需监控。
> 原则：不为架构时髦重写；保留 P1 全部可玩资产；旧规则封存为 `quick_v1`，新玩法用 `expedition_v2` 独立演进。

---

## 0. 仓库复验结果（与 P1 交接记录对照）

**【已验证】** 实测命令与结果：

| 检查 | 命令 | 本次结果 | 与交接记录 |
|---|---|---|---|
| 类型检查 | `npm run typecheck` | 通过，无输出 | 一致 |
| 单测 | `npm test` | **4 文件 / 37 条全绿**（约 1.7s） | 一致（37 条） |
| 构建 | `npm run build` | `index-*.js` 275.39 kB（gzip 88.25）；`share-*.js` 4.57 kB（gzip 2.13）；CSS 36.37 kB | 一致 |
| E2E | `node scripts/e2e-shots.mjs` | 10 步通过（AI 意图来源 `ai`、战术、战绩、复现、上传真图、移动端无横向溢出） | 一致 |
| 真实 AI | `node scripts/ai-check.mjs` | analyze：live_ai 1309ms；battle-plan：live_ai 2206ms，skill ∈ 敌方白名单 | 一致 |
| 服务健康 | `GET /api/health` | `ai.available=true`、`deepseek-v4-flash`、`whu-maas` | 一致 |
| Git | `git status` / `git rev-parse` | **非 git 仓库** | 一致 |
| 密钥保护 | `.gitignore` / `.env` | `.env` 已忽略；只确认变量名（`AI_PROVIDER/AI_API_BASE_URL/AI_MODEL/AI_API_KEY/AI_JSON_MODE/DEMO_MODE_ENABLED/PORT`），未读取值 | 一致 |
| 运行端口 | `127.0.0.1:8787` | 本次可用；服务曾被后台回收一次，需按 HANDOFF §9 先探活再启动 | 补充 |

**与交接记录不一致/需更新之处**：
- 交接称“约 9.5k 行”；本次逐文件统计 ts/tsx/mjs/css 合计 **约 9.1k 行**（不含 node_modules/dist；其中 `game.css` 1753 行、`src` 约 8.0k、server 620、scripts 493），与交接基本一致。
- 交接称服务器 620 行；实际 `server/server.mjs` **620 行**，一致。
- 交接称“无 git”；一致，且 2.0 实施的**第一步应是建立本地 git 基线**（不推送远程，见 IMPLEMENTATION_PLAN B0）。

**关键符号位置（后续改造引用）**：

| 位置 | 事实 |
|---|---|
| `src/App.tsx:40` | `type Screen = 'capture'|'card'|'battle'|'result'|'gallery'`，单组件 430 行状态机 |
| `src/features/monsters/battle.ts:20` | `MAX_ROUNDS = 3`；`:26` `DAMAGE_SCALE = 0.78` |
| `battle.ts:119/189/239/279` | `chooseIntent` / `createBattle` / `applyEnemyPlan` / `takeTurn`（纯函数） |
| `src/features/monsters/plan.ts:77/150` | AI 决策快照 `buildBattlePlanPayload` / 输出校验 `sanitizePlan` |
| `src/features/monsters/analyze.ts:87/256` | 图片校验+像素统计 `inspectImageFile` / 本地降级草稿 `localAnalyzer` |
| `src/features/monsters/build.ts:57/181` | `allocateStats` / `buildMonster` |
| `src/features/monsters/skills.ts:20/99` | `SKILLS` 白名单 / `assignSkills` |
| `src/features/monsters/store.ts:4/20/102` | `GALLERY_LIMIT=24` / `loadGallery` / `recordBattle` |
| `src/features/monsters/MonsterSprite.tsx:226` | 程序化双色插画（6 体块 × 6 纹样 × 5 配件） |
| `src/shared/ai/client.ts` | `analyzeMonster` / `planEnemyAction` 两个适配器，统一超时/降级/调用日志 |
| `server/server.mjs:265/425/535` | `callJsonModel` / `/api/monsters/analyze` / `/api/battle/plan` |
| `src/shared/types.ts` | `Monster / BattleState / TacticId / MonsterRecord / CallLogEntry` |
| `docs/shots/01–10` | 当前视觉基线（10 张） |

---

## 1. 架构决策（ADR，先定结论）

### ADR-1：不重写应用，增量引入领域层

**决定**：保留 React/Vite/TS/零依赖 Node；新增 `src/domain/*`（纯规则）与 `src/app/*`（状态编排），把新玩法写成独立模块，`App.tsx` 只负责路由与装配。
**理由**：P1 的捕获、视觉、战斗、AI 适配、测试全部可复用；重写会丢掉已验证的 AI 链路与 37 条测试。
**代价**：短期内 v1/v2 两套战斗代码并存，需要明确边界。

### ADR-2：规则版本隔离，v1 冻结

**决定**：`battle.ts` / `plan.ts` / `tactics.ts` / `BattleView.tsx` **冻结**（只允许修 Bug 不改规则）；新增 `src/domain/battle2/*` 负责 `expedition_v2`。共享的只有“合法性校验 / RNG / 元素克制 / 事件日志格式”等无副作用工具。
**理由**：任务书要求旧回放与旧数值假设不能失效；`MAX_ROUNDS` 是 v1 契约，不能全局改。
**实现**：`BattleRuleset` 显式版本；旧回放只跑 v1 结算器；新战斗只跑 v2 结算器。v2 可以复用 v1 的 `typeMultiplier`（`elements.ts:61`）但**不 import v1 的 `takeTurn`**。

### ADR-3：AI 网关化，组件禁止直接 fetch

**决定**：所有模型调用收口到 `src/ai/gateway.ts`（浏览器）与服务端 `server/routes/*`；四类任务各有一份 zod 契约与白名单；组件只拿“已校验的意图/计划/推荐”。
**理由**：P1 已证明“统一适配器 + schema + 降级 + 调用日志”是可靠模式（`shared/ai/client.ts`）；2.0 任务变多后必须避免散落。
**约束**：模型输出不能直接落到游戏状态；必须经过 `sanitize*` + 合法动作列表校验。

### ADR-4：存档 v2 独立键 + 无损迁移 + 永不静默删除

**决定**：新键 `jcm.save.v2`；旧键 `jcm.gallery.v1` **只读保留**；首次启动迁移并备份到 `jcm.backup.v1`；容量 120 且“锁定卡永不淘汰”；提供导出/导入 JSON；写失败回退并提示。
**理由**：任务书 §15.2 与 P1 已知问题都要求旧卡不丢；localStorage 失败必须可恢复。

### ADR-5：状态机从单组件拆出，但不引入 react-router

**决定**：`src/app/` 用 `Screen` 联合类型 + `gameReducer` 管持久状态，`sessionReducer` 管当前探索/战斗；屏幕懒加载。不引入路由库（单机单页，URL 路由收益低）。
**理由**：避免 `App.tsx` 变成 1500 行；同时不增加依赖与包体。

### ADR-6：内容数据表即代码

**决定**：区域、节点、事件、任务、模块、Boss 阶段全部写成 `src/content/*.ts` 的类型化常量 + 启动时 `validateContent()` 自检（ID 唯一、引用存在、数值在范围内）。
**理由**：可测试、可 diff、无 CMS 成本；内容规模在 5 区/25 任务级别完全可控。

### ADR-7：视觉先扩展现有 SVG 体系，不引入重型渲染库

**决定**：`MonsterSprite` 升级为“层叠组合”（体块 + 纹样 + 配件 + 进化附加层 + 状态层），用 SVG + CSS 动画；暂不引入 PixiJS/Canvas 引擎。
**理由**：现有视觉资产与分享导出都依赖 SVG（`share.ts` 序列化 `#sprite-<id>`）；引入引擎会同时影响分享与首屏体积。

---

## 2. 目标目录结构（新增/迁移/保留）

```
src/
  app/
    GameRoot.tsx             # 装配：持久状态 + 当前屏幕 + 全局 Toast/ErrorBoundary
    screens.ts               # Screen 联合类型与导航
    gameReducer.ts           # 存档/世界进度/收藏的 reducer（纯函数）
    sessionReducer.ts        # 当前区域 run / 当前战斗 session
  domain/
    shared/                  # 与规则版本无关的纯工具
      ids.ts                 # 稳定 id / hash（复用 rng.ts）
      content.ts             # Content Registry 与校验
      events.ts              # 统一事件日志类型（v1/v2 可各自映射）
    capture/
      tags.ts                # 五维标签枚举、中文名、权重
      evidence.ts            # 三源证据合并/冲突
      compile.ts             # compileCreature：标签→模块/被动/预算（纯函数）
      appearance.ts          # 外观层配方（体块/纹样/配件/进化层）
    battle2/
      ruleset.ts             # ExpeditionRules 常量（rounds、共鸣、伤害系数）
      state.ts               # createExpedition / 队伍快照 / 状态
      actions.ts             # 合法动作枚举与校验
      reducer.ts             # resolveRound 纯函数
      damage.ts              # v2 伤害/护盾/反伤管线
      status.ts              # 状态施加/衰减/驱散
      links.ts               # 连携定义与条件
      bosses/                # 5 个 Boss 的规则脚本（数据 + 纯函数）
      aiRule.ts              # 规则兜底 AI（按 personality）
      replay.ts              # BattleReplayV2 序列化/重放
    world/
      regions.ts             # 5 区域定义
      nodes.ts               # 节点生成（seed 驱动）
      events.ts              # 20 事件数据 + 结算纯函数
      quests.ts              # 25 任务定义 + 进度判定
      progress.ts            # WorldProgress 状态转移
      economy.ts             # 3 资源收支
    growth/
      leveling.ts            # 等级/熟练度
      evolution.ts           # 分支定义/预览/应用/回退
      bonds.ts               # 羁绊与连携解锁
    save/
      schema.ts              # SaveV2 zod + 类型
      migrate.ts             # v1→v2 迁移（纯函数 + 备份策略）
      storage.ts             # localStorage 原子写/导出/导入/容量
  ai/
    contracts/               # 4 类任务请求/响应 zod schema
    gateway.ts               # fetch 适配/超时/降级/缓存/调用日志
    prefetch.ts              # 战斗决策预取队列与去重
  content/
    modules.ts               # 24 能力模块 + 10 被动（数据）
    bosses.ts                # Boss 数值/阶段/掉落
    regions.ts               # 区域/节点/事件/任务内容（或分散到 world/*.data.ts）
    samples.ts               # 8 个固定样本（含 v1 五个）
  features/
    capture2/                # CaptureStation + EvidenceConfirm + SummonStage
    map/                     # JiangchengMapView
    party/                   # PartyWorkshopView
    battle2/                 # ExpeditionBattleView（表现层，不含规则）
    evolution/               # EvolutionPreviewView
    codex/                   # CodexView + HandbookView
    legacy/                  # v1 入口包装（CardView/QuickDuel 按钮）
  styles/
    base.css                 # 保留设计令牌与通用组件
    world.css / battle2.css / codex.css / summon.css
server/
  server.mjs                 # 启动 + 路由注册（保持零依赖）
  lib/http.mjs               # 读体/发送/静态文件/错误兜底
  lib/model.mjs              # callJsonModel / extractJson / cleanModelText
  schemas.mjs                # 服务端 zod（四任务请求/输出）
  routes/health.mjs
  routes/analyze.mjs
  routes/battle-director.mjs
  routes/quest-director.mjs
  routes/evolution-guide.mjs
scripts/
  e2e-shots.mjs              # 保留：v1 回归截图
  e2e-2.mjs                  # 新增：捕获→召唤→地图→队伍→Boss→进化→图鉴
  balance-2.mjs              # 新增：1000 局模拟报告（可 vitest 内运行）
  migrate-fixtures/          # 存档迁移夹具
```

**保留不动**：`src/features/monsters/battle.ts`、`plan.ts`、`tactics.ts`、`BattleView.tsx`、`CardView.tsx`、`ResultView.tsx`、`GalleryView.tsx`（可加只读入口）、`share.ts`、`MonsterSprite.tsx`（扩展不破坏既有 props）、`base.css/game.css`（新增 `world.css` 等，不改旧规则）。
**适配复用**：`analyze.ts`（图片校验/像素统计/压缩）、`build.ts`（统计预算基础，v2 另写 compiler，不复用 `buildMonster` 的 AI 草稿逻辑）、`elements.ts`（克制表）、`rng.ts`、`shared/ai/client.ts`（保留 v1 两方法，新增 gateway 调用）。

---

## 3. 数据契约（TypeScript 草案，实施时以此为准）

### 3.1 标签与证据

```ts
export const CATEGORIES = ['food','tool','nature','vehicle','building','stationery','textile','toy','other'] as const;
export const SHAPES = ['round','long','flat','foldable','layered','branched','hollow'] as const;
export const TEXTURES = ['smooth','rough','woven','soft','rigid','liquid_like'] as const;
export const FUNCTIONS = ['protect','carry','connect','bind','illuminate','nourish','propel','decorate'] as const;
export const THEMES = ['river','rain','flower','street_food','bridge','campus','invention','generic'] as const;

export type EvidenceSource = 'vision_observed' | 'model_inferred' | 'user_confirmed';
export type FeatureEvidence = {
  tag: string;                 // 必须在白名单
  source: EvidenceSource;
  confidence?: number;         // 0..1，仅展示/排序用，不直接改战力
  evidenceText?: string;       // 可见特征短句（<=16 字）
};
export type UserCorrection = { tag: string; action: 'confirm' | 'add' | 'remove'; at: number };
```

### 3.2 角色（MonsterV2）与编译结果

```ts
export type BuildPath = 'guardian' | 'striker' | 'trickster' | 'support' | 'linker';
export type AbilityRef = { id: string; kind: 'active' | 'passive' };

export interface CompiledCreature {
  schemaVersion: 2;
  id: string;                        // 稳定 id：hash(输入) 派生，沿用 sprites 的 id 规则
  originalMonsterId?: string;        // 若由 v1 卡觉醒而来
  name: string;
  flavor: string;
  sourceCategory: string;            // v1 的 category 兼容字段
  element: 'food'|'water'|'structure'|'nature'|'tool';  // 复用 v1 五属性以兼容克制
  featureEvidence: FeatureEvidence[];
  corrections: UserCorrection[];
  buildPath: BuildPath;
  knownActives: string[];            // 3 个模块 id（A01…）
  equippedActives: string[];         // 2 个
  passiveId: string;                 // P01…
  stats: { hp: number; atk: number; def: number; spd: number }; // 复用 v1 区间
  visual: VisualRecipeV2;
  evolutionStage: 0 | 1;
  evolutionBranch?: 'a' | 'b';
  record: { wins: number; losses: number; draws: number; bestStreak: number };
  createdAt: number;
}

export type VisualRecipeV2 = {
  shape: ShapeKind;                  // 复用 v1 6 体块
  crest: CrestKind;                  // 复用 v1 6 纹样
  accessory: AccessoryKind;          // 复用 v1 5 配件
  palette: [string, string, string];
  evolutionLayers: Array<'guard_plate'|'wing_kit'|'wave_ring'|'paper_fan'|'flower_veil'|'circuit'>;
  regionAccent?: 'marker'|'river'|'iron'|'blossom'|'teal';
};
```

### 3.3 队伍与战斗（expedition_v2）

```ts
export type RulesetVersion = 'quick_v1' | 'expedition_v2' | 'boss_v2';
export type StatusId = 'wet'|'bind'|'vulnerable'|'shield'|'charge'|'reflect'|'overheat'|'mark'|'fatigue';

export type StatusStack = { id: StatusId; stacks: number; turns: number; source: 'player'|'enemy'|'weather' };

export interface PartyMemberState {
  monsterId: string;
  role: 'active' | 'reserve';
  hp: number;                        // 0..stats.hp
  statuses: StatusStack[];
  cooldowns: Record<string, number>; // moduleId -> 剩余回合
  supportCommandId: string;          // 支援指令 id（编译时确定）
}

export interface ExpeditionState {
  schemaVersion: 2;
  rulesetVersion: 'expedition_v2';
  battleId: string;
  seed: string;
  round: number;                     // 1..7/8
  maxRounds: number;
  resonance: number;                 // 0..6
  party: PartyMemberState[];         // 3
  activeIndex: number;
  enemy: EnemyState;                 // Boss/普通敌人快照
  bossPhase: number;                 // 1..3
  weather: { id: string; name: string; boostElement?: string };
  log: BattleEventV2[];
  intent: EnemyIntentV2 | null;      // 本回合预告（可读）
  linkUsed: boolean;
  outcome: 'win'|'lose'|'draw'|null;
  planLog: PlanRecordV2[];           // 每回合 AI 计划来源/耗时/模型
  stateHash: string;                 // 用于 AI 缓存/回放校验
}

export type PlayerRoundInput = {
  main: { kind:'skill'; skillId:string } | { kind:'swap'; toIndex:0|1|2 } | { kind:'guard' };
  support?: { kind:'support'; commandId:string } | { kind:'link'; linkId:string };
};
export type EnemyIntentV2 = {
  actionId: string;
  damageEstimate: number;
  telegraph: string;                 // 可读预告
  source: 'ai' | 'rule' | 'script';  // Boss 脚本
};
```

**关键约束**：`resolveRound(state, input, enemyPlan)` 是纯函数；`enemyPlan` 仅来自 `legalEnemyActions(state)`（白名单），`Boss 阶段/预告/伤害` 来自 `bosses/*.ts` 的纯函数；所有随机数由 `createRng(seed|'v2'|round|stream)` 派生。

### 3.4 世界、任务、成长、存档

```ts
export type RegionId = 'zao'|'river'|'bridge'|'sakura'|'thunder';
export interface RegionState {
  unlocked: boolean;
  clears: number;
  heat?: number; tide?: 'high'|'mid'|'low';
  nodes: NodeState[];                 // 当前 run 的节点状态
  eventFlags: Record<string, boolean>;
  npcTrust: Record<string, number>;
  discovered: string[];               // 图鉴条目
}
export interface WorldProgress {
  schemaVersion: 2;
  act: 1|2|3;
  regions: Record<RegionId, RegionState>;
  activeRegion: RegionId | null;
  choiceFlags: Record<string, string>; // 分支选择
  storyReportSeed: string;
}
export interface QuestProgress {
  id: string; state: 'locked'|'active'|'done';
  progress: Record<string, number>;
  claimed: boolean;
}
export interface EvolutionRecord {
  monsterId: string;
  fromStage: number; toStage: number;
  branch: 'a'|'b'; condition: string;
  at: number;
  fromAbilities: string[]; toAbilities: string[];
  reverted?: boolean;
}
export interface SaveV2 {
  schemaVersion: 2;
  createdAt: number; updatedAt: number;
  collection: CompiledCreature[];
  lockedMonsterIds: string[];
  legacyMonsterIds: string[];         // v1 卡（未觉醒），仍可 Quick Duel
  party: { memberIds: string[]; equipped: Record<string, string[]> };
  world: WorldProgress;
  quests: Record<string, QuestProgress>;
  evolutionLog: EvolutionRecord[];
  economy: { supply: number; materials: number; tokens: Record<RegionId,number> };
  settings: { reducedMotion: boolean; aiMode: 'auto'|'live'|'demo' };
  migration: { fromVersion: 1; migratedAt: number; sourceKey: string };
}
```

### 3.5 AI 契约（四类）

```ts
// 统一信封：客户端只接受这个形状
export type AiEnvelope<T> = {
  mode: 'live_ai' | 'fallback' | 'demo';
  plan: T | null;
  meta: { model: string; latencyMs: number; requestId: string; note: string };
};

export interface AnalyzeObjectIntent {
  observed: FeatureEvidence[];
  inferred: FeatureEvidence[];
  categorySuggestion: string;        // 白名单
  roleHint: 'guardian'|'striker'|'trickster'|'support'|'linker';
  passiveHint?: string;              // 白名单
  name: string;                      // <=8 字
  flavor: string;                    // <=60 字
  confidence: 'high'|'medium'|'low';
}

export interface BattleDirectorPlan {
  actionId: string;                  // 必须在 legalEnemyActions(state) 中
  intentText: string;                // <=24 字，用于预告条
  taunt: string;                     // <=40 字
  confidence: number;                // 0..1，仅展示
}

export interface QuestDirectorChoice {
  eventId: string;                   // 必须在当前合法事件池
  variant: string;                   // 白名单
  line: string;                      // <=40 字
}

export interface EvolutionGuideAdvice {
  branch: 'a'|'b';                   // 只能从已满足条件的合法分支里选
  reason: string;                    // <=40 字
  appearanceNote: string;            // <=30 字
}
```

> 所有 schema 在 `src/ai/contracts/*.ts` 定义 zod，服务端 `server/schemas.mjs` 有等价 JS schema；模型输出先过服务端再客户端**两次**校验；非法即 fallback。

---

## 4. 战斗 v2 引擎（纯函数，可重放）

### 4.1 回合管线

```
resolveRound(state, input, enemyPlan):
  1. assertLegal(state, input, enemyPlan)        // 非法输入直接抛开发期错误；生产走规则兜底
  2. startRound(state)                           // 状态衰减/冷却、Boss 阶段检查、天气生效
  3. playerMain = applyMain(state, input.main)   // 技能/换位/防御
  4. support = applySupport(...)                 // 支援指令/连携
  5. enemy = applyEnemy(enemyPlan, ...)          // 预告的敌方行动（可能是脚本，不是模型）
  6. endRound = tickStatuses(...)                // 潮湿/缠绕/过热/护盾到期
  7. outcome = checkOutcome(...)                 // 胜/负/超时 HP% 判定
  8. return { ...nextState, round+1, intent: null, stateHash: hashState(next) }
```

### 4.2 确定性保证

- 禁止 `Math.random()` / `Date.now()` / `crypto.randomUUID()` 出现在 `domain/battle2`；所有随机来自 `createRng(`${seed}|v2|${round}|${stream}`)`（已有 `src/shared/rng.ts`）。
- `stateHash` = 对“影响规则的可序列化字段”做稳定 hash（复用 `hashString`），用于 AI 缓存键与回放断言。
- **重放格式**：

```ts
interface BattleReplayV2 {
  replayVersion: 2;
  rulesetVersion: 'expedition_v2';
  seed: string;
  partySnapshot: CompiledCreature[];      // 只含公开数据，不含照片
  enemySnapshot: EnemyState;
  skillDefsVersion: string;               // 模块表版本号，如 'modules@1'
  playerInputs: PlayerRoundInput[];
  enemyPlans: Array<{ round: number; source: 'ai'|'rule'|'script'; actionId: string; model?: string }>;
  result: 'win'|'lose'|'draw';
  finalHp: Record<string, number>;
  hash: string;
}
```

- 测试：同一 replay 重放 100% 一致（`expect(replayState).toEqual(originalState)`）。

### 4.3 合法性校验（AI 与 UI 共用）

```ts
export function getLegalPlayerActions(state: ExpeditionState): LegalAction[];
export function getLegalEnemyActions(state: ExpeditionState): LegalAction[];
export function isLegalEnemyPlan(state, plan): boolean;
```
- UI 只渲染 `getLegalPlayerActions`；AI 请求只发送 `getLegalEnemyActions` 的精简快照；收到计划后用 `isLegalEnemyPlan` 二次校验；失败 → `ruleEnemyPlan(state)`。

### 4.4 Boss 脚本与 AI 的分工

- `bosses/fengyu.ts` 等：纯函数 `nextIntent(bossState, round)` 给出脚本行动与预告；阶段切换在 HP 阈值触发。
- AI 可在“脚本允许的候选动作”中选（例如暴雨回合是护盾/追击/换位三选一），但**不能跳过预告、不能改伤害**。
- 记录 `source: 'script'|'ai'`；界面与回放都显示来源，避免“AI 假装写了 Boss 规则”。

---

## 5. AI 网关（浏览器侧 + 服务端）

### 5.1 任务与接口

| 任务 | 接口 | 调用时机 | 超时 | 缓存键 | 失败兜底 |
|---|---|---|---|---|---|
| analyze_object | `POST /api/ai/analyze-object`（复用并扩展现有 analyze 路由） | 捕获时 1 次 | 26s（服务端）/30s（客户端） | `hash(压缩图+vision摘要+标签版本)` | 本地 `localAnalyzer` + 规则编译 |
| battle_director | `POST /api/ai/battle-director` | 关键回合预取（R1、阶段切换、HP<30%、玩家连续 2 次同招） | 8s | `stateHash + ruleset + intentVersion` | `domain/battle2/aiRule.ts` |
| quest_director | `POST /api/ai/quest-director` | 进入节点时 1 次 | 8s | `region + nodeIndex + progressHash` | 事件池按 seed 规则选 |
| evolution_guide | `POST /api/ai/evolution-guide` | 打开进化预览时 1 次 | 8s | `monsterId + 条件hash` | 规则推荐（与两条分支评分） |

### 5.2 延迟策略（来自 P1 实测：出卡 1.3–9s、决策 1.6–11.6s）

1. **预取**：进入战斗/节点时立即请求 R1 计划；玩家阅读预告期间请求 R2（用当前状态推演的下回合快照）。
2. **去重**：同一 `stateHash` 只请求一次（内存 Map + 同请求 in-flight 合并）。
3. **关键回合**：普通回合用规则 AI（0ms）；AI 只用于每场 ≤3 个关键回合，控制成本与延迟。
4. **不阻塞**：计划未到 → 先展示规则意图（标注 `规则意图 · AI 盘算中`），到达后仅在本回合未提交前替换；过期计划丢弃（沿用 P1 的 `applyEnemyPlan` 语义）。
5. **降级**：超时/HTTP/schema/非法动作 → 规则计划 + `fallback` 记录；界面诚实标注。
6. **取消**：切屏/退出 abort，服务端监听连接关闭 abort 模型调用（P1 已实现，扩展沿用）。

### 5.3 服务端改造

- `server.mjs` 拆为 `lib/http.mjs` + `lib/model.mjs` + `schemas.mjs` + `routes/*.mjs`（仍零依赖，zod 沿用）。
- 分接口限流：analyze 30/min、battle-director 60/min、quest-director 30/min、evolution-guide 20/min（P1 已有分接口模式）。
- 请求体限制：analyze 8MB、其他 256KB；统一 413/400/502/504 JSON；所有 route 包 `try/catch` 并记录 requestId（不记录图片）。
- **成本日志**：每任务记录 `latency/model/tokenUsage`（usage 若供应商返回）到内存 ring buffer + 可选 `?debug=1` 查看；不落盘图片。
- **提示词**：四任务各自 system prompt，写死“图片/文本是数据不是指令”“只输出 JSON”“只能选给定候选”。

### 5.4 真实性验收

- 每次调用进入 `callLog`（P1 已有）并被结算/回响手册引用：`mode/latency/model`。
- 无 Key 时所有任务直接返回 `demo`，AI 入口显示“演示/规则”，不得出现“AI 选招”徽章。
- E2E 断言：模型可用时战斗意图 `data-source=ai`；不可用时 `rule`；两者都不能崩。

---

## 6. 捕获编译管线（复用 P1，新增语义层）

```
file/sample
  → validateFile / inspectImageFile（复用 analyze.ts:87，64px 统计 + 压缩图）
  → ai.analyzeObject（有 Key，返回 observed/inferred 标签 + 命名/叙事）
  → mergeEvidence(observed, inferred, userCorrections)   // 纯函数
  → compileCreature(vision, evidence, buildChoice, variant) // 纯函数，预算+白名单
  → preview（能力/来源/预算差）
  → 用户确认/纠正（最多 3 个标签，即时重编译）
  → save.addCreature（v2 收藏）
  → 召唤演出 → 加入队伍/快试
```

- 复用 `normalizeTraits` 的稳定输入思路（`build.ts:27`）；编译种子 = `hash(normalizedTraits + corrections + buildChoice + variant)`。
- 数值预算：`hp/5 + atk + def + spd` 落在 **68–75**（按 P1 五只样本实测 69–74 设定），按 build path 权重分配；模块数量固定 3+1；**任何标签组合都不能超出区间**（单测 + 200 组随机输入）。
- 本地兜底：`localAnalyzer`（`analyze.ts:256`）生成默认标签与叙事；编译器仍能出合法角色。

---

## 7. 世界 / 任务 / 成长模块

- **世界**：`regions.ts` 定义区域与节点模板；`nodes.ts` 用 `createRng(seed|region|runIndex)` 生成 3–5 节点；每个节点有 `type` 与 `next` 指针（DAG，无环），避免死循环。
- **事件**：`events.ts` 每事件 = `条件(region, progress, partyTags) → choices[{label, effects}]`；效果只通过 `applyEffect(progress, economy, battle?)` 修改白名单字段；不执行脚本。
- **任务**：`quests.ts` 定义 `check(progress, collection, party)` 纯函数；领奖幂等（`claimed` 标记）；解锁采用 `unlockRegion/unlockModule` 白名单。
- **成长**：`leveling.ts` 上限 5、经验递减；`evolution.ts` 只允许满足条件的 2 分支；`bonds.ts` 记录共同出战次数；回退消耗 1 信物。
- **软锁防护**：每个区域至少 1 条不需要特定标签的节点路径；Boss 前有休整节点；任务不阻塞唯一路线；所有解锁检查“当前是否可完成”。
- **测试**：区域图遍历 fuzz（每个节点可达、可返回、奖励不重复）；任务 check 单测；事件效果幂等。

---

## 8. 存档与迁移（重点）

### 8.1 键与流程

```
localStorage keys:
  jcm.gallery.v1   → P1 图鉴（只读保留，不修改）
  jcm.save.v2      → 2.0 主存档
  jcm.backup.v1    → 首次迁移时的 v1 快照（JSON 字符串，保留）
  jcm.save.tmp     → 原子写临时键
```

启动流程：

```
try load jcm.save.v2 → zod 校验 → 成功则使用
  ↓ 不存在/损坏
try load jcm.gallery.v1 → 逐条 isMonster 校验（复用 P1 逻辑）
  → 生成 legacyMonsterIds（原卡保留） + 可选“觉醒预览”
  → 构造 SaveV2（collection 先为空，legacy 全部列入）
  → 若 v1 有卡：备份到 jcm.backup.v1
  → 写入 jcm.save.v2（写后读回校验）
  ↓ 写失败
内存态继续 + 顶部警告“未保存，可导出 JSON”，不丢当前会话
```

### 8.2 v1 卡迁移规则

- **不自动消耗旧卡**：旧卡作为 `legacyMonsterIds` 保留，可继续 Quick Duel；玩家在「回响手册 → 旧卡觉醒」手动把一张旧卡转换为 `CompiledCreature`：
  - 复用 name/theme/element/stats/visualRecipe/evidenceTags；
  - `featureEvidence` 由 evidenceTags 映射（`source:'legacy_inferred'`），并提示“可花 1 次纠错完善”；
  - `buildPath` 由 element + v1 技能倾向推导；
  - `knownActives` 从 v1 技能映射到 v2 模块（映射表 `legacySkillMap`，例如 BURST→雷光引线/元素爆发变体、GUARD→开伞屏障、RECOVER→早味补给、QUICK→余温冲刺、FEINT→落樱标记变体、STRIKE→基础打击）。
  - 原卡不删除；觉醒后旧卡标记 `awakened`（只读展示）。
- **容量**：v2 收藏 120；`lockedMonsterIds` 永不淘汰；超限时提示“导出/归档”，不静默删除。
- **写失败**：写临时键 → 读回校验 → 写主键 → 删除临时键；任一步失败保留旧主键并提示。
- **导出/导入**：JSON 文件含 `schemaVersion` 与校验和；导入前预览数量/版本，合并策略“按 id 去重保留较新 updatedAt”。

### 8.3 迁移测试（必须）

- fixtures：24 张正常 v1 卡 / 损坏 JSON / 缺字段卡 / 超容量 / localStorage 抛异常 / 第二次启动不重复迁移。
- 断言：**卡数不减少**；旧卡可 Quick Duel；v2 损坏可回退；迁移幂等；导出→导入 roundtrip 一致。

---

## 9. 前端状态与 UI 架构

- `GameRoot` 装配：`SaveProvider`（持久）→ `SessionProvider`（当前 run/battle）→ `ErrorBoundary` → `ScreenRouter`。
- `Screen`：`capture | summon | map | party | battle2 | result2 | evolution | codex | handbook | legacyCard | quickDuel`。
- `gameReducer` 处理世界/收藏/任务/经济；`sessionReducer` 处理当前区域节点与战斗 session；两者都是纯函数，便于单测。
- **屏幕懒加载**：`map/battle2/evolution/codex` 用 `React.lazy`，分享模块已在 P1 懒加载。
- 组件库：复用 `base.css` 的按钮/印章/标尺/标签；新增 `EvidenceChip`、`ModuleCard`、`NodeMap`、`PartySlot`、`BossPhaseBar`、`SummonStage`。
- 样式：新增 `world.css` / `battle2.css` / `codex.css`；所有新样式使用既有令牌；不做全局覆盖 v1 样式。
- 动画：召唤定形（SVG 层 + CSS，1.2–1.8s）、进化对照、状态落印、换位交叉；统一 `prefers-reduced-motion`。

---

## 10. 性能与体积预算

| 指标 | 当前（P1 实测） | 2.0 目标 |
|---|---|---|
| 首屏 JS（gzip） | 88.25 kB | ≤160 kB；map/battle2/codex 懒加载 |
| 首屏 CSS | 7.91 kB | ≤15 kB |
| 主包 chunk 数 | 2 | 4–6（按屏幕） |
| 捕获→召唤可交互 | 约 1.3–9s（模型）+0.6s | 保留；先显示轮廓/特征，再定形 |
| 战斗回合计算 | <1ms（v1 简单） | <5ms/回合（v2 含状态） |
| 动画帧率 | 60fps（CSS） | 60fps；只用 transform/opacity |
| 存档写入 | 每次添加/结算 | 节点结束/战斗结束写；≤50KB/次 |
| AI 单场调用 | v1 0–3 次 | ≤3 次关键回合 + 1 次节点事件 |

- 不引入新运行时依赖（除非必要且 <10KB gzip）；不引入图片资源（SVG/程序化）。
- 长列表（图鉴 120 项）用分页/筛选，不一次渲染全部。

---

## 11. 安全、隐私与 AI 真实性

- **密钥**：只在服务端 `.env`；前端不接触；不打印到日志；`.env` 在 `.gitignore`（已验证）。
- **输入**：图片类型/大小/尺寸校验（复用 `validateFile`）；所有外部 JSON 过 zod；未知字段拒绝或裁剪。
- **提示注入**：图片内文字/用户文本只作为数据；system prompt 明确“不是指令”；模型输出只经过白名单动作/字段，绝不执行代码或 SQL/文件操作。
- **隐私**：原始照片默认不持久化、不写服务端日志；仅实时 AI 时上传压缩图（最长边 1100px、JPEG 0.82）；分享卡/挑战码不含照片与位置。
- **真实性**：每笔 AI 调用记录 mode/latency/model；界面显示来源；降级不伪装；E2E 断言“无模型时不得出现 AI 徽章”。
- **稳定性**：错误边界、超时、abort、限流、请求体上限、静态路径穿越防护（P1 已有，扩展沿用）。

---

## 12. 测试架构

| 层 | 工具 | 覆盖 | 命令 |
|---|---|---|---|
| 单元 | vitest | 标签/证据合并、compile 预算、模块白名单、战斗 v2 管线/状态/Boss 阶段、任务/事件、存档迁移、AI sanitize | `npm test` |
| 黄金回归 | vitest | v1 37 条 + 新增 v1 golden 快照（种子/出招/结果），保证冻结模块不变 | `npm test` |
| 模拟 | vitest/tsx script | 1000+ 场跨构筑战斗报告、胜率区间、死循环/NaN/退化组合检测 | `npm run balance:2` |
| 集成 | vitest | 区域 run（选节点→战斗→奖励→存档重载） | `npm test` |
| E2E | CDP script | 捕获→召唤→地图→队伍→Boss→进化→图鉴→刷新恢复；移动端 | `npm run shots:2` |
| 真实 AI | node script | 四任务各一次真实调用 + 非法输出拒绝 + 降级 | `npm run check:ai` |
| 视觉 | 截图 | 6 屏 + 移动端 375；暖/冷区域各一张 | `npm run shots:2` |

**确定性**：所有规则测试使用固定 seed；禁止对“模型返回的文本内容”做精确断言，只断言 schema/白名单/降级路径。

---

## 13. 风险登记册与应对

| ID | 风险 | 影响 | 概率 | 应对 |
|---|---|---|---|---|
| R1 | 模型延迟长尾（1.3–11.6s）拖慢战斗/试玩 | 高 | 中 | 预取 + 去重 + 关键回合才用 AI + 8s 超时 + 规则兜底 |
| R2 | 玩法范围过大导致比赛版做不完 | 高 | 高 | 只做 2 区域；完整目标保留；B3+ 按时间裁 |
| R3 | 存档迁移丢卡 | 高 | 低 | 备份键 + 不删旧卡 + 迁移测试 + 导出 |
| R4 | v2 改动破坏 v1 | 中 | 中 | 冻结 v1 模块 + golden 测试 + 目录隔离 |
| R5 | 战斗 v2 状态复杂导致 NaN/死锁 | 高 | 中 | 纯函数 + 属性测试 + 回合上限 + 随机模拟 |
| R6 | SVG 动画/演出成本超预算 | 中 | 中 | 先做 2 个核心演出（召唤/进化），其余 CSS 轻量 |
| R7 | `App.tsx` 状态膨胀 | 中 | 中 | reducer + 屏幕懒加载 + 每批 review 行数 |
| R8 | localStorage 容量/损坏 | 中 | 低 | 120 上限 + 锁定 + 导出 + 原子写 |
| R9 | 真机相机/iOS 解码差异 | 中 | 中 | 比赛演示用桌面+样本；真机验证放 Batch 4 |
| R10 | 内容/命名侵权或事实错误 | 高 | 低 | 全部虚构名 + 原创素材 + 核验清单（WORLD_BIBLE §11） |

---

## 14. 迁移与回滚

- **迁移顺序**：git 基线（含 `.env`、`dist`、`node_modules` 排除）→ 新增 domain/app/content/ai 骨架（不改旧代码）→ v2 功能逐步接入 → 旧入口保留 → E2E 双跑。
- **回滚**：v2 通过 `featureFlag('v2')` 控制入口；关闭后回到 P1 体验；v2 存档单独键，不影响 v1 图鉴。
- **发布**：比赛版构建 `dist`；不部署公共云、不推送远程（任务书要求）；演示用本地 `npm run preview`（8787）。

---

## 15. 任务书 §20 第 9 问的代码级回答（哪些必须重构）

| 文件 | 处理 | 原因 |
|---|---|---|
| `src/App.tsx` | **拆分**（430 行 → `app/GameRoot` + reducers） | 新屏幕/存档/状态会继续膨胀 |
| `src/features/monsters/battle.ts` / `plan.ts` / `BattleView.tsx` | **冻结** | v1 契约与回放；只修 Bug |
| `src/features/monsters/analyze.ts` | **复用 + 扩展** | 图片校验/像素/压缩已经可靠 |
| `src/features/monsters/build.ts` | **部分复用**（统计区间/清洗）；新增 v2 compiler | AI 草稿逻辑不适合多标签编译 |
| `src/features/monsters/MonsterSprite.tsx` / `share.ts` | **扩展**（层叠/进化/区域色），不改旧 props | 视觉资产与导出依赖 |
| `src/features/monsters/store.ts` | **保留 v1 只读**；新增 `domain/save/*` | 避免迁移破坏旧图鉴 |
| `server/server.mjs` | **拆分路由/模型层**（仍零依赖） | 5 个 AI 任务 + 限流/超时需要组织 |
| `scripts/e2e-shots.mjs` | **保留**；新增 `e2e-2.mjs` | v1 回归不能丢 |
