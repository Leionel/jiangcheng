import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { BuildPath, ExpeditionBattleState, RegionId, RegionRunState, SaveV2, V2Creature } from '../domain/types';
import type { EnemyDef, RegionNodeDef } from '../domain/types';
import { PATH_META, TAG_LABELS, tagDimension } from '../domain/tags';
import { ACTIVE_BY_ID, PASSIVE_BY_ID } from '../content/modules';
import { getEnemy, getEvent, getRegion, currentNode, nodeProgress } from '../domain/region';
import { bondLabel } from '../domain/bonds';
import { QUEST_DEFS, completedQuestCount, questProgress, questState } from '../domain/quests';
import { canEvolve } from '../domain/evolution';
import { evolutionBranchName } from '../content/evolutions';
import { xpPercent, xpToNext } from '../domain/growth';
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
  tier,
}: {
  creature: V2Creature;
  active?: boolean;
  action?: ReactNode;
  tier?: string;
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
            {creature.evolutionId ? (
              <span className="v2-badge" data-kind="ai">进化 · {evolutionBranchName(creature.evolutionId)}</span>
            ) : null}
            {tier ? <span className="v2-badge" data-kind="tier">{tier}</span> : null}
          </div>
          <div className="v2-growth-line">
            <b>Lv.{creature.level}</b>
            <span className="v2-xp-bar">
              <i style={{ width: `${xpPercent(creature)}%` }} />
            </span>
            <em>{creature.level >= 5 ? 'MAX' : `${creature.xp} / ${xpToNext(creature.level)} XP`}</em>
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
  onOpenEvolution,
}: {
  save: SaveV2;
  onToggleParty: (id: string) => void;
  onSetActive: (id: string) => void;
  onToggleEquip: (creatureId: string, moduleId: string) => void;
  onStartRun: () => void;
  onOpenCapture: () => void;
  onOpenCodex: () => void;
  onOpenEvolution: (id: string) => void;
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
          <div className="v2-party-meta">
            <span className="v2-badge" data-kind="resource">羁绊 · {bondLabel(save.bondPoints)}</span>
            <span className="fineprint">一起战斗积累羁绊，解锁第 3–6 条连携</span>
          </div>
        </div>
        <div className="v2-panel-actions">
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCapture}>捕获站</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCodex}>图鉴</button>
          <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={onStartRun} disabled={party.length < 3}>
            打开江城地图
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
                    {creature.evolutionId ? (
                      <span className="v2-badge" data-kind="ai">{evolutionBranchName(creature.evolutionId)}</span>
                    ) : null}
                  </div>
                  <div className="v2-growth-line">
                    <b>Lv.{creature.level}</b>
                    <span className="v2-xp-bar"><i style={{ width: `${xpPercent(creature)}%` }} /></span>
                    <em>{creature.level >= 5 ? 'MAX' : `${creature.xp}/${xpToNext(creature.level)}`}</em>
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
                    <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onOpenEvolution(creature.id)}>
                      {creature.evolutionId ? '成长记录' : canEvolve(creature) ? '可以进化' : '成长'}
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
              <>
                <button type="button" className={inParty.has(creature.id) ? 'v2-btn v2-btn-sm' : 'v2-btn v2-btn-primary v2-btn-sm'} onClick={() => onToggleParty(creature.id)}>
                  {inParty.has(creature.id) ? '移出队伍' : '上阵'}
                </button>
                <button type="button" className="v2-btn v2-btn-sm" onClick={() => onOpenEvolution(creature.id)}>
                  成长
                </button>
              </>
            }
          />
        ))}
      </div>
    </section>
  );
}


export function RegionMap({
  save,
  selectedRegionId,
  onSelectRegion,
  onChooseEvent,
  onEnterBattle,
  onStartRegion,
  onRestartRun,
  onOpenParty,
  onOpenCodex,
  onOpenCapture,
}: {
  save: SaveV2;
  selectedRegionId: RegionId;
  onSelectRegion: (id: RegionId) => void;
  onChooseEvent: (eventId: string, choiceId: string) => void;
  onEnterBattle: (node: RegionNodeDef, enemy: EnemyDef) => void;
  onStartRegion: (id: RegionId) => void;
  onRestartRun: (id: RegionId) => void;
  onOpenParty: () => void;
  onOpenCodex: () => void;
  onOpenCapture: () => void;
}) {
  const region = getRegion(selectedRegionId);
  const run = save.regionRuns[selectedRegionId] ?? null;
  const unlocked = save.unlockedRegions.includes(selectedRegionId);
  const completed = Boolean(run?.completed);
  const node = run && !completed ? currentNode(run) : null;
  const event = getEvent(node?.eventId);
  const enemy = getEnemy(node?.enemyId);
  const boss = getEnemy(region.bossId);
  const progress = run ? nodeProgress(run) : { current: 0, total: region.nodes.length };
  const unlockRegion = region.unlockAfter ? getRegion(region.unlockAfter) : null;
  const regionState = completed ? 'done' : run ? 'active' : unlocked ? 'ready' : 'locked';

  return (
    <section className="v2-panel">
      <div className="v2-panel-head">
        <div>
          <p className="v2-rubric">江城地图 · 五区观测</p>
          <h2 className="v2-h2">一条江，五个不想睡的地方</h2>
          <p className="v2-lede">完成一个区域会解锁下一区。点地图上的区域查看路线；已解锁的区域随时可以重新探索。</p>
        </div>
        <div className="v2-panel-actions">
          <span className="v2-badge" data-kind="resource">材料 {save.materials}</span>
          <span className="v2-badge" data-kind="resource">信物 {save.tokens}</span>
          <span className="v2-badge" data-kind="resource">羁绊 {bondLabel(save.bondPoints)}</span>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenParty}>队伍</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCapture}>捕获</button>
          <button type="button" className="v2-btn v2-btn-sm" onClick={onOpenCodex}>图鉴</button>
        </div>
      </div>

      <JiangchengMap save={save} selectedRegionId={selectedRegionId} onSelect={onSelectRegion} />

      <div className="v2-region-layout">
        <div className="v2-region-main">
          <div className="v2-region-title" style={{ '--region': region.accent } as CSSProperties}>
            <div>
              <p className="v2-rubric">当前查看 · {regionState === 'done' ? '已完成' : regionState === 'active' ? '进行中' : unlocked ? '可探索' : '未解锁'}</p>
              <h3 className="v2-h3">{region.name}</h3>
              <p className="v2-lede">{region.blurb}</p>
            </div>
            <span className="v2-region-stamp" data-state={regionState}>{region.landmark}</span>
          </div>

          <ol className="v2-route-key" aria-label={`${region.name}五站`}>
            {region.nodes.map((item, index) => {
              const state = completed || index < (run?.nodeIndex ?? 0) ? 'done' : index === (run?.nodeIndex ?? -1) ? 'current' : 'locked';
              return (
                <li className="v2-route-key-item" data-state={state} key={item.id}>
                  <span className="v2-route-key-num">{index + 1}</span>
                  <div>
                    <b>{item.title}</b>
                    <span>{item.type === 'event' ? '事件' : item.type === 'boss' ? 'Boss' : item.type === 'elite' ? '精英' : '战斗'}</span>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="v2-node-panel">
            {!unlocked ? (
              <div className="v2-region-locked">
                <b>尚未解锁</b>
                <p className="v2-lede">
                  {unlockRegion ? `先完成「${unlockRegion.name}」，这里才会在图上亮起来。` : '继续推进前面的区域。'}
                </p>
              </div>
            ) : completed ? (
              <div className="v2-complete">
                <span className="v2-complete-stamp">区域完成</span>
                <h3 className="v2-h3">{region.name}的 Boss 已经退场。</h3>
                <p className="v2-lede">
                  在箱子里留下材料 {run?.materials ?? 0}、信物 {run?.tokens ?? 0}。可以重新探索，或去下一区看看。
                </p>
                <div className="v2-node-actions">
                  <button type="button" className="v2-btn v2-btn-primary" onClick={() => onRestartRun(selectedRegionId)}>重新探索{region.name}</button>
                  <button type="button" className="v2-btn" onClick={onOpenParty}>调整队伍</button>
                  <button type="button" className="v2-btn" onClick={onOpenCodex}>打开图鉴</button>
                </div>
              </div>
            ) : !run || !node ? (
              <div className="v2-region-start">
                <p className="v2-rubric">路线准备</p>
                <h3 className="v2-h3">{region.nodes.length} 个节点 · 终点 {boss?.name}</h3>
                <p className="v2-lede">
                  带 3 只造物进入。事件会改变开局共鸣/材料/羁绊；Boss 必须击破，拖到回合上限算失败。
                </p>
                <div className="v2-node-actions">
                  <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={() => onStartRegion(selectedRegionId)}>
                    开始探索 · {region.name}
                  </button>
                  <button type="button" className="v2-btn" onClick={onOpenParty}>调整队伍</button>
                </div>
              </div>
            ) : node.type === 'event' && event ? (
              <div>
                <p className="v2-rubric">当前节点 {progress.current} / {progress.total} · 事件</p>
                <h3 className="v2-h3">{node.title}</h3>
                <p className="v2-lede">{event.text}</p>
                <div className="v2-event-choices">
                  {event.choices.map((choice) => (
                    <button type="button" className="v2-choice" key={choice.id} onClick={() => onChooseEvent(event.id, choice.id)}>
                      <b>{choice.label}</b>
                      <span>{choice.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : enemy ? (
              <div>
                <p className="v2-rubric">当前节点 {progress.current} / {progress.total} · {node.title}</p>
                <h3 className="v2-h3">{node.title}</h3>
                <p className="v2-lede">{node.desc}</p>
                <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={() => onEnterBattle(node, enemy)}>
                  {enemy.kind === 'boss' ? '挑战 Boss' : '进入战斗'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="v2-run-log">
            {(run?.log ?? [`${region.name}还没有出发记录。`]).slice(-4).map((line, index) => (
              <p className="fineprint" key={`${index}-${line}`}>· {line}</p>
            ))}
          </div>
        </div>

        <aside className="v2-region-side">
          <div className="v2-enemy-preview">
            <span className="v2-enemy-preview-art" style={{ background: `color-mix(in srgb, ${region.accent} 8%, var(--paper))` }}>
              <MonsterSprite
                recipe={{ shape: boss?.kind === 'boss' ? 'shard' : 'blob', crest: 'wave', accessory: 'none', palette: ['#8FB6C6', region.accent, '#E8F2F5'] }}
                title={boss?.name ?? '区域 Boss'}
              />
            </span>
            <div className="v2-enemy-preview-main">
              <div className="v2-specimen-badges">
                <span className="v2-badge" data-kind="boss">{boss?.kind === 'boss' ? '区域 Boss' : '未知'}</span>
                <span className="v2-badge" data-kind="element"><i style={{ background: region.accent }} />{region.accent}</span>
              </div>
              <b>{boss?.name}</b>
              <p className="v2-enemy-preview-taunt">{boss?.taunt}</p>
              <div className="v2-specimen-stats">
                <span><em>HP</em><b>{boss?.maxHp ?? '—'}</b></span>
                <span><em>ATK</em><b>{boss?.atk ?? '—'}</b></span>
                <span><em>DEF</em><b>{boss?.def ?? '—'}</b></span>
              </div>
            </div>
          </div>

          <div className="v2-appendix" style={{ padding: 12 }}>
            <p className="v2-rubric">区域规则</p>
            <p className="fineprint">
              {region.id === 'river'
                ? '暴雨会淋湿全队；有护盾/防御时伤害减半。Boss 半血进入第二阶段，积水成渊更频繁。'
                : region.id === 'zao'
                  ? '每次命中会给大厨叠加「热度」。热度到 3 时进入第二阶段，锅气爆炒会附加脆弱。'
                  : region.id === 'bridge'
                    ? '桥影守卫会周期性封锁支援：被封锁的回合支援/连携不可用，留好防御与普攻。'
                    : region.id === 'sakura'
                      ? '档案员会抄录你上一招；重复使用同一技能会被反制蓄势，轮换招式可破解。'
                      : '主脑有三阶段：血量 2/3、1/3 时升级；第三阶段「全域过载」会连续范围攻击。'}
            </p>
            {unlockRegion ? <p className="fineprint">前置区域：{unlockRegion.name}</p> : <p className="fineprint">起始区域，默认解锁。</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function QuestPanel({
  save,
  onClaim,
}: {
  save: SaveV2;
  onClaim: (questId: string) => void;
}) {
  return (
    <section className="v2-panel">
      <div className="v2-panel-head">
        <div>
          <p className="v2-rubric">任务 / 观测记录</p>
          <h2 className="v2-h2">先做哪一件？</h2>
          <p className="v2-lede">故事、成长、收藏、挑战四类任务。进度自动记录，奖励只能领一次。</p>
        </div>
        <div className="v2-panel-actions">
          <span className="v2-badge" data-kind="resource">已完成 {completedQuestCount(save)} / {QUEST_DEFS.length}</span>
        </div>
      </div>
      <div className="v2-quest-grid">
        {QUEST_DEFS.map((quest) => {
          const state = questState(quest, save);
          const value = questProgress(quest, save);
          return (
            <div className="v2-quest" data-state={state} key={quest.id}>
              <div className="v2-quest-head">
                <span className="v2-badge" data-kind={state === 'claimed' ? 'reserved' : state === 'complete' ? 'ai' : 'mode'}>
                  {state === 'claimed' ? '已领取' : state === 'complete' ? '可领取' : state === 'locked' ? '未解锁' : '进行中'}
                </span>
                <span className="v2-quest-kind">{quest.kind === 'story' ? '故事' : quest.kind === 'growth' ? '成长' : quest.kind === 'collection' ? '收藏' : '挑战'}</span>
              </div>
              <b>{quest.title}</b>
              <p>{quest.desc}</p>
              <div className="v2-quest-progress">
                <span style={{ width: `${Math.round((value / Math.max(1, quest.target)) * 100)}%` }} />
              </div>
              <div className="v2-quest-foot">
                <span className="fineprint">
                  {value} / {quest.target}
                  {quest.reward.materials ? ` · 材料 ${quest.reward.materials}` : ''}
                  {quest.reward.tokens ? ` · 信物 ${quest.reward.tokens}` : ''}
                  {quest.reward.xp ? ` · 经验 ${quest.reward.xp}` : ''}
                </span>
                <button type="button" className="v2-btn v2-btn-sm" disabled={state !== 'complete'} onClick={() => onClaim(quest.id)}>
                  {state === 'claimed' ? '已领取' : '领取'}
                </button>
              </div>
            </div>
          );
        })}
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
  const resultRegion = getRegion(run.regionId);
  return (
    <section className="v2-result">
      <div className="v2-result-head">
        <span className="v2-result-stamp" data-outcome={battle.outcome ?? 'draw'}>
          {win ? '胜' : battle.outcome === 'lose' ? '负' : '平'}
        </span>
        <div>
          <p className="v2-rubric">探索战结算 · {resultRegion.name}</p>
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
            探索进度：节点 {Math.min(run.nodeIndex + 1, resultRegion.nodes.length)} / {resultRegion.nodes.length} · 材料 {run.materials} · 信物 {run.tokens}
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
  onShare,
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
  onShare: () => void;
}) {
  const locked = new Set(save.lockedIds);
  const [filter, setFilter] = useState<'all' | BuildPath>('all');
  const [onlyEvolved, setOnlyEvolved] = useState(false);
  const tierOf = (creature: V2Creature) =>
    creature.evolutionId || creature.level >= 5 ? '掌握' : creature.level >= 3 ? '研究' : '发现';
  const visible = save.collection.filter(
    (creature) => (filter === 'all' || creature.buildPath === filter) && (!onlyEvolved || Boolean(creature.evolutionId)),
  );
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
          <button type="button" className="v2-btn v2-btn-sm" onClick={onShare}>复制挑战码</button>
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

      <div className="v2-codex-filters">
        <span className="v2-rubric">筛选</span>
        {(['all', 'guardian', 'striker', 'trickster', 'support', 'mover'] as const).map((path) => (
          <button
            type="button"
            className="v2-pill"
            key={path}
            data-on={filter === path}
            onClick={() => setFilter(path)}
          >
            {path === 'all' ? '全部' : PATH_META[path].name}
          </button>
        ))}
        <button type="button" className="v2-pill" data-on={onlyEvolved} onClick={() => setOnlyEvolved((value) => !value)}>
          只看进化
        </button>
        <span className="fineprint">显示 {visible.length} / {save.collection.length} 只 · 三层：发现 / 研究 / 掌握</span>
      </div>

      <div className="v2-codex-grid">
        {visible.map((creature) => (
          <CreatureMiniCard
            key={creature.id}
            creature={creature}
            tier={tierOf(creature)}
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
      {visible.length === 0 ? <p className="fineprint">这个筛选下还没有造物。换一个成长倾向看看。</p> : null}

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




