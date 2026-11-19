import type { EvolutionGroup } from '../domain/types';

/**
 * Batch 2：6 组真实物品的进化分支。
 * 每组两条路；模块必须来自白名单，外观只换配色与图层，不改骨架。
 */
export const EVOLUTION_GROUPS: EvolutionGroup[] = [
  {
    id: 'umbrella',
    name: '伞骨系',
    sampleIds: ['yusan'],
    tag: 'protect',
    branches: [
      {
        id: 'umbrella_guard',
        groupId: 'umbrella',
        name: '伞骨卫士',
        desc: '把骨架撑成一面小城墙：更厚，更稳。',
        path: 'guardian',
        statBonus: { hp: 14, atk: 1, def: 3, spd: 0 },
        moduleId: 'A20',
        palette: ['#3B4A63', '#1B4E75', '#D9DEE6'],
        visualLayers: ['canopy', 'guard-ribs'],
      },
      {
        id: 'umbrella_striker',
        groupId: 'umbrella',
        name: '雨幕刺客',
        desc: '收伞、贴近、在雨声里出手。',
        path: 'striker',
        statBonus: { hp: 6, atk: 4, def: 0, spd: 2 },
        moduleId: 'A16',
        palette: ['#3B4A63', '#E2402B', '#D9DEE6'],
        visualLayers: ['canopy', 'rain-blade'],
      },
    ],
  },
  {
    id: 'noodle',
    name: '早味系',
    sampleIds: ['reganmian'],
    tag: 'nourish',
    branches: [
      {
        id: 'noodle_blaster',
        groupId: 'noodle',
        name: '芝麻爆弹',
        desc: '把整碗芝麻酱拌成一颗会炸的香。',
        path: 'striker',
        statBonus: { hp: 6, atk: 5, def: 0, spd: 1 },
        moduleId: 'A07',
        palette: ['#C9822F', '#E2402B', '#F2D9A6'],
        visualLayers: ['sesame-shell', 'cannon'],
      },
      {
        id: 'noodle_guard',
        groupId: 'noodle',
        name: '热干面盾卫',
        desc: '用一碗面的热度挡住整条巷子的风。',
        path: 'guardian',
        statBonus: { hp: 16, atk: 2, def: 3, spd: 0 },
        moduleId: 'A17',
        palette: ['#C9822F', '#1B4E75', '#F2D9A6'],
        visualLayers: ['sesame-shell', 'steam-shield'],
      },
    ],
  },
  {
    id: 'blossom',
    name: '樱语系',
    sampleIds: ['yinghua'],
    tag: 'flower',
    branches: [
      {
        id: 'blossom_healer',
        groupId: 'blossom',
        name: '樱吹雪',
        desc: '花瓣落在伤口上，疼痛就轻了一点。',
        path: 'support',
        statBonus: { hp: 10, atk: 1, def: 2, spd: 2 },
        moduleId: 'A19',
        palette: ['#D4798F', '#FAF8EF', '#7A4A5A'],
        visualLayers: ['petal-cloud', 'healing-bloom'],
      },
      {
        id: 'blossom_blade',
        groupId: 'blossom',
        name: '花刃',
        desc: '谁规定花瓣不能当刀用。',
        path: 'striker',
        statBonus: { hp: 4, atk: 5, def: 0, spd: 3 },
        moduleId: 'A22',
        palette: ['#D4798F', '#E2402B', '#7A4A5A'],
        visualLayers: ['petal-cloud', 'blade-petal'],
      },
    ],
  },
  {
    id: 'ferry',
    name: '渡水系',
    sampleIds: ['lundu'],
    tag: 'river',
    branches: [
      {
        id: 'ferry_mover',
        groupId: 'ferry',
        name: '渡江侠',
        desc: '江面再宽，也只是一次换位。',
        path: 'mover',
        statBonus: { hp: 10, atk: 3, def: 1, spd: 4 },
        moduleId: 'A16',
        palette: ['#1B4E75', '#8FB6C6', '#D9DEE6'],
        visualLayers: ['hull', 'wake'],
      },
      {
        id: 'ferry_support',
        groupId: 'ferry',
        name: '夜航灯',
        desc: '把自己的灯举高，后面的人就不会走散。',
        path: 'support',
        statBonus: { hp: 12, atk: 1, def: 2, spd: 3 },
        moduleId: 'A20',
        palette: ['#1B4E75', '#E9B93C', '#D9DEE6'],
        visualLayers: ['hull', 'lantern'],
      },
    ],
  },
  {
    id: 'archive',
    name: '档案系',
    sampleIds: ['bijiben', 'shuibei'],
    tag: 'stationery',
    branches: [
      {
        id: 'archive_trickster',
        groupId: 'archive',
        name: '纸页术士',
        desc: '翻一页，改一行，战局就换了写法。',
        path: 'trickster',
        statBonus: { hp: 6, atk: 3, def: 1, spd: 4 },
        moduleId: 'A22',
        palette: ['#F2E6C9', '#1B4E75', '#6E5A3A'],
        visualLayers: ['pages', 'ink-swirl'],
      },
      {
        id: 'archive_guard',
        groupId: 'archive',
        name: '档案守卫',
        desc: '把每一条记录都压成一面盾。',
        path: 'guardian',
        statBonus: { hp: 15, atk: 2, def: 3, spd: 0 },
        moduleId: 'A13',
        palette: ['#F2E6C9', '#6B5B4E', '#6E5A3A'],
        visualLayers: ['pages', 'seal-shield'],
      },
    ],
  },
  {
    id: 'lamp',
    name: '灯火系',
    sampleIds: ['ludeng', 'fanbu'],
    tag: 'illuminate',
    branches: [
      {
        id: 'lamp_keeper',
        groupId: 'lamp',
        name: '灯下守夜',
        desc: '它不追人，只把光留在原地。',
        path: 'guardian',
        statBonus: { hp: 18, atk: 2, def: 4, spd: 0 },
        moduleId: 'A20',
        palette: ['#E9B93C', '#1B4E75', '#3B3A33'],
        visualLayers: ['lamp-post', 'halo'],
      },
      {
        id: 'lamp_hunter',
        groupId: 'lamp',
        name: '霓虹猎手',
        desc: '灯灭之前，它已经换到了下一个位置。',
        path: 'striker',
        statBonus: { hp: 5, atk: 5, def: 0, spd: 3 },
        moduleId: 'A21',
        palette: ['#E9B93C', '#E2402B', '#2B7570'],
        visualLayers: ['neon-coil', 'spark'],
      },
    ],
  },
];

export const EVOLUTION_BY_ID = new Map(
  EVOLUTION_GROUPS.flatMap((group) => group.branches.map((branch) => [branch.id, branch] as const)),
);

export function evolutionBranchName(evolutionId: string | undefined): string | null {
  if (!evolutionId) return null;
  return EVOLUTION_BY_ID.get(evolutionId)?.name ?? null;
}
