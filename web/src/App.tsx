import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, JSX, RefObject } from "react";
import { motion } from "framer-motion";
import { ApiError, bootGame, clearGameId, createGame, fetchGame, playTurn, saveGameId } from "./api";
import type { GameStatus, PlayerView, Suggestion, ToolLogEntry } from "./api";
import { ActionForm } from "./components/ActionForm";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { StoryFeed, type Turn } from "./components/StoryFeed";
import { Suggestions } from "./components/Suggestions";

interface LoadedGame {
  gameId: string;
  commitment: string;
  view: PlayerView;
  status: GameStatus;
}

export function openingTurn(narration: string, toolLog: ToolLogEntry[]): Turn {
  return { playerText: null, narration, toolLog };
}

function freshTurn(playerText: string | null, narration: string, toolLog: ToolLogEntry[]): Turn {
  return { playerText, narration, toolLog };
}

export function App(): JSX.Element {
  const [game, setGame] = useState<LoadedGame | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ledger, setLedger] = useState<ToolLogEntry[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const gameRef = useRef<LoadedGame | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  gameRef.current = game;

  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      try {
        const res = await bootGame();
        if (cancelled) return;
        const g = res.game;
        setGame({ gameId: g.gameId, commitment: g.commitment, view: g.view, status: g.status });
        if (res.fresh && "narration" in g) {
          setTurns([freshTurn(null, g.narration, g.toolLog)]);
          setLedger(g.toolLog);
        } else if ("openingNarration" in g) {
          const narration = g.openingNarration;
          if (typeof narration === "string" && narration.length > 0) {
            setTurns([openingTurn(narration, g.openingToolLog)]);
            setLedger(g.openingToolLog);
          } else {
            setTurns([]);
            setLedger([]);
          }
        } else {
          setTurns([]);
          setLedger([]);
        }
        setSuggestions(g.suggestions);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "The game master is unavailable.");
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = feedRef.current;
    if (el === null) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [turns.length, busy]);

  const applyFresh = useCallback((g: { gameId: string; commitment: string; view: PlayerView; status: GameStatus; narration: string; toolLog: ToolLogEntry[]; suggestions: Suggestion[] }): void => {
    saveGameId(g.gameId);
    setGame({ gameId: g.gameId, commitment: g.commitment, view: g.view, status: g.status });
    setTurns([freshTurn(null, g.narration, g.toolLog)]);
    setLedger(g.toolLog);
    setSuggestions(g.suggestions);
  }, []);

  const sendAction = useCallback(async (text: string): Promise<void> => {
    const current = gameRef.current;
    if (busyRef.current || current === null || current.status !== "playing") return;
    const clean = text.trim().slice(0, 500);
    if (clean.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await playTurn(current.gameId, clean);
      setTurns((prev) => [...prev, freshTurn(clean, res.narration, res.toolLog)]);
      setLedger((prev) => [...prev, ...res.toolLog]);
      setSuggestions(res.suggestions);
      setGame((prev) => (prev === null ? prev : { ...prev, view: res.view, status: res.status }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        clearGameId();
        try {
          applyFresh(await createGame());
        } catch {
          setError("That game is gone — starting a new one failed. Press New game.");
        }
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
        try {
          const resumed = await fetchGame(current.gameId);
          setGame((prev) => (prev === null ? prev : { ...prev, view: resumed.view, status: resumed.status }));
          setSuggestions(resumed.suggestions);
        } catch {
          /* keep last good view */
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyFresh]);

  const newGame = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      clearGameId();
      applyFresh(await createGame());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a new game.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyFresh]);

  const over = game !== null && game.status !== "playing";
  const won = game !== null && game.status === "won";

  return AppLayout({
    game, turns, ledger, suggestions, busy, booting, error, over, won, feedRef, sendAction, newGame,
  });
}

interface LayoutArgs {
  game: LoadedGame | null;
  turns: Turn[];
  ledger: ToolLogEntry[];
  suggestions: Suggestion[];
  busy: boolean;
  booting: boolean;
  error: string | null;
  over: boolean;
  won: boolean;
  feedRef: RefObject<HTMLDivElement | null>;
  sendAction: (text: string) => Promise<void>;
  newGame: () => Promise<void>;
}

function AppLayout(args: LayoutArgs): JSX.Element {
  const { game, turns, ledger, suggestions, busy, booting, error, over, won, feedRef, sendAction, newGame } = args;
  return (
    <div style={{ minHeight: "100vh", background: "#120E17", color: "#F4EFF6", padding: "24px 28px 32px" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {game !== null && <Header commitment={game.commitment} />}
        <div className="font-rune" aria-hidden="true" style={runeStyle}>
          ᚹ ᚣ ᚱ ᛞ ᛫ ᚠ ᚨ ᛏ ᛖ ᛫ ᚹ ᚣ ᚱ ᛞ ᛫ ᚠ ᚨ ᛏ ᛖ ᛫ ᚹ ᚣ ᚱ ᛞ
        </div>
        {booting && <div className="font-story" style={bootStyle}>The seal is being pressed…</div>}
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
            <main style={mainStyle}>
              <div aria-live="polite" style={feedStyle}>
                <StoryFeed turns={turns} />
                <div ref={feedRef} aria-hidden="true" style={feedAnchorStyle} />
              </div>
              {!over && (
                <div style={stickyBarStyle}>
                  <Suggestions suggestions={suggestions} disabled={busy} onPick={(t) => void sendAction(t)} />
                  <ActionForm disabled={busy} onSubmit={(t) => void sendAction(t)} />
                </div>
              )}
              {busy && <div className="font-story" style={busyStyle}>The game master weighs your fate…</div>}
            </main>
            <Sidebar view={game.view} status={game.status} ledger={ledger} />
          </div>
        )}
      </div>
      <style>{`@media (max-width: 900px){ .wyrd-board{ flex-direction: column; } }`}</style>
    </div>
  );
}

const runeStyle: CSSProperties = { color: "#5B4A66", fontSize: 14, letterSpacing: "1.2em", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" };
const bootStyle: CSSProperties = { fontSize: 18, color: "#B9AEC0", fontStyle: "italic" };
const alertStyle: CSSProperties = { background: "#1A1421", borderLeft: "4px solid #FF6B5B", padding: "12px 16px", fontSize: 14 };
const boardStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" };
const mainStyle: CSSProperties = { flex: "999 1 620px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 };
const feedStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const feedAnchorStyle: CSSProperties = { height: 1, scrollMarginBottom: 160 };
const stickyBarStyle: CSSProperties = { position: "sticky", bottom: 0, background: "#1A1421", borderTop: "1px solid #5A4A68", padding: 12, display: "flex", flexDirection: "column", gap: 12 };
const busyStyle: CSSProperties = { fontSize: 15, color: "#B9AEC0", fontStyle: "italic" };
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





