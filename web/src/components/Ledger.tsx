import { useState } from "react";
import type { CSSProperties, JSX } from "react";
import type { ToolLogEntry } from "../api";
import { failedRollSummary, isPartialAttempt, shortRefusalReason, toolToPlain } from "../format";

export type LedgerKind = "success" | "failed" | "partial" | "refused";

export interface LedgerItem {
  label: string;
  detail: string;
  roll: string | null;
  shortReason: string;
}

export interface LedgerGroup {
  kind: LedgerKind;
  label: string;
  items: LedgerItem[];
}

export function kindOfEntry(accepted: boolean, failed: boolean, entry: ToolLogEntry): LedgerKind {
  if (!accepted) return "refused";
  if (!failed) return "success";
  return isPartialAttempt(entry.result.rolls) ? "partial" : "failed";
}

export function groupLedger(log: ToolLogEntry[]): LedgerGroup[] {
  const groups: LedgerGroup[] = [];
  for (const entry of log) {
    const plain = toolToPlain(entry);
    const kind = kindOfEntry(plain.accepted, plain.failed, entry);
    const item: LedgerItem = {
      label: plain.label,
      detail: plain.detail,
      roll: kind === "failed" ? failedRollSummary(entry.result.rolls) : null,
      shortReason: kind === "refused" ? shortRefusalReason(entry.result.reason) : "",
    };
    const last = groups[groups.length - 1];
    if (last !== undefined && last.kind === kind && last.label === item.label) {
      last.items.push(item);
    } else {
      groups.push({ kind, label: item.label, items: [item] });
    }
  }
  return groups;
}

export function compactLine(group: LedgerGroup): string {
  const n = group.items.length;
  const base = n > 1 ? `${group.label} ×${String(n)}` : group.label;
  if (group.kind === "failed" && n === 1) {
    const roll = group.items[0]?.roll;
    if (roll !== null && roll !== undefined && roll.length > 0) return `${base} · ${roll}`;
    return base;
  }
  if (group.kind === "partial") return `${base} · partial`;
  return base;
}

function rowBtn(muted: boolean): CSSProperties {
  return {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "4px 0",
    minHeight: 44,
    width: "100%",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: muted ? "#B9AEC0" : "inherit",
  };
}

export function Ledger({ log, defaultExpanded = false }: { log: ToolLogEntry[]; defaultExpanded?: boolean }): JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>((): Record<string, boolean> =>
    defaultExpanded ? { __all: true } : {},
  );
  const visible = showAll ? log : log.slice(-6);
  const groups = groupLedger(visible);
  const isOpen = (i: number): boolean => {
    if (expanded["__all"] === true) return true;
    return expanded[String(i)] === true;
  };
  const toggle = (i: number): void => {
    setExpanded((prev) => {
      if (prev["__all"] === true) {
        const next: Record<string, boolean> = {};
        for (let g = 0; g < groups.length; g += 1) {
          if (g !== i) next[String(g)] = true;
        }
        return next;
      }
      const key = String(i);
      return { ...prev, [key]: !(prev[key] === true) };
    });
  };
  return (
    <section aria-label="Action log" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div className="font-title" style={{ fontSize: 18, whiteSpace: "nowrap" }}>Action log</div>
        <div style={{ fontSize: 12, color: "#B9AEC0" }}>Checked by code</div>
      </div>
      {log.length === 0 ? (
        <div className="font-story" style={{ fontSize: 16, color: "#B9AEC0", fontStyle: "italic" }}>
          Nothing yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "'Literata',Georgia,serif", fontSize: 16, lineHeight: 1.4 }}>
          {groups.map((group, i) => {
            const open = isOpen(i);
            if (group.kind === "refused") {
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(i)} style={rowBtn(false)}>
                    <span style={{ color: "#FF6B5B", fontFamily: "Inter,sans-serif" }}>✗</span>
                    <span style={{ color: "#A99E8A", textDecoration: "line-through" }}>{compactLine(group)}</span>
                    <span className="stamp" style={{ marginLeft: "auto", color: "#FF6B5B", border: "2px solid #FF6B5B", fontSize: 12, padding: "2px 10px", transform: "rotate(-8deg)" }}>
                      Refused
                    </span>
                  </button>
                  <div style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#B9AEC0" }}>{group.items[0]?.shortReason ?? ""}</div>
                  {open &&
                    group.items.map((item, j) => (
                      <div key={j} style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#F4EFF6" }}>
                        {item.detail}
                      </div>
                    ))}
                </div>
              );
            }
            if (group.kind === "failed" || group.kind === "partial") {
              const icon = group.kind === "partial" ? "◐" : "✗";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(i)} style={rowBtn(true)}>
                    <span style={{ color: "#B9AEC0", fontFamily: "Inter,sans-serif" }}>{icon}</span>
                    <span style={{ color: "#B9AEC0" }}>{compactLine(group)}</span>
                  </button>
                  {open &&
                    group.items.map((item, j) =>
                      item.detail.length > 0 ? (
                        <div key={j} style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#B9AEC0" }}>
                          {item.detail}
                        </div>
                      ) : null,
                    )}
                </div>
              );
            }
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" aria-expanded={open} onClick={() => toggle(i)} style={rowBtn(false)}>
                  <span style={{ color: "#4DE8B5", fontFamily: "Inter,sans-serif" }}>✓</span>
                  <span>{compactLine(group)}</span>
                </button>
                {open &&
                  group.items.some((item) => item.detail.length > 0) &&
                  group.items.map((item, j) =>
                    item.detail.length > 0 ? (
                      <div key={j} style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#B9AEC0" }}>
                        {item.detail}
                      </div>
                    ) : null,
                  )}
              </div>
            );
          })}
          {log.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              style={{ alignSelf: "flex-start", background: "transparent", border: "1px solid #5A4A68", color: "#B9AEC0", fontFamily: "Inter,sans-serif", fontSize: 13, minHeight: 44, padding: "0 14px", cursor: "pointer" }}
            >
              {showAll ? "Show less" : `Show all (${log.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

