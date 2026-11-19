export type AnalyzeStep = 0 | 1 | 2 | 3 | 4;

const STEPS: Array<{ label: string; note: string }> = [
  { label: '读取图像与主色', note: '本地' },
  { label: '识别可见特征', note: '本地' },
  { label: '书写名称与设定', note: 'AI / 规则' },
  { label: '配属性、技能与数值', note: '规则引擎' },
];

export function AnalyzeModal({
  open,
  title,
  step,
  preferLive,
  slow,
  onSkip,
  onCancel,
}: {
  open: boolean;
  title: string;
  step: AnalyzeStep;
  preferLive: boolean;
  slow: boolean;
  onSkip: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="正在生成精灵卡">
      <div className="modal">
        <div>
          <p className="eyebrow">正在显影 · {preferLive ? '实时 AI' : '演示模式'}</p>
          <h2 className="h2" style={{ marginTop: 8 }}>
            {title}
          </h2>
        </div>

        <div className="steps">
          {STEPS.map((item, index) => {
            const state = step > index ? 'done' : step === index ? 'active' : 'wait';
            return (
              <div className="step" key={item.label} data-state={state}>
                <span className="step-mark">{state === 'done' ? '✓' : index + 1}</span>
                <span>{item.label}</span>
                <span className="step-note">{item.note}</span>
              </div>
            );
          })}
        </div>

        <p className="fineprint">
          {preferLive
            ? '正在请求模型；如果超过 26 秒没有回应，会自动切换到规则引擎并标注为降级模式。'
            : '图像只在本机降采样读像素，生成的名称与数值由本地规则与哈希决定，同一张图结果可复现。'}
        </p>

        <div className="modal-actions">
          {slow ? (
            <button type="button" className="btn btn-small" onClick={onSkip}>
              改用演示策略
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
