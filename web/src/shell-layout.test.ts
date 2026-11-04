import { describe, expect, it } from "vitest";
// @ts-ignore - node builtins are available in the vitest node runtime; web tsconfig only includes vite/client types
import { readFileSync } from "node:fs";
// @ts-ignore - node builtins are available in the vitest node runtime; web tsconfig only includes vite/client types
import { dirname, join } from "node:path";
// @ts-ignore - node builtins are available in the vitest node runtime; web tsconfig only includes vite/client types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, "App.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "index.css"), "utf8");
const sidebarSrc = readFileSync(join(here, "components", "Sidebar.tsx"), "utf8");

describe("desktop app-shell layout (no inline override of media queries)", () => {
  it("has no inline flexWrap/flexDirection that would beat the desktop media query", () => {
    expect(appSrc).not.toContain("flexWrap");
    expect(appSrc).not.toContain("appShellStyle");
    expect(appSrc).not.toContain("appInnerStyle");
    expect(appSrc).not.toContain("boardStyle");
    expect(appSrc).not.toContain("mainStyle");
    expect(appSrc).not.toContain("storyScrollStyle");
    expect(sidebarSrc).not.toContain("flex:");
    expect(sidebarSrc).not.toContain("flexDirection");
  });

  it("drives the shell from index.css so media queries win on desktop", () => {
    expect(cssSrc).toContain(".wyrd-app {");
    expect(cssSrc).toContain(".wyrd-app-inner {");
    expect(cssSrc).toContain(".wyrd-board {");
    expect(cssSrc).toContain(".wyrd-main {");
    expect(cssSrc).toContain(".wyrd-story-scroll {");
    expect(cssSrc).toContain(".wyrd-sidebar {");
    expect(cssSrc).toContain("@media (min-width: 1024px)");
    const desktop = cssSrc.slice(cssSrc.indexOf("@media (min-width: 1024px)"));
    expect(desktop).toContain("flex-wrap: nowrap");
    expect(desktop).toContain("overflow-y: auto");
    expect(desktop).toContain(".wyrd-story-scroll");
    expect(desktop).toContain(".wyrd-sidebar");
  });

  it("renders GameOver and the New game row at the end of the story scroll feed", () => {
    const boardAt = appSrc.indexOf('className="wyrd-board"');
    expect(boardAt).toBeGreaterThan(-1);
    const scrollAt = appSrc.indexOf('className="wyrd-story-scroll"', boardAt);
    expect(scrollAt).toBeGreaterThan(boardAt);
    const gameOverAt = appSrc.indexOf("<GameOver", scrollAt);
    expect(gameOverAt).toBeGreaterThan(scrollAt);
    const newGameBtnAt = appSrc.indexOf("New game", gameOverAt);
    expect(newGameBtnAt).toBeGreaterThan(gameOverAt);
    // Nothing game-over related may sit above the board anymore: no <GameOver> JSX element there.
    const beforeBoard = appSrc.slice(0, boardAt);
    expect(beforeBoard).not.toContain("<GameOver");
    // The pinned input bar stays outside the scroll container, after it.
    const pinnedAt = appSrc.indexOf("pinnedBarStyle", scrollAt);
    expect(pinnedAt).toBeGreaterThan(-1);
  });
});
