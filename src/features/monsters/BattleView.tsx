import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BattleEvent, BattleState, Monster, SkillId, TacticId } from '../../shared/types';
import { ELEMENTS, matchupLabel, typeMultiplier } from './elements';
import { SKILLS } from './skills';
import { ENEMIES, getEnemy } from './enemies';
import {
  applyEnemyPlan,
  computeDamage,
  createBattle,
  describeOutcome,
  hpPercent,
  isValidAction,
  takeTurn,
} from './battle';
import { buildBattlePlanPayload } from './plan';
import { planEnemyAction } from '../../shared/ai/client';
import { TACTICS, tacticIsActive, tacticName } from './tactics';
import { MonsterSprite } from './MonsterSprite';

type Float = { id: number; side: 'player' | 'enemy'; amount: number; kind: 'damage' | 'heal' };

type PlanMeta = {
  round: number;
  status: 'pending' | 'live_ai' | 'fallback' | 'demo';
  model: string;
  latencyMs: number;
  note: string;
};

let floatId = 0;

function makeSeed(): string {
  return `seed-${Math.random().toString(36).slice(2, 8)}`;
}

function Fighter({
  side,
  name,
  element,
  liveHp,
  maxHp,
  stats,
  recipe,
  mood,
  shake,
  floats,
  status,
}: {
  side: 'player' | 'enemy';
  name: string;
  element: Monster['element'];
  liveHp: number;
  maxHp: number;
  stats: Monster['stats'];
  recipe: Monster['visualRecipe'];
  mood: 'idle' | 'happy' | 'hurt';
  shake: boolean;
  floats: Float[];
  status?: string;
}) {
  const meta = ELEMENTS[element];
  const pct = Math.max(0, Math.min(100, (liveHp / Math.max(1, maxHp)) * 100));
  const style = {
    '--fill': pct <= 30 ? 'var(--riso-red)' : side === 'player' ? 'var(--riso-blue)' : 'var(--riso-red)',
    '--pct': `${pct}%`,
  } as CSSProperties;

  return (
    <div className="fighter" data-side={side} data-shake={shake} data-fainted={liveHp <= 0}>
      <div className="fighter-art">
        <span className="fighter-glyph" aria-hidden="true">
          {meta.glyph}
        </span>
        <span className="fighter-sprite">
          <MonsterSprite recipe={recipe} mood={mood} title={`${name} 对战形象`} />
        </span>
        {floats
          .filter((f) => f.side === side)
          .map((f) => (
            <span className="damage-float" data-kind={f.kind} key={f.id} aria-hidden="true">
              {f.kind === 'heal' ? '+' : '-'}
              {f.amount}
            </span>
          ))}
        <span className="fighter-plate mono">
          {side === 'player' ? '我方' : '敌方'} · {meta.name}
        </span>
      </div>

      <div className="fighter-head">
        <span className="fighter-name">{name}</span>
        {status ? (
          <span className="fighter-status mono" data-bad={status.includes('危险')}>
            {status}
          </span>
        ) : null}
      </div>

      <div className="hp-block" style={style} data-low={pct <= 30}>
        <div className="hp-line">
          <span>HP</span>
          <span className="hp-num">
            {Math.max(0, liveHp)}
            <small>/{maxHp}</small>
          </span>
        </div>
        <div className="ruler" aria-hidden="true">
          <div className="ruler-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="fighter-stats mono">
        <span>ATK {stats.attack}</span>
        <span>DEF {stats.defense}</span>
        <span>SPD {stats.speed}</span>
      </div>
    </div>
  );
}

function FeedLine({ event }: { event: BattleEvent }) {
  const who =
    event.actor === 'player'
      ? '我方'
      : event.actor === 'enemy'
        ? '敌方'
        : event.kind === 'end'
          ? '判定'
          : '局面';
  return (
    <div className="feed-line" data-actor={event.actor} data-kind={event.kind}>
      <span className="feed-who">
        R{event.round} {who}
      </span>
      <span className="feed-text">
        {event.text}
        {event.note ? <span className="feed-note">{event.note}</span> : null}
      </span>
    </div>
  );
}

export function BattleView({
  monster,
  enemyId,
  tacticId = null,
  seed = null,
  preferLive = false,
  aiAvailable = false,
  onFinish,
  onExit,
}: {
  monster: Monster;
  enemyId: string;
  tacticId?: TacticId | null;
  seed?: string | null;
  preferLive?: boolean;
  aiAvailable?: boolean;
  onFinish: (battle: BattleState) => void;
  onExit: () => void;
}) {
  const enemy = useMemo(() => getEnemy(enemyId) ?? ENEMIES[0], [enemyId]);
  const [battle, setBattle] = useState<BattleState>(() =>
    createBattle(monster, enemy, seed ?? makeSeed(), { tactic: tacticId }),
  );
  const [floats, setFloats] = useState<Float[]>([]);
  const [shake, setShake] = useState<'player' | 'enemy' | null>(null);
  const [planMeta, setPlanMeta] = useState<PlanMeta | null>(() =>
    preferLive && aiAvailable
      ? { round: 1, status: 'pending', model: '', latencyMs: 0, note: '' }
      : null,
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const planRun = useRef(0);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [battle.log.length]);

  /** 每回合请求一次敌方 AI 决策；首回合等待（最多 7 秒），后续回合预取不阻塞输入 */
  useEffect(() => {
    if (!preferLive || !aiAvailable || battle.outcome) return;
    const round = battle.round;
    const run = planRun.current + 1;
    planRun.current = run;
    let cancelled = false;
    const controller = new AbortController();

    const payload = buildBattlePlanPayload(battle, enemy);
    setPlanMeta({ round, status: 'pending', model: '', latencyMs: 0, note: '' });

    void planEnemyAction(payload, enemy.skills, {
      preferLive,
      timeoutMs: round === 1 ? 8000 : 12000,
      signal: controller.signal,
    }).then((result) => {
      if (cancelled || planRun.current !== run) return;
      if (result.plan) {
        setBattle((prev) =>
          prev.round === round && !prev.outcome
            ? applyEnemyPlan(prev, result.plan!, { model: result.model, latencyMs: result.latencyMs })
            : prev,
        );
        setPlanMeta({
          round,
          status: 'live_ai',
          model: result.model,
          latencyMs: result.latencyMs,
          note: result.note,
        });
      } else {
        setPlanMeta({
          round,
          status: result.mode === 'demo' ? 'demo' : 'fallback',
          model: '',
          latencyMs: result.latencyMs,
          note: result.note,
        });
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // 只在回合推进时重新请求；battle 快照由触发时的闭包提供
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.round, battle.outcome, preferLive, aiAvailable, enemy]);

  const skipPlanning = () => {
    planRun.current += 1;
    setPlanMeta({ round: battle.round, status: 'fallback', model: '', latencyMs: 0, note: '手动跳过，按规则意图出招' });
  };

  const play = (skill: SkillId) => {
    if (!isValidAction(battle, skill)) return;
    const next = takeTurn(battle, skill);

    const playerLost = Math.max(0, battle.player.hp - next.player.hp);
    const enemyLost = Math.max(0, battle.enemy.hp - next.enemy.hp);
    const playerHealed = Math.max(0, next.player.hp - battle.player.hp);
    const enemyHealed = Math.max(0, next.enemy.hp - battle.enemy.hp);

    const newFloats: Float[] = [];
    if (enemyLost > 0) newFloats.push({ id: (floatId += 1), side: 'enemy', amount: enemyLost, kind: 'damage' });
    if (playerLost > 0) newFloats.push({ id: (floatId += 1), side: 'player', amount: playerLost, kind: 'damage' });
    if (playerHealed > 0) newFloats.push({ id: (floatId += 1), side: 'player', amount: playerHealed, kind: 'heal' });
    if (enemyHealed > 0) newFloats.push({ id: (floatId += 1), side: 'enemy', amount: enemyHealed, kind: 'heal' });

    setFloats((prev) => [...prev, ...newFloats]);
    setShake(playerLost > 0 ? 'player' : enemyLost > 0 ? 'enemy' : null);
    setBattle(next);
    planRun.current += 1;

    timers.current.push(
      window.setTimeout(() => {
        setFloats((prev) => prev.filter((f) => !newFloats.some((n) => n.id === f.id)));
      }, 1100),
    );
    timers.current.push(window.setTimeout(() => setShake(null), 420));
  };

  const restart = () => {
    planRun.current += 1;
    setFloats([]);
    setPlanMeta(preferLive && aiAvailable ? { round: 1, status: 'pending', model: '', latencyMs: 0, note: '' } : null);
    setBattle(createBattle(monster, enemy, makeSeed(), { tactic: tacticId }));
  };

  const outcomeInfo = describeOutcome(battle);
  const intent = battle.intent;
  const weatherBoost = battle.weather.boostElement
    ? `${ELEMENTS[battle.weather.boostElement].name} +3`
    : '无属性加成';
  const matchup = typeMultiplier(monster.element, enemy.element);
  const countered = matchup < 0.99;
  const tacticActive = tacticIsActive(tacticId, countered);
  const aiDecisions = battle.planLog.filter((record) => record.source === 'ai').length;
  const aiPlanning =
    preferLive &&
    aiAvailable &&
    !battle.outcome &&
    battle.round === 1 &&
    planMeta?.round === 1 &&
    planMeta.status === 'pending';
  const intentSource = battle.round === 1 && aiPlanning ? 'pending' : (intent?.source ?? 'rule');
  const lethalForecast = (() => {
    if (!intent || intent.estimatedDamage <= 0) return null;
    const after = battle.player.hp - intent.estimatedDamage;
    return after <= 0 ? '这一击会让你倒下' : `这一击后你还剩 ${after} HP`;
  })();

  return (
    <section className="battle" data-tactic={tacticId ?? 'none'}>
      <div className="battle-head">
        <div className="battle-meta">
          <span className="mono">
            回合 {Math.min(battle.round, battle.maxRounds)} / {battle.maxRounds}
          </span>
          <div className="round-track" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span
                className="round-dot"
                key={n}
                data-state={
                  battle.outcome
                    ? 'done'
                    : n < battle.round
                      ? 'done'
                      : n === battle.round
                        ? 'now'
                        : 'wait'
                }
              >
                {n}
              </span>
            ))}
          </div>
          <span className="mono">种子 {battle.seed.slice(-5)}</span>
          {tacticId ? (
            <span className="stamp" data-tone={tacticActive ? 'red' : 'blue'} title={TACTICS[tacticId].detail}>
              战术 · {tacticName(tacticId)}
              {tacticActive ? '' : '（未触发）'}
            </span>
          ) : null}
          {preferLive && aiAvailable ? (
            <span className="stamp" data-tone="blue" title="AI 决策次数：结算页可核对">
              AI 选招 {aiDecisions}/{battle.planLog.length || 0}
            </span>
          ) : null}
        </div>
        <div className="battle-meta">
          <span className="stamp" data-tone="blue">
            {battle.weather.name} · {weatherBoost}
          </span>
          <button type="button" className="log-toggle" onClick={onExit}>
            退出对战
          </button>
        </div>
      </div>

      <div className="arena" data-finished={Boolean(battle.outcome)}>
        {battle.outcome ? (
          <div className="battle-stamp" data-outcome={battle.outcome} aria-live="polite">
            {outcomeInfo.title}
          </div>
        ) : null}
        {battle.round > 1 && !battle.outcome ? (
          <div className="round-flash" key={battle.round} aria-hidden="true">
            第 {battle.round} 回合
          </div>
        ) : null}

        <Fighter
          side="player"
          name={monster.name}
          element={monster.element}
          liveHp={battle.player.hp}
          maxHp={battle.player.stats.hp}
          stats={monster.stats}
          recipe={monster.visualRecipe}
          mood={battle.outcome === 'win' ? 'happy' : hpPercent(battle.player) < 35 ? 'hurt' : 'idle'}
          shake={shake === 'player'}
          floats={floats}
          status={
            battle.player.guard
              ? '防御中'
              : battle.player.feintBonus > 0
                ? '蓄力 +8'
                : hpPercent(battle.player) < 30
                  ? '危险'
                  : undefined
          }
        />
        <div className="arena-mid">
          <span className="versus">对</span>
          <span className="versus-note">
            {battle.outcome ? '结束' : matchupLabel(matchup)}
          </span>
        </div>
        <Fighter
          side="enemy"
          name={enemy.name}
          element={enemy.element}
          liveHp={battle.enemy.hp}
          maxHp={enemy.stats.hp}
          stats={enemy.stats}
          recipe={enemy.visualRecipe}
          mood={battle.outcome === 'lose' ? 'hurt' : hpPercent(battle.enemy) < 35 ? 'hurt' : 'idle'}
          shake={shake === 'enemy'}
          floats={floats}
          status={battle.enemy.guard ? '防御中' : undefined}
        />
      </div>

      {battle.outcome ? (
        <div className="result-banner" data-outcome={battle.outcome}>
          <div>
            <span className="mono">结算 · {outcomeInfo.title}</span>
            <p className="result-banner-text">{outcomeInfo.detail}</p>
            {aiDecisions > 0 ? (
              <p className="fineprint">
                本局敌方 AI 选招 {aiDecisions}/{battle.planLog.length} 回合；伤害与胜负仍由规则引擎结算。
              </p>
            ) : null}
          </div>
          <div className="reveal-actions">
            <button type="button" className="btn btn-primary btn-small" onClick={() => onFinish(battle)}>
              查看结算
            </button>
            <button type="button" className="btn btn-small" onClick={restart}>
              同对手再来一局
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="intent" data-source={intentSource} data-live={intentSource === 'ai'}>
            <span className="intent-label">
              {intentSource === 'pending'
                ? 'AI 盘算中'
                : intentSource === 'ai'
                  ? 'AI 选招'
                  : planMeta?.round === battle.round && planMeta.status === 'pending'
                    ? '规则意图 · AI 盘算中'
                    : '敌方意图'}
            </span>
            <span className="intent-text">
              {intentSource === 'pending' ? (
                <>
                  敌方正在根据当前局面选招
                  <span className="intent-wait-dot" aria-hidden="true" />
                  <button type="button" className="inline-link" onClick={skipPlanning}>
                    不等了
                  </button>
                </>
              ) : (
                <>
                  预计使用 <b>「{SKILLS[intent?.skill ?? 'STRIKE'].name}」</b>
                  {intent?.priority ? '（优先行动）' : ''} · {intent?.reason ?? '观察中'}
                  {intent?.taunt ? <span className="intent-taunt">「{intent.taunt}」</span> : null}
                </>
              )}
            </span>
            <span className="intent-dmg">
              {intentSource === 'pending'
                ? '等待中'
                : intent && intent.estimatedDamage > 0
                  ? `预计 ${intent.estimatedDamage} 伤害`
                  : '无直接伤害'}
              {intentSource !== 'pending' && lethalForecast ? (
                <em className="intent-lethal" data-danger={battle.player.hp - (intent?.estimatedDamage ?? 0) <= 0}>
                  {lethalForecast}
                </em>
              ) : null}
            </span>
          </div>

          <div className="moves">
            {monster.skills.map((id) => {
              const skill = SKILLS[id];
              const forecast =
                skill.kind === 'attack' || skill.kind === 'buff'
                  ? computeDamage(battle.player, battle.enemy, id, battle.weather)
                  : null;
              return (
                <button
                  type="button"
                  className="move"
                  key={id}
                  onClick={() => play(id)}
                  disabled={aiPlanning}
                  style={{ '--el': ELEMENTS[monster.element].color } as CSSProperties}
                >
                  <span className="move-power">
                    {skill.power > 0 ? skill.power : '—'}
                    <small>{skill.kind === 'attack' || skill.kind === 'buff' ? 'POWER' : 'UTIL'}</small>
                  </span>
                  <span className="move-main">
                    <span className="move-name">{skill.name}</span>
                    <span className="move-effect">{skill.effect}</span>
                    {forecast ? (
                      <span className="move-forecast">
                        预计 {forecast.damage} 伤害 · {matchupLabel(forecast.multiplier)}
                        {forecast.boost > 0 ? ' · 天气 +3' : ''}
                        {forecast.guarded ? ' · 对方防御' : ''}
                      </span>
                    ) : (
                      <span className="move-forecast">
                        {skill.kind === 'heal'
                          ? battle.player.recoverUsed
                            ? '本局已用过'
                            : '+16 HP'
                          : '本回合减伤一半'}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="feed" ref={feedRef} aria-live="polite">
        {battle.log.map((event, index) => (
          <FeedLine event={event} key={`${event.round}-${index}-${event.kind}`} />
        ))}
      </div>

      {planMeta && !battle.outcome ? (
        <p className="battle-plan-note" data-status={planMeta.status}>
          {planMeta.status === 'live_ai'
            ? `敌方由 AI 选招 · ${planMeta.model || 'model'} · ${planMeta.latencyMs}ms`
            : planMeta.status === 'pending'
              ? '正在请求 AI 决策…'
              : planMeta.status === 'demo'
                ? '演示模式：敌方按规则出招（未请求模型）'
                : `AI 不可用，已回落到规则意图：${planMeta.note}`}
        </p>
      ) : null}
    </section>
  );
}
