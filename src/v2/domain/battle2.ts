import { clamp, createRng, hashString } from '../../shared/rng';
import { typeMultiplier } from '../../features/monsters/elements';
import { ACTIVE_BY_ID, LINK_BY_ID, SUPPORT_BY_ID } from '../content/modules';
import { PATH_META } from '../domain/tags';
import type {
  ActiveModule,
  BattleCreatureState,
  BattleEvent,
  BattleOutcomeV2,
  BattleRewards,
  EnemyActionId,
  EnemyDef,
  EnemyIntent,
  EnemyState,
  ExpeditionBattleState,
  FeatureEvidence,
  PlayerRoundInput,
  StatusId,
  StatusStack,
  V2Creature,
} from './types';

/** expedition_v2 规则常量（与 quick_v1 完全隔离） */
export const V2_RULES = {
  maxRounds: 8,
  resonanceStart: 2,
  resonanceMax: 6,
  swapCost: 1,
  linkCost: 2,
  damageScale: 0.62,
  statusCap: { wet: 3, vulnerable: 1, charge: 3, guard: 1, mark: 2, bind: 1, heat: 5, shield: 30 } as Record<
    StatusId,
    number
  >,
};

export const ENEMY_ACTION_LABEL: Record<EnemyActionId, string> = {
  strike: '单体攻击',
  guard: '收拢防御',
  gather: '蓄势',
  storm: '暴雨',
  deluge: '积水成渊',
  heat_wave: '锅气爆炒',
  lock: '桥面封锁',
  record: '抄录招式',
  overload: '全域过载',
};

const STATUS_NAME: Record<StatusId, string> = {
  wet: '潮湿',
  vulnerable: '脆弱',
  shield: '护盾',
  charge: '蓄力',
  guard: '防御',
  mark: '标记',
  bind: '束缚',
  heat: '热度',
};

/* ------------------------------- 基础工具 ------------------------------- */

function cloneCreature(creature: V2Creature): V2Creature {
  return { ...creature, stats: { ...creature.stats }, equipped: [...creature.equipped], actives: [...creature.actives], evidence: [...creature.evidence] };
}

function makeCreatureState(creature: V2Creature): BattleCreatureState {
  return {
    creature: cloneCreature(creature),
    hp: creature.stats.hp,
    statuses: [],
    cooldowns: {},
    supportCd: 0,
    alive: true,
    passiveUsed: false,
    lastSkillId: undefined,
    swapBonus: 0,
  };
}

export function statusOf(list: StatusStack[], id: StatusId): number {
  return list.find((status) => status.id === id)?.stacks ?? 0;
}

function addStatus(list: StatusStack[], id: StatusId, stacks: number, turns: number): StatusStack[] {
  const cap = V2_RULES.statusCap[id];
  const existing = list.find((status) => status.id === id);
  if (existing) {
    return list.map((status) =>
      status.id === id
        ? { ...status, stacks: Math.min(cap, status.stacks + stacks), turns: Math.max(status.turns, turns) }
        : status,
    );
  }
  return [...list, { id, stacks: Math.min(cap, stacks), turns }];
}

function removeStatus(list: StatusStack[], id: StatusId): StatusStack[] {
  return list.filter((status) => status.id !== id);
}

function tickStatuses(list: StatusStack[]): StatusStack[] {
  return list
    .map((status) => ({ ...status, turns: status.turns - 1 }))
    .filter((status) => status.turns > 0 && status.stacks > 0);
}

function consumeStatus(list: StatusStack[], id: StatusId, amount: number): StatusStack[] {
  const current = statusOf(list, id);
  const next = current - amount;
  return next > 0 ? list.map((status) => (status.id === id ? { ...status, stacks: next } : status)) : removeStatus(list, id);
}

function effectiveAtk(creature: BattleCreatureState, enemy: EnemyState): number {
  let atk = creature.creature.stats.atk;
  if (creature.creature.passiveId === 'P03' && enemy.def.element === 'water') atk += 2;
  return atk;
}

function damageTakenMultiplier(creature: BattleCreatureState, sourceElement: string): number {
  let mult = 1;
  if (creature.creature.passiveId === 'P09' && sourceElement === 'water') mult *= 0.8;
  return mult;
}

function applyShield(target: BattleCreatureState, damage: number, log: BattleEvent[], round: number): number {
  const shield = statusOf(target.statuses, 'shield');
  if (shield <= 0) return damage;
  const absorbed = Math.min(shield, damage);
  target.statuses = consumeStatus(target.statuses, 'shield', absorbed);
  log.push({
    round,
    kind: 'status',
    text: `${target.creature.name} 的护盾挡下 ${absorbed} 伤害`,
    detail: `护盾剩余 ${Math.max(0, shield - absorbed)}`,
    actor: 'player',
  });
  return damage - absorbed;
}

function hitCreature(
  target: BattleCreatureState,
  rawDamage: number,
  opts: { round: number; sourceElement: string; log: BattleEvent[]; singleTarget: boolean },
): number {
  if (!target.alive) return 0;
  if (opts.singleTarget && target.creature.passiveId === 'P04' && !target.passiveUsed) {
    target.passiveUsed = true;
    opts.log.push({
      round: opts.round,
      kind: 'status',
      text: `${target.creature.name} 轻身闪开了这一击`,
      actor: 'player',
    });
    return 0;
  }
  let damage = rawDamage * damageTakenMultiplier(target, opts.sourceElement);
  if (statusOf(target.statuses, 'guard') > 0) {
    damage *= 0.5;
    opts.log.push({ round: opts.round, kind: 'status', text: `${target.creature.name} 正在防御，伤害减半`, actor: 'player' });
  }
  if (target.creature.passiveId === 'P01' && !target.passiveUsed) {
    target.passiveUsed = true;
    damage *= 0.5;
    opts.log.push({ round: opts.round, kind: 'status', text: `${target.creature.name} 遮挡本能：首次受伤减半`, actor: 'player' });
  }
  damage = Math.round(damage);
  damage = applyShield(target, damage, opts.log, opts.round);
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp <= 0) target.alive = false;
  return damage;
}

/* ------------------------------- 创建战斗 ------------------------------- */

export function createEnemyState(def: EnemyDef): EnemyState {
  return { def, hp: def.maxHp, phase: 1, shield: 0, charge: 0, statuses: [] };
}

export function createExpeditionBattle(input: {
  seed: string;
  team: V2Creature[];
  activeIndex?: number;
  enemy: EnemyDef;
  startResonance?: number;
  maxRounds?: number;
  bondLevel?: number;
}): ExpeditionBattleState {
  if (input.team.length !== 3) throw new Error('expedition_v2 需要 3 人队伍');
  const enemy = createEnemyState(input.enemy);
  const team = input.team.map(makeCreatureState);
  const activeIndex = input.activeIndex ?? 0;
  const state: ExpeditionBattleState = {
    schemaVersion: 2,
    rulesetVersion: 'expedition_v2',
    seed: input.seed,
    round: 1,
    maxRounds: input.maxRounds ?? V2_RULES.maxRounds,
    resonance: Math.min(V2_RULES.resonanceMax, input.startResonance ?? V2_RULES.resonanceStart),
    team,
    activeIndex: clamp(activeIndex, 0, 2),
    enemy,
    intent: null,
    log: [],
    planLog: [],
    outcome: null,
    linkUsed: false,
    bondLevel: clamp(input.bondLevel ?? 0, 0, 3),
    supportLockedRound: 0,
    rewards: { materials: 0, tokens: 0 },
    fingerprint: '',
  };
  if (enemy.def.bossRule === 'record') state.recordedSkill = undefined;
  state.log.push({
    round: 1,
    kind: 'round',
    text: `第 1 回合 · 对手：${enemy.def.name}`,
    detail: enemy.def.taunt,
  });
  const intent = chooseRuleIntent(state);
  state.intent = intent;
  return { ...state, fingerprint: fingerprint(state) };
}

export function activeCreature(state: ExpeditionBattleState): BattleCreatureState {
  return state.team[state.activeIndex];
}

export function aliveReserveIndexes(state: ExpeditionBattleState): number[] {
  return state.team.map((_, index) => index).filter((index) => index !== state.activeIndex && state.team[index].alive);
}

/* ------------------------------- 敌方意图 ------------------------------- */

export function legalEnemyActions(state: ExpeditionBattleState): EnemyActionId[] {
  const enemy = state.enemy;
  const actions: EnemyActionId[] = ['strike'];
  const rule = enemy.def.bossRule;
  if (enemy.def.kind === 'boss' && rule) {
    if (rule === 'storm') {
      if (state.round % 2 === 0 || enemy.phase >= 2) actions.push('storm');
      if (enemy.phase >= 2 && state.round % 2 === 0) actions.push('deluge');
    } else if (rule === 'heat') {
      if (enemy.phase >= 2 || state.round % 2 === 0) actions.push('heat_wave');
    } else if (rule === 'lock') {
      if (state.round % 2 === 0) actions.push('lock');
      if (enemy.phase >= 2) actions.push('storm');
    } else if (rule === 'record') {
      if (state.round % 2 === 0) actions.push('record');
      if (enemy.phase >= 2) actions.push('storm');
    } else if (rule === 'thunder') {
      if (enemy.phase >= 2 && state.round % 2 === 0) actions.push('storm');
      if (enemy.phase >= 3) actions.push('overload');
    }
  } else {
    const stormRound = state.round % 2 === 0;
    if (enemy.def.kind === 'elite' && stormRound) actions.push('storm');
  }
  if (state.round % 3 === 0 && rule !== 'thunder') actions.push('guard');
  return actions;
}

function intentText(action: EnemyActionId, enemy: EnemyDef): string {
  if (action === 'heat_wave') return '「锅气爆炒」：全队受热并叠加脆弱';
  if (action === 'lock') return '「桥面封锁」：下一回合支援与连携不可用';
  if (action === 'record') return '「抄录招式」：重复上一招会被反制';
  if (action === 'overload') return '「全域过载」：全队受创，主脑进入最终阶段';
  if (enemy.kind === 'boss') {
    if (action === 'storm') return '「暴雨压境」：无遮蔽者会被淋透';
    if (action === 'deluge') return '「积水成渊」：全队受创并叠加潮湿';
    if (action === 'gather') return '「蓄势」：下一击更重';
    if (action === 'guard') return '「收拢」：架起护盾';
    return '「雷点」：单体雷击';
  }
  if (action === 'guard') return '收起身体，准备防守';
  if (action === 'storm') return '搅动潮气，准备范围攻击';
  return '朝主战冲过来';
}

export function estimateEnemyDamage(state: ExpeditionBattleState, action: EnemyActionId): number {
  const enemy = state.enemy;
  if (action === 'guard' || action === 'gather' || action === 'lock' || action === 'record') return 0;
  const active = activeCreature(state);
  if (action === 'storm' || action === 'deluge' || action === 'heat_wave' || action === 'overload') {
    const base = action === 'deluge' ? 16 : action === 'overload' ? 20 : action === 'heat_wave' ? 13 : 9;
    const raw = base + 0.3 * enemy.def.atk + enemy.charge * 0.4;
    let damage = Math.round(raw * V2_RULES.damageScale);
    if (statusOf(active.statuses, 'guard') > 0) damage = Math.round(damage * 0.5);
    return clamp(damage, 1, 60);
  }
  const raw = 16 + 0.35 * enemy.def.atk + enemy.charge * 0.4;
  let damage = Math.round(raw * V2_RULES.damageScale * 1.2);
  if (statusOf(active.statuses, 'guard') > 0) damage = Math.round(damage * 0.5);
  return clamp(damage, 1, 60);
}

export function chooseRuleIntent(state: ExpeditionBattleState): EnemyIntent {
  const legal = legalEnemyActions(state);
  const rule = state.enemy.def.bossRule;
  let action: EnemyActionId;
  if (rule === 'thunder' && state.enemy.phase >= 3 && legal.includes('overload')) action = 'overload';
  else if (rule === 'heat' && legal.includes('heat_wave') && state.round % 2 === 0) action = 'heat_wave';
  else if (rule === 'lock' && legal.includes('lock') && state.round % 2 === 0) action = 'lock';
  else if (rule === 'record' && legal.includes('record') && state.round % 2 === 0) action = 'record';
  else if (legal.includes('deluge') && state.enemy.phase >= 2 && state.round % 2 === 0) action = 'deluge';
  else if (legal.includes('storm') && state.round % 2 === 0) action = 'storm';
  else if (legal.includes('guard') && state.round % 3 === 0) action = 'guard';
  else action = 'strike';
  return {
    action,
    text: intentText(action, state.enemy.def),
    estimate: estimateEnemyDamage(state, action),
    source: 'rule',
  };
}

export function applyEnemyPlan(
  state: ExpeditionBattleState,
  plan: { actionId: EnemyActionId; reason: string; taunt: string; model?: string; latencyMs?: number },
): ExpeditionBattleState {
  if (state.outcome) return state;
  if (!legalEnemyActions(state).includes(plan.actionId)) return state;
  return {
    ...state,
    intent: {
      action: plan.actionId,
      text: plan.taunt || intentText(plan.actionId, state.enemy.def),
      estimate: estimateEnemyDamage(state, plan.actionId),
      source: 'ai',
      reason: plan.reason,
      taunt: plan.taunt,
      ...(plan.model ? { model: plan.model } : {}),
      ...(typeof plan.latencyMs === 'number' ? { latencyMs: plan.latencyMs } : {}),
    },
  };
}

/* ------------------------------- 玩家行动 ------------------------------- */

export function getLegalMainActions(state: ExpeditionBattleState): Array<{ kind: 'skill'; skillId: string } | { kind: 'swap'; targetIndex: number } | { kind: 'guard' } | { kind: 'basic' }> {
  if (state.outcome) return [];
  const active = activeCreature(state);
  const actions: Array<{ kind: 'skill'; skillId: string } | { kind: 'swap'; targetIndex: number } | { kind: 'guard' } | { kind: 'basic' }> = [];
  for (const skillId of active.creature.equipped) {
    const module = ACTIVE_BY_ID.get(skillId);
    if (!module) continue;
    if ((active.cooldowns[skillId] ?? 0) > 0) continue;
    if (module.cost > state.resonance) continue;
    actions.push({ kind: 'skill', skillId });
  }
  actions.push({ kind: 'basic' });
  actions.push({ kind: 'guard' });
  for (const targetIndex of aliveReserveIndexes(state)) {
    const cost = active.creature.passiveId === 'P08' ? 0 : V2_RULES.swapCost;
    if (cost <= state.resonance) actions.push({ kind: 'swap', targetIndex });
  }
  return actions;
}

export function getLegalSupportActions(
  state: ExpeditionBattleState,
): Array<{ kind: 'support'; reserveIndex: number } | { kind: 'link'; linkId: string }> {
  if (state.outcome || state.round <= state.supportLockedRound) return [];
  const actions: Array<{ kind: 'support'; reserveIndex: number } | { kind: 'link'; linkId: string }> = [];
  for (const index of aliveReserveIndexes(state)) {
    const reserve = state.team[index];
    if (reserve.supportCd > 0) continue;
    const command = SUPPORT_BY_ID.get(reserve.creature.supportCommandId);
    if (!command || command.cost > state.resonance) continue;
    actions.push({ kind: 'support', reserveIndex: index });
  }
  if (!state.linkUsed && state.resonance >= V2_RULES.linkCost) {
    for (const link of LINK_BY_ID.values()) {
      if ((link.minBond ?? 0) > state.bondLevel) continue;
      const hasPaths = link.requires.every((path) => state.team.some((member) => member.alive && member.creature.buildPath === path));
      if (hasPaths) actions.push({ kind: 'link', linkId: link.id });
    }
  }
  return actions;
}

export function validateRoundInput(state: ExpeditionBattleState, input: PlayerRoundInput): string[] {
  const errors: string[] = [];
  const legalMain = getLegalMainActions(state);
  const mainKey = (action: PlayerRoundInput['main']) =>
    action.kind === 'skill'
      ? `skill:${action.skillId}`
      : action.kind === 'swap'
        ? `swap:${action.targetIndex}`
        : action.kind;
  if (!legalMain.some((action) => mainKey(action) === mainKey(input.main))) errors.push('主战行动不合法');
  if (input.support) {
    const legalSupport = getLegalSupportActions(state);
    const supportKey = (action: NonNullable<PlayerRoundInput['support']>) =>
      action.kind === 'support' ? `support:${action.reserveIndex}` : `link:${action.linkId}`;
    if (!legalSupport.some((action) => supportKey(action) === supportKey(input.support!))) errors.push('支援行动不合法');
  }
  return errors;
}

function logEvent(state: ExpeditionBattleState, event: BattleEvent): void {
  state.log.push(event);
}

function addResonance(state: ExpeditionBattleState, amount: number): void {
  state.resonance = clamp(state.resonance + amount, 0, V2_RULES.resonanceMax);
}

function dealDamageToEnemy(state: ExpeditionBattleState, raw: number): number {
  let damage = Math.round(raw);
  if (state.enemy.shield > 0) {
    const absorbed = Math.min(state.enemy.shield, damage);
    state.enemy.shield -= absorbed;
    damage -= absorbed;
    if (absorbed > 0) {
      logEvent(state, {
        round: state.round,
        kind: 'status',
        text: `${state.enemy.def.name} 的护盾吸收了 ${absorbed} 伤害`,
        actor: 'enemy',
      });
    }
  }
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  if (state.enemy.def.bossRule === 'heat' && damage > 0) {
    state.enemy.statuses = addStatus(state.enemy.statuses, 'heat', 1, 99);
  }
  return damage;
}

function enemyDamageMultiplier(state: ExpeditionBattleState, skillPower: number, activeSkill: ActiveModule | null): { damage: number; multiplier: number } {
  const active = activeCreature(state);
  const enemy = state.enemy;
  const charge = statusOf(active.statuses, 'charge');
  let power = skillPower;
  if (activeSkill && activeSkill.effect.kind === 'damage') power = activeSkill.effect.power;
  if (activeSkill && activeSkill.effect.kind === 'control') power = activeSkill.effect.damage;
  power += charge * 6;
  const typeMult = typeMultiplier(active.creature.element, enemy.def.element);
  let raw = (power + 0.45 * effectiveAtk(active, enemy) - 0.3 * enemy.def.def) * typeMult * V2_RULES.damageScale;
  if (statusOf(enemy.statuses, 'vulnerable') > 0) raw *= 1.15;
  if (statusOf(enemy.statuses, 'mark') > 0) raw *= 1.15;
  if (active.creature.passiveId === 'P07' && active.lastSkillId && active.lastSkillId !== activeSkill?.id) raw += 3;
  if (active.swapBonus > 0) {
    raw += active.swapBonus;
    active.swapBonus = 0;
  }
  if (charge > 0) active.statuses = consumeStatus(active.statuses, 'charge', charge);
  return { damage: clamp(Math.round(raw), 3, 55), multiplier: typeMult };
}

function applyActiveSkill(state: ExpeditionBattleState, module: ActiveModule): void {
  const active = activeCreature(state);
  const enemy = state.enemy;
  if (module.cost > state.resonance) throw new Error('共鸣不足');
  // 樱信档案员：重复被记录的招式会被反制
  if (state.recordedSkill && state.recordedSkill === module.id) {
    enemy.charge += 8;
    state.recordedSkill = undefined;
    logEvent(state, {
      round: state.round,
      kind: 'enemy',
      actor: 'enemy',
      text: `档案员复写了「${module.name}」：敌方蓄势 +8`,
    });
  }
  state.resonance -= module.cost;
  active.cooldowns[module.id] = module.cooldown;

  const effect = module.effect;
  if (effect.kind === 'damage' || effect.kind === 'control') {
    const power = effect.kind === 'damage' ? effect.power : effect.damage;
    const { damage, multiplier } = enemyDamageMultiplier(state, power, module);
    const applied = dealDamageToEnemy(state, damage);
    logEvent(state, {
      round: state.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，造成 ${applied} 伤害`,
      detail: `${module.text}${multiplier > 1.01 ? '（属性克制）' : multiplier < 0.99 ? '（属性被克）' : ''}`,
      damage: applied,
    });
    if (effect.kind === 'damage' && effect.status) {
      enemy.statuses = addStatus(enemy.statuses, effect.status, effect.stacks ?? 1, 2);
    }
    if (effect.kind === 'control') enemy.statuses = addStatus(enemy.statuses, 'bind', 1, 1);
    if (multiplier > 1.01) addResonance(state, 1);
    if (module.id === 'A07') addResonance(state, 1);
    if (active.creature.passiveId === 'P02' && createRng(`${state.seed}|p02|${state.round}`)() < 0.25) {
      enemy.statuses = addStatus(enemy.statuses, 'bind', 1, 1);
      logEvent(state, { round: state.round, kind: 'status', text: '缠绕体质触发：敌方被束缚', actor: 'player' });
    }
  } else if (effect.kind === 'shield') {
    const targets = effect.team ? state.team.filter((member) => member.alive) : [active];
    for (const target of targets) target.statuses = addStatus(target.statuses, 'shield', effect.amount, 3);
    logEvent(state, {
      round: state.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，${effect.team ? '全队' : '主战'}获得 ${effect.amount} 护盾`,
      detail: module.text,
    });
  } else if (effect.kind === 'heal') {
    const before = active.hp;
    active.hp = Math.min(active.creature.stats.hp, active.hp + effect.amount);
    if (effect.cleanse) active.statuses = removeStatus(active.statuses, effect.cleanse);
    logEvent(state, {
      round: state.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，回复 ${active.hp - before} HP`,
      detail: module.text,
    });
  } else if (effect.kind === 'charge') {
    active.statuses = addStatus(active.statuses, 'charge', effect.stacks, 3);
    logEvent(state, {
      round: state.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，蓄力 ${effect.stacks} 层`,
      detail: module.text,
    });
  } else if (effect.kind === 'guard') {
    active.statuses = addStatus(active.statuses, 'guard', 1, 1);
    logEvent(state, {
      round: state.round,
      kind: 'guard',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，进入防御`,
      detail: module.text,
    });
  } else if (effect.kind === 'mark') {
    enemy.statuses = addStatus(enemy.statuses, 'mark', 1, effect.turns);
    logEvent(state, {
      round: state.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，标记了 ${enemy.def.name}`,
      detail: module.text,
    });
  } else if (effect.kind === 'resonance') {
    addResonance(state, effect.amount);
    logEvent(state, {
      round: state.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 使用「${module.name}」，获得 ${effect.amount} 共鸣`,
      detail: module.text,
    });
  }
  active.lastSkillId = module.id;
}

function applySupport(state: ExpeditionBattleState, reserveIndex: number): void {
  const reserve = state.team[reserveIndex];
  const command = SUPPORT_BY_ID.get(reserve.creature.supportCommandId);
  if (!command) throw new Error('支援指令不存在');
  if (command.cost > state.resonance) throw new Error('共鸣不足');
  state.resonance -= command.cost;
  reserve.supportCd = command.cooldown;
  const active = activeCreature(state);
  const effect = command.effect;
  if (effect.kind === 'shield') {
    active.statuses = addStatus(active.statuses, 'shield', effect.amount, 3);
    logEvent(state, {
      round: state.round,
      kind: 'support',
      actor: 'player',
      text: `${reserve.creature.name} 支援「${command.name}」：主战获得 ${effect.amount} 护盾`,
      detail: command.text,
    });
  } else if (effect.kind === 'heal') {
    const before = active.hp;
    active.hp = Math.min(active.creature.stats.hp, active.hp + effect.amount);
    if (effect.cleanse) active.statuses = removeStatus(active.statuses, effect.cleanse);
    logEvent(state, {
      round: state.round,
      kind: 'support',
      actor: 'player',
      text: `${reserve.creature.name} 支援「${command.name}」：回复 ${active.hp - before} HP`,
      detail: command.text,
    });
  } else if (effect.kind === 'charge') {
    active.statuses = addStatus(active.statuses, 'charge', effect.stacks, 3);
    logEvent(state, {
      round: state.round,
      kind: 'support',
      actor: 'player',
      text: `${reserve.creature.name} 支援「${command.name}」：主战蓄力 ${effect.stacks} 层`,
      detail: command.text,
    });
  } else if (effect.kind === 'scout') {
    state.enemy.statuses = addStatus(state.enemy.statuses, 'vulnerable', 1, 2);
    addResonance(state, 1);
    logEvent(state, {
      round: state.round,
      kind: 'support',
      actor: 'player',
      text: `${reserve.creature.name} 支援「${command.name}」：敌方脆弱，并获得 1 共鸣`,
      detail: command.text,
    });
  } else if (effect.kind === 'ferry') {
    active.statuses = addStatus(active.statuses, 'shield', 6, 3);
    addResonance(state, 1);
    logEvent(state, {
      round: state.round,
      kind: 'support',
      actor: 'player',
      text: `${reserve.creature.name} 支援「${command.name}」：护盾 6，共鸣 +1`,
      detail: command.text,
    });
  }
}

function applyLink(state: ExpeditionBattleState, linkId: string): void {
  const link = LINK_BY_ID.get(linkId);
  if (!link) throw new Error('连携不存在');
  state.resonance -= link.cost;
  state.linkUsed = true;
  if (link.id === 'LINK_SHELTER') {
    for (const member of state.team.filter((item) => item.alive)) {
      member.statuses = addStatus(member.statuses, 'shield', 12, 3);
      member.statuses = removeStatus(member.statuses, 'wet');
    }
    logEvent(state, {
      round: state.round,
      kind: 'link',
      actor: 'player',
      text: `连携「${link.name}」：全队获得 12 护盾并清除潮湿`,
      detail: link.text,
    });
  } else if (link.id === 'LINK_BIND') {
    const applied = dealDamageToEnemy(state, 14);
    state.enemy.statuses = addStatus(state.enemy.statuses, 'bind', 1, 1);
    logEvent(state, {
      round: state.round,
      kind: 'link',
      actor: 'player',
      text: `连携「${link.name}」：造成 ${applied} 伤害并束缚敌方`,
      detail: link.text,
    });
  } else if (link.id === 'LINK_FERRY') {
    for (const member of state.team.filter((item) => item.alive)) {
      member.hp = Math.min(member.creature.stats.hp, member.hp + 8);
      member.statuses = removeStatus(member.statuses, 'wet');
    }
    addResonance(state, 1);
    logEvent(state, { round: state.round, kind: 'link', actor: 'player', text: `连携「${link.name}」：全队回复 8 HP，清除潮湿，共鸣 +1`, detail: link.text });
  } else if (link.id === 'LINK_CHARGE') {
    const active = activeCreature(state);
    active.statuses = addStatus(active.statuses, 'charge', 2, 3);
    state.enemy.statuses = addStatus(state.enemy.statuses, 'vulnerable', 1, 2);
    logEvent(state, { round: state.round, kind: 'link', actor: 'player', text: `连携「${link.name}」：主战蓄力 2 层，敌方脆弱`, detail: link.text });
  } else if (link.id === 'LINK_LANTERN') {
    for (const member of state.team.filter((item) => item.alive)) member.statuses = addStatus(member.statuses, 'shield', 8, 3);
    state.enemy.statuses = addStatus(state.enemy.statuses, 'mark', 1, 2);
    logEvent(state, { round: state.round, kind: 'link', actor: 'player', text: `连携「${link.name}」：全队 8 护盾，敌方被标记`, detail: link.text });
  } else if (link.id === 'LINK_RIVER') {
    const applied = dealDamageToEnemy(state, 10);
    for (const member of state.team.filter((item) => item.alive)) member.hp = Math.min(member.creature.stats.hp, member.hp + 6);
    addResonance(state, 2);
    logEvent(state, { round: state.round, kind: 'link', actor: 'player', text: `连携「${link.name}」：造成 ${applied} 伤害，全队回复 6，共鸣 +2`, detail: link.text });
  }
}

/* ------------------------------- 敌方行动 ------------------------------- */

function enemyAct(state: ExpeditionBattleState): void {
  const intent = state.intent ?? chooseRuleIntent(state);
  const action = intent.action;
  const enemy = state.enemy;
  const active = activeCreature(state);

  const bound = state.enemy.statuses.some((status) => status.id === 'bind');
  if (bound) {
    state.enemy.statuses = removeStatus(state.enemy.statuses, 'bind');
    logEvent(state, {
      round: state.round,
      kind: 'enemy',
      actor: 'enemy',
      text: `${enemy.def.name} 被束缚，行动受阻`,
    });
    // 束缚可以打断蓄力/暴雨，但不能让 Boss 整回合彻底消失
    if (action === 'storm' || action === 'deluge' || action === 'gather') return;
  }

  if (action === 'gather') {
    enemy.charge += 10;
    logEvent(state, { round: state.round, kind: 'enemy', actor: 'enemy', text: `${enemy.def.name} 蓄势待发（下一击 +10）` });
    return;
  }
  if (action === 'lock') {
    state.supportLockedRound = state.round + 1;
    logEvent(state, {
      round: state.round,
      kind: 'enemy',
      actor: 'enemy',
      text: `${enemy.def.name} 封锁桥面：下一回合支援与连携不可用`,
    });
    return;
  }
  if (action === 'record') {
    state.recordedSkill = active.lastSkillId;
    logEvent(state, {
      round: state.round,
      kind: 'enemy',
      actor: 'enemy',
      text: `${enemy.def.name} 抄录了${active.lastSkillId ? '你的上一招' : '你的动作'}：重复使用会被反制`,
    });
    return;
  }
  if (action === 'guard') {
    enemy.shield += 12;
    logEvent(state, { round: state.round, kind: 'enemy', actor: 'enemy', text: `${enemy.def.name} 收拢防御，获得 12 护盾` });
    return;
  }

  const isStorm = action === 'storm' || action === 'deluge' || action === 'heat_wave' || action === 'overload';
  const activeHasCover = statusOf(active.statuses, 'guard') > 0 || statusOf(active.statuses, 'shield') > 0;
  if (isStorm) {
    const base = action === 'deluge' ? 16 : action === 'overload' ? 20 : action === 'heat_wave' ? 13 : 9;
    const damage = clamp(Math.round((base + 0.3 * enemy.def.atk + enemy.charge * 0.4) * V2_RULES.damageScale), 3, 46);
    enemy.charge = 0;
    const covered = activeHasCover;
    const actual = covered ? Math.round(damage * 0.4) : damage;
    const actionName = ENEMY_ACTION_LABEL[action];
    logEvent(state, {
      round: state.round,
      kind: 'enemy',
      actor: 'enemy',
      text: `${enemy.def.name} 发动「${actionName}」${covered ? '，被遮蔽挡下大半' : ''}`,
      damage: actual,
    });
    for (const member of state.team.filter((item) => item.alive)) {
      const dealt = hitCreature(member, actual, {
        round: state.round,
        sourceElement: enemy.def.element,
        log: state.log,
        singleTarget: false,
      });
      if (member === active) {
        member.hp = Math.max(0, member.hp);
        if (dealt > 0) {
          if (action === 'heat_wave') member.statuses = addStatus(member.statuses, 'vulnerable', 1, 2);
          else member.statuses = addStatus(member.statuses, 'wet', action === 'deluge' ? 2 : 1, 2);
          if (member.creature.passiveId === 'P06' && !member.passiveUsed) {
            member.passiveUsed = true;
            addResonance(state, 2);
          }
        }
      }
    }
    if (covered) addResonance(state, action === 'deluge' ? 3 : 2);
    return;
  }

  // strike 单体
  let strikeRaw = clamp(Math.round((16 + 0.35 * enemy.def.atk + enemy.charge * 0.4) * V2_RULES.damageScale * 1.2), 4, 45);
  if (bound) strikeRaw = Math.round(strikeRaw * 0.6);
  enemy.charge = 0;
  const dealt = hitCreature(active, strikeRaw, {
    round: state.round,
    sourceElement: enemy.def.element,
    log: state.log,
    singleTarget: true,
  });
  logEvent(state, {
    round: state.round,
    kind: 'enemy',
    actor: 'enemy',
    text: `${enemy.def.name} 命中 ${active.creature.name}，造成 ${dealt} 伤害`,
    damage: dealt,
  });
}

/* ------------------------------- 回合结算 ------------------------------- */

function advanceBossPhase(state: ExpeditionBattleState): void {
  const enemy = state.enemy;
  if (enemy.def.kind !== 'boss') return;
  const rule = enemy.def.bossRule;
  const ratio = enemy.hp / Math.max(1, enemy.def.maxHp);
  const targetPhase = rule === 'thunder' ? (ratio <= 1 / 3 ? 3 : ratio <= 2 / 3 ? 2 : 1) : ratio <= 0.5 ? 2 : 1;
  if (rule === 'heat' && statusOf(enemy.statuses, 'heat') >= 3) {
    enemy.phase = Math.max(enemy.phase, 2);
  } else if (targetPhase > enemy.phase) {
    enemy.phase = targetPhase;
  }
}

function announceBossPhase(state: ExpeditionBattleState, previousPhase: number): void {
  const phase = state.enemy.phase;
  if (phase <= previousPhase) return;
  const rule = state.enemy.def.bossRule;
  const text =
    rule === 'thunder'
      ? phase >= 3
        ? '主脑进入第三阶段：全域过载'
        : '主脑进入第二阶段：线圈过热'
      : rule === 'heat'
        ? '大厨掀开最后一口锅：火力全开'
        : rule === 'lock'
          ? '桥影落下：支援被拦在桥外'
          : rule === 'record'
            ? '档案员翻到最后一页：开始复写'
            : '进入第二阶段：积水成渊';
  state.log.push({ round: state.round, kind: 'status', text: `${state.enemy.def.name} ${text}`, actor: 'enemy' });
}

function checkOutcome(state: ExpeditionBattleState): BattleOutcomeV2 | null {
  if (state.enemy.hp <= 0) return 'win';
  if (state.team.every((member) => !member.alive)) return 'lose';
  if (state.round >= state.maxRounds) {
    // Boss 战必须击破：拖到回合上限视为挑战失败，避免“靠血厚混过去”
    if (state.enemy.def.kind === 'boss') return 'lose';
    const teamHp = state.team.reduce((sum, member) => sum + Math.max(0, member.hp), 0);
    const teamMax = state.team.reduce((sum, member) => sum + member.creature.stats.hp, 0);
    const teamPct = (teamHp / Math.max(1, teamMax)) * 100;
    const enemyPct = (state.enemy.hp / Math.max(1, state.enemy.def.maxHp)) * 100;
    if (Math.abs(teamPct - enemyPct) <= 5) return 'draw';
    return teamPct > enemyPct ? 'win' : 'lose';
  }
  return null;
}

function autoSwitch(state: ExpeditionBattleState): void {
  const active = activeCreature(state);
  if (active.alive) return;
  const nextIndex = state.team.findIndex((member, index) => index !== state.activeIndex && member.alive);
  if (nextIndex < 0) return;
  state.activeIndex = nextIndex;
  const next = state.team[nextIndex];
  next.hp = Math.max(1, Math.round(next.creature.stats.hp * 0.3));
  next.statuses = [];
  logEvent(state, {
    round: state.round,
    kind: 'swap',
    actor: 'player',
    text: `${active.creature.name} 倒下，${next.creature.name} 顶上（保留 30% HP）`,
  });
}

function grantRewards(state: ExpeditionBattleState): void {
  if (state.outcome !== 'win') return;
  const base = state.enemy.def.kind === 'boss' ? 2 : state.enemy.def.kind === 'elite' ? 2 : 1;
  const bonus = state.team.some((member) => member.creature.passiveId === 'P10') ? 1 : 0;
  state.rewards = {
    materials: base + bonus,
    tokens: state.enemy.def.kind === 'boss' ? 1 : 0,
  };
}

export function resolveRound(state: ExpeditionBattleState, input: PlayerRoundInput): ExpeditionBattleState {
  if (state.outcome) return state;
  const errors = validateRoundInput(state, input);
  if (errors.length) throw new Error(errors.join('；'));

  const next: ExpeditionBattleState = {
    ...state,
    team: state.team.map((member) => ({
      ...member,
      creature: cloneCreature(member.creature),
      statuses: [...member.statuses],
      cooldowns: { ...member.cooldowns },
    })),
    enemy: { ...state.enemy, statuses: [...state.enemy.statuses] },
    log: [...state.log],
    planLog: [...state.planLog],
    rewards: { ...state.rewards },
  };
  const active = activeCreature(next);

  next.log.push({ round: next.round, kind: 'round', text: `第 ${next.round} 回合` });

  // P05 容器：回合开始回血
  for (const member of next.team) {
    if (member.alive && member.creature.passiveId === 'P05') {
      member.hp = Math.min(member.creature.stats.hp, member.hp + 2);
    }
  }

  // 玩家主战行动
  if (input.main.kind === 'skill') {
    const module = ACTIVE_BY_ID.get(input.main.skillId);
    if (!module || !active.creature.equipped.includes(module.id)) throw new Error('技能未装备');
    applyActiveSkill(next, module);
  } else if (input.main.kind === 'swap') {
    const cost = active.creature.passiveId === 'P08' ? 0 : V2_RULES.swapCost;
    next.resonance = clamp(next.resonance - cost, 0, V2_RULES.resonanceMax);
    const target = next.team[input.main.targetIndex];
    if (!target || !target.alive) throw new Error('换位目标不可用');
    next.team[next.activeIndex] = active;
    next.activeIndex = input.main.targetIndex;
    target.statuses = addStatus(target.statuses, 'shield', 4, 2);
    if (target.creature.passiveId === 'P08') target.swapBonus = 4;
    next.log.push({
      round: next.round,
      kind: 'swap',
      actor: 'player',
      text: `${active.creature.name} 换下，${target.creature.name} 上场并获 4 护盾`,
      detail: cost === 0 ? '桥接：本次换位不消耗共鸣' : `消耗 ${cost} 点共鸣`,
    });
  } else if (input.main.kind === 'basic') {
    const { damage, multiplier } = enemyDamageMultiplier(next, 8, null);
    const applied = dealDamageToEnemy(next, damage);
    if (multiplier > 1.01) addResonance(next, 1);
    next.log.push({
      round: next.round,
      kind: 'skill',
      actor: 'player',
      text: `${active.creature.name} 普通攻击，造成 ${applied} 伤害`,
      detail: '不消耗共鸣的保底攻击',
    });
    active.lastSkillId = 'BASIC';
  } else {
    active.statuses = addStatus(active.statuses, 'guard', 1, 1);
    addResonance(next, 1);
    next.log.push({
      round: next.round,
      kind: 'guard',
      actor: 'player',
      text: `${active.creature.name} 进入防御（本回合受伤减半），共鸣 +1`,
    });
  }

  // 支援/连携
  if (input.support) {
    if (input.support.kind === 'support') applySupport(next, input.support.reserveIndex);
    else applyLink(next, input.support.linkId);
  }

  // 敌方行动（玩家已击倒 Boss 则跳过）
  if (next.enemy.hp > 0) {
    const intent = next.intent ?? chooseRuleIntent(next);
    enemyAct(next);
    next.planLog.push({
      round: next.round,
      action: intent.action,
      source: intent.source === 'ai' ? 'ai' : 'rule',
      ...(intent.reason ? { reason: intent.reason } : {}),
      ...(intent.taunt ? { taunt: intent.taunt } : {}),
      ...(intent.model ? { model: intent.model } : {}),
      ...(typeof intent.latencyMs === 'number' ? { latencyMs: intent.latencyMs } : {}),
    });
    // Boss 阶段转换：不同 Boss 有 2 或 3 个阶段
    const beforePhase = next.enemy.phase;
    advanceBossPhase(next);
    announceBossPhase(next, beforePhase);
  }

  // 状态衰减与冷却
  for (const member of next.team) {
    member.statuses = tickStatuses(member.statuses);
    const cooldowns: Record<string, number> = {};
    for (const [id, turns] of Object.entries(member.cooldowns)) {
      const left = turns - 1;
      if (left > 0) cooldowns[id] = left;
    }
    member.cooldowns = cooldowns;
    member.supportCd = Math.max(0, member.supportCd - 1);
  }
  next.enemy.statuses = tickStatuses(next.enemy.statuses);

  autoSwitch(next);
  const outcome = checkOutcome(next);
  if (outcome) {
    next.outcome = outcome;
    grantRewards(next);
    const allDead = next.team.every((member) => !member.alive);
    next.log.push({
      round: next.round,
      kind: 'end',
      text:
        outcome === 'win'
          ? '战斗胜利'
          : outcome === 'lose'
            ? allDead
              ? '队伍全灭'
              : '回合结束，未能击破 Boss'
            : '平局',
      detail: `敌方 ${Math.max(0, Math.round((next.enemy.hp / next.enemy.def.maxHp) * 100))}% · 我方 ${Math.round(
        (next.team.reduce((sum, member) => sum + Math.max(0, member.hp), 0) /
          Math.max(1, next.team.reduce((sum, member) => sum + member.creature.stats.hp, 0))) *
          100,
      )}%`,
    });
  } else {
    next.round += 1;
    next.intent = chooseRuleIntent(next);
  }

  return { ...next, fingerprint: fingerprint(next) };
}

/* ------------------------------- 指纹/回放 ------------------------------- */

export function fingerprint(state: ExpeditionBattleState): string {
  return hashString(
    JSON.stringify({
      round: state.round,
      resonance: state.resonance,
      active: state.activeIndex,
      enemy: [state.enemy.hp, state.enemy.shield, state.enemy.phase, state.enemy.statuses],
      team: state.team.map((member) => [member.hp, member.alive, member.statuses, member.cooldowns]),
      outcome: state.outcome,
      log: state.log.length,
    }),
  ).toString(16);
}

export type BattleReplay = {
  seed: string;
  rounds: PlayerRoundInput[];
  plans: Array<{ round: number; actionId: EnemyActionId; reason?: string; taunt?: string }>;
  fingerprint: string;
};

export function replayBattle(input: {
  seed: string;
  team: V2Creature[];
  enemy: EnemyDef;
  startResonance?: number;
  rounds: PlayerRoundInput[];
  plans?: Array<{ round: number; actionId: EnemyActionId; reason?: string; taunt?: string }>;
}): ExpeditionBattleState {
  let state = createExpeditionBattle({
    seed: input.seed,
    team: input.team,
    enemy: input.enemy,
    ...(input.startResonance !== undefined ? { startResonance: input.startResonance } : {}),
  });
  for (const plan of input.plans ?? []) {
    if (plan.round === state.round) {
      state = applyEnemyPlan(state, {
        actionId: plan.actionId,
        reason: plan.reason ?? '回放',
        taunt: plan.taunt ?? '',
      });
    }
  }
  for (const round of input.rounds) {
    if (state.outcome) break;
    const plan = (input.plans ?? []).find((item) => item.round === state.round);
    if (plan) {
      state = applyEnemyPlan(state, {
        actionId: plan.actionId,
        reason: plan.reason ?? '回放',
        taunt: plan.taunt ?? '',
      });
    }
    state = resolveRound(state, round);
  }
  return state;
}

export function battleSummary(state: ExpeditionBattleState): {
  outcome: BattleOutcomeV2 | null;
  rounds: number;
  aiRounds: number;
  ruleRounds: number;
  rewards: BattleRewards;
} {
  return {
    outcome: state.outcome,
    rounds: state.round,
    aiRounds: state.planLog.filter((item) => item.source === 'ai').length,
    ruleRounds: state.planLog.filter((item) => item.source === 'rule').length,
    rewards: state.rewards,
  };
}

export function statusLabel(status: StatusStack): string {
  return `${STATUS_NAME[status.id]}${status.id === 'shield' ? '' : `×${status.stacks}`}`;
}

export function creatureHasTag(creature: V2Creature, tag: string): boolean {
  return creature.evidence.some((item: FeatureEvidence) => item.tag === tag);
}

export function pathName(creature: V2Creature): string {
  return PATH_META[creature.buildPath].name;
}


