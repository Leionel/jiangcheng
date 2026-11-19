import type {
  BattleEvent,
  BattleOutcome,
  BattlePlanRecord,
  BattleSide,
  BattleState,
  Element,
  EnemyIntent,
  Monster,
  SkillId,
  TacticId,
  Weather,
} from '../../shared/types';
import { clamp, createRng, hashString } from '../../shared/rng';
import { typeMultiplier, WEATHER_LIST } from './elements';
import { SKILLS, dealsDamage } from './skills';
import { isTacticId, neutralBoons, tacticBoons, tacticName, TACTICS } from './tactics';
import type { Enemy } from '../../shared/types';

export const MAX_ROUNDS = 3;

/**
 * 平衡系数：让 3 回合内既能出现击倒、也不会一回合结束。
 * 公式结构与规格书 §4.7 一致，只在最后乘一个可调的缩放值。
 */
export const DAMAGE_SCALE = 0.78;

export function sideFromMonster(
  monster: Monster,
  tactic?: TacticId | null,
  enemyElement?: Element,
): BattleSide {
  const countered = enemyElement
    ? typeMultiplier(monster.element, enemyElement) < 0.99
    : false;
  return {
    name: monster.name,
    element: monster.element,
    stats: { ...monster.stats },
    skills: [...monster.skills],
    visualRecipe: monster.visualRecipe,
    hp: monster.stats.hp,
    guard: false,
    recoverUsed: false,
    feintBonus: 0,
    boons: tacticBoons(tactic, countered),
  };
}

export function sideFromEnemy(enemy: Enemy): BattleSide {
  return {
    name: enemy.name,
    element: enemy.element,
    stats: { ...enemy.stats },
    skills: [...enemy.skills],
    visualRecipe: enemy.visualRecipe,
    hp: enemy.stats.hp,
    guard: false,
    recoverUsed: false,
    feintBonus: 0,
    boons: neutralBoons(),
  };
}

export function weatherForSeed(seed: string): Weather {
  const rng = createRng(`${seed}|weather`);
  return WEATHER_LIST[Math.floor(rng() * WEATHER_LIST.length) % WEATHER_LIST.length];
}

function skillPower(skill: SkillId, side: BattleSide, weather: Weather): { power: number; boost: number } {
  const def = SKILLS[skill];
  let power = def.power;
  // 佯攻加成只作用于有威力的技能，且结算后清空
  if (def.power > 0 && side.feintBonus > 0) power += side.feintBonus;
  const boost = def.elemental && weather.boostElement === side.element ? 3 : 0;
  return { power: power + boost, boost };
}

export function computeDamage(
  attacker: BattleSide,
  defender: BattleSide,
  skill: SkillId,
  weather: Weather,
): { damage: number; multiplier: number; raw: number; boost: number; guarded: boolean } {
  const def = SKILLS[skill];
  if (def.kind === 'guard' || def.kind === 'heal') {
    return { damage: 0, multiplier: 1, raw: 0, boost: 0, guarded: false };
  }
  const { power, boost } = skillPower(skill, attacker, weather);
  const baseMultiplier = def.elemental ? typeMultiplier(attacker.element, defender.element) : 1;
  /**
   * 战术「背水一战」：只在属性被克、且是吃属性的招式时，把 0.80 抬到 1.10。
   * 系数固定、可复现；不做隐藏随机。
   */
  const comeback = attacker.boons.comebackMult;
  const multiplier =
    def.elemental && comeback !== null && baseMultiplier < 0.99 ? comeback : baseMultiplier;
  const raw = power + 0.4 * attacker.stats.attack - 0.25 * defender.stats.defense;
  let damage = clamp(
    Math.round(
      raw *
        multiplier *
        DAMAGE_SCALE *
        attacker.boons.damageMult *
        defender.boons.damageTakenMult,
    ),
    5,
    45,
  );
  const guarded = defender.guard;
  if (guarded) damage = Math.max(1, Math.round(damage / 2));
  return { damage, multiplier, raw, boost, guarded };
}

/**
 * 敌方策略：完全确定性，且只使用当前可见状态。
 * 因此在玩家提交技能前，界面可以准确预告敌方下一步（可读的意图提示）。
 */
export function chooseIntent(state: BattleState): EnemyIntent {
  const { enemy, player, round, seed } = state;
  const rng = createRng(`${seed}|intent|${round}|${enemy.hp}|${player.hp}`);
  const hpRatio = enemy.hp / Math.max(1, enemy.stats.hp);
  const has = (id: SkillId) => enemy.skills.includes(id);

  if (hpRatio <= 0.34 && has('RECOVER') && !enemy.recoverUsed) {
    return {
      skill: 'RECOVER',
      estimatedDamage: 0,
      priority: false,
      reason: '血量偏低，打算先回一口气',
      source: 'rule',
    };
  }

  if (round >= 2 && has('GUARD') && rng() < 0.45) {
    return {
      skill: 'GUARD',
      estimatedDamage: 0,
      priority: true,
      reason: '上一轮挨得有点重，准备收力',
      source: 'rule',
    };
  }

  if (has('FEINT') && enemy.feintBonus === 0 && rng() < 0.22) {
    return {
      skill: 'FEINT',
      estimatedDamage: computeDamage(enemy, player, 'FEINT', state.weather).damage,
      priority: false,
      reason: '想先做一次铺垫',
      source: 'rule',
    };
  }

  const attacks = enemy.skills.filter((id) => dealsDamage(id) && id !== 'FEINT');
  const scored = attacks
    .map((id) => ({
      id,
      value: computeDamage(enemy, player, id, state.weather).damage + (SKILLS[id].priority > 0 ? 1.5 : 0),
    }))
    .sort((a, b) => b.value - a.value);

  if (scored.length === 0) {
    return { skill: 'STRIKE', estimatedDamage: 0, priority: false, reason: '没有可用攻击', source: 'rule' };
  }

  const best = scored[0];
  const bestSkill = SKILLS[best.id];
  const mult = bestSkill.elemental ? typeMultiplier(enemy.element, player.element) : 1;
  return {
    skill: best.id,
    estimatedDamage: computeDamage(enemy, player, best.id, state.weather).damage,
    priority: bestSkill.priority > 0,
    reason:
      mult > 1.01
        ? '属性占优，打算压上来'
        : mult < 0.99
          ? '属性吃亏，会挑最稳的一招'
          : '会挑伤害最高的一招',
    source: 'rule',
  };
}

export type CreateBattleOptions = {
  /** 赛前战术；不传或 null 时与 P0 行为完全一致 */
  tactic?: TacticId | null;
};

export function createBattle(
  player: Monster,
  enemy: Enemy,
  seed: string,
  options: CreateBattleOptions = {},
): BattleState {
  const weather = weatherForSeed(seed);
  const tactic = isTacticId(options.tactic) ? options.tactic : null;
  const log: BattleEvent[] = [
    {
      kind: 'round-start',
      round: 1,
      text: `第 1 回合开始 · 天气：${weather.name}`,
    },
  ];
  if (tactic) {
    log.push({
      kind: 'tactic',
      round: 1,
      text: `本局战术：${tacticName(tactic)}`,
      note: TACTICS[tactic].detail,
    });
  }
  const base: BattleState = {
    seed,
    tactic,
    weather,
    round: 1,
    maxRounds: MAX_ROUNDS,
    player: sideFromMonster(player, tactic, enemy.element),
    enemy: sideFromEnemy(enemy),
    log,
    outcome: null,
    intent: null,
    planLog: [],
  };
  return { ...base, intent: chooseIntent(base) };
}

/** 校验敌方提交的招式是否合法（AI 计划与 UI 共用） */
export function isValidEnemyAction(state: BattleState, skill: SkillId): boolean {
  return state.enemy.skills.includes(skill) && SKILLS[skill] !== undefined;
}

/**
 * 把 AI 选定的敌方招式写回战斗状态。
 *
 * 关键：这里只替换「敌方这一回合出哪一招」，伤害/胜负/先后手全部仍由 takeTurn 的纯函数计算。
 * 同一 seed + 同一计划序列 → 同一结果；非法或过期的计划会被忽略。
 */
export function applyEnemyPlan(
  state: BattleState,
  plan: { skill: SkillId; reason: string; taunt?: string },
  meta: { model?: string; latencyMs?: number } = {},
): BattleState {
  if (state.outcome) return state;
  if (!isValidEnemyAction(state, plan.skill)) return state;
  if (state.planLog.some((record) => record.round === state.round)) return state;

  const def = SKILLS[plan.skill];
  const estimated = computeDamage(state.enemy, state.player, plan.skill, state.weather).damage;
  const intent: EnemyIntent = {
    skill: plan.skill,
    estimatedDamage: def.kind === 'attack' || def.kind === 'buff' ? estimated : 0,
    priority: def.priority > 0,
    reason: plan.reason,
    source: 'ai',
    ...(plan.taunt ? { taunt: plan.taunt } : {}),
  };
  const record: BattlePlanRecord = {
    round: state.round,
    source: 'ai',
    skill: plan.skill,
    reason: plan.reason,
    ...(plan.taunt ? { taunt: plan.taunt } : {}),
    ...(meta.model ? { model: meta.model } : {}),
    ...(typeof meta.latencyMs === 'number' ? { latencyMs: meta.latencyMs } : {}),
  };
  return { ...state, intent, planLog: [...state.planLog, record] };
}

function orderFirst(a: { priority: number; speed: number; tie: number }, b: typeof a): boolean {
  if (a.priority !== b.priority) return a.priority > b.priority;
  if (a.speed !== b.speed) return a.speed > b.speed;
  return a.tie >= b.tie;
}

/**
 * 执行一回合。纯函数：同样的 state + 同样的技能 → 同样的结果。
 */
export function takeTurn(state: BattleState, playerSkill: SkillId): BattleState {
  if (state.outcome) return state;

  const log: BattleEvent[] = [...state.log];
  const player: BattleSide = { ...state.player, stats: { ...state.player.stats } };
  const enemy: BattleSide = { ...state.enemy, stats: { ...state.enemy.stats } };
  const round = state.round;

  const intent = state.intent ?? chooseIntent(state);
  const enemySkill = intent.skill;

  const tieRng = createRng(`${state.seed}|order|${round}`);
  const firstStrike = round === 1;
  const playerPriority =
    SKILLS[playerSkill].priority + (firstStrike && player.boons.firstStrike ? 10 : 0);
  const enemyPriority =
    SKILLS[enemySkill].priority + (firstStrike && enemy.boons.firstStrike ? 10 : 0);
  const playerFirst = orderFirst(
    { priority: playerPriority, speed: player.stats.speed, tie: tieRng() },
    { priority: enemyPriority, speed: enemy.stats.speed, tie: tieRng() },
  );

  const actions: Array<{ actor: 'player' | 'enemy'; skill: SkillId }> = playerFirst
    ? [
        { actor: 'player', skill: playerSkill },
        { actor: 'enemy', skill: enemySkill },
      ]
    : [
        { actor: 'enemy', skill: enemySkill },
        { actor: 'player', skill: playerSkill },
      ];

  // 本回合开始时清除上一轮的防御状态
  player.guard = false;
  enemy.guard = false;

  for (const action of actions) {
    const actor = action.actor === 'player' ? player : enemy;
    const target = action.actor === 'player' ? enemy : player;
    const skill = SKILLS[action.skill];
    const who = action.actor === 'player' ? '我方' : '敌方';

    if (actor.hp <= 0) continue;

    log.push({
      kind: 'skill',
      round,
      actor: action.actor,
      skill: action.skill,
      text:
        skill.kind === 'attack'
          ? `${who}使用「${skill.name}」`
          : `${who}使用「${skill.name}」`,
    });

    if (skill.kind === 'guard') {
      actor.guard = true;
      log.push({
        kind: 'guard',
        round,
        actor: action.actor,
        skill: action.skill,
        text: `${who}收力防御，本回合所受伤害减半`,
        note: `防御态仅在回合内有效`,
      });
      continue;
    }

    if (skill.kind === 'heal') {
      if (actor.recoverUsed) {
        log.push({
          kind: 'recover',
          round,
          actor: action.actor,
          skill: action.skill,
          text: `${who}想再歇一次，但『小憩回血』本局已经用过了`,
          note: '单局限一次',
        });
        continue;
      }
      const before = actor.hp;
      actor.hp = Math.min(actor.stats.hp, actor.hp + 16);
      actor.recoverUsed = true;
      log.push({
        kind: 'recover',
        round,
        actor: action.actor,
        skill: action.skill,
        text: `${who}回复了 ${actor.hp - before} HP`,
        hpAfter: actor.hp,
        note: `上限 ${actor.stats.hp}`,
      });
      continue;
    }

    // 攻击
    const result = computeDamage(actor, target, action.skill, state.weather);
    if (skill.kind === 'buff') {
      // 佯攻：先结算这一次伤害，再把 +8 存成下一次攻击的加成（不可叠加）
      target.hp = Math.max(0, target.hp - result.damage);
      actor.feintBonus = 8;
      log.push({
        kind: 'damage',
        round,
        actor: action.actor,
        skill: action.skill,
        text: `${who}佯攻得手，造成 ${result.damage} 伤害，并蓄力 +8`,
        damage: result.damage,
        hpAfter: target.hp,
      });
      continue;
    }

    target.hp = Math.max(0, target.hp - result.damage);
    actor.feintBonus = 0;

    const notes: string[] = [];
    if (result.multiplier > 1.01) notes.push('属性克制 ×1.25');
    if (result.multiplier < 0.99) notes.push('属性被克 ×0.80');
    if (result.boost > 0) notes.push(`天气 +${result.boost}`);
    if (result.guarded) notes.push('对手防御减半');
    notes.push(`基础 ${result.raw.toFixed(1)} → ${result.damage}`);

    log.push({
      kind: 'damage',
      round,
      actor: action.actor,
      skill: action.skill,
      text: `${who}造成 ${result.damage} 伤害`,
      damage: result.damage,
      hpAfter: target.hp,
      note: notes.join('｜'),
    });

    if (target.hp <= 0) {
      log.push({
        kind: 'faint',
        round,
        actor: action.actor,
        text: action.actor === 'player' ? `${target.name} 站不住了` : `${target.name} 散成一地墨点`,
      });
      break;
    }
  }

  player.guard = false;
  enemy.guard = false;

  let outcome: BattleOutcome | null = null;
  if (player.hp <= 0 && enemy.hp <= 0) outcome = 'draw';
  else if (enemy.hp <= 0) outcome = 'win';
  else if (player.hp <= 0) outcome = 'lose';

  if (!outcome && round >= MAX_ROUNDS) {
    const playerPct = (player.hp / player.stats.hp) * 100;
    const enemyPct = (enemy.hp / enemy.stats.hp) * 100;
    const diff = playerPct - enemyPct;
    if (Math.abs(diff) <= 1) outcome = 'draw';
    else outcome = diff > 0 ? 'win' : 'lose';
    log.push({
      kind: 'end',
      round,
      text: `三回合结束：我方 ${playerPct.toFixed(0)}% · 敌方 ${enemyPct.toFixed(0)}%`,
      note: '按剩余生命百分比判定，1 个百分点以内为平局',
    });
  }

  if (outcome) {
    log.push({
      kind: 'end',
      round,
      text: outcome === 'win' ? '判我方胜' : outcome === 'lose' ? '判敌方胜' : '双方平手',
    });
  }

  const next: BattleState = {
    ...state,
    round: outcome ? round : round + 1,
    player,
    enemy,
    log,
    outcome,
    intent: null,
    planLog: state.planLog.some((record) => record.round === round)
      ? state.planLog
      : [
          ...state.planLog,
          {
            round,
            source: intent.source,
            skill: enemySkill,
            reason: intent.reason,
            ...(intent.taunt ? { taunt: intent.taunt } : {}),
          },
        ],
  };

  return outcome ? next : { ...next, intent: chooseIntent(next) };
}

/** 校验：只允许提交精灵实际拥有的技能（防止 UI 被篡改或被模型文本诱导） */
export function isValidAction(state: BattleState, skill: SkillId): boolean {
  if (state.outcome) return false;
  return state.player.skills.includes(skill) && SKILLS[skill] !== undefined;
}

export function hpPercent(side: BattleSide): number {
  return clamp((side.hp / Math.max(1, side.stats.hp)) * 100, 0, 100);
}

export function describeOutcome(state: BattleState): { title: string; detail: string } {
  const p = hpPercent(state.player);
  const e = hpPercent(state.enemy);
  if (state.outcome === 'win') {
    return {
      title: '胜',
      detail: e <= 0 ? '对手先一步散成墨点。' : `三回合结束，我方剩 ${p.toFixed(0)}%，敌方剩 ${e.toFixed(0)}%。`,
    };
  }
  if (state.outcome === 'lose') {
    return {
      title: '负',
      detail: p <= 0 ? '我方先一步散成墨点，回去再拍一张。' : `三回合结束，我方剩 ${p.toFixed(0)}%，敌方剩 ${e.toFixed(0)}%。`,
    };
  }
  if (state.outcome === 'draw') {
    return { title: '平', detail: '双方都还站着，差距在 1 个百分点以内。' };
  }
  return { title: '未结算', detail: '这局还没打完。' };
}

/** 供测试与平衡模拟使用：固定种子下的自动战斗 */
export function autoBattle(
  player: Monster,
  enemy: Enemy,
  seed: string,
  policy: (state: BattleState) => SkillId = (s) => s.player.skills[0],
): BattleState {
  let state = createBattle(player, enemy, seed);
  let guard = 0;
  while (!state.outcome && guard < 10) {
    const skill = policy(state);
    state = takeTurn(state, isValidAction(state, skill) ? skill : state.player.skills[0]);
    guard += 1;
  }
  return state;
}

export function stateFingerprint(state: BattleState): string {
  return hashString(
    JSON.stringify({
      round: state.round,
      hp: [state.player.hp, state.enemy.hp],
      outcome: state.outcome,
      log: state.log.length,
    }),
  ).toString(16);
}

export const ELEMENT_NAMES: Record<Element, string> = {
  food: '早味',
  water: '江流',
  nature: '木叶',
  structure: '铁骨',
  tool: '机巧',
};
