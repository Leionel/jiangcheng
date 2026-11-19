import type {
  Category,
  Element,
  Monster,
  MonsterDraft,
  MonsterStats,
  VisionSummary,
  VisualRecipe,
} from '../../shared/types';
import { clamp, createRng, hashString } from '../../shared/rng';
import { CATEGORY_TO_ELEMENT } from './elements';
import { assignSkills } from './skills';

/** 职业化命名：把任意文本压成安全的展示字符串 */
export function cleanText(input: unknown, maxLen: number, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const stripped = input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    // 防止把模型输出当作可执行标记塞进界面
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return fallback;
  return Array.from(stripped).slice(0, maxLen).join('');
}

export function normalizeTraits(vision: VisionSummary): string {
  const parts = [
    vision.primaryObject,
    vision.category,
    [...vision.features].sort().join('/'),
    [...vision.colors].sort().join('/'),
  ];
  return parts.join('|').toLowerCase();
}

/** 各属性的基础倾向，保证同一张图在不同属性下也有可读的策略差异 */
const ELEMENT_BASE: Record<Element, { attack: number; defense: number; speed: number; hp: number }> = {
  food: { attack: 2, defense: -1, speed: 0, hp: 1 },
  water: { attack: -1, defense: 0, speed: 2, hp: 0 },
  nature: { attack: 0, defense: 0, speed: -1, hp: 3 },
  structure: { attack: -1, defense: 3, speed: -1, hp: 1 },
  tool: { attack: 1, defense: 1, speed: 1, hp: -1 },
};

export const STAT_RANGES = {
  hp: [65, 100] as const,
  attack: [18, 35] as const,
  defense: [5, 20] as const,
  speed: [5, 20] as const,
};

/**
 * 数值分配：预算固定 + 特征哈希决定权重 + 属性倾向做偏移。
 * 同一图片 + 同一 variant 永远得到同一套数值；AI 的“传说级”文案无法改数值。
 */
export function allocateStats(vision: VisionSummary, element: Element, variant = 0): MonsterStats {
  const seed = `${normalizeTraits(vision)}|v${variant}|${element}`;
  const rng = createRng(seed);
  const hash = hashString(seed);

  /**
   * 互补式分配：血量高的精灵攻击偏低，速度快则防御偏低。
   * 这样总量接近守恒，胜负主要由属性克制与出招决定，而不是抽到一张超模卡。
   * 取值仍落在规格书 §4.6 的区间内（HP 65–100 / ATK 18–35 / DEF 5–20 / SPD 5–20）。
   */
  const bulk = rng(); // 0 = 脆皮快攻，1 = 厚血慢攻
  const agility = rng(); // 0 = 高防低速，1 = 高速低防
  const jitter = (rng() - 0.5) * 3;

  const base = ELEMENT_BASE[element];

  const hp = Math.round(76 + bulk * 12 + base.hp);
  const attack = Math.round(33 - bulk * 8 + jitter + base.attack);
  const defense = Math.round(15 - agility * 5 + base.defense);
  const speed = Math.round(9 + agility * 7 + base.speed);

  return {
    hp: clamp(hp + (hash % 3), STAT_RANGES.hp[0], STAT_RANGES.hp[1]),
    attack: clamp(attack, STAT_RANGES.attack[0], STAT_RANGES.attack[1]),
    defense: clamp(defense, STAT_RANGES.defense[0], STAT_RANGES.defense[1]),
    speed: clamp(speed, STAT_RANGES.speed[0], STAT_RANGES.speed[1]),
  };
}

const DEFAULT_RECIPE: Record<Category, VisualRecipe> = {
  food: {
    shape: 'round',
    crest: 'sesame',
    accessory: 'bowl',
    palette: ['#D79A52', '#8A5A2B', '#F5E6CC'],
  },
  water: {
    shape: 'shard',
    crest: 'wave',
    accessory: 'none',
    palette: ['#3E7F9C', '#1F4E63', '#DCEBF1'],
  },
  building: {
    shape: 'tall',
    crest: 'frame',
    accessory: 'none',
    palette: ['#8B8172', '#5A5246', '#E6DFD2'],
  },
  nature: {
    shape: 'blob',
    crest: 'petal',
    accessory: 'none',
    palette: ['#8FB07A', '#4C7A3F', '#EDF3E6'],
  },
  everyday: {
    shape: 'blob',
    crest: 'gear',
    accessory: 'cup',
    palette: ['#8FA39A', '#4E5F57', '#E4EBE6'],
  },
};

export function defaultRecipeFor(category: Category): VisualRecipe {
  return { ...DEFAULT_RECIPE[category], palette: [...DEFAULT_RECIPE[category].palette] as [string, string, string] };
}

export function resolveElement(draft: MonsterDraft | null, vision: VisionSummary): Element {
  if (draft && draft.element) return draft.element;
  return CATEGORY_TO_ELEMENT[vision.category];
}

export function buildEvidenceTags(vision: VisionSummary): string[] {
  const tags = [
    vision.primaryObject,
    ...vision.features,
    ...vision.colors.slice(0, 2),
  ];
  return Array.from(new Set(tags)).slice(0, 6);
}

const NAME_HEAD: Record<Element, string[]> = {
  food: ['面', '浆', '焦', '糯', '酥'],
  water: ['浪', '舟', '潮', '渡', '涡'],
  nature: ['樱', '叶', '苔', '花', '藤'],
  structure: ['砖', '梁', '墩', '檐', '塔'],
  tool: ['杯', '伞', '钥', '灯', '绳'],
};

const NAME_TAIL = ['团团', '咕噜', '旋旋', '咚咚', '跃跃', '蹲蹲', '闪闪', '扑扑'];

/** 无 AI 时的确定性命名：属性首字 + 特征尾字，可复现 */
export function localName(vision: VisionSummary, element: Element): string {
  const rng = createRng(`${normalizeTraits(vision)}|name|${element}`);
  const head = NAME_HEAD[element][Math.floor(rng() * NAME_HEAD[element].length)];
  const tail = NAME_TAIL[Math.floor(rng() * NAME_TAIL.length)];
  return `${head}${tail}`;
}

const THEME_BY_ELEMENT: Record<Element, string[]> = {
  food: ['被热气熏出来的一团力气，闻着就想跑两步。', '把摊头的香味收进身体，靠着碳水和芝麻撑住场面。'],
  water: ['顺着水纹滑过来，动身总比别人早半拍。', '两江交汇处的潮气凝成的小家伙，擅长把力气卸掉。'],
  nature: ['生长比说话快，愿意把力气分给身边的东西。', '一场雨之后冒出来的，越拖越有精神。'],
  structure: ['老建筑的骨架太沉，索性自己变成一块会走的地基。', '砖缝里的灰浆凝成了它，站得稳、挨得住。'],
  tool: ['从日常物件里借来的小聪明，讲究出手的时机。', '被人用了很多年，学会了怎么挡、怎么溜。'],
};

export function localTheme(vision: VisionSummary, element: Element): string {
  const rng = createRng(`${normalizeTraits(vision)}|theme|${element}`);
  const pool = THEME_BY_ELEMENT[element];
  return pool[Math.floor(rng() * pool.length)];
}

export type BuildInput = {
  id: string;
  vision: VisionSummary;
  draft: MonsterDraft | null;
  source: 'demo' | 'upload';
  generationMode: Monster['generationMode'];
  variant?: number;
  createdAt?: number;
  model?: string;
};

/** 卡牌构建器：AI 只提供名称/文案/视觉配方，数值与技能由规则决定 */
export function buildMonster(input: BuildInput): Monster {
  const { vision, draft } = input;
  const element = resolveElement(draft, vision);
  const stats = allocateStats(vision, element, input.variant ?? 0);
  const preferred = draft?.preferredSkillIds ?? [];
  const skills = assignSkills(element, preferred);
  const recipe = draft?.visualRecipe ?? defaultRecipeFor(vision.category);

  return {
    id: input.id,
    name: cleanText(draft?.name, 8, localName(vision, element)),
    theme: cleanText(draft?.theme, 60, localTheme(vision, element)),
    element,
    source: input.source,
    stats,
    skills,
    visualRecipe: {
      shape: recipe.shape,
      crest: recipe.crest,
      accessory: recipe.accessory,
      palette: [...recipe.palette] as [string, string, string],
    },
    evidenceTags: buildEvidenceTags(vision),
    confidence: vision.confidence,
    generationMode: input.generationMode,
    ...(input.model ? { model: input.model } : {}),
    createdAt: input.createdAt ?? Date.now(),
  };
}
