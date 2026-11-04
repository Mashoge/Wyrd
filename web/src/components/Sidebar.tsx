import type { JSX } from "react";
import type { GameMap, GameStatus, PlayerView, ToolLogEntry } from "../api";
import { EnemyCard } from "./EnemyCard";
import { Ledger } from "./Ledger";
import { WhereYouAre } from "./WhereYouAre";
import { WyrdPanel } from "./WyrdPanel";
import { YouPanel } from "./YouPanel";

interface Props {
  view: PlayerView;
  status: GameStatus;
  ledger: ToolLogEntry[];
  map: GameMap;
}

export function Sidebar({ view, status, ledger, map }: Props): JSX.Element {
  return (
    <aside className="wyrd-sidebar" style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <WhereYouAre roomName={view.room.name} map={map} />
      <EnemyCard enemy={view.enemy} />
      <YouPanel view={view} />
      <Ledger log={ledger} />
      <WyrdPanel inventory={view.player.inventory} status={status} />
    </aside>
  );
}

