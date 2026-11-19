import { useMemo } from 'react';
import type { BattleState, Monster } from '../../shared/types';
import { ELEMENTS, typeMultiplier } from './elements';
import { SKILLS } from './skills';
import type { Enemy } from '../../shared/types';
import { describeOutcome, hpPercent } from './battle';
import { tacticName } from './tactics';
import { getRecord, winRate } from './store';

export function ResultView({
  battle,
  monster,
  enemy,
  onRematch,
  onReplay,
  onRecapture,
  onGallery,
  onCard,
}: {
  battle: BattleState;
  monster: Monster;
  enemy: Enemy;
  onRematch: () => void;
  onReplay: () => void;
  onRecapture: () => void;
  onGallery: () => void;
  onCard: () => void;
}) {
  const info = describeOutcome(battle);
  const record = getRecord(monster);
  const AI_DECISIONS = battle.planLog.filter((item) => item.source === 'ai');
  const aiPlannedRounds = AI_DECISIONS.length;
  const planModels = Array.from(new Set(AI_DECISIONS.map((item) => item.model).filter(Boolean)));

  const playerHits = useMemo(
    () => battle.log.filter((e) => e.kind === 'damage' && e.actor === 'player'),
    [battle.log],
  );
  const enemyHits = useMemo(
    () => battle.log.filter((e) => e.kind === 'damage' && e.actor === 'enemy'),
    [battle.log],
  );

  const totalDealt = playerHits.reduce((sum, e) => sum + (e.damage ?? 0), 0);
  const biggest = [...playerHits].sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))[0];
  const biggestEnemy = [...enemyHits].sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))[0];
  const mult = typeMultiplier(monster.element, enemy.element);

  return (
    <section className="result">
      <div className="result-head">
        <div className="verdict" data-outcome={battle.outcome ?? 'draw'}>
          {info.title}
        </div>
        <div className="result-copy">
          <p className="eyebrow">对战结算 · 种子 {battle.seed.slice(-5)}</p>
          <h2 className="h2">
            {monster.name} <span style={{ color: 'var(--ink-faint)' }}>对</span> {enemy.name}
          </h2>
          <p className="lede">{info.detail}</p>
          <p className="record-line">
            当前战绩：{record.wins} 胜 {record.losses} 负
            {record.draws > 0 ? ` ${record.draws} 平` : ''} · 胜率 {winRate(record)}%
            {record.streak > 1 ? ` · ${record.streak} 连胜` : ''}
            {record.bestStreak > 1 ? ` · 最佳 ${record.bestStreak} 连胜` : ''}
          </p>
        </div>
      </div>

      <div className="result-grid">
        <div className="result-cell">
          <span className="result-cell-num">
            {Math.max(0, battle.player.hp)}
            <span style={{ fontSize: 15, color: 'var(--ink-faint)' }}>/{monster.stats.hp}</span>
          </span>
          <span className="result-cell-label">我方剩余 HP（{hpPercent(battle.player).toFixed(0)}%）</span>
        </div>
        <div className="result-cell">
          <span className="result-cell-num">{totalDealt}</span>
          <span className="result-cell-label">总造成伤害 · {playerHits.length} 次命中</span>
        </div>
        <div className="result-cell">
          <span className="result-cell-num">{battle.log.filter((e) => e.kind === 'damage').length}</span>
          <span className="result-cell-label">双方总命中次数 · {battle.round} 回合</span>
        </div>
      </div>

      <div className="result-body">
      <div className="section-block">
        <span className="section-label">本局决策复盘</span>
        <div className="calc-note">
          <span>
            战术：<b>{tacticName(battle.tactic)}</b>
            {battle.tactic ? '' : '（未选择战术，按 P0 规则结算）'}
          </span>
          <span>
            敌方出招：
            {aiPlannedRounds > 0
              ? `AI 决策 ${aiPlannedRounds}/${battle.planLog.length} 回合`
              : '全部由规则引擎决定（未调用模型或已降级）'}
            {planModels.length > 0 ? ` · ${planModels.join(' / ')}` : ''}
          </span>
          {battle.planLog.length > 0 ? (
            <span>
              AI 回合：
              {battle.planLog
                .map(
                  (item) =>
                    `R${item.round} ${SKILLS[item.skill].name}${
                      item.source === 'ai' ? '（AI）' : '（规则）'
                    }`,
                )
                .join(' · ')}
            </span>
          ) : null}
          <span>种子 {battle.seed} · 同一战术 + 同一出招顺序可完整复现。</span>
        </div>
      </div>

      <div className="section-block">
        <span className="section-label">关键行动</span>
        <div className="key-actions">
          {battle.log
            .filter((e) => e.kind === 'damage' || e.kind === 'guard' || e.kind === 'recover')
            .slice(-6)
            .map((event, index) => (
              <div className="key-action" key={`key-${index}`}>
                <span className="mono">
                  R{event.round} {event.actor === 'player' ? '我方' : '敌方'}
                </span>
                <span>
                  {event.skill ? SKILLS[event.skill].name : '行动'} · {event.text.replace(/^(我方|敌方)/, '')}
                </span>
                <span className="mono">{event.hpAfter !== undefined ? `HP ${event.hpAfter}` : ''}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="section-block">
        <span className="section-label">数值依据</span>
        <div className="calc-note">
          <span>伤害 = clamp( round( (威力 + 0.4×ATK − 0.25×DEF) × 克制系数 × 0.78 ), 5, 45 )</span>
          <span>
            属性关系：{ELEMENTS[monster.element].name} 对 {ELEMENTS[enemy.element].name} · ×
            {mult.toFixed(2)} · 天气「{battle.weather.name}」
          </span>
          {biggest ? (
            <span>
              最高一击：{SKILLS[biggest.skill ?? 'STRIKE'].name} · 威力{' '}
              {SKILLS[biggest.skill ?? 'STRIKE'].power} · ATK {monster.stats.attack} · DEF{' '}
              {enemy.stats.defense} → <b>{biggest.damage} 伤害</b>
            </span>
          ) : (
            <span>这一局我方没有造成伤害。</span>
          )}
          {biggestEnemy ? (
            <span>
              对手最高一击：{SKILLS[biggestEnemy.skill ?? 'STRIKE'].name} · <b>{biggestEnemy.damage} 伤害</b>
            </span>
          ) : null}
          <span>
            判定规则：先倒下一方即结束；三回合未分胜负则比剩余 HP 百分比，1 个百分点以内算平局。
          </span>
          <span>同一战斗种子 + 同一出招顺序 = 同一结果（种子 {battle.seed}）。</span>
        </div>
      </div>
      </div>

      <div className="reveal-actions">
        <button type="button" className="btn btn-primary" onClick={onRematch}>
          同对手再打一局
        </button>
        <button type="button" className="btn" onClick={onReplay}>
          复现本局
        </button>
        <button type="button" className="btn" onClick={onCard}>
          换个对手
        </button>
        <button type="button" className="btn" onClick={onRecapture}>
          再拍一只
        </button>
        <button type="button" className="btn btn-ghost" onClick={onGallery}>
          图鉴
        </button>
      </div>
    </section>
  );
}
