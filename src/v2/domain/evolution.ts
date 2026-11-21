import { ACTIVE_BY_ID } from '../content/modules';
import { EVOLUTION_BY_ID, EVOLUTION_GROUPS } from '../content/evolutions';
import type { EvolutionBranch, EvolutionGroup, V2Creature } from './types';

const TAG_PRIORITY: Array<{ tags: string[]; group: string }> = [
  { tags: ['protect', 'foldable', 'tool'], group: 'umbrella' },
  { tags: ['nourish', 'street_food', 'food'], group: 'noodle' },
  { tags: ['flower', 'nature'], group: 'blossom' },
  { tags: ['river', 'vehicle', 'propel'], group: 'ferry' },
  { tags: ['stationery', 'layered'], group: 'archive' },
  { tags: ['illuminate', 'invention'], group: 'lamp' },
  { tags: ['hollow', 'liquid_like'], group: 'cup' },
  { tags: ['textile', 'carry'], group: 'bag' },
  { tags: ['bridge', 'connect'], group: 'bridge' },
  { tags: ['rain'], group: 'rain' },
];

export function evolutionGroupFor(creature: V2Creature): EvolutionGroup {
  const tags = new Set(creature.evidence.map((item) => item.tag));
  for (const rule of TAG_PRIORITY) {
    if (rule.tags.some((tag) => tags.has(tag as never))) {
      const group = EVOLUTION_GROUPS.find((item) => item.id === rule.group);
      if (group) return group;
    }
  }
  return EVOLUTION_GROUPS[0];
}

export function canEvolve(creature: V2Creature): boolean {
  return creature.level >= 3 && !creature.evolutionId;
}

export function branchesFor(creature: V2Creature): EvolutionBranch[] {
  return evolutionGroupFor(creature).branches;
}

export function branchById(id: string): EvolutionBranch | null {
  return EVOLUTION_BY_ID.get(id) ?? null;
}

export function previewEvolution(creature: V2Creature, branch: EvolutionBranch) {
  const module = ACTIVE_BY_ID.get(branch.moduleId);
  return {
    name: branch.name,
    desc: branch.desc,
    statBonus: branch.statBonus,
    stats: {
      hp: creature.stats.hp + branch.statBonus.hp,
      atk: creature.stats.atk + branch.statBonus.atk,
      def: creature.stats.def + branch.statBonus.def,
      spd: creature.stats.spd + branch.statBonus.spd,
    },
    module,
    palette: branch.palette,
    visual: {
      ...creature.visual,
      palette: branch.palette,
      evolutionLayers: [...new Set([...creature.visual.evolutionLayers, ...branch.visualLayers])],
    },
  };
}

function damageModule(creature: V2Creature): string | null {
  return (
    creature.actives.find((id) => {
      const module = ACTIVE_BY_ID.get(id);
      return module?.effect.kind === 'damage' || module?.effect.kind === 'control';
    }) ?? null
  );
}

/** 应用进化：保存基准、加属性、加入进化模块、换配色 */
export function applyEvolution(creature: V2Creature, branch: EvolutionBranch): V2Creature {
  if (creature.evolutionId) throw new Error('已经进化过；先回退再选择新分支');
  if (creature.level < 3) throw new Error('熟练度不足：需要 3 级');
  const module = ACTIVE_BY_ID.get(branch.moduleId);
  if (!module) throw new Error('进化模块不存在');
  const actives = [branch.moduleId, ...creature.actives.filter((id) => id !== branch.moduleId)].slice(0, 3);
  const damage = damageModule({ ...creature, actives });
  // 保证进化后仍有一个伤害技能在第一个装备位，避免“进化完只会放盾”
  const equipped = (damage ? [damage, ...(branch.moduleId !== damage ? [branch.moduleId] : [])] : [branch.moduleId, ...creature.equipped]).slice(0, 2);
  return {
    ...creature,
    evolutionId: branch.id,
    evolutionHistory: [...creature.evolutionHistory, branch.id],
    evolutionBase: {
      stats: { ...creature.stats },
      actives: [...creature.actives],
      equipped: [...creature.equipped],
      palette: [...creature.visual.palette] as [string, string, string],
    },
    stats: {
      hp: creature.stats.hp + branch.statBonus.hp,
      atk: creature.stats.atk + branch.statBonus.atk,
      def: creature.stats.def + branch.statBonus.def,
      spd: creature.stats.spd + branch.statBonus.spd,
    },
    actives,
    equipped,
    visual: {
      ...creature.visual,
      palette: branch.palette,
      evolutionLayers: [...new Set([...creature.visual.evolutionLayers, ...branch.visualLayers])],
    },
  };
}

/** 回退进化：恢复基准、记录回退；费用由调用方处理 */
export function revertEvolution(creature: V2Creature): V2Creature {
  if (!creature.evolutionId || !creature.evolutionBase) throw new Error('没有可回退的进化');
  const base = creature.evolutionBase;
  return {
    ...creature,
    evolutionId: undefined,
    evolutionHistory: [...creature.evolutionHistory, `revert:${creature.evolutionId}`],
    evolutionBase: undefined,
    stats: { ...base.stats },
    actives: [...base.actives],
    equipped: [...base.equipped],
    visual: {
      ...creature.visual,
      palette: [...base.palette] as [string, string, string],
      evolutionLayers: creature.visual.evolutionLayers.filter((layer) => !EVOLUTION_BY_ID.get(creature.evolutionId!)?.visualLayers.includes(layer)),
    },
  };
}
