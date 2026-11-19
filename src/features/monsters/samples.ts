import type { MonsterDraft, VisionSummary, VisualRecipe } from '../../shared/types';

/**
 * 5 个内置示例素材。全部为原创虚构设定，插画由 SVG 配方程序化绘制，
 * 不使用任何第三方图片素材（见规格书 §4.3 / 附录 A）。
 */
export type Sample = {
  id: string;
  /** 卡面副标题：素材本身是什么 */
  label: string;
  fileName: string;
  vision: VisionSummary;
  draft: MonsterDraft;
  /** 示例缩略图用的配方（略作区分，让宫格有差异） */
  thumb: VisualRecipe;
  hint: string;
};

export const SAMPLES: Sample[] = [
  {
    id: 'reganmian',
    label: '热干面',
    fileName: 'sample-reganmian',
    hint: '芝麻酱香，碳水管饱',
    vision: {
      primaryObject: '一碗热干面',
      category: 'food',
      colors: ['#C9822F', '#E8C88A', '#5A3A1E'],
      features: ['圆柱面条', '芝麻颗粒', '酱色浓稠', '碗装'],
      confidence: 'high',
      culturalHint: '过早摊常见的一碗面',
    },
    draft: {
      name: '芝麻旋旋',
      theme: '把芝麻酱搅成旋涡的碳水精灵，越搅越有力气。',
      element: 'food',
      preferredSkillIds: ['BURST', 'RECOVER'],
      visualRecipe: {
        shape: 'round',
        crest: 'sesame',
        accessory: 'bowl',
        palette: ['#D89A4A', '#8A5A2B', '#F4E3C4'],
      },
    },
    thumb: {
      shape: 'round',
      crest: 'sesame',
      accessory: 'bowl',
      palette: ['#D89A4A', '#8A5A2B', '#F4E3C4'],
    },
  },
  {
    id: 'yusan',
    label: '雨伞',
    fileName: 'sample-umbrella',
    hint: '雨天撑开的一小块屋顶',
    vision: {
      primaryObject: '一把合起的雨伞',
      category: 'everyday',
      colors: ['#3B4A63', '#8FA3B8', '#D9DEE6'],
      features: ['曲面伞面', '细长伞柄', '织物纹理', '金属伞骨'],
      confidence: 'high',
    },
    draft: {
      name: '伞跃跃',
      theme: '把雨滴弹开的小伞怪，撑起来就是一面移动的盾。',
      element: 'tool',
      preferredSkillIds: ['BURST', 'GUARD'],
      visualRecipe: {
        shape: 'wing',
        crest: 'frame',
        accessory: 'umbrella',
        palette: ['#5A7089', '#2F3F55', '#E6EBF2'],
      },
    },
    thumb: {
      shape: 'wing',
      crest: 'frame',
      accessory: 'umbrella',
      palette: ['#5A7089', '#2F3F55', '#E6EBF2'],
    },
  },
  {
    id: 'yinghua',
    label: '樱花',
    fileName: 'sample-blossom',
    hint: '一场花期很短的粉色雨',
    vision: {
      primaryObject: '一枝樱花',
      category: 'nature',
      colors: ['#E9A8B8', '#F7DDE3', '#6E7F52'],
      features: ['五瓣小花', '成簇开放', '细枝', '浅粉渐变'],
      confidence: 'high',
      culturalHint: '春季校园常见的花期景观',
    },
    draft: {
      name: '樱团团',
      theme: '一阵风就散成花瓣雨，落地又聚回一团。',
      element: 'nature',
      preferredSkillIds: ['BURST', 'FEINT'],
      visualRecipe: {
        shape: 'blob',
        crest: 'petal',
        accessory: 'none',
        palette: ['#F0B9C6', '#D4798F', '#FDF2F4'],
      },
    },
    thumb: {
      shape: 'blob',
      crest: 'petal',
      accessory: 'none',
      palette: ['#F0B9C6', '#D4798F', '#FDF2F4'],
    },
  },
  {
    id: 'lundu',
    label: '轮渡剪影',
    fileName: 'sample-ferry',
    hint: '雾里一声汽笛，江面被划开',
    vision: {
      primaryObject: '江面上的轮渡剪影',
      category: 'water',
      colors: ['#2C5C74', '#7FA4B6', '#E3D9C6'],
      features: ['船体轮廓', '水面反光', '薄雾', '横向构图'],
      confidence: 'medium',
      culturalHint: '跨江通勤的日常场景',
    },
    draft: {
      name: '江浪仔',
      theme: '一道浪推着一艘小船，汽笛一响就先动身。',
      element: 'water',
      preferredSkillIds: ['BURST', 'QUICK'],
      visualRecipe: {
        shape: 'shard',
        crest: 'wave',
        accessory: 'none',
        palette: ['#3E7F9C', '#1F4E63', '#DCEBF1'],
      },
    },
    thumb: {
      shape: 'shard',
      crest: 'wave',
      accessory: 'none',
      palette: ['#3E7F9C', '#1F4E63', '#DCEBF1'],
    },
  },
  {
    id: 'shuibei',
    label: '水杯',
    fileName: 'sample-cup',
    hint: '桌角常驻，永远半满',
    vision: {
      primaryObject: '一只带盖水杯',
      category: 'everyday',
      colors: ['#7C8B84', '#C9D3CC', '#3E4A45'],
      features: ['圆柱杯身', '杯盖', '磨砂质感', '桌面阴影'],
      confidence: 'high',
    },
    draft: {
      name: '杯咚咚',
      theme: '敲一下就咚咚响，提醒你该喝水了。',
      element: 'tool',
      preferredSkillIds: ['BURST', 'RECOVER'],
      visualRecipe: {
        shape: 'tall',
        crest: 'gear',
        accessory: 'cup',
        palette: ['#8FA39A', '#4E5F57', '#E4EBE6'],
      },
    },
    thumb: {
      shape: 'tall',
      crest: 'gear',
      accessory: 'cup',
      palette: ['#8FA39A', '#4E5F57', '#E4EBE6'],
    },
  },
];

export function getSample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
