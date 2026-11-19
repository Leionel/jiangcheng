import type { CSSProperties } from 'react';
import type { Monster, MonsterStats, SkillId } from '../../shared/types';
import { ELEMENTS } from './elements';
import { SKILLS } from './skills';
import { MonsterSprite, type Mood } from './MonsterSprite';
import { modeLabel } from '../../shared/ai/client';

const STAT_LABEL: Record<keyof MonsterStats, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  speed: 'SPD',
};

const STAT_MAX: Record<keyof MonsterStats, number> = {
  hp: 100,
  attack: 35,
  defense: 20,
  speed: 20,
};

export function StatRows({ stats, compact = false }: { stats: MonsterStats; compact?: boolean }) {
  return (
    <div className="card-stats">
      {(Object.keys(STAT_LABEL) as Array<keyof MonsterStats>).map((key) => (
        <div className="stat-row" key={key}>
          <span className="stat-label">{STAT_LABEL[key]}</span>
          <div className="ruler" aria-hidden="true">
            <div className="ruler-fill" style={{ width: `${(stats[key] / STAT_MAX[key]) * 100}%` }} />
          </div>
          <span className="stat-value" aria-label={`${STAT_LABEL[key]} ${stats[key]}`}>
            {stats[key]}
          </span>
        </div>
      ))}
      {compact ? null : <span className="fineprint">刻度上限 HP100 / ATK35 / DEF20 / SPD20</span>}
    </div>
  );
}

export function MonsterCard({
  monster,
  serial,
  compact = false,
  mood = 'idle',
  showTheme = true,
  showEvidence = true,
  onClick,
}: {
  monster: Monster;
  serial?: string;
  compact?: boolean;
  mood?: Mood;
  showTheme?: boolean;
  showEvidence?: boolean;
  onClick?: () => void;
}) {
  const meta = ELEMENTS[monster.element];
  const style = { '--el': meta.color } as CSSProperties;

  const body = (
    <>
      <span className="card-register" aria-hidden="true" />
      <div className="card-top">
        <span className="mono">No.{serial ?? '—'}</span>
        <span className="mono">{monster.source === 'demo' ? '样本捕获' : '自拍捕获'}</span>
      </div>

      <div className="card-art">
        <span className="card-glyph" aria-hidden="true">
          {meta.glyph}
        </span>
        <MonsterSprite
          recipe={monster.visualRecipe}
          mood={mood}
          title={`${monster.name}（${meta.name}属性）`}
          svgId={`sprite-${monster.id}`}
        />
        <span className="el-badge" aria-label={`属性 ${meta.name}`}>
          <span className="el-badge-glyph">{meta.glyph}</span>
          <span className="el-badge-name">{meta.name}</span>
        </span>
      </div>

      <div className="card-title">
        <h3 className="card-name">{monster.name}</h3>
        <span className="card-mode mono" data-mode={monster.generationMode}>
          {modeLabel(monster.generationMode)}
        </span>
      </div>

      {showTheme ? <p className="card-theme">{monster.theme}</p> : null}

      <StatRows stats={monster.stats} compact={compact} />

      <div className="card-skills">
        {monster.skills.map((id: SkillId) => (
          <span className="skill-chip" key={id}>
            <b>{SKILLS[id].name}</b>
            <i>{SKILLS[id].power > 0 ? SKILLS[id].power : '—'}</i>
          </span>
        ))}
      </div>

      {showEvidence ? (
        <div className="tag-row">
          {monster.evidenceTags.slice(0, 5).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="card-foot">
        <span>
          {monster.model ? `LIVE · ${monster.model}` : `JIANGCHENG · ${meta.en.toUpperCase()}`}
        </span>
        <span>
          {monster.createdAt === 0
            ? '样本卡'
            : new Date(monster.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <div
        className="card card--clickable"
        style={style}
        data-compact={compact}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
        aria-label={`选择 ${monster.name}`}
      >
        {body}
      </div>
    );
  }

  return (
    <article className="card" style={style} data-compact={compact}>
      {body}
    </article>
  );
}
