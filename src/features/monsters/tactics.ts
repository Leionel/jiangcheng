import type { BattleBoons, TacticDef, TacticId } from '../../shared/types';

/**
 * 赛前一次性战术（P1-A）。
 *
 * 设计约束：
 * 1. 只在战斗开始时选择一次，整场生效，战斗中不可更换 —— 因此它是「赛前决策」，不是新的按钮。
 * 2. 加成全部是固定系数，写进 BattleSide.boons，由 computeDamage / takeTurn 读取；
 *    不引入随机数，保证「同 seed + 同战术 + 同出招序列 = 同结果」。
 * 3. 战术效果与赛前看到的属性关系绑定（countered 由双方属性算出）：
 *    背水一战只在被克时提供完整翻盘加成，避免它变成所有对局的唯一最优解。
 */

export const TACTICS: Record<TacticId, TacticDef> = {
  desperado: {
    id: 'desperado',
    name: '背水一战',
    short: '逆风',
    desc: '被克时不再吃亏',
    detail: '属性被克时：被克系数 0.80 → 1.02，造成伤害 ×1.05，受到伤害 ×0.88；未被克时只加 2% 伤害。',
  },
  steady: {
    id: 'steady',
    name: '稳扎稳打',
    short: '稳守',
    desc: '少吃伤害，细水长流',
    detail: '整场造成伤害 ×1.00，受到伤害 ×0.95。适合硬拼和血厚的对手。',
  },
  swift: {
    id: 'swift',
    name: '快人一步',
    short: '抢先',
    desc: '首回合先手',
    detail: '首回合先手（优先于速度），造成伤害 ×1.06，受到伤害 ×0.97。适合需要先压血的局。',
  },
};

export const TACTIC_LIST: TacticDef[] = [TACTICS.desperado, TACTICS.steady, TACTICS.swift];

const NEUTRAL_BOONS: BattleBoons = {
  damageMult: 1,
  damageTakenMult: 1,
  firstStrike: false,
  comebackMult: null,
};

export function neutralBoons(): BattleBoons {
  return { ...NEUTRAL_BOONS };
}

/**
 * 战术 → 战斗加成。
 * @param countered 我方属性是否被对手克制（由 createBattle 用双方属性算好，纯函数输入）
 */
export function tacticBoons(
  tactic: TacticId | null | undefined,
  countered = false,
): BattleBoons {
  switch (tactic) {
    case 'desperado':
      return countered
        ? { damageMult: 1.05, damageTakenMult: 0.88, firstStrike: false, comebackMult: 1.02 }
        : { damageMult: 1.02, damageTakenMult: 1, firstStrike: false, comebackMult: null };
    case 'steady':
      return { damageMult: 1, damageTakenMult: 0.95, firstStrike: false, comebackMult: null };
    case 'swift':
      return { damageMult: 1.06, damageTakenMult: 0.97, firstStrike: true, comebackMult: null };
    default:
      return neutralBoons();
  }
}

export function isTacticId(value: unknown): value is TacticId {
  return value === 'desperado' || value === 'steady' || value === 'swift';
}

export function tacticName(tactic: TacticId | null | undefined): string {
  return tactic ? TACTICS[tactic].name : '无战术';
}

/** 战术在当前对局是否吃到完整效果（供界面如实展示） */
export function tacticIsActive(tactic: TacticId | null | undefined, countered: boolean): boolean {
  if (!tactic) return false;
  if (tactic === 'desperado') return countered;
  return true;
}

/** 面对不同属性关系时给一个默认推荐：被克背水、优势抢先、中性稳守 */
export function recommendTactic(typeMultiplier: number): TacticId {
  if (typeMultiplier < 0.99) return 'desperado';
  if (typeMultiplier > 1.01) return 'swift';
  return 'steady';
}
