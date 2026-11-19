import type { BattleSide, BattleState, Enemy, SkillId } from '../../shared/types';
import { ELEMENT_NAMES, computeDamage } from './battle';
import { ELEMENTS, typeMultiplier } from './elements';
import { SKILLS } from './skills';

/**
 * 敌方 AI 指挥官的协议层（纯函数，浏览器与服务端测试共用）。
 *
 * 设计要点：
 * 1. 发给模型的只有「玩家此刻看得见的状态」：回合、天气、双方 HP/属性/技能、候选招式的预计伤害。
 * 2. 模型只能从候选招式里选一个（合法招式白名单），它不能改数值、不能发明技能。
 * 3. 返回后由 sanitizePlan 再校验一次；越界一律拒绝，调用方回落到 ruleIntent。
 */

export type BattleSideSnapshot = {
  name: string;
  /** 属性 id（服务端 schema 校验用） */
  element: string;
  /** 属性中文名（给模型读，不参与任何数值） */
  elementName: string;
  hp: number;
  maxHp: number;
  hpPercent: number;
  stats: { hp: number; attack: number; defense: number; speed: number };
  skills: SkillId[];
};

export type BattlePlanCandidate = {
  skill: SkillId;
  name: string;
  kind: 'attack' | 'guard' | 'heal' | 'buff';
  power: number;
  priority: number;
  elemental: boolean;
  /** 规则引擎算出的预计伤害（0 表示无直接伤害） */
  estimate: number;
  /** 相对我方的属性倍率（仅吃属性的招式才有意义） */
  matchup: number;
  effect: string;
};

export type BattlePlanPayload = {
  round: number;
  maxRounds: number;
  weather: { name: string; boostElement: string | null };
  player: BattleSideSnapshot;
  enemy: BattleSideSnapshot & { id: string; taunt: string };
  candidates: BattlePlanCandidate[];
  lastPlayerSkill: SkillId | null;
  lastPlayerSkillName: string | null;
  logTail: string[];
  /** 给模型的局面提示（由规则生成，不是模型自由发挥） */
  situation: string[];
};

function snapshot(side: BattleSide): BattleSideSnapshot {
  return {
    name: side.name,
    element: side.element,
    elementName: ELEMENT_NAMES[side.element],
    hp: Math.max(0, side.hp),
    maxHp: side.stats.hp,
    hpPercent: Math.round((Math.max(0, side.hp) / Math.max(1, side.stats.hp)) * 100),
    stats: { ...side.stats },
    skills: [...side.skills],
  };
}

/** 只取最近几条战报文本，避免把整局历史塞给模型 */
function logTail(state: BattleState, count = 5): string[] {
  return state.log
    .slice(-count)
    .map((event) => `${event.text}${event.note ? `（${event.note}）` : ''}`)
    .map((text) => text.slice(0, 120));
}

export function buildBattlePlanPayload(state: BattleState, enemy: Enemy): BattlePlanPayload {
  const candidates: BattlePlanCandidate[] = state.enemy.skills.map((skillId) => {
    const def = SKILLS[skillId];
    const deals = def.kind === 'attack' || def.kind === 'buff';
    return {
      skill: skillId,
      name: def.name,
      kind: def.kind,
      power: def.power,
      priority: def.priority,
      elemental: def.elemental,
      estimate: deals ? computeDamage(state.enemy, state.player, skillId, state.weather).damage : 0,
      matchup: def.elemental ? typeMultiplier(state.enemy.element, state.player.element) : 1,
      effect: def.effect,
    };
  });

  const lastPlayerSkillEvent = [...state.log]
    .reverse()
    .find((event) => event.kind === 'skill' && event.actor === 'player');
  const lastPlayerSkill = lastPlayerSkillEvent?.skill ?? null;

  const lastEnemyPlan = state.planLog[state.planLog.length - 1];
  const situation: string[] = [];
  if (state.enemy.hp / Math.max(1, state.enemy.stats.hp) <= 0.35) situation.push('敌方血量偏低');
  if (state.player.hp / Math.max(1, state.player.stats.hp) <= 0.35) situation.push('我方血量偏低，可能收尾');
  if (state.round === state.maxRounds) situation.push('最后一回合，按剩余 HP 百分比判定');
  if (lastEnemyPlan) situation.push(`上一回合敌方出招：${SKILLS[lastEnemyPlan.skill].name}`);
  if (state.weather.boostElement) {
    situation.push(
      `天气「${state.weather.name}」加强 ${ELEMENTS[state.weather.boostElement].name} 属性技能`,
    );
  }

  return {
    round: state.round,
    maxRounds: state.maxRounds,
    weather: {
      name: state.weather.name,
      boostElement: state.weather.boostElement ? ELEMENTS[state.weather.boostElement].name : null,
    },
    player: snapshot(state.player),
    enemy: { ...snapshot(state.enemy), id: enemy.id, taunt: enemy.taunt },
    candidates,
    lastPlayerSkill,
    lastPlayerSkillName: lastPlayerSkill ? SKILLS[lastPlayerSkill].name : null,
    logTail: logTail(state),
    situation,
  };
}

/** 清理模型给出的短文本：去控制字符/尖括号，压平空白，限长 */
export function cleanPlanText(input: unknown, maxLen: number, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return Array.from(cleaned).slice(0, maxLen).join('');
}

export type SanitizedPlan = {
  skill: SkillId;
  reason: string;
  taunt?: string;
};

/**
 * 校验模型输出：skill 必须在 allowed 中；reason/taunt 只保留安全短文本。
 * 返回 null 表示不可用，调用方必须回落到规则意图。
 */
export function sanitizePlan(input: unknown, allowed: SkillId[]): SanitizedPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const skill = raw.skill;
  if (typeof skill !== 'string' || !(allowed as string[]).includes(skill)) return null;
  const reason = cleanPlanText(raw.reason, 36, '按当前局面选一招');
  const taunt = cleanPlanText(raw.taunt, 44, '');
  const plan: SanitizedPlan = { skill: skill as SkillId, reason };
  if (taunt) plan.taunt = taunt;
  return plan;
}

/** 模块外的便捷判断：一个字符串是不是敌方当前可出的招 */
export function isPlanSkill(skill: unknown, allowed: SkillId[]): skill is SkillId {
  return typeof skill === 'string' && (allowed as string[]).includes(skill);
}
