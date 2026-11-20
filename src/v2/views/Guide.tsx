import { useEffect, useState } from 'react';
import type { SaveV2 } from '../domain/types';
import { GUIDE_SECTIONS, nextStepFor } from '../domain/guidance';

export function NextStepBar({
  save,
  onNavigate,
  onOpenGuide,
}: {
  save: SaveV2;
  onNavigate: (screen: 'capture' | 'party' | 'map' | 'quests' | 'codex') => void;
  onOpenGuide: () => void;
}) {
  const step = nextStepFor(save);
  return (
    <div className="v2-next-step">
      <span className="v2-rubric">下一步</span>
      <b>{step.label}</b>
      <span className="v2-next-step-detail">{step.detail}</span>
      <button type="button" className="v2-btn v2-btn-sm" onClick={() => onNavigate(step.screen)}>
        去做
      </button>
      <button type="button" className="v2-link-btn" onClick={onOpenGuide}>
        完整指引
      </button>
    </div>
  );
}

export function GuideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0].id);
  const active = GUIDE_SECTIONS.find((section) => section.id === activeId) ?? GUIDE_SECTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="v2-guide-overlay" role="dialog" aria-modal="true" aria-label="游戏指引" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="v2-guide-panel">
        <div className="v2-guide-head">
          <div>
            <p className="v2-rubric">观测指引 / 随时可关</p>
            <h3 className="v2-h3">先看哪一页？</h3>
          </div>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onClose}>关闭</button>
        </div>
        <div className="v2-guide-body">
          <nav className="v2-guide-nav" aria-label="指引章节">
            {GUIDE_SECTIONS.map((section, index) => (
              <button
                type="button"
                key={section.id}
                data-active={section.id === active.id}
                onClick={() => setActiveId(section.id)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {section.title.split(' · ')[0]}
              </button>
            ))}
          </nav>
          <div className="v2-guide-content">
            <h4>{active.title}</h4>
            <p className="v2-lede">{active.subtitle}</p>
            <ol className="v2-guide-steps">
              {active.steps.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
            <div className="v2-guide-tips">
              <span className="v2-rubric">容易踩的坑</span>
              {active.tips.map((tip) => (
                <p key={tip}>· {tip}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
