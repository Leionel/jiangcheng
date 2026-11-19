import type { Enemy, Monster, SkillId } from '../../shared/types';
import { typeMultiplier } from './elements';

/**
 * 固定训练假想敌：同一套规则库，不使用 AI 自由生成的必杀技（规格书 §4.7.1）。
 * 三只敌人分别弱于三个闭环属性，鼓励玩家按自己精灵的属性换对手。
 */
export const ENEMIES: Enemy[] = [
  {
    id: 'fog',
    name: '江雾浮沫',
    element: 'water',
    stats: { hp: 86, attack: 26, defense: 10, speed: 17 },
    skills: ['BURST', 'QUICK'] as SkillId[],
    visualRecipe: {
      shape: 'blob',
      crest: 'wave',
      accessory: 'none',
      palette: ['#8FB6C6', '#2C6E8F', '#E8F2F5'],
    },
    taunt: '雾里看不清，它却总能先动。',
    weakness: 'BURST',
  },
  {
    id: 'tofu',
    name: '豆皮旋风',
    element: 'food',
    stats: { hp: 90, attack: 25, defense: 9, speed: 11 },
    skills: ['BURST', 'FEINT'] as SkillId[],
    visualRecipe: {
      shape: 'round',
      crest: 'sesame',
      accessory: 'none',
      palette: ['#D9A24C', '#8C5A24', '#F7E7C9'],
    },
    taunt: '油锅边转出来的一团热气，出手又急又刁。',
    weakness: 'BURST',
  },
  {
    id: 'branch',
    name: '枯枝傀儡',
    element: 'nature',
    stats: { hp: 94, attack: 23, defense: 14, speed: 7 },
    skills: ['BURST', 'GUARD'] as SkillId[],
    visualRecipe: {
      shape: 'spike',
      crest: 'petal',
      accessory: 'none',
      palette: ['#A9B98A', '#4C7A3F', '#EFF3E4'],
    },
    taunt: '站着不动，等你自己撞上来。',
    weakness: 'BURST',
  },
  {
    id: 'iron',
    name: '桥墩哨卫',
    element: 'structure',
    stats: { hp: 98, attack: 22, defense: 16, speed: 6 },
    skills: ['STRIKE', 'GUARD'] as SkillId[],
    visualRecipe: {
      shape: 'tall',
      crest: 'frame',
      accessory: 'none',
      palette: ['#9A9184', '#5B5348', '#EAE3D6'],
    },
    taunt: '中立属性，不占便宜也不吃亏，只看谁更有耐心。',
    weakness: 'STRIKE',
  },
];

export function getEnemy(id: string): Enemy | undefined {
  return ENEMIES.find((e) => e.id === id);
}

/** 属性克制提示：给玩家一个“换对手”的理由，而不是随机挨打 */
export function matchupHint(monster: Monster, enemy: Enemy): string {
  const mult = typeMultiplier(monster.element, enemy.element);
  if (mult > 1.01) return '属性克制，打得动';
  if (mult < 0.99) return '属性被克，谨慎';
  return '属性中性，靠招式';
}
