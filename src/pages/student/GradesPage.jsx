import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";
import { useNavigate } from "react-router-dom";

function scoreToGrade(score) {
  if (score === null || score === undefined) return "—";
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "B+";
  if (score >= 80) return "B";
  if (score >= 75) return "C+";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function GradesPage() {
  const navigate = useNavigate();
  const [rows, setRows]                     = useState([]);
  const [courses, setCourses]               = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [detailItem, setDetailItem]         = useState(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }

    Promise.all([
      api.get("/student/grades"),
      api.get("/student/courses?enrolled=true"),
    ])
      .then(([grades, enrolledCourses]) => {
        // grades: [{ id, lab: { title, courseCode, points, ... }, score, testsPassed,
        //            testsTotal, grade, feedback, status, submittedAt }]
        const built = grades.map((g) => ({
          id:          g.id,
          lab:         g.lab?.title ?? "—",
          courseCode:  g.lab?.courseCode ?? null,
          score:       g.score ?? null,
          maxScore:    g.lab?.points ?? 100,
          testsPassed: g.testsPassed ?? "—",
          testsTotal:  g.testsTotal  ?? "—",
          grade:       g.grade ?? scoreToGrade(g.score),
          feedback:    g.feedback ?? g.overallFeedback ?? "—",
          status:      capitalize(g.status ?? "not_started"),
          submittedAt: fmtDate(g.submittedAt),
        }));
        setRows(built);
        setCourses(enrolledCourses);
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load grades. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  function capitalize(s) {
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const filteredRows = useMemo(() => {
    if (selectedCourse === "all") return rows;
    const course = courses.find((c) => c.id === selectedCourse);
    if (!course) return rows;
    return rows.filter((r) => r.courseCode === course.courseCode);
  }, [rows, selectedCourse, courses]);

  const gradedLabs = useMemo(() => filteredRows.filter((r) => r.score != null), [filteredRows]);

  const avgScore = useMemo(() => {
    if (gradedLabs.length === 0) return "0";
    return (gradedLabs.reduce((s, r) => s + r.score, 0) / gradedLabs.length).toFixed(1);
  }, [gradedLabs]);

  const bestScore = useMemo(() => {
    if (gradedLabs.length === 0) return "0";
    return String(Math.max(...gradedLabs.map((r) => r.score)));
  }, [gradedLabs]);

  const overallGrade = useMemo(() => scoreToGrade(Number(avgScore)), [avgScore]);
  const trendHeights = gradedLabs.map((r) => `${Math.max(r.score, 20)}%`);

  function getGradeColor(grade) {
    if (grade === "A" || grade === "A+") return "text-green-400";
    if (grade === "B+" || grade === "B") return "text-cyan-400";
    if (grade === "C+" || grade === "C") return "text-yellow-400";
    if (grade === "D" || grade === "F")  return "text-red-400";
    return "text-gray-400";
  }

  function getStatusClass(status) {
    const s = status?.toLowerCase();
    if (s === "graded")      return "text-green-400";
    if (s === "submitted")   return "text-cyan-400";
    if (s === "in progress") return "text-yellow-400";
    return "text-gray-400";
  }

  function getScoreDisplay(score, max) {
    if (score == null) return "—";
    return `${score}/${max ?? 100}`;
  }

  function getScoreClass(score) {
    if (score == null) return "text-gray-300";
    if (score < 60) return "text-red-400 font-semibold";
    return "text-gray-300";
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">Loading grades…</div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-red-400">{error}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#050b18] text-white">
        <div className="mx-auto max-w-7xl px-6 py-6">

          {/* Header */}
          <div className="mb-6 rounded-xl border border-cyan-500/40 bg-[#0b1424] shadow-lg">
            <div className="flex flex-col gap-4 border-b border-cyan-500/30 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-cyan-400">LabTrack</h1>
                <p className="text-sm text-gray-400">Collaborative Programming Platform</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="rounded-md bg-[#0f1b33] px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="all">All Courses</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.courseCode} — {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4">
              <h2 className="text-center text-2xl font-bold text-white">Grades &amp; Feedback</h2>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-[#0b1424] p-6 shadow-lg">
              <div className="flex flex-col items-center justify-center">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-green-400 text-4xl font-bold text-green-400">
                  {overallGrade}
                </div>
                <p className="mt-4 text-center text-lg font-semibold text-gray-400">Overall Grade</p>
              </div>
            </div>
            <div className="rounded-xl bg-[#0b1424] p-6 shadow-lg">
              <h3 className="text-4xl font-bold text-green-400">{avgScore}</h3>
              <p className="mt-1 text-sm text-gray-400">Avg Score</p>
            </div>
            <div className="rounded-xl bg-[#0b1424] p-6 shadow-lg">
              <h3 className="text-4xl font-bold text-cyan-400">{gradedLabs.length}/{filteredRows.length}</h3>
              <p className="mt-1 text-sm text-gray-400">Labs Done</p>
            </div>
            <div className="rounded-xl bg-[#0b1424] p-6 shadow-lg">
              <h3 className="text-4xl font-bold text-green-400">{bestScore}</h3>
              <p className="mt-1 text-sm text-gray-400">Best Score</p>
            </div>
          </div>

          {/* Trend Graph */}
          <div className="mb-6 rounded-xl bg-[#0b1424] p-6 shadow-lg">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-white">Performance Trend</h3>
              <p className="text-sm text-gray-400">Grade progression across completed labs</p>
            </div>
            {gradedLabs.length === 0 ? (
              <p className="text-sm text-gray-400">No grades available yet.</p>
            ) : (
              <div className="flex h-64 items-end justify-between gap-4">
                {gradedLabs.map((item, index) => (
                  <div key={item.id} className="flex flex-1 flex-col items-center justify-end">
                    <div className="mb-2 text-sm font-semibold text-gray-400">{item.score}</div>
                    <div
                      className={`w-full rounded-t-md ${item.score < 60 ? "bg-red-500/80" : "bg-cyan-500/80"}`}
                      style={{ height: trendHeights[index] }}
                    />
                    <div className="mt-3 text-center text-xs text-gray-400">{item.lab}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grades Table */}
          <div className="overflow-hidden rounded-xl bg-[#0b1424] shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-[#0f1b33]">
                  <tr>
                    {["#", "Lab", "Score", "Tests", "Grade", "Status", "Submitted", "Instructor Feedback"].map((h) => (
                      <th key={h} className="px-4 py-4 text-left text-sm font-semibold text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item, idx) => (
                    <tr key={item.id} className="border-t border-[#162238] hover:bg-[#0f1b33]/60">
                      <td className="px-4 py-4 text-sm font-semibold text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-white">{item.lab}</td>
                      <td className={`px-4 py-4 text-sm ${getScoreClass(item.score)}`}>
                        {getScoreDisplay(item.score, item.maxScore)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">
                        {item.testsPassed}/{item.testsTotal}
                      </td>
                      <td className={`px-4 py-4 text-sm font-bold ${getGradeColor(item.grade)}`}>{item.grade}</td>
                      <td className={`px-4 py-4 text-sm font-semibold ${getStatusClass(item.status)}`}>{item.status}</td>
                      <td className="px-4 py-4 text-sm text-gray-300">{item.submittedAt}</td>
                      <td className="px-4 py-4 text-sm text-gray-400">
                        {item.status?.toLowerCase() === "graded" ? (
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="text-cyan-400 hover:text-cyan-300 underline text-sm"
                          >
                            View Feedback
                          </button>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                        No grades found for this course.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-400">
            View instructor feedback, track your average, and monitor progress by course.
          </div>
        </div>
      </div>

      {/* Feedback Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0b1424] border border-cyan-500/30 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">{detailItem.lab} — Instructor Feedback</h2>
              <button type="button" onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-white text-xl font-bold">
                ✕
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0f172a] rounded-xl p-4">
                  <p className="text-slate-500 mb-1">Score</p>
                  <p className={`text-2xl font-bold ${getScoreClass(detailItem.score)}`}>
                    {getScoreDisplay(detailItem.score, detailItem.maxScore)}
                  </p>
                </div>
                <div className="bg-[#0f172a] rounded-xl p-4">
                  <p className="text-slate-500 mb-1">Grade</p>
                  <p className={`text-2xl font-bold ${getGradeColor(detailItem.grade)}`}>
                    {detailItem.grade}
                  </p>
                </div>
              </div>
              <div className="bg-[#0f172a] rounded-xl p-4">
                <p className="text-slate-500 mb-1">Tests Passed</p>
                <p className="text-white font-semibold">{detailItem.testsPassed}/{detailItem.testsTotal}</p>
              </div>
              <div className="bg-[#0f172a] rounded-xl p-4">
                <p className="text-slate-500 mb-2">Instructor Comment</p>
                <p className="text-white leading-relaxed">"{detailItem.feedback}"</p>
              </div>
              <div className="bg-[#0f172a] rounded-xl p-4">
                <p className="text-slate-500 mb-1">Submitted</p>
                <p className="text-white">{detailItem.submittedAt}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetailItem(null)}
              className="mt-6 w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
