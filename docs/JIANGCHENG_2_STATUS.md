# 江城万物怪 2.0 · Batch 0 + Batch 1 实施状态（2026-11-19）

> 依据：`docs/JIANGCHENG_2_GDD.md`、`JIANGCHENG_2_ARCHITECTURE.md`、`JIANGCHENG_2_IMPLEMENTATION_PLAN.md`
> 本轮范围：**Batch 0（基线/骨架）+ Batch 1（语义捕获 + 三人队伍 + expedition_v2 + 江风渡口 + 风雨电台）**
> 结论：**2.0 探索切片已可真实游玩**，P1 旧版完整保留，真实模型参战（AI 导演）与语义标签均实跑验证。

---

## 1. 入口与命令

| 内容 | 路径 / 命令 |
|---|---|
| 2.0 探索切片 | `npm run build && npm run preview` → **http://localhost:8787/?v2=1** |
| P1 旧版（保留） | http://localhost:8787/ （顶栏也有「2.0 试玩」链接） |
| 单测 | `npm test` → **9 文件 / 67 条全绿** |
| 类型 | `npm run typecheck` |
| 构建 | `npm run build`（主包 351.93 kB / gzip 115.57，分享模块独立 4.57 kB） |
| v2 E2E | `npm run shots:2` → 15 张截图到 `docs/shots-2/` |
| v1 回归 E2E | `npm run shots` → 10 张 P1 截图仍通过 |
| 真实 AI | `npm run check:ai` → analyze + battle-plan + analyze-object + battle-director 全部通过 |

## 2. Batch 0（完成）

- [x] 本地 git 基线（`.env`/`dist`/`node_modules`/`.tmp` 已排除；无远程仓库）
- [x] v1 冻结回归：`src/features/monsters/__tests__/v1-golden.test.ts`（20 组固定对局 HP/胜负/日志指纹）
- [x] 领域骨架：`src/v2/domain/*`、`src/v2/content/*`、`src/v2/ai/*`、`src/v2/views/*`
- [x] 内容自检：`src/v2/content/validate.ts`（ID 唯一、标签合法、引用完整、数值边界），单测断言 0 error
- [~] 服务端拆分（T0.4）：**本轮未拆分**，新增 2.0 路由直接加在 `server/server.mjs`，避免重构影响 v1；已记录为技术债，Batch 2 再拆

## 3. Batch 1（完成可玩纵向切片）

### 3.1 捕获与语义编译器
- 五维白名单标签：类别/形状/材质/功能/主题；证据三源（看见/推断/我确认）
- `compileCreature` 纯函数：5 条 build path、15 主动 + 10 被动 + 5 支援指令、数值预算 68–75、同输入同输出、装备技能保证至少一个伤害技
- 8 个固定样本（雨伞/热干面/樱花/轮渡/水杯/笔记本/帆布包/路灯）
- 捕获 UI：证据 chip 点击确认（最多 3 次纠正）、路径三选一预览、召唤定形演出
- 上传链路：P1 像素摘要 + `/api/ai/analyze-object` 真实模型标签；失败自动回落本地 `inferTags` 并标注

### 3.2 三人队伍
- 主战 1 + 支援 2；每人 3 个已知主动、装备 2 个、1 被动、1 支援指令
- 队伍工坊：上阵/移出/设主战/切换装备技能；starter 队伍（伞团团/面咕噜/渡江仔）保证零捕获也能玩
- 连携：渡航护盾（守护+机动）、潮缠锁（诡计）各 1 次/场，消耗 2 共鸣

### 3.3 expedition_v2 战斗（纯函数）
- 回合上限 8；行动：2 主动/普通攻击/防御/换位 + 支援指令/连携
- 共鸣 0–6（克制/防御/支援获取，换位/强技能/连携消耗）
- 状态：潮湿/脆弱/护盾/蓄力/防御/标记/束缚；Boss 阶段 2（HP≤50%）切换
- 本局胜利条件：击破敌人；Boss 战必须击破（拖到上限判负，避免“血厚混过去”）
- 同 seed + 同输入/计划 → 同 `fingerprint`（单测覆盖，`replayBattle` 可用）

### 3.4 AI 真实参与（探索战导演）
- `POST /api/ai/battle-director`：输入合法行动候选与可见状态，模型只选 actionId；服务端校验候选；客户端二次校验
- 每回合异步请求、不阻塞输入；AI 到达前用规则意图；超时/失败规则接管并标注
- 结果页显示 `AI 参与 N/M` 与逐回合来源；`docs/shots-2/14-v2-boss-result.png` 实测 Boss 8 回合中 AI 6/6

### 3.5 江风渡口区域
- 5 节点：雾中信号灯（事件）→ 候船棚（普通战）→ 渡船缆绳（事件）→ 旧码头（精英）→ 风雨电台（Boss）
- 事件选择有实际机制效果（开局共鸣/材料）；区域进度/材料/信物持久化；Boss 胜利解锁完成
- 敌人：江雾浮沫（普通）、潮汐铁锚（精英）、风雨电台（Boss 两阶段，暴雨/积水成渊/护盾）
- 平衡初测（`src/v2/__tests__/balance.test.ts`，3 套队伍 × 3 敌人 × 30 种子）：无 NaN/死锁/超回合；普通/精英可稳定通关；Boss 需要合理构筑（支援队无法速杀）

### 3.6 存档 / 图鉴 / 兼容
- 新键 `jcm.save.v2`；旧 `jcm.gallery.v1` 只读迁移为 `legacyCards`，旧卡仍可在旧版快斗使用，不静默删除；迁移备份 `jcm.backup.v1`
- 存档校验/损坏回退/导入导出/锁定收藏
- 图鉴：个人造物、证据来源、路径、战绩、锁定；最近 AI 调用可核对
- 旧版 P1 入口、37 条测试、10 步 E2E 全部保留通过

## 4. 实际运行证据

```
npm run typecheck   ✅
npm test            ✅ 9 files / 67 tests
npm run build       ✅ 主包 351.93 kB（gzip 115.57）
npm run shots       ✅ P1 10 步回归
npm run shots:2     ✅ 15 步（捕获→召唤→编队→地图→事件→战斗→结算→图鉴→AI 上传→Boss→移动端）
npm run check:ai    ✅ 4 条真实模型链路通过
```

真实模型记录（节选）：
- analyze-object：上传照片实测 `实时 AI 语义 · 12022ms`，9 个证据标签（见 `docs/shots-2/15-v2-upload.png`）；超时/非法输出时服务端裁剪或 200 fallback，客户端回落本地规则并标注
- battle-director：Boss 战 6–8 回合均返回合法 action（strike/storm/deluge），服务端校验后写入 `planLog`
- 截图：`docs/shots-2/01…15`；其中 `13-v2-boss` 为 Boss 首回合、`14-v2-boss-result` 为 AI 6/6 复盘
- **无 Key 演示模式回归**：以空 `AI_API_KEY` 启动服务后跑完整 `shots:2`，全部通过（AI 关闭、规则导演、语义本地推断、界面不出现“实时 AI”伪装；该轮截图未纳入仓库，避免覆盖真 AI 证据）

## 5. 与规划相比的偏差 / 未做

| 项 | 状态 | 说明 |
|---|---|---|
| 服务端拆分（T0.4） | 未做（技术债） | 新路由暂留在 `server.mjs`；不影响功能与测试，后续再拆 |
| 1000+ 局平衡模拟 | 初版 270 局 | 已覆盖 3 队伍×3 敌人×30 seed；Batch 2 扩到 1000+ 并加构筑矩阵 |
| 24 模块内容 | 15 主动 + 10 被动 | 满足首版玩法；剩余 9 主动按 GDD 在 Batch 2/3 补 |
| v1 卡“觉醒”为 v2 | 未做 | 当前只读保留 + 旧版快斗；Batch 2 做无损转换 |
| 进化/任务/第二区域 | 未做 | Batch 2 范围（图鉴/成长/过早巷/Boss 早味大厨） |
| 召唤/进化演出 | 召唤定形已做，进化未做 | 进化属于 Batch 2 |
| 真机相机 | 未验证 | Batch 4 范围 |

## 6. UI 优化 pass（Batch 2 之前，2026-11-19）

用户反馈“大小/组件可优化、地图纯文字不好、属性不明显、标签可加颜色、战斗操作字太小”后，进行了一次只作用于 2.0、不碰 P1 的设计 pass。详见 [`JIANGCHENG_2_UI_PASS.md`](JIANGCHENG_2_UI_PASS.md)。

- 字号从 9–72px 的散点收为 7 级，**不再有低于 13px 的可读文字**；v2 去掉等宽标注，字体降到 2 种。
- 样本卡显示「属性 + 成长倾向」彩色徽章；证据按类别/形状/材质/功能/主题五色区分；新增“确认的物性 → 获得能力”的因果行。
- 战斗操作台重排：技能名 17px、说明 13px、按钮 88–108px；支援/换位/连携独立区；战报独立栏；首屏可完成主要操作。
- 新增**江城渡运观测图**（SVG，1200×400）：两片陆地、主江 + 支流、两座桥、五区色块、五站航线、当前站说明、罗盘/比例尺/图例；移动端改为竖向路线。
- 新增标本标签、伤害浮字、回合闪字、受击抖动、区块错峰入场；全部 `prefers-reduced-motion` 可关。
- 验证：typecheck / 67 tests / build / P1 10 步 / 2.0 15 步（真实 AI + Boss）/ 4 条 AI 链路全部通过；截图在 `docs/ui-shots/before` 与 `docs/ui-shots/after`。
- design-taste-frontend inspector：3 FAIL / 4 WARN，剩余 3 个 FAIL 为品牌色、程序化 SVG 无实拍、印刷细线框，均已在 UI pass 文档中说明取舍，不做无意义改造。

## 7. 下一步（Batch 2）

1. 服务端按计划拆分路由/模型层（含 v2 任务）。
2. 过早巷区域 + 早味大厨 Boss；成长/熟练度/6 组进化分支；10 个任务。
3. v1 卡无损觉醒；图鉴三层；分享卡/挑战码。
4. 平衡扩到 1000+ 局；修复“支援队 Boss 无法击破”的构筑平衡（或明确其定位为辅助队）。
5. 真实试玩 3–5 人，记录第一次好玩/第二次仍想玩指标。
