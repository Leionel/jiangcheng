import type { Category, Element, Weather, WeatherId } from '../../shared/types';

/**
 * 属性体系：5 个角色主题，其中 3 个构成明确的循环克制闭环。
 * food → nature → water → food，克制 1.25，被克 0.80；structure / tool 为中立。
 * 这是游戏设计规则，不是现实物理规律（见规格书 §4.7.1）。
 */
export const ELEMENTS: Record<
  Element,
  { name: string; en: string; glyph: string; desc: string; color: string; tint: string }
> = {
  food: {
    name: '早味',
    en: 'food',
    glyph: '麵',
    desc: '取自过早摊子的能量，攻守都能咬得很实。',
    color: '#C0722A',
    tint: '#F6E5CE',
  },
  water: {
    name: '江流',
    en: 'water',
    glyph: '江',
    desc: '两江交汇处的流动感，擅长先手与续航。',
    color: '#2C6E8F',
    tint: '#DCEAF1',
  },
  nature: {
    name: '木叶',
    en: 'nature',
    glyph: '葉',
    desc: '校园植物与雨水的生长力，节奏越拖越顺。',
    color: '#4C7A3F',
    tint: '#DFEBD8',
  },
  structure: {
    name: '铁骨',
    en: 'structure',
    glyph: '構',
    desc: '老建筑与桥墩的骨架，中立但抗打。',
    color: '#6B5B4E',
    tint: '#E8E1D8',
  },
  tool: {
    name: '机巧',
    en: 'tool',
    glyph: '器',
    desc: '日常物件的小聪明，中立，讲究时机。',
    color: '#456A75',
    tint: '#DCE7E9',
  },
};

/** 克制闭环：key 克制 value */
const BEATS: Partial<Record<Element, Element>> = {
  food: 'nature',
  nature: 'water',
  water: 'food',
};

export function typeMultiplier(attacker: Element, defender: Element): number {
  if (BEATS[attacker] === defender) return 1.25;
  if (BEATS[defender] === attacker) return 0.8;
  return 1;
}

export function matchupLabel(mult: number): '克制' | '被克' | '中性' {
  if (mult > 1.01) return '克制';
  if (mult < 0.99) return '被克';
  return '中性';
}

export const CATEGORY_TO_ELEMENT: Record<Category, Element> = {
  food: 'food',
  water: 'water',
  building: 'structure',
  nature: 'nature',
  everyday: 'tool',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  food: '过早美食',
  water: '江河湖泊',
  building: '建筑与空间',
  nature: '校园自然',
  everyday: '日常物品',
};

export const ELEMENT_ORDER: Element[] = ['food', 'water', 'nature', 'structure', 'tool'];

/** 天气修正：只给对应属性技能 +3 威力，规则固定、逐场公布 */
export const WEATHERS: Record<WeatherId, Weather> = {
  sun: { id: 'sun', name: '晴日', boostElement: 'nature', desc: '晴日：木叶技能威力 +3' },
  fog: { id: 'fog', name: '江雾', boostElement: 'water', desc: '江雾：江流技能威力 +3' },
  smoke: { id: 'smoke', name: '烟火气', boostElement: 'food', desc: '烟火气：早味技能威力 +3' },
  wind: { id: 'wind', name: '穿堂风', boostElement: 'tool', desc: '穿堂风：机巧技能威力 +3' },
  night: { id: 'night', name: '灯下夜', boostElement: 'structure', desc: '灯下夜：铁骨技能威力 +3' },
};

export const WEATHER_LIST: Weather[] = [
  WEATHERS.sun,
  WEATHERS.fog,
  WEATHERS.smoke,
  WEATHERS.wind,
  WEATHERS.night,
];
