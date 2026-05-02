import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";

// ── Rubric definition ────────────────────────────────────────────────────────
const RUBRIC_CRITERIA = [
  { key: "comments",   label: "Code Comments",  max: 5, desc: "Clarity and adequacy of inline comments" },
  { key: "style",      label: "Code Style",      max: 5, desc: "Naming, formatting, and consistency" },
  { key: "efficiency", label: "Efficiency",      max: 5, desc: "Algorithmic efficiency and resource use" },
];
const MANUAL_MAX = RUBRIC_CRITERIA.reduce((s, c) => s + c.max, 0); // 15

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getLabPayload(data) {
  return data?.lab ?? data;
}

function getSubmissionsPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.submissions)) return data.submissions;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getSubmissionPayload(data) {
  return data?.submission ?? data;
}

function isSameSubmission(submission, subId) {
  return [submission?.id, submission?.submissionId].some((id) => String(id) === String(subId));
}

function normalizeTestResult(result, index) {
  return {
    ...result,
    id: result.id || result.testCaseId || `test-${index + 1}`,
    description: result.description || result.name || `Test ${index + 1}`,
    points: result.points ?? result.maxPoints ?? 0,
    earned: result.earned ?? result.earnedPoints ?? 0,
  };
}

function getSubmissionCode(submission) {
  if (submission.code) return submission.code;
  if (submission.fileContents) return submission.fileContents;
  if (submission.files && typeof submission.files === "object") {
    return Object.entries(submission.files)
      .map(([name, content]) => `// ${name}\n${content}`)
      .join("\n\n");
  }
  return "";
}

function normalizeSubmission(submission, lab) {
  const student = submission.student || submission.studentDetails || {};
  const submittedAt = submission.submittedAt || null;
  const late =
    submission.late ??
    (!!submittedAt && !!lab?.dueDate && new Date(submittedAt) > new Date(lab.dueDate));

  return {
    ...submission,
    id: submission.id || submission.submissionId,
    labId: submission.labId || lab?.id,
    studentId: submission.studentId || student.id,
    studentName:
      submission.studentName ||
      student.fullName ||
      student.name ||
      submission.studentEmail ||
      "Student",
    studentEmail: submission.studentEmail || student.email || "",
    status: submission.status || "not_started",
    submittedAt,
    score: submission.score ?? null,
    maxScore: submission.maxScore || lab?.points || 100,
    late,
    language: submission.language || lab?.language || lab?.languages?.[0] || "",
    code: getSubmissionCode(submission),
    testResults: (submission.testResults || []).map(normalizeTestResult),
    rubric: submission.rubric || { comments: null, style: null, efficiency: null },
    inlineComments: submission.inlineComments || {},
    overallFeedback: submission.overallFeedback || submission.feedback || "",
    gradedAt: submission.gradedAt || null,
  };
}

function ScoreDots({ value, max, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: max + 1 }, (_, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          title={`${i} / ${max}`}
          style={{
            width: 28, height: 28, borderRadius: "50%",
            border: `2px solid ${value === i ? "#22d3ee" : "#1e3a5f"}`,
            background: value === i ? "#22d3ee" : value !== null && i <= value ? "rgba(34,211,238,0.25)" : "transparent",
            cursor: "pointer", fontSize: 11, fontWeight: 700,
            color: value === i ? "#0a1628" : value !== null && i <= value ? "#22d3ee" : "#334155",
            transition: "all 0.15s",
          }}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function GradingPage() {
  const navigate = useNavigate();
  const { labId, subId } = useParams();

  const [lab, setLab]   = useState(null);
  const [sub, setSub]   = useState(null);
  const [allSubs, setAllSubs] = useState([]); // for prev/next navigation

  // Rubric
  const [rubric, setRubric] = useState({ comments: null, style: null, efficiency: null });
  // Inline comments: { [lineNumber]: string }
  const [inlineComments, setInlineComments] = useState({});
  const [activeCommentLine, setActiveCommentLine] = useState(null);
  const [commentDraft, setCommentDraft]     = useState("");
  // Overall feedback
  const [feedback, setFeedback] = useState("");
  // UI state
  const [errors, setErrors]     = useState({});
  const [saved, setSaved]       = useState(false);
  const [isDirty, setIsDirty]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);
  const commentInputRef = useRef(null);
  const hasHydratedRef = useRef(false);
  const suppressDirtyRef = useRef(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    hasHydratedRef.current = false;
    suppressDirtyRef.current = true;

    try {
      const [labData, submissionsData] = await Promise.all([
        api.get(`/instructor/labs/${labId}`),
        api.get(`/instructor/labs/${labId}/submissions`),
      ]);

      const nextLab = getLabPayload(labData);
      const labSubs = getSubmissionsPayload(submissionsData).map((submission) =>
        normalizeSubmission(submission, nextLab),
      );
      const nextSub = labSubs.find((submission) => isSameSubmission(submission, subId));

      setLab(nextLab);
      setAllSubs(labSubs);
      setSub(nextSub || null);
      setRubric(nextSub?.rubric || { comments: null, style: null, efficiency: null });
      setInlineComments(nextSub?.inlineComments || {});
      setFeedback(nextSub?.overallFeedback || "");
      setErrors({});
      setSaved(nextSub?.status === "graded");
      setIsDirty(false);
      hasHydratedRef.current = true;

      if (!nextSub) {
        setLoadError("Submission not found.");
      }
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      setLab(null);
      setSub(null);
      setAllSubs([]);
      setLoadError(err.message ?? "Failed to load submission. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [labId, subId, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mark dirty on rubric/feedback changes
  useEffect(() => {
    if (!hasHydratedRef.current) return;
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }
    setIsDirty(true);
    setSaved(false);
  }, [rubric, feedback, inlineComments]);

  // ── Derived scores ─────────────────────────────────────────────────────────
  const autoScore = sub?.testResults
    ? sub.testResults.reduce((s, tc) => s + (tc.earned || 0), 0)
    : (sub?.score ?? 0);
  const autoMax   = sub?.testResults
    ? sub.testResults.reduce((s, tc) => s + (tc.points || 0), 0)
    : (sub?.maxScore ?? 100);

  const manualScore = RUBRIC_CRITERIA.reduce(
    (s, c) => s + (rubric[c.key] ?? 0), 0,
  );

  // Total is auto + manual, capped to lab.points
  const labPoints = lab?.points || 100;
  const autoWeight    = labPoints - MANUAL_MAX;   // e.g. 85 for 100pt lab
  const scaledAuto    = autoMax > 0
    ? Math.round((autoScore / autoMax) * autoWeight)
    : 0;
  const totalScore    = Math.min(scaledAuto + manualScore, labPoints);

  // ── Rubric helpers ─────────────────────────────────────────────────────────
  const setRubricVal = (key, val) =>
    setRubric((prev) => ({ ...prev, [key]: val }));

  // ── Inline comments ────────────────────────────────────────────────────────
  const codeLines = (sub?.code || "").split("\n");

  const handleLineClick = (lineNo) => {
    if (activeCommentLine === lineNo) {
      setActiveCommentLine(null);
      setCommentDraft("");
    } else {
      setActiveCommentLine(lineNo);
      setCommentDraft(inlineComments[lineNo] || "");
      setTimeout(() => commentInputRef.current?.focus(), 50);
    }
  };

  const saveLineComment = () => {
    if (!commentDraft.trim()) {
      const updated = { ...inlineComments };
      delete updated[activeCommentLine];
      setInlineComments(updated);
    } else {
      setInlineComments((prev) => ({ ...prev, [activeCommentLine]: commentDraft.trim() }));
    }
    setActiveCommentLine(null);
    setCommentDraft("");
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    RUBRIC_CRITERIA.forEach((c) => {
      if (rubric[c.key] === null || rubric[c.key] === undefined)
        errs[c.key] = `Score required`;
    });
    if (!feedback || feedback.trim().length < 20)
      errs.feedback = "Feedback must be at least 20 characters";
    return errs;
  };

  // ── Save grade ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving || !sub) return;

    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast("error", "Fix the errors below before saving");
      return;
    }

    const payload = {
      score: totalScore,
      rubric: {
        comments: rubric.comments,
        style: rubric.style,
        efficiency: rubric.efficiency,
      },
      inlineComments,
      overallFeedback: feedback.trim(),
      status: "graded",
    };

    setSaving(true);

    try {
      const response = await api.patch(`/instructor/submissions/${subId}/grade`, payload);
      const fallback = {
        ...sub,
        ...payload,
        maxScore: labPoints,
        gradedAt: new Date().toISOString(),
      };
      const savedSub = normalizeSubmission(getSubmissionPayload(response) || fallback, lab);
      const remaining = allSubs.filter(
        (s) => s.status === "submitted" && s.id !== subId,
      );

      setSub(savedSub);
      setAllSubs((prev) => prev.map((item) => (
        isSameSubmission(item, savedSub.id) ? savedSub : item
      )));
      setSaved(true);
      setIsDirty(false);
      showToast("success", "Grade saved successfully · Student notified via email");

      // Auto-navigate to next ungraded after short delay
      setTimeout(() => {
        if (remaining.length > 0) {
          navigate(`/instructor/labs/${labId}/submissions/${remaining[0].id}/grade`);
        } else {
          showToast("success", "All submissions graded! ✓");
        }
      }, 2000);
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      showToast("error", err.message ?? "Failed to save grade. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), type === "success" && msg.includes("✓") ? 6000 : 3500);
  };

  // ── Prev / Next ungraded ───────────────────────────────────────────────────
  const ungraded = allSubs.filter((s) => s.status === "submitted");
  const curIdx   = ungraded.findIndex((s) => s.id === subId);
  const prevSub  = curIdx > 0 ? ungraded[curIdx - 1] : null;
  const nextSub  = curIdx >= 0 && curIdx < ungraded.length - 1 ? ungraded[curIdx + 1] : null;

  const navTo = (s) => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Leave anyway?")) return;
    }
    navigate(`/instructor/labs/${labId}/submissions/${s.id}/grade`);
  };

  if (loading) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
          Loading submission...
        </div>
      </InstructorLayout>
    );
  }

  if (loadError) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center", color: "#f87171" }}>
          {loadError}
        </div>
      </InstructorLayout>
    );
  }

  if (!lab || !sub) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center", color: "#475569" }}>
          Submission not found.
        </div>
      </InstructorLayout>
    );
  }

  const rubricFilled = RUBRIC_CRITERIA.every((c) => rubric[c.key] !== null && rubric[c.key] !== undefined);

  return (
    <InstructorLayout>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 200,
          padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", gap: 8, maxWidth: 400,
          background: toast.type === "success" ? "linear-gradient(135deg,#064e3b,#065f46)" : "linear-gradient(135deg,#7f1d1d,#991b1b)",
          border: `1px solid ${toast.type === "success" ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#6ee7b7" : "#fca5a5",
        }}>
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}

      {/* Unsaved changes banner */}
      {isDirty && !saved && (
        <div style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(250,204,21,0.1)", borderBottom: "1px solid rgba(250,204,21,0.25)",
          padding: "8px 32px", display: "flex", alignItems: "center", gap: 10, fontSize: 13,
        }}>
          <span style={{ color: "#fbbf24" }}>⚠ Unsaved changes</span>
        </div>
      )}

      <div style={{ padding: "20px 24px" }}>
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate(`/instructor/labs/${labId}/submissions`)}
            style={{ background: "transparent", border: "1px solid #1a2540", borderRadius: 8, color: "#64748b", padding: "6px 12px", cursor: "pointer", fontSize: 13 }}
          >
            ← Submissions
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
              Grading: {sub.studentName}
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>
              {lab.title}
              {sub.late && <span style={{ marginLeft: 8, color: "#fb923c", fontWeight: 700 }}>⚠ Late submission</span>}
              {saved && <span style={{ marginLeft: 8, color: "#4ade80" }}>· Graded</span>}
            </p>
          </div>
          {/* Prev / Next */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#475569" }}>
              {ungraded.length > 0
                ? `${curIdx + 1} of ${ungraded.length} ungraded`
                : "No ungraded submissions"}
            </span>
            <button
              onClick={() => prevSub && navTo(prevSub)}
              disabled={!prevSub}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "1px solid #1a2540",
                background: "transparent", color: prevSub ? "#94a3b8" : "#1e3a5f",
                fontSize: 13, cursor: prevSub ? "pointer" : "default",
              }}
            >
              ‹ Prev
            </button>
            <button
              onClick={() => nextSub && navTo(nextSub)}
              disabled={!nextSub}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "1px solid #1a2540",
                background: "transparent", color: nextSub ? "#94a3b8" : "#1e3a5f",
                fontSize: 13, cursor: nextSub ? "pointer" : "default",
              }}
            >
              Next ›
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 20px", borderRadius: 9, border: "none",
                background: rubricFilled && !saving ? "linear-gradient(135deg,#06b6d4,#0891b2)" : "#0e2a45",
                color: rubricFilled && !saving ? "#fff" : "#334155",
                fontSize: 13, fontWeight: 700, cursor: rubricFilled && !saving ? "pointer" : "default",
                boxShadow: rubricFilled && !saving ? "0 4px 14px rgba(6,182,212,0.3)" : "none",
              }}
            >
              {saving ? "Saving..." : "Save Grade"}
            </button>
          </div>
        </div>

        {/* ── 3-Panel layout ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px 280px", gap: 14, minHeight: "calc(100vh - 160px)" }}>

          {/* ── PANEL 1: Code Viewer ── */}
          <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a2540", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Student Code</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#22d3ee", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 6, padding: "2px 8px" }}>
                  {sub.language}
                </span>
                <span style={{ fontSize: 11, color: "#475569" }}>{codeLines.length} lines</span>
                {Object.keys(inlineComments).length > 0 && (
                  <span style={{ fontSize: 11, color: "#facc15", background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 6, padding: "2px 8px" }}>
                    {Object.keys(inlineComments).length} comment{Object.keys(inlineComments).length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", fontSize: 12, fontFamily: "monospace", lineHeight: 1.7 }}>
              {codeLines.length === 0 || (codeLines.length === 1 && !codeLines[0]) ? (
                <div style={{ padding: 24, color: "#334155", textAlign: "center", fontSize: 13 }}>No code submitted</div>
              ) : (
                codeLines.map((line, i) => {
                  const lineNo   = i + 1;
                  const hasNote  = !!inlineComments[lineNo];
                  const isActive = activeCommentLine === lineNo;
                  return (
                    <div key={lineNo}>
                      <div
                        onClick={() => handleLineClick(lineNo)}
                        title="Click to add inline comment"
                        style={{
                          display: "flex", cursor: "pointer",
                          background: isActive ? "rgba(34,211,238,0.06)" : hasNote ? "rgba(250,204,21,0.04)" : "transparent",
                          borderLeft: isActive ? "3px solid #22d3ee" : hasNote ? "3px solid rgba(250,204,21,0.5)" : "3px solid transparent",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => !isActive && (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => !isActive && !hasNote && (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ width: 44, minWidth: 44, padding: "0 10px", color: "#2d4a70", textAlign: "right", userSelect: "none", borderRight: "1px solid #0f1b33" }}>
                          {lineNo}
                        </span>
                        <pre style={{ margin: 0, padding: "0 12px", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#94a3b8" }}>
                          {line || " "}
                        </pre>
                        {hasNote && !isActive && (
                          <span style={{ alignSelf: "center", marginRight: 8, fontSize: 14, color: "#facc15" }} title={inlineComments[lineNo]}>💬</span>
                        )}
                      </div>
                      {/* Inline comment editor */}
                      {isActive && (
                        <div style={{
                          background: "#071020", borderTop: "1px solid #1a2540", borderBottom: "1px solid #1a2540",
                          padding: "8px 12px", display: "flex", gap: 8, alignItems: "flex-start",
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>
                              Line {lineNo} comment (leave empty to remove)
                            </div>
                            <textarea
                              ref={commentInputRef}
                              rows={2}
                              value={commentDraft}
                              onChange={(e) => setCommentDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveLineComment(); } if (e.key === "Escape") { setActiveCommentLine(null); setCommentDraft(""); } }}
                              placeholder="Add comment… (Enter to save, Esc to cancel)"
                              style={{
                                width: "100%", background: "#0a1628", border: "1px solid #1e3a5f",
                                borderRadius: 7, padding: "6px 10px", color: "#e2e8f0",
                                fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 16 }}>
                            <button onClick={saveLineComment} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#0e7490", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Save</button>
                            <button onClick={() => { setActiveCommentLine(null); setCommentDraft(""); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1a2540", background: "transparent", color: "#64748b", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {/* Show saved comment */}
                      {hasNote && !isActive && (
                        <div style={{
                          background: "rgba(250,204,21,0.05)", borderLeft: "3px solid rgba(250,204,21,0.4)",
                          padding: "5px 12px 5px 55px", fontSize: 11, color: "#ca8a04",
                          fontStyle: "italic",
                        }}>
                          💬 {inlineComments[lineNo]}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── PANEL 2: Rubric + Feedback ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Score summary */}
            <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Score Summary</div>
              {[
                { label: "Auto (tests)", value: autoScore, max: autoMax, color: "#22d3ee" },
                { label: `Manual (rubric)`, value: manualScore, max: MANUAL_MAX, color: "#a78bfa" },
              ].map(({ label, value, max, color }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{value} / {max}</span>
                  </div>
                  <div style={{ height: 4, background: "#1a2540", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1a2540", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: totalScore / labPoints >= 0.8 ? "#4ade80" : totalScore / labPoints >= 0.6 ? "#facc15" : "#f87171" }}>
                  {totalScore} <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>/ {labPoints}</span>
                </span>
              </div>
            </div>

            {/* Rubric */}
            <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, padding: "16px 18px", flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>Manual Rubric</div>
              {RUBRIC_CRITERIA.map((c) => (
                <div key={c.key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{c.label}</span>
                    <span style={{ fontSize: 12, color: rubric[c.key] !== null ? "#a78bfa" : "#334155" }}>
                      {rubric[c.key] !== null ? `${rubric[c.key]} / ${c.max}` : "—"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#334155", marginBottom: 6 }}>{c.desc}</div>
                  <ScoreDots value={rubric[c.key]} max={c.max} onChange={(v) => setRubricVal(c.key, v)} />
                  {errors[c.key] && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>{errors[c.key]}</p>}
                </div>
              ))}
            </div>

            {/* Overall feedback */}
            <div style={{ background: "#0f1b33", border: `1px solid ${errors.feedback ? "rgba(239,68,68,0.4)" : "#1a2540"}`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                Overall Feedback <span style={{ color: "#f87171" }}>*</span>
              </div>
              <textarea
                rows={6}
                placeholder="Write feedback covering strengths, areas for improvement, and any specific observations about code quality..."
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); if (errors.feedback) setErrors((prev) => ({ ...prev, feedback: null })); }}
                style={{
                  width: "100%", background: "#0a1628",
                  border: "1px solid #1a2540", borderRadius: 9,
                  padding: "10px 12px", color: "#e2e8f0",
                  fontSize: 13, resize: "vertical", outline: "none",
                  fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {errors.feedback
                  ? <p style={{ margin: 0, fontSize: 11, color: "#f87171" }}>{errors.feedback}</p>
                  : <span />}
                <span style={{ fontSize: 11, color: feedback.length < 20 ? "#475569" : "#4ade80" }}>
                  {feedback.length} / 20 min
                </span>
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "12px", borderRadius: 10, border: "none",
                background: rubricFilled && feedback.trim().length >= 20 && !saving
                  ? "linear-gradient(135deg,#06b6d4,#0891b2)"
                  : "#0e2a45",
                color: rubricFilled && feedback.trim().length >= 20 && !saving ? "#fff" : "#334155",
                fontSize: 14, fontWeight: 700,
                cursor: rubricFilled && feedback.trim().length >= 20 && !saving ? "pointer" : "default",
                boxShadow: rubricFilled && feedback.trim().length >= 20 && !saving ? "0 4px 14px rgba(6,182,212,0.3)" : "none",
              }}
            >
              {saving ? "Saving..." : "Save Grade"}
            </button>
          </div>

          {/* ── PANEL 3: Test Results ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Submission info */}
            <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Submission Info</div>
              {[
                { label: "Submitted", value: fmtDateTime(sub.submittedAt) },
                { label: "Language",  value: sub.language || "—" },
                { label: "Status",    value: sub.status },
                { label: "Graded At", value: fmtDateTime(sub.gradedAt) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{label}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, textTransform: "capitalize" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Test results */}
            <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, padding: "14px 16px", flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                Test Results
                {sub.testResults?.length > 0 && (
                  <span style={{ marginLeft: 8, fontWeight: 500, color: "#22d3ee" }}>
                    {sub.testResults.filter((t) => t.status === "pass").length}/{sub.testResults.length} passed
                  </span>
                )}
              </div>
              {!sub.testResults || sub.testResults.length === 0 ? (
                <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: "20px 0" }}>No test results</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {sub.testResults.map((tr, i) => (
                    <div key={tr.id || i} style={{
                      padding: "9px 11px", borderRadius: 9,
                      background: tr.status === "pass" ? "rgba(74,222,128,0.06)" : tr.status === "fail" ? "rgba(239,68,68,0.06)" : "#0a1628",
                      border: `1px solid ${tr.status === "pass" ? "rgba(74,222,128,0.2)" : tr.status === "fail" ? "rgba(239,68,68,0.2)" : "#1a2540"}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, color: tr.status === "pass" ? "#4ade80" : tr.status === "fail" ? "#f87171" : "#475569" }}>
                            {tr.status === "pass" ? "✓" : tr.status === "fail" ? "✕" : "•"}
                          </span>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{tr.description || `Test ${i + 1}`}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tr.status === "pass" ? "#4ade80" : "#f87171" }}>
                          {tr.status === "pass" ? `+${tr.earned}` : "0"} pts
                        </span>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1px solid #1a2540", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>Test total</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>{autoScore} / {autoMax}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Inline comments summary */}
            {Object.keys(inlineComments).length > 0 && (
              <div style={{ background: "#0f1b33", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                  Inline Comments ({Object.keys(inlineComments).length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {Object.entries(inlineComments)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([line, note]) => (
                      <div key={line} style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#facc15", background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" }}>
                          L{line}
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>{note}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </InstructorLayout>
  );
}
