import type { JSX } from "react";
import type { GameMap } from "../api";

interface Props {
  roomName: string;
  map: GameMap;
}

type Dir = "north" | "south" | "east" | "west";

const STEP: Record<Dir, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

function normDir(direction: string): Dir {
  const d = direction.trim().toLowerCase();
  if (d === "south" || d === "s") return "south";
  if (d === "east" || d === "e") return "east";
  if (d === "west" || d === "w") return "west";
  return "north";
}

/**
 * Lay rooms out from the first room following link directions.
 * North = up. If a grid cell is taken, step further in the same
 * direction until a free cell is found (cap 24 steps).
 */
function layout(map: GameMap): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const idAt = new Map<string, string>();
  const key = (x: number, y: number): string => `${x},${y}`;
  const anchor = map.rooms[0]?.id;
  if (anchor === undefined) return pos;
  pos.set(anchor, { x: 0, y: 0 });
  idAt.set(key(0, 0), anchor);
  const byFrom = new Map<string, { to: string; direction: string }[]>();
  for (const l of map.links) {
    const list = byFrom.get(l.from) ?? [];
    list.push({ to: l.to, direction: l.direction });
    byFrom.set(l.from, list);
  }
  const queue = [anchor];
  const seen = new Set([anchor]);
  while (queue.length > 0) {
    const from = queue.shift() as string;
    const base = pos.get(from);
    if (base === undefined) continue;
    for (const edge of byFrom.get(from) ?? []) {
      const step = STEP[normDir(edge.direction)];
      let nx = base.x + step.dx;
      let ny = base.y + step.dy;
      for (let i = 0; i < 24 && idAt.has(key(nx, ny)) && idAt.get(key(nx, ny)) !== edge.to; i += 1) {
        nx += step.dx;
        ny += step.dy;
      }
      if (!pos.has(edge.to)) {
        pos.set(edge.to, { x: nx, y: ny });
        if (!idAt.has(key(nx, ny))) idAt.set(key(nx, ny), edge.to);
      }
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  for (const r of map.rooms) {
    if (!pos.has(r.id)) pos.set(r.id, { x: 0, y: 0 });
  }
  return pos;
}

const BOX_W = 22;
const BOX_H = 15;
const CELL = 30;
export function WhereYouAre({ roomName, map }: Props): JSX.Element {
  const pos = layout(map);
  let minX = 0;
  let maxX = BOX_W;
  let minY = 0;
  let maxY = BOX_H;
  let init = false;
  const grow = (x: number, y: number): void => {
    if (!init) {
      minX = x; maxX = x; minY = y; maxY = y; init = true;
      return;
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const p of pos.values()) {
    grow(p.x * CELL, p.y * CELL);
    grow(p.x * CELL + BOX_W, p.y * CELL + BOX_H);
  }
  for (const s of map.unexplored) {
    const p = pos.get(s.from);
    if (p === undefined) continue;
    const step = STEP[normDir(s.direction)];
    grow(p.x * CELL + BOX_W / 2 + step.dx * CELL, p.y * CELL + BOX_H / 2 + step.dy * CELL);
  }
  const pad = 16;
  const vbW = Math.max(1, maxX - minX + pad * 2);
  const vbH = Math.max(1, maxY - minY + pad * 2);
  const vbX = minX - pad;
  const vbY = minY - pad;
  const count = map.rooms.length;
  return (
    <section aria-label="Where you are" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="font-title" style={{ fontSize: 12, color: "#B9AEC0" }}>
        Where you are
      </div>
      <div className="font-title" style={{ fontSize: 20, color: "#F4EFF6" }}>
        {roomName}
      </div>
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%"
        height={150}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`You are in ${roomName}, visited ${count} ${count === 1 ? "room" : "rooms"}`}
        style={{ background: "#0C0910", display: "block" }}
      >
        {map.links.map((l, i) => {
          const a = pos.get(l.from);
          const b = pos.get(l.to);
          if (a === undefined || b === undefined) return null;
          return (
            <line
              key={`${l.from}-${l.to}-${l.direction}-${i}`}
              x1={a.x * CELL + BOX_W / 2}
              y1={a.y * CELL + BOX_H / 2}
              x2={b.x * CELL + BOX_W / 2}
              y2={b.y * CELL + BOX_H / 2}
              stroke="#5A4A68"
              strokeWidth={2}
            />
          );
        })}
        {map.unexplored.map((s, i) => {
          const p = pos.get(s.from);
          if (p === undefined) return null;
          const step = STEP[normDir(s.direction)];
          const x1 = p.x * CELL + BOX_W / 2;
          const y1 = p.y * CELL + BOX_H / 2;
          const x2 = x1 + step.dx * CELL * 0.6;
          const y2 = y1 + step.dy * CELL * 0.6;
          return (
            <g key={`${s.from}-${s.direction}-${i}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5A4A68" strokeWidth={2} strokeDasharray="3 3" />
              <text x={x2} y={y2 + 4} fontSize={11} textAnchor="middle" fill="#B9AEC0" fontFamily="Inter, sans-serif">
                ?
              </text>
            </g>
          );
        })}
        {map.rooms.map((r) => {
          const p = pos.get(r.id) ?? { x: 0, y: 0 };
          const x = p.x * CELL;
          const y = p.y * CELL;
          return (
            <g key={r.id}>
              <polygon
                points={`${x + 3},${y} ${x + BOX_W},${y} ${x + BOX_W - 3},${y + BOX_H} ${x},${y + BOX_H}`}
                fill={r.isCurrent ? "#B44DFF" : "#2A2133"}
                stroke={r.isCurrent ? "#B44DFF" : "#5A4A68"}
                strokeWidth={1.5}
              >
                <title>{r.name}</title>
              </polygon>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

