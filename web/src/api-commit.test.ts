import { describe, expect, it, vi, afterEach } from "vitest";
import { loadCommitment, resolveStoredCommitment } from "./api-commit";

function stubStorage(initial: Record<string, string>): Map<string, string> {
  const store = new Map<string, string>(Object.entries(initial));
  const ls = {
    getItem: (k: string): string | null => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string): void => {
      store.set(k, String(v));
    },
    removeItem: (k: string): void => {
      store.delete(k);
    },
    clear: (): void => {
      store.clear();
    },
  };
  vi.stubGlobal("window", { localStorage: ls });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveStoredCommitment", () => {
  it("first save stores the server commitment with no mismatch", () => {
    const store = stubStorage({});
    const res = resolveStoredCommitment("game-1", "commit-aaa");
    expect(res).toEqual({ stored: "commit-aaa", sealMismatch: false });
    expect(store.get("wyrd.commitment.game-1")).toBe("commit-aaa");
    expect(loadCommitment("game-1")).toBe("commit-aaa");
  });

  it("resume with the same commitment keeps it with no mismatch", () => {
    const store = stubStorage({ "wyrd.commitment.game-1": "commit-aaa" });
    const res = resolveStoredCommitment("game-1", "commit-aaa");
    expect(res).toEqual({ stored: "commit-aaa", sealMismatch: false });
    expect(store.get("wyrd.commitment.game-1")).toBe("commit-aaa");
  });

  it("resume with a different commitment keeps the stored one and flags mismatch", () => {
    const store = stubStorage({ "wyrd.commitment.game-1": "commit-aaa" });
    const res = resolveStoredCommitment("game-1", "commit-bbb");
    expect(res).toEqual({ stored: "commit-aaa", sealMismatch: true });
    expect(store.get("wyrd.commitment.game-1")).toBe("commit-aaa");
  });
});
