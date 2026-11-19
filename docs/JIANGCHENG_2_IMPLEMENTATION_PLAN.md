# 江城万物怪 2.0 · 实施计划（分批、文件级、可验收）

> **实施状态（2026-11-19）**：Batch 0 与 Batch 1 已实施，2.0 探索切片可玩（`?v2=1`）；实测与偏差见 `docs/JIANGCHENG_2_STATUS.md`。本文保留原始计划用于 Batch 2 起继续执行。

> 版本：V1.0（2026-11-19）｜依据：`JIANGCHENG_2_GDD.md`、`JIANGCHENG_2_ARCHITECTURE.md`、仓库实测
> 时间假设：比赛可开发窗口 **2026-11-20 → 2026-12-05**（规划日 11-19）。若实际截止更早/更晚，按“批次顺序不变、内容量伸缩”的原则调整。
> 本轮（11-19）只做规划与仓库复验；**不改业务代码**。下一轮用户确认后从 Batch 0 开始执行。

---

## 0. 两个版本目标（必须公开区分，不混淆宣传）

### 0.1 参赛可展示版本（MVP2，提交前必须完成）

- 语义捕获编译器（12 类物品标签映射、3 次纠错、预算约束）。
- 召唤定形演出 + 8 个固定样本。
- 三人队伍 + `expedition_v2` 战斗（5–7 回合、换位、支援、共鸣、状态、6 连携）。
- **两个完整区域**：江风渡口（Slice A）、过早巷（Slice B），各 4 个节点 + 1 个 Boss + 事件/任务。
- 成长：等级≤5、6 组进化分支、熟练度、羁绊 1 档。
- 存档 v2 迁移（v1 24 卡不丢）+ 图鉴锁定/筛选 + 角色档案卡/挑战码。
- AI 四任务中的 3 个必须真实可用：analyze_object、battle_director、quest_director；evolution_guide 可规则兜底。
- 双 E2E：v1 回归 10 步 + v2 主流程；真实 AI 冒烟；平衡模拟报告。

### 0.2 完整 2.0 目标（比赛后继续，不谎称已完成）

- 五区域、五 Boss、≥20 事件、≥25 任务、≥10 进化组、≥20 模块、10 连携。
- 全部 AI 导演能力、区域图鉴、周目变体、挑战码分享扩展。

---

## 1. 批次总览与依赖

```
Batch 0  基线/骨架（0.5–1 天）
   └→ Batch 1  语义捕获 + 队伍 + expedition_v2 + 江风渡口 + 风雨电台（5 天）
        └→ Batch 2  过早巷 + 成长/进化 + 任务/地图 + 存档迁移 + Slice B（5 天）
             └→ Batch 3  桥影/樱坡/创想站 + 更多 Boss/事件/敌人机制 + AI 导演深化（3 天）
                  └→ Batch 4  演出/移动端/平衡/试玩/演示排练（3 天）
                       └→ Batch 5  可选扩展（比赛后）
```

**关键依赖**：
- 语义编译器 → 队伍（角色必须有可装备技能/支援指令）→ expedition_v2。
- 战斗 v2 → 区域节点/Boss → 区域闭环。
- 存档 v2 → 所有进度；必须在 Batch 1 结束前可用（哪怕先只存收藏/队伍）。
- AI 契约 → 所有 AI 任务；`battle_director` 依赖战斗 v2 的合法动作快照。

---

### 1.1 与任务书 §17 的优先级映射

| 任务书优先级 | 任务包 | 本项目批次 | 说明 |
|---|---|---|---|
| P0 | 物品语义→技能/被动映射 | Batch 1（T1.1–T1.6） | 先让“拍不同物品真的不同”成立 |
| P0 | 组队、换位与连携 | Batch 1（T1.7–T1.12） | 战斗从单卡变组合 |
| P0 | 机制 Boss + 区域纵向切片 | Batch 1（T1.13–T1.15） | Slice A 闭环 |
| P0 | 显著的召唤/技能演出 | Batch 1（T1.6）+ Batch 4 | 第一眼记忆点 |
| P1 | 地图、任务与区域解锁 | Batch 2（T2.2/T2.6/T2.7） | 长期目标 |
| P1 | 成长与分支进化 | Batch 2（T2.3–T2.5） | 养成动力 |
| P1 | AI 导演与差异化对手 | Batch 1（T1.10）+ Batch 2（T2.11） | 真实影响玩法 |
| P1 | 收藏锁定/发现图鉴/回响手册 | Batch 2（T2.8/T2.9） | 创造成果沉淀 |
| P2 | 五区完整世界/主线结尾 | Batch 3（可裁） | 比赛后继续，不虚报 |
| P2 | 自定义挑战/区域活动/分享扩展 | Batch 3 + Batch 5 | 复玩 |
| P2 | 立绘增强/多端/社区 | Batch 5 | 可选增强 |

---

## 2. Batch 0｜基线与骨架（11-19 晚 ~ 11-20 上午）

> 目标：把“不可回滚的现状”变成“可回滚的基线”，并搭好空骨架；不实现玩法。

| ID | 任务 | 文件范围 | 依赖 | 复杂度 | 验收 |
|---|---|---|---|---|---|
| T0.1 | **建立本地 git 基线**（不推送远程） | `.gitignore` 补 `.env`/`dist`/`node_modules`/`.tmp`/`*.tsbuildinfo`；`git init` + 初始 commit | 无 | S | `git status` 干净；`.env` 不在提交中（`git check-ignore .env`） |
| T0.2 | 跑基线并记录 | `docs/JIANGCHENG_2_BASELINE.md`（新） | T0.1 | S | typecheck/test/build/check:ai/shots 五条结果写入文档 |
| T0.3 | 建领域骨架（空实现 + 类型） | `src/domain/**`、`src/ai/contracts/**`、`src/app/**`、`src/content/**` | T0.1 | M | `npm run typecheck` 通过；无运行时行为变化 |
| T0.4 | 服务端路由拆分（行为等价） | `server/lib/*`、`server/routes/*`、`server/schemas.mjs`；保留 `/api/health`、`/api/monsters/analyze`、`/api/battle/plan` | T0.3 | M | `npm run check:ai` 通过；v1 E2E 通过 |
| T0.5 | 测试基线：v1 golden 快照 | `src/features/monsters/__tests__/battle-v1.golden.test.ts` | T0.3 | S | 固定 seed/战术/出招 → 结果快照；37+1 条全绿 |
| T0.6 | 内容校验器 | `src/domain/shared/content.ts`（validateContent） | T0.3 | S | 启动时校验 ID 唯一/引用存在/数值范围；单测 |

**Batch 0 DoD**：基线可回滚；骨架不改变现有 10 步 E2E；v1 测试全绿。

---

## 3. Batch 1｜语义捕获 + 队伍 + 探索战 + 江风渡口（11-20 → 11-24）

> 目标：**Slice A「一把雨伞的价值」完整可玩**。用户拍伞 → 确认遮挡 → 守护型角色 → 三人队 → 江风渡口 → 风雨电台 → 用屏障救命 → 解锁下一节点 + 进化预览。这是“第一次好玩”的核心。

### 3.1 任务表

| ID | 任务 | 文件范围 | 依赖 | 复杂度 | 并行组 | 验收 |
|---|---|---|---|---|---|---|
| T1.1 | 标签枚举/中文名/白名单 + 内容校验 | `src/domain/capture/tags.ts`、`src/content/modules.ts` | T0.3 | S | A | 单测：枚举完整、24 模块 ID 唯一、引用合法 |
| T1.2 | 证据合并 + 纠错 | `src/domain/capture/evidence.ts` | T1.1 | S | A | 单测：三源优先级、冲突标志、最多 3 次纠正 |
| T1.3 | **compileCreature 纯函数**（budget/路径/模块/被动） | `src/domain/capture/compile.ts`、`appearance.ts` | T1.1/1.2 | L | A | 200 组随机标签不越界；同输入同输出；12 类物品快照 |
| T1.4 | `analyze_object` 契约与网关 | `src/ai/contracts/analyze.ts`、`src/ai/gateway.ts`、`server/routes/analyze.mjs` | T0.4 | M | B | 真实 AI 返回合法标签；非法输出回落；`callLog` 记录 |
| T1.5 | 捕获站 v2 + 证据确认 UI | `src/features/capture2/*`、`styles/summon.css` | T1.3/1.4 | L | C | E2E：样本/上传 → 证据可改 → 重编译预览变化 |
| T1.6 | 召唤定形演出（SVG 分层 + CSS） | `MonsterSprite.tsx` 扩展、`features/capture2/SummonStage.tsx` | T1.5 | M | C | 1.2–1.8s；reduced-motion 直接成形；截图 |
| T1.7 | Module/被动定义与装备规则 | `src/content/modules.ts`、`domain/battle2/actions.ts` | T1.1 | M | A | 单测：每角色 3 主动/2 装备/1 被动；非法装备拒绝 |
| T1.8 | **battle2 状态/行动/伤害/状态管线** | `domain/battle2/{state,actions,damage,status,reducer}.ts` | T1.7 | L | A | 纯函数；NaN/负血/回合上限测试；固定 seed 快照 |
| T1.9 | 规则兜底 AI + 8 敌人原型（先 4 个） | `domain/battle2/aiRule.ts`、`src/content/enemies.ts` | T1.8 | M | A | 8 原型中 4 个可用于区域；AI 合法性测试 |
| T1.10 | `battle_director` 契约/网关/预取 | `ai/contracts/battle.ts`、`ai/prefetch.ts`、`server/routes/battle-director.mjs` | T1.8 | M | B | 真实调用返回合法 action；非法/超时回落；阻断测试 |
| T1.11 | 探索战 UI（队伍/状态/意图/支援/连携） | `features/battle2/ExpeditionBattleView.tsx`、`styles/battle2.css` | T1.8/1.10 | L | C | 一局完整可玩；状态可见；来源标注 |
| T1.12 | 队伍工坊（编成/技能/支援指令/连携预览） | `features/party/PartyWorkshopView.tsx` | T1.7 | M | C | 可换位/换技能/保存；非法组合提示 |
| T1.13 | 江风渡口区域：地图/节点/事件（4 个） | `domain/world/regions.ts`、`nodes.ts`、`events.ts`、`features/map/*` | T1.9/1.12 | L | D | 3–5 节点 run；事件有机制后果；seed 可复现 |
| T1.14 | **风雨电台 Boss**（两阶段/预告/多解） | `domain/battle2/bosses/fengyu.ts`、`content/bosses.ts` | T1.8/1.10 | L | D | 两阶段可测；预告准确；三种构筑均能通关（模拟） |
| T1.15 | 区域奖励/进度/解锁 | `domain/world/progress.ts`、`economy.ts` | T1.13 | M | D | 通关解锁下一节点；奖励幂等；刷新不重复 |
| T1.16 | 存档 v2 基础（收藏/队伍/进度） | `domain/save/{schema,storage,migrate}.ts` | T0.3 | M | B | v1→v2 迁移测试；写失败不丢卡；刷新恢复 |
| T1.17 | 回响手册/图鉴 v2 基础 | `features/codex/*` | T1.16 | M | C | 筛选/锁定/来源/战绩可见 |
| T1.18 | 集成验收：Slice A E2E | `scripts/e2e-2.mjs`（新增） | 全部 | M | E | 捕获雨伞→召唤→编队→渡口→Boss→奖励→刷新恢复 |
| T1.19 | 平衡模拟 v2 第一版 | `scripts/balance-2.mjs`、`domain/battle2/__tests__/balance.test.ts` | T1.8/1.14 | M | E | 1000 局报告：无 NaN/死锁；Boss 胜率区间 |

**Batch 1 DoD**：
- `npm test` ≥60 条（v1 37 保持 + v2 新增）；
- `npm run check:ai` 通过；
- `npm run shots`（v1）保持通过；
- `npm run shots:2` Slice A 通过；
- 人工试玩：不看文档可在 90 秒内完成伞→召唤，3 分钟内打赢风雨电台一次（允许一次失败）。

### 3.2 并行分工（建议 3 人/3 个 Agent）

| 流 | 文件所有权 | 任务 |
|---|---|---|
| A 规则/战斗 | `src/domain/capture/**`、`src/domain/battle2/**`、`src/content/modules.ts` | T1.1–1.3、T1.7–1.9、T1.19 |
| B AI/存档/服务端 | `src/ai/**`、`src/domain/save/**`、`server/**` | T1.4、T1.10、T1.16 |
| C UI/演出 | `src/features/capture2|party|battle2|codex/**`、`src/styles/*` | T1.5、T1.6、T1.11、T1.12、T1.17 |
| D 世界内容 | `src/domain/world/**`、`src/content/bosses.ts`、`features/map/**` | T1.13–1.15 |
| E 集成/验收 | `scripts/**`、`docs/**` | T1.18/1.19；合并冲突负责 |

**集成边界**：A 输出纯函数与类型；C 只调用 A 的 API，不写规则；B 输出契约与适配器，C 只拿已校验结果；D 用 A 的战斗接口；E 每 2 天跑一次全链路。

---

## 4. Batch 2｜过早巷 + 成长/进化 + 地图/任务 + 存档完整（11-25 → 11-29）

> 目标：**Slice B「热干面也能当主力」+ 第二区域闭环 + 长期进度**。

| ID | 任务 | 文件范围 | 依赖 | 复杂度 | 验收 |
|---|---|---|---|---|---|
| T2.1 | 早味大厨 Boss（热度机制、双阶段） | `domain/battle2/bosses/zaowei.ts` | T1.8 | L | 热度规则可测；三种构筑可过；预告准确 |
| T2.2 | 过早巷区域（热度机制、4 节点、5 事件） | `domain/world/regions/zao.ts`、`events.ts`、`features/map` | T1.13 | L | 热度影响战斗；事件有后续影响；seed 复现 |
| T2.3 | 熟练度/等级/经验（上限 5、递减） | `domain/growth/leveling.ts` | T1.16 | M | 重复刷同节点收益递减；±2 点边界测试 |
| T2.4 | **6 组进化分支**（定义/预览/应用/回退） | `domain/growth/evolution.ts`、`content/evolutions.ts`、`features/evolution/*` | T2.3 | L | 两条分支模块/外观不同；回退消耗信物；记录完整 |
| T2.5 | 羁绊 1 档 + 6 连携 | `domain/growth/bonds.ts`、`domain/battle2/links.ts` | T1.8/2.4 | M | 组合条件可测；连携每场 1 次；效果白名单 |
| T2.6 | 地图/区域解锁/节点生成 seed 化 | `domain/world/nodes.ts`、`progress.ts`、`features/map/*` | T1.13 | L | 3–5 节点；无死路；通关解锁下一区 |
| T2.7 | 任务系统（12 个首批） | `domain/world/quests.ts`、`content/quests.ts`、UI | T2.6 | M | 前置/完成/领奖幂等；soft-lock 测试 |
| T2.8 | 图鉴三层 + 锁定/筛选/未发现线索 | `features/codex/*`、`domain/save` | T1.17 | M | 锁定卡永不淘汰；筛选；未知线索 |
| T2.9 | 角色档案卡 + 挑战码导出 | `features/codex/ShareCard.tsx`、扩展 `share.ts` | T1.17 | M | 不含照片/位置/密钥；挑战码可复刻 |
| T2.10 | 存档完整迁移/导出/导入/容量 | `domain/save/*` | T1.16 | L | 24 卡迁移夹具；损坏恢复；导出导入一致 |
| T2.11 | AI quest_director（合法事件池） | `ai/contracts/quest.ts`、`server/routes/quest-director.mjs` | T2.6 | M | 只选合法事件；非法回落；来源标注 |
| T2.12 | 集成验收：Slice B + 双区 E2E | `scripts/e2e-2.mjs` 扩展 | 全部 | M | 热干面控制流过 Boss；两区往返；刷新恢复 |
| T2.13 | 平衡模拟扩展（Boss/构筑/资源） | `balance-2.test.ts` | T2.1–2.7 | M | 每 Boss ≥2 种构筑可过；退化组合标记 |

**Batch 2 DoD**：两个区域完整闭环；进化可预览/可回退；存档可迁移可导出；`npm run check:ai` + `npm run shots:2` 通过；5 人内部试玩中 ≥3 人主动继续第二区域。

---

## 5. Batch 3｜第三~五区 + 深化（11-30 → 12-02，可裁）

| ID | 任务 | 验收 |
|---|---|---|
| T3.1 | 桥影工坊区域 + 桥影守卫 Boss（通道封锁/连接） | 规则可测；连接标签可开隐藏路线 |
| T3.2 | 樱语山坡区域 + 樱信档案员 Boss（技能记录/反制） | 重复技能被记录；轮换可破 |
| T3.3 | 雷鸣创想站区域 + 造物夜主脑（三阶段/装置组合） | 3 种合法组合可通关 |
| T3.4 | 8 敌人原型补齐 + 4 AI 性格 | 每个原型有预兆/反制；AI 只选合法动作 |
| T3.5 | 事件扩充至 20、任务至 25、进化组至 10 | 内容校验通过；无死路/无重复奖励 |
| T3.6 | evolution_guide AI + 图鉴发现链 | 只推荐合法分支；图鉴线索可玩 |
| T3.7 | 周目变体/挑战码扩展 | 同 seed 不同事件；挑战码可复现 |

**裁剪规则（若时间不足）**：优先保留 T3.1（桥区）作为第三区域；T3.2–T3.7 顺延到比赛后。**不能**用削减比赛版两个核心区域/存档/AI 真实性的方式换内容数量。

---

## 6. Batch 4｜演出、移动端、平衡、试玩与交付（12-03 → 12-05）

| ID | 任务 | 验收 |
|---|---|---|
| T4.1 | 召唤/进化/技能/换位/阶段演出二轮打磨 | 60fps；reduced-motion；截图 |
| T4.2 | 移动端 375/390 真实触控与布局 | 无横向溢出；字号可读；按钮 ≥44px |
| T4.3 | 性能：懒加载、首屏预算、AI 预取命中率 | 首屏 JS ≤160KB gzip；回合 <5ms |
| T4.4 | 平衡终测（1000+ 局）+ 调参 | 报告存档；异常组合清单 |
| T4.5 | 5–10 人试玩 + 观察记录 | 按 BALANCE_AND_ACCEPTANCE §8 记录 |
| T4.6 | 双 E2E + 真实 AI 冒烟 + 演示脚本彩排 | `e2e-shots`、`e2e-2`、`check:ai` 全绿；90s/3min/10min 脚本跑通 |
| T4.7 | 交付文档与截图更新 | README、HANDOFF、六份 2.0 文档、演示截图 |
| T4.8 | 演示降级彩排（无 Key/慢模型/断网） | 每个剧本有降级版本 |

---

## 7. 每日/每批检查点（Definition of Done）

**每个任务合并前**：
- `npm run typecheck` 通过；
- 相关单测新增/更新，`npm test` 全绿；
- 涉及 UI：`npm run shots` 或 `shots:2` 通过 + 截图肉眼检查；
- 涉及 AI：`npm run check:ai` 通过，非法输出/超时路径有测试；
- 涉及存档：迁移/刷新/导出测试通过。

**每个批次结束**：
- 可玩的纵向切片（不是“模块完成”）；
- 3–5 人内部试玩 15 分钟；
- 更新 `docs/JIANGCHENG_2_STATUS.md`（每批新建/更新）：已完成/未完成/已知问题/下一步；
- 记录 AI 调用统计（次数/延迟/降级率）与平衡模拟报告。

---

## 8. 时间表（建议，含缓冲）

| 日期 | 工作 | 里程碑 |
|---|---|---|
| 11-19 | 本轮规划（六份文档） | 规划评审 |
| 11-20 上午 | Batch 0 基线/骨架 | git 基线、v1 golden |
| 11-20 → 11-24 | Batch 1 | **Slice A 可玩**：伞→队→渡口→Boss |
| 11-25 → 11-29 | Batch 2 | **Slice B + 双区闭环 + 存档** |
| 11-30 → 12-02 | Batch 3（可裁） | 第三区/更多内容 |
| 12-03 → 12-05 | Batch 4 | 演出/移动端/试玩/彩排/交付 |
| 12-05 晚 | 参赛版冻结 | 打 tag、导出演示包 |

> 每天预留 20% 缓冲；若延迟，按 §5 裁剪规则先砍内容后砍演出，绝不砍存档安全/AI 真实性/v1 兼容。

---

## 9. 风险与止损

| 风险 | 触发信号 | 止损动作 |
|---|---|---|
| 战斗 v2 复杂度失控 | 状态/连携测试反复失败、回合 >8 | 先冻结 6 连携→3；移除反光/标记等次要状态；保证 2 区域可玩 |
| AI 延迟拖慢演示 | 决策 P95 >10s | 演示版强制关键回合 AI + 其余规则；预取缓存；展示来源 |
| 存档迁移丢卡 | 任何一张 v1 卡不可见 | 暂停其他任务，修迁移/回退到 v1 只读 |
| UI 工期超 | 屏幕未接完 | 先接主流程（捕获/地图/战斗/结算），图鉴/手册用简版 |
| 内容量不足 | 只有 1 区 | 比赛版保留 2 区；第三区后移；用事件/挑战变体补复玩 |
| 范围膨胀 | 出现“再加一个系统” | 记录到 Batch 5，不进比赛版 |

---

## 10. 比赛后可继续（Batch 5）

- 五区全部完成、第五 Boss 多解法、周目变体。
- 自定义挑战路线/挑战码社区化（若做公开上传，补审核与存储）。
- 主题赛季（如“江城雨季赛”）、更多进化组、融合形态。
- 真机相机/iOS 验证、可选生图增强（带来源追溯与失败兜底）。
- 若并行社团项目也在参赛：两个仓库独立提交，不打包成一个作品（任务书要求）。
