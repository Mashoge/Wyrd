import type { JSX } from "react";
import type { GameStatus, PlayerView, ToolLogEntry } from "../api";
import { EnemyCard } from "./EnemyCard";
import { Ledger } from "./Ledger";
import { WyrdPanel } from "./WyrdPanel";
import { YouPanel } from "./YouPanel";

interface Props {
  view: PlayerView;
  status: GameStatus;
  ledger: ToolLogEntry[];
}

export function Sidebar({ view, status, ledger }: Props): JSX.Element {
  return (
    <aside className="wyrd-sidebar" style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <EnemyCard enemy={view.enemy} />
      <YouPanel view={view} />
      <Ledger log={ledger} />
      <WyrdPanel inventory={view.player.inventory} status={status} />
    </aside>
  );
}

