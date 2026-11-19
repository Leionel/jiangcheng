import type { CSSProperties } from 'react';
import type { ExpeditionBattleState, EnemyActionId, PlayerMainAction, PlayerSupportAction, StatusStack } from '../domain/types';
import { activeCreature, getLegalMainActions, getLegalSupportActions } from '../domain/battle2';
import { ACTIVE_BY_ID, LINK_BY_ID, SUPPORT_BY_ID } from '../content/modules';
import { PATH_META } from '../domain/tags';
import { MonsterSprite } from '../../features/monsters/MonsterSprite';

const ACTION_LABEL: Record<EnemyActionId, string> = {
  strike: '单体攻击',
  guard: '收拢防御',
  gather: '蓄势',
  storm: '暴雨',
  deluge: '积水成渊',
};

const STATUS_LABEL: Record<string, string> = {
  wet: '潮湿',
  vulnerable: '脆弱',
  shield: '护盾',
  charge: '蓄力',
  guard: '防御',
  mark: '标记',
  bind: '束缚',
};

function statusText(status: StatusStack): string {
  if (status.id === 'shield') return `护盾 ${status.stacks}`;
  return `${STATUS_LABEL[status.id] ?? status.id}×${status.stacks}`;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="v2-bar" style={{ '--fill': color } as CSSProperties}>
      <span style={{ width: `${pct}%` }} />
      <em>
        {Math.max(0, Math.round(value))}/{max}
      </em>
    </div>
  );
}

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

  return (
    <section className="v2-battle">
      <div className="v2-battle-head">
        <div className="v2-battle-meta">
          <span className="mono">第 {battle.round} / {battle.maxRounds} 回合</span>
          <span className="mono">种子 {battle.seed.slice(-5)}</span>
          <span className="v2-stamp" data-tone="blue">{battle.rulesetVersion}</span>
          <span className="v2-stamp" data-tone={intent?.source === 'ai' ? 'red' : 'blue'}>
            {intent?.source === 'ai' ? 'AI 选招' : '规则意图'}
          </span>
        </div>
        <div className="v2-battle-meta">
          <span className="v2-resonance" title="共鸣：换位/强技能/连携">
            共鸣
            {Array.from({ length: 6 }).map((_, index) => (
              <i key={index} data-on={index < battle.resonance} />
            ))}
          </span>
          <button type="button" className="v2-link-btn" onClick={onExit}>
            退出战斗
          </button>
        </div>
      </div>

      <div className="v2-arena">
        <div className="v2-enemy-card">
          <div className="v2-fighter-head">
            <div>
              <p className="eyebrow">敌方 · {battle.enemy.def.kind === 'boss' ? 'Boss' : '回响灵'}</p>
              <h3 className="v2-fighter-name">{battle.enemy.def.name}</h3>
            </div>
            <span className="v2-stamp" data-tone="red">阶段 {battle.enemy.phase}</span>
          </div>
          <div className="v2-enemy-art">
            <MonsterSprite
              recipe={{
                shape: battle.enemy.def.kind === 'boss' ? 'shard' : 'blob',
                crest: 'wave',
                accessory: 'none',
                palette: ['#8FB6C6', '#2C6E8F', '#E8F2F5'],
              }}
              mood={battle.enemy.hp <= battle.enemy.def.maxHp / 2 ? 'angry' : 'idle'}
              title={battle.enemy.def.name}
            />
            <span className="v2-enemy-glyph" aria-hidden="true">
              江
            </span>
          </div>
          <Bar value={battle.enemy.hp} max={battle.enemy.def.maxHp} color="var(--riso-red)" />
          <div className="v2-status-row">
            {battle.enemy.shield > 0 ? <span className="v2-status">护盾 {battle.enemy.shield}</span> : null}
            {battle.enemy.statuses.map((status) => (
              <span className="v2-status" key={status.id}>
                {statusText(status)}
              </span>
            ))}
          </div>
          <div className="v2-intent" data-source={intent?.source ?? 'rule'}>
            <span className="mono">
              {planning && intent?.source !== 'ai' ? 'AI 盘算中…' : '敌方意图'}
            </span>
            <b>{ACTION_LABEL[intent?.action ?? 'strike']}</b>
            <span>{intent?.text ?? '观察中'}</span>
            <span className="v2-intent-dmg">
              {intent && intent.estimate > 0 ? `预计 ${intent.estimate} 伤害` : '无直接伤害'}
            </span>
            {intent?.reason ? <span className="v2-intent-reason">{intent.reason}</span> : null}
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
            >
              <span className="v2-member-art">
                <MonsterSprite recipe={member.creature.visual} mood={member.alive ? 'idle' : 'hurt'} title={member.creature.name} />
              </span>
              <div className="v2-member-main">
                <div className="v2-member-head">
                  <b>{member.creature.name}</b>
                  <span className="mono">{index === battle.activeIndex ? '主战' : '支援'} · {PATH_META[member.creature.buildPath].name}</span>
                </div>
                <Bar value={member.hp} max={member.creature.stats.hp} color={index === battle.activeIndex ? 'var(--riso-blue)' : 'var(--riso-teal)'} />
                <div className="v2-status-row">
                  {member.statuses.map((status) => (
                    <span className="v2-status" key={status.id}>{statusText(status)}</span>
                  ))}
                  {!member.alive ? <span className="v2-status" data-bad="true">倒下</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="v2-action-board">
        <div className="v2-action-col">
          <span className="mono">主战行动 · {active.creature.name}</span>
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
                  <span className="v2-skill-cost">{module.cost ? `共鸣 ${module.cost}` : '免费'}</span>
                  <b>{module.name}</b>
                  <span className="v2-skill-text">{module.text}</span>
                  {cd > 0 ? <span className="v2-skill-cd">冷却 {cd}</span> : null}
                </button>
              );
            })}
            <button
              type="button"
              className="v2-skill v2-skill-basic"
              onClick={() => onMain({ kind: 'basic' })}
              disabled={Boolean(battle.outcome)}
            >
              <span className="v2-skill-cost">免费</span>
              <b>普通攻击</b>
              <span className="v2-skill-text">不消耗共鸣的保底攻击；技能都在冷却或共鸣不够时使用。</span>
            </button>
            <button type="button" className="v2-skill v2-skill-guard" onClick={() => onMain({ kind: 'guard' })} disabled={!guardLegal || Boolean(battle.outcome)}>
              <span className="v2-skill-cost">+1 共鸣</span>
              <b>稳住防御</b>
              <span className="v2-skill-text">本回合受伤减半；没有技能可出时的保底选择。</span>
            </button>
          </div>
        </div>

        <div className="v2-action-col">
          <span className="mono">换位 / 支援 / 连携</span>
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
                  <b>换位 · {target.creature.name}</b>
                  <span>消耗 1 共鸣，新主战获 4 护盾</span>
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
                  <b>{isSupport ? `${reserve?.creature.name} · ${command?.name}` : `连携 · ${link?.name}`}</b>
                  <span>{isSupport ? command?.text : link?.text}</span>
                  <em>{selected ? '已准备' : '点击准备（再点取消）'}</em>
                </button>
              );
            })}
            {supportActions.length === 0 ? <p className="fineprint">本回合没有可用支援（冷却中/共鸣不足）。</p> : null}
          </div>
          {support ? <p className="v2-support-hint">已准备支援；选择左侧任一主战行动即可结算本回合。</p> : null}
        </div>
      </div>

      <div className="v2-log" aria-live="polite">
        {battle.log.slice(-9).map((event, index) => (
          <div className="v2-log-line" data-kind={event.kind} key={`${event.round}-${index}-${event.kind}`}>
            <span className="mono">R{event.round}</span>
            <span>{event.text}</span>
            {event.detail ? <span className="v2-log-detail">{event.detail}</span> : null}
          </div>
        ))}
      </div>
      {battle.outcome ? (
        <div className="v2-battle-end" data-outcome={battle.outcome}>
          <b>{battle.outcome === 'win' ? '胜利' : battle.outcome === 'lose' ? '队伍全灭' : '平局'}</b>
          <span>本局敌方 AI 回合 {battle.planLog.filter((item) => item.source === 'ai').length} / {battle.planLog.length}</span>
        </div>
      ) : null}
      {!preferLive ? <p className="fineprint v2-battle-note">当前为规则出招模式；开启实时 AI 后 Boss 会在合法行动中自主选招。</p> : null}
    </section>
  );
}
