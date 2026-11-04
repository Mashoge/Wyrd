import type { JSX } from "react";
import type { DiceRoll, ToolLogEntry, TurnMeta } from "../api";
import { formatRoll } from "../format";

export interface InspectorTurn {
  id: string;
  playerText: string | null;
  toolLog: ToolLogEntry[];
  meta: TurnMeta | null;
}

function displayModel(model: string): string {
  if (model === "muse-spark-1.3") return "Muse Spark 1.3";
  return model;
}

export function formatMetaLine(meta: TurnMeta): string {
  const roundWord = meta.rounds === 1 ? "round" : "rounds";
  const callWord = meta.toolCalls === 1 ? "tool call" : "tool calls";
  const seconds = (Math.max(0, meta.ms) / 1000).toFixed(1);
  return `${displayModel(meta.model)} · ${meta.rounds} ${roundWord} · ${meta.toolCalls} ${callWord} · ${seconds}s`;
}

function toolLine(name: string, args: Record<string, unknown>): string {
  return `${name}(${JSON.stringify(args)})`;
}

function RollLine({ roll }: { roll: DiceRoll }): JSX.Element {
  return <div style={{ color: "#B9AEC0" }}>{formatRoll(roll)}</div>;
}

function InspectorEntry({ entry }: { entry: ToolLogEntry }): JSX.Element {
  const accepted = entry.result.ok;
  const reason = entry.result.reason?.trim();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <code
          style={{
            fontFamily: "ui-monospace,Menlo,Consolas,monospace",
            fontSize: 13,
            color: "#F4EFF6",
            overflowWrap: "anywhere",
          }}
        >
          {toolLine(entry.name, entry.args)}
        </code>
        <span
          className="stamp"
          style={{
            fontSize: 11,
            padding: "2px 8px",
            border: `2px solid ${accepted ? "#4DE8B5" : "#FF6B5B"}`,
            color: accepted ? "#4DE8B5" : "#FF6B5B",
            transform: "rotate(-4deg)",
          }}
        >
          {accepted ? "ACCEPTED" : "REFUSED"}
        </span>
      </div>
      {!accepted && reason !== undefined && reason.length > 0 && (
        <div style={{ fontSize: 13, color: "#B9AEC0" }}>{reason}</div>
      )}
      {entry.result.rolls.length > 0 && (
        <div
          style={{
            fontFamily: "Inter,sans-serif",
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {entry.result.rolls.map((roll, i) => (
            <RollLine key={i} roll={roll} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Inspector({ turns }: { turns: InspectorTurn[] }): JSX.Element {
  const ordered = [...turns].reverse();
  return (
    <section
      aria-label="Inspector"
      className="panel-cut"
      style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="font-title" style={{ fontSize: 18 }}>
          Inspector
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#B9AEC0" }}>
          What the AI asked for, and what the rules allowed.
        </p>
      </div>
      {ordered.length === 0 ? (
        <div className="font-story" style={{ fontSize: 15, fontStyle: "italic", color: "#B9AEC0" }}>
          No turns yet.
        </div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {ordered.map((turn) => (
            <li
              key={turn.id}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div
                className="font-story"
                style={{ fontSize: 15, fontStyle: "italic", color: "#E8CCFF", overflowWrap: "anywhere" }}
              >
                {turn.playerText !== null && turn.playerText.length > 0 ? `— ${turn.playerText}` : "— Look around."}
              </div>
              {turn.toolLog.length === 0 ? (
                <div style={{ fontSize: 13, color: "#B9AEC0" }}>No tool calls this turn.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {turn.toolLog.map((entry, j) => (
                    <InspectorEntry key={`${turn.id}-${j}`} entry={entry} />
                  ))}
                </div>
              )}
              {turn.meta !== null ? (
                <div style={{ fontSize: 12, color: "#B9AEC0" }}>{formatMetaLine(turn.meta)}</div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
