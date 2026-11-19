import { z } from 'zod';
import type { Category, Element, SkillId } from '../../shared/types';
import { SKILL_IDS } from '../../features/monsters/skills';

/** 所有外部输入（包括模型输出）必须经过这里的校验（规格书 §6.3）。 */

export const ElementSchema = z.enum(['food', 'water', 'structure', 'nature', 'tool']);
export const CategorySchema = z.enum(['food', 'water', 'building', 'nature', 'everyday']);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #RRGGBB');

export const VisionSummarySchema = z.object({
  primaryObject: z.string().min(1).max(24),
  category: CategorySchema,
  colors: z.array(hexColor).min(1).max(4),
  features: z.array(z.string().min(1).max(12)).min(1).max(6),
  confidence: z.enum(['high', 'medium', 'low']),
  culturalHint: z.string().max(30).optional(),
});

export const VisualRecipeSchema = z.object({
  shape: z.enum(['blob', 'round', 'spike', 'tall', 'wing', 'shard']),
  crest: z.enum(['sesame', 'wave', 'petal', 'gear', 'frame', 'none']),
  accessory: z.enum(['bowl', 'umbrella', 'cup', 'wing', 'none']),
  palette: z.tuple([hexColor, hexColor, hexColor]),
});

export const SkillIdSchema = z.enum(SKILL_IDS as [SkillId, ...SkillId[]]);

export const MonsterDraftSchema = z.object({
  name: z.string().min(1).max(12),
  theme: z.string().min(1).max(60),
  element: ElementSchema,
  preferredSkillIds: z.array(SkillIdSchema).max(4),
  visualRecipe: VisualRecipeSchema,
});

export const AnalyzeRequestSchema = z.object({
  source: z.enum(['demo', 'upload']),
  sampleId: z.string().max(40).optional(),
  /** data URL，仅 upload 时使用；不落盘、不写日志 */
  imageDataUrl: z.string().max(8_000_000).optional(),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.object({
  mode: z.enum(['live_ai', 'demo', 'fallback']),
  vision: VisionSummarySchema,
  draft: MonsterDraftSchema,
  meta: z.object({
    model: z.string(),
    latencyMs: z.number().nonnegative(),
    requestId: z.string(),
    note: z.string().default(''),
  }),
});

/** 敌方 AI 指挥官的响应协议（P1）。skill 必须由客户端再用敌方技能白名单复核。 */
export const BattlePlanResponseSchema = z.object({
  mode: z.literal('live_ai'),
  plan: z.object({
    skill: SkillIdSchema,
    reason: z.string().min(1).max(36),
    taunt: z.string().max(44).optional(),
  }),
  meta: z.object({
    model: z.string(),
    latencyMs: z.number().nonnegative(),
    requestId: z.string(),
    note: z.string().default(''),
  }),
});

export type BattlePlanResponse = z.infer<typeof BattlePlanResponseSchema>;

/** 把可能不合法的模型输出裁剪成可用的草稿 */
export function coerceDraft(input: unknown): {
  ok: boolean;
  draft?: z.infer<typeof MonsterDraftSchema>;
  reason?: string;
} {
  const parsed = MonsterDraftSchema.safeParse(input);
  if (parsed.success) return { ok: true, draft: parsed.data };

  if (input && typeof input === 'object') {
    const raw = input as Record<string, unknown>;
    const recipe = (raw.visualRecipe ?? {}) as Record<string, unknown>;
    const patched = {
      name: typeof raw.name === 'string' ? raw.name.slice(0, 12) : '无名小怪',
      theme: typeof raw.theme === 'string' ? raw.theme.slice(0, 60) : '还没想好自己的来历。',
      element: ElementSchema.safeParse(raw.element).success ? raw.element : 'tool',
      preferredSkillIds: Array.isArray(raw.preferredSkillIds)
        ? raw.preferredSkillIds.filter((id) => SkillIdSchema.safeParse(id).success).slice(0, 4)
        : [],
      visualRecipe: {
        shape: ['blob', 'round', 'spike', 'tall', 'wing', 'shard'].includes(String(recipe.shape))
          ? recipe.shape
          : 'blob',
        crest: ['sesame', 'wave', 'petal', 'gear', 'frame', 'none'].includes(String(recipe.crest))
          ? recipe.crest
          : 'none',
        accessory: ['bowl', 'umbrella', 'cup', 'wing', 'none'].includes(String(recipe.accessory))
          ? recipe.accessory
          : 'none',
        palette: Array.isArray(recipe.palette)
          ? [0, 1, 2].map((i) => {
              const c = String((recipe.palette as unknown[])[i] ?? '');
              return /^#[0-9a-fA-F]{6}$/.test(c) ? c : ['#C9822F', '#7A5C3E', '#F0E4D0'][i];
            }) as [string, string, string]
          : ['#C9822F', '#7A5C3E', '#F0E4D0'],
      },
    };
    const retry = MonsterDraftSchema.safeParse(patched);
    if (retry.success) return { ok: true, draft: retry.data, reason: '已裁剪为合法字段' };
  }

  return { ok: false, reason: parsed.success ? '未知错误' : '模型输出无法通过 schema 校验' };
}

export const CATEGORY_LABEL_MAP: Record<Category, string> = {
  food: '过早美食',
  water: '江河湖泊',
  building: '建筑与空间',
  nature: '校园自然',
  everyday: '日常物品',
};

export const ELEMENT_LABEL_MAP: Record<Element, string> = {
  food: '早味',
  water: '江流',
  nature: '木叶',
  structure: '铁骨',
  tool: '机巧',
};
