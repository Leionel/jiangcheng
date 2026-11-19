import { useMemo, useState } from 'react';
import type { Monster, MonsterStats } from '../../shared/types';
import { ELEMENTS, typeMultiplier } from './elements';
import { SKILLS } from './skills';
import { MonsterCard } from './MonsterCard';
import { MonsterSprite } from './MonsterSprite';
import { getRecord, serialOf, winRate } from './store';

const STATS: Array<keyof MonsterStats> = ['hp', 'attack', 'defense', 'speed'];
const LABEL: Record<keyof MonsterStats, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  speed: 'SPD',
};

export function GalleryView({
  monsters,
  activeId,
  onSelect,
  onBattle,
  onDelete,
  onRecapture,
  onOpen,
}: {
  monsters: Monster[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBattle: (id: string) => void;
  onDelete: (id: string) => void;
  onRecapture: () => void;
  onOpen: (id: string) => void;
}) {
  const [compareId, setCompareId] = useState<string | null>(null);

  const selected = monsters.find((m) => m.id === activeId) ?? monsters[0];
  const compareTarget = useMemo(() => {
    if (!selected) return null;
    const byId = monsters.find((m) => m.id === compareId && m.id !== selected.id);
    return byId ?? monsters.find((m) => m.id !== selected.id) ?? null;
  }, [monsters, selected, compareId]);

  if (monsters.length === 0) {
    return (
      <section className="gallery">
        <div className="gallery-head">
          <div>
            <p className="eyebrow">图鉴 · 本地保存</p>
            <h2 className="h2">还没记录任何精灵</h2>
          </div>
        </div>
        <div className="empty-state">
          <MonsterSprite
            recipe={{ shape: 'blob', crest: 'none', accessory: 'none', palette: ['#E6E2D3', '#B9B4A4', '#FAF8EF'] }}
            title="空白卡位"
          />
          <p className="lede" style={{ textAlign: 'center' }}>
            拍下你的第一件物品，或者从样本抽屉里挑一个开始。
          </p>
          <button type="button" className="btn btn-primary" onClick={onRecapture}>
            去捕捉
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="gallery">
      <div className="gallery-head">
        <div>
          <p className="eyebrow">图鉴 · 本地保存</p>
          <h2 className="h2">已记录 {monsters.length} 只</h2>
          <p className="fineprint">
            只保存精灵卡数据（名称、属性、数值），照片不留存。上限 24 只，超出后最早的一只会被移除。
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onRecapture}>
          再拍一只
        </button>
      </div>

      <div className="gallery-grid">
        {monsters.map((monster) => {
          const record = getRecord(monster);
          return (
            <div className="gallery-item" key={monster.id} data-active={monster.id === selected?.id}>
              <MonsterCard
                monster={monster}
                serial={serialOf(monsters, monster.id)}
                compact
                showTheme={false}
                showEvidence={false}
                onClick={() => {
                  onSelect(monster.id);
                  setCompareId(monster.id);
                }}
              />
              <span className="pick-mark">
                {monster.id === selected?.id ? '● 当前出战' : ''}
                {record.battles > 0 ? (
                  <span className="gallery-record" title={`胜率 ${winRate(record)}%`}>
                    {record.wins}W-{record.losses}L{record.streak > 1 ? ` · ${record.streak}连胜` : ''}
                  </span>
                ) : (
                  <span className="gallery-record gallery-record--empty">未出战</span>
                )}
              </span>
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, Math.min(3, 4 - monsters.length)) }).map((_, index) => (
          <button
            type="button"
            className="gallery-placeholder"
            onClick={onRecapture}
            key={`slot-${index}`}
            aria-label="空卡位，点击去捕捉"
          >
            <span className="gallery-placeholder-mark">{index === 0 ? '＋' : '·'}</span>
            <span className="mono">空卡位 {String(monsters.length + index + 1).padStart(3, '0')}</span>
            {index === 0 ? <span className="fineprint">拍下一件物品，填上这一格</span> : null}
          </button>
        ))}
      </div>

      {selected && monsters.length >= 2 ? (
        <div className="section-block">
          <span className="section-label">对比与出战</span>
          <div className="compare">
            {[selected, compareTarget].filter(Boolean).map((monster, index) => {
              const m = monster as Monster;
              const other = (index === 0 ? compareTarget : selected) as Monster | null;
              return (
                <div className="compare-col" key={m.id}>
                  <div className="compare-head">
                    <MonsterSprite recipe={m.visualRecipe} title={m.name} />
                    <div>
                      <b>{m.name}</b>
                      <p className="mono">
                        {ELEMENTS[m.element].name} · {SKILLS[m.skills[0]].name} / {SKILLS[m.skills[1]].name}
                      </p>
                      <p className="fineprint">
                        {getRecord(m).battles > 0
                          ? `战绩 ${getRecord(m).wins}W-${getRecord(m).losses}L · 胜率 ${winRate(getRecord(m))}%`
                          : '尚未出战'}
                      </p>
                    </div>
                  </div>
                  {STATS.map((key) => {
                    const better = other ? m.stats[key] > other.stats[key] : false;
                    return (
                      <div className="compare-row" key={key}>
                        <span>{LABEL[key]}</span>
                        <b className={better ? 'compare-win' : ''}>
                          {m.stats[key]}
                          {better ? ' ▲' : ''}
                        </b>
                      </div>
                    );
                  })}
                  <div className="compare-row">
                    <span>对另一只倍率</span>
                    <b>{other ? `×${typeMultiplier(m.element, other.element).toFixed(2)}` : '—'}</b>
                  </div>
                  <div className="reveal-actions" style={{ marginTop: 4 }}>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => onBattle(m.id)}>
                      出战
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => onOpen(m.id)}>
                      查看卡
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onDelete(m.id)}
                      aria-label={`删除 ${m.name}`}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : selected ? (
        <div className="single-note">
          <div>
            <span className="mono">当前出战</span>
            <p>
              <b>{selected.name}</b> · {ELEMENTS[selected.element].name} ·{' '}
              {SKILLS[selected.skills[0]].name} / {SKILLS[selected.skills[1]].name}
            </p>
            <p className="fineprint">再捕捉一只，就能在这里逐项对比数值与招式，选出更适合出场的那只。</p>
          </div>
          <div className="reveal-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={() => onBattle(selected.id)}>
              出战
            </button>
            <button type="button" className="btn btn-small" onClick={() => onOpen(selected.id)}>
              查看卡
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onDelete(selected.id)}>
              删除
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
