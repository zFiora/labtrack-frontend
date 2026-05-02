import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";

function fmtDateTime(iso) {
  if (!iso) return "Not scanned";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function similarityColor(pct) {
  if (pct >= 80) return { text: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)" };
  if (pct >= 60) return { text: "#fb923c", bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.3)" };
  return { text: "#facc15", bg: "rgba(250,204,21,0.12)", border: "rgba(250,204,21,0.3)" };
}

function getLabPayload(data) {
  return data?.lab ?? data;
}

function getPlagiarismPayload(data) {
  return data?.plagiarism ?? data?.analysis ?? data;
}

function getPairsPayload(data) {
  const payload = getPlagiarismPayload(data);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.pairs)) return payload.pairs;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function normalizeSimilarity(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed <= 1 ? parsed * 100 : parsed);
}

function filesToCode(files) {
  if (!files || typeof files !== "object") return "";
  return Object.entries(files)
    .map(([name, content]) => `// ${name}\n${content}`)
    .join("\n\n");
}

function firstCode(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      const code = filesToCode(value);
      if (code.trim()) return code;
    }
  }
  return "";
}

function safeKey(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePair(raw, index) {
  const studentA = raw.studentA || raw.student_a || raw.a || {};
  const studentB = raw.studentB || raw.student_b || raw.b || {};
  const submissionA = raw.submissionA || raw.submission_a || {};
  const submissionB = raw.submissionB || raw.submission_b || {};
  const studentAId = raw.studentAId || raw.studentAID || studentA.id || submissionA.studentId;
  const studentBId = raw.studentBId || raw.studentBID || studentB.id || submissionB.studentId;
  const studentAName =
    raw.studentAName || studentA.fullName || studentA.name || submissionA.studentName || "Student A";
  const studentBName =
    raw.studentBName || studentB.fullName || studentB.name || submissionB.studentName || "Student B";
  const pairKey =
    raw.pairKey ||
    raw.key ||
    raw.id ||
    `${safeKey(studentAId || studentAName)}-${safeKey(studentBId || studentBName)}-${index}`;
  const status =
    raw.status ||
    (raw.flagged ? "flagged" : raw.dismissed ? "dismissed" : "pending");

  return {
    ...raw,
    pairKey,
    studentAId,
    studentBId,
    studentAName,
    studentBName,
    studentAEmail: raw.studentAEmail || studentA.email || submissionA.studentEmail || "",
    studentBEmail: raw.studentBEmail || studentB.email || submissionB.studentEmail || "",
    similarity: normalizeSimilarity(raw.similarity ?? raw.similarityScore ?? raw.score),
    status,
    flagged: raw.flagged ?? status === "flagged",
    codeA: firstCode(raw.codeA, raw.studentACode, submissionA.code, submissionA.fileContents, submissionA.files),
    codeB: firstCode(raw.codeB, raw.studentBCode, submissionB.code, submissionB.fileContents, submissionB.files),
    matchedBlocks: raw.matchedBlocks || raw.blocks || raw.matches || [],
  };
}

function normalizePlagiarism(data) {
  const payload = getPlagiarismPayload(data) || {};
  return {
    pairs: getPairsPayload(data).map(normalizePair),
    scannedAt: payload.scannedAt || payload.analyzedAt || payload.generatedAt || payload.updatedAt || null,
  };
}

function addBlockLines(target, start, end) {
  const first = Math.max(Number(start || 1) - 1, 0);
  const last = Math.max(Number(end || start || 1) - 1, first);
  for (let line = first; line <= last; line += 1) {
    target.add(line);
  }
}

function computeMatchedLines(pair, codeA, codeB) {
  const matchedA = new Set();
  const matchedB = new Set();

  if (Array.isArray(pair?.matchedBlocks) && pair.matchedBlocks.length > 0) {
    pair.matchedBlocks.forEach((block) => {
      addBlockLines(matchedA, block.startLineA ?? block.startA ?? block.lineA, block.endLineA ?? block.endA ?? block.lineA);
      addBlockLines(matchedB, block.startLineB ?? block.startB ?? block.lineB, block.endLineB ?? block.endB ?? block.lineB);
    });
    return { matchedA, matchedB };
  }

  const linesA = codeA.split("\n");
  const linesB = codeB.split("\n");
  linesA.forEach((lineA, indexA) => {
    const trimmed = lineA.trim();
    if (!trimmed) return;
    linesB.forEach((lineB, indexB) => {
      if (trimmed === lineB.trim()) {
        matchedA.add(indexA);
        matchedB.add(indexB);
      }
    });
  });
  return { matchedA, matchedB };
}

function CodePanel({ label, name, code, matchedLines }) {
  if (!code) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 16px", background: "#0d1f3c", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>{name}</span>
        </div>
        <div style={{ flex: 1, display: "grid", placeItems: "center", background: "#060f20", color: "#475569", fontSize: 13, padding: 24, textAlign: "center" }}>
          Code was not included in the plagiarism result.
        </div>
      </div>
    );
  }

  const lines = code.split("\n");
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 16px", background: "#0d1f3c", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>{name}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", fontFamily: "monospace", fontSize: 12, lineHeight: "20px", background: "#060f20" }}>
        {lines.map((line, index) => {
          const isMatch = matchedLines.has(index);
          return (
            <div
              key={`${index}-${line}`}
              style={{
                display: "flex",
                background: isMatch ? "rgba(251,146,60,0.15)" : "transparent",
                borderLeft: isMatch ? "3px solid #fb923c" : "3px solid transparent",
              }}
            >
              <span style={{ width: 36, textAlign: "right", padding: "0 8px", color: isMatch ? "#fb923c" : "#334155", userSelect: "none", flexShrink: 0, fontSize: 11 }}>
                {index + 1}
              </span>
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", padding: "0 12px 0 4px", color: isMatch ? "#fed7aa" : "#94a3b8" }}>
                {line || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlagiarismPage() {
  const { labId } = useParams();
  const navigate = useNavigate();

  const [lab, setLab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [scanState, setScanState] = useState("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [pairs, setPairs] = useState([]);
  const [scannedAt, setScannedAt] = useState(null);
  const [selectedPairKey, setSelectedPairKey] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [updatingPair, setUpdatingPair] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const labData = await api.get(`/instructor/labs/${labId}`);
      let plagiarismData = null;
      try {
        plagiarismData = await api.get(`/instructor/labs/${labId}/plagiarism`);
      } catch (err) {
        if (err.status !== 404) throw err;
      }

      const normalized = plagiarismData ? normalizePlagiarism(plagiarismData) : { pairs: [], scannedAt: null };
      setLab(getLabPayload(labData));
      setPairs(normalized.pairs);
      setScannedAt(normalized.scannedAt);
      setScanState(normalized.pairs.length > 0 || normalized.scannedAt ? "done" : "idle");
      setSelectedPairKey(normalized.pairs[0]?.pairKey || null);
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      setLoadError(err.message ?? "Failed to load plagiarism results. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [labId, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function startScan() {
    if (scanState === "scanning") return;

    setScanState("scanning");
    setScanProgress(10);
    setSelectedPairKey(null);

    const progressTimer = setInterval(() => {
      setScanProgress((progress) => Math.min(progress + 8, 90));
    }, 250);

    try {
      const scanData = await api.post(`/instructor/labs/${labId}/check-plagiarism`);
      let normalized = normalizePlagiarism(scanData);
      if (normalized.pairs.length === 0 && !normalized.scannedAt) {
        normalized = normalizePlagiarism(await api.get(`/instructor/labs/${labId}/plagiarism`));
      }

      setPairs(normalized.pairs);
      setScannedAt(normalized.scannedAt || new Date().toISOString());
      setScanProgress(100);
      setScanState("done");
      setSelectedPairKey(normalized.pairs[0]?.pairKey || null);
      showToast("success", `Scan complete - ${normalized.pairs.length} suspicious pair(s) found`);
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      setScanState(pairs.length > 0 ? "done" : "idle");
      setScanProgress(0);
      showToast("danger", err.message ?? "Failed to run plagiarism scan. Please try again.");
    } finally {
      clearInterval(progressTimer);
    }
  }

  async function updatePairFlag(pairKey, flagged) {
    const pair = pairs.find((item) => item.pairKey === pairKey);
    if (!pair || updatingPair) return;

    setUpdatingPair(pairKey);
    try {
      await api.patch(`/instructor/labs/${labId}/plagiarism/${encodeURIComponent(pairKey)}`, { flagged });

      const newStatus = flagged ? "flagged" : "dismissed";
      const updated = pairs.map((item) =>
        item.pairKey === pairKey ? { ...item, flagged, status: newStatus } : item,
      );
      setPairs(updated);

      const remaining = updated.filter((item) => item.pairKey !== pairKey && item.status === "pending");
      if (remaining.length > 0) setSelectedPairKey(remaining[0].pairKey);

      showToast(
        flagged ? "danger" : "info",
        `${flagged ? "Flagged as plagiarism" : "Dismissed"} - ${pair.studentAName} and ${pair.studentBName}`,
      );
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      showToast("danger", err.message ?? "Failed to update plagiarism pair.");
    } finally {
      setUpdatingPair(null);
    }
  }

  const selectedPair = useMemo(
    () => pairs.find((pair) => pair.pairKey === selectedPairKey),
    [pairs, selectedPairKey],
  );

  const filteredPairs = useMemo(() => {
    if (filterStatus === "all") return pairs;
    return pairs.filter((pair) => pair.status === filterStatus);
  }, [filterStatus, pairs]);

  const counts = useMemo(() => ({
    all: pairs.length,
    pending: pairs.filter((pair) => pair.status === "pending").length,
    flagged: pairs.filter((pair) => pair.status === "flagged").length,
    dismissed: pairs.filter((pair) => pair.status === "dismissed").length,
  }), [pairs]);

  const codeA = selectedPair?.codeA || "";
  const codeB = selectedPair?.codeB || "";
  const { matchedA, matchedB } = selectedPair
    ? computeMatchedLines(selectedPair, codeA, codeB)
    : { matchedA: new Set(), matchedB: new Set() };

  if (loading) {
    return (
      <InstructorLayout>
        <div style={{ height: "60vh", display: "grid", placeItems: "center", color: "#64748b" }}>
          Loading plagiarism results...
        </div>
      </InstructorLayout>
    );
  }

  if (loadError) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#f87171", marginBottom: 16 }}>{loadError}</p>
          <button onClick={loadData} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#0891b2", color: "#fff", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 28px", borderBottom: "1px solid #1e3a5f", background: "#060f20", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={() => navigate(`/instructor/labs/${labId}/submissions`)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 20, lineHeight: 1, padding: 0 }}
              title="Back to submissions"
            >
              &lt;
            </button>
            <div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>Plagiarism Detection</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{lab?.title || labId}</div>
            </div>
            {scanState === "done" && scannedAt && (
              <span style={{ fontSize: 11, color: "#475569", background: "#0d1f3c", padding: "4px 10px", borderRadius: 20, border: "1px solid #1e3a5f" }}>
                Last scan: {fmtDateTime(scannedAt)}
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {counts.flagged > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", padding: "5px 12px", borderRadius: 20 }}>
                {counts.flagged} Flagged
              </span>
            )}
            <button
              onClick={startScan}
              disabled={scanState === "scanning"}
              style={{
                padding: "8px 18px",
                borderRadius: 9,
                fontWeight: 700,
                fontSize: 13,
                cursor: scanState === "scanning" ? "not-allowed" : "pointer",
                border: "1px solid rgba(34,211,238,0.4)",
                background: scanState === "scanning" ? "rgba(34,211,238,0.04)" : "rgba(34,211,238,0.1)",
                color: scanState === "scanning" ? "#475569" : "#22d3ee",
              }}
            >
              {scanState === "scanning" ? "Scanning..." : scanState === "done" ? "Re-scan" : "Run Plagiarism Scan"}
            </button>
          </div>
        </div>

        {toast && (
          <div style={{
            position: "fixed",
            top: 24,
            right: 24,
            zIndex: 999,
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: toast.type === "danger" ? "rgba(248,113,113,0.95)" : toast.type === "success" ? "rgba(74,222,128,0.95)" : "rgba(148,163,184,0.95)",
            color: "#0a1628",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}>
            {toast.msg}
          </div>
        )}

        {scanState === "idle" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>No scan results yet</div>
            <div style={{ fontSize: 14, color: "#64748b", maxWidth: 360, textAlign: "center" }}>
              Run a plagiarism scan to compare submitted code and detect suspicious similarities.
            </div>
            <button
              onClick={startScan}
              style={{ padding: "11px 28px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", border: "1px solid rgba(34,211,238,0.4)", background: "rgba(34,211,238,0.1)", color: "#22d3ee" }}
            >
              Run Plagiarism Scan
            </button>
          </div>
        )}

        {scanState === "scanning" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Plagiarism scan in progress...</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Running server-side similarity analysis</div>
            <div style={{ width: 360, background: "#0d1f3c", border: "1px solid #1e3a5f", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: 10, width: `${scanProgress}%`, background: "linear-gradient(90deg, #22d3ee, #7c3aed)", transition: "width 0.15s ease", borderRadius: 8 }} />
            </div>
            <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>{Math.round(scanProgress)}%</div>
          </div>
        )}

        {scanState === "done" && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column", background: "#060f20", overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid #1e3a5f", padding: "0 12px" }}>
                {["all", "pending", "flagged", "dismissed"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    style={{
                      flex: 1,
                      padding: "10px 4px",
                      background: "none",
                      border: "none",
                      borderBottom: filterStatus === status ? "2px solid #22d3ee" : "2px solid transparent",
                      color: filterStatus === status ? "#22d3ee" : "#475569",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {status} {counts[status] > 0 ? ` ${counts[status]}` : ""}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredPairs.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#475569" }}>No pairs in this category</div>
                ) : (
                  filteredPairs.map((pair) => {
                    const color = similarityColor(pair.similarity);
                    const isSelected = selectedPairKey === pair.pairKey;
                    return (
                      <div
                        key={pair.pairKey}
                        onClick={() => setSelectedPairKey(pair.pairKey)}
                        style={{
                          padding: "14px 16px",
                          borderBottom: "1px solid #0d1f3c",
                          background: isSelected ? "rgba(34,211,238,0.06)" : "transparent",
                          borderLeft: isSelected ? "3px solid #22d3ee" : "3px solid transparent",
                          cursor: "pointer",
                          opacity: pair.status === "dismissed" ? 0.55 : 1,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: color.text }}>{pair.similarity}%</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: pair.status === "flagged" ? "#f87171" : pair.status === "dismissed" ? "#4ade80" : "#fb923c", textTransform: "capitalize" }}>
                            {pair.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, marginBottom: 2 }}>{pair.studentAName}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>vs</div>
                        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{pair.studentBName}</div>
                        <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "#0d1f3c", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pair.similarity}%`, background: color.text, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ padding: "10px 16px", borderTop: "1px solid #1e3a5f", background: "#0d1f3c", fontSize: 11, color: "#475569", display: "flex", justifyContent: "space-between" }}>
                <span>{counts.pending} pending</span>
                <span>{counts.flagged} flagged / {counts.dismissed} dismissed</span>
              </div>
            </div>

            {selectedPair ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e3a5f", background: "#0d1f3c", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 2 }}>
                        <strong style={{ color: "#e2e8f0" }}>{selectedPair.studentAName}</strong>
                        <span style={{ margin: "0 8px", color: "#334155" }}>vs</span>
                        <strong style={{ color: "#e2e8f0" }}>{selectedPair.studentBName}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: "#475569" }}>Highlighted lines indicate matching code segments</div>
                    </div>
                    <div style={{ padding: "6px 14px", borderRadius: 8, background: similarityColor(selectedPair.similarity).bg, border: `1px solid ${similarityColor(selectedPair.similarity).border}`, color: similarityColor(selectedPair.similarity).text, fontSize: 20, fontWeight: 800 }}>
                      {selectedPair.similarity}% similar
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => updatePairFlag(selectedPair.pairKey, false)}
                      disabled={updatingPair === selectedPair.pairKey || selectedPair.status === "dismissed"}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: updatingPair === selectedPair.pairKey || selectedPair.status === "dismissed" ? "not-allowed" : "pointer",
                        border: "1px solid #1e3a5f",
                        background: selectedPair.status === "dismissed" ? "rgba(74,222,128,0.1)" : "transparent",
                        color: selectedPair.status === "dismissed" ? "#4ade80" : "#94a3b8",
                        opacity: updatingPair === selectedPair.pairKey || selectedPair.status === "dismissed" ? 0.7 : 1,
                      }}
                    >
                      {selectedPair.status === "dismissed" ? "Dismissed" : "Dismiss"}
                    </button>
                    <button
                      onClick={() => updatePairFlag(selectedPair.pairKey, true)}
                      disabled={updatingPair === selectedPair.pairKey || selectedPair.status === "flagged"}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: updatingPair === selectedPair.pairKey || selectedPair.status === "flagged" ? "not-allowed" : "pointer",
                        border: "1px solid rgba(248,113,113,0.5)",
                        background: selectedPair.status === "flagged" ? "rgba(248,113,113,0.15)" : "rgba(248,113,113,0.1)",
                        color: "#f87171",
                        opacity: updatingPair === selectedPair.pairKey || selectedPair.status === "flagged" ? 0.7 : 1,
                      }}
                    >
                      {selectedPair.status === "flagged" ? "Flagged" : "Flag as Plagiarism"}
                    </button>
                  </div>
                </div>

                <div style={{ padding: "6px 20px", background: "#060f20", borderBottom: "1px solid #0d1f3c", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#475569" }}>Matching lines:</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    {matchedA.size} left / {matchedB.size} right
                  </span>
                </div>

                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                  <CodePanel label="Student A" name={selectedPair.studentAName} code={codeA} matchedLines={matchedA} />
                  <div style={{ width: 1, background: "#1e3a5f", flexShrink: 0 }} />
                  <CodePanel label="Student B" name={selectedPair.studentBName} code={codeB} matchedLines={matchedB} />
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 14 }}>
                Select a pair to view side-by-side comparison
              </div>
            )}
          </div>
        )}
      </div>
    </InstructorLayout>
  );
}
