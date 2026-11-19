import type { EnemyDef, EventChoice, GameEvent, RegionDef, RegionRunState } from './types';

export const ENEMIES: Record<string, EnemyDef> = {
  riv_mist: {
    id: 'riv_mist',
    name: '江雾浮沫',
    element: 'water',
    maxHp: 52,
    atk: 18,
    def: 8,
    kind: 'normal',
    taunt: '雾里看不清，它却总能先动。',
  },
  riv_elite: {
    id: 'riv_elite',
    name: '潮汐铁锚',
    element: 'structure',
    maxHp: 78,
    atk: 24,
    def: 12,
    kind: 'elite',
    taunt: '沉在江底很多年，锚爪上还挂着旧缆绳。',
  },
  riv_boss: {
    id: 'riv_boss',
    name: '风雨电台',
    element: 'water',
    maxHp: 72,
    atk: 28,
    def: 12,
    kind: 'boss',
    taunt: '它还在播报那场没有停过的暴雨。',
  },
};

export const EVENTS: Record<string, GameEvent> = {
  ev_fog_lamp: {
    id: 'ev_fog_lamp',
    title: '雾中信号灯',
    text: '渡口的信号灯坏了。雾里有一串忽明忽暗的光，像是有人在对岸等你。',
    choices: [
      {
        id: 'light',
        label: '用照明能力点灯',
        desc: '下一场战斗开局 +2 共鸣',
        effect: { kind: 'runResonance', amount: 2 },
      },
      {
        id: 'dark',
        label: '摸黑绕过去',
        desc: '捡到 2 份材料',
        effect: { kind: 'materials', amount: 2 },
      },
    ],
  },
  ev_ferry_repair: {
    id: 'ev_ferry_repair',
    title: '渡船缆绳松了',
    text: '老船工蹲在船头，缆绳磨得只剩一半。他问你要不要搭把手。',
    choices: [
      {
        id: 'repair',
        label: '帮忙修船',
        desc: '下一场战斗开局 +3 共鸣',
        effect: { kind: 'runResonance', amount: 3 },
      },
      {
        id: 'rush',
        label: '先赶路',
        desc: '捡到 1 份材料',
        effect: { kind: 'materials', amount: 1 },
      },
    ],
  },
};

export const RIVER_REGION: RegionDef = {
  id: 'river',
  name: '江风渡口',
  subtitle: '雾、潮位与不肯停的暴雨',
  accent: '#1b4e75',
  bossId: 'riv_boss',
  nodes: [
    {
      id: 'river_0',
      type: 'event',
      title: '雾中信号灯',
      desc: '渡口的第一段路被雾吞掉了。',
      eventId: 'ev_fog_lamp',
    },
    {
      id: 'river_1',
      type: 'battle',
      title: '候船棚的潮气',
      desc: '一团潮气从长椅底下滚出来。',
      enemyId: 'riv_mist',
    },
    {
      id: 'river_2',
      type: 'event',
      title: '渡船缆绳',
      desc: '老船工的船还系在岸边。',
      eventId: 'ev_ferry_repair',
    },
    {
      id: 'river_3',
      type: 'elite',
      title: '旧码头的锚',
      desc: '生了锈的铁锚自己动了一下。',
      enemyId: 'riv_elite',
    },
    {
      id: 'river_4',
      type: 'boss',
      title: '风雨电台',
      desc: '信号塔顶，暴雨的播报员还在工作。',
      enemyId: 'riv_boss',
    },
  ],
};

export function createRegionRun(seed: string): RegionRunState {
  return {
    regionId: 'river',
    seed,
    nodeIndex: 0,
    materials: 0,
    tokens: 0,
    completed: false,
    startResonance: 2,
    eventChoices: {},
    log: ['进入江风渡口：雾很大，潮位正在上涨。'],
  };
}

export function currentNodeIndex(run: RegionRunState): number {
  return Math.min(run.nodeIndex, RIVER_REGION.nodes.length - 1);
}

export function currentNode(run: RegionRunState) {
  return RIVER_REGION.nodes[currentNodeIndex(run)];
}

export function getEvent(id: string | undefined): GameEvent | null {
  if (!id) return null;
  return EVENTS[id] ?? null;
}

export function getEnemy(id: string | undefined): EnemyDef | null {
  if (!id) return null;
  return ENEMIES[id] ?? null;
}

export function choiceById(event: GameEvent, choiceId: string): EventChoice | null {
  return event.choices.find((choice) => choice.id === choiceId) ?? null;
}

/** 应用事件选择：修改 run 的开局共鸣/材料；同一事件只能做一次选择 */
export function applyEventChoice(run: RegionRunState, eventId: string, choiceId: string): RegionRunState {
  const event = EVENTS[eventId];
  if (!event || run.eventChoices[eventId]) return run;
  const choice = choiceById(event, choiceId);
  if (!choice) return run;
  const next: RegionRunState = {
    ...run,
    eventChoices: { ...run.eventChoices, [eventId]: choiceId },
    startResonance: run.startResonance,
    materials: run.materials,
    log: [...run.log],
  };
  if (choice.effect.kind === 'runResonance') next.startResonance += choice.effect.amount;
  if (choice.effect.kind === 'materials') next.materials += choice.effect.amount;
  next.log.push(`事件「${event.title}」：${choice.label}`);
  return next;
}

/** 事件节点处理完选择后推进（不产生战斗奖励） */
export function advanceEventNode(run: RegionRunState): RegionRunState {
  if (run.nodeIndex >= RIVER_REGION.nodes.length - 1) return run;
  return { ...run, nodeIndex: run.nodeIndex + 1, log: [...run.log, '继续向渡口深处走。'] };
}

/** 战斗胜利后：发奖励并推进节点 */
export function completeNode(run: RegionRunState, rewards: { materials: number; tokens: number }): RegionRunState {
  const node = currentNode(run);
  const next: RegionRunState = {
    ...run,
    materials: run.materials + rewards.materials,
    tokens: run.tokens + rewards.tokens,
    log: [...run.log, `通过「${node.title}」，获得材料 ${rewards.materials}${rewards.tokens ? `、信物 ${rewards.tokens}` : ''}`],
  };
  if (node.type === 'boss') {
    next.completed = true;
    next.log.push('风雨电台停止播报，江风渡口恢复了潮声。');
    return next;
  }
  next.nodeIndex = Math.min(run.nodeIndex + 1, RIVER_REGION.nodes.length - 1);
  return next;
}

export function nodeProgress(run: RegionRunState): { current: number; total: number } {
  return { current: Math.min(run.nodeIndex + 1, RIVER_REGION.nodes.length), total: RIVER_REGION.nodes.length };
}

export function regionComplete(run: RegionRunState): boolean {
  return run.completed;
}
