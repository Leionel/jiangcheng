// @ts-expect-error Node types are only available in the test runner, not the web tsconfig
import { writeFileSync, mkdirSync } from 'node:fs';
// @ts-expect-error Node types are only available in the test runner, not the web tsconfig
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSample } from '../content/samples';
import { compileCreature } from '../domain/compile';
import { applyEvolution, branchesFor } from '../domain/evolution';
import { grantXp } from '../domain/growth';
import {
  ENEMIES,
  REGION_ORDER,
  applyEventChoice,
  advanceEventNode,
  completeNode,
  createRegionRun,
  currentNode,
  getEvent,
} from '../domain/region';
import { activeCreature, createExpeditionBattle, getLegalMainActions, getLegalSupportActions, resolveRound } from '../domain/battle2';
import type { BuildPath, ExpeditionBattleState, PlayerRoundInput, RegionId, V2Creature } from '../domain/types';

const PERSONAS: Array<{ id: string; name: string; paths: BuildPath[]; style: 'guard' | 'aggro' | 'support' | 'speed' | 'explore' }> = [
  { id: 'steady', name: '稳守型', paths: ['guardian', 'trickster', 'mover'], style: 'guard' },
  { id: 'burst', name: '爆发型', paths: ['striker', 'trickster', 'mover'], style: 'aggro' },
  { id: 'support', name: '支援型', paths: ['support', 'guardian', 'mover'], style: 'support' },
  { id: 'speed', name: '速通型', paths: ['striker', 'striker', 'support'], style: 'speed' },
  { id: 'explore', name: '探索型', paths: ['trickster', 'support', 'mover'], style: 'explore' },
];

const SAMPLE_IDS = ['yusan', 'reganmian', 'lundu'];

function makeTeam(paths: BuildPath[], level: number, variant: number): V2Creature[] {
  return paths.map((path, index) => {
    const sample = getSample(SAMPLE_IDS[index])!;
    let unit = compileCreature({
      vision: sample.vision,
      evidence: sample.evidence,
      buildPath: path,
      element: sample.element,
      source: 'sample',
      variant: variant + index,
    });
    while (unit.level < Math.min(5, level)) unit = grantXp(unit, 80).creature;
    return unit;
  });
}

function chooseRound(state: ExpeditionBattleState, style: string, round: number): PlayerRoundInput {
  const legal = getLegalMainActions(state);
  const supports = getLegalSupportActions(state);
  const active = activeCreature(state);
  const skills = legal.filter((action): action is { kind: 'skill'; skillId: string } => action.kind === 'skill');
  const swaps = legal.filter((action): action is { kind: 'swap'; targetIndex: number } => action.kind === 'swap');
  const support = supports.find((action) => action.kind === 'support');
  const link = supports.find((action) => action.kind === 'link');
  const low = active.hp / active.creature.stats.hp < 0.35;

  if (style === 'guard' && round % 4 === 2 && Number(round) > 0 && ((state.intent?.estimate ?? 0) > 18 || low)) {
    return { main: { kind: 'guard' }, ...(support ? { support } : {}) };
  }
  if (style === 'support' && swaps.length > 0 && low) {
    return { main: swaps[0], ...(support ? { support } : {}) };
  }
  if (style === 'speed' && low && support) {
    return { main: skills[0] ?? { kind: 'basic' }, support };
  }
  if (style === 'speed' && round % 2 === 0 && swaps.length > 0) {
    return { main: swaps[0], ...(link ? { support: link } : support ? { support } : {}) };
  }
  if (style === 'explore') {
    if (round % 3 === 0 && link) return { main: skills[0] ?? { kind: 'basic' }, support: link };
    if (round % 2 === 0 && support) return { main: skills[0] ?? { kind: 'basic' }, support };
  }
  if (style === 'aggro' && link && round === 1) return { main: skills[0] ?? { kind: 'basic' }, support: link };
  return { main: skills[0] ?? { kind: 'basic' }, ...(style === 'support' && support && round % 2 === 0 ? { support } : {}) };
}

function chooseEventChoice(eventId: string, style: string) {
  const event = getEvent(eventId);
  if (!event) return null;
  if (style === 'support' || style === 'guard') return event.choices[0];
  if (style === 'explore') return event.choices[event.choices.length - 1];
  return event.choices[0];
}

describe('Batch 4：自动试玩（5 名虚拟玩家 × 五区）', () => {
  it('五名虚拟玩家完成/记录五区流程，输出报告', () => {
    const rows: string[] = [];
    let totalBattles = 0;
    let totalWins = 0;
    for (const persona of PERSONAS) {
      let team = makeTeam(persona.paths, 2, 3);
      let regionsCleared = 0;
      let bossWins = 0;
      let losses = 0;
      const details: string[] = [];
      for (const regionId of REGION_ORDER as RegionId[]) {
        let run = createRegionRun(regionId, `${persona.id}-${regionId}-20261120`);
        for (let step = 0; step < 20 && !run.completed; step += 1) {
          const node = currentNode(run);
          if (node.type === 'event') {
            const event = getEvent(node.eventId);
            if (!event) break;
            const choice = chooseEventChoice(event.id, persona.style) ?? event.choices[0];
            const after = applyEventChoice(run, event.id, choice.id);
            run = advanceEventNode(after === run ? applyEventChoice(run, event.id, event.choices[1].id) : after);
            continue;
          }
          const enemy = ENEMIES[node.enemyId ?? ''];
          if (!enemy) break;
          let battle = createExpeditionBattle({
            seed: `${persona.id}-${regionId}-${node.id}-${step}`,
            team,
            enemy,
            startResonance: run.startResonance,
            bondLevel: 1,
            startShield: run.startShield,
            bossHpDelta: run.bossHpDelta,
          });
          let guard = 0;
          while (!battle.outcome && guard < 10) {
            battle = resolveRound(battle, chooseRound(battle, persona.style, guard));
            guard += 1;
          }
          totalBattles += 1;
          if (battle.outcome === 'win') {
            totalWins += 1;
            if (enemy.kind === 'boss') bossWins += 1;
            run = completeNode(run, battle.rewards);
          } else {
            losses += 1;
            details.push(`${regionId}:${node.title}:${battle.outcome}:r${battle.round}`);
            break;
          }
        }
        if (run.completed) {
          regionsCleared += 1;
          details.push(regionId);
          team = team.map((unit) => {
            let next = grantXp(unit, 40).creature;
            if (next.level >= 3 && !next.evolutionId) next = applyEvolution(next, branchesFor(next)[0]);
            return next;
          });
        } else {
          details.push(`${regionId}未完成`);
        }
      }
      rows.push(`| ${persona.name} | ${regionsCleared} / 5 | ${bossWins} | ${losses} | ${details.join(' / ')} |`);
    }
    const report = `# 江城万物怪 2.0 · 自动试玩报告\n\n> 这是**自动启发式试玩模拟**，不是真人试玩。它用 5 种玩家策略跑五区流程，用来发现死路、资源与节奏问题；真人试玩协议见 \`PLAYTEST_PROTOCOL.md\`。\n\n| 虚拟玩家 | 完成区域 | Boss 胜场 | 战斗失败 | 明细 |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n- 总战斗：${totalBattles} 场，胜率 ${Math.round((totalWins / Math.max(1, totalBattles)) * 100)}%。\n- 所有虚拟玩家从 2 级队伍出发，按区域推进成长，不手动调参。\n- 本报告由 \`src/v2/__tests__/playtest.test.ts\` 生成；不能替代真实用户观察。\n`;
    mkdirSync(resolve('docs'), { recursive: true });
    writeFileSync(resolve('docs/PLAYTEST_REPORT.md'), report, 'utf8');
    expect(rows).toHaveLength(5);
    expect(totalBattles).toBeGreaterThan(20);
  });
});






