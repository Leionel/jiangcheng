import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Element, VisionSummary } from '../../shared/types';
import type { BuildPath, FeatureEvidence, Tag } from '../domain/types';
import { previewBuild } from '../domain/compile';
import { DIMENSION_LABEL, PATH_META, TAG_LABELS, evidenceLabel, recommendPaths, tagDimension } from '../domain/tags';
import { ACTIVE_BY_ID, PASSIVE_BY_ID } from '../content/modules';
import { ELEMENTS } from '../../features/monsters/elements';
import type { V2Sample } from '../content/samples';

export type CaptureDraft = {
  vision: VisionSummary;
  evidence: FeatureEvidence[];
  imageDataUrl?: string;
  source: 'sample' | 'upload';
  element: Element;
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
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!draft) return;
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    const timer = window.setTimeout(() => {
      confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draft?.source, draft?.vision.primaryObject]);
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
  const elementMeta = draft ? ELEMENTS[draft.element] : null;
  const because = useMemo(() => {
    if (!draft || !preview) return [];
    const confirmed = draft.evidence.filter((item) => item.source === 'user_confirmed').map((item) => item.tag);
    const modules = preview.actives.map((item) => ({
      name: item.name,
      tags: ACTIVE_BY_ID.get(item.id)?.tags ?? [],
    }));
    modules.push({ name: preview.passive.name, tags: PASSIVE_BY_ID.get(preview.passive.id)?.tags ?? [] });
    return confirmed
      .map((tag) => {
        const hit = modules.find((module) => module.tags.includes(tag));
        return hit ? { tag, module: hit.name } : null;
      })
      .filter((item): item is { tag: Tag; module: string } => Boolean(item))
      .slice(0, 3);
  }, [draft, preview]);

  return (
    <section className="v2-capture">
      <div className="v2-capture-head">
        <div>
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
          <div className="v2-drawer-head">
            <span>样本抽屉</span>
            <span className="v2-count">{samples.length} 件</span>
          </div>
          <div className="v2-sample-grid">
            {samples.map((sample) => {
              const elementMeta = ELEMENTS[sample.element];
              const pathMeta = PATH_META[sample.recommendedPath];
              return (
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
                    <span className="v2-sample-badges">
                      <span className="v2-badge" data-kind="element" style={{ '--badge': elementMeta.color } as CSSProperties}>
                        <i />
                        {elementMeta.name}属性
                      </span>
                      <span className="v2-badge" data-kind="path" style={{ '--badge': pathMeta.color } as CSSProperties}>
                        {pathMeta.name}倾向
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {sampleError ? <p className="v2-error">{sampleError}</p> : null}
          <p className="fineprint">
            默认只在浏览器里读像素；开启实时 AI 时，压缩图会发给模型用于标签识别，不保存照片、不记录位置。
          </p>
        </div>

        {!draft || !preview ? (
          <div className="v2-empty-note">
            <h3 className="v2-h3">先看物性，再定形。</h3>
            <ol className="v2-steps">
              <li>
                <b>看见</b>
                <span>模型只描述画面里看得见的形态、材质与用途，不做身份与地点推断。</span>
              </li>
              <li>
                <b>确认</b>
                <span>点击证据标签确认“它真的能遮挡 / 能承载”。确认会改变能力，而不只是文案。</span>
              </li>
              <li>
                <b>定形</b>
                <span>选择守护、强攻、诡计、支援或机动，召唤演出会把它落成一张可出战的卡。</span>
              </li>
            </ol>
            <div className="v2-empty-legend">
              <span className="v2-badge" data-kind="element"><i style={{ background: 'var(--riso-blue)' }} />属性</span>
              <span className="v2-badge" data-kind="path" style={{ '--badge': 'var(--riso-red)' } as CSSProperties}>成长倾向</span>
              <span className="v2-badge" data-kind="tag">证据标签</span>
              <span className="fineprint">样本 8 件；也可以上传你身边的物品。</span>
            </div>
          </div>
        ) : (
          <div className="v2-confirm" ref={confirmRef}>
            <div className="v2-confirm-top">
              <div>
                <p className="v2-rubric">可见证据 · 点击标签确认</p>
                <h3 className="v2-h3">{draft.vision.primaryObject}</h3>
                <div className="v2-confirm-badges">
                  {elementMeta ? (
                    <span className="v2-badge" data-kind="element" style={{ '--badge': elementMeta.color } as CSSProperties}>
                      <i />
                      {elementMeta.name}属性
                    </span>
                  ) : null}
                  <span className="v2-badge" data-kind="path" style={{ '--badge': PATH_META[draft.path].color } as CSSProperties}>
                    {PATH_META[draft.path].name}倾向
                  </span>
                  <span className="v2-badge" data-kind="mode">
                    {draft.source === 'sample' ? '内置样本' : '照片输入'} ·{' '}
                    {draft.mode === 'live_ai' ? '实时 AI 语义' : draft.mode === 'fallback' ? 'AI 降级' : '本地规则'}
                  </span>
                </div>
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
                  data-dim={tagDimension(item.tag)}
                  key={item.tag}
                  onClick={() => onToggleEvidence(item.tag)}
                  title={item.evidenceText ?? TAG_LABELS[item.tag]}
                >
                  <span className="v2-chip-kicker">{DIMENSION_LABEL[tagDimension(item.tag)]}</span>
                  <b>{TAG_LABELS[item.tag]}</b>
                  <span className="v2-chip-source">{evidenceLabel(item)}</span>
                </button>
              ))}
            </div>
            <div className="v2-evidence-tools">
              <span>补充或纠正标签（还剩 {3 - draft.corrections} 次）</span>
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
            {because.length > 0 ? (
              <div className="v2-because">
                <span className="v2-rubric">你确认的物性正在改变它</span>
                {because.map((item) => (
                  <p className="v2-because-line" key={item.tag}>
                    <b>{TAG_LABELS[item.tag]}</b>
                    <span>→</span>
                    <b>{item.module}</b>
                  </p>
                ))}
              </div>
            ) : null}

            <div className="v2-path-block">
              <span className="v2-rubric">选择成长倾向</span>
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
                    <span className="v2-path-head">
                      <b>{PATH_META[path].name}</b>
                      {path === paths[0] ? <span className="v2-badge" data-kind="reco">推荐</span> : null}
                    </span>
                    <span className="v2-path-desc">{PATH_META[path].desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="v2-preview">
              <div className="v2-preview-stats">
                <div className="v2-budget">
                  <span>数值预算</span>
                  <b>{preview.budget} / 75</b>
                </div>
                <div className="v2-stat-line"><span>HP</span><b>{preview.stats.hp}</b></div>
                <div className="v2-stat-line"><span>ATK</span><b>{preview.stats.atk}</b></div>
                <div className="v2-stat-line"><span>DEF</span><b>{preview.stats.def}</b></div>
                <div className="v2-stat-line"><span>SPD</span><b>{preview.stats.spd}</b></div>
              </div>
              <div className="v2-preview-skills">
                <div className="v2-preview-card" data-kind="passive">
                  <span className="v2-preview-kicker">被动</span>
                  <b>{preview.passive.name}</b>
                  <p>{preview.passive.text}</p>
                </div>
                {preview.actives.map((module) => (
                  <div className="v2-preview-card" data-kind="active" key={module.id}>
                    <span className="v2-preview-kicker">{module.cost ? `共鸣 ${module.cost}` : '免费'}</span>
                    <b>{module.name}</b>
                    <p>{module.text}</p>
                  </div>
                ))}
                <div className="v2-preview-card" data-kind="support">
                  <span className="v2-preview-kicker">支援指令</span>
                  <b>{preview.support.name}</b>
                  <p>{preview.support.text}</p>
                </div>
              </div>
            </div>

            <div className="v2-confirm-actions">
              <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onSummon} disabled={busy}>
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

