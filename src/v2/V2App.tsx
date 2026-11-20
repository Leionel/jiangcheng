import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildPath, ExpeditionBattleState, RegionId, RegionRunState, SaveV2, Tag, V2Creature } from './domain/types';
import { compileCreature } from './domain/compile';
import { inferTags, mergeEvidence, recommendPaths, toggleConfirmed } from './domain/tags';
import {
  addCreature,
  applyBattleGrowth,
  bindLinkStat,
  bondLevelOf,
  chooseEventInSave,
  completeRegion,
  deevolveCreature,
  evolveCreature,
  exportSave,
  getActiveRun,
  importSave,
  loadSave,
  patchRegionRun,
  persistSave,
  promoteCreatureToLead,
  recordBattleResult,
  setActiveRegion,
  setEquipped,
  startRegionRun,
  toggleLock,
  awakenLegacyCard,
} from './domain/save';
import { completeNode, currentNode, getEnemy, getRegion, REGIONS } from './domain/region';
import {
  ENEMY_ACTION_LABEL,
  applyEnemyPlan,
  createExpeditionBattle,
  estimateEnemyDamage,
  legalEnemyActions,
  resolveRound,
} from './domain/battle2';
import { V2_SAMPLES, sampleIdentity } from './content/samples';
import { analyzeObject, battleDirector, evolutionGuide, questDirector } from './ai/gateway';
import { getHealth, type HealthInfo } from '../shared/ai/client';
import { inspectImageFile } from '../features/monsters/analyze';
import { CATEGORY_TO_ELEMENT } from '../features/monsters/elements';
import { hashString } from '../shared/rng';
import { MonsterSprite } from '../features/monsters/MonsterSprite';
import { CaptureView2, type CaptureDraft } from './views/CaptureView2';
import { BattleView2 } from './views/BattleView2';
import { BattleResult, CodexView, PartyWorkshop, QuestPanel, RegionMap } from './views/Panels';
import { branchesFor, evolutionGroupFor, previewEvolution } from './domain/evolution';
import { GuideDrawer, NextStepBar } from './views/Guide';
import { grantXp } from './domain/growth';
import { claimQuest, QUEST_BY_ID, QUEST_DEFS, questState } from './domain/quests';
import { buildChallengeCode } from './domain/challenge';
import type { EnemyDef, PlayerMainAction, PlayerSupportAction, RegionNodeDef } from './domain/types';
import './styles/v2.css';

type Screen = 'capture' | 'party' | 'map' | 'battle' | 'result' | 'codex' | 'quests';

type SummonReveal = {
  creature: V2Creature;
  originLabel: string;
  originImage?: string;
  isFirstCapture: boolean;
};

const ACTION_LABEL = ENEMY_ACTION_LABEL;

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
  const [summon, setSummon] = useState<SummonReveal | null>(null);
  const [showFullNav, setShowFullNav] = useState(false);
  const [battle, setBattle] = useState<ExpeditionBattleState | null>(null);
  const [support, setSupport] = useState<PlayerSupportAction | null>(null);
  const [aiNote, setAiNote] = useState('');
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<{ battle: ExpeditionBattleState; run: RegionRunState } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<RegionId>(() => loadSave().activeRegionId);
  const [evolveId, setEvolveId] = useState<string | null>(null);
  const [questHint, setQuestHint] = useState('');
  const [questPlanning, setQuestPlanning] = useState(false);
  const [evoGuide, setEvoGuide] = useState('');
  const [evoRecommendedId, setEvoRecommendedId] = useState('');
  const [evoPlanning, setEvoPlanning] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const resultRef = useRef(false);

  const activeRun = getActiveRun(save);
  const preferLive = Boolean(health?.aiAvailable && save.settings.aiMode === 'auto');
  const evolveCreatureData = evolveId ? save.collection.find((item) => item.id === evolveId) ?? null : null;
  const isFreshOnboarding = save.stats.captures === 0 && save.stats.battles === 0 && !activeRun && !showFullNav && screen === 'capture';

  const commit = useCallback((next: SaveV2) => {
    setSave(next);
    persistSave(next);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    setSelectedRegionId(save.activeRegionId);
  }, [save.activeRegionId]);

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
      element: sample.element,
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
          element: CATEGORY_TO_ELEMENT[inspection.vision.category],
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
    const isFirstCapture = save.stats.captures === 0;
    const creature = compileCreature({
      vision: draft.vision,
      evidence: draft.evidence,
      buildPath: draft.path,
      element: draft.element,
      source: draft.source,
      ...(draft.name ? { name: draft.name } : {}),
      ...(draft.flavor ? { flavor: draft.flavor } : {}),
      variant: hashString(`${draft.vision.primaryObject}|${draft.path}|${draft.evidence.map((item) => item.tag).join(',')}`) % 97,
      createdAt: Date.now(),
    });
    let next = addCreature(save, creature);
    if (isFirstCapture) {
      next = promoteCreatureToLead(next, creature.id);
    }
    commit(next);
    setSummon({
      creature,
      originLabel: draft.vision.primaryObject,
      originImage: draft.imageDataUrl,
      isFirstCapture,
    });
    setDraft(null);
  }, [draft, save, commit]);

  const startFirstBattleFromSummon = useCallback(() => {
    const firstLead = summon?.creature;
    let nextSave = firstLead ? promoteCreatureToLead(save, firstLead.id) : save;
    let run = getActiveRun(nextSave);
    if (!run || run.completed) {
      nextSave = startRegionRun(nextSave, 'river', newSeed('river'));
      const created = getActiveRun(nextSave)!;
      run = {
        ...created,
        nodeIndex: 1,
        log: [...created.log, `带着「${firstLead?.name ?? '新伙伴'}」直奔江风渡口巡游初战！`],
      };
      nextSave = patchRegionRun(nextSave, run);
    }
    const party = nextSave.party.ids
      .map((id) => nextSave.collection.find((item) => item.id === id))
      .filter((item): item is V2Creature => Boolean(item));
    const node = currentNode(run);
    const enemy = getEnemy(node.enemyId) ?? getEnemy('riv_mist')!;
    const battleState = createExpeditionBattle({
      seed: newSeed(`${run.seed}-${node.id}`),
      team: party,
      enemy,
      startResonance: run.startResonance,
      activeIndex: 0,
      bondLevel: bondLevelOf(nextSave),
      startShield: run.startShield,
      bossHpDelta: run.bossHpDelta,
    });
    commit(nextSave);
    resultRef.current = false;
    setSummon(null);
    setBattle(battleState);
    setSupport(null);
    setAiNote('');
    setPlanning(false);
    setScreen('battle');
  }, [summon, save, commit]);

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

  const startRun = useCallback(
    (regionId: RegionId = selectedRegionId) => {
      if (save.party.ids.length < 3) {
        showToast('先凑满 3 只再出发');
        setScreen('party');
        return;
      }
      if (!save.unlockedRegions.includes(regionId)) {
        const region = REGIONS[regionId];
        const previous = region.unlockAfter ? REGIONS[region.unlockAfter] : null;
        showToast(previous ? `先完成「${previous.name}」解锁这里` : '这里还没有解锁');
        return;
      }
      const next = startRegionRun(save, regionId, newSeed(regionId));
      commit(next);
      setSelectedRegionId(regionId);
      setScreen('map');
    },
    [save, selectedRegionId, commit, showToast],
  );

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
      if (!activeRun) return;
      const res = chooseEventInSave(save, eventId, choiceId);
      if (res.save === save) return;
      commit(res.save);
      const notes: string[] = [];
      if (res.materialsGained > 0) notes.push(`材料 +${res.materialsGained}`);
      if (res.tokensGained > 0) notes.push(`信物 +${res.tokensGained}`);
      if (res.bondGained > 0) notes.push(`队伍羁绊 +${res.bondGained}`);
      if (res.bonusTriggered) notes.push('触发物性共鸣');
      if (notes.length > 0) showToast(notes.join(' · '));
    },
    [save, activeRun, commit, showToast],
  );

  const startBattle = useCallback(
    (node: RegionNodeDef, enemy: EnemyDef) => {
      if (!activeRun) return;
      if (partyCreatures.length < 3) {
        showToast('队伍不足 3 只，先去队伍工坊');
        setScreen('party');
        return;
      }
      const next = createExpeditionBattle({
        seed: newSeed(`${activeRun.seed}-${node.id}`),
        team: partyCreatures,
        enemy,
        startResonance: activeRun.startResonance,
        activeIndex: save.party.activeIndex,
        bondLevel: bondLevelOf(save),
        startShield: activeRun.startShield,
        bossHpDelta: activeRun.bossHpDelta,
      });
      resultRef.current = false;
      setBattle(next);
      setSupport(null);
      setAiNote('');
      setPlanning(false);
      setScreen('battle');
    },
    [save, activeRun, partyCreatures, showToast],
  );

  const enterCurrentBattle = useCallback(() => {
    if (!activeRun) return;
    const node = currentNode(activeRun);
    const enemy = getEnemy(node.enemyId);
    if (node.type === 'event' || !enemy) return;
    startBattle(node, enemy);
  }, [activeRun, startBattle]);

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

  /* 战斗结束：结算战绩 + 成长 + 推进区域 + 解锁下一区 */
  useEffect(() => {
    if (!battle?.outcome || !activeRun || resultRef.current) return;
    resultRef.current = true;
    const outcome = battle.outcome;
    const node = currentNode(activeRun);
    let nextSave = recordBattleResult(save, save.party.ids, outcome);
    const growth = applyBattleGrowth(nextSave, {
      partyIds: save.party.ids,
      outcome,
      enemyKind: battle.enemy.def.kind,
      nodeKey: `${activeRun.regionId}:${node.id}`,
    });
    nextSave = growth.save;
    if (battle.linkUsed) nextSave = bindLinkStat(nextSave);
    let nextRun = activeRun;
    if (outcome === 'win') {
      nextRun = completeNode(activeRun, battle.rewards);
      nextSave = {
        ...nextSave,
        materials: nextSave.materials + battle.rewards.materials,
        tokens: nextSave.tokens + battle.rewards.tokens,
      };
      nextSave = patchRegionRun(nextSave, nextRun);
      if (nextRun.completed) {
        const beforeUnlocked = new Set(nextSave.unlockedRegions);
        nextSave = completeRegion(nextSave, nextRun);
        const newRegion = nextSave.unlockedRegions.find((id) => !beforeUnlocked.has(id));
        if (newRegion) showToast(`新区域解锁：「${REGIONS[newRegion].name}」`);
      }
    }
    if (growth.levelsGained > 0) showToast(`队伍升级 +${growth.levelsGained}（经验 +${growth.xpGained}）`);
    commit(nextSave);
    setResult({ battle, run: nextRun });
    setScreen('result');
  }, [battle, save, activeRun, commit, showToast]);

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
    setSelectedRegionId(save.activeRegionId);
    setScreen('map');
  }, [save.activeRegionId]);

  const selectRegion = useCallback(
    (regionId: RegionId) => {
      setSelectedRegionId(regionId);
      if (save.regionRuns[regionId] && save.activeRegionId !== regionId) {
        commit(setActiveRegion(save, regionId));
      }
    },
    [save, commit],
  );

  const restartRun = useCallback(
    (regionId: RegionId) => {
      const next = startRegionRun(save, regionId, newSeed(regionId));
      commit(next);
      setSelectedRegionId(regionId);
      setScreen('map');
      showToast(`重新探索「${REGIONS[regionId].name}」`);
    },
    [save, commit, showToast],
  );

  const openEvolution = useCallback((id: string) => {
    setEvolveId(id);
    setEvoGuide('');
    setEvoRecommendedId('');
  }, []);

  const handleQuestAi = useCallback(async () => {
    const active = QUEST_DEFS.filter((quest) => ['active', 'complete'].includes(questState(quest, save)));
    if (active.length === 0) {
      showToast('现在没有能推荐的任务');
      return;
    }
    setQuestPlanning(true);
    try {
      const result = await questDirector(
        {
          region: activeRun ? getRegion(activeRun.regionId).name : '江城',
          quests: active.map((quest) => ({
            id: quest.id,
            title: quest.title,
            desc: quest.desc,
            progress: Math.min(quest.target, quest.progress(save)),
            target: quest.target,
          })),
          party: save.party.ids
            .map((id) => save.collection.find((item) => item.id === id))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => ({ name: item.name, buildPath: item.buildPath, level: item.level })),
          materials: save.materials,
          tokens: save.tokens,
          bond: bondLevelOf(save).toString(),
        },
        active.map((quest) => quest.id),
        { preferLive, timeoutMs: 6000 },
      );
      const quest = result.plan ? QUEST_BY_ID.get(result.plan.questId) : null;
      setQuestHint(
        result.plan && quest
          ? `推荐「${quest.title}」：${result.plan.reason}${result.plan.hint ? ` · ${result.plan.hint}` : ''}`
          : result.note,
      );
    } finally {
      setQuestPlanning(false);
    }
  }, [save, activeRun, preferLive, showToast]);

  const handleEvolutionAi = useCallback(async () => {
    if (!evolveCreatureData) return;
    const branches = branchesFor(evolveCreatureData);
    if (branches.length === 0) return;
    setEvoPlanning(true);
    try {
      const result = await evolutionGuide(
        {
          creature: {
            name: evolveCreatureData.name,
            level: evolveCreatureData.level,
            buildPath: evolveCreatureData.buildPath,
            stats: evolveCreatureData.stats,
          },
          branches: branches.map((branch) => ({
            id: branch.id,
            name: branch.name,
            path: branch.path,
            desc: branch.desc,
            statBonus: branch.statBonus as unknown as Record<string, number>,
          })),
          party: save.collection
            .filter((item) => save.party.ids.includes(item.id))
            .map((item) => ({ name: item.name, buildPath: item.buildPath, level: item.level })),
          region: activeRun ? getRegion(activeRun.regionId).name : '江城',
        },
        branches.map((branch) => branch.id),
        { preferLive, timeoutMs: 6000 },
      );
      setEvoGuide(result.plan ? `推荐「${branches.find((b) => b.id === result.plan!.branchId)?.name}」：${result.plan.reason}` : result.note);
    } finally {
      setEvoPlanning(false);
    }
  }, [evolveCreatureData, save, activeRun, preferLive]);

  const handleEvolve = useCallback(
    (branchId: string) => {
      if (!evolveCreatureData) return;
      if (evolveCreatureData.level < 3) {
        showToast('熟练度不足：先练到 3 级');
        return;
      }
      if (save.tokens < 1) {
        showToast('进化需要 1 个信物');
        return;
      }
      const next = evolveCreature(save, evolveCreatureData.id, branchId);
      if (next === save) {
        showToast('现在还不能进化');
        return;
      }
      commit(next);
      setEvolveId(null);
      showToast(`「${evolveCreatureData.name}」完成进化`);
    },
    [save, commit, evolveCreatureData, showToast],
  );

  const handleDeevolve = useCallback(() => {
    if (!evolveCreatureData) return;
    if (save.tokens < 1) {
      showToast('回退需要 1 个信物');
      return;
    }
    const next = deevolveCreature(save, evolveCreatureData.id);
    if (next === save) {
      showToast('没有可以回退的进化');
      return;
    }
    commit(next);
    setEvolveId(null);
    showToast('已回退到进化前');
  }, [save, commit, evolveCreatureData, showToast]);

  const handleClaimQuest = useCallback(
    (questId: string) => {
      const next = claimQuest(save, questId);
      if (next === save) {
        showToast('这个奖励还不能领');
        return;
      }
      const quest = QUEST_BY_ID.get(questId);
      let after = next;
      if (quest?.reward.xp) {
        after = {
          ...after,
          collection: after.collection.map((item) =>
            save.party.ids.includes(item.id) ? grantXp(item, quest.reward.xp!).creature : item,
          ),
        };
      }
      commit(after);
      showToast('任务奖励已领取');
    },
    [save, commit, showToast],
  );

  const handleShare = useCallback(() => {
    const code = buildChallengeCode(save, activeRun?.seed ?? 'preview');
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        showToast('挑战码已复制到剪贴板');
      } catch {
        showToast(code);
      }
    };
    void copy();
  }, [save, activeRun?.seed, showToast]);

  const handleAwakenLegacy = useCallback(
    (cardId: string) => {
      const next = awakenLegacyCard(save, cardId);
      if (next === save) {
        showToast('这张旧卡已经觉醒过了');
        return;
      }
      commit(next);
      showToast('旧卡已觉醒为 2.0 造物，旧图鉴仍保留');
    },
    [save, commit, showToast],
  );

  const toggleAiMode = useCallback(() => {
    const aiMode = save.settings.aiMode === 'auto' ? 'demo' : 'auto';
    commit({ ...save, settings: { ...save.settings, aiMode } });
  }, [save, commit]);

  const nav: Array<{ key: Screen; label: string; onClick: () => void }> = [
    { key: 'capture', label: '捕获站', onClick: () => setScreen('capture') },
    { key: 'party', label: '我的队伍', onClick: () => setScreen('party') },
    { key: 'map', label: '江城地图', onClick: openMap },
    { key: 'quests', label: '任务', onClick: () => setScreen('quests') },
    { key: 'codex', label: '图鉴', onClick: () => setScreen('codex') },
  ];

  return (
    <div className="v2-app">
      <div className="grain" aria-hidden="true" />
      <header className="v2-topbar">
        <button type="button" className="v2-wordmark" onClick={() => setScreen('capture')}>
          <span>江城万物怪</span>
          <small>观测手册 · 探索切片 / VOL.02</small>
        </button>
        <nav className="v2-nav" aria-label="2.0 导航">
          {!isFreshOnboarding
            ? nav.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className="v2-nav-tab"
                  data-active={screen === item.key}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ))
            : (
                <button type="button" className="v2-link-btn" onClick={() => setShowFullNav(true)}>
                  全部功能 ▾
                </button>
              )}
          <span className="v2-stamp" data-tone={preferLive ? 'red' : 'blue'} title={health?.model ?? ''}>
            {health ? (preferLive ? '实时 AI 就绪' : '规则/演示模式') : '检测中'}
          </span>
          <button type="button" className="v2-nav-tab" onClick={() => setGuideOpen(true)}>
            指引
          </button>
          <button type="button" className="v2-link-btn" onClick={toggleAiMode}>
            {save.settings.aiMode === 'auto' ? '切换演示模式' : '切换实时 AI'}
          </button>
          <a className="v2-link-btn" href="?v1=1" title="切换到 P1 三回合快斗旧版">
            旧版快斗 ↗
          </a>
        </nav>
      </header>

      <main className="v2-shell">
        {!isFreshOnboarding && screen !== 'battle' && screen !== 'result' ? (
          <NextStepBar
            save={save}
            currentScreen={screen}
            onNavigate={(target) => {
              setSelectedRegionId(save.activeRegionId);
              setScreen(target);
            }}
            onOpenGuide={() => setGuideOpen(true)}
          />
        ) : null}
        <div className="v2-screen" key={screen}>
          {screen === 'capture' ? (
          <CaptureView2
            draft={draft}
            sampleError={captureError}
            busy={busy}
            preferLive={preferLive}
            aiAvailable={Boolean(health?.aiAvailable)}
            aiNote=""
            isFirstTime={save.stats.captures === 0}
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
            onStartRun={openMap}
            onOpenCapture={() => setScreen('capture')}
            onOpenCodex={() => setScreen('codex')}
            onOpenEvolution={openEvolution}
          />
        ) : null}

        {screen === 'map' ? (
          <RegionMap
            save={save}
            partyCreatures={partyCreatures}
            selectedRegionId={selectedRegionId}
            onSelectRegion={selectRegion}
            onChooseEvent={chooseEvent}
            onEnterBattle={(node, enemy) => startBattle(node, enemy)}
            onStartRegion={startRun}
            onRestartRun={restartRun}
            onOpenParty={() => setScreen('party')}
            onOpenCodex={() => setScreen('codex')}
            onOpenCapture={() => setScreen('capture')}
          />
        ) : null}

        {screen === 'quests' ? (
          <QuestPanel
            save={save}
            onClaim={handleClaimQuest}
            aiHint={questHint}
            aiPlanning={questPlanning}
            onAiRecommend={() => void handleQuestAi()}
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
              setScreen('map');
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
            onShare={handleShare}
            onAwakenLegacy={handleAwakenLegacy}
          />
        ) : null}
        </div>
      </main>

      <footer className="v2-footer">
        <span>原创虚构世界 · 五区内容分阶段接入 · 非官方服务</span>
        <span>
          {save.collection.length} 只造物 · {save.legacyCards.length} 张旧卡 · 材料 {save.materials} · 信物 {save.tokens}
          {activeRun
            ? ` · ${getRegion(activeRun.regionId).name} 节点 ${Math.min(activeRun.nodeIndex + 1, getRegion(activeRun.regionId).nodes.length)}/${getRegion(activeRun.regionId).nodes.length}`
            : ''}
        </span>
      </footer>

      {summon ? (
        <div className="v2-summon-overlay" role="dialog" aria-modal="true" aria-label="回响显影定形" aria-live="polite">
          <div className="v2-summon-stage">
            <p className="v2-rubric">
              变身完成 · {PATH_LABEL[summon.creature.buildPath]}倾向 · 已入图鉴{summon.isFirstCapture ? '（已自动设为 1 号主战）' : ''}
            </p>
            <div className="v2-summon-morph">
              <div className="v2-summon-origin">
                <span>原物线索</span>
                {summon.originImage ? <img src={summon.originImage} alt={summon.originLabel} /> : null}
                <b>{summon.originLabel}</b>
              </div>
              <span className="v2-summon-arrow" aria-hidden="true">→</span>
              <div className="v2-summon-art">
                <MonsterSprite recipe={summon.creature.visual} mood="happy" title={summon.creature.name} />
              </div>
            </div>
            <h3 className="v2-h3">{summon.creature.name}</h3>
            <p className="v2-lede">{summon.creature.flavor}</p>
            <div className="v2-summon-stats mono">
              <span>HP {summon.creature.stats.hp}</span>
              <span>ATK {summon.creature.stats.atk}</span>
              <span>DEF {summon.creature.stats.def}</span>
              <span>SPD {summon.creature.stats.spd}</span>
            </div>
            <div className="v2-summon-actions">
              {save.stats.battles === 0 ? (
                <button type="button" className="v2-btn v2-btn-primary v2-btn-lg" onClick={startFirstBattleFromSummon}>
                  带「{summon.creature.name}」打第一场 ↗
                </button>
              ) : (
                <button
                  type="button"
                  className="v2-btn v2-btn-primary v2-btn-lg"
                  onClick={() => {
                    setSummon(null);
                    setSelectedRegionId(save.activeRegionId);
                    setScreen('map');
                  }}
                >
                  带去江城地图探索 ↗
                </button>
              )}
              <button
                type="button"
                className="v2-btn"
                onClick={() => {
                  setSummon(null);
                  setScreen('party');
                  showToast(`「${summon.creature.name}」已在队伍工坊里等你编排`);
                }}
              >
                去队伍调整
              </button>
              <button type="button" className="v2-link-btn" onClick={() => setSummon(null)}>
                留在捕获站
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {evolveCreatureData ? (
        <div className="v2-summon-overlay" role="dialog" aria-modal="true" aria-label="成长与进化">
          <div className="v2-evolve-panel">
            <div className="v2-panel-head">
              <div>
                <p className="v2-rubric">成长记录 · {evolutionGroupFor(evolveCreatureData).name}</p>
                <h3 className="v2-h3">{evolveCreatureData.name} · Lv.{evolveCreatureData.level}</h3>
                <p className="fineprint">
                  {evolveCreatureData.evolutionId
                    ? `已进化：${evolveCreatureData.evolutionId}`
                    : evolveCreatureData.level >= 3
                      ? '达到 3 级，可以消耗 1 个信物选择一条进化分支。'
                      : '达到 3 级后解锁进化；可去区域战斗积累经验。'}
                </p>
              </div>
              <button type="button" className="v2-btn v2-btn-sm" onClick={() => setEvolveId(null)}>关闭</button>
            </div>
            <div className="v2-specimen-stats">
              <span><em>HP</em><b>{evolveCreatureData.stats.hp}</b></span>
              <span><em>ATK</em><b>{evolveCreatureData.stats.atk}</b></span>
              <span><em>DEF</em><b>{evolveCreatureData.stats.def}</b></span>
              <span><em>SPD</em><b>{evolveCreatureData.stats.spd}</b></span>
            </div>
            <div className="v2-guidance-bar">
              <span className="v2-rubric">进化指引</span>
              <p className="v2-lede">
                {evoGuide || '两条分支会改变属性、技能与外观；先看队伍缺什么，再花信物。'}
              </p>
              <button type="button" className="v2-btn v2-btn-sm" onClick={handleEvolutionAi} disabled={evoPlanning}>
                {evoPlanning ? 'AI 正在看…' : 'AI 推荐一条'}
              </button>
            </div>
            {evolveCreatureData.evolutionId ? (
              <div className="v2-evolve-current">
                <p className="fineprint">回退会恢复进化前的属性、技能与配色，消耗 1 个信物。</p>
                <button type="button" className="v2-btn" onClick={handleDeevolve} disabled={save.tokens < 1}>回退进化（信物 1）</button>
              </div>
            ) : (
              <div className="v2-evolve-grid">
                {branchesFor(evolveCreatureData).map((branch) => {
                  const preview = previewEvolution(evolveCreatureData, branch);
                  const recommended = branch.id === evoRecommendedId || evoGuide.includes(`推荐「${branch.name}」`);
                  return (
                    <div className="v2-evolve-card" key={branch.id} data-recommended={recommended}>
                      <span className="v2-badge" data-kind="path">{PATH_LABEL[branch.path]}</span>
                      {recommended ? <span className="v2-badge" data-kind="ai">AI 推荐</span> : null}
                      <b>{preview.name}</b>
                      <p className="fineprint">{preview.desc}</p>
                      <div className="v2-specimen-stats">
                        <span><em>HP</em><b>{preview.stats.hp}</b></span>
                        <span><em>ATK</em><b>{preview.stats.atk}</b></span>
                        <span><em>DEF</em><b>{preview.stats.def}</b></span>
                        <span><em>SPD</em><b>{preview.stats.spd}</b></span>
                      </div>
                      <p className="fineprint">获得技能：{preview.module?.name} · {preview.module?.text}</p>
                      <button
                        type="button"
                        className="v2-btn v2-btn-primary"
                        disabled={evolveCreatureData.level < 3 || save.tokens < 1}
                        onClick={() => handleEvolve(branch.id)}
                      >
                        选择这条进化（信物 1）
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="fineprint">当前信物：{save.tokens}。进化会立即改变属性、技能与外观配色；可在同一面板回退。</p>
          </div>
        </div>
      ) : null}

      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
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







