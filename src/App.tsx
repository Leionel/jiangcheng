import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleState, Monster, MonsterDraft, TacticId, VisionSummary } from './shared/types';
import type { AnalyzeStep } from './features/monsters/AnalyzeModal';
import type { Sample } from './features/monsters/samples';
import { randomId } from './shared/rng';
import {
  analyzeMonster,
  callLog,
  getHealth,
  modeLabel,
  subscribeLog,
  type HealthInfo,
} from './shared/ai/client';
import { buildMonster } from './features/monsters/build';
import {
  inspectImageFile,
  localAnalyzer,
  UploadError,
  variantOf,
} from './features/monsters/analyze';
import { CaptureView } from './features/monsters/CaptureView';
import { AnalyzeModal } from './features/monsters/AnalyzeModal';
import { CardView } from './features/monsters/CardView';
import { BattleView } from './features/monsters/BattleView';
import { ResultView } from './features/monsters/ResultView';
import { GalleryView } from './features/monsters/GalleryView';
import { ENEMIES, getEnemy } from './features/monsters/enemies';
import {
  addMonster,
  applyOutcome,
  getRecord,
  loadGallery,
  recordBattle,
  removeMonster,
  serialOf,
} from './features/monsters/store';
import { ELEMENTS } from './features/monsters/elements';
import type { CallLogEntry } from './shared/types';

type Screen = 'capture' | 'card' | 'battle' | 'result' | 'gallery';
type Toast = { message: string; tone: 'info' | 'warn'; id: number };

type Pending = {
  source: 'demo' | 'upload';
  vision: VisionSummary;
  dataUrl?: string;
  palette?: [string, string, string];
  localDraft: () => MonsterDraft;
  title: string;
};

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function useCallLog(): CallLogEntry[] {
  const [items, setItems] = useState<CallLogEntry[]>(() => [...callLog]);
  useEffect(() => subscribeLog(() => setItems([...callLog])), []);
  return items;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('capture');
  const [gallery, setGallery] = useState<Monster[]>(() => loadGallery());
  const [current, setCurrent] = useState<Monster | null>(null);
  const [enemyId, setEnemyId] = useState<string>(ENEMIES[0].id);
  const [battleResult, setBattleResult] = useState<BattleState | null>(null);
  const [battleEpoch, setBattleEpoch] = useState(0);
  const [tacticId, setTacticId] = useState<TacticId>('steady');
  const [battleSeed, setBattleSeed] = useState<string | null>(null);

  const [preferLive, setPreferLive] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [analyzing, setAnalyzing] = useState<{ title: string; step: AnalyzeStep } | null>(null);
  const [slow, setSlow] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const logs = useCallLog();

  useEffect(() => {
    let alive = true;
    getHealth().then((info) => {
      if (!alive) return;
      setHealth(info);
      if (info.aiAvailable) setPreferLive(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  const finishCapture = useCallback((monster: Monster, note?: string) => {
    setGallery((prev) => addMonster(prev, monster));
    setCurrent(monster);
    setScreen('card');
    setAnalyzing(null);
    setSlow(false);
    pendingRef.current = null;
    if (note) showToast(note, 'info');
  }, [showToast]);

  const runAnalyze = useCallback(
    async (pending: Pending) => {
      const runId = runRef.current + 1;
      runRef.current = runId;
      const controller = new AbortController();
      abortRef.current = controller;
      pendingRef.current = pending;

      setAnalyzing({ title: pending.title, step: 0 });
      setSlow(false);
      setUploadError(null);

      const slowTimer = window.setTimeout(() => setSlow(true), 8000);
      const stepTimer = window.setTimeout(
        () => setAnalyzing((prev) => (prev ? { ...prev, step: 1 } : prev)),
        180,
      );
      const started = performance.now();

      try {
        const result = await analyzeMonster(
          { source: pending.source, vision: pending.vision, imageDataUrl: pending.dataUrl },
          pending.localDraft,
          { preferLive, signal: controller.signal },
        );

        const elapsed = performance.now() - started;
        if (elapsed < 640) await delay(640 - elapsed);
        if (runRef.current !== runId) return;

        setAnalyzing((prev) => (prev ? { ...prev, step: 3 } : prev));

        const monster = buildMonster({
          id: randomId('mon'),
          vision: result.vision,
          draft: result.draft,
          source: pending.source,
          generationMode: result.mode,
          model: result.model,
          variant: variantOf(result.vision),
        });

        await delay(280);
        if (runRef.current !== runId) return;
        finishCapture(monster, result.mode === 'fallback' ? result.note : undefined);
      } catch (error) {
        if (runRef.current !== runId) return;
        setAnalyzing(null);
        showToast(error instanceof Error ? error.message : '生成失败，请重试', 'warn');
      } finally {
        window.clearTimeout(slowTimer);
        window.clearTimeout(stepTimer);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [finishCapture, preferLive, showToast],
  );

  const handleSample = useCallback(
    (sample: Sample) => {
      void runAnalyze({
        source: 'demo',
        vision: sample.vision,
        localDraft: () => sample.draft,
        title: `正在召唤「${sample.label}」`,
      });
    },
    [runAnalyze],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadError(null);
      try {
        const inspection = await inspectImageFile(file);
        void runAnalyze({
          source: 'upload',
          vision: inspection.vision,
          dataUrl: inspection.aiDataUrl,
          palette: inspection.palette,
          localDraft: () => localAnalyzer(inspection.vision, inspection.palette),
          title: '正在读取这张照片',
        });
      } catch (error) {
        const message =
          error instanceof UploadError ? error.message : '这张图片处理失败，换一张试试。';
        setUploadError(message);
        showToast(message, 'warn');
      }
    },
    [runAnalyze, showToast],
  );

  const cancelAnalyze = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalyzing(null);
    setSlow(false);
    pendingRef.current = null;
  }, []);

  const skipToLocal = useCallback(() => {
    const pending = pendingRef.current;
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (!pending) {
      setAnalyzing(null);
      return;
    }
    const monster = buildMonster({
      id: randomId('mon'),
      vision: pending.vision,
      draft: pending.localDraft(),
      source: pending.source,
      generationMode: 'demo',
      variant: variantOf(pending.vision),
    });
    finishCapture(monster, '已改用演示策略：本地规则生成');
  }, [finishCapture]);

  const startBattle = useCallback(
    (monsterId: string, targetEnemyId: string, tactic: TacticId = tacticId, seed: string | null = null) => {
      const monster = gallery.find((m) => m.id === monsterId) ?? (current?.id === monsterId ? current : null);
      if (!monster) return;
      setCurrent(monster);
      setEnemyId(targetEnemyId);
      setTacticId(tactic);
      setBattleSeed(seed);
      setBattleEpoch((n) => n + 1);
      setBattleResult(null);
      setScreen('battle');
    },
    [gallery, current, tacticId],
  );

  /** 对战结束：先结算战绩，再进结算页（结算页要展示更新后的胜负） */
  const handleBattleFinish = useCallback(
    (battle: BattleState) => {
      const id = current?.id ?? gallery[0]?.id;
      if (id) {
        const outcome = battle.outcome ?? 'draw';
        setGallery((prev) => recordBattle(prev, id, outcome));
        setCurrent((prev) =>
          prev && prev.id === id ? { ...prev, record: applyOutcome(getRecord(prev), outcome) } : prev,
        );
      }
      setBattleResult(battle);
      setScreen('result');
    },
    [current, gallery],
  );

  const handleShare = useCallback(async () => {
    if (!current) return;
    setShareBusy(true);
    try {
      // 分享导出是低频重模块（Canvas 绘制），按需加载，不占首屏 chunk
      const { exportMonsterCard } = await import('./features/monsters/share');
      await exportMonsterCard(current);
      showToast('精灵卡已保存到下载文件夹', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败，请重试', 'warn');
    } finally {
      setShareBusy(false);
    }
  }, [current, showToast]);

  const handleDelete = useCallback(
    (id: string) => {
      setGallery((prev) => {
        const next = removeMonster(prev, id);
        if (current?.id === id) setCurrent(next[0] ?? null);
        return next;
      });
      showToast('已从图鉴移除', 'info');
    },
    [current, showToast],
  );

  const resetToCapture = useCallback(() => {
    setScreen('capture');
    setUploadError(null);
  }, []);

  const activeMonster = current ?? gallery[0] ?? null;
  const enemy = getEnemy(enemyId) ?? ENEMIES[0];
  const modeText = health
    ? health.aiAvailable
      ? preferLive
        ? '实时 AI 就绪'
        : '演示模式'
      : '演示模式'
    : '检测中';
  const modeKey = health?.aiAvailable && preferLive ? 'live_ai' : 'demo';

  return (
    <div className="app">
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <button type="button" className="wordmark" onClick={resetToCapture}>
          <span className="wordmark-cn">江城万物怪</span>
          <span className="wordmark-en">Jiangcheng Field Notes / 观测手册 Vol.01</span>
        </button>

        <nav className="nav" aria-label="主导航">
          <button
            type="button"
            className="nav-tab"
            data-active={screen === 'capture'}
            onClick={resetToCapture}
          >
            捕捉
          </button>
          <button
            type="button"
            className="nav-tab"
            data-active={screen === 'gallery'}
            onClick={() => setScreen('gallery')}
          >
            图鉴<span className="nav-count">{gallery.length}</span>
          </button>
          <a
            className="nav-tab nav-tab--v2"
            href="./"
            style={{
              textDecoration: 'none',
              borderColor: 'var(--riso-red)',
              color: 'var(--riso-red)',
              background: 'rgba(226, 64, 43, 0.07)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              boxShadow: '2px 2px 0 rgba(226, 64, 43, 0.25)',
            }}
            title="回到 2.0 正式主版（五区地图 / 语义捕获 / 三人小队）"
          >
            <span className="stamp-dot" aria-hidden="true" />
            回到 2.0 ↗
          </a>
          <span className="stamp" data-mode={modeKey}>
            <span className="stamp-dot" />
            {modeText}
          </span>
        </nav>
      </header>

      <main className="sheet">
        {screen === 'capture' ? (
          <CaptureView
            onPickSample={handleSample}
            onUpload={(file) => void handleUpload(file)}
            galleryCount={gallery.length}
            onOpenGallery={() => setScreen('gallery')}
            preferLive={preferLive}
            onToggleLive={(value) => setPreferLive(value && Boolean(health?.aiAvailable))}
            uploadError={uploadError}
            aiAvailable={Boolean(health?.aiAvailable)}
            aiModel={health?.model ?? ''}
          />
        ) : null}

        {screen === 'card' && activeMonster ? (
          <CardView
            key={activeMonster.id}
            monster={activeMonster}
            serial={gallery.length ? serialOf(gallery, activeMonster.id) : '001'}
            onBattle={(id, tactic) => startBattle(activeMonster.id, id, tactic)}
            onRecapture={resetToCapture}
            onShare={() => void handleShare()}
            onGallery={() => setScreen('gallery')}
            shareBusy={shareBusy}
          />
        ) : null}

        {screen === 'battle' && activeMonster ? (
          <BattleView
            key={`${activeMonster.id}-${enemyId}-${battleEpoch}`}
            monster={activeMonster}
            enemyId={enemyId}
            tacticId={tacticId}
            seed={battleSeed}
            preferLive={preferLive}
            aiAvailable={Boolean(health?.aiAvailable)}
            onFinish={handleBattleFinish}
            onExit={() => setScreen('card')}
          />
        ) : null}

        {screen === 'result' && battleResult && activeMonster ? (
          <ResultView
            battle={battleResult}
            monster={activeMonster}
            enemy={enemy}
            onRematch={() => {
              startBattle(activeMonster.id, enemyId, battleResult.tactic ?? tacticId);
            }}
            onReplay={() => {
              startBattle(activeMonster.id, enemyId, battleResult.tactic ?? tacticId, battleResult.seed);
            }}
            onRecapture={resetToCapture}
            onGallery={() => setScreen('gallery')}
            onCard={() => setScreen('card')}
          />
        ) : null}

        {screen === 'gallery' ? (
          <GalleryView
            monsters={gallery}
            activeId={activeMonster?.id ?? null}
            onSelect={(id) => setCurrent(gallery.find((m) => m.id === id) ?? null)}
            onBattle={(id) => startBattle(id, enemyId)}
            onDelete={handleDelete}
            onRecapture={resetToCapture}
            onOpen={(id) => {
              setCurrent(gallery.find((m) => m.id === id) ?? null);
              setScreen('card');
            }}
          />
        ) : null}
      </main>

      <footer className="colophon">
        <span>原创虚构原型 · 非学校官方服务 · 精灵与角色均为虚构</span>
        <span>
          照片仅在本机处理 · 图鉴数据存在本地浏览器 ·{' '}
          <button type="button" className="log-toggle" onClick={() => setLogOpen((v) => !v)}>
            调用记录 {logs.length}
          </button>
        </span>
      </footer>

      {logOpen ? (
        <div className="log-panel" style={{ width: 'min(1180px, 100%)' }}>
          {logs.length === 0 ? (
            <p className="log-empty">还没有调用记录。演示模式不会请求模型，记录会标注为 demo。</p>
          ) : (
            logs.map((entry) => (
              <div className="log-row" key={entry.requestId} data-ok={entry.ok}>
                <span>{new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <span>{modeLabel(entry.mode)}</span>
                <span>{entry.note}</span>
                <span>{entry.latencyMs}ms</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      <AnalyzeModal
        open={Boolean(analyzing)}
        title={analyzing?.title ?? ''}
        step={analyzing?.step ?? 0}
        preferLive={preferLive}
        slow={slow}
        onSkip={skipToLocal}
        onCancel={cancelAnalyze}
      />

      {toast ? (
        <div className="toast" data-tone={toast.tone} role="status">
          {toast.message}
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {screen === 'battle' && activeMonster
          ? `正在与${enemy.name}对战，${ELEMENTS[enemy.element].name}属性`
          : ''}
      </div>
    </div>
  );
}
