import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, JSX, RefObject } from "react";
import { motion } from "framer-motion";
import { ApiError, bootGame, clearGameId, createGame, loadGameId, playTurn, saveGameId } from "./api";
import type { GameStatus, PlayerView, Suggestion, ToolLogEntry } from "./api";
import { ActionForm } from "./components/ActionForm";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { StoryFeed, createTurnId, type Turn } from "./components/StoryFeed";
import { Suggestions } from "./components/Suggestions";
import { BootScreen, type BootPhase } from "./components/BootScreen";

interface LoadedGame {
  gameId: string;
  commitment: string;
  view: PlayerView;
  status: GameStatus;
}

export function openingTurn(narration: string, toolLog: ToolLogEntry[]): Turn {
  return { id: createTurnId(), playerText: null, narration, toolLog };
}

function freshTurn(playerText: string | null, narration: string, toolLog: ToolLogEntry[]): Turn {
  return { id: createTurnId(), playerText, narration, toolLog };
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
  const [booting, setBooting] = useState(true);
  const [bootPhase, setBootPhase] = useState<BootPhase>("loading");
  const [bootFresh, setBootFresh] = useState<boolean>(true);
  const [bootCommitment, setBootCommitment] = useState<string | null>(null);
  const [bootSlow, setBootSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const gameRef = useRef<LoadedGame | null>(null);
  const storyScrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const bootSeq = useRef(0);
  gameRef.current = game;

  const applyGameData = useCallback(
    (g: { gameId: string; commitment: string; view: PlayerView; status: GameStatus }, fresh: boolean, narration: string | null, toolLog: ToolLogEntry[], sug: Suggestion[]): void => {
      saveGameId(g.gameId);
      setGame({ gameId: g.gameId, commitment: g.commitment, view: g.view, status: g.status });
      if (fresh && narration !== null) {
        setTurns([freshTurn(null, narration, toolLog)]);
      } else if (!fresh && narration !== null) {
        setTurns([openingTurn(narration, toolLog)]);
      } else {
        setTurns([]);
      }
      setLedger(toolLog);
      setSuggestions(sug);
    },
    [],
  );

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
        applyGameData(g, true, g.narration, g.toolLog, g.suggestions);
      } else if ("openingNarration" in g) {
        const narration = g.openingNarration;
        if (typeof narration === "string" && narration.length > 0) {
          applyGameData(g, false, narration, g.openingToolLog, g.suggestions);
        } else {
          applyGameData(g, false, null, [], g.suggestions);
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
    busyRef.current = true;
    setBusy(true);
    const pendingId = createTurnId();
    // Optimistic: player line + pending placeholder right away, same style.
    setTurns((prev) => [...prev, { id: pendingId, playerText: clean, narration: "", toolLog: [], pending: true }]);
    const gameId = current.gameId;
    try {
      const res = await playTurn(gameId, clean);
      // Replace by id: never duplicate the player line, placeholder becomes real narration.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === pendingId ? { id: pendingId, playerText: clean, narration: res.narration, toolLog: res.toolLog } : t,
        ),
      );
      setLedger((prev) => [...prev, ...res.toolLog]);
      setSuggestions(res.suggestions);
      setGame((prev) => (prev === null ? prev : { ...prev, view: res.view, status: res.status }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Expired or missing game only: fall back to a fresh game; keep global handling.
        clearGameId();
        try {
          const fresh = await createGame();
          applyGameData(fresh, true, fresh.narration, fresh.toolLog, fresh.suggestions);
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
  }, [applyGameData]);

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
      applyGameData(fresh, true, fresh.narration, fresh.toolLog, fresh.suggestions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a new game.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyGameData]);

  const over = game !== null && game.status !== "playing";
  const won = game !== null && game.status === "won";

  return AppLayout({
    game, turns, ledger, suggestions, busy, booting, bootPhase, bootFresh, bootCommitment, bootSlow, error, over, won, storyScrollRef, onStoryScroll: handleStoryScroll, sendAction, retryTurn, retryBoot: boot, newGame,
  });
}

interface LayoutArgs {
  game: LoadedGame | null;
  turns: Turn[];
  ledger: ToolLogEntry[];
  suggestions: Suggestion[];
  busy: boolean;
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
  retryBoot: () => Promise<void>;
  newGame: () => Promise<void>;
}

function AppLayout(args: LayoutArgs): JSX.Element {
  const { game, turns, ledger, suggestions, busy, booting, bootPhase, bootFresh, bootCommitment, bootSlow, error, over, won, storyScrollRef, onStoryScroll, sendAction, retryTurn, retryBoot, newGame } = args;
  return (
    <div className="wyrd-app" style={appShellStyle}>
      <div className="wyrd-app-inner" style={appInnerStyle}>
        {game !== null && <Header commitment={game.commitment} />}
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
        {over && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="panel-cut" style={bannerStyle(won)}>
            <div className="font-title" style={bannerTitle(won)}>{won ? "Won" : "Lost"}</div>
            <div className="font-story" style={bannerSub}>
              {won ? "The gate gives way. Your wyrd holds." : "The crypt keeps you. Your thread runs out."}
            </div>
            <button type="button" className="wyrd-btn" onClick={() => void newGame()} disabled={busy} style={newGameStyle}>
              New game
            </button>
          </motion.div>
        )}
        {game !== null && !booting && (
          <div className="wyrd-board" style={boardStyle}>
            <main className="wyrd-main" style={mainStyle}>
              <div
                ref={storyScrollRef}
                onScroll={onStoryScroll}
                aria-live="polite"
                className="wyrd-story-scroll"
                style={storyScrollStyle}
              >
                <StoryFeed turns={turns} onRetry={(id, text) => void retryTurn(id, text)} />
              </div>
              {!over && (
                <div style={pinnedBarStyle}>
                  <Suggestions suggestions={suggestions} disabled={busy} onPick={(t) => void sendAction(t)} />
                  <ActionForm disabled={busy} onSubmit={(t) => void sendAction(t)} />
                </div>
              )}
            </main>
            <Sidebar view={game.view} status={game.status} ledger={ledger} />
          </div>
        )}
      </div>
    </div>
  );
}

const runeStyle: CSSProperties = { color: "#5B4A66", fontSize: 14, letterSpacing: "1.2em", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" };
const alertStyle: CSSProperties = { background: "#1A1421", borderLeft: "4px solid #FF6B5B", padding: "12px 16px", fontSize: 14 };
const appShellStyle: CSSProperties = { minHeight: "100dvh", background: "#120E17", color: "#F4EFF6", display: "flex", flexDirection: "column" };
const appInnerStyle: CSSProperties = { width: "100%", maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, padding: "24px 28px 32px", flex: 1, minHeight: 0 };
const boardStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 24, flex: 1, minHeight: 0 };
const mainStyle: CSSProperties = { flex: "999 1 620px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 };
const storyScrollStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16, paddingRight: 4 };
const pinnedBarStyle: CSSProperties = { flexShrink: 0, background: "#1A1421", borderTop: "1px solid #5A4A68", padding: 12, display: "flex", flexDirection: "column", gap: 12 };
const newGameStyle: CSSProperties = { background: "#B44DFF", color: "#120E17", marginLeft: "auto" };
const bannerSub: CSSProperties = { fontSize: 17, color: "#B9AEC0", fontStyle: "italic" };

function bannerStyle(won: boolean): CSSProperties {
  return {
    background: "#1A1421",
    borderLeft: won ? "6px solid #4DE8B5" : "6px solid #FF6B5B",
    padding: "18px 22px",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  };
}

function bannerTitle(won: boolean): CSSProperties {
  return { fontSize: 34, color: won ? "#4DE8B5" : "#FF6B5B" };
}





