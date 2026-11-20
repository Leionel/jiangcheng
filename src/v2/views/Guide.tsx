import { useEffect, useState } from 'react';
import type { SaveV2 } from '../domain/types';
import { GUIDE_SECTIONS, nextStepFor } from '../domain/guidance';

export type V2Screen = 'capture' | 'party' | 'map' | 'battle' | 'result' | 'codex' | 'quests';

const LOOP_STEPS: Array<{
  key: 'capture' | 'party' | 'map' | 'quests';
  num: string;
  label: string;
  isDone: (save: SaveV2) => boolean;
}> = [
  { key: 'capture', num: '①', label: '捕获定形', isDone: (save) => save.stats.captures > 0 },
  { key: 'party', num: '②', label: '三人编队', isDone: (save) => save.party.ids.length >= 3 && save.stats.battles > 0 },
  { key: 'map', num: '③', label: '五区探索', isDone: (save) => save.stats.regionClears > 0 },
  { key: 'quests', num: '④', label: '任务与进化', isDone: (save) => save.stats.evolutions > 0 && save.stats.questsClaimed > 0 },
];

const SPOTLIGHT_SELECTOR: Record<'capture' | 'party' | 'map' | 'quests' | 'codex', string> = {
  capture: '.v2-confirm, .v2-sample-drawer',
  party: '.v2-party-slots',
  map: '.v2-node-panel',
  quests: '.v2-quest-grid',
  codex: '.v2-codex-grid',
};

export function NextStepBar({
  save,
  currentScreen,
  onNavigate,
  onOpenGuide,
}: {
  save: SaveV2;
  currentScreen?: V2Screen;
  onNavigate: (screen: 'capture' | 'party' | 'map' | 'quests' | 'codex') => void;
  onOpenGuide: () => void;
}) {
  const step = nextStepFor(save);

  const handleGo = () => {
    if (currentScreen !== step.screen) {
      onNavigate(step.screen);
      return;
    }
    const target = document.querySelector(SPOTLIGHT_SELECTOR[step.screen]) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.setAttribute('data-spotlight', 'true');
    window.setTimeout(() => {
      target.removeAttribute('data-spotlight');
    }, 1300);
  };

  return (
    <div className="v2-next-step">
      <div className="v2-loop-steps" aria-label="核心循环进度">
        {LOOP_STEPS.map((item, idx) => {
          const done = item.isDone(save);
          const active = currentScreen === item.key || (!currentScreen && step.screen === item.key);
          const recommended = step.screen === item.key;
          return (
            <div className="v2-loop-node" key={item.key}>
              <button
                type="button"
                className="v2-loop-pill"
                data-done={done}
                data-active={active}
                data-recommended={recommended}
                onClick={() => onNavigate(item.key)}
                title={`前往${item.label}`}
              >
                <span className="v2-loop-num">{done ? '✓' : item.num}</span>
                <span>{item.label}</span>
              </button>
              {idx < LOOP_STEPS.length - 1 ? <span className="v2-loop-arrow" aria-hidden="true">→</span> : null}
            </div>
          );
        })}
      </div>
      <div className="v2-next-step-main">
        <span className="v2-rubric">下一步</span>
        <b>{step.label}</b>
        <span className="v2-next-step-detail">{step.detail}</span>
        <div className="v2-next-step-actions">
          <button type="button" className="v2-btn v2-btn-sm" onClick={handleGo}>
            去做
          </button>
          <button type="button" className="v2-link-btn" onClick={onOpenGuide}>
            完整指引
          </button>
        </div>
      </div>
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
