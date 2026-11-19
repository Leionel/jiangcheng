import type { Element, VisionSummary, VisualRecipe } from '../../shared/types';
import type { BuildPath, FeatureEvidence } from '../domain/types';
import { SAMPLES as P1_SAMPLES } from '../../features/monsters/samples';

export type V2Sample = {
  id: string;
  label: string;
  hint: string;
  vision: VisionSummary;
  element: Element;
  recommendedPath: BuildPath;
  evidence: FeatureEvidence[];
  thumb: VisualRecipe;
  region: 'river' | 'zao' | 'all';
};

/** 样本的稳定命名/文案（不依赖本地随机命名，保证演示与回归一致） */
export const SAMPLE_IDENTITY: Record<string, { name: string; flavor: string }> = {
  yusan: { name: '伞跃跃', flavor: '把雨滴弹开的小伞怪，撑起来就是一面移动的盾。' },
  reganmian: { name: '芝麻旋旋', flavor: '把芝麻酱搅成旋涡的碳水精灵，越搅越有力气。' },
  yinghua: { name: '樱团团', flavor: '一阵风就散成花瓣雨，落地又聚回一团。' },
  lundu: { name: '江浪仔', flavor: '一道浪推着一艘小船，汽笛一响就先动身。' },
  shuibei: { name: '杯咚咚', flavor: '敲一下就咚咚响，提醒你该喝水了。' },
  laptop: { name: '笔嗒嗒', flavor: '屏幕一亮就精神，键盘敲得比谁都快。' },
  canvas_bag: { name: '包兜兜', flavor: '什么都往兜里塞，看起来软，其实很能扛。' },
  street_lamp: { name: '灯蹲蹲', flavor: '天黑了才被想起，一蹲就是一整夜。' },
};

export function sampleIdentity(id: string): { name: string; flavor: string } {
  return SAMPLE_IDENTITY[id] ?? { name: '', flavor: '' };
}

function observed(tag: FeatureEvidence['tag'], text: string): FeatureEvidence {
  return { tag, source: 'vision_observed', confidence: 0.9, evidenceText: text };
}
function inferred(tag: FeatureEvidence['tag'], text: string): FeatureEvidence {
  return { tag, source: 'model_inferred', confidence: 0.6, evidenceText: text };
}

const p1 = (id: string) => P1_SAMPLES.find((sample) => sample.id === id)!;

const umbrella = p1('yusan');
const noodle = p1('reganmian');
const blossom = p1('yinghua');
const ferry = p1('lundu');
const cup = p1('shuibei');

export const V2_SAMPLES: V2Sample[] = [
  {
    id: 'yusan',
    label: '雨伞',
    hint: '雨天撑开的一小块屋顶',
    vision: umbrella.vision,
    element: 'tool',
    recommendedPath: 'guardian',
    evidence: [
      observed('tool', '伞柄与伞骨'),
      observed('foldable', '可收合'),
      observed('protect', '伞面遮挡'),
      inferred('rain', '雨天使用'),
    ],
    thumb: umbrella.thumb,
    region: 'river',
  },
  {
    id: 'reganmian',
    label: '热干面',
    hint: '芝麻酱香，碳水管饱',
    vision: noodle.vision,
    element: 'food',
    recommendedPath: 'trickster',
    evidence: [
      observed('food', '碗装面条'),
      observed('long', '细长面条'),
      observed('nourish', '能吃饱'),
      inferred('street_food', '过早摊常见'),
      inferred('bind', '面条缠绕'),
    ],
    thumb: noodle.thumb,
    region: 'zao',
  },
  {
    id: 'yinghua',
    label: '樱花',
    hint: '一场花期很短的粉色雨',
    vision: blossom.vision,
    element: 'nature',
    recommendedPath: 'support',
    evidence: [
      observed('nature', '花枝'),
      observed('flower', '五瓣小花'),
      observed('flat', '轻薄花瓣'),
      inferred('campus', '校园花期'),
    ],
    thumb: blossom.thumb,
    region: 'all',
  },
  {
    id: 'lundu',
    label: '轮渡剪影',
    hint: '雾里一声汽笛，江面被划开',
    vision: ferry.vision,
    element: 'water',
    recommendedPath: 'mover',
    evidence: [
      observed('vehicle', '船体轮廓'),
      observed('carry', '载客渡江'),
      inferred('river', '江面场景'),
      inferred('propel', '推进'),
    ],
    thumb: ferry.thumb,
    region: 'river',
  },
  {
    id: 'shuibei',
    label: '水杯',
    hint: '桌角常驻，永远半满',
    vision: cup.vision,
    element: 'tool',
    recommendedPath: 'support',
    evidence: [
      observed('tool', '杯身'),
      observed('hollow', '容器'),
      inferred('liquid_like', '装水'),
      inferred('rigid', '杯壁'),
    ],
    thumb: cup.thumb,
    region: 'all',
  },
  {
    id: 'laptop',
    label: '笔记本电脑',
    hint: '屏幕一亮，整张桌子都醒了',
    vision: {
      primaryObject: '一台打开的笔记本电脑',
      category: 'everyday',
      colors: ['#5B6770', '#C9D2D8', '#1E2A33'],
      features: ['方形屏幕', '键盘层叠', '金属边缘', '发光屏幕'],
      confidence: 'high',
    },
    element: 'tool',
    recommendedPath: 'striker',
    evidence: [
      observed('stationery', '屏幕与键盘'),
      observed('layered', '屏幕键盘分层'),
      observed('illuminate', '屏幕发光'),
      inferred('invention', '科技物件'),
    ],
    thumb: {
      shape: 'tall',
      crest: 'gear',
      accessory: 'none',
      palette: ['#5B6770', '#1E2A33', '#C9D2D8'],
    },
    region: 'all',
  },
  {
    id: 'canvas_bag',
    label: '帆布包',
    hint: '什么都往里塞，就是不会断',
    vision: {
      primaryObject: '一只帆布托特包',
      category: 'everyday',
      colors: ['#B8A98A', '#6E5F48', '#E8E0D0'],
      features: ['布面纹理', '双提手', '能装东西', '柔软'],
      confidence: 'high',
    },
    element: 'tool',
    recommendedPath: 'mover',
    evidence: [
      observed('textile', '布面'),
      observed('woven', '编织纹理'),
      observed('carry', '能装东西'),
      inferred('soft', '布料柔软'),
    ],
    thumb: {
      shape: 'blob',
      crest: 'frame',
      accessory: 'none',
      palette: ['#B8A98A', '#6E5F48', '#E8E0D0'],
    },
    region: 'zao',
  },
  {
    id: 'street_lamp',
    label: '路灯',
    hint: '天黑了才想起来它一直在',
    vision: {
      primaryObject: '一盏街边路灯',
      category: 'building',
      colors: ['#4F5B5E', '#D9C48A', '#2C3538'],
      features: ['高杆', '灯罩', '发光', '金属杆'],
      confidence: 'high',
    },
    element: 'structure',
    recommendedPath: 'striker',
    evidence: [
      observed('tool', '灯杆与灯罩'),
      observed('illuminate', '发光'),
      observed('rigid', '金属杆'),
      inferred('rough', '旧金属'),
    ],
    thumb: {
      shape: 'tall',
      crest: 'none',
      accessory: 'none',
      palette: ['#4F5B5E', '#2C3538', '#D9C48A'],
    },
    region: 'river',
  },
];

export function getSample(id: string): V2Sample | undefined {
  return V2_SAMPLES.find((sample) => sample.id === id);
}

export const STARTER_SAMPLE_IDS = ['yusan', 'reganmian', 'lundu'] as const;
