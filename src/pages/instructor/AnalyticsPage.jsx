import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";

function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtPct(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function rateToPct(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed <= 1 ? parsed * 100 : parsed);
}

function fmtRelative(date) {
  if (!date) return "just now";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function fmtDate(iso) {
  if (!iso) return "Not submitted";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLabsPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.labs)) return data.labs;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getAnalyticsPayload(data) {
  return data?.analytics ?? data;
}

function normalizeDistribution(source) {
  if (Array.isArray(source)) {
    return source.map((entry, index) => ({
      label: entry.label || entry.range || entry.bucket || `B${index + 1}`,
      count: asNumber(entry.count ?? entry.total ?? entry.value, 0),
    }));
  }

  if (source && typeof source === "object") {
    return Object.entries(source).map(([label, count]) => ({
      label,
      count: asNumber(count, 0),
    }));
  }

  return ["0-20", "21-40", "41-60", "61-80", "81-100"].map((label) => ({
    label,
    count: 0,
  }));
}

function normalizeTimeline(source) {
  if (Array.isArray(source)) {
    return source.map((entry, index) => ({
      label: entry.label || entry.hour || entry.date || entry.day || `${index + 1}`,
      count: asNumber(entry.count ?? entry.submissions ?? entry.value, 0),
    }));
  }

  if (source && typeof source === "object") {
    return Object.entries(source).map(([label, count]) => ({
      label,
      count: asNumber(count, 0),
    }));
  }

  return [];
}

function normalizeSubmitters(source) {
  if (!Array.isArray(source)) return [];
  return source.map((entry, index) => {
    const student = entry.student || entry.studentDetails || {};
    return {
      id: entry.id || entry.studentId || student.id || `submitter-${index}`,
      name: entry.studentName || student.fullName || student.name || entry.name || "Student",
      email: entry.studentEmail || student.email || entry.email || "",
      score: entry.score ?? entry.averageScore ?? null,
      submittedAt: entry.submittedAt || entry.lastSubmittedAt || null,
    };
  });
}

function normalizeTestCases(source) {
  if (!Array.isArray(source)) return [];
  return source.map((entry, index) => {
    const passed = asNumber(entry.passed ?? entry.passCount, 0);
    const total = asNumber(entry.total ?? entry.submissions ?? entry.runCount, 0);
    return {
      id: entry.id || entry.testCaseId || `test-${index + 1}`,
      description: entry.description || entry.name || `Test ${index + 1}`,
      passRate: rateToPct(entry.passRate ?? entry.rate, total > 0 ? fmtPct(passed, total) : 0),
    };
  });
}

function normalizeStats(source, lab) {
  const maxScore = asNumber(source?.maxScore ?? lab?.points, 100);
  const totalStudents = asNumber(
    source?.totalStudents ?? source?.total ?? source?.enrolledStudents ?? source?.expectedSubmissions,
    0,
  );
  const submitted = asNumber(source?.submitted ?? source?.submissions ?? source?.submittedCount, 0);
  const graded = asNumber(source?.graded ?? source?.gradedCount, 0);
  const late = asNumber(source?.late ?? source?.lateCount ?? source?.lateSubmissions, 0);
  const averageSource = source?.averageScore ?? source?.avgScore ?? source?.meanScore;
  const averageScore = averageSource === null || averageSource === undefined
    ? null
    : asNumber(averageSource, null);

  return {
    totalStudents,
    submitted,
    graded,
    late,
    maxScore,
    averageScore,
    submissionRate: rateToPct(source?.submissionRate, fmtPct(submitted, totalStudents)),
    completionRate: rateToPct(source?.completionRate, fmtPct(graded, submitted)),
    onTimeRate: rateToPct(source?.onTimeRate, fmtPct(Math.max(submitted - late, 0), submitted)),
    passRate: rateToPct(source?.passRate, 0),
  };
}

function normalizeAnalytics(data, lab) {
  const payload = getAnalyticsPayload(data) || {};
  const statsSource = payload.stats || payload.summary || payload;
  return {
    stats: normalizeStats(statsSource, lab),
    distribution: normalizeDistribution(
      payload.distribution || payload.scoreDistribution || statsSource.scoreDistribution,
    ),
    timeline: normalizeTimeline(payload.timeline || payload.submissionTimeline),
    topSubmitters: normalizeSubmitters(payload.topSubmitters || payload.topStudents),
    testCases: normalizeTestCases(
      payload.testCases || payload.testCasePassRates || statsSource.testCases,
    ),
    generatedAt: payload.generatedAt || payload.updatedAt || null,
  };
}

function StatCard({ label, value, sub, color = "#e2e8f0" }) {
  return (
    <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: "16px 18px" }}>
      <div style={{ fontSize: 21, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Ring({ pct, color = "#22d3ee" }) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ width: 68, height: 68, borderRadius: "50%", background: `conic-gradient(${color} ${value}%, #1a2540 0)`, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <div style={{ width: 50, height: 50, borderRadius: "50%", background: "#0f1b33", display: "grid", placeItems: "center", color, fontSize: 13, fontWeight: 800 }}>
        {value}%
      </div>
    </div>
  );
}

function Histogram({ distribution }) {
  const buckets = normalizeDistribution(distribution);
  const peak = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const hasData = buckets.some((bucket) => bucket.count > 0);

  if (!hasData) {
    return <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: "24px 0" }}>No grade distribution yet</div>;
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 96 }}>
      {buckets.map((bucket, index) => {
        const color = index <= 1 ? "#f87171" : index <= 2 ? "#facc15" : "#4ade80";
        return (
          <div key={bucket.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>{bucket.count}</span>
            <div style={{ width: "100%", height: `${Math.max((bucket.count / peak) * 62, 4)}px`, background: color, borderRadius: "4px 4px 0 0" }} />
            <span style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap" }}>{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TimelineChart({ timeline }) {
  const entries = normalizeTimeline(timeline);
  const peak = Math.max(...entries.map((entry) => entry.count), 1);

  if (entries.length === 0 || entries.every((entry) => entry.count === 0)) {
    return <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: "24px 0" }}>No submission timeline yet</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 70 }}>
        {entries.map((entry, index) => (
          <div
            key={`${entry.label}-${index}`}
            title={`${entry.count} submissions`}
            style={{
              flex: 1,
              height: `${Math.max((entry.count / peak) * 64, 4)}px`,
              background: "linear-gradient(180deg,#22d3ee,#0891b2)",
              borderRadius: "3px 3px 0 0",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "#334155", fontSize: 10 }}>
        <span>{entries[0]?.label}</span>
        <span>{entries[entries.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function SubmitterList({ submitters, emptyText = "No submitter data yet" }) {
  if (submitters.length === 0) {
    return <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: "20px 0" }}>{emptyText}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {submitters.map((student, index) => (
        <div key={`${student.id}-${index}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", border: "1px solid #1a2540", borderRadius: 8, background: "#0a1628" }}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{student.name}</div>
            <div style={{ color: "#475569", fontSize: 11 }}>{student.email || fmtDate(student.submittedAt)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#22d3ee", fontSize: 13, fontWeight: 800 }}>{student.score ?? "N/A"}</div>
            <div style={{ color: "#334155", fontSize: 10 }}>{fmtDate(student.submittedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [analyticsByLab, setAnalyticsByLab] = useState({});
  const [selectedLab, setSelectedLab] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sinceUpdate, setSinceUpdate] = useState("just now");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const labList = getLabsPayload(await api.get("/instructor/labs"));
      const reportLabs = labList.filter((lab) => ["active", "closed"].includes(lab.status));
      const analyticsEntries = await Promise.all(
        reportLabs
          .filter((lab) => lab.id)
          .map(async (lab) => [
            String(lab.id),
            normalizeAnalytics(await api.get(`/instructor/labs/${lab.id}/analytics`), lab),
          ]),
      );

      setLabs(labList);
      setAnalyticsByLab(Object.fromEntries(analyticsEntries));
      setLastUpdated(new Date());
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      setLabs([]);
      setAnalyticsByLab({});
      setLoadError(err.message ?? "Failed to load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const interval = setInterval(() => setSinceUpdate(fmtRelative(lastUpdated)), 5000);
    setSinceUpdate(fmtRelative(lastUpdated));
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const rows = useMemo(() => {
    return labs
      .filter((lab) => ["active", "closed"].includes(lab.status))
      .map((lab) => {
        const analytics = analyticsByLab[String(lab.id)] || normalizeAnalytics({}, lab);
        const avgPct = analytics.stats.averageScore === null
          ? null
          : fmtPct(analytics.stats.averageScore, analytics.stats.maxScore);
        const lowTests = analytics.testCases.filter((testCase) => testCase.passRate < 40);
        return {
          lab,
          ...analytics,
          avgPct,
          lowTests,
        };
      });
  }, [analyticsByLab, labs]);

  const totals = useMemo(() => {
    const totalStudents = rows.reduce((sum, row) => sum + row.stats.totalStudents, 0);
    const submitted = rows.reduce((sum, row) => sum + row.stats.submitted, 0);
    const graded = rows.reduce((sum, row) => sum + row.stats.graded, 0);
    const late = rows.reduce((sum, row) => sum + row.stats.late, 0);
    const gradedWeight = rows.reduce((sum, row) => sum + (row.stats.averageScore !== null ? row.stats.graded : 0), 0);
    const weightedScore = rows.reduce((sum, row) => {
      if (row.stats.averageScore === null) return sum;
      return sum + row.stats.averageScore * Math.max(row.stats.graded, 1);
    }, 0);
    const passRates = rows.map((row) => row.stats.passRate).filter((rate) => rate > 0);

    return {
      totalStudents,
      submitted,
      graded,
      late,
      averageScore: gradedWeight > 0 ? Math.round(weightedScore / gradedWeight) : null,
      submissionRate: fmtPct(submitted, totalStudents),
      completionRate: fmtPct(graded, submitted),
      onTimeRate: fmtPct(Math.max(submitted - late, 0), submitted),
      passRate: passRates.length
        ? Math.round(passRates.reduce((sum, rate) => sum + rate, 0) / passRates.length)
        : 0,
    };
  }, [rows]);

  const topSubmitters = useMemo(() => {
    return rows
      .flatMap((row) => row.topSubmitters.map((student) => ({
        ...student,
        labTitle: row.lab.title,
      })))
      .sort((a, b) => asNumber(b.score, -1) - asNumber(a.score, -1))
      .slice(0, 6);
  }, [rows]);

  const selectedRow = selectedLab ? rows.find((row) => String(row.lab.id) === String(selectedLab)) : null;

  const handleReportExport = () => {
    const lines = [
      "LabTrack Analytics Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Labs: ${rows.length}`,
      `Submissions: ${totals.submitted}/${totals.totalStudents}`,
      `Graded: ${totals.graded}`,
      `Average score: ${totals.averageScore ?? "N/A"}`,
      "",
      ...rows.map((row) => (
        `Lab ${row.lab.labNumber || "?"}: ${row.lab.title} - ${row.stats.submitted}/${row.stats.totalStudents} submitted, avg ${row.stats.averageScore ?? "N/A"}/${row.stats.maxScore}`
      )),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "analytics_report.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <InstructorLayout>
        <div style={{ height: "60vh", display: "grid", placeItems: "center", color: "#64748b" }}>
          Loading analytics...
        </div>
      </InstructorLayout>
    );
  }

  if (loadError) {
    return (
      <InstructorLayout>
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#f87171", marginBottom: 16 }}>{loadError}</p>
          <button onClick={loadAnalytics} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#0891b2", color: "#fff", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
          <div>
            {selectedRow && (
              <button onClick={() => setSelectedLab(null)} style={{ marginBottom: 8, background: "transparent", border: "1px solid #1a2540", borderRadius: 8, color: "#64748b", padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>
                Back to overview
              </button>
            )}
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>
              {selectedRow ? selectedRow.lab.title : "Class Performance Analytics"}
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569" }}>
              Analytics updated {sinceUpdate}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={loadAnalytics} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Refresh
            </button>
            <button onClick={handleReportExport} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Export Report
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 32px", background: "#0f1b33", border: "1px dashed #1e3a5f", borderRadius: 8 }}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 17 }}>No analytics available yet</h3>
            <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>Publish a lab and collect submissions to see analytics.</p>
            <button onClick={() => navigate("/instructor/labs")} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#06b6d4,#0891b2)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Go to Labs
            </button>
          </div>
        ) : selectedRow ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
              <StatCard label="Submitted" value={`${selectedRow.stats.submitted}/${selectedRow.stats.totalStudents}`} sub={`${selectedRow.stats.submissionRate}% rate`} color="#22d3ee" />
              <StatCard label="Average Score" value={selectedRow.stats.averageScore !== null ? `${selectedRow.stats.averageScore}/${selectedRow.stats.maxScore}` : "N/A"} sub={selectedRow.avgPct !== null ? `${selectedRow.avgPct}%` : "No graded submissions"} color={selectedRow.avgPct !== null && selectedRow.avgPct >= 70 ? "#4ade80" : "#facc15"} />
              <StatCard label="Late" value={selectedRow.stats.late} sub={`${selectedRow.stats.onTimeRate}% on time`} color={selectedRow.stats.late > 0 ? "#fb923c" : "#4ade80"} />
              <StatCard label="Pass Rate" value={`${selectedRow.stats.passRate}%`} sub={`${selectedRow.testCases.length} test cases`} color={selectedRow.stats.passRate >= 70 ? "#4ade80" : "#facc15"} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>Score Distribution</div>
                <Histogram distribution={selectedRow.distribution} />
              </div>
              <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>Submission Timeline</div>
                <TimelineChart timeline={selectedRow.timeline} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 14 }}>Test Case Pass Rates</div>
                {selectedRow.testCases.length === 0 ? (
                  <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: "20px 0" }}>No test case analytics yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {selectedRow.testCases.map((testCase) => {
                      const color = testCase.passRate >= 70 ? "#4ade80" : testCase.passRate >= 40 ? "#facc15" : "#f87171";
                      return (
                        <div key={testCase.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>{testCase.description}</span>
                            <span style={{ color, fontSize: 12, fontWeight: 700 }}>{testCase.passRate}%</span>
                          </div>
                          <div style={{ height: 5, background: "#1a2540", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${testCase.passRate}%`, height: "100%", background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 14 }}>Top Submitters</div>
                <SubmitterList submitters={selectedRow.topSubmitters} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => navigate(`/instructor/labs/${selectedRow.lab.id}/submissions`)} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#06b6d4,#0891b2)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                View All Submissions
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
              <StatCard label="Avg Score" value={totals.averageScore ?? "N/A"} sub="across graded labs" color={totals.averageScore !== null && totals.averageScore >= 70 ? "#4ade80" : "#facc15"} />
              <StatCard label="Submissions" value={`${totals.submitted}/${totals.totalStudents}`} sub={`${totals.submissionRate}% rate`} color="#22d3ee" />
              <StatCard label="Graded" value={totals.graded} sub={`${totals.completionRate}% completion`} color="#a78bfa" />
              <StatCard label="On-time Rate" value={`${totals.onTimeRate}%`} sub={`${totals.late} late`} color={totals.onTimeRate >= 70 ? "#4ade80" : "#facc15"} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Submission Rate", pct: totals.submissionRate, color: "#22d3ee" },
                { label: "Completion", pct: totals.completionRate, color: "#a78bfa" },
                { label: "Pass Rate", pct: totals.passRate, color: "#4ade80" },
              ].map((metric) => (
                <div key={metric.label} style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: 18, display: "flex", alignItems: "center", gap: 18 }}>
                  <Ring pct={metric.pct} color={metric.color} />
                  <div>
                    <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700 }}>{metric.label}</div>
                    <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>{metric.pct}% from analytics</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #1a2540", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Lab-by-Lab Breakdown</span>
                <span style={{ fontSize: 11, color: "#475569" }}>Click a row for detailed analytics</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 130px 130px 110px 110px", padding: "9px 18px", borderBottom: "1px solid #1a2540", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                <span>#</span><span>Title</span><span>Submitted</span><span>Avg Score</span><span>Late</span><span>Issues</span>
              </div>
              {rows.map((row, index) => {
                const averageColor = row.avgPct === null ? "#475569" : row.avgPct >= 70 ? "#4ade80" : row.avgPct >= 50 ? "#facc15" : "#f87171";
                return (
                  <div
                    key={row.lab.id}
                    onClick={() => setSelectedLab(row.lab.id)}
                    style={{ display: "grid", gridTemplateColumns: "64px 1fr 130px 130px 110px 110px", padding: "13px 18px", alignItems: "center", borderBottom: index === rows.length - 1 ? "none" : "1px solid #0f1b33", cursor: "pointer" }}
                    onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(16,33,63,0.6)"; }}
                    onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ color: "#475569", fontWeight: 700, fontSize: 13 }}>{row.lab.labNumber || "N/A"}</span>
                    <div>
                      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{row.lab.title}</div>
                      <div style={{ color: "#334155", fontSize: 11, marginTop: 1 }}>{row.lab.difficulty || "No difficulty"} - {row.stats.maxScore} pts</div>
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>{row.stats.submitted}/{row.stats.totalStudents}</span>
                    <span style={{ color: averageColor, fontSize: 13, fontWeight: 700 }}>{row.stats.averageScore ?? "N/A"}</span>
                    <span style={{ color: row.stats.late > 0 ? "#fb923c" : "#64748b", fontSize: 12 }}>{row.stats.late}</span>
                    {row.lowTests.length > 0 || (row.avgPct !== null && row.avgPct < 50) ? (
                      <span style={{ fontSize: 11, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "2px 7px", width: "fit-content" }}>Review</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#4ade80" }}>OK</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 14 }}>Top Submitters</div>
              <SubmitterList submitters={topSubmitters} />
            </div>
          </>
        )}
      </div>
    </InstructorLayout>
  );
}
