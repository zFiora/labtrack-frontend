import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SideBar from "../../components/layout/SideBar";
import TopBar from "../../components/layout/TopBar";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

// ─── Syntax highlighting ──────────────────────────────────────────────────────
const KEYWORDS = [
  "def","class","return","if","else","elif","while","for","in","not","and",
  "or","True","False","None","import","from","pass","self","print","range",
  "len","append",
];

function syntaxHighlight(line) {
  const commentIdx = line.indexOf("#");
  if (commentIdx !== -1) {
    return (
      <>
        {tokenize(line.slice(0, commentIdx))}
        <span style={{ color: "#546e8a" }}>{line.slice(commentIdx)}</span>
      </>
    );
  }
  return tokenize(line);
}

function tokenize(text) {
  return text
    .split(/(\b\w+\b|\[|\]|[(),:.{}=+\-*/<>!"']|\s+)/g)
    .filter(Boolean)
    .map((tok, i) => {
      if (KEYWORDS.includes(tok))       return <span key={i} style={{ color: "#c792ea" }}>{tok}</span>;
      if (/^["'].*["']$/.test(tok))     return <span key={i} style={{ color: "#c3e88d" }}>{tok}</span>;
      if (/^\d+$/.test(tok))            return <span key={i} style={{ color: "#f78c6c" }}>{tok}</span>;
      return <span key={i}>{tok}</span>;
    });
}

// ─── Diff builder ─────────────────────────────────────────────────────────────
function buildSimpleDiff(oldCode, newCode) {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const maxLength = Math.max(oldLines.length, newLines.length);
  const diffLines = [];
  for (let i = 0; i < maxLength; i++) {
    const o = oldLines[i], n = newLines[i];
    if (o === n) { if (n !== undefined) diffLines.push({ type: "same",    text: `  ${n}` }); continue; }
    if (o !== undefined) diffLines.push({ type: "removed", text: `- ${o}` });
    if (n !== undefined) diffLines.push({ type: "added",   text: `+ ${n}` });
  }
  return diffLines;
}

function fmtTimestamp(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

// ─── Map API version → UI shape ───────────────────────────────────────────────
function mapVersion(v, index) {
  return {
    id:          v.id || v._id,
    label:       v.description ? `v${index + 1} — ${v.description}` : `Version ${index + 1}`,
    timestamp:   fmtTimestamp(v.timestamp || v.createdAt),
    isLatest:    index === 0,
    code:        v.code || "",
  };
}

// ─── Shared code panel styles ─────────────────────────────────────────────────
const codePanelStyle = {
  background: "#0b1424", border: "1px solid #1a2540", borderRadius: 8,
  overflow: "hidden", fontSize: 13, lineHeight: 1.6, margin: 0,
  fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
};
const lineNumberStyle = {
  minWidth: 50, padding: "16px 0", textAlign: "right", color: "#2d3f5c",
  userSelect: "none", background: "#080f1e", borderRight: "1px solid #1a2540",
  fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HistoryLabPage() {
  const navigate = useNavigate();
  const { labId: labIdParam } = useParams();

  const [versions, setVersions]         = useState([]);
  const [selectedId, setSelectedId]     = useState(null);
  const [compareId, setCompareId]       = useState(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }

    api.get(`/student/labs/${labIdParam}/versions`)
      .then((data) => {
        const mapped = data.map(mapVersion);
        setVersions(mapped);
        if (mapped.length > 0) setSelectedId(mapped[0].id);
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load version history. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [labIdParam, navigate]);

  const selected      = versions.find((v) => v.id === selectedId);
  const selectedIndex = versions.findIndex((v) => v.id === selectedId);
  const previousVersion = selectedIndex >= 0 ? versions[selectedIndex + 1] : null;
  const compared      = versions.find((v) => v.id === compareId);
  const diffLines     = selected && compared ? buildSimpleDiff(compared.code, selected.code) : [];

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <SideBar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <TopBar />
        <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "#0b1220" }}>

          {/* ── Left Panel — Snapshot list ── */}
          <div style={{
            width: 320, background: "#0b1424", borderRight: "1px solid #1a2540",
            overflowY: "auto", padding: "20px 0",
          }}>
            <div style={{ paddingLeft: 20, paddingRight: 20, marginBottom: 20 }}>
              <h3 style={{
                fontSize: 12, fontWeight: 600, color: "#64748b",
                textTransform: "uppercase", margin: 0, letterSpacing: 1,
              }}>
                Snapshots
              </h3>
            </div>

            {loading && (
              <div style={{ padding: "32px 20px", color: "#64748b", fontSize: 13 }}>Loading…</div>
            )}
            {error && (
              <div style={{ padding: "32px 20px", color: "#f87171", fontSize: 13 }}>{error}</div>
            )}
            {!loading && !error && versions.length === 0 && (
              <div style={{ padding: "32px 20px", color: "#64748b", fontSize: 13 }}>
                No saved snapshots yet.
              </div>
            )}

            {versions.map((v) => (
              <div
                key={v.id}
                onClick={() => { setSelectedId(v.id); setCompareId(null); }}
                style={{
                  padding: "14px 20px", marginBottom: 8, marginLeft: 8, marginRight: 8,
                  borderRadius: 8, cursor: "pointer", transition: "all 0.2s",
                  background: selectedId === v.id ? "#1a3a52" : "transparent",
                  border:     selectedId === v.id ? "1px solid #0369a1" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{v.label}</div>
                  {v.isLatest && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: "#0ea5e9",
                      background: "#082f49", padding: "2px 8px", borderRadius: 4,
                    }}>
                      Latest
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{v.timestamp}</div>
              </div>
            ))}
          </div>

          {/* ── Right Panel — Code view ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0b1220" }}>

            {/* Header */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid #1a2540",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>
                Version History — Lab {labIdParam}
              </h2>
              <button
                onClick={() => navigate(`/labs/${labIdParam}`)}
                style={{
                  padding: "8px 16px", background: "#0369a1", color: "#e2e8f0",
                  border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                ← Editor
              </button>
            </div>

            {/* Code content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              <div style={{ minHeight: 26, marginBottom: 10, color: "#94a3b8", fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
                {selected && compared
                  ? <span>DIFF — {compared.label} → {selected.label}</span>
                  : <span style={{ visibility: "hidden" }}>DIFF</span>
                }
              </div>

              {/* Plain code view */}
              {selected && !compared && (
                <div style={codePanelStyle}>
                  <div style={{ display: "flex", minHeight: "100%" }}>
                    <div style={lineNumberStyle}>
                      {selected.code.split("\n").map((_, i) => (
                        <div key={i} style={{ paddingRight: 12 }}>{i + 1}</div>
                      ))}
                    </div>
                    <div style={{ flex: 1, padding: "16px", overflowX: "auto", color: "#cdd6f4", whiteSpace: "pre" }}>
                      {selected.code.split("\n").map((line, i) => (
                        <div key={i}>{syntaxHighlight(line || " ")}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Diff view */}
              {selected && compared && (
                <div style={codePanelStyle}>
                  <div style={{ display: "flex", minHeight: "100%" }}>
                    <div style={lineNumberStyle}>
                      {diffLines.map((_, i) => (
                        <div key={i} style={{ paddingRight: 12 }}>{i + 1}</div>
                      ))}
                    </div>
                    <div style={{ flex: 1, padding: "16px", overflowX: "auto" }}>
                      {diffLines.map((line, i) => (
                        <div key={i} style={{
                          color:      line.type === "added" ? "#22c55e" : line.type === "removed" ? "#ef4444" : "#cdd6f4",
                          background: line.type === "added" ? "rgba(34,197,94,0.1)" : line.type === "removed" ? "rgba(239,68,68,0.1)" : "transparent",
                          whiteSpace: "pre",
                        }}>
                          {line.type === "same" ? syntaxHighlight(line.text || " ") : (line.text || " ")}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!loading && !selected && (
                <div style={{ color: "#64748b", fontSize: 13 }}>Select a snapshot from the left panel.</div>
              )}
            </div>

            {/* Bottom actions */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #1a2540", display: "flex", gap: 12 }}>
              {previousVersion && (
                <button
                  onClick={() => setCompareId((c) => c === previousVersion.id ? null : previousVersion.id)}
                  style={{
                    padding: "8px 16px", color: "#e2e8f0", borderRadius: 6, fontSize: 12,
                    fontWeight: 600, cursor: "pointer", border: "1px solid #0369a1",
                    background: compareId === previousVersion.id ? "#0369a1" : "#1a2540",
                  }}
                >
                  Compare previous
                </button>
              )}
              {selected && (
                <button
                  onClick={() => setShowRestoreConfirm(true)}
                  style={{
                    padding: "8px 16px", background: "#1a2540", color: "#e2e8f0",
                    border: "1px solid #0369a1", borderRadius: 6, fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Restore {selected.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restore confirmation modal */}
      {showRestoreConfirm && selected && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "#0b1424", border: "1px solid #1a2540", borderRadius: 12,
            padding: "28px 32px", maxWidth: 420, width: "90%",
          }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>
              Restore Version?
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
              This will replace your current code with{" "}
              <strong style={{ color: "#e2e8f0" }}>{selected.label}</strong>.
              Your unsaved changes will be lost. Continue?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowRestoreConfirm(false)}
                style={{
                  padding: "8px 20px", background: "transparent", color: "#94a3b8",
                  border: "1px solid #1a2540", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRestoreConfirm(false);
                  navigate(`/labs/${labIdParam}`, {
                    state: { restoredSnapshot: { versionId: selected.id, labId: labIdParam, code: selected.code } },
                  });
                }}
                style={{
                  padding: "8px 20px", background: "#0369a1", color: "#e2e8f0",
                  border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
