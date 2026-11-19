import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ExpeditionBattleState, RegionRunState, SaveV2, V2Creature } from '../domain/types';
import type { EnemyDef, RegionNodeDef } from '../domain/types';
import { PATH_META, TAG_LABELS } from '../domain/tags';
import { ACTIVE_BY_ID, PASSIVE_BY_ID } from '../content/modules';
import { RIVER_REGION, currentNode, getEnemy, getEvent, nodeProgress, regionComplete } from '../domain/region';
import { battleSummary } from '../domain/battle2';
import { v2AiLog } from '../ai/gateway';
import { MonsterSprite } from '../../features/monsters/MonsterSprite';

export function CreatureMiniCard({
  creature,
  active,
  action,
}: {
  creature: V2Creature;
  active?: boolean;
  action?: ReactNode;
}) {
  const passive = PASSIVE_BY_ID.get(creature.passiveId);
  return (
    <div className="v2-creature-card" data-active={Boolean(active)}>
      <span className="v2-creature-art">
        <MonsterSprite recipe={creature.visual} title={creature.name} />
      </span>
      <div className="v2-creature-main">
        <div className="v2-creature-head">
          <b>{creature.name}</b>
          <span className="mono" style={{ color: PATH_META[creature.buildPath].color }}>
            {PATH_META[creature.buildPath].name}
          </span>
        </div>
        <p className="fineprint">{creature.flavor}</p>
        <div className="v2-creature-stats mono">
          <span>HP {creature.stats.hp}</span>
          <span>ATK {creature.stats.atk}</span>
          <span>DEF {creature.stats.def}</span>
          <span>SPD {creature.stats.spd}</span>
          <span>战绩 {creature.record.wins}W-{creature.record.losses}L</span>
        </div>
        <div className="v2-module-line">
          {creature.equipped.map((id) => {
            const module = ACTIVE_BY_ID.get(id);
            return module ? <span className="v2-mini-tag" key={id}>{module.name}</span> : null;
          })}
          <span className="v2-mini-tag">{passive?.name}</span>
        </div>
        <div className="v2-tag-row">
          {creature.evidence.slice(0, 6).map((item) => (
            <span className="v2-mini-tag" key={`${item.tag}-${item.source}`} data-source={item.source}>
              {TAG_LABELS[item.tag]}
            </span>
          ))}
        </div>
      </div>
      {action ? <div className="v2-creature-actions">{action}</div> : null}
    </div>
  );
}

export function PartyWorkshop({
  save,
  onToggleParty,
  onSetActive,
  onToggleEquip,
  onStartRun,
  onOpenCapture,
  onOpenCodex,
}: {
  save: SaveV2;
  onToggleParty: (id: string) => void;
  onSetActive: (id: string) => void;
  onToggleEquip: (creatureId: string, moduleId: string) => void;
  onStartRun: () => void;
  onOpenCapture: () => void;
  onOpenCodex: () => void;
}) {
  const party = save.party.ids
    .map((id) => save.collection.find((item) => item.id === id))
    .filter((item): item is V2Creature => Boolean(item));
  const activeId = save.party.ids[save.party.activeIndex];
  const inParty = new Set(save.party.ids);
  return (
    <section className="v2-panel">
      <div className="v2-panel-head">
        <div>
          <p className="eyebrow">我的队伍 · 三人编成</p>
          <h2 className="v2-h2">主战一个，支援两个</h2>
          <p className="v2-lede">每回合：1 次主战行动 + 1 次支援指令；换位消耗共鸣。支援也可以从图鉴里换。</p>
        </div>
        <div className="v2-panel-actions">
          <button type="button" className="v2-pill" onClick={onOpenCapture}>捕获站</button>
          <button type="button" className="v2-pill" onClick={onOpenCodex}>图鉴</button>
          <button type="button" className="v2-btn v2-btn-primary" onClick={onStartRun} disabled={party.length < 3}>
            出发 · 江风渡口
          </button>
        </div>
      </div>

      <div className="v2-party-slots">
        {[0, 1, 2].map((index) => {
          const creature = party[index];
          return (
            <div className="v2-party-slot" key={index} data-active={creature?.id === activeId}>
              <span className="mono">{creature?.id === activeId ? '主战' : `支援位 ${index}`}</span>
              {creature ? (
                <>
                  <span className="v2-slot-art">
                    <MonsterSprite recipe={creature.visual} title={creature.name} />
                  </span>
                  <b>{creature.name}</b>
                  <span className="fineprint">{PATH_META[creature.buildPath].name} · HP {creature.stats.hp}</span>
                  <div className="v2-slot-actions">
                    <button type="button" className="v2-link-btn" onClick={() => onSetActive(creature.id)} disabled={creature.id === activeId}>
                      设为主战
                    </button>
                    <button type="button" className="v2-link-btn" onClick={() => onToggleParty(creature.id)}>移出</button>
                  </div>
                  <div className="v2-equip-row">
                    {creature.actives.map((id) => {
                      const module = ACTIVE_BY_ID.get(id)!;
                      const equipped = creature.equipped.includes(id);
                      return (
                        <button
                          type="button"
                          className="v2-equip"
                          key={id}
                          data-on={equipped}
                          onClick={() => onToggleEquip(creature.id, id)}
                          title={module.text}
                        >
                          {module.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="fineprint">空位：从下方图鉴上阵一只。</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="v2-roster-head">
        <span className="mono">个人造物 · {save.collection.length} 只</span>
        <span className="fineprint">点击「上阵」加入队伍；已上阵的角色可以切换装备技能（保持 2 个）。</span>
      </div>
      <div className="v2-roster-grid">
        {save.collection.map((creature) => (
          <CreatureMiniCard
            key={creature.id}
            creature={creature}
            active={inParty.has(creature.id)}
            action={
              <button type="button" className="v2-pill" onClick={() => onToggleParty(creature.id)}>
                {inParty.has(creature.id) ? '移出' : '上阵'}
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
}

export function RegionMap({
  run,
  onChooseEvent,
  onEnterBattle,
  onRestartRun,
  onOpenParty,
  onOpenCodex,
  onOpenCapture,
}: {
  run: RegionRunState;
  onChooseEvent: (eventId: string, choiceId: string) => void;
  onEnterBattle: (node: RegionNodeDef, enemy: EnemyDef) => void;
  onRestartRun: () => void;
  onOpenParty: () => void;
  onOpenCodex: () => void;
  onOpenCapture: () => void;
}) {
  const node = currentNode(run);
  const event = getEvent(node.eventId);
  const enemy = getEnemy(node.enemyId);
  const progress = nodeProgress(run);
  const completed = regionComplete(run);
  return (
    <section className="v2-panel">
      <div className="v2-panel-head">
        <div>
          <p className="eyebrow">江城地图 · {RIVER_REGION.name}</p>
          <h2 className="v2-h2">{RIVER_REGION.subtitle}</h2>
          <p className="v2-lede">一次探索 5 个节点：事件 → 战斗 → 事件 → 精英 → Boss。每个选择都会影响后面的战斗。</p>
        </div>
        <div className="v2-panel-actions">
          <button type="button" className="v2-pill" onClick={onOpenParty}>队伍</button>
          <button type="button" className="v2-pill" onClick={onOpenCapture}>捕获</button>
          <button type="button" className="v2-pill" onClick={onOpenCodex}>图鉴</button>
          <span className="v2-resource mono">材料 {run.materials} · 信物 {run.tokens} · 开局共鸣 {run.startResonance}</span>
        </div>
      </div>

      <div className="v2-node-track">
        {RIVER_REGION.nodes.map((item, index) => {
          const state = index < run.nodeIndex || completed ? 'done' : index === run.nodeIndex ? 'current' : 'locked';
          return (
            <div className="v2-node" data-state={state} key={item.id}>
              <span className="v2-node-index mono">{index + 1}</span>
              <div>
                <b>{item.title}</b>
                <span className="fineprint">{item.type === 'event' ? '事件' : item.type === 'boss' ? 'Boss' : item.type === 'elite' ? '精英战' : '战斗'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="v2-node-panel">
        {completed ? (
          <div className="v2-complete">
            <span className="v2-stamp" data-tone="red">区域完成</span>
            <h3 className="v2-h3">风雨电台停止播报，渡口恢复了潮声。</h3>
            <p className="v2-lede">获得信物 {run.tokens}、材料 {run.materials}。可以重新探索，或回队伍调整后再来。</p>
            <div className="v2-node-actions">
              <button type="button" className="v2-btn v2-btn-primary" onClick={onRestartRun}>重新探索江风渡口</button>
              <button type="button" className="v2-btn" onClick={onOpenParty}>调整队伍</button>
              <button type="button" className="v2-btn" onClick={onOpenCodex}>打开图鉴</button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow">当前节点 {progress.current} / {progress.total}</p>
            <h3 className="v2-h3">{node.title}</h3>
            <p className="v2-lede">{node.desc}</p>
            {node.type === 'event' && event ? (
              <div className="v2-event-choices">
                {event.choices.map((choice) => (
                  <button
                    type="button"
                    className="v2-choice"
                    key={choice.id}
                    onClick={() => onChooseEvent(event.id, choice.id)}
                  >
                    <b>{choice.label}</b>
                    <span>{choice.desc}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {(node.type === 'battle' || node.type === 'elite' || node.type === 'boss') && enemy ? (
              <div className="v2-enemy-preview">
                <span className="v2-enemy-preview-art">
                  <MonsterSprite
                    recipe={{ shape: enemy.kind === 'boss' ? 'shard' : 'blob', crest: 'wave', accessory: 'none', palette: ['#8FB6C6', '#2C6E8F', '#E8F2F5'] }}
                    title={enemy.name}
                  />
                </span>
                <div>
                  <b>{enemy.name}</b>
                  <p className="fineprint">{enemy.taunt}</p>
                  <p className="mono">HP {enemy.maxHp} · ATK {enemy.atk} · DEF {enemy.def} · {enemy.kind === 'boss' ? '两阶段 Boss' : '普通敌人'}</p>
                </div>
                <button type="button" className="v2-btn v2-btn-primary" onClick={() => onEnterBattle(node, enemy)}>
                  {enemy.kind === 'boss' ? '挑战 Boss' : '进入战斗'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="v2-run-log">
        {run.log.slice(-5).map((line, index) => (
          <p className="fineprint" key={`${index}-${line}`}>· {line}</p>
        ))}
      </div>
    </section>
  );
}

export function BattleResult({
  battle,
  run,
  onContinue,
  onRetry,
  onOpenParty,
  onOpenCodex,
}: {
  battle: ExpeditionBattleState;
  run: RegionRunState;
  onContinue: () => void;
  onRetry: () => void;
  onOpenParty: () => void;
  onOpenCodex: () => void;
}) {
  const summary = battleSummary(battle);
  const win = battle.outcome === 'win';
  return (
    <section className="v2-result">
      <div className="v2-result-head">
        <span className="v2-result-stamp" data-outcome={battle.outcome ?? 'draw'}>
          {win ? '胜' : battle.outcome === 'lose' ? '负' : '平'}
        </span>
        <div>
          <p className="eyebrow">探索战结算 · {RIVER_REGION.name}</p>
          <h2 className="v2-h2">{win ? '风暴停了一小会儿' : battle.outcome === 'lose' ? '这次被潮水压过去了' : '打平了，但潮水还没退'}</h2>
          <p className="v2-lede">
            {summary.rounds} 回合 · 敌方 AI 参与 {summary.aiRounds} / {battle.planLog.length} 回合 · 奖励 材料 {summary.rewards.materials}
            {summary.rewards.tokens ? ` · 信物 ${summary.rewards.tokens}` : ''}
          </p>
        </div>
      </div>
      <div className="v2-result-grid">
        <div>
          <span className="mono">本局复盘</span>
          <div className="v2-result-log">
            {battle.log.slice(-10).map((event, index) => (
              <p key={`${index}-${event.kind}`}>
                <span className="mono">R{event.round}</span> {event.text}
              </p>
            ))}
          </div>
        </div>
        <div>
          <span className="mono">决策来源</span>
          <p className="fineprint">
            模型可用时 Boss 的每回合行动由 AI 在合法动作中选择；超时/失败自动回落到规则。现在可核对：
          </p>
          <div className="v2-plan-list">
            {battle.planLog.map((plan) => (
              <span className="v2-mini-tag" key={`${plan.round}-${plan.action}`} data-source={plan.source}>
                R{plan.round} {plan.action} · {plan.source === 'ai' ? 'AI' : '规则'}
              </span>
            ))}
          </div>
          <p className="fineprint">探索进度：节点 {Math.min(run.nodeIndex + 1, RIVER_REGION.nodes.length)} / {RIVER_REGION.nodes.length} · 材料 {run.materials} · 信物 {run.tokens}</p>
        </div>
      </div>
      <div className="v2-panel-actions">
        {win ? (
          <button type="button" className="v2-btn v2-btn-primary" onClick={onContinue}>回到地图</button>
        ) : (
          <>
            <button type="button" className="v2-btn v2-btn-primary" onClick={onRetry}>再试一次</button>
            <button type="button" className="v2-btn" onClick={onContinue}>回地图</button>
          </>
        )}
        <button type="button" className="v2-btn" onClick={onOpenParty}>调整队伍</button>
        <button type="button" className="v2-btn" onClick={onOpenCodex}>图鉴</button>
      </div>
    </section>
  );
}

export function CodexView({
  save,
  preferLive,
  aiAvailable,
  onToggleLock,
  onToggleLive,
  onOpenParty,
  onOpenCapture,
  onExport,
  onImport,
}: {
  save: SaveV2;
  preferLive: boolean;
  aiAvailable: boolean;
  onToggleLock: (id: string) => void;
  onToggleLive: () => void;
  onOpenParty: () => void;
  onOpenCapture: () => void;
  onExport: () => void;
  onImport: (text: string) => void;
}) {
  const locked = new Set(save.lockedIds);
  const aiLog = useMemo(() => v2AiLog.slice(0, 8), [save.updatedAt]);
  return (
    <section className="v2-panel">
      <div className="v2-panel-head">
        <div>
          <p className="eyebrow">图鉴 / 回响手册</p>
          <h2 className="v2-h2">我的江城造物 · {save.collection.length} 只</h2>
          <p className="v2-lede">
            锁定后不会被容量淘汰；旧版 P1 图鉴以只读形式保留，旧卡仍可在旧版快斗使用。
          </p>
        </div>
        <div className="v2-panel-actions">
          <button type="button" className="v2-pill" data-on={preferLive} onClick={onToggleLive} disabled={!aiAvailable}>
            {preferLive ? 'AI 开' : 'AI 关'}
          </button>
          <button type="button" className="v2-pill" onClick={onOpenParty}>队伍</button>
          <button type="button" className="v2-pill" onClick={onOpenCapture}>捕获</button>
          <button type="button" className="v2-pill" onClick={onExport}>导出存档</button>
          <label className="v2-pill v2-file-pill">
            导入存档
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onImport(await file.text());
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="v2-codex-grid">
        {save.collection.map((creature) => (
          <div className="v2-codex-item" key={creature.id}>
            <CreatureMiniCard
              creature={creature}
              action={
                <button type="button" className="v2-pill" data-on={locked.has(creature.id)} onClick={() => onToggleLock(creature.id)}>
                  {locked.has(creature.id) ? '已锁定' : '锁定'}
                </button>
              }
            />
          </div>
        ))}
      </div>

      <div className="v2-codex-sections">
        <div>
          <span className="mono">旧版 P1 图鉴（只读迁移）· {save.legacyCards.length} 张</span>
          {save.legacyCards.length === 0 ? (
            <p className="fineprint">没有检测到旧图鉴。旧版入口仍在原页面，可继续快斗。</p>
          ) : (
            <div className="v2-legacy-list">
              {save.legacyCards.map((card) => (
                <span className="v2-mini-tag" key={card.id}>{card.name} · {card.element}</span>
              ))}
            </div>
          )}
          <p className="fineprint">旧键 `jcm.gallery.v1` 不会被修改；迁移来源：{save.migration.fromVersion === 1 ? 'P1 图鉴' : '全新存档'}。</p>
        </div>
        <div>
          <span className="mono">最近 AI 调用 · {v2AiLog.length}</span>
          {aiLog.length === 0 ? (
            <p className="fineprint">还没有 AI 调用。战斗/上传时会记录来源、耗时与降级。</p>
          ) : (
            aiLog.map((entry, index) => (
              <p className="fineprint" key={`${entry.at}-${index}`}>
                {entry.endpoint.replace('/api/ai/', '')} · {entry.mode} · {entry.latencyMs}ms · {entry.note}
              </p>
            ))
          )}
          <p className="fineprint">无 Key 时整条链路自动使用本地规则，并显示为演示模式。</p>
        </div>
      </div>
    </section>
  );
}
