import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, JSX, RefObject } from "react";
import { ApiError, bootGame, clearGameId, createGame, loadGameId, playTurn, saveGameId } from "./api";
import type { GameMap, GameStatus, PlayerView, Suggestion, ToolLogEntry, TurnMeta } from "./api";
import { ActionForm } from "./components/ActionForm";
import { Header } from "./components/Header";
import { Inspector, type InspectorTurn } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { loadCommitment, resolveStoredCommitment } from "./api-commit";
import { GameOver } from "./components/GameOver";
import { StoryFeed, createTurnId, type Turn } from "./components/StoryFeed";
import { Suggestions } from "./components/Suggestions";
import { BootScreen, type BootPhase } from "./components/BootScreen";
import { TipQueue, detectTips, hasSeenIntro, type Tip } from "./guidance";
import { IntroModal } from "./components/IntroModal";
import { HelpPanel } from "./components/HelpPanel";
import { TipCard } from "./components/TipCard";

const INSPECTOR_STORAGE_KEY = "wyrd.inspector";

function loadInspectorPref(): boolean {
  try {
    return window.localStorage.getItem(INSPECTOR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveInspectorPref(on: boolean): void {
  try {
    window.localStorage.setItem(INSPECTOR_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* inspector toggle still works for this visit */
  }
}

interface LoadedGame {
  gameId: string;
  commitment: string;
  storedCommitment: string | null;
  sealMismatch: boolean;
  verified: boolean;
  view: PlayerView;
  status: GameStatus;
  map: GameMap;
}

export function openingTurn(narration: string, toolLog: ToolLogEntry[], meta: TurnMeta | null = null): Turn {
  return { id: createTurnId(), playerText: null, narration, toolLog, meta };
}

function freshTurn(playerText: string | null, narration: string, toolLog: ToolLogEntry[], meta: TurnMeta | null = null): Turn {
  return { id: createTurnId(), playerText, narration, toolLog, meta };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function App(): JSX.Element {
  const [game, setGame] = useState<LoadedGame | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ledger, setLedger] = useState<ToolLogEntry[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [inspectorOn, setInspectorOn] = useState<boolean>(() => loadInspectorPref());
  const [booting, setBooting] = useState(true);
  const [bootPhase, setBootPhase] = useState<BootPhase>("loading");
  const [bootFresh, setBootFresh] = useState<boolean>(true);
  const [bootCommitment, setBootCommitment] = useState<string | null>(null);
  const [bootSlow, setBootSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tipQueue] = useState<TipQueue>(() => new TipQueue());
  const [currentTip, setCurrentTip] = useState<Tip | null>(null);
  const [guidanceTick, setGuidanceTick] = useState(0);
  // Guidance: tip entries accumulate across turns; only successful turns add.
  const guidanceEntriesRef = useRef<ToolLogEntry[]>([]);
  // True while the first-view intro is up, so tips do not pop in behind it.
  const introSeenRef = useRef<boolean>(hasSeenIntro());
  const [introEverClosed, setIntroEverClosed] = useState<boolean>(introSeenRef.current);
  const busyRef = useRef(false);
  const gameRef = useRef<LoadedGame | null>(null);
  const storyScrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const forceScrollRef = useRef(false);
  const bootSeq = useRef(0);
  gameRef.current = game;

  const applyGameData = useCallback(
    (g: { gameId: string; commitment: string; view: PlayerView; status: GameStatus; map?: GameMap }, fresh: boolean, narration: string | null, toolLog: ToolLogEntry[], sug: Suggestion[], meta: TurnMeta | null = null): void => {
      saveGameId(g.gameId);
      const resolved = resolveStoredCommitment(g.gameId, g.commitment);
      setGame((prev) => ({ gameId: g.gameId, commitment: g.commitment, storedCommitment: resolved.stored, sealMismatch: resolved.sealMismatch, verified: prev !== null && prev.gameId === g.gameId ? prev.verified : false, view: g.view, status: g.status, map: g.map ?? { rooms: [], links: [], unexplored: [] } }));
      if (fresh && narration !== null) {
        setTurns([freshTurn(null, narration, toolLog, meta)]);
      } else if (!fresh && narration !== null) {
        setTurns([openingTurn(narration, toolLog, meta)]);
      } else {
        setTurns([]);
      }
      setLedger(toolLog);
      setSuggestions(sug);
    },
    [],
  );

  // First visit only: show the intro once the boot screen finishes.
  useEffect(() => {
    if (!booting && game !== null && !introSeenRef.current) setIntroOpen(true);
  }, [booting, game]);

  // Tip detection: runs when the game state changes (view / status / turns).
  useEffect(() => {
    if (game === null || booting || !introEverClosed) return;
    tipQueue.offer(detectTips({ entries: guidanceEntriesRef.current, view: game.view, over: game.status !== "playing" }));
    setCurrentTip(tipQueue.currentTip());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, booting, introEverClosed, guidanceTick]);

  const closeTip = useCallback((): void => {
    tipQueue.closeCurrent();
    setCurrentTip(tipQueue.currentTip());
  }, [tipQueue]);

  const closeIntro = useCallback((): void => {
    introSeenRef.current = true;
    setIntroOpen(false);
    setIntroEverClosed(true);
    // Then returns to the input.
    if (typeof document !== "undefined") {
      const el = document.getElementById("wyrd-action");
      if (el !== null && typeof (el as HTMLInputElement).focus === "function") {
        (el as HTMLInputElement).focus();
      }
    }
  }, []);

  const openHelp = useCallback((): void => setHelpOpen(true), []);
  const closeHelp = useCallback((): void => setHelpOpen(false), []);

  const toggleInspector = useCallback((): void => {
    setInspectorOn((prev) => {
      const next = !prev;
      saveInspectorPref(next);
      return next;
    });
  }, []);

  const boot = useCallback(async (): Promise<void> => {
    const seq = bootSeq.current + 1;
    bootSeq.current = seq;
    const isCurrent = (): boolean => bootSeq.current === seq;
    setBooting(true);
    setBootPhase("loading");
    setBootCommitment(null);
    setBootSlow(false);
    setError(null);
    let initialFresh = true;
    try {
      initialFresh = loadGameId() === null;
    } catch {
      initialFresh = true;
    }
    setBootFresh(initialFresh);
    const start = Date.now();
    const slowTimer = setTimeout(() => {
      if (isCurrent()) setBootSlow(true);
    }, 5000);
    try {
      const res = await bootGame();
      if (!isCurrent()) {
        clearTimeout(slowTimer);
        return;
      }
      clearTimeout(slowTimer);
      const g = res.game;
      const elapsed = Date.now() - start;
      const hold = Math.max(700, 900 - elapsed);
      setBootFresh(res.fresh);
      setBootCommitment(g.commitment);
      if (res.fresh && "narration" in g) {
        applyGameData(g, true, g.narration, g.toolLog, g.suggestions, g.meta);
      } else if ("openingNarration" in g) {
        const narration = g.openingNarration;
        if (typeof narration === "string" && narration.length > 0) {
          applyGameData(g, false, narration, g.openingToolLog, g.suggestions, g.openingMeta);
        } else {
          applyGameData(g, false, null, [], g.suggestions, g.openingMeta);
        }
      } else {
        applyGameData(g, false, null, [], g.suggestions);
      }
      setBootPhase("sealed");
      await delay(hold);
      if (!isCurrent()) return;
      setBooting(false);
    } catch (err) {
      clearTimeout(slowTimer);
      if (!isCurrent()) return;
      const elapsed = Date.now() - start;
      const wait = Math.max(0, 900 - elapsed);
      await delay(wait);
      if (!isCurrent()) return;
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("The game master is unavailable.");
      }
      setBootPhase("error");
    }
  }, [applyGameData]);

  useEffect(() => {
    void boot();
    return () => {
      bootSeq.current += 1;
    };
  }, [boot]);

  useEffect(() => {
    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      const el = storyScrollRef.current;
      if (el !== null) {
        el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      } else if (typeof window !== "undefined") {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      }
      stickRef.current = true;
      return;
    }
    const el = storyScrollRef.current;
    if (el === null) return;
    const desktop =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (desktop) {
      if (!stickRef.current) return;
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
      return;
    }
    if (!stickRef.current) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [turns, busy]);

  const handleStoryScroll = useCallback((): void => {
    const el = storyScrollRef.current;
    if (el === null) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  }, []);

  const sendAction = useCallback(async (text: string): Promise<void> => {
    const current = gameRef.current;
    if (busyRef.current || current === null || current.status !== "playing") return;
    const clean = text.trim().slice(0, 500);
    if (clean.length === 0) return;
    // A showing tip closes automatically after the player's next action.
    if (tipQueue.currentId !== null) closeTip();
    busyRef.current = true;
    setBusy(true);
    const pendingId = createTurnId();
    // Player action: always jump to the bottom even if they had scrolled up.
    stickRef.current = true;
    forceScrollRef.current = true;
    // Optimistic: player line + pending placeholder right away, same style.
    setTurns((prev) => [...prev, { id: pendingId, playerText: clean, narration: "", toolLog: [], pending: true }]);
    const gameId = current.gameId;
    try {
      const res = await playTurn(gameId, clean);
      guidanceEntriesRef.current = [...guidanceEntriesRef.current, ...res.toolLog];
      setGuidanceTick((t) => t + 1);
      // Replace by id: never duplicate the player line, placeholder becomes real narration.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === pendingId ? { id: pendingId, playerText: clean, narration: res.narration, toolLog: res.toolLog, meta: res.meta } : t,
        ),
      );
      setLedger((prev) => [...prev, ...res.toolLog]);
      setSuggestions(res.suggestions);
      setGame((prev) => (prev === null ? prev : { ...prev, view: res.view, status: res.status, map: res.map }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Expired or missing game only: fall back to a fresh game; keep global handling.
        clearGameId();
        try {
          const fresh = await createGame();
          applyGameData(fresh, true, fresh.narration, fresh.toolLog, fresh.suggestions, fresh.meta);
        } catch {
          setTurns((prev) =>
            prev.map((t) => (t.id === pendingId ? { ...t, pending: false, failed: true } : t)),
          );
          setError("That game is gone — starting a new one failed. Press New game.");
        }
      } else {
        // Ordinary turn failures (429, network, …): inline retry only, no global alert/resume.
        setTurns((prev) =>
          prev.map((t) => (t.id === pendingId ? { ...t, pending: false, failed: true } : t)),
        );
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyGameData, closeTip, tipQueue]);

  const retryTurn = useCallback(
    async (id: string, text: string): Promise<void> => {
      if (busyRef.current) return;
      // Remove the failed turn, then append a fresh pending turn (one player line, never stacked).
      setTurns((prev) => prev.filter((t) => t.id !== id));
      await sendAction(text);
    },
    [sendAction],
  );

  const newGame = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      clearGameId();
      const fresh = await createGame();
      applyGameData(fresh, true, fresh.narration, fresh.toolLog, fresh.suggestions, fresh.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a new game.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyGameData]);

  const markVerified = useCallback((): void => { setGame((prev) => (prev === null ? prev : { ...prev, verified: true })); }, []);
  const over = game !== null && game.status !== "playing";
  const won = game !== null && game.status === "won";

  // When the game ends no new turn is appended, so pin the story to the reveal.
  useEffect(() => {
    if (!over) return;
    stickRef.current = true;
    const target = storyScrollRef.current;
    if (target === null) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollTo({ top: target.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [over]);

  return AppLayout({
    game, turns, ledger, suggestions, busy, inspectorOn, booting, bootPhase, bootFresh, bootCommitment, bootSlow, error, over, won, storyScrollRef, onStoryScroll: handleStoryScroll, sendAction, retryTurn, retryBoot: boot, newGame, markVerified, onToggleInspector: toggleInspector,
    introOpen, helpOpen, currentTip, onCloseIntro: closeIntro, onOpenHelp: openHelp, onCloseHelp: closeHelp, onCloseTip: closeTip,
  });
}

interface LayoutArgs {
  game: LoadedGame | null;
  turns: Turn[];
  ledger: ToolLogEntry[];
  suggestions: Suggestion[];
  busy: boolean;
  inspectorOn: boolean;
  booting: boolean;
  bootPhase: BootPhase;
  bootFresh: boolean;
  bootCommitment: string | null;
  bootSlow: boolean;
  error: string | null;
  over: boolean;
  won: boolean;
  storyScrollRef: RefObject<HTMLDivElement | null>;
  onStoryScroll: () => void;
  sendAction: (text: string) => Promise<void>;
  retryTurn: (id: string, text: string) => Promise<void>;
  retryBoot: () => Promise<void>; markVerified: () => void;
  newGame: () => Promise<void>;
  onToggleInspector: () => void;
  introOpen: boolean;
  helpOpen: boolean;
  currentTip: Tip | null;
  onCloseIntro: () => void;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  onCloseTip: () => void;
}

function AppLayout(args: LayoutArgs): JSX.Element {
  const { game, turns, ledger, suggestions, busy, inspectorOn, booting, bootPhase, bootFresh, bootCommitment, bootSlow, error, over, won, storyScrollRef, onStoryScroll, sendAction, retryTurn, retryBoot, newGame, markVerified, onToggleInspector, introOpen, helpOpen, currentTip, onCloseIntro, onOpenHelp, onCloseHelp, onCloseTip } = args;
  const inspectorTurns: InspectorTurn[] = turns
    .filter((t) => !t.pending && !t.failed)
    .map((t) => ({ id: t.id, playerText: t.playerText, toolLog: t.toolLog, meta: t.meta ?? null }));
  return (
    <div className="wyrd-app">
      <div className="wyrd-app-inner">
        {game !== null && <Header commitment={game.commitment} verified={game.verified} inspectorOn={inspectorOn} onToggleInspector={onToggleInspector} onOpenHelp={onOpenHelp} />}
        <div className="font-rune" aria-hidden="true" style={runeStyle}>
          ᚹ ᚣ ᚱ ᛞ ᛫ ᚠ ᚨ ᛏ ᛖ ᛫ ᚹ ᚣ ᚱ ᛞ ᛫ ᚠ ᚨ ᛏ ᛖ ᛫ ᚹ ᚣ ᚱ ᛞ
        </div>
        {booting && (
          <BootScreen
            phase={bootPhase === "error" ? "error" : bootPhase === "sealed" ? "sealed" : "loading"}
            isFresh={bootFresh}
            commitment={bootCommitment}
            showSlowHint={bootSlow}
            onRetry={() => void retryBoot()}
          />
        )}
        {error !== null && !booting && (
          <div role="alert" style={alertStyle}>{error}</div>
        )}
        {game !== null && !booting && (
          <div className="wyrd-board">
            <main className="wyrd-main">
              <div
                ref={storyScrollRef}
                onScroll={onStoryScroll}
                aria-live="polite"
                className="wyrd-story-scroll"
              >
                <StoryFeed turns={turns} onRetry={(id, text) => void retryTurn(id, text)} />
                {inspectorOn && (
                  <div className="wyrd-inspector-below">
                    <Inspector turns={inspectorTurns} />
                  </div>
                )}
                {over && game !== null && (
                  <GameOver gameId={game.gameId} storedCommitment={game.storedCommitment ?? loadCommitment(game.gameId) ?? game.commitment} sealMismatch={game.sealMismatch} won={won} onVerified={markVerified} />
                )}
                {over && (
                  <div className="panel-cut" style={bannerRowStyle}>
                    <div style={newGameRow}>
                      <button type="button" className="wyrd-btn" onClick={() => void newGame()} disabled={busy} style={newGameStyle}>
                        New game
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {!over && (
                <div style={pinnedBarStyle}>
                  <TipCard tip={currentTip} onClose={onCloseTip} />
                  <Suggestions suggestions={suggestions} disabled={busy} onPick={(t) => void sendAction(t)} view={game.view} />
                  <ActionForm disabled={busy} gameId={game.gameId} onSubmit={(t) => void sendAction(t)} />
                </div>
              )}
              {over && <TipCard tip={currentTip} onClose={onCloseTip} />}
            </main>
            <Sidebar view={game.view} status={game.status} ledger={ledger} map={game.map} />
            {inspectorOn && (
              <div className="wyrd-inspector-side">
                <Inspector turns={inspectorTurns} />
              </div>
            )}
          </div>
        )}
        <IntroModal open={introOpen} onClose={onCloseIntro} />
        <HelpPanel open={helpOpen} onClose={onCloseHelp} />
      </div>
    </div>
  );
}

const runeStyle: CSSProperties = { color: "#5B4A66", fontSize: 14, letterSpacing: "1.2em", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" };
const alertStyle: CSSProperties = { background: "#1A1421", borderLeft: "4px solid #FF6B5B", padding: "12px 16px", fontSize: 14 };
const pinnedBarStyle: CSSProperties = { flexShrink: 0, background: "#1A1421", borderTop: "1px solid #5A4A68", padding: 12, display: "flex", flexDirection: "column", gap: 12 };
const bannerRowStyle: CSSProperties = { background: "#1A1421", padding: "14px 22px", display: "flex", justifyContent: "flex-end" };
const newGameStyle: CSSProperties = { background: "#B44DFF", color: "#120E17", marginLeft: "auto" };
const newGameRow: CSSProperties = { display: "flex", justifyContent: "flex-end" };






