import type { Category, VisionSummary } from '../../shared/types';
import type {
  BuildPath,
  CategoryTag,
  FeatureEvidence,
  FunctionTag,
  ShapeTag,
  Tag,
  TextureTag,
  ThemeTag,
} from './types';

export const TAG_LABELS: Record<Tag, string> = {
  food: '食物',
  tool: '工具',
  nature: '自然',
  vehicle: '载具',
  building: '建筑',
  stationery: '文具',
  textile: '织物',
  toy: '玩具',
  other: '其他',
  round: '圆形',
  long: '细长',
  flat: '扁平',
  foldable: '可折叠',
  layered: '层叠',
  branched: '分叉',
  hollow: '中空',
  smooth: '光滑',
  rough: '粗糙',
  woven: '编织',
  soft: '柔软',
  rigid: '坚硬',
  liquid_like: '液态感',
  protect: '遮挡',
  carry: '承载',
  connect: '连接',
  bind: '缠绕',
  illuminate: '照明',
  nourish: '补给',
  propel: '推进',
  decorate: '装饰',
  river: '江流',
  rain: '雨',
  flower: '花',
  street_food: '过早',
  bridge: '桥',
  campus: '校园',
  invention: '发明',
  generic: '通用',
};

export const CATEGORY_TAGS: CategoryTag[] = [
  'food',
  'tool',
  'nature',
  'vehicle',
  'building',
  'stationery',
  'textile',
  'toy',
  'other',
];
export const SHAPE_TAGS: ShapeTag[] = ['round', 'long', 'flat', 'foldable', 'layered', 'branched', 'hollow'];
export const TEXTURE_TAGS: TextureTag[] = ['smooth', 'rough', 'woven', 'soft', 'rigid', 'liquid_like'];
export const FUNCTION_TAGS: FunctionTag[] = [
  'protect',
  'carry',
  'connect',
  'bind',
  'illuminate',
  'nourish',
  'propel',
  'decorate',
];
export const THEME_TAGS: ThemeTag[] = [
  'river',
  'rain',
  'flower',
  'street_food',
  'bridge',
  'campus',
  'invention',
  'generic',
];
export const ALL_TAGS: Tag[] = [
  ...CATEGORY_TAGS,
  ...SHAPE_TAGS,
  ...TEXTURE_TAGS,
  ...FUNCTION_TAGS,
  ...THEME_TAGS,
];

const TAG_SET = new Set<string>(ALL_TAGS);
export function isTag(value: unknown): value is Tag {
  return typeof value === 'string' && TAG_SET.has(value);
}
export function isCategoryTag(value: unknown): value is CategoryTag {
  return typeof value === 'string' && (CATEGORY_TAGS as string[]).includes(value);
}
export function isBuildPath(value: unknown): value is BuildPath {
  return value === 'guardian' || value === 'striker' || value === 'trickster' || value === 'support' || value === 'mover';
}

export const BUILD_PATHS: BuildPath[] = ['guardian', 'striker', 'trickster', 'support', 'mover'];

export const PATH_META: Record<
  BuildPath,
  { name: string; desc: string; supportId: string; color: string }
> = {
  guardian: {
    name: '守护',
    desc: '开盾、挡暴雨、护住全队',
    supportId: 'SUP_BRACE',
    color: '#1b4e75',
  },
  striker: {
    name: '强攻',
    desc: '蓄力爆发，抓破绽',
    supportId: 'SUP_FOCUS',
    color: '#c0722a',
  },
  trickster: {
    name: '诡计',
    desc: '标记、牵制、让对手难受',
    supportId: 'SUP_SCOUT',
    color: '#6b5b4e',
  },
  support: {
    name: '支援',
    desc: '治疗、解控、续节奏',
    supportId: 'SUP_MEND',
    color: '#2b7570',
  },
  mover: {
    name: '机动',
    desc: '换位、护航、拉开危险',
    supportId: 'SUP_FERRY',
    color: '#456a75',
  },
};

const PATH_TAG_SCORES: Record<BuildPath, Partial<Record<Tag, number>>> = {
  guardian: { protect: 4, rigid: 2, foldable: 2, rain: 1, building: 1, tool: 1 },
  striker: { illuminate: 3, invention: 2, food: 1, long: 1, rough: 1 },
  trickster: { bind: 4, layered: 2, street_food: 2, flower: 1, flat: 1, long: 1 },
  support: { nourish: 4, soft: 2, hollow: 2, stationery: 2, textile: 1, campus: 1 },
  mover: { carry: 4, vehicle: 4, propel: 2, river: 1, flat: 1, bridge: 1, woven: 1 },
};

export function pathScore(tags: FeatureEvidence[], path: BuildPath): number {
  let score = 0;
  for (const evidence of tags) {
    score += PATH_TAG_SCORES[path][evidence.tag] ?? 0;
    if (evidence.source === 'user_confirmed') score += 0.5;
  }
  return score;
}

/** 给玩家展示推荐路径（最多 3 条，主推荐排第一） */
export function recommendPaths(tags: FeatureEvidence[]): BuildPath[] {
  return [...BUILD_PATHS]
    .map((path) => ({ path, score: pathScore(tags, path) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.path);
}

const CATEGORY_TO_TAG: Record<Category, CategoryTag> = {
  food: 'food',
  water: 'other',
  building: 'building',
  nature: 'nature',
  everyday: 'tool',
};

const KEYWORD_RULES: Array<{ keywords: RegExp; tags: Tag[] }> = [
  { keywords: /伞|遮|罩|篷/, tags: ['tool', 'foldable', 'protect', 'rain'] },
  { keywords: /面|饭|汤|饺|包|饼|茶|酱|味|食|早/, tags: ['food', 'long', 'nourish', 'street_food'] },
  { keywords: /樱|花|叶|草|树|枝|藤/, tags: ['nature', 'flower', 'flat'] },
  { keywords: /船|渡|轮|艇|江|河|湖|浪/, tags: ['vehicle', 'carry', 'river'] },
  { keywords: /杯|瓶|罐|碗|盒|壶/, tags: ['tool', 'hollow', 'liquid_like'] },
  { keywords: /笔记本|电脑|键盘|书|纸|笔|本/, tags: ['stationery', 'layered', 'illuminate'] },
  { keywords: /包|袋|布|衣|围巾|帆布/, tags: ['textile', 'woven', 'carry'] },
  { keywords: /灯|光|亮|电|屏/, tags: ['tool', 'illuminate', 'rigid'] },
  { keywords: /桥|梁|墩|墙|楼|塔|轨/, tags: ['building', 'connect', 'bridge'] },
  { keywords: /雨|雾|潮|湿/, tags: ['rain', 'river'] },
];

/**
 * 本地标签推断（无 AI 时也能编译）。
 * 规则固定、可解释：关键词 → 标签；类别 → 类别标签。
 */
export function inferTags(vision: VisionSummary): FeatureEvidence[] {
  const text = `${vision.primaryObject} ${vision.features.join(' ')}`;
  const observed: FeatureEvidence[] = [];
  const seen = new Set<Tag>();
  for (const rule of KEYWORD_RULES) {
    if (!rule.keywords.test(text)) continue;
    for (const tag of rule.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      observed.push({
        tag,
        source: 'vision_observed',
        confidence: vision.confidence === 'high' ? 0.9 : vision.confidence === 'medium' ? 0.7 : 0.5,
        evidenceText: rule.keywords.source.replace(/[\\|]/g, '').slice(0, 8),
      });
    }
  }
  const categoryTag = CATEGORY_TO_TAG[vision.category];
  if (!seen.has(categoryTag)) {
    observed.unshift({
      tag: categoryTag,
      source: 'model_inferred',
      confidence: 0.5,
      evidenceText: '按画面类别推断',
    });
  }
  if (vision.features.some((feature) => /圆|球|团|圆润/.test(feature)) && !seen.has('round')) {
    observed.push({ tag: 'round', source: 'vision_observed', evidenceText: '圆润轮廓' });
  }
  if (vision.features.some((feature) => /长|细|柱|条/.test(feature)) && !seen.has('long')) {
    observed.push({ tag: 'long', source: 'vision_observed', evidenceText: '细长轮廓' });
  }
  return observed.slice(0, 7);
}

/** 合并 AI/本地/用户证据：用户确认 > 视觉观察 > 模型推断；同 tag 去重 */
export function mergeEvidence(
  observed: FeatureEvidence[],
  inferred: FeatureEvidence[],
  confirmed: FeatureEvidence[],
): FeatureEvidence[] {
  const byTag = new Map<Tag, FeatureEvidence>();
  const priority: Record<FeatureEvidence['source'], number> = {
    user_confirmed: 3,
    vision_observed: 2,
    model_inferred: 1,
  };
  for (const item of [...inferred, ...observed, ...confirmed]) {
    if (!isTag(item.tag)) continue;
    const previous = byTag.get(item.tag);
    if (!previous || priority[item.source] > priority[previous.source]) {
      byTag.set(item.tag, item);
    }
  }
  return [...byTag.values()];
}

/** 用户可确认/取消证据（最多 3 次修改由 UI 记录） */
export function toggleConfirmed(evidence: FeatureEvidence[], tag: Tag): FeatureEvidence[] {
  const exists = evidence.find((item) => item.tag === tag && item.source === 'user_confirmed');
  if (exists) return evidence.filter((item) => !(item.tag === tag && item.source === 'user_confirmed'));
  const confirmed: FeatureEvidence = { tag, source: 'user_confirmed', confidence: 1, evidenceText: '我确认' };
  return [...evidence.filter((item) => item.tag !== tag), confirmed].slice(0, 10);
}

export function evidenceLabel(evidence: FeatureEvidence): string {
  if (evidence.source === 'user_confirmed') return '✓ 我确认';
  if (evidence.source === 'vision_observed') return '◉ 看见';
  return '◌ 推断';
}

export function categoryTagFromP1(category: Category): CategoryTag {
  return CATEGORY_TO_TAG[category];
}
