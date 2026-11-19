import { useEffect, useMemo, useState } from 'react';
import type { Element, Monster, TacticId } from '../../shared/types';
import { ELEMENTS, ELEMENT_ORDER, typeMultiplier } from './elements';
import { SKILLS } from './skills';
import { ENEMIES, getEnemy, matchupHint } from './enemies';
import { MonsterCard } from './MonsterCard';
import { MonsterSprite } from './MonsterSprite';
import { modeLabel } from '../../shared/ai/client';
import { TACTICS, TACTIC_LIST, recommendTactic } from './tactics';
import { getRecord, winRate } from './store';

function relations(element: Element) {
  const beats: Element[] = [];
  const beatenBy: Element[] = [];
  for (const other of ELEMENT_ORDER) {
    if (other === element) continue;
    const mult = typeMultiplier(element, other);
    if (mult > 1) beats.push(other);
    if (mult < 1) beatenBy.push(other);
  }
  return { beats, beatenBy };
}

export function CardView({
  monster,
  serial,
  onBattle,
  onRecapture,
  onShare,
  onGallery,
  shareBusy,
}: {
  monster: Monster;
  serial: string;
  onBattle: (enemyId: string, tacticId: TacticId) => void;
  onRecapture: () => void;
  onShare: () => void;
  onGallery: () => void;
  shareBusy: boolean;
}) {
  // 默认对手 = 属性最有利的一只，避免第一次出战就撞上被克关系
  const defaultEnemy = useMemo(
    () =>
      [...ENEMIES].sort(
        (a, b) => typeMultiplier(monster.element, b.element) - typeMultiplier(monster.element, a.element),
      )[0],
    [monster.element],
  );
  const [enemyId, setEnemyId] = useState(defaultEnemy.id);
  // 战术默认按当前对手的属性关系给出推荐；手动换对手时重新推荐
  const [tacticId, setTacticId] = useState<TacticId>(() =>
    recommendTactic(typeMultiplier(monster.element, defaultEnemy.element)),
  );
  useEffect(() => {
    const target = getEnemy(enemyId);
    if (!target) return;
    setTacticId(recommendTactic(typeMultiplier(monster.element, target.element)));
  }, [enemyId, monster.element]);

  const meta = ELEMENTS[monster.element];
  const rel = useMemo(() => relations(monster.element), [monster.element]);
  const selectedEnemy = getEnemy(enemyId) ?? ENEMIES[0];
  const selectedMult = typeMultiplier(monster.element, selectedEnemy.element);
  const record = getRecord(monster);

  return (
    <section className="reveal">
      <div className="reveal-card-wrap">
        <MonsterCard monster={monster} serial={serial} />
        <div className="reveal-actions">
          <button type="button" className="btn btn-small" onClick={onShare} disabled={shareBusy}>
            {shareBusy ? '正在导出…' : '保存精灵卡'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onGallery}>
            进入图鉴
          </button>
        </div>
        <p className="fineprint">分享图只包含这张卡的信息，不含你的照片和位置。</p>
      </div>

      <div className="reveal-body">
        <div className="reveal-title">
          <p className="eyebrow">捕获完成 · No.{serial}</p>
          <h2 className="h2">{monster.name}，已归档</h2>
          <p className="lede">
            {meta.name}属性 · {SKILLS[monster.skills[0]].name} / {SKILLS[monster.skills[1]].name}
            {monster.generationMode === 'live_ai'
              ? ' · 名称与设定由实时模型生成'
              : ' · 名称与设定由本地规则生成'}
          </p>
          {record.battles > 0 ? (
            <p className="record-line">
              战绩 {record.wins} 胜 {record.losses} 负 {record.draws > 0 ? `${record.draws} 平` : ''} · 胜率{' '}
              {winRate(record)}%
              {record.streak > 0 ? ` · 当前 ${record.streak} 连胜` : ''}
              {record.bestStreak > 1 ? ` · 最佳 ${record.bestStreak} 连胜` : ''}
            </p>
          ) : null}
        </div>

        <div className="section-block">
          <span className="section-label">来自照片的证据</span>
          <div className="tag-row">
            {monster.evidenceTags.map((tag) => (
              <span className="tag" data-accent={tag.startsWith('#')} key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <p className="fineprint">
            {monster.confidence === 'low'
              ? '这张图只做了像素级统计，物件类别是推断的 —— 你可以直接用它出战，或换一张更清楚的照片。'
              : '以上是照片里能确认的可见特征；数值与技能由规则引擎按这些特征计算，模型无法自行改写。'}
          </p>
        </div>

        <div className="section-block">
          <span className="section-label">属性与招式</span>
          <div className="profile-grid">
            <div className="profile-cell">
              <span className="mono">属性</span>
              <b style={{ color: meta.color }}>
                {meta.name} / {meta.en}
              </b>
              <p className="fineprint">{meta.desc}</p>
            </div>
            <div className="profile-cell">
              <span className="mono">克制关系</span>
              <p className="fineprint">
                克制：
                {rel.beats.length ? rel.beats.map((e) => ELEMENTS[e].name).join('、') : '无（中立属性）'}
                <br />
                被克：
                {rel.beatenBy.length ? rel.beatenBy.map((e) => ELEMENTS[e].name).join('、') : '无（中立属性）'}
              </p>
            </div>
          </div>
          <div className="skill-detail-list">
            {monster.skills.map((id) => {
              const skill = SKILLS[id];
              return (
                <div className="skill-detail" key={id}>
                  <span className="skill-detail-power">{skill.power > 0 ? skill.power : '—'}</span>
                  <div>
                    <b>{skill.name}</b>
                    <p className="fineprint">{skill.effect}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-block">
          <span className="section-label">选一个对手</span>
          <div className="enemy-list">
            {ENEMIES.map((enemy) => {
              const hint = matchupHint(monster, enemy);
              const good = hint.includes('克制') && !hint.includes('被克');
              const bad = hint.includes('被克');
              return (
                <button
                  type="button"
                  className="enemy-option"
                  key={enemy.id}
                  data-selected={enemy.id === enemyId}
                  onClick={() => setEnemyId(enemy.id)}
                >
                  <MonsterSprite recipe={enemy.visualRecipe} title={enemy.name} />
                  <span>
                    <span className="enemy-name">
                      {enemy.name}
                      <span className="enemy-hint" data-good={good} data-bad={bad}>
                        {hint}
                      </span>
                    </span>
                    <span className="enemy-sub">
                      {ELEMENTS[enemy.element].name} · HP {enemy.stats.hp} · 速度 {enemy.stats.speed}
                    </span>
                    <span className="enemy-sub">{enemy.taunt}</span>
                  </span>
                  <span className="mono">{enemy.id === enemyId ? '已选' : '选择'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="section-block">
          <span className="section-label">本局战术 · 三选一，整场生效</span>
          <div className="tactic-list">
            {TACTIC_LIST.map((tactic) => (
              <button
                type="button"
                className="tactic-option"
                key={tactic.id}
                data-selected={tactic.id === tacticId}
                onClick={() => setTacticId(tactic.id)}
              >
                <span className="tactic-short mono">{tactic.short}</span>
                <span className="tactic-main">
                  <b>{tactic.name}</b>
                  <span className="fineprint">{tactic.desc}</span>
                </span>
                <span className="mono">{tactic.id === tacticId ? '已选' : '选择'}</span>
              </button>
            ))}
          </div>
          <p className="fineprint">
            {TACTICS[tacticId].detail}
            {selectedMult < 0.99
              ? ' 当前对手属性克制你，「背水一战」会完整生效。'
              : selectedMult > 1.01
                ? ' 当前你属性占优，「快人一步」更主动。'
                : ''}
          </p>
        </div>

        <div className="reveal-actions">
          <button type="button" className="btn btn-primary" onClick={() => onBattle(enemyId, tacticId)}>
            出战 · 三回合
          </button>
          <button type="button" className="btn" onClick={onRecapture}>
            再拍一只
          </button>
        </div>

        <p className="fineprint">
          本卡生成方式：{modeLabel(monster.generationMode)}
          {monster.generationMode === 'demo'
            ? '。没有请求模型，名称、设定与造型都由本地规则生成。'
            : monster.generationMode === 'fallback'
              ? '。实时模型调用失败或超时，已由规则引擎接管。'
              : '。模型只决定名称、设定与造型；数值与本系攻击由规则引擎保证。'}
        </p>
      </div>
    </section>
  );
}
