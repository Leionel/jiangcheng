import { ACTIVE_MODULES, LINKS, PASSIVE_MODULES, SUPPORT_COMMANDS } from './modules';
import { ALL_TAGS, BUILD_PATHS, isBuildPath, isTag } from '../domain/tags';
import { ENEMIES, EVENTS, RIVER_REGION } from '../domain/region';

export type ContentIssue = { level: 'error' | 'warn'; message: string };

/**
 * 内容自检：启动/测试时确保所有数据表引用完整、枚举合法。
 * 规则：内容错误直接阻断（error），内容偏弱只提示（warn）。
 */
export function validateContent(): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const tagSet = new Set<string>(ALL_TAGS);

  const ids = new Set<string>();
  for (const module of [...ACTIVE_MODULES, ...PASSIVE_MODULES]) {
    if (ids.has(module.id)) issues.push({ level: 'error', message: `重复模块 ID：${module.id}` });
    ids.add(module.id);
    for (const tag of module.tags) {
      if (!tagSet.has(tag)) issues.push({ level: 'error', message: `${module.id} 含非法标签 ${tag}` });
    }
    if (module.tags.length === 0) issues.push({ level: 'warn', message: `${module.id} 没有标签` });
  }
  for (const module of ACTIVE_MODULES) {
    if (module.effect.kind === 'damage' && (module.effect.power < 1 || module.effect.power > 40)) {
      issues.push({ level: 'error', message: `${module.id} 伤害数值越界 ${module.effect.power}` });
    }
    if (module.cost < 0 || module.cost > 3) issues.push({ level: 'error', message: `${module.id} 共鸣消耗越界` });
    if (module.cooldown < 0 || module.cooldown > 3) issues.push({ level: 'error', message: `${module.id} 冷却越界` });
  }
  for (const support of SUPPORT_COMMANDS) {
    if (support.cost < 0 || support.cost > 2) issues.push({ level: 'error', message: `${support.id} 消耗越界` });
  }
  for (const link of LINKS) {
    for (const path of link.requires) {
      if (!isBuildPath(path)) issues.push({ level: 'error', message: `${link.id} 引用了非法 build path ${path}` });
    }
    if (link.cost < 1 || link.cost > 3) issues.push({ level: 'error', message: `${link.id} 连携消耗越界` });
  }
  for (const enemy of Object.values(ENEMIES)) {
    if (enemy.maxHp < 20 || enemy.maxHp > 400) issues.push({ level: 'error', message: `${enemy.id} HP 越界` });
    if (!isTag(enemy.element)) issues.push({ level: 'warn', message: `${enemy.id} 属性不是标签（允许）` });
  }
  for (const node of RIVER_REGION.nodes) {
    if (node.eventId && !EVENTS[node.eventId]) issues.push({ level: 'error', message: `${node.id} 引用不存在的事件 ${node.eventId}` });
    if (node.enemyId && !ENEMIES[node.enemyId]) issues.push({ level: 'error', message: `${node.id} 引用不存在的敌人 ${node.enemyId}` });
    if ((node.type === 'battle' || node.type === 'elite' || node.type === 'boss') && !node.enemyId) {
      issues.push({ level: 'error', message: `${node.id} 战斗节点缺少敌人` });
    }
  }
  for (const event of Object.values(EVENTS)) {
    if (event.choices.length < 2) issues.push({ level: 'error', message: `${event.id} 事件选择过少` });
    for (const choice of event.choices) {
      if (choice.effect.kind === 'materials' && choice.effect.amount > 5) {
        issues.push({ level: 'warn', message: `${event.id}/${choice.id} 材料奖励偏高` });
      }
    }
  }
  if (BUILD_PATHS.length !== 5) issues.push({ level: 'error', message: 'build path 数量异常' });
  return issues;
}
