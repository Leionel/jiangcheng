import type {
  EnemyDef,
  EventChoice,
  GameEvent,
  RegionDef,
  RegionId,
  RegionRunState,
} from './types';

/* ------------------------------- 敌人 ------------------------------- */

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
    bossRule: 'storm',
  },
  zao_dough: {
    id: 'zao_dough',
    name: '油饼团',
    element: 'food',
    maxHp: 58,
    atk: 19,
    def: 8,
    kind: 'normal',
    taunt: '刚出锅的油饼，脾气比油温还高。',
  },
  zao_sesame: {
    id: 'zao_sesame',
    name: '芝麻磨',
    element: 'food',
    maxHp: 82,
    atk: 23,
    def: 12,
    kind: 'elite',
    taunt: '石磨转个不停，芝麻香里藏着热浪。',
  },
  zao_boss: {
    id: 'zao_boss',
    name: '早味大厨',
    element: 'food',
    maxHp: 84,
    atk: 27,
    def: 10,
    kind: 'boss',
    taunt: '他把整条过早巷的锅气都收进了围裙。',
    bossRule: 'heat',
  },
  br_pier: {
    id: 'br_pier',
    name: '桥墩哨卫',
    element: 'structure',
    maxHp: 60,
    atk: 19,
    def: 10,
    kind: 'normal',
    taunt: '桥墩醒了，桥面就会抖三抖。',
  },
  br_chain: {
    id: 'br_chain',
    name: '锁链工头',
    element: 'structure',
    maxHp: 88,
    atk: 25,
    def: 13,
    kind: 'elite',
    taunt: '他手里的锁链，另一头拴着半座桥。',
  },
  br_boss: {
    id: 'br_boss',
    name: '桥影守卫',
    element: 'structure',
    maxHp: 74,
    atk: 28,
    def: 14,
    kind: 'boss',
    taunt: '桥影落下时，所有支援都会被拦在桥外。',
    bossRule: 'lock',
  },
  sk_petal: {
    id: 'sk_petal',
    name: '花影',
    element: 'nature',
    maxHp: 55,
    atk: 18,
    def: 7,
    kind: 'normal',
    taunt: '落下来的花瓣，拼出一张会走路的脸。',
  },
  sk_branch: {
    id: 'sk_branch',
    name: '花枝缠',
    element: 'nature',
    maxHp: 80,
    atk: 23,
    def: 11,
    kind: 'elite',
    taunt: '枝条比想象中更记仇。',
  },
  sk_boss: {
    id: 'sk_boss',
    name: '樱信档案员',
    element: 'nature',
    maxHp: 76,
    atk: 28,
    def: 12,
    kind: 'boss',
    taunt: '它会把你用过的每一招，都抄进樱花瓣里。',
    bossRule: 'record',
  },
  th_spark: {
    id: 'th_spark',
    name: '电火花',
    element: 'tool',
    maxHp: 62,
    atk: 21,
    def: 8,
    kind: 'normal',
    taunt: '一根没接地的电线，正在找它的插头。',
  },
  th_coil: {
    id: 'th_coil',
    name: '线圈巨像',
    element: 'tool',
    maxHp: 95,
    atk: 25,
    def: 12,
    kind: 'elite',
    taunt: '线圈一圈圈收紧，像在给整座站供电。',
  },
  th_boss: {
    id: 'th_boss',
    name: '造物夜主脑',
    element: 'tool',
    maxHp: 82,
    atk: 30,
    def: 12,
    kind: 'boss',
    taunt: '它把五个区的发明都接进了自己的梦里。',
    bossRule: 'thunder',
  },
};

/* ------------------------------- 事件 ------------------------------- */

export const EVENTS: Record<string, GameEvent> = {
  ev_fog_lamp: {
    id: 'ev_fog_lamp',
    title: '雾中信号灯',
    text: '渡口的信号灯坏了。雾里有一串忽明忽暗的光，像是有人在对岸等你。',
    choices: [
      { id: 'light', label: '用照明能力点灯', desc: '下一场战斗开局 +2 共鸣', effect: { kind: 'runResonance', amount: 2 } },
      { id: 'dark', label: '摸黑绕过去', desc: '捡到 2 份材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_ferry_repair: {
    id: 'ev_ferry_repair',
    title: '渡船缆绳松了',
    text: '老船工蹲在船头，缆绳磨得只剩一半。他问你要不要搭把手。',
    choices: [
      { id: 'repair', label: '帮忙修船', desc: '下一场战斗开局 +3 共鸣', effect: { kind: 'runResonance', amount: 3 } },
      { id: 'rush', label: '先赶路', desc: '捡到 1 份材料', effect: { kind: 'materials', amount: 1 } },
    ],
  },
  ev_zao_steam: {
    id: 'ev_zao_steam',
    title: '早市蒸汽',
    text: '沿街的蒸笼一起掀盖，白汽把整条巷子蒸得发亮。',
    choices: [
      { id: 'join', label: '挤进蒸汽里取暖', desc: '下一场战斗开局 +2 共鸣', effect: { kind: 'runResonance', amount: 2 } },
      { id: 'pack', label: '打包两份带走', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_zao_queue: {
    id: 'ev_zao_queue',
    title: '排队的人',
    text: '前面的人忘了带钱，摊主看着他，他身后的人都看着摊主。',
    choices: [
      { id: 'help', label: '替他付了', desc: '队伍羁绊 +2', effect: { kind: 'bond', amount: 2 } },
      { id: 'grab', label: '趁乱多拿一份', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_bridge_gap: {
    id: 'ev_bridge_gap',
    title: '断桥',
    text: '桥面断了一截。缺口下的江水很急，对面的灯还亮着。',
    choices: [
      { id: 'connect', label: '用连接能力搭桥', desc: '下一场战斗开局 +3 共鸣', effect: { kind: 'runResonance', amount: 3 } },
      { id: 'detour', label: '沿桥墩绕过去', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_bridge_toolbox: {
    id: 'ev_bridge_toolbox',
    title: '工具箱',
    text: '桥工把工具箱落在了桥洞里。里面有一枚旧信物。',
    choices: [
      { id: 'repair', label: '帮桥工把桥修好', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
      { id: 'scrap', label: '拆下还能用的零件', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_sakura_petal: {
    id: 'ev_sakura_petal',
    title: '落樱',
    text: '花瓣落得很慢。每接住一片，就想起一个很久以前的名字。',
    choices: [
      { id: 'catch', label: '接住一片', desc: '队伍羁绊 +2', effect: { kind: 'bond', amount: 2 } },
      { id: 'sweep', label: '扫成一小堆', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_sakura_photo: {
    id: 'ev_sakura_photo',
    title: '旧照片',
    text: '树下压着一张旧照片：五个人站在还没修好的桥上，笑得很亮。',
    choices: [
      { id: 'remember', label: '把照片收进手册', desc: '下一场战斗开局 +2 共鸣', effect: { kind: 'runResonance', amount: 2 } },
      { id: 'leave', label: '留在原处', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
    ],
  },
  ev_thunder_blackout: {
    id: 'ev_thunder_blackout',
    title: '跳闸',
    text: '整座创想站突然断电，只有走廊尽头的线圈还在发蓝光。',
    choices: [
      { id: 'switch', label: '摸黑合闸', desc: '下一场战斗开局 +3 共鸣', effect: { kind: 'runResonance', amount: 3 } },
      { id: 'scavenge', label: '拆几块电池', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_thunder_invention: {
    id: 'ev_thunder_invention',
    title: '旧发明',
    text: '工作台上躺着一台没做完的机器，标签上写着「给江城的回响」。',
    choices: [
      { id: 'start', label: '启动它', desc: '队伍羁绊 +2', effect: { kind: 'bond', amount: 2 } },
      { id: 'parts', label: '拆成零件', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
    ],
  },
};

/* ------------------------------- 区域 ------------------------------- */

export const REGIONS: Record<RegionId, RegionDef> = {
  river: {
    id: 'river',
    name: '江风渡口',
    subtitle: '雾、潮位与不肯停的暴雨',
    accent: '#1b4e75',
    bossId: 'riv_boss',
    landmark: '信号塔与渡船',
    blurb: '雾把江面压得很低，渡船还在等最后一班人。',
    nodes: [
      { id: 'river_0', type: 'event', title: '雾中信号灯', desc: '渡口的第一段路被雾吞掉了。', eventId: 'ev_fog_lamp' },
      { id: 'river_1', type: 'battle', title: '候船棚的潮气', desc: '一团潮气从长椅底下滚出来。', enemyId: 'riv_mist' },
      { id: 'river_2', type: 'event', title: '渡船缆绳', desc: '老船工的船还系在岸边。', eventId: 'ev_ferry_repair' },
      { id: 'river_3', type: 'elite', title: '旧码头的锚', desc: '生了锈的铁锚自己动了一下。', enemyId: 'riv_elite' },
      { id: 'river_4', type: 'boss', title: '风雨电台', desc: '信号塔顶，暴雨的播报员还在工作。', enemyId: 'riv_boss' },
    ],
  },
  zao: {
    id: 'zao',
    name: '过早巷',
    subtitle: '锅气、队伍与一碗热干面的火候',
    accent: '#c58b25',
    bossId: 'zao_boss',
    landmark: '蒸笼与芝麻磨',
    blurb: '一条从清晨排到中午的巷子，所有锅都在同时冒气。',
    unlockAfter: 'river',
    nodes: [
      { id: 'zao_0', type: 'event', title: '早市蒸汽', desc: '蒸笼一起掀盖，白汽把巷子蒸亮。', eventId: 'ev_zao_steam' },
      { id: 'zao_1', type: 'battle', title: '油饼团', desc: '一只刚出锅的油饼从案板上跳下来。', enemyId: 'zao_dough' },
      { id: 'zao_2', type: 'event', title: '排队的人', desc: '队伍从摊前拐进巷子深处。', eventId: 'ev_zao_queue' },
      { id: 'zao_3', type: 'elite', title: '芝麻磨', desc: '石磨自己转起来，芝麻香越来越烫。', enemyId: 'zao_sesame' },
      { id: 'zao_4', type: 'boss', title: '早味大厨', desc: '他把整条巷的锅气收进了围裙。', enemyId: 'zao_boss' },
    ],
  },
  bridge: {
    id: 'bridge',
    name: '桥影工坊',
    subtitle: '断桥、锁链与没有写完的工图',
    accent: '#6b5b4e',
    bossId: 'br_boss',
    landmark: '拱桥与锁链',
    blurb: '工坊建在桥洞里。每次涨潮，桥影都会把路切成两半。',
    unlockAfter: 'zao',
    nodes: [
      { id: 'bridge_0', type: 'event', title: '断桥', desc: '桥面断了一截，对面的灯还亮着。', eventId: 'ev_bridge_gap' },
      { id: 'bridge_1', type: 'battle', title: '桥墩哨卫', desc: '桥墩醒了，桥面开始抖。', enemyId: 'br_pier' },
      { id: 'bridge_2', type: 'event', title: '工具箱', desc: '桥工把工具箱落在了桥洞里。', eventId: 'ev_bridge_toolbox' },
      { id: 'bridge_3', type: 'elite', title: '锁链工头', desc: '锁链的另一头拴着半座桥。', enemyId: 'br_chain' },
      { id: 'bridge_4', type: 'boss', title: '桥影守卫', desc: '桥影落下时，支援都会被拦在桥外。', enemyId: 'br_boss' },
    ],
  },
  sakura: {
    id: 'sakura',
    name: '樱语山坡',
    subtitle: '旧照片、花影与被抄走的招式',
    accent: '#c06b82',
    bossId: 'sk_boss',
    landmark: '樱花树与档案柜',
    blurb: '山坡上的花每年只开一周，档案员会把每一招都记下来。',
    unlockAfter: 'bridge',
    nodes: [
      { id: 'sakura_0', type: 'event', title: '落樱', desc: '花瓣落得很慢。', eventId: 'ev_sakura_petal' },
      { id: 'sakura_1', type: 'battle', title: '花影', desc: '落下来的花瓣拼成一张脸。', enemyId: 'sk_petal' },
      { id: 'sakura_2', type: 'event', title: '旧照片', desc: '树下压着一张旧照片。', eventId: 'ev_sakura_photo' },
      { id: 'sakura_3', type: 'elite', title: '花枝缠', desc: '枝条比想象中更记仇。', enemyId: 'sk_branch' },
      { id: 'sakura_4', type: 'boss', title: '樱信档案员', desc: '它把你的每一招都抄进花瓣里。', enemyId: 'sk_boss' },
    ],
  },
  thunder: {
    id: 'thunder',
    name: '雷鸣创想站',
    subtitle: '跳闸、线圈与会做梦的主脑',
    accent: '#2b7570',
    bossId: 'th_boss',
    landmark: '线圈塔与主脑',
    blurb: '整座站靠一根没接地的电线供电，晚上会自己做梦。',
    unlockAfter: 'sakura',
    nodes: [
      { id: 'thunder_0', type: 'event', title: '跳闸', desc: '整座站突然断电。', eventId: 'ev_thunder_blackout' },
      { id: 'thunder_1', type: 'battle', title: '电火花', desc: '一根没接地的电线在找插头。', enemyId: 'th_spark' },
      { id: 'thunder_2', type: 'event', title: '旧发明', desc: '工作台上躺着一台没做完的机器。', eventId: 'ev_thunder_invention' },
      { id: 'thunder_3', type: 'elite', title: '线圈巨像', desc: '线圈一圈圈收紧。', enemyId: 'th_coil' },
      { id: 'thunder_4', type: 'boss', title: '造物夜主脑', desc: '它把五个区的发明接进了自己的梦里。', enemyId: 'th_boss' },
    ],
  },
};

export const REGION_ORDER: RegionId[] = ['river', 'zao', 'bridge', 'sakura', 'thunder'];

export function getRegion(regionId: RegionId): RegionDef {
  return REGIONS[regionId];
}

export function createRegionRun(regionId: RegionId, seed: string): RegionRunState {
  const region = getRegion(regionId);
  return {
    regionId,
    seed,
    nodeIndex: 0,
    materials: 0,
    tokens: 0,
    completed: false,
    startResonance: 2,
    eventChoices: {},
    log: [`进入${region.name}：${region.blurb}`],
  };
}

export function currentNodeIndex(run: RegionRunState): number {
  const region = getRegion(run.regionId);
  return Math.min(run.nodeIndex, region.nodes.length - 1);
}

export function currentNode(run: RegionRunState) {
  return getRegion(run.regionId).nodes[currentNodeIndex(run)];
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

/** 应用事件选择：修改 run 的开局共鸣/材料/信物/羁绊；同一事件只能做一次选择 */
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
    tokens: run.tokens,
    log: [...run.log],
  };
  if (choice.effect.kind === 'runResonance') next.startResonance += choice.effect.amount;
  if (choice.effect.kind === 'materials') next.materials += choice.effect.amount;
  if (choice.effect.kind === 'tokens') next.tokens += choice.effect.amount;
  next.log.push(`事件「${event.title}」：${choice.label}`);
  return next;
}

export function advanceEventNode(run: RegionRunState): RegionRunState {
  const region = getRegion(run.regionId);
  if (run.nodeIndex >= region.nodes.length - 1) return run;
  return { ...run, nodeIndex: run.nodeIndex + 1, log: [...run.log, '继续向前。'] };
}

/** 战斗胜利后：发奖励并推进节点 */
export function completeNode(run: RegionRunState, rewards: { materials: number; tokens: number }): RegionRunState {
  const region = getRegion(run.regionId);
  const node = currentNode(run);
  const next: RegionRunState = {
    ...run,
    materials: run.materials + rewards.materials,
    tokens: run.tokens + rewards.tokens,
    log: [...run.log, `通过「${node.title}」，获得材料 ${rewards.materials}${rewards.tokens ? `、信物 ${rewards.tokens}` : ''}`],
  };
  if (node.type === 'boss' && node.id.endsWith('_4')) {
    next.completed = true;
    next.log.push(`${region.name}的 Boss 退场了，区域记录完成。`);
    return next;
  }
  next.nodeIndex = Math.min(run.nodeIndex + 1, region.nodes.length - 1);
  return next;
}

export function nodeProgress(run: RegionRunState): { current: number; total: number } {
  const region = getRegion(run.regionId);
  return { current: Math.min(run.nodeIndex + 1, region.nodes.length), total: region.nodes.length };
}

export function regionComplete(run: RegionRunState): boolean {
  return run.completed;
}

/** 计算区域解锁状态：第一区默认解锁，其余需要前置区完成 */
export function computeUnlockedRegions(runs: Partial<Record<RegionId, RegionRunState>>): RegionId[] {
  const cleared = new Set<RegionId>(REGION_ORDER.filter((id) => runs[id]?.completed));
  return REGION_ORDER.filter((id) => {
    const region = REGIONS[id];
    return !region.unlockAfter || cleared.has(region.unlockAfter);
  });
}

