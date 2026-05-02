import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import BulkGradePanel from "./BulkGradePanel";
import { api } from "../../utils/api.js";

const POLL_INTERVAL_MS = 30_000;

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_CFG = {
  submitted:   { label: "Submitted",   bg: "rgba(34,197,94,0.10)",  text: "#4ade80", border: "rgba(34,197,94,0.25)" },
  graded:      { label: "Graded",      bg: "rgba(34,211,238,0.10)", text: "#22d3ee", border: "rgba(34,211,238,0.25)" },
  in_progress: { label: "In Progress", bg: "rgba(250,204,21,0.10)", text: "#facc15", border: "rgba(250,204,21,0.25)" },
  not_started: { label: "Not Started", bg: "rgba(148,163,184,0.08)",text: "#64748b", border: "rgba(148,163,184,0.2)" },
  late:        { label: "Late",        bg: "rgba(249,115,22,0.10)", text: "#fb923c", border: "rgba(249,115,22,0.25)" },
};

function getLabPayload(data) {
  return data?.lab ?? data;
}

function getSubmissionsPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.submissions)) return data.submissions;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeTestResult(result, index) {
  return {
    ...result,
    id: result.id || result.testCaseId || `test-${index + 1}`,
    description: result.description || result.name || `Test ${index + 1}`,
    earned: result.earned ?? result.earnedPoints ?? 0,
  };
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
    code: submission.code || "",
    testResults: (submission.testResults || []).map(normalizeTestResult),
    instructorNote: submission.instructorNote || "",
    gradedAt: submission.gradedAt || null,
  };
}

function StatusBadge({ status, late }) {
  const showLate = late && ["submitted", "graded"].includes(status);
  const cfg = showLate ? STATUS_CFG.late : STATUS_CFG[status] || STATUS_CFG.not_started;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>
      {showLate ? "Late" : cfg.label}
    </span>
  );
}

function ScoreBar({ score, maxScore }) {
  if (score === null || score === undefined) return <span style={{ color: "#475569", fontSize: 12 }}>—</span>;
  const pct = Math.round((score / maxScore) * 100);
  const color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#facc15" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 5, background: "#1a2540", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{score}/{maxScore}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SubmissionsPage() {
  const navigate = useNavigate();
  const { labId } = useParams();

  const [lab, setLab] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionStats, setSubmissionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const [filterScoreMax, setFilterScoreMax] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [dateFilterErr, setDateFilterErr] = useState("");
  const [sortBy, setSortBy] = useState("submittedAt"); // submittedAt | score | name
  const [sortDir, setSortDir] = useState("desc");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [newCount, setNewCount] = useState(0);
  const [selectedSub, setSelectedSub] = useState(null); // view/grade modal
  const [noteText, setNoteText] = useState("");
  const [gradeValue, setGradeValue] = useState("");
  const [gradeErr, setGradeErr] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showBulk, setShowBulk]       = useState(false);
  const [pageToast, setPageToast]     = useState(null);

  const prevSubCountRef = useRef(0);

  // Load lab + submissions
  const loadAll = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    setLoadError("");

    try {
      const [labData, submissionsData] = await Promise.all([
        api.get(`/instructor/labs/${labId}`),
        api.get(`/instructor/labs/${labId}/submissions`),
      ]);

      const nextLab = getLabPayload(labData);
      const subs = getSubmissionsPayload(submissionsData).map((submission) =>
        normalizeSubmission(submission, nextLab),
      );
      const submittedCount = subs.filter((s) => ["submitted", "graded"].includes(s.status)).length;

      if (prevSubCountRef.current > 0 && submittedCount > prevSubCountRef.current) {
        setNewCount((n) => n + (submittedCount - prevSubCountRef.current));
      }

      prevSubCountRef.current = submittedCount;
      setLab(nextLab);
      setSubmissions(subs);
      setSubmissionStats({
        ...(submissionsData?.stats || {}),
        total: submissionsData?.total ?? subs.length,
      });
      setLastUpdated(new Date());
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      setLoadError(err.message ?? "Failed to load submissions. Please try again.");
      setLab(null);
      setSubmissions([]);
      setSubmissionStats(null);
    } finally {
      setLoading(false);
    }
  }, [labId, navigate]);

  useEffect(() => { loadAll({ showLoading: true }); }, [loadAll]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(loadAll, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [autoRefresh, loadAll]);

  // Countdown display for "last updated X ago"
  const [sinceUpdate, setSinceUpdate] = useState("Just now");
  useEffect(() => {
    const iv = setInterval(() => {
      const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (diff < 5) setSinceUpdate("Just now");
      else if (diff < 60) setSinceUpdate(`${diff}s ago`);
      else setSinceUpdate(`${Math.floor(diff / 60)}m ago`);
    }, 5000);
    setSinceUpdate("Just now");
    return () => clearInterval(iv);
  }, [lastUpdated]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const graded = submissionStats?.graded ?? submissions.filter((s) => s.status === "graded").length;
  const submittedOnly = submissionStats?.submitted ?? submissions.filter((s) => s.status === "submitted").length;
  const totalStudents = submissionStats?.total ?? submissions.length;
  const submitted = submittedOnly + graded;
  const inProgress = submissionStats?.inProgress ?? submissions.filter((s) => s.status === "in_progress").length;
  const notStarted = submissionStats?.notStarted ?? submissions.filter((s) => s.status === "not_started").length;
  const lateCount = submissions.filter((s) => s.late && ["submitted", "graded"].includes(s.status)).length;
  const scores = submissions.filter((s) => s.score !== null).map((s) => s.score);
  const avgScore = submissionStats?.averageScore ?? (scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);

  // ── Filtering + sorting ────────────────────────────────────────────────────
  const validate = () => {
    if (filterDateStart && filterDateEnd && new Date(filterDateStart) > new Date(filterDateEnd)) {
      setDateFilterErr("Start date must be before end date");
      return false;
    }
    setDateFilterErr("");
    return true;
  };

  const filtered = submissions.filter((s) => {
    if (filterStatus !== "all") {
      if (filterStatus === "late" && !(s.late && ["submitted", "graded"].includes(s.status))) return false;
      if (filterStatus !== "late" && s.status !== filterStatus) return false;
    }
    if (filterScoreMin !== "" && (s.score === null || s.score < Number(filterScoreMin))) return false;
    if (filterScoreMax !== "" && (s.score === null || s.score > Number(filterScoreMax))) return false;
    if (filterDateStart && s.submittedAt && new Date(s.submittedAt) < new Date(filterDateStart)) return false;
    if (filterDateEnd && s.submittedAt && new Date(s.submittedAt) > new Date(filterDateEnd)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortBy === "score") { av = a.score ?? -1; bv = b.score ?? -1; }
    else if (sortBy === "name") { av = a.studentName; bv = b.studentName; }
    else { av = a.submittedAt || ""; bv = b.submittedAt || ""; }
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  // ── Grade / note save ──────────────────────────────────────────────────────
  const handleSaveNote = () => {
    if (!selectedSub) return;
    setSelectedSub((prev) => ({ ...prev, instructorNote: noteText }));
    setSubmissions((prev) => prev.map((s) =>
      s.id === selectedSub.id ? { ...s, instructorNote: noteText } : s,
    ));
    setPageToast({ type: "success", message: "Note updated for this view" });
    setTimeout(() => setPageToast(null), 2500);
  };

  const handleGrade = () => {
    const v = Number(gradeValue);
    if (!gradeValue || isNaN(v) || v < 0 || v > (lab?.points || 100)) {
      setGradeErr(`Score must be 0–${lab?.points || 100}`);
      return;
    }
    setGradeErr("");
    const gradedAt = new Date().toISOString();
    setSelectedSub((prev) => ({ ...prev, score: v, gradedAt, status: "graded" }));
    setSubmissions((prev) => prev.map((s) =>
      s.id === selectedSub.id ? { ...s, score: v, gradedAt, status: "graded" } : s,
    ));
    setPageToast({ type: "success", message: "Grade updated for this view" });
    setTimeout(() => setPageToast(null), 2500);
  };

  // ── Simulated ZIP download ─────────────────────────────────────────────────
  const handleDownloadZip = () => {
    const content = submitted > 0
      ? `Submissions for lab: ${lab?.title || labId}\nTotal: ${submitted}\n\nThis is a simulated export.`
      : "No submissions to download.";
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `submissions_${labId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openView = (sub) => {
    setSelectedSub(sub);
    setNoteText(sub.instructorNote || "");
    setGradeValue(sub.score !== null ? String(sub.score) : "");
    setGradeErr("");
  };

  const SortArrow = ({ col }) => (
    <span style={{ fontSize: 10, marginLeft: 3, color: sortBy === col ? "#22d3ee" : "#2d4a70" }}>
      {sortBy === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  if (loading) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
          Loading submissions...
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

  if (!lab) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center", color: "#475569" }}>
          Lab not found.
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/instructor/labs")}
            style={{
              background: "transparent", border: "1px solid #1a2540",
              borderRadius: 8, color: "#64748b", padding: "6px 12px",
              cursor: "pointer", fontSize: 13,
            }}
          >
            ← Labs
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>
              Submissions
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#475569" }}>
              {lab.title}
              {lab.dueDate && (
                <span style={{ marginLeft: 10, color: "#334155" }}>
                  · Due {fmtDateTime(lab.dueDate)}
                </span>
              )}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* New badge */}
            {newCount > 0 && (
              <button
                onClick={() => setNewCount(0)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 20,
                  background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)",
                  color: "#22d3ee", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                🔔 {newCount} new
              </button>
            )}

            {/* Last updated */}
            <span style={{ fontSize: 12, color: "#475569" }}>
              Last updated: {sinceUpdate}
            </span>

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh((a) => !a)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9,
                border: `1px solid ${autoRefresh ? "rgba(34,211,238,0.35)" : "#1a2540"}`,
                background: autoRefresh ? "rgba(34,211,238,0.08)" : "transparent",
                color: autoRefresh ? "#22d3ee" : "#64748b",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {autoRefresh ? "⏸ Auto-refresh on" : "▶ Auto-refresh off"}
              {autoRefresh && (
                <span style={{ fontSize: 10, color: "#475569" }}>· 30s</span>
              )}
            </button>

            {/* Plagiarism Check */}
            <button
              onClick={() => navigate(`/instructor/labs/${labId}/plagiarism`)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9,
                border: "1px solid rgba(248,113,113,0.3)",
                background: "rgba(248,113,113,0.07)",
                color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              🔍 Plagiarism Check
            </button>

            {/* Bulk Grade */}
            <button
              onClick={() => setShowBulk(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9,
                border: "1px solid rgba(34,211,238,0.3)",
                background: "rgba(34,211,238,0.08)",
                color: "#22d3ee", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              ⚡ Bulk Grade
            </button>

            {/* Download ZIP */}
            <button
              onClick={handleDownloadZip}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9,
                border: "1px solid #1e3a5f", background: "transparent",
                color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              ⬇ Download ZIP
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Students", value: totalStudents,  icon: "👥", color: "#e2e8f0" },
            { label: "Submitted",       value: submitted,      icon: "✅", color: "#4ade80" },
            { label: "In Progress",     value: inProgress,     icon: "⏳", color: "#facc15" },
            { label: "Not Started",     value: notStarted,     icon: "⬜", color: "#64748b" },
            { label: "Avg Score",
              value: avgScore !== null ? `${avgScore}/${lab.points || 100}` : "—",
              icon: "📊", color: avgScore !== null && avgScore / (lab.points || 100) >= 0.7 ? "#4ade80" : "#facc15" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "#0f1b33", border: "1px solid #1a2540",
              borderRadius: 13, padding: "16px 18px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Submission progress</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {submitted} / {totalStudents} submitted
              {lateCount > 0 && <span style={{ marginLeft: 8, color: "#fb923c" }}>· {lateCount} late</span>}
            </span>
          </div>
          <div style={{ height: 6, background: "#1a2540", borderRadius: 99, overflow: "hidden", display: "flex" }}>
            <div style={{
              width: `${totalStudents > 0 ? (submitted / totalStudents) * 100 : 0}%`, height: "100%",
              background: "linear-gradient(90deg, #06b6d4, #22d3ee)", borderRadius: 99, transition: "width 0.4s",
            }} />
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          background: "#0a1628", border: "1px solid #1a2540", borderRadius: 13,
          marginBottom: 16, overflow: "hidden",
        }}>
          {/* Top row: quick status filters + toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "6px 8px", borderBottom: showFilters ? "1px solid #1a2540" : "none" }}>
            <div style={{ display: "flex", gap: 3, flex: 1, flexWrap: "wrap" }}>
              {[
                { key: "all", label: "All", count: submissions.length },
                { key: "submitted", label: "Submitted", count: submittedOnly },
                { key: "graded", label: "Graded", count: graded },
                { key: "in_progress", label: "In Progress", count: inProgress },
                { key: "not_started", label: "Not Started", count: notStarted },
                { key: "late", label: "Late", count: lateCount },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilterStatus(f.key)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: "none",
                    background: filterStatus === f.key ? "#10213f" : "transparent",
                    color: filterStatus === f.key ? "#e2e8f0" : "#64748b",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  {f.label}
                  <span style={{
                    fontSize: 10,
                    color: filterStatus === f.key ? "#22d3ee" : "#334155",
                  }}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              style={{
                padding: "6px 12px", borderRadius: 8,
                border: `1px solid ${showFilters ? "rgba(34,211,238,0.3)" : "transparent"}`,
                background: showFilters ? "rgba(34,211,238,0.07)" : "transparent",
                color: showFilters ? "#22d3ee" : "#64748b",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              ⚙ Filters
            </button>
          </div>

          {/* Advanced filters */}
          {showFilters && (
            <div style={{ padding: "14px 16px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>
                  Score Range
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" placeholder="Min" value={filterScoreMin}
                    onChange={(e) => setFilterScoreMin(e.target.value)} min="0" max={lab.points || 100}
                    style={{ width: 70, background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
                  />
                  <span style={{ color: "#334155", fontSize: 12 }}>—</span>
                  <input type="number" placeholder="Max" value={filterScoreMax}
                    onChange={(e) => setFilterScoreMax(e.target.value)} min="0" max={lab.points || 100}
                    style={{ width: 70, background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>
                  Submission Date
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="datetime-local" value={filterDateStart}
                    onChange={(e) => { setFilterDateStart(e.target.value); setDateFilterErr(""); }}
                    style={{ background: "#0f1b33", border: `1px solid ${dateFilterErr ? "rgba(239,68,68,0.5)" : "#1a2540"}`, borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, outline: "none", colorScheme: "dark" }}
                  />
                  <span style={{ color: "#334155", fontSize: 12 }}>→</span>
                  <input type="datetime-local" value={filterDateEnd}
                    onChange={(e) => { setFilterDateEnd(e.target.value); setDateFilterErr(""); }}
                    style={{ background: "#0f1b33", border: `1px solid ${dateFilterErr ? "rgba(239,68,68,0.5)" : "#1a2540"}`, borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, outline: "none", colorScheme: "dark" }}
                  />
                </div>
                {dateFilterErr && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>{dateFilterErr}</p>}
              </div>

              <button
                onClick={() => {
                  if (!validate()) return;
                }}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "rgba(34,211,238,0.12)", color: "#22d3ee", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(34,211,238,0.2)" }}
              >
                Apply
              </button>
              <button
                onClick={() => { setFilterScoreMin(""); setFilterScoreMax(""); setFilterDateStart(""); setFilterDateEnd(""); setDateFilterErr(""); }}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #1a2540", background: "transparent", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        {sorted.length === 0 && submissions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 32px", background: "#0f1b33", border: "1px dashed #1e3a5f", borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 17 }}>No submissions yet</h3>
            <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
              Students haven't submitted anything for this lab yet.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, color: "#475569" }}>
            No submissions match the current filters.
          </div>
        ) : (
          <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 14, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 160px 130px 80px 110px",
              padding: "11px 18px",
              borderBottom: "1px solid #1a2540",
              fontSize: 10, fontWeight: 700, color: "#475569",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {[
                { label: "Student", col: "name" },
                { label: "Status",  col: null },
                { label: "Submitted", col: "submittedAt" },
                { label: "Score",   col: "score" },
                { label: "Language", col: null },
                { label: "Actions", col: null },
              ].map(({ label, col }) => (
                <span
                  key={label}
                  onClick={col ? () => toggleSort(col) : undefined}
                  style={{ cursor: col ? "pointer" : "default", userSelect: "none" }}
                >
                  {label}{col && <SortArrow col={col} />}
                </span>
              ))}
            </div>

            {sorted.map((sub, idx) => {
              const isLast = idx === sorted.length - 1;
              const isLateSubmission = sub.late && ["submitted", "graded"].includes(sub.status);
              const rowBg = isLateSubmission
                ? "rgba(249,115,22,0.04)"
                : "transparent";

              return (
                <div
                  key={sub.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 110px 160px 130px 80px 110px",
                    padding: "13px 18px",
                    alignItems: "center",
                    borderBottom: isLast ? "none" : "1px solid #0f1b33",
                    background: rowBg,
                    transition: "background 0.15s",
                    borderLeft: isLateSubmission ? "3px solid rgba(249,115,22,0.5)" : "3px solid transparent",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = isLateSubmission ? "rgba(249,115,22,0.07)" : "rgba(16,33,63,0.5)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = rowBg}
                >
                  {/* Student */}
                  <div>
                    <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{sub.studentName}</div>
                    <div style={{ color: "#334155", fontSize: 11 }}>{sub.studentEmail}</div>
                  </div>

                  {/* Status */}
                  <StatusBadge status={sub.status} late={sub.late} />

                  {/* Submitted At */}
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDateTime(sub.submittedAt)}</div>
                    {sub.submittedAt && (
                      <div style={{ color: "#334155", fontSize: 11 }}>{fmtRelative(sub.submittedAt)}</div>
                    )}
                  </div>

                  {/* Score */}
                  <ScoreBar score={sub.score} maxScore={sub.maxScore} />

                  {/* Language */}
                  <span style={{ fontSize: 11, color: "#22d3ee", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 6, padding: "2px 8px" }}>
                    {sub.language || "—"}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      onClick={() => openView(sub)}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      View
                    </button>
                    {sub.status === "submitted" && (
                      <button
                        onClick={() => navigate(`/instructor/labs/${labId}/submissions/${sub.id}/grade`)}
                        style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(34,211,238,0.2)", background: "rgba(34,211,238,0.12)", color: "#22d3ee", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                      >
                        Grade
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Submission Detail Modal ── */}
      {selectedSub && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div style={{
            background: "#0d1b30", border: "1px solid #1e3a5f", borderRadius: 18,
            width: "100%", maxWidth: 780, maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #1a2540" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>
                  {selectedSub.studentName}
                </h3>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                  {selectedSub.studentEmail} · {lab.title}
                  {selectedSub.late && (
                    <span style={{ marginLeft: 8, color: "#fb923c", fontWeight: 700 }}>⚠ Late submission</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusBadge status={selectedSub.status} late={selectedSub.late} />
                <button onClick={() => setSelectedSub(null)} style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
              </div>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Submission info row */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { label: "Submitted", value: fmtDateTime(selectedSub.submittedAt) },
                  { label: "Language", value: selectedSub.language || "—" },
                  { label: "Score", value: selectedSub.score !== null ? `${selectedSub.score} / ${selectedSub.maxScore}` : "Ungraded" },
                  { label: "Graded At", value: fmtDateTime(selectedSub.gradedAt) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 9, padding: "10px 14px", minWidth: 130 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Student code */}
              {selectedSub.code ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Submitted Code</div>
                  <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "6px 12px", background: "#071020", borderBottom: "1px solid #1a2540", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "#475569" }}>{selectedSub.language}</span>
                      <span style={{ fontSize: 11, color: "#334155" }}>{selectedSub.code.split("\n").length} lines</span>
                    </div>
                    <pre style={{ margin: 0, padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8", overflowX: "auto", lineHeight: 1.6, maxHeight: 260, overflowY: "auto" }}>
                      {selectedSub.code}
                    </pre>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "24px", textAlign: "center", background: "#0a1628", border: "1px dashed #1e3a5f", borderRadius: 10, color: "#475569", fontSize: 13 }}>
                  No code submitted yet
                </div>
              )}

              {/* Test results */}
              {selectedSub.testResults && selectedSub.testResults.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Test Results</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedSub.testResults.map((tr) => (
                      <div key={tr.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "9px 13px", background: "#0a1628", border: `1px solid ${tr.status === "pass" ? "rgba(74,222,128,0.15)" : tr.status === "fail" ? "rgba(239,68,68,0.15)" : "#1a2540"}`,
                        borderRadius: 8,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14 }}>{tr.status === "pass" ? "✓" : tr.status === "fail" ? "✕" : "•"}</span>
                          <span style={{ fontSize: 13, color: "#94a3b8" }}>{tr.description || `Test ${tr.id}`}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: tr.status === "pass" ? "#4ade80" : tr.status === "fail" ? "#f87171" : "#475569" }}>
                            {tr.status === "pass" ? `+${tr.earned}` : tr.status === "fail" ? "0" : "—"} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grading */}
              <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, padding: "16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Manual Grade Override</div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <input
                      type="number" min="0" max={lab.points || 100}
                      placeholder={`0–${lab.points || 100}`}
                      value={gradeValue}
                      onChange={(e) => { setGradeValue(e.target.value); setGradeErr(""); }}
                      style={{
                        width: 100, background: "#0f1b33",
                        border: `1px solid ${gradeErr ? "rgba(239,68,68,0.5)" : "#1a2540"}`,
                        borderRadius: 9, padding: "9px 12px", color: "#e2e8f0",
                        fontSize: 14, outline: "none",
                      }}
                    />
                    {gradeErr && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>{gradeErr}</p>}
                  </div>
                  <span style={{ color: "#475569", fontSize: 14, paddingTop: 10 }}>/ {lab.points || 100}</span>
                  <button
                    onClick={handleGrade}
                    style={{
                      padding: "9px 18px", borderRadius: 9, border: "none",
                      background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                      color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Save Grade
                  </button>
                </div>
              </div>

              {/* Private note */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                  Private Note <span style={{ fontSize: 10, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "#334155" }}>(not visible to student)</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Add a private note about this submission..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  style={{
                    width: "100%", background: "#0a1628", border: "1px solid #1a2540",
                    borderRadius: 9, padding: "10px 12px", color: "#e2e8f0",
                    fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    onClick={handleSaveNote}
                    style={{
                      padding: "7px 16px", borderRadius: 8, border: "1px solid #1e3a5f",
                      background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {pageToast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 200,
          padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", gap: 8, maxWidth: 380,
          background: pageToast.type === "success" ? "linear-gradient(135deg,#064e3b,#065f46)" : "linear-gradient(135deg,#7f1d1d,#991b1b)",
          border: `1px solid ${pageToast.type === "success" ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: pageToast.type === "success" ? "#6ee7b7" : "#fca5a5",
        }}>
          <span>{pageToast.type === "success" ? "✓" : "✕"}</span>
          {pageToast.message}
        </div>
      )}

      {showBulk && (
        <BulkGradePanel
          lab={lab}
          submissions={submissions}
          onClose={() => setShowBulk(false)}
          onApplied={loadAll}
          showToast={(type, msg) => {
            setPageToast({ type, message: msg });
            setTimeout(() => setPageToast(null), 3500);
          }}
        />
      )}
    </InstructorLayout>
  );
}
