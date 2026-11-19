import type { QuestDef, SaveV2 } from '../domain/types';
import { bondLevel } from '../domain/bonds';
import { REGION_ORDER } from '../domain/region';

const cleared = (save: SaveV2, id: (typeof REGION_ORDER)[number]) => Boolean(save.regionRuns[id]?.completed);

export const QUEST_DEFS: QuestDef[] = [
  {
    id: 'q_first_summon',
    title: '第一次定形',
    desc: '让一件日常物品成为回响灵。',
    kind: 'collection',
    target: 1,
    progress: (save) => save.stats.captures,
    reward: { materials: 2, xp: 8 },
  },
  {
    id: 'q_first_win',
    title: '第一场胜仗',
    desc: '在探索战里赢下一场。',
    kind: 'story',
    target: 1,
    progress: (save) => save.stats.wins,
    reward: { materials: 2, xp: 8 },
  },
  {
    id: 'q_river_clear',
    title: '渡口的风',
    desc: '击破风雨电台，完成江风渡口。',
    kind: 'story',
    target: 1,
    progress: (save) => (cleared(save, 'river') ? 1 : 0),
    reward: { tokens: 1, materials: 2 },
  },
  {
    id: 'q_zao_clear',
    title: '过早巷的锅气',
    desc: '击破早味大厨，完成过早巷。',
    kind: 'story',
    target: 1,
    progress: (save) => (cleared(save, 'zao') ? 1 : 0),
    reward: { tokens: 1, materials: 2 },
    prereq: ['q_river_clear'],
  },
  {
    id: 'q_bridge_clear',
    title: '桥影之下',
    desc: '击破桥影守卫，完成桥影工坊。',
    kind: 'story',
    target: 1,
    progress: (save) => (cleared(save, 'bridge') ? 1 : 0),
    reward: { tokens: 1, materials: 2 },
    prereq: ['q_zao_clear'],
  },
  {
    id: 'q_sakura_clear',
    title: '樱花档案',
    desc: '击破樱信档案员，完成樱语山坡。',
    kind: 'story',
    target: 1,
    progress: (save) => (cleared(save, 'sakura') ? 1 : 0),
    reward: { tokens: 1, materials: 2 },
    prereq: ['q_bridge_clear'],
  },
  {
    id: 'q_thunder_clear',
    title: '夜主脑',
    desc: '击破造物夜主脑，完成雷鸣创想站。',
    kind: 'story',
    target: 1,
    progress: (save) => (cleared(save, 'thunder') ? 1 : 0),
    reward: { tokens: 2, materials: 3 },
    prereq: ['q_sakura_clear'],
  },
  {
    id: 'q_bond',
    title: '三人成行',
    desc: '把队伍羁绊带到「搭把手」。',
    kind: 'growth',
    target: 1,
    progress: (save) => bondLevel(save.bondPoints),
    reward: { materials: 3, xp: 10 },
  },
  {
    id: 'q_evolve',
    title: '第二条路',
    desc: '完成一次进化。',
    kind: 'growth',
    target: 1,
    progress: (save) => save.stats.evolutions,
    reward: { tokens: 1, materials: 2 },
  },
  {
    id: 'q_link',
    title: '一次连携',
    desc: '在战斗中使用一次连携。',
    kind: 'challenge',
    target: 1,
    progress: (save) => save.stats.links,
    reward: { materials: 3 },
  },
  {
    id: 'q_collection',
    title: '十件回响',
    desc: '图鉴收集到 10 只造物。',
    kind: 'collection',
    target: 10,
    progress: (save) => save.collection.length,
    reward: { materials: 5, tokens: 1 },
  },
  {
    id: 'q_bosses',
    title: '连战三场',
    desc: '累计击破 3 个区域 Boss。',
    kind: 'challenge',
    target: 3,
    progress: (save) => save.stats.bosses,
    reward: { tokens: 2, materials: 3 },
  },
];

export const QUEST_BY_ID = new Map(QUEST_DEFS.map((quest) => [quest.id, quest]));

export type QuestState = 'locked' | 'active' | 'complete' | 'claimed';

export function questState(quest: QuestDef, save: SaveV2): QuestState {
  if (save.quests[quest.id]?.claimed) return 'claimed';
  const locked = (quest.prereq ?? []).some((id) => !save.quests[id]?.claimed);
  if (locked) return 'locked';
  return quest.progress(save) >= quest.target ? 'complete' : 'active';
}

export function questProgress(quest: QuestDef, save: SaveV2): number {
  return Math.min(quest.target, Math.max(0, quest.progress(save)));
}

export function claimQuest(save: SaveV2, questId: string): SaveV2 {
  const quest = QUEST_BY_ID.get(questId);
  if (!quest) return save;
  if (save.quests[questId]?.claimed) return save;
  if (questState(quest, save) !== 'complete') return save;
  return {
    ...save,
    materials: save.materials + (quest.reward.materials ?? 0),
    tokens: save.tokens + (quest.reward.tokens ?? 0),
    quests: { ...save.quests, [questId]: { claimed: true, progress: quest.target } },
    stats: { ...save.stats, questsClaimed: save.stats.questsClaimed + 1 },
  };
}

export function completedQuestCount(save: SaveV2): number {
  return QUEST_DEFS.filter((quest) => save.quests[quest.id]?.claimed).length;
}
