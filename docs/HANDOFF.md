# 江城万物怪 · 交接说明

> 给下一个接手这个仓库的 Agent。写于 2026-11-19 16:30（GMT+8），P1 更新于 17:40。
> 本文件假设你没有任何对话上下文，所有结论都可以用第 6 节的命令复验。

| 项目 | 值 |
|---|---|
| 仓库根目录 | `D:/Projects/hackathonwhu/jiangcheng` |
| 上游规格 | `D:/Projects/hackathonwhu/珞珈AI创意_三原型可玩性验证与开发规格书.md`（第 4 节 = 本项目） |
| 交付形态 | 可试玩的 Web 原型（P0-B → P1），不是概念稿、不是 PPT |
| 代码量 | 约 9.5k 行（含 CSS 2.5k、测试 900+、服务端 620） |
| 技术栈 | React 18 + Vite 5 + TypeScript + zod + vitest；服务端零依赖 Node |
| 模型 | 武大 MaaS `https://maas.whu.edu.cn/v1` · `deepseek-v4-flash`（已实测可读图，延迟 1.2–18.4s；可用于敌方选招） |
| 状态 | P1 完成；2.0 Batch 0/1 探索切片可玩（`?v2=1`）；**67 条测试全绿（v1 38 + v2 29）**；无 git 远程仓库（已建立本地基线） |
| P1 文档 | `docs/P1-AUDIT.md`（审计）/ `docs/P1-PLAN.md`（任务清单）/ `docs/P1-RESULT.md`（实施结果） |
| 2.0 文档 | `docs/JIANGCHENG_2_GDD.md` 等六份规划 + `docs/JIANGCHENG_2_STATUS.md`（Batch 0/1 实施状态） |

---

## 0. 30 秒上手

```bash
cd D:/Projects/hackathonwhu/jiangcheng
npm install
npm run build && npm run preview     # http://localhost:8787
```

- `.env` 已存在且可用（含 Key，**不要提交**）。没有 `.env` 时会自动进入「演示模式」，全流程照样能玩（战斗由规则出招）。
- 首页点「芝麻旋旋」那张样卡 → 约 2–9 秒出卡 → 选对手 + 选战术 → 打三回合 → 结算 → 图鉴。
- 验证是否真的调用了模型：看右上角是否红章「实时 AI 就绪」、卡面页脚是否印 `LIVE · deepseek-v4-flash`、战斗意图条是否出现 `AI 选招` 与耗时。
- 一条命令验证真实 AI 链路：`npm run check:ai`（analyze + battle-plan 两个接口）。

开发模式（两个终端）：`npm run api`（8787）+ `npm run dev`（5173，已配 `/api` 代理）。
⚠️ 在**当前这台机器**上 Vite dev 会报 `EACCES ... :5173`（沙箱只放行 8787），所以本地验证请走 build + preview；换到你自己的机器上 dev 正常。

---

## 1. 现在做到哪一步

一句话：**「拍照 → 得到一张能打的卡 → 赛前选战术 → 三回合战斗（敌方由 AI 选招）→ 结算 → 图鉴/战绩」这条闭环是通的，且用真实多模态模型验证过。**

P0 已验收（对应规格书 §4.10）保持：

- 示例输入到拿到卡：本地约 1 秒，实时 AI 约 2–9 秒（含 0.6 秒显影动画）。
- 5 个示例（热干面 / 雨伞 / 樱花 / 轮渡剪影 / 水杯）在属性、招式、造型、数值上都不同。
- 战斗有多种有效策略（爆发抢血、防御顶大击、回血续航、先手补刀 + P1 三战术），HP 不会为负，最迟 3 回合结算。
- 图片处理失败、断网、无 Key、模型超时，都能走完流程并**在界面上如实标注**模式。
- 可再次捕获、图鉴对比、切换出战；可导出精灵卡 PNG（不含原图与位置）。
- 自动化：`npm test` 37 条；`npm run shots` 走完整流程并截图。

P1 已完成（详见 `docs/P1-RESULT.md`）：

- **敌方 AI 指挥官**：模型在合法招式内选招，规则引擎结算；首回合最多等 8 秒（可跳过），后续回合不阻塞；失败自动降级并标注；结算页显示 `AI 决策 N/3` 与逐回合来源。
- **赛前 3 选 1 战术**：背水一战 / 稳扎稳打 / 快人一步；被克组合推荐战术胜率 83%/55%/77%（无战术仍 0%/2%/22%）。
- **战绩与复现**：每只精灵 W/L/平/连胜/最佳连胜持久化；结算页「复现本局」使用同一 seed + 战术。
- **战斗演出**：回合横幅、击倒印章、低血条警示、回血数字、最新战报高亮、AI 徽章、reduced-motion 降级。
- **工程收口**：ErrorBoundary、分享模块懒加载、服务端计划接口 schema/限流/超时/客户端断开中断、`npm run check:ai`。

未做（不要以为是漏了，是这一轮范围外）：账号、排行榜、联机、AI 生图、PDF/PPT（属于另一个原型 StageCrash）、机制型敌人、图鉴锁定收藏、Playwright 用例（改用 CDP 脚本）。

---

## 2. 目录地图（改代码先看这张表）

```
server/server.mjs                620 行  静态托管 + /api/health + /api/monsters/analyze + /api/battle/plan（模型代理、分接口限流、zod、超时、客户端断开中断）
scripts/e2e-shots.mjs            348 行  CDP 端到端：走完整流程 + AI 决策/战术/战绩/复现断言 + 上传真图 + 10 张截图，失败非零退出
scripts/ai-check.mjs             145 行  真实模型接口冒烟（analyze + battle-plan），无 Key 跳过、失败非零退出
src/main.tsx                      15 行  挂载 + ErrorBoundary + 引入两份 CSS
src/App.tsx                      430 行  屏幕状态机（capture/card/battle/result/gallery）、捕获编排、战术/seed 状态、战绩结算、Toast、日志抽屉
src/shared/types.ts              210 行  全局数据协议（Monster / MonsterRecord / BattleState / BattlePlanRecord / TacticId / ExecutionMode / CallLogEntry）
src/shared/rng.ts                 45 行  FNV-1a 哈希 + mulberry32（可复现的根基）
src/shared/ErrorBoundary.tsx      55 行  渲染错误兜底页（P1）
src/shared/ai/client.ts          284 行  唯一模型出口：health 探测、出卡、敌方决策、超时、降级、调用日志
src/shared/ai/schemas.ts         118 行  zod：VisionSummary / MonsterDraft / AnalyzeResponse / BattlePlanResponse；coerceDraft 修复模型输出
src/features/monsters/
  elements.ts                    106 行  5 属性、克制闭环、天气表、category→element
  skills.ts                      131 行  6 技能白名单、技能槽分配（第一槽固定 BURST）
  tactics.ts                      83 行  P1 赛前 3 选 1 战术（系数只在被克时完整生效）
  build.ts                       209 行  互补式数值分配（可复现）、卡牌构建、文本清洗、本地命名/主题
  analyze.ts                     294 行  上传校验、64px 像素统计、压缩图（给模型）、本地降级草稿
  battle.ts                      496 行  纯函数战斗引擎、战术系数、敌方意图、AI 计划写入、伤害公式、胜负判定
  plan.ts                        151 行  AI 决策请求快照、模型输出清洗与白名单校验
  enemies.ts                      81 行  4 个固定假想敌 + 克制提示
  samples.ts                     182 行  5 个内置样本（vision + 手写 draft + 缩略配方）
  store.ts                       103 行  localStorage 图鉴（key: jcm.gallery.v1，上限 24）+ P1 战绩
  share.ts                       229 行  Canvas 720×1040 导出精灵卡（按需加载）
  MonsterSprite.tsx              278 行  程序化双色套印插画（6 体块 × 6 纹样 × 5 配件）
  MonsterCard.tsx                155 行  卡面（含标尺数值、模式徽章、LIVE + 模型名）
  CaptureView.tsx                228 行  首页：大标题、拍/传/拖、样本抽屉、克制环、模式开关、三步说明
  AnalyzeModal.tsx                71 行  显影进度弹窗（4 步 + 8 秒后「改用演示策略」）
  CardView.tsx                   228 行  精灵档案：证据标签、属性关系、招式详情、对手选择、战术三选一、战绩
  BattleView.tsx                 501 行  对战：双卡对峙、HP 标尺、AI 决策/来源/耗时、致命提示、回合横幅、击倒印章、战报
  ResultView.tsx                 180 行  结算：印章、战绩、本局决策复盘、关键行动、数值依据、复现入口
  GalleryView.tsx                205 行  图鉴：卡格 + 空卡位、战绩、双列对比（修正克制倍率）、出战/查看/删除
src/styles/base.css              589 行  设计令牌（纸/墨/红/蓝）、排版、按钮、图章、标尺、动效
src/styles/game.css             1753 行  各视图样式（P1 增补集中在文件末尾「P1 增补」块）
docs/shots/*.png                 10 张  自动生成的分步截图（01 首页 → 10 上传真图）
docs/P1-AUDIT.md / P1-PLAN.md / P1-RESULT.md  P1 审计、任务清单、实施结果
```

---

## 3. 四条核心链路（改功能时按这个顺序读）

### 3.1 捕获 → 出卡

```
CaptureView（点击样本 / 选择文件 / 拖拽）
  → App.handleUpload → analyze.inspectImageFile(file)
       校验类型/大小/尺寸 → canvas 64×64 统计主色与明暗 → 猜类别
       同时输出 aiDataUrl：最长边 1100px、JPEG 0.82（只用于发给模型）
  → App.runAnalyze → ai/client.analyzeMonster(payload, localAnalyzer, {preferLive})
       ├─ health 不可用或用户选演示 → 直接本地草稿（mode=demo，不发任何请求）
       ├─ 否则 POST /api/monsters/analyze（服务端持 Key）
       └─ 失败/超时/schema 不过 → mode=fallback + 本地草稿
  → build.buildMonster({ vision, draft, generationMode, model, variant })
       allocateStats（互补式、哈希定权）→ assignSkills（BURST + 第二槽）→ cleanText
  → 写入图鉴 localStorage → 切到 CardView
```

关键点：**模型返回的 `draft` 只用于名称 / 文案 / 造型 / 第二技能偏好**，`stats` 与第一技能永远由规则算。

### 3.2 出卡 → 战斗

```
CardView 默认对手 = typeMultiplier 最高的一只（App 里 CardView 带 key=monster.id，换卡会重置）
  → CardView 选战术（三选一，默认按属性关系推荐；换对手会重新推荐）
  → App.startBattle(monsterId, enemyId, tactic, seed?) → BattleView(key = monster.id + enemyId + epoch)
  → battle.createBattle(monster, enemy, seed, { tactic })    // 天气由 seed 决定；战术写进 side.boons
  → 每回合：
       BattleView 用当前可见状态调 ai/client.planEnemyAction → POST /api/battle/plan
           模型在敌方合法招式内选一招（+理由+播报）→ zod/白名单校验 → applyEnemyPlan(state, plan)
           失败/超时/演示 → 保留 chooseIntent 的规则意图，界面标注
       battle.takeTurn(state, skillId)     // 纯函数
           优先级（含首回合先手战术）→ 速度 → 种子 定先后
           伤害 = clamp(round((威力 + 0.4×ATK − 0.25×DEF) × 克制(含背水修正) × 0.78 × 战术系数), 5, 45)
           防御减半；回血单局限一次；佯攻 +8 只作用于下一次攻击
           先倒一方即止；三回合后比 HP%，差 ≤1 个百分点判平
  → App 收到 onFinish 拿 BattleState → 先结算战绩（recordBattle）→ ResultView
```

`takeTurn` 是纯函数，`state` 进 `state` 出，不碰全局；同一 seed + 同一战术 + 同一计划序列 + 同一出招序列必得同一结果（有测试守着）。AI 只改 `state.intent`，不参与伤害计算。

### 3.3 敌方意图（可读的策略核心）

`battle.chooseIntent(state)` 是规则兜底；实时 AI 可用时由 `applyEnemyPlan` 用模型选招覆盖 intent，但**两者都只依赖当前可见状态**，所以玩家在提交前看到的意图就是这一回合真正会执行的招式。意图条必须继续标注来源：`AI 选招 / 规则意图 / AI 盘算中`；结算页从 `battle.planLog` 展示逐回合来源。不要改成隐藏随机。

### 3.4 图鉴、战绩与分享

`store.ts` 只存卡数据（无照片）+ P1 战绩（`record` 字段，旧数据无该字段时按 0 处理），24 条上限，超出淘汰最早。`share.ts` 用 `document.getElementById('sprite-<id>')` 序列化 SVG 后画到 Canvas —— 所以卡面上必须保留这个 id，否则导出会缺插画；P1 起 `share.ts` 只在点击保存时动态 import。

---

## 4. 不能破坏的不变量（P0 8 条 + P1 4 条）

1. **AI 不碰数值**：`buildMonster` 里 `stats`、第一技能、克制关系只能来自规则函数。模型输出再离谱也要被规则压回区间。
2. **第一技能必须是本系爆发（BURST）**：这是强度下限。之前模型给出 `STRIKE+GUARD`，卡牌只有 18 威力，几乎必输。
3. **战斗纯函数 + 可复现**：不要引入 `Math.random()`、`Date.now()` 到 `battle.ts`；随机一律走 `createRng(seed + ...)`。
4. **三回合封顶**：`MAX_ROUNDS = 3`，30–45 秒一局是产品前提，改大请先想清楚演示时长。
5. **HP 不为负、不出现 NaN**：所有外部输入先过 `clamp` / zod。
6. **模式必须如实标注**：`live_ai / demo / fallback` 三态在卡面、页头、页脚日志都要一致，禁止把本地生成伪装成 AI。
7. **照片不上传、不留存**：默认只在浏览器读像素；仅当用户选择实时 AI 时才把**压缩图**发给模型，且界面有提示。不要写入 localStorage、不要写服务端日志。
8. **所有外部输入过 schema**：服务端 `RequestSchema` / `BattlePlanRequestSchema`、客户端 `AnalyzeResponseSchema` / `BattlePlanResponseSchema`、`coerceDraft` / `sanitizePlan` 都要留着。

P1 新增：

9. **AI 只能换"选哪招"**：`applyEnemyPlan` 只接受敌方已有技能，越界/过期计划直接忽略；AI 不能改伤害、HP、先手或胜负。
10. **战术系数固定**：只来自 `tactics.ts` 的常量并写入 `BattleSide.boons`，战斗中不可变；不要在 `battle.ts` 引入 `Math.random()`/`Date.now()`。
11. **AI 参与必须可核对**：意图条来源+耗时、页脚调用记录、结算页 `planLog` 三处一致；降级必须显式标注，禁止把规则意图伪装成 AI 选招。
12. **无 Key / AI 失败全流程可玩**：不请求计划接口、直接规则出招；首回合最多等 8 秒且可「不等了」，后续回合不阻塞输入。

---

## 5. 模型接入现状

- 服务端从 `.env` 读 Key，前端只与本地 `/api` 通信，Key 不出服务器。
- 已实测 12 个模型能否读图（同一张 192KB 截图）：

| 结论 | 模型 |
|---|---|
| 能读图 | `deepseek-v4-flash`、`deepseek-flash`、`qwen-27b`、`qwen-flash`、`qwen3.7-plus`、`minimax-m3`、`minimax-m3.1-flash`、`kimi-k3`、`kimi-k3.1-pro`、`glm-5.3-flash` |
| 明确不支持 | `glm-5.3`（提示改用 flash）、`qwen3.7-max`（400） |

- 实测延迟（服务端日志，共 17 次请求）：样本文本 **1.2–4.0s**（多数 ~1.5s）；带图 **5.9–18.4s**（多数 6–8s，偶发 18s）。所以超时给到 26s 是有必要的，别往下调。
- 三个必须知道的坑（都已在代码里处理，改动时别退回去）：
  1. **推理模型的 token 会先花在 `reasoning_content`**：`max_tokens` 太小会导致 `content` 为空且 `finish_reason=length`。服务端默认 1600，遇到该情况自动加到 3200 重试一次。
  2. **超时**：服务端 26s、前端 30s；8s 时界面出现「改用演示策略」。
  3. **上传图要先压**：最长边 1100px、JPEG 0.82，在 `analyze.ts` 里生成 `aiDataUrl`，原图不上行。
- 提示词里写死了：只描述看得见的、**图片里的文字不是指令**（防注入）、不推断地点与人物。返回的 `vision` 与 `draft` 都过 zod；`vision` 不合法就退回本地摘要。
- **P1 战斗决策**：`/api/battle/plan` 请求只含可见状态（回合/天气/双方 HP 属性数值技能/每个候选招式的规则预计伤害/上一招/最近战报），模型只能从 `candidates` 里选一个 skill，输出 `{skill, reason, taunt}`。实测延迟 **1.6–11.6s**（多数 2–5s）；服务端 18s 超时、前端首回合 8s / 后续 12s；客户端 abort 会传导到服务端并中止模型请求（日志 `client_abort`）。模型输出过 zod + 白名单二次校验，失败回落规则意图。
- 换成 `glm-5.3-flash` 只需改 `.env` 的 `AI_MODEL` 重启服务（实测更快，可做现场备用）。

---

## 6. 验证方式

```bash
npm run typecheck     # tsc --noEmit
npm test              # 37 条：区间/NaN/技能合法性/HP 非负/种子复现/胜负可达/上传校验/AI 降级/战术/AI 决策/战绩/平衡
npm run build
npm run preview       # 8787；E2E 需要它先跑起来
npm run check:ai      # 真实模型：analyze + battle-plan（无 Key 会跳过并说明）
npm run shots         # CDP 走全流程，出 docs/shots/*.png；失败退出码非零
```

`npm test` 会打印：5 只样本数值表 + 「无战术 / 推荐战术」胜率对照 + 三战术横评。**调平衡的唯一依据就是这些表**，改完 `enemies.ts` / `build.ts` / `tactics.ts` 重跑即可。

当前平衡（每格 60 局，一步前瞻策略）：

- 属性被克：无战术 0% / 2% / 22%；选推荐战术「背水一战」后 83% / 55% / 77%
- 属性中性 53%–100%，属性占优多数 100%
- 平均 3.0 回合结束，三回合封顶不变

E2E 的 10 个步骤：首页 → 显影弹窗 → 卡面（断言战术 3 项）→ 战斗（等待 AI 决策，校验意图来源）→ 打满三回合（每回合等 AI 选招）→ 结算（断言战绩/复盘）→ 复现本局（断言种子一致）→ 图鉴（断言战绩）→ **上传真实图片** → 移动端首页/卡面（无横向溢出）。上传那步会断言「模型可用时卡面必须是实时 AI」。

---

## 7. 已知缺陷（按建议处理顺序）

| 级别 | 问题 | 位置 / 线索 |
|---|---|---|
| P1 | 被克局仍依赖「背水一战」：选对 55–83%，不选 0–22%；战术之间缺少代价/相性取舍 | `tactics.ts`；P2 可加战术代价或对手识破 |
| P1 | AI 决策延迟长尾 8–11.6s：回合 2/3 不阻塞，玩家手快会先看到规则意图 | `/api/battle/plan`、`BattleView.tsx`；可预取/缩短提示词 |
| P1 | 上传「游戏截图」会被描述成「卡片底、竖向构图」，因为模型没说错，输入本身是元图像 | `server.mjs` 提示词；可加一句「若画面是屏幕/截图，描述其中被拍摄的主体」 |
| P1 | 图鉴 24 条上限且无「锁定收藏」，超出会静默淘汰最早一只 | `store.ts` `GALLERY_LIMIT` |
| P2 | 只有 4 个假想敌，且都靠属性克制区分，缺「机制型」敌人（如反弹、叠毒）；AI 的选招空间也只有 2 个技能 | `enemies.ts` / `skills.ts` 白名单 |
| P2 | 主包 275KB JS（gzip 88KB），只拆了分享模块；gallery/战斗视图未路由级懒加载 | `vite.config.ts` |
| P2 | 分享卡用系统宋体，跨平台字形会有差异 | `share.ts` 字体栈 |
| P3 | 战报 `aria-live` 每回合播报整段，读屏略啰嗦 | `BattleView.tsx` |
| P3 | 移动端首页的示例大卡较高，5 个样本条要滑动才看到 | `game.css` `.featured` |
| P3 | `game.css` 末尾有「P1 增补」追加块，选择器分散，后续改样式建议合并整理 | `src/styles/game.css` |

---

## 8. 建议的下一步（按性价比排序）

1. **机制型敌人**：给 4 个敌人加 1–2 个独有被动（反弹部分伤害 / 每回合叠 1 层「潮气」降低我方 ATK / 首回合免疫），AI 选招空间随之变大；先用 `npm test` 平衡表验证被克/中性/优势三档不被破坏。
2. **战术的取舍化**：当前被克几乎必选背水一战；可让每个战术带代价（如背水让受到的克制伤害 +10%、稳扎降低先手），或用敌方 AI 识破（AI 看到战术标记后改变策略），让选择不再是唯一解。
3. **真实手机相机链路**：`CaptureView` 用了 `capture="environment"`，但只在桌面验证过。需要真机测 iOS Safari（`canvas.toDataURL` 与 `Image` 解码行为不同）。
4. **AI 决策体验**：把「AI 思考」做成可感知的短句滚动/预测条；回合 2/3 可用上一回合的模型缓存预热，减少长尾。
5. **图鉴增强**：锁定收藏、按属性筛选、按胜率排序；`store.ts` 加 `locked` 字段即可。
6. **部署**：整站同源（前端 + `/api`），任何 Node 静态托管都能跑；若要上云，注意 `dist` 与 `.env` 都不能进前端产物。
7. **样式整理**：`game.css` 末尾的「P1 增补」块与前面小节有同名主题（卡面/图鉴），后续改样式建议合并去重，避免特异性打架。

---

## 9. 环境与协作注意事项

- **没有 git 仓库**（`git rev-parse` 报 not a repo）。接手后若要版本化，先 `git init`，并确认 `.gitignore` 里有 `.env`、`node_modules`、`dist`、`.tmp`、`*.tsbuildinfo`。
- **`.env` 里有真实 Key**（`sk-` 开头，武大 MaaS）。不要提交、不要贴进对话/日志；若怀疑泄露，去平台重置后改本文件。
- **Windows + Git Bash**：`/tmp` 在 Python 里不解析（会变成 `C:/tmp`），临时文件请用项目内相对路径 `.tmp/`；本仓库的临时目录已 gitignore。
- **沙箱端口**：这台机器只放行 8787，Vite dev（5173/5199）会 `EACCES`。E2E 依赖 8787 上的服务，所以顺序必须是 `npm run build` → `npm run preview` → `npm run shots`。
- **“服务死了”可能只是假象**：后台任务被回收后，node 进程会变成孤儿，仍在服务；而沙箱里的进程跑在独立网络命名空间，主机侧 `netstat -ano` / `Get-NetTCPConnection` **看不到** 8787 的监听。判断死活只看一条：

  ```bash
  curl -s http://127.0.0.1:8787/api/health   # 有 JSON 就是活的
  ```

  重启前一定先探活：如果活着的实例还在，直接 `npm run preview` 会报 `EADDRINUSE`，而这时你又找不到 PID（因为看不见）。这种情况**不要盲杀进程**，先确认健康接口是否返回了新的 `time` 时间戳。
- **改完代码的固定动作**：`npm run typecheck` → `npm test` → `npm run build` →（如涉及 UI）`npm run shots` 并肉眼看一遍新截图 →（如涉及模型链路）`npm run check:ai`。
- 截图是**可覆盖产物**，不要手工编辑 `docs/shots/` 里的文件，改完 UI 重跑脚本即可。
- 设计方向已定：孔版双色印刷 + 方格观测本。新增 UI 请沿用 `base.css` 里的令牌（`--paper / --ink / --riso-red / --riso-blue`），不要引入渐变、玻璃拟态或圆角大卡片。

---

## 10. 交付物清单

- 可运行工程：`package.json` 的脚本（dev / build / preview / api / test / typecheck / shots / check:ai / start；另有 test:watch）
- 说明文档：`README.md`（面向人：玩法、验收对照、隐私、已知问题）
- 本交接文档：`docs/HANDOFF.md`
- P1 文档：`docs/P1-AUDIT.md`（P0 现状审计）/ `docs/P1-PLAN.md`（P1-A~E 任务清单与优先级）/ `docs/P1-RESULT.md`（实施结果与前后对比）
- 2.0 规划（2026-11-19，本轮未改业务代码）：`docs/JIANGCHENG_2_GDD.md` / `JIANGCHENG_2_WORLD_BIBLE.md` / `JIANGCHENG_2_ARCHITECTURE.md` / `JIANGCHENG_2_IMPLEMENTATION_PLAN.md` / `JIANGCHENG_2_BALANCE_AND_ACCEPTANCE.md` / `JIANGCHENG_2_DEMO_SCRIPT.md`
- 分步截图：`docs/shots/01-home.png` … `10-live-upload.png`
- 真实接口冒烟：`scripts/ai-check.mjs`（`npm run check:ai`）
- 原始规格：上级目录 `珞珈AI创意_三原型可玩性验证与开发规格书.md`

接手第一小时的建议动作：读第 3 节 → 跑 `npm test` 看平衡表 → 跑 `npm run check:ai` 确认真实模型链路 → 跑 `npm run shots` 看 10 张图 → 从第 8 节的第 1 项开始。
