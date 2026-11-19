import type { Monster, MonsterStats } from '../../shared/types';
import { ELEMENTS } from './elements';
import { SKILLS } from './skills';

const INK = '#14212b';
const PAPER = '#faf8ef';
const BLUE = '#1b4e75';

const W = 720;
const H = 1040;

function statRuler(ctx: CanvasRenderingContext2D, y: number, ratio: number, color: string) {
  const startX = 190;
  const ticks = 20;
  for (let i = 0; i < ticks; i += 1) {
    ctx.fillStyle = i / ticks < ratio ? color : 'rgba(20,33,43,0.22)';
    ctx.fillRect(startX + i * 9, y, 2, 9);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(text)) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function spriteImage(monster: Monster): Promise<HTMLImageElement | null> {
  const node = document.getElementById(`sprite-${monster.id}`);
  if (!(node instanceof SVGSVGElement)) return null;
  const clone = node.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', '300');
  clone.setAttribute('height', '300');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** 导出一张可保存的精灵卡：只有卡面信息，不含原始照片和位置 */
export async function exportMonsterCard(monster: Monster): Promise<void> {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持导出图片');
  ctx.scale(scale, scale);

  const meta = ELEMENTS[monster.element];

  // 纸
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // 方格
  ctx.strokeStyle = 'rgba(27,78,117,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  // 套印错位的红色边框
  ctx.strokeStyle = 'rgba(226,64,43,0.45)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(40, 44, W - 76, H - 76);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.strokeRect(32, 36, W - 76, H - 76);

  // 头部
  ctx.fillStyle = INK;
  ctx.font = '600 13px "IBM Plex Mono", Consolas, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`JIANGCHENG FIELD NOTES · NO.${monster.id.slice(-4).toUpperCase()}`, 56, 72);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(20,33,43,0.55)';
  ctx.fillText(monster.generationMode === 'live_ai' ? 'LIVE AI' : monster.generationMode === 'fallback' ? 'FALLBACK' : 'DEMO', W - 56, 72);
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(20,33,43,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 86);
  ctx.lineTo(W - 56, 86);
  ctx.stroke();

  // 属性印章
  ctx.save();
  ctx.translate(W - 92, 148);
  ctx.rotate(0.1);
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-38, -38, 76, 76);
  ctx.fillStyle = meta.color;
  ctx.font = '700 26px "Songti SC", SimSun, serif';
  ctx.textAlign = 'center';
  ctx.fillText(meta.glyph, 0, -2);
  ctx.font = '400 10px "IBM Plex Mono", Consolas, monospace';
  ctx.fillText(meta.en.toUpperCase(), 0, 18);
  ctx.restore();
  ctx.textAlign = 'left';

  // 半调网点 + 水印字
  ctx.fillStyle = 'rgba(20,33,43,0.16)';
  for (let y = 120; y < 520; y += 5) {
    for (let x = 60; x < W - 60; x += 5) {
      ctx.fillRect(x, y, 0.8, 0.8);
    }
  }
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = meta.color;
  ctx.font = '800 300px "Songti SC", SimSun, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(meta.glyph, W / 2, 330);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  // 精灵
  const img = await spriteImage(monster);
  if (img) {
    ctx.drawImage(img, W / 2 - 150, 150, 300, 300);
  }

  // 名字
  ctx.fillStyle = INK;
  ctx.font = '800 62px "Songti SC", SimSun, serif';
  ctx.textAlign = 'left';
  ctx.fillText(monster.name, 56, 596);
  ctx.font = '400 14px "IBM Plex Mono", Consolas, monospace';
  ctx.fillStyle = 'rgba(20,33,43,0.6)';
  ctx.fillText(`${meta.name} / ${meta.en}`, 58, 622);

  // 设定
  ctx.fillStyle = 'rgba(20,33,43,0.78)';
  ctx.font = '400 16px "PingFang SC", "Microsoft YaHei", sans-serif';
  const themeLines = wrap(ctx, monster.theme, W - 112).slice(0, 2);
  themeLines.forEach((line, i) => ctx.fillText(line, 58, 660 + i * 26));

  // 数值
  const stats: Array<[keyof MonsterStats, string, number]> = [
    ['hp', 'HP', 100],
    ['attack', 'ATK', 35],
    ['defense', 'DEF', 20],
    ['speed', 'SPD', 20],
  ];
  stats.forEach(([key, label, max], i) => {
    const y = 730 + i * 38;
    ctx.fillStyle = 'rgba(20,33,43,0.6)';
    ctx.font = '400 11px "IBM Plex Mono", Consolas, monospace';
    ctx.fillText(label, 58, y + 8);
    statRuler(ctx, y, monster.stats[key] / max, key === 'hp' ? BLUE : INK);
    ctx.fillStyle = INK;
    ctx.font = '700 15px "IBM Plex Mono", Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(monster.stats[key]), 364, y + 10);
    ctx.textAlign = 'left';
  });

  // 招式
  ctx.strokeStyle = 'rgba(20,33,43,0.35)';
  ctx.beginPath();
  ctx.moveTo(56, 884);
  ctx.lineTo(W - 56, 884);
  ctx.stroke();

  monster.skills.forEach((id, i) => {
    const skill = SKILLS[id];
    const x = 56 + i * 300;
    ctx.strokeStyle = 'rgba(20,33,43,0.4)';
    ctx.strokeRect(x, 900, 280, 46);
    ctx.fillStyle = INK;
    ctx.font = '700 16px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(skill.name, x + 12, 928);
    ctx.fillStyle = 'rgba(20,33,43,0.6)';
    ctx.font = '400 11px "IBM Plex Mono", Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(skill.power > 0 ? `PWR ${skill.power}` : 'UTIL', x + 268, 928);
    ctx.textAlign = 'left';
  });

  // 证据
  ctx.fillStyle = 'rgba(20,33,43,0.55)';
  ctx.font = '400 11px "IBM Plex Mono", Consolas, monospace';
  const tags = monster.evidenceTags.slice(0, 5).map((t) => `#${t}`).join('  ');
  ctx.fillText(wrap(ctx, tags, W - 112)[0] ?? '', 58, 978);

  // 页脚
  ctx.fillStyle = 'rgba(20,33,43,0.45)';
  ctx.font = '400 10px "IBM Plex Mono", Consolas, monospace';
  ctx.fillText('原创虚构原型 · 不含原始照片与位置 · 数值由规则引擎生成', 58, 1006);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(monster.createdAt).toLocaleDateString('zh-CN'), W - 58, 1006);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('导出失败，请重试');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${monster.name}-江城精灵卡.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
