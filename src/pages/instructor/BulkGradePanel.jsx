import { useState, useEffect } from "react";
import { api } from "../../utils/api.js";

const MAX_BULK      = 100;

// ── helpers ───────────────────────────────────────────────────────────────────
function testScoreFor(sub, labPoints) {
  const testMax = sub.testResults?.reduce((sum, test) => sum + (test.points || 0), 0) || 0;
  const earned = sub.testResults?.reduce((sum, test) => sum + (test.earned || 0), 0) || 0;
  if (testMax > 0) return Math.round((earned / testMax) * labPoints);
  return sub.score ?? 0;
}

function scoreForMode(mode, sub, labPoints, adjustPct) {
  if (mode === "auto") return labPoints;
  if (mode === "adjust") {
    const pct = Number(adjustPct) / 100;
    const raw = (sub.score || 0) + Math.round((sub.score || 0) * pct);
    return Math.max(0, Math.min(labPoints, raw));
  }
  return sub.score ?? testScoreFor(sub, labPoints);
}

const inputStyle = {
  width: "100%", background: "#0a1628", border: "1px solid #1a2540",
  borderRadius: 9, padding: "9px 12px", color: "#e2e8f0",
  fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#64748b",
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5,
};

// ── main component ────────────────────────────────────────────────────────────
export default function BulkGradePanel({ lab, submissions, onClose, onApplied, showToast }) {
  const [mode, setMode]           = useState(null);          // null | "auto" | "template" | "adjust"
  const [preview, setPreview]     = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress]   = useState(0);             // 0-100 during apply
  const [applying, setApplying]   = useState(false);
  const [done, setDone]           = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  // template mode
  const [templates, setTemplates]         = useState([]);
  const [selectedTpl, setSelectedTpl]     = useState(null);
  const [tplEditing, setTplEditing]       = useState(false);
  const [tplDraft, setTplDraft]           = useState({ name: "", text: "" });
  const [tplErr, setTplErr]               = useState({});
  const [feedbackTemplate, setFeedbackTemplate] = useState("");

  // adjust mode
  const [adjustPct, setAdjustPct] = useState("");
  const [adjustErr, setAdjustErr] = useState("");

  const labPoints = lab?.points || 100;

  // ── build preview list based on mode ──────────────────────────────────────
  useEffect(() => {
    if (!mode) { setPreview([]); setConfirmed(false); return; }

    const submitted = submissions.filter(
      (s) => s.status === "submitted" || s.status === "graded",
    ).slice(0, MAX_BULK);

    if (mode === "auto") {
      const perfect = submitted.filter((s) => {
        const tcPts = s.testResults?.reduce((a, t) => a + (t.points || 0), 0) || 0;
        const earned = s.testResults?.reduce((a, t) => a + (t.earned || 0), 0) || 0;
        return tcPts > 0 && earned === tcPts;
      });
      setPreview(perfect);
    } else if (mode === "template") {
      setPreview(submitted.filter((s) => s.status !== "graded"));
    } else if (mode === "adjust") {
      setPreview(submitted.filter((s) => s.score !== null));
    }
    setConfirmed(false);
  }, [mode, submissions]);

  // ── template CRUD ──────────────────────────────────────────────────────────
  const openNewTpl = () => {
    setTplDraft({ name: "", text: "" });
    setTplErr({});
    setTplEditing(true);
  };

  const saveTpl = () => {
    const errs = {};
    if (!tplDraft.name.trim()) errs.name = "Name is required";
    if (!tplDraft.text.trim() || tplDraft.text.trim().length < 30)
      errs.text = "Template must be at least 30 characters";
    if (Object.keys(errs).length) { setTplErr(errs); return; }

    const updated = selectedTpl
      ? templates.map((t) => (t.id === selectedTpl.id ? { ...t, ...tplDraft } : t))
      : [...templates, { id: `tpl-${Date.now()}`, ...tplDraft }];

    setTemplates(updated);
    setSelectedTpl(null);
    setTplEditing(false);
    setTplErr({});
  };

  const deleteTpl = (id) => {
    setTemplates(templates.filter((t) => t.id !== id));
    if (selectedTpl?.id === id) { setSelectedTpl(null); setFeedbackTemplate(""); }
  };

  // ── apply bulk action ──────────────────────────────────────────────────────
  const buildUpdates = () =>
    preview.slice(0, MAX_BULK).map((sub) => ({
      subId: sub.id || sub.submissionId,
      score: scoreForMode(mode, sub, labPoints, adjustPct),
      feedback:
        mode === "adjust"
          ? `Grade adjusted by ${Number(adjustPct)}%`
          : feedbackTemplate.trim(),
    }));

  const handleApply = () => {
    if (mode === "adjust") {
      const v = Number(adjustPct);
      if (isNaN(v) || v < -50 || v > 50) {
        setAdjustErr("Enter a percentage between -50 and +50");
        return;
      }
      setAdjustErr("");
    }
    if (mode === "template" && !feedbackTemplate.trim()) {
      showToast?.("error", "Choose a feedback template before applying");
      return;
    }
    if (!confirmed) { setConfirmed(true); return; }
    runApply();
  };

  const runApply = async () => {
    if (applying) return;
    const updates = buildUpdates();
    if (updates.length === 0) {
      showToast?.("error", "No eligible submissions to update");
      return;
    }

    setApplying(true);
    setProgress(20);

    try {
      setProgress(55);
      const result = await api.post("/instructor/submissions/bulk-grade", { updates });
      setProgress(85);
      await onApplied?.();
      finishApply(result?.updated ?? result?.count ?? updates.length);

      if (Array.isArray(result?.failed) && result.failed.length > 0) {
        showToast?.("error", `${result.failed.length} bulk grade update${result.failed.length !== 1 ? "s" : ""} failed`);
      }
    } catch (err) {
      setApplying(false);
      setProgress(0);
      showToast?.("error", err.message ?? "Failed to apply bulk grades. Please try again.");
    }
  };

  const finishApply = (count) => {
    setProgress(100);
    setApplying(false);
    setAppliedCount(count);
    setDone(true);
  };

  // ── CSV export (all submissions) ──────────────────────────────────────────
  const handleCsvExport = () => {
    const rows = [
      ["Student Name", "Email", "Status", "Score", "Max Score", "Late", "Submitted At", "Graded At", "Feedback"],
      ...submissions.map((s) => [
        s.studentName,
        s.studentEmail,
        s.status,
        s.score ?? "",
        s.maxScore ?? labPoints,
        s.late ? "Yes" : "No",
        s.submittedAt || "",
        s.gradedAt || "",
        (s.overallFeedback || "").replace(/,/g, ";"),
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `grades_${lab?.id || "lab"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast?.("success", "CSV exported successfully");
  };

  // ── render ────────────────────────────────────────────────────────────────
  const MODES = [
    { key: "auto",     icon: "⚡", label: "Auto-grade Perfect Scores",  desc: "Assign full marks to students who passed all test cases" },
    { key: "template", icon: "📝", label: "Apply Feedback Template",    desc: "Stamp a reusable comment to multiple submissions" },
    { key: "adjust",   icon: "±",  label: "Adjust Grades by %",        desc: "Scale existing scores up or down by a percentage" },
  ];
  const canApply = preview.length > 0 && !(mode === "template" && !feedbackTemplate);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 60, padding: 24,
    }}>
      <div style={{
        background: "#0d1b30", border: "1px solid #1e3a5f", borderRadius: 18,
        width: "100%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #1a2540" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Bulk Grade</h3>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569" }}>{lab?.title}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleCsvExport}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              ⬇ Export CSV
            </button>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: "20px 24px" }}>

          {/* Done state */}
          {done ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
              <h3 style={{ color: "#4ade80", margin: "0 0 8px", fontSize: 20 }}>Bulk grading complete</h3>
              <p style={{ color: "#64748b", fontSize: 14 }}>{appliedCount} submission{appliedCount !== 1 ? "s" : ""} updated · Students notified via email</p>
              <button
                onClick={onClose}
                style={{ marginTop: 24, padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#06b6d4,#0891b2)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Done
              </button>
            </div>
          ) : applying ? (
            /* Progress state */
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 20 }}>⚙️</div>
              <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>Applying bulk grade…</p>
              <div style={{ maxWidth: 340, margin: "0 auto" }}>
                <div style={{ height: 8, background: "#1a2540", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#06b6d4,#22d3ee)", borderRadius: 99, transition: "width 0.08s linear" }} />
                </div>
                <p style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>{progress}%</p>
              </div>
            </div>
          ) : (
            <>
              {/* Mode selector */}
              {!mode && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b" }}>Choose a bulk action:</p>
                  {MODES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "16px 18px", borderRadius: 12, textAlign: "left",
                        border: "1px solid #1e3a5f", background: "rgba(16,33,63,0.4)",
                        cursor: "pointer", transition: "all 0.15s", width: "100%",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#22d3ee"; e.currentTarget.style.background = "rgba(34,211,238,0.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.background = "rgba(16,33,63,0.4)"; }}
                    >
                      <span style={{ fontSize: 24, width: 36, textAlign: "center" }}>{m.icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{m.label}</div>
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{m.desc}</div>
                      </div>
                      <span style={{ marginLeft: "auto", color: "#22d3ee", fontSize: 18 }}>›</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Mode-specific content */}
              {mode && (
                <div>
                  {/* Back + mode title */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                    <button
                      onClick={() => { setMode(null); setConfirmed(false); setAdjustErr(""); }}
                      style={{ background: "transparent", border: "1px solid #1a2540", borderRadius: 7, color: "#64748b", padding: "5px 10px", cursor: "pointer", fontSize: 12 }}
                    >
                      ← Back
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
                      {MODES.find((m) => m.key === mode)?.label}
                    </span>
                  </div>

                  {/* Template picker (shared by auto + template modes) */}
                  {(mode === "auto" || mode === "template") && (
                    <div style={{ marginBottom: 18 }}>
                      <label style={labelStyle}>Feedback Template <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional for auto, required for template)</span></label>

                      {tplEditing ? (
                        <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 10, padding: "14px 16px", marginBottom: 8 }}>
                          <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Template Name</label>
                            <input
                              type="text" placeholder="e.g. Good submission" value={tplDraft.name}
                              onChange={(e) => setTplDraft((p) => ({ ...p, name: e.target.value }))}
                              style={inputStyle}
                              onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                              onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
                            />
                            {tplErr.name && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>{tplErr.name}</p>}
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Template Text <span style={{ color: "#475569" }}>(min 30 chars)</span></label>
                            <textarea
                              rows={4} placeholder="Write the feedback template here..."
                              value={tplDraft.text}
                              onChange={(e) => setTplDraft((p) => ({ ...p, text: e.target.value }))}
                              style={{ ...inputStyle, resize: "vertical" }}
                              onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                              onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                              {tplErr.text
                                ? <p style={{ margin: 0, fontSize: 11, color: "#f87171" }}>{tplErr.text}</p>
                                : <span />}
                              <span style={{ fontSize: 11, color: tplDraft.text.length >= 30 ? "#4ade80" : "#475569" }}>
                                {tplDraft.text.length} / 30 min
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={saveTpl} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "rgba(34,211,238,0.12)", color: "#22d3ee", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(34,211,238,0.25)" }}>Save Template</button>
                            <button onClick={() => { setTplEditing(false); setSelectedTpl(null); setTplErr({}); }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #1a2540", background: "transparent", color: "#64748b", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {templates.length === 0 ? (
                            <div style={{ color: "#334155", fontSize: 12, marginBottom: 8 }}>No templates yet.</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                              {templates.map((t) => (
                                <div
                                  key={t.id}
                                  onClick={() => { setSelectedTpl(t); setFeedbackTemplate(t.text); }}
                                  style={{
                                    padding: "10px 14px", borderRadius: 9, cursor: "pointer",
                                    border: `1px solid ${selectedTpl?.id === t.id ? "rgba(34,211,238,0.4)" : "#1a2540"}`,
                                    background: selectedTpl?.id === t.id ? "rgba(34,211,238,0.07)" : "transparent",
                                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedTpl?.id === t.id ? "#22d3ee" : "#e2e8f0" }}>{t.name}</div>
                                    <div style={{ fontSize: 11, color: "#475569", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</div>
                                  </div>
                                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedTpl(t); setTplDraft({ name: t.name, text: t.text }); setTplEditing(true); }}
                                      style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #1a2540", background: "transparent", color: "#64748b", fontSize: 11, cursor: "pointer" }}>Edit</button>
                                    <button onClick={(e) => { e.stopPropagation(); deleteTpl(t.id); }}
                                      style={{ padding: "3px 7px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: "#f87171", fontSize: 12, cursor: "pointer" }}>×</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={openNewTpl}
                            style={{ padding: "7px 14px", borderRadius: 8, border: "1px dashed #1e3a5f", background: "transparent", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            + New Template
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Adjust mode: percentage input */}
                  {mode === "adjust" && (
                    <div style={{ marginBottom: 18, maxWidth: 220 }}>
                      <label style={labelStyle}>Adjustment (%)</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number" min="-50" max="50" placeholder="e.g. +10 or -5"
                          value={adjustPct}
                          onChange={(e) => { setAdjustPct(e.target.value); setAdjustErr(""); }}
                          style={{ ...inputStyle, width: 110, borderColor: adjustErr ? "rgba(239,68,68,0.5)" : "#1a2540" }}
                          onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                          onBlur={(e) => (e.target.style.borderColor = adjustErr ? "rgba(239,68,68,0.5)" : "#1a2540")}
                        />
                        <span style={{ color: "#475569", fontSize: 13 }}>%</span>
                      </div>
                      {adjustErr
                        ? <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>{adjustErr}</p>
                        : <p style={{ margin: "4px 0 0", fontSize: 11, color: "#475569" }}>Range: -50% to +50%. Scores capped at {labPoints}.</p>}
                    </div>
                  )}

                  {/* Preview table */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <label style={{ ...labelStyle, margin: 0 }}>Preview ({Math.min(preview.length, MAX_BULK)} students)</label>
                      {preview.length > MAX_BULK && (
                        <span style={{ fontSize: 11, color: "#facc15" }}>⚠ Capped at {MAX_BULK}</span>
                      )}
                    </div>

                    {preview.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", background: "#0a1628", border: "1px dashed #1e3a5f", borderRadius: 10, color: "#334155", fontSize: 13 }}>
                        No eligible submissions for this action.
                      </div>
                    ) : (
                      <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", padding: "8px 14px", borderBottom: "1px solid #1a2540", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                          <span>Student</span><span>Current</span><span>New Score</span>
                        </div>
                        {preview.slice(0, MAX_BULK).map((s) => {
                          let newScore = "—";
                          if (mode === "auto" || mode === "template") {
                            newScore = scoreForMode(mode, s, labPoints, adjustPct);
                          } else if (mode === "adjust" && adjustPct !== "" && s.score !== null) {
                            newScore = scoreForMode(mode, s, labPoints, adjustPct);
                          }
                          return (
                            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", padding: "9px 14px", borderBottom: "1px solid #0f1b33", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 13, color: "#e2e8f0" }}>{s.studentName}</div>
                                <div style={{ fontSize: 11, color: "#334155" }}>{s.studentEmail}</div>
                              </div>
                              <span style={{ fontSize: 12, color: "#64748b" }}>
                                {s.score !== null ? `${s.score}/${labPoints}` : "—"}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: newScore !== "—" ? "#4ade80" : "#475569" }}>
                                {newScore !== "—" ? `${newScore}/${labPoints}` : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Confirmation step */}
                  {confirmed && (
                    <div style={{ padding: "12px 16px", background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.25)", borderRadius: 10, marginBottom: 14, fontSize: 13, color: "#fbbf24" }}>
                      ⚠ This will update {Math.min(preview.length, MAX_BULK)} submission{preview.length !== 1 ? "s" : ""} and send email notifications. This cannot be undone.
                    </div>
                  )}

                  {/* Apply button */}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid #1a2540", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button
                      onClick={handleApply}
                      disabled={!canApply}
                      style={{
                        padding: "9px 22px", borderRadius: 9, border: "none",
                        background: canApply
                          ? confirmed ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#06b6d4,#0891b2)"
                          : "#0e2a45",
                        color: canApply ? "#fff" : "#334155",
                        fontSize: 13, fontWeight: 700,
                        cursor: canApply ? "pointer" : "default",
                        boxShadow: canApply ? confirmed ? "0 4px 14px rgba(239,68,68,0.3)" : "0 4px 14px rgba(6,182,212,0.3)" : "none",
                      }}
                    >
                      {confirmed ? `Confirm — Apply to ${Math.min(preview.length, MAX_BULK)}` : "Apply to All →"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
