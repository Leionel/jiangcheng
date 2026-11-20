import type { SaveV2 } from './types';
import { getActiveRun } from './save';
import { getRegion } from './region';
import { QUEST_DEFS, questState } from './quests';

export type GuideSection = {
  id: string;
  title: string;
  subtitle: string;
  steps: Array<{ title: string; text: string }>;
  tips: string[];
};

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'capture',
    title: '捕获 · 让物品成为回响',
    subtitle: '从一件日常物品开始，先看见它的物性，再决定它往哪条路长。',
    steps: [
      { title: '选样本或拍照', text: '内置样本可以离线用；上传时会先读像素，需要时再请模型给语义标签。' },
      { title: '确认证据', text: '点一下标签，把它变成“我确认”。证据会真正改变技能与数值，不只是文案。' },
      { title: '选成长倾向', text: '守护/强攻/诡计/支援/机动。同一件物品选不同倾向，召唤出的能力不同。' },
      { title: '召唤定形', text: '定形后进入图鉴；队伍最多 3 只，可随时换人、换装备技能。' },
    ],
    tips: [
      '主要看“功能”和“主题”标签；形状/材质影响数值与被动。',
      '确认标签最多纠正 3 次；加错了可以点已确认的标签取消。',
      '上传照片不会被保存；关闭实时 AI 时只在浏览器读像素。',
    ],
  },
  {
    id: 'party',
    title: '队伍 · 主战一个，支援两个',
    subtitle: '每回合一次主战行动 + 一次支援。三个人要互相补位。',
    steps: [
      { title: '编成', text: '点“上阵/移出”，最多 3 只；在队伍里可设主战、切换装备的 2 个技能。' },
      { title: '成长', text: '战斗获得经验；3 级可进化，消耗信物选择分支，可回退。' },
      { title: '羁绊', text: '一起战斗积累羁绊；羁绊越高，越高级的连携会解锁。' },
    ],
    tips: [
      '支援位负责治疗、侦测、护盾和接力；不要只带输出。',
      '换位消耗共鸣，但能救下濒死主战；桥接被动可以免消耗。',
      '技能在冷却或共鸣不足时，普通攻击/防御不消耗资源。',
    ],
  },
  {
    id: 'map',
    title: '地图 · 五个区，一条江',
    subtitle: '完成前一区解锁下一区；每个区 5 个节点，最后是 Boss。',
    steps: [
      { title: '点区域', text: '看该区的五站路线、Boss、区域规则；点“开始探索”进入。' },
      { title: '选事件', text: '事件会改变开局共鸣、护盾、材料或羁绊，也会留下线索，影响后面的事件。' },
      { title: '打 Boss', text: 'Boss 必须击破；拖到 8 回合上限算失败，但可以调整队伍重来。' },
    ],
    tips: [
      '前面事件里留下的线索，会在对应区域解锁隐藏选项。',
      '事件里带锁的选项需要前面留下的线索；这是设计，不是卡住。',
      '区域完成会解锁下一区，材料/信物/成长全部保留。',
    ],
  },
  {
    id: 'battle',
    title: '战斗 · 先读意图，再出招',
    subtitle: '敌人会预告下一步；AI 只选合法动作，伤害/阶段/胜负仍由规则结算。',
    steps: [
      { title: '看意图', text: '顶部写明下一招和预计伤害；有护盾/防御时范围伤害会减半。' },
      { title: '出主战行动', text: '技能/普攻/防御/换位。技能有共鸣消耗与冷却。' },
      { title: '配支援/连携', text: '支援指令不占主战行动；连携每场一次，效果更强。' },
      { title: '看战报', text: '右侧记录逐条结果；结算页会显示 AI 参与回合数。' },
    ],
    tips: [
      '不同 Boss 会在半血或 2/3、1/3 血量时进阶段，意图和机制都会变；提前留防御或护盾。',
      '“桥面封锁”回合支援不可用；“抄录招式”会反制重复技能。',
      '不用每回合都打伤害；防御攒共鸣、等 Boss 蓄力也是策略。',
    ],
  },
  {
    id: 'growth',
    title: '成长与进化 · 第二条路',
    subtitle: '熟练度到 3 级解锁进化；每条分支改变属性、技能和外观。',
    steps: [
      { title: '升级', text: '战斗经验按普通/精英/Boss 递增；重复刷同一节点收益递减。' },
      { title: '预览', text: '进化面板展示两条分支的属性差、技能和配色；可先问 AI 推荐。' },
      { title: '应用/回退', text: '应用消耗 1 信物；回退也消耗 1 信物，恢复原属性/技能/配色。' },
    ],
    tips: [
      '进化分支跟着物品组走（伞、面、花、渡、档案、灯、杯、包、桥、雨）。',
      '高级连携需要羁绊 ≥1/2；先看队伍缺什么，再决定分支。',
    ],
  },
  {
    id: 'quests',
    title: '任务与图鉴 · 下一步做什么',
    subtitle: '任务会自动记录进度；图鉴分发现/研究/掌握三层。',
    steps: [
      { title: '看指引', text: '顶部“下一步”告诉你现在最该做的一件事；任务页可让 AI 推荐。' },
      { title: '领奖励', text: '奖励只能领一次；经验奖励会直接给当前队伍升级。' },
      { title: '图鉴/分享', text: '筛选、只看进化、锁定保护；挑战码只含队伍摘要/区域/seed。' },
    ],
    tips: [
      '锁定卡不会被容量淘汰；容量满时优先淘汰未锁定卡。',
      '旧 P1 图鉴保持只读，可以在图鉴底部“觉醒”为 2.0 造物。',
    ],
  },
];

export type NextStep = {
  screen: 'capture' | 'party' | 'map' | 'quests' | 'codex';
  label: string;
  detail: string;
};

export function nextStepFor(save: SaveV2): NextStep {
  if (save.stats.captures === 0) {
    return { screen: 'capture', label: '捕获第一件物品', detail: '选一个内置样本，确认 2–3 条证据，召唤它。' };
  }
  if (save.party.ids.length < 3) {
    return { screen: 'party', label: '凑满三人队伍', detail: '从图鉴上阵一只，支援位越互补越好。' };
  }
  const active = getActiveRun(save);
  const claimable = QUEST_DEFS.filter((quest) => questState(quest, save) === 'complete');
  const canEvolveNow =
    save.tokens >= 1 && save.collection.some((item) => item.level >= 3 && !item.evolutionId);

  if (save.stats.battles > 0 && canEvolveNow) {
    return { screen: 'party', label: '有造物可以进化了', detail: '队伍页点「成长」，消耗 1 个信物选一条进化分支。' };
  }
  if (save.stats.battles > 0 && claimable.length > 0 && (!active || active.completed || claimable.length >= 2)) {
    return { screen: 'quests', label: `领取 ${claimable.length} 个任务奖励`, detail: '任务页有已达成的奖励，经验会直接分给当前队伍。' };
  }
  if (active && !active.completed) {
    const region = getRegion(active.regionId);
    return {
      screen: 'map',
      label: `继续探索 · ${region.name}`,
      detail: `当前节点 ${Math.min(active.nodeIndex + 1, region.nodes.length)} / ${region.nodes.length}；先看路线和 Boss 机制。`,
    };
  }
  const nextRegion = save.unlockedRegions.find((id) => !save.regionRuns[id]?.completed);
  if (nextRegion) {
    return { screen: 'map', label: `去「${getRegion(nextRegion).name}」`, detail: '点地图上的区域，开始新的五站路线。' };
  }
  if (claimable.length > 0) {
    return { screen: 'quests', label: `领取 ${claimable.length} 个任务奖励`, detail: '任务页有可领取奖励；经验会直接给队伍。' };
  }
  const canEvolve = save.collection.some((item) => item.level >= 3 && !item.evolutionId);
  if (canEvolve) {
    return { screen: 'party', label: '看看谁可以进化', detail: '队伍页点“成长”，选一条分支。' };
  }
  return { screen: 'quests', label: '看看下一步任务', detail: '任务页能告诉你还缺什么。' };
}

