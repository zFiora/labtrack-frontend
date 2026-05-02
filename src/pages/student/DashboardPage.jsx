import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

// ─── Pure helpers (no storage) ────────────────────────────────────────────────
function parseDeadline(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hoursUntil(deadline) {
  return (deadline.getTime() - Date.now()) / 3600000;
}

function fmtDeadline(deadline) {
  return deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeTime(iso) {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Style tokens ─────────────────────────────────────────────────────────────
const card   = "#1a2238";
const border = "#1a2540";
const muted  = "#8898b3";
const warn   = "#fbbf24";
const danger = "#f87171";

function progressBarColor(pct) {
  if (pct <= 40) return "bg-red-500";
  if (pct <= 75) return "bg-yellow-400";
  return "bg-green-500";
}

function deadlineColor(hrs) {
  if (hrs < 0)  return danger;
  if (hrs < 48) return warn;
  return muted;
}

function deadlineIcon(hrs) {
  if (hrs < 0)  return "⚠";
  if (hrs < 48) return "⏰";
  return "📅";
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [refresh, setRefresh]     = useState(0);
  const [joinModal, setJoinModal] = useState(false);
  const [joinCode, setJoinCode]   = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining]     = useState(false);

  const handleJoin = async (e) => {
    e.preventDefault();
    setJoinError("");
    setJoining(true);
    try {
      await api.post("/student/courses/join", { joinCode: joinCode.trim().toUpperCase() });
      setJoinModal(false);
      setJoinCode("");
      setRefresh((r) => r + 1);
    } catch (err) {
      setJoinError(err.message ?? "Invalid join code. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }

    Promise.all([
      // refresh is a counter that re-triggers this effect after a successful join
      api.get("/student/labs?status=active"),
      api.get("/student/grades"),
      api.get("/student/courses?enrolled=true"),
    ])
      .then(([labs, grades, courses]) => {
        // Build a progress map from the submissionStatus embedded on each lab
        const progress = {};
        labs.forEach((lab) => {
          progress[lab.id] = {
            status:      lab.submissionStatus ?? "not_started",
            submittedAt: lab.submittedAt      ?? null,
            score:       lab.score            ?? null,
          };
        });

        const sortedLabs = [...labs].sort((a, b) => {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return da - db;
        });

        const labStatus = (labId) => progress[labId]?.status ?? "not_started";

        // Upcoming: not submitted/graded, due within 72 h, max 3
        const upcoming = sortedLabs
          .filter((l) => {
            const s = labStatus(l.id);
            if (s === "submitted" || s === "graded") return false;
            const d = parseDeadline(l.dueDate);
            return d ? hoursUntil(d) < 72 : false;
          })
          .slice(0, 3);

        // Per-course completion (labs linked by courseCode when available)
        const courseStats = courses.map((c) => {
          const courseLabs = c.courseCode
            ? sortedLabs.filter((l) => l.courseCode === c.courseCode)
            : sortedLabs;
          const done = courseLabs.filter((l) => {
            const s = labStatus(l.id);
            return s === "submitted" || s === "graded";
          }).length;
          return { ...c, total: courseLabs.length, done };
        });

        // Summary stats
        const completed  = labs.filter((l) => { const s = labStatus(l.id); return s === "submitted" || s === "graded"; }).length;
        const inProgress = labs.filter((l) => labStatus(l.id) === "in_progress").length;

        // avgScore from the grades endpoint (scores are not on lab objects)
        const scoredGrades = grades.filter((g) => g.score != null);
        const avgScore = scoredGrades.length > 0
          ? Math.round(scoredGrades.reduce((a, g) => a + g.score, 0) / scoredGrades.length)
          : null;

        // Recent activity feed from labs that have been submitted
        const recent = labs
          .filter((l) => progress[l.id]?.submittedAt)
          .map((l) => ({
            labId:       l.id,
            title:       l.title,
            submittedAt: progress[l.id].submittedAt,
            status:      progress[l.id].status,
          }))
          .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
          .slice(0, 4);

        setData({ user, labs: sortedLabs, upcoming, courseStats, completed, inProgress, avgScore, recent, progress });
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load dashboard. Please refresh.");
      });
  }, [navigate, refresh]);

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-red-400">{error}</div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  const { user, labs, upcoming, courseStats, completed, inProgress, avgScore, recent, progress } = data;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const labStatus = (labId) => progress[labId]?.status ?? "not_started";

  const stats = [
    { value: labs.length,                             label: "Active Labs",   color: "text-cyan-400"   },
    { value: completed,                               label: "Completed",     color: "text-green-400"  },
    { value: inProgress,                              label: "In Progress",   color: "text-yellow-400" },
    { value: avgScore === null ? "—" : `${avgScore}%`, label: "Avg Score",   color: "text-green-400"  },
  ];

  return (
    <DashboardLayout>
      <div>
        {/* Greeting */}
        <h1 className="text-3xl font-bold text-white">
          {greeting()}, {user.fullName || "Student"} 👋
        </h1>
        <p className="mt-2 text-gray-400">{today}</p>

        {/* Stats row */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-3xl bg-[#1a2238] p-6 shadow-sm">
              <h2 className={`text-4xl font-bold ${s.color}`}>{s.value}</h2>
              <p className="mt-2 text-lg text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 xl:grid-cols-3">

          {/* Left: Upcoming labs */}
          <div className="xl:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">Upcoming Labs</h2>
              <button onClick={() => navigate("/labs")} className="text-sm font-medium text-cyan-400 hover:text-cyan-300">
                View all
              </button>
            </div>

            {upcoming.length === 0 ? (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 14, color: muted }}>No urgent labs — you are all caught up!</div>
              </div>
            ) : (
              upcoming.map((lab) => {
                const deadline = parseDeadline(lab.dueDate);
                const hrs      = deadline ? hoursUntil(deadline) : null;
                const status   = labStatus(lab.id);
                const pct      = status === "in_progress" ? 40 : 0;

                return (
                  <div key={lab.id} className="rounded-3xl bg-[#1a2238] p-6 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{lab.title}</h3>
                        {deadline && (
                          <p className="mt-1 text-sm" style={{ color: hrs === null ? muted : deadlineColor(hrs) }}>
                            {hrs === null ? "" : deadlineIcon(hrs)}{" "}
                            {hrs !== null && hrs < 0 ? "Overdue" : `Due ${fmtDeadline(deadline)}`}
                          </p>
                        )}
                      </div>
                      <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400 capitalize">
                        {status.replace("_", " ")}
                      </span>
                    </div>
                    {pct > 0 && (
                      <div className="mt-6">
                        <div className="mb-2 flex justify-between text-sm text-gray-400">
                          <span>Progress</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[#0f172a]">
                          <div className={`h-2 rounded-full ${progressBarColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="mt-6">
                      <button
                        onClick={() => navigate(`/labs/${lab.id}`)}
                        className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-[#0b1220] hover:bg-cyan-300"
                      >
                        {status === "in_progress" ? "Continue Lab" : "Start Lab"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Enrolled courses */}
            <div className="flex items-center justify-between pt-2">
              <h2 className="text-2xl font-semibold text-white">My Courses</h2>
              <button
                onClick={() => { setJoinModal(true); setJoinError(""); setJoinCode(""); }}
                className="text-sm font-semibold text-cyan-400 hover:text-cyan-300"
              >
                + Join Course
              </button>
            </div>

            {courseStats.length === 0 ? (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📚</div>
                <div style={{ fontSize: 14, color: muted, marginBottom: 16 }}>You haven't joined any courses yet.</div>
                <button
                  onClick={() => { setJoinModal(true); setJoinError(""); setJoinCode(""); }}
                  className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-[#0b1220] hover:bg-cyan-300"
                >
                  Join a Course
                </button>
              </div>
            ) : courseStats.map((c) => {
              const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <div key={c.id} className="rounded-3xl bg-[#1a2238] p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-lg font-semibold text-white">{c.courseCode} — {c.name}</div>
                      <div className="text-sm text-gray-400 mt-1">{c.department} · {c.creditHours} credit hrs</div>
                    </div>
                    <span className="text-sm font-bold text-cyan-400">{c.done}/{c.total} labs</span>
                  </div>
                  <div className="mb-2 flex justify-between text-sm text-gray-400">
                    <span>Completion</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#0f172a]">
                    <div className={`h-2 rounded-full ${progressBarColor(pct)}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Recent activity */}
          <div>
            <h2 className="mb-4 text-2xl font-semibold text-white">Recent Activity</h2>
            {recent.length === 0 ? (
              <div style={{ color: muted, fontSize: 13 }}>No activity yet — start a lab!</div>
            ) : (
              <div className="space-y-4">
                {recent.map((a) => (
                  <div key={a.labId} className="flex items-start gap-3">
                    <div className="mt-2 h-3 w-3 rounded-full bg-cyan-400 shrink-0" />
                    <div>
                      <p className="text-base font-medium text-white">
                        {a.status === "submitted" ? "Submitted" : "Updated"} {a.title}
                      </p>
                      <p className="text-sm text-gray-400">{relativeTime(a.submittedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Join Course Modal */}
      {joinModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 16, padding: 32, width: 380 }}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Join a Course</h3>
            <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 13 }}>Enter the join code your instructor gave you.</p>

            {joinError && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13 }}>
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoin}>
              <input
                autoFocus
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. X7K2QP"
                maxLength={8}
                style={{ width: "100%", padding: "12px 14px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 10, color: "#22d3ee", fontSize: 22, fontWeight: 800, letterSpacing: "0.2em", textAlign: "center", outline: "none", boxSizing: "border-box", marginBottom: 20, fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setJoinModal(false)}
                  style={{ padding: "9px 20px", borderRadius: 9, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining || joinCode.trim().length === 0}
                  style={{ padding: "9px 24px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #06b6d4, #0891b2)", color: "#fff", fontSize: 14, cursor: joining ? "not-allowed" : "pointer", fontWeight: 600, opacity: joining ? 0.7 : 1 }}
                >
                  {joining ? "Joining…" : "Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
