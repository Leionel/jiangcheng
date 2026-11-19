import { describe, expect, it } from 'vitest';
import type { SkillId } from '../../../shared/types';
import { SAMPLES } from '../samples';
import { buildMonster } from '../build';
import { ENEMIES } from '../enemies';
import { createBattle, takeTurn } from '../battle';
import { variantOf } from '../analyze';
import { hashString } from '../../../shared/rng';

/**
 * v1 冻结回归：v2 开发期间不允许改变 quick_v1 的数值与日志。
 * 指纹来自 P1 版本实际运行（2026-11-19），任何变化都说明 v1 规则被意外改动。
 */
const GOLDEN = [
  { pair: 'reganmian/fog', hp: '5/44', outcome: 'lose', logHash: '2eabb66b' },
  { pair: 'reganmian/tofu', hp: '32/36', outcome: 'draw', logHash: '279c6aec' },
  { pair: 'reganmian/branch', hp: '79/46', outcome: 'win', logHash: '7b4a1e3e' },
  { pair: 'reganmian/iron', hp: '79/59', outcome: 'win', logHash: '70a21c10' },
  { pair: 'yusan/fog', hp: '23/34', outcome: 'lose', logHash: 'a74dfd7e' },
  { pair: 'yusan/tofu', hp: '44/38', outcome: 'win', logHash: '15d7420' },
  { pair: 'yusan/branch', hp: '26/44', outcome: 'lose', logHash: '3244950e' },
  { pair: 'yusan/iron', hp: '38/50', outcome: 'lose', logHash: '799702ba' },
  { pair: 'yinghua/fog', hp: '30/8', outcome: 'win', logHash: '8a5a6a40' },
  { pair: 'yinghua/tofu', hp: '15/34', outcome: 'lose', logHash: '6ac6abf9' },
  { pair: 'yinghua/branch', hp: '38/32', outcome: 'win', logHash: '87fd7329' },
  { pair: 'yinghua/iron', hp: '71/51', outcome: 'win', logHash: 'c27bdde0' },
  { pair: 'lundu/fog', hp: '13/18', outcome: 'lose', logHash: '90533797' },
  { pair: 'lundu/tofu', hp: '28/10', outcome: 'win', logHash: '4ddf01ab' },
  { pair: 'lundu/branch', hp: '56/48', outcome: 'win', logHash: 'f5409180' },
  { pair: 'lundu/iron', hp: '49/33', outcome: 'win', logHash: 'ec41785d' },
  { pair: 'shuibei/fog', hp: '28/34', outcome: 'lose', logHash: '2a80eef2' },
  { pair: 'shuibei/tofu', hp: '19/38', outcome: 'lose', logHash: 'cac0278e' },
  { pair: 'shuibei/branch', hp: '52/44', outcome: 'win', logHash: 'b1eb1f71' },
  { pair: 'shuibei/iron', hp: '81/57', outcome: 'win', logHash: '7501c00b' },
] as const;

describe('v1 冻结回归（quick_v1 golden）', () => {
  it('20 组固定对局的 HP/胜负/日志指纹与 P1 一致', () => {
    const rows: Array<{ pair: string; hp: string; outcome: string; logHash: string }> = [];
    for (let s = 0; s < SAMPLES.length; s += 1) {
      const sample = SAMPLES[s];
      const monster = buildMonster({
        id: `golden-${sample.id}`,
        vision: sample.vision,
        draft: sample.draft,
        source: 'demo',
        generationMode: 'demo',
        variant: variantOf(sample.vision),
        createdAt: 1_700_000_000_000,
      });
      for (let e = 0; e < ENEMIES.length; e += 1) {
        const enemy = ENEMIES[e];
        let state = createBattle(monster, enemy, `golden-${s}-${e}`);
        const seq: SkillId[] = [monster.skills[0], monster.skills[1], monster.skills[0]];
        for (const skill of seq) {
          if (state.outcome) break;
          state = takeTurn(state, skill);
        }
        rows.push({
          pair: `${sample.id}/${enemy.id}`,
          hp: `${state.player.hp}/${state.enemy.hp}`,
          outcome: state.outcome ?? 'none',
          logHash: hashString(state.log.map((item) => `${item.kind}:${item.text}`).join('|')).toString(16),
        });
      }
    }
    expect(rows).toEqual(GOLDEN.map((row) => ({ ...row })));
  });
});
