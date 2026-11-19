import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CrestKind } from '../../shared/types';
import type { ExpeditionBattleState, PlayerMainAction, PlayerSupportAction, StatusStack } from '../domain/types';
import { ENEMY_ACTION_LABEL, activeCreature, getLegalMainActions, getLegalSupportActions } from '../domain/battle2';
import { ACTIVE_BY_ID, LINK_BY_ID, SUPPORT_BY_ID } from '../content/modules';
import { PATH_META } from '../domain/tags';
import { ELEMENTS } from '../../features/monsters/elements';
import { MonsterSprite } from '../../features/monsters/MonsterSprite';

const ACTION_LABEL = ENEMY_ACTION_LABEL;

const STATUS_LABEL: Record<string, string> = {
  wet: '潮湿',
  vulnerable: '脆弱',
  shield: '护盾',
  charge: '蓄力',
  guard: '防御',
  mark: '标记',
  bind: '束缚',
  heat: '热度',
};

const ELEMENT_CREST: Record<string, CrestKind> = {
  water: 'wave',
  structure: 'frame',
  nature: 'petal',
  food: 'sesame',
  tool: 'gear',
};

function statusText(status: StatusStack): string {
  return status.id === 'shield' ? `护盾 ${status.stacks}` : `${STATUS_LABEL[status.id] ?? status.id} ×${status.stacks}`;
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="v2-bar-wrap">
      <div className="v2-bar" style={{ '--fill': color } as CSSProperties}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="v2-bar-label">
        {label} <b>{Math.max(0, Math.round(value))}</b> / {max}
      </span>
    </div>
  );
}

type Float = { id: number; side: 'enemy' | number; amount: number; kind: 'damage' | 'heal' };

export function BattleView2({
  battle,
  support,
  aiNote,
  planning,
  preferLive,
  onMain,
  onSupport,
  onExit,
}: {
  battle: ExpeditionBattleState;
  support: PlayerSupportAction | null;
  aiNote: string;
  planning: boolean;
  preferLive: boolean;
  onMain: (action: PlayerMainAction) => void;
  onSupport: (action: PlayerSupportAction | null) => void;
  onExit: () => void;
}) {
  const active = activeCreature(battle);
  const mainActions = getLegalMainActions(battle);
  const supportActions = getLegalSupportActions(battle);
  const skillActions = mainActions.filter(
    (action): action is { kind: 'skill'; skillId: string } => action.kind === 'skill',
  );
  const swapActions = mainActions.filter(
    (action): action is { kind: 'swap'; targetIndex: number } => action.kind === 'swap',
  );
  const guardLegal = mainActions.some((action) => action.kind === 'guard');
  const intent = battle.intent;
  const enemyElement = ELEMENTS[battle.enemy.def.element];
  const [floats, setFloats] = useState<Float[]>([]);
  const [shake, setShake] = useState<'enemy' | number | null>(null);
  const [roundFlash, setRoundFlash] = useState<number | null>(null);
  const prevBattle = useRef(battle);
  const timers = useRef<number[]>([]);
  const floatId = useRef(0);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const previous = prevBattle.current;
    if (previous === battle) return;
    prevBattle.current = battle;
    if (previous.fingerprint === battle.fingerprint && previous.round === battle.round) return;

    const next: Float[] = [];
    const enemyDelta = previous.enemy.hp - battle.enemy.hp;
    if (enemyDelta !== 0) {
      next.push({ id: (floatId.current += 1), side: 'enemy', amount: Math.abs(enemyDelta), kind: enemyDelta > 0 ? 'damage' : 'heal' });
    }
    battle.team.forEach((member, index) => {
      const delta = previous.team[index].hp - member.hp;
      if (delta !== 0) {
        next.push({ id: (floatId.current += 1), side: index, amount: Math.abs(delta), kind: delta > 0 ? 'damage' : 'heal' });
      }
    });
    if (next.length > 0) {
      setFloats(next);
      const hurtEnemy = next.some((item) => item.side === 'enemy' && item.kind === 'damage');
      const hurtPlayer = next.find((item) => item.side !== 'enemy' && item.kind === 'damage');
      setShake(hurtPlayer ? hurtPlayer.side : hurtEnemy ? 'enemy' : null);
      timers.current.push(window.setTimeout(() => setFloats([]), 1100));
      timers.current.push(window.setTimeout(() => setShake(null), 420));
    }
    if (battle.round > previous.round && !battle.outcome) {
      setRoundFlash(battle.round);
      timers.current.push(window.setTimeout(() => setRoundFlash(null), 900));
    }
  }, [battle]);

  const canSupport = (action: PlayerSupportAction): boolean =>
    supportActions.some((legal) =>
      legal.kind === 'support' && action.kind === 'support'
        ? legal.reserveIndex === action.reserveIndex
        : legal.kind === 'link' && action.kind === 'link'
          ? legal.linkId === action.linkId
          : false,
    );
  const supportKey = (action: PlayerSupportAction): string =>
    action.kind === 'support' ? `support:${action.reserveIndex}` : `link:${action.linkId}`;
  const supportFloats = (entity: 'enemy' | number) =>
    floats.filter((float) => float.side === entity).map((float) => (
      <span className="v2-float" data-kind={float.kind} key={float.id} aria-hidden="true">
        {float.kind === 'damage' ? '−' : '+'}
        {float.amount}
      </span>
    ));

  return (
    <section className="v2-battle">
      <div className="v2-battle-head">
        <div className="v2-battle-meta">
          <span className="v2-badge" data-kind="round">第 {battle.round} / {battle.maxRounds} 回合</span>
          <span className="v2-badge" data-kind="mode">{battle.rulesetVersion}</span>
          <span className="v2-badge" data-kind={intent?.source === 'ai' ? 'ai' : 'rule'}>
            {intent?.source === 'ai' ? 'AI 选招' : planning ? 'AI 盘算中' : '规则意图'}
          </span>
          <span className="v2-badge" data-kind="seed">种子 {battle.seed.slice(-5)}</span>
        </div>
        <div className="v2-battle-meta">
          <span className="v2-resonance" title="共鸣：换位 / 强技能 / 连携">
            <span className="v2-resonance-label">共鸣 {battle.resonance}</span>
            {Array.from({ length: 6 }).map((_, index) => (
              <i key={index} data-on={index < battle.resonance} />
            ))}
          </span>
          <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={onExit}>
            退出战斗
          </button>
        </div>
      </div>

      <div className="v2-battle-stage">
        {roundFlash ? (
          <div className="v2-round-flash" key={roundFlash} aria-hidden="true">
            第 {roundFlash} 回合
          </div>
        ) : null}
        <div className="v2-enemy-card" data-shake={shake === 'enemy'}>
          <div className="v2-enemy-head">
            <div>
              <span className="v2-rubric">敌方 · {battle.enemy.def.kind === 'boss' ? 'BOSS' : '回响灵'}</span>
              <h3 className="v2-enemy-name">{battle.enemy.def.name}</h3>
            </div>
            <div className="v2-enemy-badges">
              <span className="v2-badge" data-kind="element" style={{ '--badge': enemyElement.color } as CSSProperties}>
                <i />
                {enemyElement.name}属性
              </span>
              <span className="v2-badge" data-kind="phase">阶段 {battle.enemy.phase}</span>
            </div>
          </div>
          <div className="v2-enemy-body">
            <div className="v2-enemy-art">
              <span className="v2-enemy-glyph" aria-hidden="true">{enemyElement.glyph}</span>
              <MonsterSprite
                recipe={{
                  shape: battle.enemy.def.kind === 'boss' ? 'shard' : 'blob',
                  crest: ELEMENT_CREST[battle.enemy.def.element] ?? 'none',
                  accessory: 'none',
                  palette: ['#8FB6C6', enemyElement.color, '#E8F2F5'],
                }}
                mood={battle.enemy.hp <= battle.enemy.def.maxHp / 2 ? 'angry' : 'idle'}
                title={battle.enemy.def.name}
              />
              {supportFloats('enemy')}
            </div>
            <div className="v2-enemy-info">
              <Bar value={battle.enemy.hp} max={battle.enemy.def.maxHp} color="var(--riso-red)" label="HP" />
              <div className="v2-status-row">
                {battle.enemy.shield > 0 ? <span className="v2-status">护盾 {battle.enemy.shield}</span> : null}
                {battle.enemy.statuses.map((status) => (
                  <span className="v2-status" key={status.id}>{statusText(status)}</span>
                ))}
              </div>
              <div className="v2-intent" data-source={intent?.source ?? 'rule'}>
                <div className="v2-intent-head">
                  <span className="v2-rubric">下一步意图</span>
                  <b>{ACTION_LABEL[intent?.action ?? 'strike']}</b>
                  <span className="v2-intent-dmg">
                    {intent && intent.estimate > 0 ? `预计 ${intent.estimate} 伤害` : '无直接伤害'}
                  </span>
                </div>
                <p className="v2-intent-text">{intent?.text ?? '观察中'}</p>
                {intent?.reason ? <p className="v2-intent-reason">{intent.reason}</p> : null}
              </div>
            </div>
          </div>
          {aiNote ? <p className="v2-ai-note">{aiNote}</p> : null}
        </div>

        <div className="v2-party-board">
          {battle.team.map((member, index) => (
            <div
              className="v2-member"
              key={member.creature.id}
              data-active={index === battle.activeIndex}
              data-dead={!member.alive}
              data-shake={shake === index}
            >
              <span className="v2-member-art">
                <MonsterSprite recipe={member.creature.visual} mood={member.alive ? 'idle' : 'hurt'} title={member.creature.name} />
                {supportFloats(index)}
              </span>
              <div className="v2-member-main">
                <div className="v2-member-head">
                  <b>{member.creature.name}</b>
                  <span className="v2-badge" data-kind={index === battle.activeIndex ? 'active' : 'reserve'}>
                    {index === battle.activeIndex ? '主战' : '支援'}
                  </span>
                  <span className="v2-member-path" style={{ color: PATH_META[member.creature.buildPath].color }}>
                    {PATH_META[member.creature.buildPath].name}
                  </span>
                </div>
                <Bar value={member.hp} max={member.creature.stats.hp} color={index === battle.activeIndex ? 'var(--riso-blue)' : 'var(--riso-teal)'} label="HP" />
                <div className="v2-status-row">
                  {member.statuses.map((status) => (
                    <span className="v2-status" key={status.id}>{statusText(status)}</span>
                  ))}
                  {!member.alive ? <span className="v2-status" data-bad="true">倒下</span> : null}
                  {member.supportCd > 0 ? <span className="v2-status">支援冷却 {member.supportCd}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="v2-battle-deck">
        <div className="v2-deck-main">
          <span className="v2-rubric">主战行动 · {active.creature.name}</span>
          <div className="v2-skill-row">
            {skillActions.map((action) => {
              const module = ACTIVE_BY_ID.get(action.skillId)!;
              const cd = active.cooldowns[action.skillId] ?? 0;
              const disabled = cd > 0 || module.cost > battle.resonance;
              return (
                <button
                  type="button"
                  className="v2-skill"
                  key={action.skillId}
                  onClick={() => onMain(action)}
                  disabled={disabled || Boolean(battle.outcome)}
                >
                  <span className="v2-skill-head">
                    <span className="v2-badge" data-kind="cost">{module.cost ? `共鸣 ${module.cost}` : '免费'}</span>
                    {module.power > 0 ? <span className="v2-badge" data-kind="power">威力 {module.power}</span> : null}
                    {cd > 0 ? <span className="v2-badge" data-kind="cd">冷却 {cd}</span> : null}
                  </span>
                  <b>{module.name}</b>
                  <span className="v2-skill-text">{module.text}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="v2-skill v2-skill-basic"
              onClick={() => onMain({ kind: 'basic' })}
              disabled={Boolean(battle.outcome)}
            >
              <span className="v2-skill-head">
                <span className="v2-badge" data-kind="cost">免费</span>
                <span className="v2-badge" data-kind="power">稳定</span>
              </span>
              <b>普通攻击</b>
              <span className="v2-skill-text">不消耗共鸣的保底攻击；技能冷却或共鸣不足时使用。</span>
            </button>
            <button
              type="button"
              className="v2-skill v2-skill-guard"
              onClick={() => onMain({ kind: 'guard' })}
              disabled={!guardLegal || Boolean(battle.outcome)}
            >
              <span className="v2-skill-head">
                <span className="v2-badge" data-kind="cost">共鸣 +1</span>
                <span className="v2-badge" data-kind="power">减伤 50%</span>
              </span>
              <b>稳住防御</b>
              <span className="v2-skill-text">本回合受到的伤害减半，并积累 1 点共鸣。</span>
            </button>
          </div>
        </div>

        <div className="v2-deck-sub">
          <span className="v2-rubric">换位 / 支援 / 连携</span>
          <div className="v2-support-row">
            {swapActions.map((action) => {
              const target = battle.team[action.targetIndex];
              return (
                <button
                  type="button"
                  className="v2-support-btn"
                  key={`swap-${action.targetIndex}`}
                  onClick={() => onMain(action)}
                  disabled={Boolean(battle.outcome)}
                >
                  <span className="v2-support-head">
                    <b>换位 · {target.creature.name}</b>
                    <span className="v2-badge" data-kind="cost">共鸣 1</span>
                  </span>
                  <span>新主战获得 4 点护盾，旧主战回 4 HP。</span>
                </button>
              );
            })}
            {supportActions.map((action) => {
              const isSupport = action.kind === 'support';
              const reserve = isSupport ? battle.team[action.reserveIndex] : null;
              const command = isSupport && reserve ? SUPPORT_BY_ID.get(reserve.creature.supportCommandId) : null;
              const link = !isSupport ? LINK_BY_ID.get(action.linkId) : null;
              const selected = support ? supportKey(support) === supportKey(action) : false;
              return (
                <button
                  type="button"
                  className="v2-support-btn"
                  key={isSupport ? `support-${action.reserveIndex}` : `link-${action.linkId}`}
                  data-active={selected}
                  onClick={() => onSupport(selected ? null : action)}
                  disabled={Boolean(battle.outcome) || (support !== null && !selected && !canSupport(action))}
                >
                  <span className="v2-support-head">
                    <b>{isSupport ? `${reserve?.creature.name} · ${command?.name}` : `连携 · ${link?.name}`}</b>
                    <span className="v2-badge" data-kind={isSupport ? 'support' : 'link'}>{selected ? '已备' : '准备'}</span>
                  </span>
                  <span>{isSupport ? command?.text : link?.text}</span>
                </button>
              );
            })}
            {supportActions.length === 0 ? <p className="fineprint">本回合没有可用支援（冷却中或共鸣不足）。</p> : null}
          </div>
          {support ? <p className="v2-support-hint">已准备支援；选择左侧任一主战行动即可结算本回合。</p> : null}
        </div>

        <aside className="v2-battle-log">
          <span className="v2-rubric">战报 · {battle.log.length} 条</span>
          <div className="v2-log" aria-live="polite">
            {battle.log.slice(-6).map((event, index) => (
              <div className="v2-log-line" data-kind={event.kind} key={`${event.round}-${index}-${event.kind}`}>
                <span className="v2-log-round">R{event.round}</span>
                <span>{event.text}</span>
                {event.detail ? <span className="v2-log-detail">{event.detail}</span> : null}
              </div>
            ))}
          </div>
          {!preferLive ? <p className="fineprint">当前为规则出招模式；开启实时 AI 后 Boss 会在合法行动中自主选招。</p> : null}
        </aside>
      </div>

      {battle.outcome ? (
        <div className="v2-battle-end" data-outcome={battle.outcome}>
          <b>{battle.outcome === 'win' ? '胜利' : battle.outcome === 'lose' ? '队伍全灭' : '平局'}</b>
          <span>本局敌方 AI 回合 {battle.planLog.filter((item) => item.source === 'ai').length} / {battle.planLog.length}</span>
        </div>
      ) : null}
    </section>
  );
}



