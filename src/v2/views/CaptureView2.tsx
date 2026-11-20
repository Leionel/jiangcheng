import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Element, VisionSummary } from '../../shared/types';
import type { BuildPath, FeatureEvidence, Tag } from '../domain/types';
import { STAT_RANGES, previewBuild } from '../domain/compile';
import { DIMENSION_LABEL, PATH_META, TAG_LABELS, evidenceLabel, recommendPaths, tagDimension } from '../domain/tags';
import { ACTIVE_BY_ID, PASSIVE_BY_ID } from '../content/modules';
import { ELEMENTS } from '../../features/monsters/elements';
import { MonsterSprite } from '../../features/monsters/MonsterSprite';
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

const HERO_FEATURE_IDS = ['reganmian', 'yusan', 'yinghua', 'lundu'] as const;

export function CaptureView2({
  draft,
  sampleError,
  busy,
  preferLive,
  aiAvailable,
  aiNote,
  isFirstTime = false,
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
  isFirstTime?: boolean;
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
  const [dragging, setDragging] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);

  const heroSamples = useMemo(
    () =>
      HERO_FEATURE_IDS.map((id) => samples.find((item) => item.id === id)).filter((item): item is V2Sample =>
        Boolean(item),
      ),
    [samples],
  );
  const featuredSample = heroSamples[heroIdx % Math.max(1, heroSamples.length)] ?? samples[0];
  const featuredPreview = useMemo(
    () =>
      featuredSample
        ? previewBuild(featuredSample.vision, featuredSample.evidence, featuredSample.recommendedPath)
        : null,
    [featuredSample],
  );

  useEffect(() => {
    if (draft || heroSamples.length <= 1) return;
    const timer = window.setInterval(() => {
      setHeroIdx((value) => (value + 1) % heroSamples.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [draft, heroSamples.length]);

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
  const confirmedCount = draft ? draft.evidence.filter((item) => item.source === 'user_confirmed').length : 0;
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
    <section
      className="v2-capture"
      data-dragging={dragging}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onUpload(file);
      }}
    >
      <div className="v2-capture-head">
        <div>
          <p className="v2-rubric">{isFirstTime ? '物品召唤 · 10 秒变怪' : '捕获站 · 物性显影'}</p>
          <h2 className="v2-h2">拍下身边物品，变成独一无二的江城怪</h2>
          <p className="v2-lede">
            热干面、雨伞、水杯或书桌上的小物件都能变成会出招的伙伴，带它走过江城五个区。
          </p>
        </div>
        <div className="v2-capture-modes">
          <button type="button" className="v2-btn v2-btn-primary" onClick={() => fileRef.current?.click()}>
            拍照 / 上传物品
          </button>
          {featuredSample ? (
            <button type="button" className="v2-btn" onClick={() => onPickSample(featuredSample)}>
              先试玩「{featuredSample.label}」
            </button>
          ) : null}
          <button type="button" className="v2-pill" data-on={preferLive} onClick={onToggleLive} disabled={!aiAvailable}>
            {preferLive ? '实时 AI 开' : '本地识别'}
          </button>
          {!isFirstTime ? (
            <button type="button" className="v2-pill v2-pill-ghost" onClick={onOpenCodex}>
              图鉴
            </button>
          ) : null}
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

      {dragging ? (
        <p className="v2-drop-hint" role="status">
          松手即可读取这张照片（仅在本机处理像素，开启实时 AI 时用于物体识别）
        </p>
      ) : null}

      {!draft && featuredSample && featuredPreview ? (
        <div className="v2-capture-landing">
          <div className="v2-hero">
            <div className="v2-hero-morph">
              <div className="v2-hero-item">
                <span className="v2-rubric">日常原物</span>
                <div className="v2-hero-item-card">
                  <b>{featuredSample.label}</b>
                  <p>{featuredSample.hint}</p>
                  <div className="v2-hero-item-tags">
                    {featuredSample.evidence.slice(0, 3).map((ev) => (
                      <span className="v2-mini-tag" key={ev.tag}>{TAG_LABELS[ev.tag]}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="v2-hero-arrow" aria-hidden="true">
                <span>显影变形</span>
                <b>→</b>
              </div>
              <div className="v2-hero-creature">
                <div className="v2-hero-sprite">
                  <MonsterSprite recipe={featuredSample.thumb} mood="happy" title={featuredPreview.name} />
                </div>
                <div className="v2-hero-creature-info">
                  <div className="v2-specimen-badges">
                    <span
                      className="v2-badge"
                      data-kind="element"
                      style={{ '--badge': ELEMENTS[featuredSample.element].color } as CSSProperties}
                    >
                      <i />
                      {ELEMENTS[featuredSample.element].name}属性
                    </span>
                    <span
                      className="v2-badge"
                      data-kind="path"
                      style={{ '--badge': PATH_META[featuredSample.recommendedPath].color } as CSSProperties}
                    >
                      {PATH_META[featuredSample.recommendedPath].name}
                    </span>
                  </div>
                  <h3>{featuredPreview.name}</h3>
                  <p>{featuredPreview.flavor}</p>
                  <div className="v2-hero-cta-row">
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary"
                      onClick={() => onPickSample(featuredSample)}
                    >
                      用它召唤「{featuredPreview.name}」↗
                    </button>
                    <button
                      type="button"
                      className="v2-link-btn"
                      onClick={() => setHeroIdx((value) => (value + 1) % Math.max(1, heroSamples.length))}
                    >
                      换一个看看 ({(heroIdx % Math.max(1, heroSamples.length)) + 1}/{heroSamples.length})
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <details className="v2-rules-fold">
              <summary>为什么“物品形态”会决定招式？（展开三步原理）</summary>
              <ol className="v2-steps">
                <li>
                  <b>看见物性</b>
                  <span>模型只描述画面里看得见的形态、材质与用途，不做身份与地点推断。</span>
                </li>
                <li>
                  <b>确认改变能力</b>
                  <span>点击确认物性标签后，规则引擎会把它转译成真实招式与数值，不只是文案。</span>
                </li>
                <li>
                  <b>定形即出战</b>
                  <span>召唤后会直接设为当前 1 号主战，立刻就能带进江城首战。</span>
                </li>
              </ol>
            </details>
          </div>

          <div className="v2-sample-drawer">
            <div className="v2-drawer-head">
              <span>快速选一件日常小物</span>
              <span className="v2-count">{samples.length} 件样本</span>
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
                    onClick={() => onPickSample(sample)}
                  >
                    <span className="v2-sample-art">
                      <span className="v2-sample-glyph" aria-hidden="true">{sample.label.slice(0, 1)}</span>
                      <MonsterSprite recipe={sample.thumb} title={sample.label} />
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
        </div>
      ) : draft && preview ? (
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
                      <span className="v2-sample-glyph" aria-hidden="true">{sample.label.slice(0, 1)}</span>
                      <MonsterSprite recipe={sample.thumb} title={sample.label} />
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
          </div>

          <div className="v2-confirm" ref={confirmRef}>
            <div className="v2-confirm-top">
              <div>
                <p className="v2-rubric">变身预览 · 即将召唤</p>
                <h3 className="v2-h3">{draft.vision.primaryObject} → {draft.name || preview.name}</h3>
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

            <div className="v2-confirm-hero">
              {draft.imageDataUrl ? (
                <div className="v2-confirm-photo">
                  <img src={draft.imageDataUrl} alt={draft.vision.primaryObject} />
                  <span>原图参照</span>
                </div>
              ) : null}
              <div className="v2-preview-figure">
                <div className="v2-preview-sprite">
                  <MonsterSprite
                    recipe={preview.visual}
                    mood="happy"
                    title={draft.name || preview.name}
                  />
                </div>
                <div className="v2-preview-identity">
                  <b>{draft.name || preview.name}</b>
                  <p className="v2-preview-flavor">{draft.flavor || preview.flavor}</p>
                </div>
              </div>
              <div className="v2-confirm-hero-cta">
                <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onSummon} disabled={busy}>
                  {busy ? '正在定形…' : '召唤它'}
                </button>
                <span className="fineprint">也可在下方点选物性或切换倾向微调能力</span>
              </div>
            </div>

            <div className="v2-step-head">
              <span className="v2-rubric">
                第一步 · 点选确认物性（已确认 {confirmedCount} 项，还可调 {3 - draft.corrections} 次）
              </span>
              <span className="fineprint">点击标签切换「我确认」，它会真的改变下方招式</span>
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
            <details className="v2-rules-fold">
              <summary>补充或纠正其他物性标签（还剩 {3 - draft.corrections} 次）</summary>
              <div className="v2-evidence-tools">
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
            </details>
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
              <div className="v2-step-head">
                <span className="v2-rubric">第二步 · 选择成长倾向</span>
                <span className="fineprint">切换倾向会重塑四维与支援指令</span>
              </div>
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

            <div className="v2-preview-section">
              <span className="v2-rubric">能力详情 · 数值与招式</span>
              <div className="v2-preview">
                <div className="v2-preview-left">
                  <div className="v2-preview-stats">
                    <div className="v2-budget">
                      <span>数值预算</span>
                      <b>{preview.budget} / 75</b>
                    </div>
                    {[
                      { label: 'HP', value: preview.stats.hp, max: STAT_RANGES.hp[1] },
                      { label: 'ATK', value: preview.stats.atk, max: STAT_RANGES.atk[1] },
                      { label: 'DEF', value: preview.stats.def, max: STAT_RANGES.def[1] },
                      { label: 'SPD', value: preview.stats.spd, max: STAT_RANGES.spd[1] },
                    ].map((stat) => (
                      <div className="v2-stat-line" key={stat.label}>
                        <div className="v2-stat-meta">
                          <span>{stat.label}</span>
                          <b>{stat.value}</b>
                        </div>
                        <div className="v2-stat-meter" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, Math.round((stat.value / stat.max) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
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
            </div>

            <div className="v2-confirm-actions">
              <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onSummon} disabled={busy}>
                {busy ? '正在定形…' : '召唤它'}
              </button>
              <span className="fineprint">定形后可直接带着它进第一战，或去「我的队伍」编排阵容。</span>
            </div>
            {aiNote ? <p className="v2-ai-note">{aiNote}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

