import { describe, expect, it, vi } from "vitest";
import { openingTurn } from "./App";
import type { ToolLogEntry } from "./api";

describe("openingTurn", () => {
  it("hides the automatic look-around player text", () => {
    const toolLog: ToolLogEntry[] = [];
    const turn = openingTurn("Dark steps descend.", toolLog);
    expect(turn.playerText).toBeNull();
    expect(turn.narration).toBe("Dark steps descend.");
    expect(turn.toolLog).toBe(toolLog);
  });

  it("stays buildable without localStorage or matchers", () => {
    vi.stubGlobal("localStorage", undefined);
    const turn = openingTurn("Cold air.", []);
    expect(turn.playerText).toBeNull();
    vi.unstubAllGlobals();
  });
});