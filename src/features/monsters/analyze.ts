import type { Category, Element, MonsterDraft, VisionSummary, VisualRecipe } from '../../shared/types';
import { createRng, hashString } from '../../shared/rng';
import { defaultRecipeFor, localName, localTheme, normalizeTraits } from './build';
import { SKILLS } from './skills';
import type { SkillId } from '../../shared/types';

/* ------------------------------------------------------------------ *
 * 图片校验与本地像素分析
 * 说明：这是「规则 + 像素统计」，不是 AI 识别。UI 必须如实标注。
 * ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class UploadError extends Error {}

export function validateFile(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new UploadError('只支持 JPG / PNG / WEBP 三种格式。');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`图片 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 5MB 上限。`);
  }
  if (file.size < 1024) {
    throw new UploadError('这张图片似乎不完整，换一张试试。');
  }
}

type Rgb = { r: number; g: number; b: number };

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 128, g: 128, b: 128 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }: Rgb) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  return rgbToHex({
    r: r + (target - r) * t,
    g: g + (target - g) * t,
    b: b + (target - b) * t,
  });
}

export const AI_MAX_EDGE = 1100;

export type Inspection = {
  /** 压缩后的 JPEG data URL：只用于发给模型，分辨率足够识别，体积远小于原图 */
  aiDataUrl: string;
  width: number;
  height: number;
  vision: VisionSummary;
  palette: [string, string, string];
};

/** 读取图片像素：只做降采样统计，不读 EXIF；发给模型的是压缩后的小图 */
export async function inspectImageFile(file: File): Promise<Inspection> {
  validateFile(file);

  const objectUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new UploadError('这张图片无法解码，换一张试试。'));
    image.src = objectUrl;
  }).catch((error) => {
    URL.revokeObjectURL(objectUrl);
    throw error;
  });

  try {
    if (img.width < 32 || img.height < 32) {
      throw new UploadError('图片太小了（至少 32×32）。');
    }

    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UploadError('当前浏览器不支持画布分析，请改用示例素材。');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const buckets = new Map<string, { count: number; sum: Rgb }>();
    let lightSum = 0;
    let lightSq = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 32) continue;
      const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const { l } = rgbToHsl(rgb);
      lightSum += l;
      lightSq += l * l;
      count += 1;
      const key = `${rgb.r >> 5}-${rgb.g >> 5}-${rgb.b >> 5}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.sum.r += rgb.r;
        bucket.sum.g += rgb.g;
        bucket.sum.b += rgb.b;
      } else {
        buckets.set(key, { count: 1, sum: { ...rgb } });
      }
    }

    if (count === 0) throw new UploadError('图片内容为空，换一张试试。');

    const top = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((b) => rgbToHex({ r: b.sum.r / b.count, g: b.sum.g / b.count, b: b.sum.b / b.count }));

    const avgLight = lightSum / count;
    const variance = Math.max(0, lightSq / count - avgLight * avgLight);
    const contrast = Math.sqrt(variance);

    const main = top[0] ?? '#B9A98F';
    const { h: mainHue, s: mainSat } = rgbToHsl(hexToRgb(main));

    const hueName =
      mainSat < 0.12
        ? '低饱和'
        : mainHue < 20 || mainHue >= 330
          ? '偏红'
          : mainHue < 50
            ? '暖黄'
            : mainHue < 80
              ? '黄绿'
              : mainHue < 160
                ? '绿色'
                : mainHue < 200
                  ? '青蓝'
                  : mainHue < 260
                    ? '蓝色'
                    : '紫调';

    const features = [
      `主色 ${main}`,
      `${hueName}系`,
      avgLight < 0.35 ? '整体偏暗' : avgLight > 0.72 ? '整体偏亮' : '中等明度',
      contrast > 0.22 ? '明暗对比强' : contrast < 0.1 ? '画面平缓' : '对比适中',
      img.height > img.width * 1.15 ? '竖向构图' : img.width > img.height * 1.15 ? '横向构图' : '方形构图',
    ];

    const category = guessCategory(mainHue, mainSat, avgLight);
    const palette: [string, string, string] = [main, shade(main, -0.42), top[2] ?? shade(main, 0.72)];

    // 发给模型的压缩图：最长边 1100px，JPEG 0.82
    const scale = Math.min(1, AI_MAX_EDGE / Math.max(img.width, img.height));
    const outW = Math.max(1, Math.round(img.width * scale));
    const outH = Math.max(1, Math.round(img.height * scale));
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const outCtx = out.getContext('2d');
    if (!outCtx) throw new UploadError('当前浏览器不支持画布分析，请改用示例素材。');
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.drawImage(img, 0, 0, outW, outH);
    const aiDataUrl = out.toDataURL('image/jpeg', 0.82);

    return {
      aiDataUrl,
      width: img.width,
      height: img.height,
      palette,
      vision: {
        primaryObject: '照片里的物件',
        category,
        colors: [top[0], top[1] ?? shade(main, -0.3), top[2] ?? shade(main, 0.6)].filter(Boolean),
        features,
        confidence: 'low',
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 无 AI 时的本地属性推断：只依据主色的色相与饱和度，规则固定、可解释。
 * 结果会标注为「演示模式」，不会冒充视觉模型。
 */
export function guessCategory(hue: number, sat: number, light: number): Category {
  if (sat < 0.12 || light < 0.12) return 'building';
  if ((hue >= 15 && hue < 50) || hue >= 330) return light > 0.25 ? 'food' : 'building';
  if (hue >= 50 && hue < 165) return 'nature';
  if (hue >= 165 && hue < 262) return 'water';
  return 'everyday';
}

/** 依据色板与分类拼一个可复现的视觉配方 */
export function recipeFromVision(vision: VisionSummary, palette?: [string, string, string]): VisualRecipe {
  const base = defaultRecipeFor(vision.category);
  const seed = `${normalizeTraits(vision)}|recipe`;
  const rng = createRng(seed);
  const shapes: VisualRecipe['shape'][] = ['blob', 'round', 'tall', 'shard', 'wing', 'spike'];
  const shape =
    vision.category === 'food'
      ? 'round'
      : vision.category === 'water'
        ? 'shard'
        : vision.category === 'building'
          ? 'tall'
          : shapes[Math.floor(rng() * shapes.length)];
  return {
    ...base,
    shape,
    palette: palette ?? base.palette,
  };
}

const ELEMENT_SKILL_PREF: Record<Element, SkillId[]> = {
  food: ['BURST', 'RECOVER'],
  water: ['BURST', 'QUICK'],
  nature: ['BURST', 'GUARD'],
  structure: ['BURST', 'GUARD'],
  tool: ['BURST', 'QUICK'],
};

/** 本地分析器：与 AI 输出同样的形状，但完全由规则与哈希决定 */
export function localAnalyzer(vision: VisionSummary, palette?: [string, string, string]): MonsterDraft {
  const element = inferElement(vision);
  const rng = createRng(`${normalizeTraits(vision)}|draft|${element}`);
  const pref = ELEMENT_SKILL_PREF[element];
  const extras: SkillId[] = ['STRIKE', 'FEINT'];
  const skills = [...pref];
  if (rng() > 0.55) skills[1] = rng() > 0.5 ? extras[0] : extras[1];

  return {
    name: localName(vision, element),
    theme: localTheme(vision, element),
    element,
    preferredSkillIds: skills.filter((id) => SKILLS[id]).slice(0, 2),
    visualRecipe: recipeFromVision(vision, palette),
  };
}

export function inferElement(vision: VisionSummary): Element {
  const map: Record<Category, Element> = {
    food: 'food',
    water: 'water',
    building: 'structure',
    nature: 'nature',
    everyday: 'tool',
  };
  const categoryElement = map[vision.category];
  // 特征里出现明显线索时做一次轻微修正，保持可解释
  const text = `${vision.primaryObject}${vision.features.join('')}`.toLowerCase();
  if (/(水|江|雨|波|湖|河)/.test(text) && vision.category !== 'building') return 'water';
  if (/(叶|花|枝|草|树|樱|藤)/.test(text)) return 'nature';
  if (/(面|饭|汤|食|茶|杯|酱|味)/.test(text)) return 'food';
  if (/(楼|桥|墙|砖|塔|檐|构)/.test(text)) return 'structure';
  return categoryElement;
}

/** 稳定的 variant：让同一分类的不同图片得到不同造型 */
export function variantOf(vision: VisionSummary): number {
  return hashString(normalizeTraits(vision)) % 997;
}
