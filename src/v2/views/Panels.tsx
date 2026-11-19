import type { CSSProperties, ReactNode } from 'react';
import type { ExpeditionBattleState, RegionRunState, SaveV2, V2Creature } from '../domain/types';
import type { EnemyDef, RegionNodeDef } from '../domain/types';
import { PATH_META, TAG_LABELS, tagDimension } from '../domain/tags';
import { ACTIVE_BY_ID, PASSIVE_BY_ID } from '../content/modules';
import { RIVER_REGION, currentNode, getEnemy, getEvent, nodeProgress, regionComplete } from '../domain/region';
import { battleSummary } from '../domain/battle2';
import { v2AiLog } from '../ai/gateway';
import { ELEMENTS } from '../../features/monsters/elements';
import { MonsterSprite } from '../../features/monsters/MonsterSprite';
import { JiangchengMap } from './JiangchengMap';

function ElementBadge({ element }: { element: V2Creature['element'] }) {
  const meta = ELEMENTS[element];
  return (
    <span className="v2-badge" data-kind="element" style={{ '--badge': meta.color } as CSSProperties}>
      <i />
      {meta.name}属性
    </span>
  );
}

function PathBadge({ path }: { path: V2Creature['buildPath'] }) {
  return (
    <span className="v2-badge" data-kind="path" style={{ '--badge': PATH_META[path].color } as CSSProperties}>
      {PATH_META[path].name}
    </span>
  );
}

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
    <div className="v2-specimen" data-active={Boolean(active)}>
      <div className="v2-specimen-body">
        <span className="v2-specimen-art">
          <MonsterSprite recipe={creature.visual} title={creature.name} />
        </span>
        <div className="v2-specimen-main">
          <div className="v2-specimen-name">
            <b>{creature.name}</b>
            <span className="v2-record">
              战绩 {creature.record.wins}W-{creature.record.losses}L
            </span>
          </div>
          <div className="v2-specimen-badges">
            <ElementBadge element={creature.element} />
            <PathBadge path={creature.buildPath} />
          </div>
          <p className="v2-specimen-flavor">{creature.flavor}</p>
          <div className="v2-specimen-stats">
            <span><em>HP</em><b>{creature.stats.hp}</b></span>
            <span><em>ATK</em><b>{creature.stats.atk}</b></span>
            <span><em>DEF</em><b>{creature.stats.def}</b></span>
            <span><em>SPD</em><b>{creature.stats.spd}</b></span>
          </div>
          <div className="v2-module-line">
            {creature.equipped.map((id) => {
              const module = ACTIVE_BY_ID.get(id);
              return module ? <span className="v2-module-chip" key={id}>{module.name}</span> : null;
            })}
            {passive ? <span className="v2-module-chip" data-kind="passive">{passive.name}</span> : null}
          </div>
          <div className="v2-tag-row">
            {creature.evidence.slice(0, 6).map((item) => (
              <span className="v2-mini-tag" key={`${item.tag}-${item.source}`} data-dim={tagDimension(item.tag)} data-source={item.source}>
                {TAG_LABELS[item.tag]}
              </span>
            ))}
          </div>
        </div>
      </div>
      {action ? <div className="v2-specimen-actions">{action}</div> : null}
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
          <p className="v2-rubric">我的队伍 · 三人编成</p>
          <h2 className="v2-h2">主战一个，支援两个</h2>
          <p className="v2-lede">每回合一次主战行动加一次支援指令；换位消耗共鸣。支援位负责治疗、侦测、接力与连携。</p>
        </div>
        <div className="v2-panel-actions">
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCapture}>捕获站</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCodex}>图鉴</button>
          <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onStartRun} disabled={party.length < 3}>
            出发 · 江风渡口
          </button>
        </div>
      </div>

      <div className="v2-party-slots">
        {[0, 1, 2].map((index) => {
          const creature = party[index];
          return (
            <div className="v2-party-slot" key={index} data-active={creature?.id === activeId}>
              <div className="v2-slot-label">
                <span>{creature?.id === activeId ? '主战' : `支援位 ${index === 0 ? 1 : index}`}</span>
                {creature ? <span className="v2-slot-record">{creature.record.wins}W-{creature.record.losses}L</span> : null}
              </div>
              {creature ? (
                <>
                  <span className="v2-slot-art">
                    <MonsterSprite recipe={creature.visual} title={creature.name} />
                  </span>
                  <b className="v2-slot-name">{creature.name}</b>
                  <div className="v2-specimen-badges">
                    <ElementBadge element={creature.element} />
                    <PathBadge path={creature.buildPath} />
                  </div>
                  <div className="v2-slot-stats">
                    <span>HP {creature.stats.hp}</span>
                    <span>ATK {creature.stats.atk}</span>
                    <span>SPD {creature.stats.spd}</span>
                  </div>
                  <div className="v2-slot-actions">
                    <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onSetActive(creature.id)} disabled={creature.id === activeId}>
                      设为主战
                    </button>
                    <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onToggleParty(creature.id)}>
                      移出
                    </button>
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
                <p className="v2-slot-empty">空位<br /><span className="fineprint">从下方图鉴上阵一只</span></p>
              )}
            </div>
          );
        })}
      </div>

      <div className="v2-roster-head">
        <div>
          <p className="v2-rubric">个人造物</p>
          <b>{save.collection.length} 只回响灵</b>
        </div>
        <span className="fineprint">点击「上阵」加入队伍；已上阵角色可切换装备技能（保持 2 个）。</span>
      </div>
      <div className="v2-roster-grid">
        {save.collection.map((creature) => (
          <CreatureMiniCard
            key={creature.id}
            creature={creature}
            active={inParty.has(creature.id)}
            action={
              <button type="button" className={inParty.has(creature.id) ? 'v2-btn v2-btn-sm' : 'v2-btn v2-btn-primary v2-btn-sm'} onClick={() => onToggleParty(creature.id)}>
                {inParty.has(creature.id) ? '移出队伍' : '上阵'}
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
          <p className="v2-rubric">江城地图 · {RIVER_REGION.name}</p>
          <h2 className="v2-h2">雾、潮位与不肯停的暴雨</h2>
          <p className="v2-lede">一次探索五个节点：事件、战斗、事件、精英、Boss。开局共鸣与材料会一直带到后面的战斗。</p>
        </div>
        <div className="v2-panel-actions">
          <span className="v2-badge" data-kind="resource">材料 {run.materials}</span>
          <span className="v2-badge" data-kind="resource">信物 {run.tokens}</span>
          <span className="v2-badge" data-kind="resource">开局共鸣 {run.startResonance}</span>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenParty}>队伍</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCapture}>捕获</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCodex}>图鉴</button>
        </div>
      </div>

      <JiangchengMap run={run} />

      <div className="v2-node-panel">
        {completed ? (
          <div className="v2-complete">
            <span className="v2-complete-stamp">区域完成</span>
            <h3 className="v2-h3">风雨电台停止播报，渡口恢复了潮声。</h3>
            <p className="v2-lede">获得信物 {run.tokens}、材料 {run.materials}。可以重新探索，或回队伍调整后再来。</p>
            <div className="v2-node-actions">
              <button type="button" className="v2-btn v2-btn-primary" onClick={onRestartRun}>重新探索江风渡口</button>
              <button type="button" className="v2-btn" onClick={onOpenParty}>调整队伍</button>
              <button type="button" className="v2-btn" onClick={onOpenCodex}>打开图鉴</button>
            </div>
          </div>
        ) : (
          <div className="v2-node-layout">
            <div className="v2-node-main">
              <p className="v2-rubric">当前节点 {progress.current} / {progress.total} · {node.type === 'event' ? '事件' : '战斗'}</p>
              <h3 className="v2-h3">{node.title}</h3>
              <p className="v2-lede">{node.desc}</p>
              {node.type === 'event' && event ? (
                <div className="v2-event-choices">
                  {event.choices.map((choice) => (
                    <button type="button" className="v2-choice" key={choice.id} onClick={() => onChooseEvent(event.id, choice.id)}>
                      <b>{choice.label}</b>
                      <span>{choice.desc}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {(node.type === 'battle' || node.type === 'elite' || node.type === 'boss') && enemy ? (
                <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={() => onEnterBattle(node, enemy)}>
                  {enemy.kind === 'boss' ? '挑战 Boss' : '进入战斗'}
                </button>
              ) : null}
            </div>
            {enemy && node.type !== 'event' ? (
              <aside className="v2-enemy-preview">
                <span className="v2-enemy-preview-art">
                  <MonsterSprite
                    recipe={{ shape: enemy.kind === 'boss' ? 'shard' : 'blob', crest: 'wave', accessory: 'none', palette: ['#8FB6C6', ELEMENTS[enemy.element].color, '#E8F2F5'] }}
                    title={enemy.name}
                  />
                </span>
                <div className="v2-enemy-preview-main">
                  <div className="v2-specimen-badges">
                    <ElementBadge element={enemy.element} />
                    <span className="v2-badge" data-kind={enemy.kind === 'boss' ? 'boss' : 'mode'}>
                      {enemy.kind === 'boss' ? '双阶段 Boss' : enemy.kind === 'elite' ? '精英' : '普通'}
                    </span>
                  </div>
                  <b>{enemy.name}</b>
                  <p className="v2-enemy-preview-taunt">{enemy.taunt}</p>
                  <div className="v2-specimen-stats">
                    <span><em>HP</em><b>{enemy.maxHp}</b></span>
                    <span><em>ATK</em><b>{enemy.atk}</b></span>
                    <span><em>DEF</em><b>{enemy.def}</b></span>
                  </div>
                </div>
              </aside>
            ) : (
              <aside className="v2-node-aside">
                <span className="v2-badge" data-kind="resource">渡口笔记</span>
                <p>这是选择型节点：不进入战斗，但会改变下一场战斗的开局资源或材料。</p>
                <p className="fineprint">雾里的灯、松脱的缆绳都只是提醒。真正的代价会在后面的战斗里出现。</p>
                <span className="v2-aside-glyph" aria-hidden="true">江</span>
              </aside>
            )}
          </div>
        )}
      </div>

      <div className="v2-run-log">
        {run.log.slice(-4).map((line, index) => (
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
          <p className="v2-rubric">探索战结算 · {RIVER_REGION.name}</p>
          <h2 className="v2-h2">{win ? '风暴停了一小会儿' : battle.outcome === 'lose' ? '这次被潮水压过去了' : '打平了，但潮水还没退'}</h2>
          <p className="v2-lede">
            {summary.rounds} 回合 · 敌方 AI 参与 {summary.aiRounds} / {battle.planLog.length} 回合 · 奖励材料 {summary.rewards.materials}
            {summary.rewards.tokens ? ` · 信物 ${summary.rewards.tokens}` : ''}
          </p>
        </div>
      </div>

      <div className="v2-result-grid">
        <div className="v2-result-block">
          <p className="v2-rubric">本局复盘</p>
          <div className="v2-result-log">
            {battle.log.slice(-10).map((event, index) => (
              <p key={`${index}-${event.kind}`}>
                <span className="v2-log-round">R{event.round}</span>
                {event.text}
              </p>
            ))}
          </div>
        </div>
        <div className="v2-result-block">
          <p className="v2-rubric">决策来源</p>
          <p className="fineprint">模型可用时，Boss 的每回合行动由 AI 在合法动作中选择；超时或失败自动回落到规则。</p>
          <div className="v2-plan-list">
            {battle.planLog.map((plan) => (
              <span className="v2-mini-tag" key={`${plan.round}-${plan.action}`} data-source={plan.source}>
                R{plan.round} {ACTION_LABEL_SMALL[plan.action] ?? plan.action} · {plan.source === 'ai' ? 'AI' : '规则'}
              </span>
            ))}
          </div>
          <p className="v2-result-progress">
            探索进度：节点 {Math.min(run.nodeIndex + 1, RIVER_REGION.nodes.length)} / {RIVER_REGION.nodes.length} · 材料 {run.materials} · 信物 {run.tokens}
          </p>
        </div>
      </div>

      <div className="v2-panel-actions">
        {win ? (
          <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onContinue}>回到地图</button>
        ) : (
          <>
            <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onRetry}>再试一次</button>
            <button type="button" className="v2-btn" onClick={onContinue}>回地图</button>
          </>
        )}
        <button type="button" className="v2-btn" onClick={onOpenParty}>调整队伍</button>
        <button type="button" className="v2-btn" onClick={onOpenCodex}>图鉴</button>
      </div>
    </section>
  );
}

const ACTION_LABEL_SMALL: Record<string, string> = {
  strike: '单体攻击',
  guard: '防御',
  gather: '蓄势',
  storm: '暴雨',
  deluge: '积水',
};

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
  return (
    <section className="v2-panel">
      <div className="v2-panel-head">
        <div>
          <p className="v2-rubric">图鉴 / 回响手册</p>
          <h2 className="v2-h2">我的江城造物 · {save.collection.length} 只</h2>
          <p className="v2-lede">锁定后不会被容量淘汰；旧版 P1 图鉴以只读形式保留，旧卡仍可在旧版快斗使用。</p>
        </div>
        <div className="v2-panel-actions">
          <button type="button" className="v2-btn v2-btn-sm" data-on={preferLive} onClick={onToggleLive} disabled={!aiAvailable}>
            {preferLive ? 'AI 开' : 'AI 关'}
          </button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenParty}>队伍</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCapture}>捕获</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onExport}>导出存档</button>
          <label className="v2-btn v2-btn-sm v2-file-btn">
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
          <CreatureMiniCard
            key={creature.id}
            creature={creature}
            action={
              <button
                type="button"
                className={locked.has(creature.id) ? 'v2-btn v2-btn-primary v2-btn-sm' : 'v2-btn v2-btn-sm'}
                onClick={() => onToggleLock(creature.id)}
              >
                {locked.has(creature.id) ? '已锁定' : '锁定'}
              </button>
            }
          />
        ))}
      </div>

      <div className="v2-appendix-grid">
        <details className="v2-appendix">
          <summary>旧版 P1 图鉴 · {save.legacyCards.length} 张</summary>
          {save.legacyCards.length === 0 ? (
            <p className="fineprint">没有检测到旧图鉴。旧版入口仍在原页面，可继续快斗。</p>
          ) : (
            <div className="v2-legacy-list">
              {save.legacyCards.map((card) => (
                <span className="v2-mini-tag" key={card.id} data-kind="legacy">{card.name} · {card.element}</span>
              ))}
            </div>
          )}
          <p className="fineprint">旧键 `jcm.gallery.v1` 不会被修改；迁移来源：{save.migration.fromVersion === 1 ? 'P1 图鉴' : '全新存档'}。</p>
        </details>
        <details className="v2-appendix">
          <summary>最近 AI 调用 · {v2AiLog.length}</summary>
          {v2AiLog.length === 0 ? (
            <p className="fineprint">还没有 AI 调用。战斗或上传照片时会记录来源、耗时与降级。</p>
          ) : (
            v2AiLog.map((entry, index) => (
              <p className="fineprint" key={`${entry.at}-${index}`}>
                {entry.endpoint.replace('/api/ai/', '')} · {entry.mode} · {entry.latencyMs}ms · {entry.note}
              </p>
            ))
          )}
          <p className="fineprint">无 Key 时整条链路自动使用本地规则，并显示为演示模式。</p>
        </details>
      </div>
    </section>
  );
}
