import { describe, expect, it } from 'vitest';
import type { BattleState, Monster, SkillId, VisionSummary } from '../../../shared/types';
import { SAMPLES } from '../samples';
import { buildMonster, allocateStats } from '../build';
import { assignSkills, dealsDamage, SKILLS } from '../skills';
import { typeMultiplier } from '../elements';
import { ENEMIES } from '../enemies';
import {
  createBattle,
  takeTurn,
  hpPercent,
  computeDamage,
  MAX_ROUNDS,
  weatherForSeed,
} from '../battle';
import { coerceDraft, AnalyzeResponseSchema } from '../../../shared/ai/schemas';
import { validateFile, UploadError, localAnalyzer, recipeFromVision } from '../analyze';
import { variantOf } from '../analyze';

function monsterFromSample(index: number, mode: Monster['generationMode'] = 'demo'): Monster {
  const sample = SAMPLES[index];
  return buildMonster({
    id: `test-${sample.id}`,
    vision: sample.vision,
    draft: sample.draft,
    source: 'demo',
    generationMode: mode,
    variant: variantOf(sample.vision),
    createdAt: 1_700_000_000_000,
  });
}

const randomVision = (seed: number): VisionSummary => ({
  primaryObject: `物件${seed}`,
  category: (['food', 'water', 'building', 'nature', 'everyday'] as const)[seed % 5],
  colors: ['#C9822F', '#2C6E8F'],
  features: [`特征${seed}`, '圆柱'],
  confidence: seed % 2 === 0 ? 'high' : 'low',
});

describe('精灵卡构建：数值与技能边界', () => {
  it('所有示例都在规定区间内，且同一输入可复现', () => {
    for (const sample of SAMPLES) {
      const a = buildMonster({
        id: 'a',
        vision: sample.vision,
        draft: sample.draft,
        source: 'demo',
        generationMode: 'demo',
        variant: 7,
      });
      const b = buildMonster({
        id: 'b',
        vision: sample.vision,
        draft: sample.draft,
        source: 'demo',
        generationMode: 'demo',
        variant: 7,
      });
      expect(a.stats).toEqual(b.stats);
      expect(a.stats.hp).toBeGreaterThanOrEqual(65);
      expect(a.stats.hp).toBeLessThanOrEqual(100);
      expect(a.stats.attack).toBeGreaterThanOrEqual(18);
      expect(a.stats.attack).toBeLessThanOrEqual(35);
      expect(a.stats.defense).toBeGreaterThanOrEqual(5);
      expect(a.stats.defense).toBeLessThanOrEqual(20);
      expect(a.stats.speed).toBeGreaterThanOrEqual(5);
      expect(a.stats.speed).toBeLessThanOrEqual(20);
      expect(Number.isNaN(a.stats.hp)).toBe(false);
    }
  });

  it('200 组随机特征都不越界、不产生 NaN', () => {
    for (let i = 0; i < 200; i += 1) {
      const vision = randomVision(i);
      const stats = allocateStats(vision, 'nature', i);
      Object.values(stats).forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      });
      expect(stats.hp).toBeLessThanOrEqual(100);
      expect(stats.attack).toBeLessThanOrEqual(35);
    }
  });

  it('每只精灵至少带一个可造成伤害的技能', () => {
    const combos: SkillId[][] = [
      ['GUARD', 'RECOVER'],
      ['RECOVER', 'GUARD'],
      ['GUARD', 'GUARD'],
      [],
    ];
    for (const preferred of combos) {
      const skills = assignSkills('food', preferred);
      expect(skills.some(dealsDamage)).toBe(true);
      expect(skills[0]).not.toBe(skills[1]);
    }
  });

  it('非法模型输出会被裁剪或拒绝', () => {
    const bad = coerceDraft({ name: '很强', theme: 'x', element: 'fire', preferredSkillIds: ['ULTIMATE'], visualRecipe: {} });
    expect(bad.ok).toBe(true);
    expect(['food', 'water', 'structure', 'nature', 'tool']).toContain(bad.draft?.element);
    expect(bad.draft?.preferredSkillIds).toEqual([]);
    expect(coerceDraft(null).ok).toBe(false);
    expect(coerceDraft('一段文字').ok).toBe(false);
  });

  it('API 响应 schema 拒绝越界数值与未知枚举', () => {
    const base = {
      mode: 'live_ai',
      vision: SAMPLES[0].vision,
      draft: SAMPLES[0].draft,
      meta: { model: 'm', latencyMs: 10, requestId: 'r' },
    };
    expect(AnalyzeResponseSchema.safeParse(base).success).toBe(true);
    expect(
      AnalyzeResponseSchema.safeParse({ ...base, draft: { ...SAMPLES[0].draft, element: 'fire' } }).success,
    ).toBe(false);
    expect(AnalyzeResponseSchema.safeParse({ ...base, mode: 'magic' }).success).toBe(false);
  });
});

describe('属性克制', () => {
  it('早味 → 木叶 → 江流 构成闭环，铁骨与机巧中立', () => {
    expect(typeMultiplier('food', 'nature')).toBe(1.25);
    expect(typeMultiplier('nature', 'water')).toBe(1.25);
    expect(typeMultiplier('water', 'food')).toBe(1.25);
    expect(typeMultiplier('nature', 'food')).toBe(0.8);
    expect(typeMultiplier('structure', 'food')).toBe(1);
    expect(typeMultiplier('tool', 'water')).toBe(1);
    expect(typeMultiplier('food', 'food')).toBe(1);
  });
});

describe('战斗结算', () => {
  it('HP 不会为负，且最迟三回合结束', () => {
    for (let i = 0; i < 40; i += 1) {
      const monster = monsterFromSample(i % SAMPLES.length);
      const enemy = ENEMIES[i % ENEMIES.length];
      let state = createBattle(monster, enemy, `seed-${i}`);
      let guard = 0;
      while (!state.outcome && guard < 8) {
        const skill = state.player.skills[guard % 2];
        state = takeTurn(state, skill);
        guard += 1;
        expect(state.player.hp).toBeGreaterThanOrEqual(0);
        expect(state.enemy.hp).toBeGreaterThanOrEqual(0);
      }
      expect(state.outcome).not.toBeNull();
      expect(state.round).toBeLessThanOrEqual(MAX_ROUNDS);
    }
  });

  it('同种子 + 同出招序列 → 完全一致的结果', () => {
    const monster = monsterFromSample(0);
    const play = () => {
      let state = createBattle(monster, ENEMIES[0], 'fixed-seed');
      const seq: SkillId[] = [monster.skills[0], monster.skills[1], monster.skills[0]];
      for (const skill of seq) {
        if (state.outcome) break;
        state = takeTurn(state, skill);
      }
      return {
        hp: [state.player.hp, state.enemy.hp],
        outcome: state.outcome,
        log: state.log.map((e) => `${e.kind}:${e.text}`),
      };
    };
    expect(play()).toEqual(play());
  });

  it('不同种子会改变天气或出手顺序，但结果仍合法', () => {
    const weathers = new Set<string>();
    for (let i = 0; i < 24; i += 1) {
      weathers.add(weatherForSeed(`s${i}`).id);
    }
    expect(weathers.size).toBeGreaterThan(1);
  });

  it('伤害被限制在 5–45，防御减半生效', () => {
    const monster = monsterFromSample(0);
    const state = createBattle(monster, ENEMIES[3], 'calc');
    const normal = computeDamage(state.player, state.enemy, 'BURST', state.weather);
    const guarded = computeDamage(
      state.player,
      { ...state.enemy, guard: true },
      'BURST',
      state.weather,
    );
    expect(normal.damage).toBeGreaterThanOrEqual(5);
    expect(normal.damage).toBeLessThanOrEqual(45);
    expect(guarded.damage).toBeLessThan(normal.damage);
    expect(guarded.guarded).toBe(true);
  });

  it('小憩回血一局只能用一次', () => {
    const sample = SAMPLES[0];
    const monster = buildMonster({
      id: 'healer',
      vision: sample.vision,
      draft: { ...sample.draft, preferredSkillIds: ['BURST', 'RECOVER'] },
      source: 'demo',
      generationMode: 'demo',
    });
    let state = createBattle(monster, ENEMIES[0], 'recover-test');
    state = takeTurn(state, 'RECOVER');
    const healed = state.player.hp;
    expect(state.player.recoverUsed).toBe(true);
    if (!state.outcome) {
      state = takeTurn(state, 'RECOVER');
      const secondUse = state.log.filter((e) => e.kind === 'recover').slice(-1)[0];
      expect(secondUse.text).toContain('已经用过');
      expect(state.player.hp).toBeLessThanOrEqual(healed);
    }
  });

  it('胜负分支都可达（多组种子）', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const monster = monsterFromSample(i % SAMPLES.length);
      const enemy = ENEMIES[(i + 1) % ENEMIES.length];
      let state = createBattle(monster, enemy, `branch-${i}`);
      let guard = 0;
      while (!state.outcome && guard < 6) {
        state = takeTurn(state, state.player.skills[0]);
        guard += 1;
      }
      if (state.outcome) outcomes.add(state.outcome);
    }
    expect(outcomes.has('win')).toBe(true);
    expect(outcomes.has('lose') || outcomes.has('draw')).toBe(true);
  });
});

describe('图片输入校验', () => {
  it('拒绝错误类型与超大文件', () => {
    const txt = new File(['hello'], 'a.txt', { type: 'text/plain' });
    expect(() => validateFile(txt)).toThrow(UploadError);

    const huge = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    expect(() => validateFile(huge)).toThrow(/5MB/);

    const tiny = new File([new Uint8Array(10)], 'tiny.png', { type: 'image/png' });
    expect(() => validateFile(tiny)).toThrow(/不完整/);

    const ok = new File([new Uint8Array(4096)], 'ok.jpg', { type: 'image/jpeg' });
    expect(() => validateFile(ok)).not.toThrow();
  });
});

describe('本地降级生成', () => {
  it('同一张图的降级草稿稳定、调色板合法', () => {
    const vision = randomVision(3);
    const a = localAnalyzer(vision, ['#112233', '#445566', '#778899']);
    const b = localAnalyzer(vision, ['#112233', '#445566', '#778899']);
    expect(a).toEqual(b);
    a.visualRecipe.palette.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
    expect(dealsDamage(a.preferredSkillIds[0]) || dealsDamage(a.preferredSkillIds[1])).toBe(true);
    expect(recipeFromVision(vision).palette.length).toBe(3);
  });
});

describe('平衡报告（不参与断言，用于调参）', () => {
  it('输出 5 只样本 × 4 个对手的胜率与平均回合数', () => {
    const rows: Array<Record<string, string | number>> = [];

    // 一个朴素但合理的策略：血少先回血，被克制时防御，否则打本系爆发
    const policy = (state: BattleState): SkillId => {
      const me = state.player;
      const ratio = hpPercent(me) / 100;
      const has = (id: SkillId) => me.skills.includes(id);
      if (ratio < 0.4 && has('RECOVER') && !me.recoverUsed) return 'RECOVER';
      const intent = state.intent;
      if (has('GUARD') && intent && intent.estimatedDamage >= 26 && ratio < 0.62) return 'GUARD';
      if (has('BURST')) return 'BURST';
      if (has('QUICK')) return 'QUICK';
      return me.skills.find(dealsDamage) ?? me.skills[0];
    };

    for (let s = 0; s < SAMPLES.length; s += 1) {
      const monster = monsterFromSample(s);
      for (const enemy of ENEMIES) {
        let wins = 0;
        let rounds = 0;
        let kos = 0;
        const n = 24;
        for (let i = 0; i < n; i += 1) {
          let state = createBattle(monster, enemy, `sim-${s}-${enemy.id}-${i}`);
          let guard = 0;
          while (!state.outcome && guard < 6) {
            const skill = policy(state);
            state = takeTurn(state, skill);
            guard += 1;
          }
          if (state.outcome === 'win') wins += 1;
          rounds += state.round;
          if (state.enemy.hp <= 0) kos += 1;
        }
        rows.push({
          精灵: monster.name,
          属性: monster.element,
          对手: enemy.name,
          胜率: `${Math.round((wins / n) * 100)}%`,
          平均回合: (rounds / n).toFixed(1),
          击倒率: `${Math.round((kos / n) * 100)}%`,
        });
      }
    }
    // eslint-disable-next-line no-console
    console.table(
      SAMPLES.map((_sample, i) => {
        const m = monsterFromSample(i);
        return {
          精灵: m.name,
          属性: m.element,
          HP: m.stats.hp,
          ATK: m.stats.attack,
          DEF: m.stats.defense,
          SPD: m.stats.speed,
          技能: m.skills.join('+'),
        };
      }),
    );
    // eslint-disable-next-line no-console
    console.table(rows);
    expect(rows.length).toBe(SAMPLES.length * ENEMIES.length);
    expect(SKILLS.BURST.power).toBeGreaterThan(0);
  });
});
