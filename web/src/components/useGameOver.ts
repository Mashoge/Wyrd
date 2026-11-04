import { useEffect, useState } from "react";
import { fetchReveal } from "../reveal-api";
import { hashReveal, matchesStoredCommitment } from "../verify";
import type { RevealResponse } from "../verify";

export type GameOverPhase = "loading" | "verified" | "broken" | "error";

export interface GameOverState {
  phase: GameOverPhase;
  reveal: RevealResponse | null;
  browserHash: string | null;
  canonical: string | null;
}

export function useGameOver(
  gameId: string,
  storedCommitment: string | null,
  sealMismatch: boolean,
): GameOverState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<GameOverPhase>("loading");
  const [reveal, setReveal] = useState<RevealResponse | null>(null);
  const [browserHash, setBrowserHash] = useState<string | null>(null);
  const [canonical, setCanonical] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setReveal(null);
    setBrowserHash(null);
    setCanonical(null);
    void (async () => {
      try {
        const data = await fetchReveal(gameId);
        if (cancelled) return;
        const { canonical: canon, hash } = await hashReveal(data);
        if (cancelled) return;
        const baseline = storedCommitment ?? data.commitment;
        setReveal(data);
        setBrowserHash(hash);
        setCanonical(canon);
        if (sealMismatch) {
          setPhase("broken");
        } else {
          setPhase(matchesStoredCommitment(hash, baseline) ? "verified" : "broken");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, attempt, storedCommitment, sealMismatch]);

  return { phase, reveal, browserHash, canonical, retry: () => setAttempt((n) => n + 1) };
}
