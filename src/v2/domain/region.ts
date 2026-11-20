import { hashString } from '../../shared/rng';
import { TAG_LABELS } from './tags';
import type {
  EnemyDef,
  EventChoice,
  GameEvent,
  RegionDef,
  RegionId,
  RegionRunState,
  Tag,
  V2Creature,
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
      {
        id: 'light',
        label: '尝试修好并点灯',
        desc: '下一场战斗开局 +2 共鸣',
        bonusTag: 'illuminate',
        bonusDesc: '队伍含「发光」物性：直接以信号强光开局，全队额外 +6 护盾',
        bonusEffect: { kind: 'startShield', amount: 6 },
        effect: { kind: 'runResonance', amount: 2 },
        flags: ['lamp_lit'],
      },
      { id: 'dark', label: '摸黑绕过去', desc: '捡到 2 份材料', effect: { kind: 'materials', amount: 2 } },
      {
        id: 'beacon',
        label: '接通自带光源照射对岸',
        desc: 'Boss 血量 -8%，并顺手捡到 1 份材料',
        requiresTag: 'illuminate',
        effect: { kind: 'bossHp', amount: -8 },
        bonusTag: 'illuminate',
        bonusEffect: { kind: 'materials', amount: 1 },
        flags: ['lamp_lit'],
      },
    ],
  },
  ev_ferry_repair: {
    id: 'ev_ferry_repair',
    title: '渡船缆绳松了',
    text: '老船工蹲在船头，缆绳磨得只剩一半。他问你要不要搭把手。',
    choices: [
      { id: 'repair', label: '帮忙修船', desc: '下一场战斗开局 +3 共鸣', effect: { kind: 'runResonance', amount: 3 }, flags: ['ferry_fixed'] },
      { id: 'rush', label: '先赶路', desc: '捡到 1 份材料', effect: { kind: 'materials', amount: 1 } },
    ],
  },
  ev_zao_steam: {
    id: 'ev_zao_steam',
    title: '早市蒸汽',
    text: '沿街的蒸笼一起掀盖，白汽把整条巷子蒸得发亮。',
    choices: [
      { id: 'join', label: '挤进蒸汽里取暖', desc: '下一场战斗开局 +2 共鸣', effect: { kind: 'runResonance', amount: 2 }, flags: ['warm'] },
      { id: 'pack', label: '打包两份带走', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
      {
        id: 'feast',
        label: '借「饱腹」物性一起加餐',
        desc: '队伍羁绊 +2 并回暖蓄势',
        requiresTag: 'nourish',
        effect: { kind: 'bond', amount: 2 },
        bonusTag: 'nourish',
        bonusEffect: { kind: 'runResonance', amount: 1 },
        flags: ['warm'],
      },
    ],
  },
  ev_zao_queue: {
    id: 'ev_zao_queue',
    title: '排队的人',
    text: '前面的人忘了带钱。摊主看着他，他身后的人看着摊主。',
    choices: [
      { id: 'help', label: '替他付了', desc: '队伍羁绊 +2', effect: { kind: 'bond', amount: 2 }, flags: ['zao_helped'] },
      { id: 'grab', label: '趁乱多拿一份', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_bridge_gap: {
    id: 'ev_bridge_gap',
    title: '断桥',
    text: '桥面断了一截。缺口下的江水很急，对面的灯还亮着。',
    choices: [
      {
        id: 'connect',
        label: '试着找木板搭桥',
        desc: '下一场战斗开局 +3 共鸣',
        bonusTag: 'carry',
        bonusDesc: '队伍含「装载」物性：护航过桥更稳当，全队额外 +6 护盾',
        bonusEffect: { kind: 'startShield', amount: 6 },
        effect: { kind: 'runResonance', amount: 3 },
        flags: ['bridge_connected'],
      },
      { id: 'detour', label: '沿桥墩绕过去', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
      {
        id: 'span',
        label: '用自带「连接」能力架起通道',
        desc: '开局 +4 共鸣，直接跨过断口',
        requiresTag: 'connect',
        effect: { kind: 'runResonance', amount: 4 },
        flags: ['bridge_connected'],
      },
    ],
  },
  ev_bridge_toolbox: {
    id: 'ev_bridge_toolbox',
    title: '工具箱',
    text: '桥工把工具箱落在了桥洞里，里面有一枚旧信物。',
    choices: [
      { id: 'repair', label: '把工具箱送回去', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 }, flags: ['bridge_fixed'] },
      { id: 'scrap', label: '拆下还能用的零件', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_sakura_petal: {
    id: 'ev_sakura_petal',
    title: '落樱',
    text: '花瓣落得很慢。每接住一片，就想起一个很久以前的名字。',
    choices: [
      { id: 'catch', label: '接住一片', desc: '队伍羁绊 +2', effect: { kind: 'bond', amount: 2 }, flags: ['petal_kept'] },
      { id: 'sweep', label: '扫成一小堆', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_sakura_photo: {
    id: 'ev_sakura_photo',
    title: '旧照片',
    text: '树下压着一张旧照片：五个人站在还没修好的桥上，笑得很亮。',
    choices: [
      { id: 'remember', label: '把照片收进手册', desc: '下一场战斗开局 +2 共鸣', effect: { kind: 'runResonance', amount: 2 }, flags: ['photo_kept'] },
      { id: 'leave', label: '留在原处', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
    ],
  },
  ev_thunder_blackout: {
    id: 'ev_thunder_blackout',
    title: '跳闸',
    text: '整座创想站突然断电，只有走廊尽头的线圈还在发蓝光。',
    choices: [
      { id: 'switch', label: '摸黑合闸', desc: '下一场战斗开局 +3 共鸣', effect: { kind: 'runResonance', amount: 3 }, flags: ['power_on'] },
      { id: 'scavenge', label: '拆几块电池', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_thunder_invention: {
    id: 'ev_thunder_invention',
    title: '旧发明',
    text: '工作台上躺着一台没做完的机器，标签上写着「给江城的回响」。',
    choices: [
      { id: 'start', label: '启动它', desc: '队伍羁绊 +2', effect: { kind: 'bond', amount: 2 }, flags: ['invention_started'] },
      { id: 'parts', label: '拆成零件', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
    ],
  },
  /* ---------------- 10 个额外事件：用于第二事件节点轮换与后续影响 ---------------- */
  ev_river_tide: {
    id: 'ev_river_tide',
    title: '潮位读数',
    text: '石阶上刻着旧潮位线。你蹲下去对照，发现今晚的水比刻痕高了一指。',
    choices: [
      { id: 'read', label: '记下潮位', desc: '下一场战斗全队 +8 护盾（潮汐预警）', effect: { kind: 'startShield', amount: 8 } },
      { id: 'ignore', label: '不看了', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_river_lantern: {
    id: 'ev_river_lantern',
    title: '对岸的灯',
    text: '你点过的信号灯还在亮。灯下多了一只旧灯笼，像是有人特意放在那里。',
    choices: [
      { id: 'return', label: '把灯笼挂回塔上', desc: 'Boss 血量 -10%（提前削弱）', requiresFlag: 'lamp_lit', effect: { kind: 'bossHp', amount: -10 } },
      { id: 'keep', label: '收进包里', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
    ],
  },
  ev_zao_second: {
    id: 'ev_zao_second',
    title: '第二碗',
    text: '摊主认出了你，什么也没问，又盛了一碗。面很烫，队伍安静了一会儿。',
    choices: [
      { id: 'eat', label: '坐下来吃完', desc: '下一场开局 +8 护盾', requiresFlag: 'zao_helped', effect: { kind: 'startShield', amount: 8 } },
      { id: 'pack', label: '打包带走', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_zao_spice: {
    id: 'ev_zao_spice',
    title: '最后一勺辣油',
    text: '老板把一勺辣油递过来：「大厨怕这个。」',
    choices: [
      { id: 'take', label: '收下辣油', desc: 'Boss 血量 -8%', effect: { kind: 'bossHp', amount: -8 } },
      { id: 'sell', label: '拿去换材料', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_bridge_rivet: {
    id: 'ev_bridge_rivet',
    title: '最后几颗铆钉',
    text: '桥工说，桥面还差几颗铆钉。你低头看，脚边正好有一盒。',
    choices: [
      { id: 'fix', label: '把铆钉补上', desc: '下一战全队 +8 护盾', effect: { kind: 'startShield', amount: 8 } },
      { id: 'keep', label: '留着当材料', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_bridge_blueprint: {
    id: 'ev_bridge_blueprint',
    title: '工图残页',
    text: '桥洞里压着半张工图，画着守卫的受力点。',
    choices: [
      { id: 'study', label: '把受力点记下来', desc: 'Boss 血量 -12%', requiresFlag: 'bridge_fixed', effect: { kind: 'bossHp', amount: -12 } },
      { id: 'burn', label: '烧掉取暖', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_sakura_letter: {
    id: 'ev_sakura_letter',
    title: '夹在花里的信',
    text: '一片花瓣背面写着小字：别把同一招用两次，它都记得。',
    choices: [
      { id: 'read', label: '把提醒告诉队伍', desc: '开局 +10 护盾（有备而来）', requiresFlag: 'petal_kept', effect: { kind: 'startShield', amount: 10 } },
      { id: 'keep', label: '把信收起来', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
    ],
  },
  ev_sakura_seed: {
    id: 'ev_sakura_seed',
    title: '一颗种子',
    text: '树根边有一颗没发芽的种子。档案员大概不会注意到它。',
    choices: [
      { id: 'plant', label: '种在坡上', desc: '下一场开局 +6 护盾', effect: { kind: 'startShield', amount: 6 } },
      { id: 'take', label: '带回去研究', desc: '获得 2 材料', effect: { kind: 'materials', amount: 2 } },
    ],
  },
  ev_thunder_battery: {
    id: 'ev_thunder_battery',
    title: '备用电池',
    text: '配电室里有一排备用电池，还有一张手写便条：「别让主脑知道」。',
    choices: [
      { id: 'install', label: '装到护盾回路', desc: '下一战全队 +10 护盾', effect: { kind: 'startShield', amount: 10 } },
      { id: 'take', label: '拆走两块', desc: '获得 3 材料', effect: { kind: 'materials', amount: 3 } },
    ],
  },
  ev_thunder_blueprint: {
    id: 'ev_thunder_blueprint',
    title: '主脑的图纸',
    text: '图纸上标着主脑的三个供电节点。记下其中一个，就够让它分神。',
    choices: [
      { id: 'cut', label: '标记节点', desc: 'Boss 血量 -12%', requiresFlag: 'invention_started', effect: { kind: 'bossHp', amount: -12 } },
      { id: 'sell', label: '卷起来换钱', desc: '获得 1 信物', effect: { kind: 'tokens', amount: 1 } },
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
    extraEvents: ['ev_river_tide', 'ev_river_lantern'],
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
    subtitle: '锅气、人声与一碗热干面的火候',
    accent: '#c58b25',
    bossId: 'zao_boss',
    landmark: '蒸笼与芝麻磨',
    blurb: '一条从清晨排到中午的巷子，所有锅都在同时冒气。',
    extraEvents: ['ev_zao_second', 'ev_zao_spice'],
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
    extraEvents: ['ev_bridge_rivet', 'ev_bridge_blueprint'],
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
    extraEvents: ['ev_sakura_seed', 'ev_sakura_letter'],
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
    extraEvents: ['ev_thunder_battery', 'ev_thunder_blueprint'],
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
    startShield: 0,
    bossHpDelta: 0,
    flags: [],
    eventChoices: {},
    log: [`进入${region.name}：${region.blurb}`],
  };
}

export function currentNodeIndex(run: RegionRunState): number {
  const region = getRegion(run.regionId);
  return Math.min(run.nodeIndex, region.nodes.length - 1);
}

export function currentNode(run: RegionRunState) {
  const region = getRegion(run.regionId);
  const node = region.nodes[currentNodeIndex(run)];
  // 第二事件节点从额外事件池中按 seed 轮换，保证同一区域每周目事件不同
  if (node.type === 'event' && node.id.endsWith('_2') && region.extraEvents?.length) {
    const pool = [node.eventId, ...region.extraEvents].filter((id): id is string => Boolean(id));
    const index = hashString(`${run.seed}|${node.id}`) % pool.length;
    return { ...node, eventId: pool[index] };
  }
  return node;
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

export function partyHasTag(party: V2Creature[] | undefined, tag: Tag): boolean {
  if (!party || party.length === 0) return false;
  return party.some((member) => member.evidence.some((item) => item.tag === tag));
}

export function choiceRequirementStatus(
  choice: EventChoice,
  run: RegionRunState | null | undefined,
  party?: V2Creature[],
): {
  available: boolean;
  lockedReason?: string;
  bonusMatched: boolean;
} {
  if (choice.requiresFlag && !(run?.flags ?? []).includes(choice.requiresFlag)) {
    return { available: false, lockedReason: '还缺少前置线索', bonusMatched: false };
  }
  if (choice.requiresTag && !partyHasTag(party, choice.requiresTag)) {
    return {
      available: false,
      lockedReason: `需队伍含【${TAG_LABELS[choice.requiresTag] ?? choice.requiresTag}】物性`,
      bonusMatched: false,
    };
  }
  const bonusMatched = Boolean(choice.bonusTag && partyHasTag(party, choice.bonusTag));
  return { available: true, bonusMatched };
}

export type EventChoiceResult = {
  run: RegionRunState;
  materialsGained: number;
  tokensGained: number;
  bondGained: number;
  bonusTriggered: boolean;
};

function applySingleEffect(
  next: RegionRunState,
  effect: EventChoice['effect'],
  acc: { bondGained: number },
) {
  if (effect.kind === 'runResonance') next.startResonance += effect.amount;
  if (effect.kind === 'materials') next.materials += effect.amount;
  if (effect.kind === 'tokens') next.tokens += effect.amount;
  if (effect.kind === 'bond') acc.bondGained += effect.amount;
  if (effect.kind === 'startShield') next.startShield = Math.min(30, next.startShield + effect.amount);
  if (effect.kind === 'bossHp') next.bossHpDelta += effect.amount;
  if (effect.kind === 'flag') next.flags.push(effect.flag);
}

/** 应用事件选择并返回细粒度收益（材料/信物/羁绊），供全局存档入账 */
export function applyEventChoiceDetailed(
  run: RegionRunState,
  eventId: string,
  choiceId: string,
  party?: V2Creature[],
): EventChoiceResult {
  const event = EVENTS[eventId];
  if (!event || run.eventChoices[eventId]) {
    return { run, materialsGained: 0, tokensGained: 0, bondGained: 0, bonusTriggered: false };
  }
  const choice = choiceById(event, choiceId);
  if (!choice) {
    return { run, materialsGained: 0, tokensGained: 0, bondGained: 0, bonusTriggered: false };
  }
  const status = choiceRequirementStatus(choice, run, party);
  if (!status.available) {
    return { run, materialsGained: 0, tokensGained: 0, bondGained: 0, bonusTriggered: false };
  }
  const next: RegionRunState = {
    ...run,
    eventChoices: { ...run.eventChoices, [eventId]: choiceId },
    startResonance: run.startResonance,
    startShield: run.startShield,
    bossHpDelta: run.bossHpDelta,
    flags: [...run.flags, ...(choice.flags ?? [])],
    materials: run.materials,
    tokens: run.tokens,
    log: [...run.log],
  };
  const acc = { bondGained: 0 };
  applySingleEffect(next, choice.effect, acc);
  const bonusTriggered = Boolean(status.bonusMatched && choice.bonusEffect);
  if (bonusTriggered && choice.bonusEffect) {
    applySingleEffect(next, choice.bonusEffect, acc);
  }
  next.flags = [...new Set(next.flags)];
  const bonusNote = bonusTriggered && choice.bonusTag ? `（触发「${TAG_LABELS[choice.bonusTag]}」共鸣）` : '';
  const bondNote = acc.bondGained > 0 ? ` · 队伍羁绊 +${acc.bondGained}` : '';
  next.log.push(`事件「${event.title}」：${choice.label}${bonusNote}${bondNote}`);
  return {
    run: next,
    materialsGained: next.materials - run.materials,
    tokensGained: next.tokens - run.tokens,
    bondGained: acc.bondGained,
    bonusTriggered,
  };
}

/** 应用事件选择：修改 run 的开局共鸣/材料/信物；同一事件只能做一次选择 */
export function applyEventChoice(
  run: RegionRunState,
  eventId: string,
  choiceId: string,
  party?: V2Creature[],
): RegionRunState {
  return applyEventChoiceDetailed(run, eventId, choiceId, party).run;
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




