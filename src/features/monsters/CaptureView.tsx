import { useRef, useState } from 'react';
import { SAMPLES, type Sample } from './samples';
import { buildMonster } from './build';
import { variantOf } from './analyze';
import { MonsterCard } from './MonsterCard';
import { MonsterSprite } from './MonsterSprite';

const previews = SAMPLES.map((sample) =>
  buildMonster({
    id: `preview-${sample.id}`,
    vision: sample.vision,
    draft: sample.draft,
    source: 'demo',
    generationMode: 'demo',
    variant: variantOf(sample.vision),
    createdAt: 0,
  }),
);

export function CaptureView({
  onPickSample,
  onUpload,
  galleryCount,
  onOpenGallery,
  preferLive,
  onToggleLive,
  uploadError,
  aiAvailable,
  aiModel,
}: {
  onPickSample: (sample: Sample) => void;
  onUpload: (file: File) => void;
  galleryCount: number;
  onOpenGallery: () => void;
  preferLive: boolean;
  onToggleLive: (value: boolean) => void;
  uploadError: string | null;
  aiAvailable: boolean;
  aiModel: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onUpload(file);
  };

  return (
    <section
      className="capture"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      data-dragging={dragging}
    >
      <div className="capture-intro">
        <p className="eyebrow">观测入门 · 001</p>
        <h1 className="display">
          拍下一件
          <br />
          寻常物品，
          <br />
          它会变成
          <br />
          <span className="display-mark">你的精灵</span>。
        </h1>
        <p className="lede">
          热干面、雨伞、桌角的水杯都可以。规则引擎按可见特征配好属性与招式，你可以立刻带它打三回合。
        </p>

        <div className="cta-row">
          <button type="button" className="btn btn-primary" onClick={() => cameraRef.current?.click()}>
            拍照捕捉
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            上传照片
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            hidden
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>

        {uploadError ? <p className="upload-error">{uploadError}</p> : null}

        <p className="fineprint">
          JPG / PNG / WEBP，≤5MB，拖进页面也可以。默认只在你的浏览器里降采样读像素：不读位置信息、不保存照片。
          {preferLive && aiAvailable
            ? ' 开启实时 AI 时，这张图会被发送给模型服务用于识别，不写入公共日志。'
            : ' 演示模式不会上传任何图片。'}
        </p>

        <div className="cycle">
          <span className="mono">克制环（三属性闭环）</span>
          <div className="cycle-row">
            <span className="cycle-node" style={{ color: '#C0722A' }}>
              早味
            </span>
            <span className="cycle-arrow">→ 克 →</span>
            <span className="cycle-node" style={{ color: '#4C7A3F' }}>
              木叶
            </span>
            <span className="cycle-arrow">→ 克 →</span>
            <span className="cycle-node" style={{ color: '#2C6E8F' }}>
              江流
            </span>
            <span className="cycle-arrow">→ 克 →</span>
            <span className="cycle-node" style={{ color: '#C0722A' }}>
              早味
            </span>
          </div>
          <p className="cycle-note">铁骨 / 机巧 为中立属性；克制 ×1.25，被克 ×0.80。</p>
        </div>

        <div className="mode-switch">
          <span className="mono">生成方式</span>
          <div className="seg" role="group" aria-label="生成方式">
            <button
              type="button"
              data-on={preferLive}
              disabled={!aiAvailable}
              onClick={() => onToggleLive(true)}
              title={aiAvailable ? `已连接 ${aiModel}` : '服务端未配置模型 Key'}
            >
              实时 AI
            </button>
            <button type="button" data-on={!preferLive} onClick={() => onToggleLive(false)}>
              演示模式
            </button>
          </div>
          <p className="fineprint">
            {aiAvailable
              ? `服务端已配置 ${aiModel || '模型'}；失败会自动降级并标注。`
              : '没有可用的模型 Key：将以本地规则生成，界面标注「演示模式」。'}
          </p>
        </div>
      </div>

      <div className="drawer">
        <div className="drawer-head">
          <span className="mono">样本抽屉 / 5 件</span>
          <button type="button" className="log-toggle" onClick={onOpenGallery}>
            图鉴 {galleryCount}
          </button>
        </div>

        <div className="drawer-body">
          <div className="featured">
            <button type="button" className="featured-btn" onClick={() => onPickSample(SAMPLES[0])}>
              <MonsterCard monster={previews[0]} serial="S-01" compact showTheme={false} showEvidence={false} />
            </button>
            <div>
              <div className="mono">主推样本 // 热干面</div>
              <p className="fineprint">点一下，直接生成一张可出战的卡。</p>
            </div>
          </div>

          <div className="strips">
            {SAMPLES.map((sample, index) => (
              <button type="button" className="strip" key={sample.id} onClick={() => onPickSample(sample)}>
                <span className="strip-art">
                  <MonsterSprite recipe={sample.thumb} title={sample.label} />
                </span>
                <span className="strip-main">
                  <span className="strip-name">{sample.label}</span>
                  <span className="strip-hint">{sample.hint}</span>
                </span>
                <span className="strip-no">S-0{index + 1}</span>
              </button>
            ))}
          </div>
        </div>

        {dragging ? <p className="drop-hint">松手，就在本地读取这张图</p> : null}

        <div className="howto">
          <div className="howto-step">
            <span className="howto-num">1</span>
            <div>
              <b>拍，或者从抽屉里挑</b>
              <p>5 个样本不需要上传照片，点一下就生成。</p>
            </div>
          </div>
          <div className="howto-step">
            <span className="howto-num">2</span>
            <div>
              <b>拿到一张能打的卡</b>
              <p>名称、属性、招式与数值一次生成，可以保存成图片。</p>
            </div>
          </div>
          <div className="howto-step">
            <span className="howto-num">3</span>
            <div>
              <b>选对手，打三回合</b>
              <p>先看敌方意图，再决定进攻、防御还是回血。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
