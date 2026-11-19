import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { VisionSummary } from '../../shared/types';
import type { BuildPath, FeatureEvidence, Tag } from '../domain/types';
import { previewBuild } from '../domain/compile';
import { PATH_META, TAG_LABELS, evidenceLabel, recommendPaths } from '../domain/tags';
import type { V2Sample } from '../content/samples';

export type CaptureDraft = {
  vision: VisionSummary;
  evidence: FeatureEvidence[];
  imageDataUrl?: string;
  source: 'sample' | 'upload';
  path: BuildPath;
  name?: string;
  flavor?: string;
  mode: 'local' | 'live_ai' | 'fallback' | 'demo';
  note: string;
  corrections: number;
  /** 上传时可用于再次显示的调色板 */
  palette?: [string, string, string];
};

const EDITABLE_TAGS: Tag[] = [
  'protect',
  'carry',
  'connect',
  'bind',
  'illuminate',
  'nourish',
  'propel',
  'decorate',
  'foldable',
  'layered',
  'hollow',
  'long',
  'flat',
  'round',
  'river',
  'rain',
  'flower',
  'street_food',
  'bridge',
  'campus',
  'invention',
  'food',
  'tool',
  'nature',
  'vehicle',
  'building',
  'stationery',
  'textile',
];

export function CaptureView2({
  draft,
  sampleError,
  busy,
  preferLive,
  aiAvailable,
  aiNote,
  onPickSample,
  onUpload,
  onToggleLive,
  onToggleEvidence,
  onAddEvidence,
  onPickPath,
  onSummon,
  onClear,
  onOpenCodex,
  samples,
}: {
  draft: CaptureDraft | null;
  sampleError: string | null;
  busy: boolean;
  preferLive: boolean;
  aiAvailable: boolean;
  aiNote: string;
  onPickSample: (sample: V2Sample) => void;
  onUpload: (file: File) => void;
  onToggleLive: () => void;
  onToggleEvidence: (tag: Tag) => void;
  onAddEvidence: (tag: Tag) => void;
  onPickPath: (path: BuildPath) => void;
  onSummon: () => void;
  onClear: () => void;
  onOpenCodex: () => void;
  samples: V2Sample[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => (draft ? previewBuild(draft.vision, draft.evidence, draft.path) : null),
    [draft],
  );
  const paths = useMemo(
    () => (draft ? recommendPaths(draft.evidence) : []),
    [draft],
  );
  const availableTags = useMemo(() => {
    if (!draft) return [];
    const existing = new Set(draft.evidence.map((item) => item.tag));
    return EDITABLE_TAGS.filter((tag) => !existing.has(tag)).slice(0, 12);
  }, [draft]);

  return (
    <section className="v2-capture">
      <div className="v2-capture-head">
        <div>
          <p className="eyebrow">捕获站 · 物品语义编译器</p>
          <h2 className="v2-h2">拍下一件物品，先看见它的“物性”</h2>
          <p className="v2-lede">
            模型只负责看和描述；你确认的标签会真的改变技能与打法。选择成长倾向后即可召唤。
          </p>
        </div>
        <div className="v2-capture-modes">
          <button type="button" className="v2-pill" data-on={preferLive} onClick={onToggleLive} disabled={!aiAvailable}>
            {preferLive ? '实时 AI 识别' : '本地识别'}
          </button>
          <button type="button" className="v2-pill" onClick={() => fileRef.current?.click()}>
            上传照片
          </button>
          <button type="button" className="v2-pill v2-pill-ghost" onClick={onOpenCodex}>
            图鉴
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="v2-capture-grid">
        <div className="v2-sample-drawer">
          <div className="v2-drawer-head mono">样本抽屉 · {samples.length} 件</div>
          <div className="v2-sample-grid">
            {samples.map((sample) => (
              <button
                type="button"
                className="v2-sample"
                key={sample.id}
                data-active={draft?.vision.primaryObject === sample.vision.primaryObject}
                onClick={() => onPickSample(sample)}
              >
                <span className="v2-sample-art">
                  <span className="v2-sample-glyph">{sample.label.slice(0, 1)}</span>
                </span>
                <span className="v2-sample-main">
                  <b>{sample.label}</b>
                  <span className="v2-sample-hint">{sample.hint}</span>
                  <span className="mono">{PATH_META[sample.recommendedPath].name}倾向</span>
                </span>
              </button>
            ))}
          </div>
          {sampleError ? <p className="v2-error">{sampleError}</p> : null}
          <p className="fineprint">
            上传照片后：默认只在浏览器读像素；开启实时 AI 时会把压缩图发给模型用于标签识别，不保存照片、不记录位置。
          </p>
        </div>

        {!draft || !preview ? (
          <div className="v2-confirm-empty">
            <p className="v2-empty-mark">物</p>
            <p className="v2-lede">从左边选一个样本，或上传你身边的物品。</p>
            <p className="fineprint">
              当前为 {preferLive ? '实时 AI' : '本地规则'} 模式。战斗中的敌方决策独立由 AI 导演，失败会自动回落到规则。
            </p>
          </div>
        ) : (
          <div className="v2-confirm">
            <div className="v2-confirm-top">
              <div>
                <p className="eyebrow">可见证据 · 点击确认</p>
                <h3 className="v2-h3">{draft.vision.primaryObject}</h3>
                <p className="fineprint">
                  {draft.source === 'sample' ? '内置样本' : '照片输入'} · {draft.note}
                </p>
              </div>
              <button type="button" className="v2-pill v2-pill-ghost" onClick={onClear}>
                重新选
              </button>
            </div>

            <div className="v2-evidence-row">
              {draft.evidence.map((item) => (
                <button
                  type="button"
                  className="v2-chip"
                  data-source={item.source}
                  key={item.tag}
                  onClick={() => onToggleEvidence(item.tag)}
                  title={item.evidenceText ?? TAG_LABELS[item.tag]}
                >
                  <b>{TAG_LABELS[item.tag]}</b>
                  <span>{evidenceLabel(item)}</span>
                </button>
              ))}
            </div>
            <div className="v2-evidence-tools">
              <span className="mono">补充/纠正标签（还剩 {3 - draft.corrections} 次）</span>
              <div className="v2-add-tags">
                {availableTags.map((tag) => (
                  <button
                    type="button"
                    className="v2-tag-add"
                    key={tag}
                    onClick={() => onAddEvidence(tag)}
                    disabled={draft.corrections >= 3}
                  >
                    + {TAG_LABELS[tag]}
                  </button>
                ))}
              </div>
            </div>

            <div className="v2-path-block">
              <span className="mono">选择成长倾向（首版三选一，后续可预览分支进化）</span>
              <div className="v2-path-row">
                {paths.map((path) => (
                  <button
                    type="button"
                    className="v2-path"
                    key={path}
                    data-active={path === draft.path}
                    style={{ '--path': PATH_META[path].color } as CSSProperties}
                    onClick={() => onPickPath(path)}
                  >
                    <b>{PATH_META[path].name}</b>
                    <span>{PATH_META[path].desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="v2-preview">
              <div className="v2-preview-stats">
                <span className="mono">预算 {preview.budget} / 75</span>
                <div className="v2-stat-line"><b>HP</b><span>{preview.stats.hp}</span></div>
                <div className="v2-stat-line"><b>ATK</b><span>{preview.stats.atk}</span></div>
                <div className="v2-stat-line"><b>DEF</b><span>{preview.stats.def}</span></div>
                <div className="v2-stat-line"><b>SPD</b><span>{preview.stats.spd}</span></div>
              </div>
              <div className="v2-preview-skills">
                <div className="v2-preview-passive">
                  <span className="mono">被动</span>
                  <b>{preview.passive.name}</b>
                  <p className="fineprint">{preview.passive.text}</p>
                </div>
                {preview.actives.map((module) => (
                  <div className="v2-preview-module" key={module.id}>
                    <span className="mono">{module.cost ? `共鸣 ${module.cost}` : '免费'}</span>
                    <b>{module.name}</b>
                    <p className="fineprint">{module.text}</p>
                  </div>
                ))}
                <div className="v2-preview-support">
                  <span className="mono">支援指令</span>
                  <b>{preview.support.name}</b>
                  <p className="fineprint">{preview.support.text}</p>
                </div>
              </div>
            </div>

            <div className="v2-confirm-actions">
              <button type="button" className="v2-btn v2-btn-primary" onClick={onSummon} disabled={busy}>
                {busy ? '正在定形…' : '召唤它'}
              </button>
              <span className="fineprint">定形后自动加入图鉴；队伍可在「我的队伍」调整。</span>
            </div>
            {aiNote ? <p className="v2-ai-note">{aiNote}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}
