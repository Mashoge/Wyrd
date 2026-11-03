import { useState } from "react";
import type { JSX } from "react";
import type { ToolLogEntry } from "../api";
import { toolToPlain } from "../format";

export function Ledger({ log }: { log: ToolLogEntry[] }): JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? log : log.slice(-6);
  return (
    <section aria-label="Ledger of fate" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div className="font-title" style={{ fontSize: 18, whiteSpace: "nowrap" }}>Ledger of fate</div>
        <div style={{ fontSize: 12, color: "#B9AEC0" }}>every claim is checked</div>
      </div>
      {log.length === 0 ? (
        <div className="font-story" style={{ fontSize: 16, color: "#B9AEC0", fontStyle: "italic" }}>
          No claims yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "'Literata',Georgia,serif", fontSize: 16, lineHeight: 1.4 }}>
          {visible.map((entry, i) => {
            const plain = toolToPlain(entry);
            if (!plain.accepted) {
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                    <span style={{ color: "#FF6B5B", fontFamily: "Inter,sans-serif" }}>✗</span>
                    <span style={{ color: "#A99E8A", textDecoration: "line-through" }}>{plain.label}</span>
                    <span className="stamp" style={{ marginLeft: "auto", color: "#FF6B5B", border: "2px solid #FF6B5B", fontSize: 12, padding: "2px 10px", transform: "rotate(-8deg)" }}>
                      Refused
                    </span>
                  </div>
                  <div style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#B9AEC0" }}>{plain.detail}</div>
                </div>
              );
            }
            if (plain.failed) {
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                    <span style={{ color: "#FF6B5B", fontFamily: "Inter,sans-serif" }}>✗</span>
                    <span>{plain.label}</span>
                    <span className="stamp" style={{ marginLeft: "auto", color: "#FF6B5B", border: "1.5px solid #FF6B5B", fontSize: 11, padding: "2px 8px", transform: "rotate(-8deg)" }}>
                      Failed
                    </span>
                  </div>
                  <div style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#B9AEC0" }}>{plain.detail}</div>
                </div>
              );
            }
            return (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "#4DE8B5", fontFamily: "Inter,sans-serif" }}>✓</span>
                <span>{plain.label}</span>
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

