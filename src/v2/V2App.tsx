import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildPath, ExpeditionBattleState, RegionRunState, SaveV2, Tag, V2Creature } from './domain/types';
import { compileCreature } from './domain/compile';
import { inferTags, mergeEvidence, recommendPaths, toggleConfirmed } from './domain/tags';
import { addCreature, exportSave, importSave, loadSave, persistSave, recordBattleResult, setEquipped, toggleLock } from './domain/save';
import { createRegionRun, applyEventChoice, advanceEventNode, completeNode, currentNode, getEnemy, RIVER_REGION } from './domain/region';
import {
  applyEnemyPlan,
  createExpeditionBattle,
  estimateEnemyDamage,
  legalEnemyActions,
  resolveRound,
} from './domain/battle2';
import { V2_SAMPLES, sampleIdentity } from './content/samples';
import { analyzeObject, battleDirector } from './ai/gateway';
import { getHealth, type HealthInfo } from '../shared/ai/client';
import { inspectImageFile } from '../features/monsters/analyze';
import { hashString } from '../shared/rng';
import { MonsterSprite } from '../features/monsters/MonsterSprite';
import { CaptureView2, type CaptureDraft } from './views/CaptureView2';
import { BattleView2 } from './views/BattleView2';
import { BattleResult, CodexView, PartyWorkshop, RegionMap } from './views/Panels';
import type { EnemyActionId, EnemyDef, PlayerMainAction, PlayerSupportAction, RegionNodeDef } from './domain/types';
import './styles/v2.css';

type Screen = 'capture' | 'party' | 'map' | 'battle' | 'result' | 'codex';

const ACTION_LABEL: Record<EnemyActionId, string> = {
  strike: '单体攻击',
  guard: '收拢防御',
  gather: '蓄势',
  storm: '暴雨',
  deluge: '积水成渊',
};

function newSeed(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function V2App() {
  const [save, setSave] = useState<SaveV2>(() => loadSave());
  const [screen, setScreen] = useState<Screen>('capture');
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [summon, setSummon] = useState<V2Creature | null>(null);
  const [battle, setBattle] = useState<ExpeditionBattleState | null>(null);
  const [support, setSupport] = useState<PlayerSupportAction | null>(null);
  const [aiNote, setAiNote] = useState('');
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<{ battle: ExpeditionBattleState; run: RegionRunState } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const resultRef = useRef(false);

  const preferLive = Boolean(health?.aiAvailable && save.settings.aiMode === 'auto');

  const commit = useCallback((next: SaveV2) => {
    setSave(next);
    persistSave(next);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    let alive = true;
    getHealth().then((info) => {
      if (alive) setHealth(info);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------ 捕获 ------------------------------ */

  const pickSample = useCallback((sample: (typeof V2_SAMPLES)[number]) => {
    const paths = recommendPaths(sample.evidence);
    const identity = sampleIdentity(sample.id);
    setCaptureError(null);
    setDraft({
      vision: sample.vision,
      evidence: sample.evidence,
      source: 'sample',
      path: paths[0] ?? sample.recommendedPath,
      name: identity.name,
      flavor: identity.flavor,
      mode: 'local',
      note: '内置样本语义 · 本地规则（不请求模型）',
      corrections: 0,
    });
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setCaptureError(null);
      setBusy(true);
      try {
        const inspection = await inspectImageFile(file);
        const localEvidence = inferTags(inspection.vision);
        const paths = recommendPaths(localEvidence);
        const base: CaptureDraft = {
          vision: inspection.vision,
          evidence: localEvidence,
          imageDataUrl: inspection.aiDataUrl,
          palette: inspection.palette,
          source: 'upload',
          path: paths[0] ?? 'guardian',
          mode: preferLive ? 'live_ai' : 'local',
          note: preferLive ? '正在请求模型识别…' : '本地像素与标签规则',
          corrections: 0,
        };
        setDraft(base);
        if (preferLive) {
          const result = await analyzeObject(inspection.vision, inspection.aiDataUrl, { preferLive: true });
          const merged = result.intent
            ? mergeEvidence(localEvidence, [...result.intent.observed, ...result.intent.inferred], [])
            : localEvidence;
          const mergedPaths = recommendPaths(merged);
          setDraft((prev) =>
            prev
              ? {
                  ...prev,
                  evidence: merged,
                  path: mergedPaths[0] ?? prev.path,
                  name: result.intent?.name || prev.name,
                  flavor: result.intent?.flavor || prev.flavor,
                  mode: result.mode === 'live_ai' ? 'live_ai' : result.mode === 'fallback' ? 'fallback' : 'local',
                  note:
                    result.mode === 'live_ai'
                      ? `实时 AI 语义 · ${result.latencyMs}ms`
                      : result.note,
                }
              : prev,
          );
        }
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : '这张图片处理失败，换一张试试。');
      } finally {
        setBusy(false);
      }
    },
    [preferLive],
  );

  const toggleEvidence = useCallback((tag: Tag) => {
    setDraft((prev) => {
      if (!prev || prev.corrections >= 3) return prev;
      return { ...prev, evidence: toggleConfirmed(prev.evidence, tag), corrections: prev.corrections + 1 };
    });
  }, []);

  const addEvidence = useCallback((tag: Tag) => {
    setDraft((prev) => {
      if (!prev || prev.corrections >= 3) return prev;
      if (prev.evidence.some((item) => item.tag === tag)) return prev;
      const evidence = [...prev.evidence, { tag, source: 'user_confirmed' as const, confidence: 1, evidenceText: '我确认' }];
      const mergedPaths = recommendPaths(evidence);
      return { ...prev, evidence, corrections: prev.corrections + 1, path: mergedPaths[0] ?? prev.path };
    });
  }, []);

  const pickPath = useCallback((path: BuildPath) => {
    setDraft((prev) => (prev ? { ...prev, path } : prev));
  }, []);

  const summonCreature = useCallback(() => {
    if (!draft) return;
    const creature = compileCreature({
      vision: draft.vision,
      evidence: draft.evidence,
      buildPath: draft.path,
      source: draft.source,
      ...(draft.name ? { name: draft.name } : {}),
      ...(draft.flavor ? { flavor: draft.flavor } : {}),
      variant: hashString(`${draft.vision.primaryObject}|${draft.path}|${draft.evidence.map((item) => item.tag).join(',')}`) % 97,
      createdAt: Date.now(),
    });
    setSummon(creature);
    window.setTimeout(() => {
      const next = addCreature(save, creature);
      commit(next);
      setSummon(null);
      setDraft(null);
      setScreen('party');
      showToast(`「${creature.name}」已加入图鉴，可以去队伍里调整`);
    }, 1500);
  }, [draft, save, commit, showToast]);

  /* ------------------------------ 队伍 ------------------------------ */

  const toggleParty = useCallback(
    (id: string) => {
      const inParty = save.party.ids.includes(id);
      let ids = [...save.party.ids];
      if (inParty) ids = ids.filter((item) => item !== id);
      else {
        if (ids.length >= 3) {
          showToast('队伍已满 3 只：先移出一只再上阵');
          return;
        }
        ids.push(id);
      }
      commit({ ...save, party: { ids, activeIndex: Math.min(save.party.activeIndex, Math.max(0, ids.length - 1)) } });
    },
    [save, commit, showToast],
  );

  const setActive = useCallback(
    (id: string) => {
      const index = save.party.ids.indexOf(id);
      if (index < 0) return;
      commit({ ...save, party: { ...save.party, activeIndex: index } });
    },
    [save, commit],
  );

  const toggleEquip = useCallback(
    (creatureId: string, moduleId: string) => {
      const creature = save.collection.find((item) => item.id === creatureId);
      if (!creature) return;
      const equipped = creature.equipped.includes(moduleId)
        ? creature.equipped.length > 1
          ? creature.equipped.filter((id) => id !== moduleId)
          : creature.equipped
        : creature.equipped.length < 2
          ? [...creature.equipped, moduleId]
          : creature.equipped;
      commit(setEquipped(save, creatureId, equipped));
    },
    [save, commit],
  );

  const startRun = useCallback(() => {
    if (save.party.ids.length < 3) {
      showToast('先凑满 3 只再出发');
      setScreen('party');
      return;
    }
    const run = createRegionRun(newSeed('river'));
    commit({ ...save, run });
    setScreen('map');
  }, [save, commit, showToast]);

  /* ------------------------------ 地图/战斗 ------------------------------ */

  const partyCreatures = useMemo(
    () =>
      save.party.ids
        .map((id) => save.collection.find((item) => item.id === id))
        .filter((item): item is V2Creature => Boolean(item)),
    [save.collection, save.party.ids],
  );

  const chooseEvent = useCallback(
    (eventId: string, choiceId: string) => {
      if (!save.run) return;
      const afterChoice = applyEventChoice(save.run, eventId, choiceId);
      const advanced = advanceEventNode(afterChoice);
      commit({ ...save, run: advanced });
    },
    [save, commit],
  );

  const startBattle = useCallback(
    (node: RegionNodeDef, enemy: EnemyDef) => {
      if (!save.run) return;
      if (partyCreatures.length < 3) {
        showToast('队伍不足 3 只，先去队伍工坊');
        setScreen('party');
        return;
      }
      const next = createExpeditionBattle({
        seed: newSeed(`${save.run.seed}-${node.id}`),
        team: partyCreatures,
        enemy,
        startResonance: save.run.startResonance,
        activeIndex: save.party.activeIndex,
      });
      resultRef.current = false;
      setBattle(next);
      setSupport(null);
      setAiNote('');
      setPlanning(false);
      setScreen('battle');
    },
    [save, partyCreatures, showToast],
  );

  const enterCurrentBattle = useCallback(() => {
    if (!save.run) return;
    const node = currentNode(save.run);
    const enemy = getEnemy(node.enemyId);
    if (node.type === 'event' || !enemy) return;
    startBattle(node, enemy);
  }, [save.run, startBattle]);

  /* AI 导演：每回合在合法动作中选招；超时/失败规则接管 */
  useEffect(() => {
    if (!battle || battle.outcome || !preferLive) {
      setPlanning(false);
      return;
    }
    const round = battle.round;
    let cancelled = false;
    setPlanning(true);
    setAiNote('');
    const legal = legalEnemyActions(battle);
    const actions = legal.map((id) => ({
      id,
      label: ACTION_LABEL[id],
      estimate: estimateEnemyDamage(battle, id),
    }));
    const payload = {
      round: battle.round,
      maxRounds: battle.maxRounds,
      enemy: {
        name: battle.enemy.def.name,
        hpPercent: Math.round((battle.enemy.hp / battle.enemy.def.maxHp) * 100),
        phase: battle.enemy.phase,
        kind: battle.enemy.def.kind,
      },
      party: battle.team.map((member) => ({
        name: member.creature.name,
        buildPath: member.creature.buildPath,
        hpPercent: Math.round((member.hp / member.creature.stats.hp) * 100),
        statuses: member.statuses.map((status) => status.id),
      })),
      resonance: battle.resonance,
      actions,
      logTail: battle.log.slice(-4).map((event) => event.text),
    };
    void battleDirector(payload, legal, { preferLive, timeoutMs: 5000 }).then((outcome) => {
      if (cancelled) return;
      setPlanning(false);
      if (outcome.plan) {
        setBattle((prev) =>
          prev && prev.round === round && !prev.outcome
            ? applyEnemyPlan(prev, {
                actionId: outcome.plan!.actionId,
                reason: outcome.plan!.reason,
                taunt: outcome.plan!.taunt,
                model: outcome.model,
                latencyMs: outcome.latencyMs,
              })
            : prev,
        );
        setAiNote(`AI 选招 · ${outcome.model || 'model'} · ${outcome.latencyMs}ms · ${outcome.plan.reason}`);
      } else {
        setAiNote(outcome.note);
      }
    });
    return () => {
      cancelled = true;
    };
    // 只在回合推进时请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.round, battle?.outcome, preferLive]);

  /* 战斗结束：结算战绩 + 推进区域 */
  useEffect(() => {
    if (!battle?.outcome || !save.run || resultRef.current) return;
    resultRef.current = true;
    const outcome = battle.outcome;
    let nextSave = recordBattleResult(save, save.party.ids, outcome);
    let nextRun = save.run;
    if (outcome === 'win') {
      nextRun = completeNode(save.run, battle.rewards);
      nextSave = {
        ...nextSave,
        run: nextRun,
        materials: nextSave.materials + battle.rewards.materials,
        tokens: nextSave.tokens + battle.rewards.tokens,
        regionClears: nextSave.regionClears + (nextRun.completed && !save.run.completed ? 1 : 0),
      };
    } else {
      nextSave = { ...nextSave, run: nextRun };
    }
    commit(nextSave);
    setResult({ battle, run: nextRun });
    setScreen('result');
  }, [battle, save, commit]);

  const resolveMain = useCallback(
    (action: PlayerMainAction) => {
      if (!battle) return;
      try {
        const next = resolveRound(battle, { main: action, ...(support ? { support } : {}) });
        setBattle(next);
        setSupport(null);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '这个行动现在不可用');
      }
    },
    [battle, support, showToast],
  );

  const retryBattle = useCallback(() => {
    setBattle(null);
    setResult(null);
    setSupport(null);
    enterCurrentBattle();
  }, [enterCurrentBattle]);

  /* ------------------------------ 图鉴/设置 ------------------------------ */

  const toggleAiMode = useCallback(() => {
    const aiMode = save.settings.aiMode === 'auto' ? 'demo' : 'auto';
    commit({ ...save, settings: { ...save.settings, aiMode } });
  }, [save, commit]);

  const handleExport = useCallback(() => {
    const blob = new Blob([exportSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jiangcheng-2-save.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('存档已导出');
  }, [save, showToast]);

  const handleImport = useCallback(
    (text: string) => {
      const imported = importSave(text);
      if (!imported) {
        showToast('导入失败：不是合法的 2.0 存档');
        return;
      }
      commit(imported);
      showToast('存档已导入');
    },
    [commit, showToast],
  );

  const openMap = useCallback(() => {
    if (!save.run) {
      showToast('还没有探索进度：先去队伍工坊出发');
      setScreen('party');
      return;
    }
    setScreen('map');
  }, [save.run, showToast]);

  const nav: Array<{ key: Screen; label: string; onClick: () => void }> = [
    { key: 'capture', label: '捕获站', onClick: () => setScreen('capture') },
    { key: 'party', label: '我的队伍', onClick: () => setScreen('party') },
    { key: 'map', label: '江城地图', onClick: openMap },
    { key: 'codex', label: '图鉴', onClick: () => setScreen('codex') },
  ];

  return (
    <div className="v2-app">
      <div className="grain" aria-hidden="true" />
      <header className="v2-topbar">
        <button type="button" className="v2-wordmark" onClick={() => setScreen('capture')}>
          <span>江城万物怪</span>
          <small>2.0 探索切片 · JIANGCHENG ECHO CODEX</small>
        </button>
        <nav className="v2-nav" aria-label="2.0 导航">
          {nav.map((item) => (
            <button
              type="button"
              key={item.key}
              className="v2-nav-tab"
              data-active={screen === item.key}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
          <span className="v2-stamp" data-tone={preferLive ? 'red' : 'blue'} title={health?.model ?? ''}>
            {health ? (preferLive ? '实时 AI 就绪' : '规则/演示模式') : '检测中'}
          </span>
          <button type="button" className="v2-link-btn" onClick={toggleAiMode}>
            {save.settings.aiMode === 'auto' ? '切换演示模式' : '切换实时 AI'}
          </button>
          <a className="v2-link-btn" href="./" title="回到 P1 三回合快斗">
            旧版快斗 ↗
          </a>
        </nav>
      </header>

      <main className="v2-shell">
        {screen === 'capture' ? (
          <CaptureView2
            draft={draft}
            sampleError={captureError}
            busy={busy}
            preferLive={preferLive}
            aiAvailable={Boolean(health?.aiAvailable)}
            aiNote=""
            samples={V2_SAMPLES}
            onPickSample={pickSample}
            onUpload={(file) => void upload(file)}
            onToggleLive={toggleAiMode}
            onToggleEvidence={toggleEvidence}
            onAddEvidence={addEvidence}
            onPickPath={pickPath}
            onSummon={summonCreature}
            onClear={() => setDraft(null)}
            onOpenCodex={() => setScreen('codex')}
          />
        ) : null}

        {screen === 'party' ? (
          <PartyWorkshop
            save={save}
            onToggleParty={toggleParty}
            onSetActive={setActive}
            onToggleEquip={toggleEquip}
            onStartRun={startRun}
            onOpenCapture={() => setScreen('capture')}
            onOpenCodex={() => setScreen('codex')}
          />
        ) : null}

        {screen === 'map' && save.run ? (
          <RegionMap
            run={save.run}
            onChooseEvent={chooseEvent}
            onEnterBattle={(node, enemy) => startBattle(node, enemy)}
            onRestartRun={() => {
              const run = createRegionRun(newSeed('river'));
              commit({ ...save, run });
              setScreen('map');
            }}
            onOpenParty={() => setScreen('party')}
            onOpenCodex={() => setScreen('codex')}
            onOpenCapture={() => setScreen('capture')}
          />
        ) : null}

        {screen === 'battle' && battle ? (
          <BattleView2
            battle={battle}
            support={support}
            aiNote={aiNote}
            planning={planning}
            preferLive={preferLive}
            onMain={resolveMain}
            onSupport={setSupport}
            onExit={() => {
              setBattle(null);
              setScreen(save.run ? 'map' : 'party');
            }}
          />
        ) : null}

        {screen === 'result' && result ? (
          <BattleResult
            battle={result.battle}
            run={result.run}
            onContinue={() => {
              setBattle(null);
              setResult(null);
              setScreen('map');
            }}
            onRetry={retryBattle}
            onOpenParty={() => setScreen('party')}
            onOpenCodex={() => setScreen('codex')}
          />
        ) : null}

        {screen === 'codex' ? (
          <CodexView
            save={save}
            preferLive={preferLive}
            aiAvailable={Boolean(health?.aiAvailable)}
            onToggleLock={(id) => commit(toggleLock(save, id))}
            onToggleLive={toggleAiMode}
            onOpenParty={() => setScreen('party')}
            onOpenCapture={() => setScreen('capture')}
            onExport={handleExport}
            onImport={handleImport}
          />
        ) : null}
      </main>

      <footer className="v2-footer">
        <span>原创虚构世界 · 五区内容分阶段接入 · 非官方服务</span>
        <span>
          {save.collection.length} 只造物 · {save.legacyCards.length} 张旧卡 · 材料 {save.materials} · 信物 {save.tokens}
          {save.run ? ` · 当前 ${RIVER_REGION.name} 节点 ${Math.min(save.run.nodeIndex + 1, RIVER_REGION.nodes.length)}/${RIVER_REGION.nodes.length}` : ''}
        </span>
      </footer>

      {summon ? (
        <div className="v2-summon-overlay" aria-live="polite">
          <div className="v2-summon-stage">
            <p className="eyebrow">回响定形 · {PATH_LABEL[summon.buildPath]}</p>
            <div className="v2-summon-art">
              <MonsterSprite recipe={summon.visual} mood="happy" title={summon.name} />
            </div>
            <h3 className="v2-h3">{summon.name}</h3>
            <p className="v2-lede">{summon.flavor}</p>
            <div className="v2-summon-stats mono">
              <span>HP {summon.stats.hp}</span>
              <span>ATK {summon.stats.atk}</span>
              <span>DEF {summon.stats.def}</span>
              <span>SPD {summon.stats.spd}</span>
            </div>
            <p className="fineprint">正在写入图鉴…</p>
          </div>
        </div>
      ) : null}

      {toast ? <div className="v2-toast">{toast}</div> : null}
    </div>
  );
}

const PATH_LABEL: Record<BuildPath, string> = {
  guardian: '守护',
  striker: '强攻',
  trickster: '诡计',
  support: '支援',
  mover: '机动',
};
