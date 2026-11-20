import { describe, expect, it } from 'vitest';
import { EVENTS, REGIONS, applyEventChoice, currentNode, createRegionRun } from '../domain/region';

describe('Batch 2：20 个事件与后续影响', () => {
  it('事件总数 20，区域第二事件节点有额外池', () => {
    expect(Object.keys(EVENTS)).toHaveLength(20);
    for (const region of Object.values(REGIONS)) {
      expect(region.extraEvents).toHaveLength(2);
    }
  });

  it('选择事件会写入 flags，并影响后续事件/战斗准备', () => {
    let run = createRegionRun('river', 'event-seed');
    run = applyEventChoice(run, 'ev_fog_lamp', 'light');
    expect(run.flags).toContain('lamp_lit');
    expect(run.startResonance).toBe(4);
    // 第二事件节点按 seed 选择池中事件；若抽到灯笼事件，需前置 flag 才可选 return
    run = { ...run, nodeIndex: 2 };
    const node = currentNode(run);
    if (node.eventId === 'ev_river_lantern') {
      const locked = applyEventChoice(run, 'ev_river_lantern', 'return');
      expect(locked.bossHpDelta).toBe(-10);
    }
    expect(run.flags).toContain('lamp_lit');
  });

  it('需要前置 flag 的选项不可选；事件影响可叠加', () => {
    let run = createRegionRun('bridge', 'bridge-seed');
    const before = applyEventChoice(run, 'ev_bridge_blueprint', 'study');
    expect(before).toEqual(run);
    run = applyEventChoice(run, 'ev_bridge_blueprint', 'burn');
    expect(run.materials).toBe(3);
  });

  it('开局护盾/Boss 削弱会写入 run', () => {
    let run = createRegionRun('zao', 'zao-seed');
    run = applyEventChoice(run, 'ev_zao_steam', 'join');
    expect(run.flags).toContain('warm');
    run = applyEventChoice(run, 'ev_zao_queue', 'help');
    expect(run.flags).toContain('zao_helped');
    run = applyEventChoice(run, 'ev_zao_spice', 'take');
    expect(run.bossHpDelta).toBe(-8);
    run = applyEventChoice(run, 'ev_zao_second', 'eat');
    expect(run.startShield).toBe(8);
  });
});
