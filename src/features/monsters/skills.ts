import type { Element, SkillId } from '../../shared/types';

export type Skill = {
  id: SkillId;
  name: string;
  power: number;
  kind: 'attack' | 'guard' | 'heal' | 'buff';
  /** 是否吃本系属性（决定属性克制与天气加成） */
  elemental: boolean;
  priority: number;
  limit?: 'once';
  short: string;
  effect: string;
};

/**
 * 固定技能白名单。AI 只能在这些技能里挑选，不能自由发明必杀技。
 * 数值为规格书 §4.7.1 的初值。
 */
export const SKILLS: Record<SkillId, Skill> = {
  STRIKE: {
    id: 'STRIKE',
    name: '基础冲击',
    power: 18,
    kind: 'attack',
    elemental: false,
    priority: 0,
    short: '稳',
    effect: '无附加效果，稳定可用的通用攻击。',
  },
  GUARD: {
    id: 'GUARD',
    name: '稳固防御',
    power: 0,
    kind: 'guard',
    elemental: false,
    priority: 1,
    short: '守',
    effect: '本回合所受伤害减半。',
  },
  BURST: {
    id: 'BURST',
    name: '元素爆发',
    power: 24,
    kind: 'attack',
    elemental: true,
    priority: 0,
    short: '爆',
    effect: '本系高威力技能，受属性克制与天气修正影响。',
  },
  RECOVER: {
    id: 'RECOVER',
    name: '小憩回血',
    power: 0,
    kind: 'heal',
    elemental: false,
    priority: 2,
    short: '憩',
    effect: '回复 16 HP，单局限用一次。',
  },
  QUICK: {
    id: 'QUICK',
    name: '抢先一步',
    power: 15,
    kind: 'attack',
    elemental: false,
    priority: 3,
    short: '快',
    effect: '本回合优先行动（先手判定优先于速度）。',
  },
  FEINT: {
    id: 'FEINT',
    name: '佯攻',
    power: 12,
    kind: 'attack',
    elemental: false,
    priority: 0,
    short: '佯',
    effect: '下一次攻击威力 +8（不可叠加）。',
  },
};

export const SKILL_IDS: SkillId[] = ['STRIKE', 'GUARD', 'BURST', 'RECOVER', 'QUICK', 'FEINT'];

export function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && (SKILL_IDS as string[]).includes(value);
}

/** 是否能造成伤害（佯攻 kind 为 buff，但确实造成 12 点伤害） */
export function dealsDamage(id: SkillId): boolean {
  const skill = SKILLS[id];
  return Boolean(skill) && skill.power > 0;
}

/**
 * 技能槽分配：每只精灵 2 个技能，规则引擎按属性给出「本系攻击 + 一个工具箱技能」。
 * 若候选全部无伤害，则强制补一个可造成伤害的技能。
 */
export function assignSkills(element: Element, preferred: SkillId[]): [SkillId, SkillId] {
  const utilityByElement: Record<Element, SkillId[]> = {
    food: ['RECOVER', 'GUARD', 'FEINT'],
    water: ['QUICK', 'GUARD', 'FEINT'],
    nature: ['GUARD', 'RECOVER', 'QUICK'],
    structure: ['GUARD', 'STRIKE', 'FEINT'],
    tool: ['QUICK', 'GUARD', 'STRIKE'],
  };

  // 去重，同时保留 AI 的偏好顺序
  const clean = preferred.filter(isSkillId).filter((id, index, arr) => arr.indexOf(id) === index);

  /**
   * 第一槽固定为本系爆发：这是强度下限，避免模型给出「基础冲击 + 防御」这种打不动的组合。
   * 第二槽采纳 AI 的偏好（防御 / 回复 / 先手 / 佯攻 / 基础冲击），没有偏好时按属性兜底。
   */
  const first: SkillId = 'BURST';
  const second: SkillId =
    clean.find((id) => id !== first) ??
    utilityByElement[element].find((id) => id !== first) ??
    'STRIKE';

  return [first, second];
}

/** 各属性特征技能，用于本地（无 AI）命名与卡面风格文案 */
export const ELEMENT_SIGNATURE_SKILL: Record<Element, SkillId> = {
  food: 'BURST',
  water: 'BURST',
  nature: 'BURST',
  structure: 'STRIKE',
  tool: 'QUICK',
};
