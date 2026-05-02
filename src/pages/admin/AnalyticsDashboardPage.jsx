import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api.js";

// ─── Style tokens ─────────────────────────────────────────────────────────────
const bg       = "#080f1e";
const card     = "#0b1424";
const border   = "#1a2540";
const accent   = "#22d3ee";
const muted    = "#8898b3";
const dimmed   = "#4a5568";
const success  = "#34d399";
const warn     = "#fbbf24";
const danger   = "#f87171";
const purple   = "#a78bfa";
const orange   = "#fb923c";

const DEPT_COLORS = { COE: "#f97316", ICS: "#22d3ee", SWE: "#a78bfa", MATH: "#34d399", PHYS: "#fb7185", CHEM: "#fbbf24" };

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = accent, icon }) {
  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: dimmed, marginTop: 5 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 24, opacity: 0.7 }}>{icon}</span>}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, action }) {
  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "14px 22px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: "18px 22px" }}>{children}</div>
    </div>
  );
}

function BarChart({ data, valueKey, labelKey, colorKey, max }) {
  const peak = max ?? Math.max(...data.map((d) => d[valueKey]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
      {data.map((d) => {
        const pct = (d[valueKey] / peak) * 100;
        return (
          <div key={d[labelKey]} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
            <span style={{ fontSize: 10, color: muted, fontWeight: 700 }}>{d[valueKey]}</span>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%",
                height: `${pct}%`,
                minHeight: 4,
                background: d[colorKey] ?? accent,
                borderRadius: "4px 4px 0 0",
                transition: "height 0.4s ease",
              }} />
            </div>
            <span style={{ fontSize: 10, color: dimmed }}>{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function HorizBar({ label, value, max, color, unit = "" }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "#cbd5e1" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}{unit}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#0f1b33", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const color = type === "error" ? danger : type === "warn" ? warn : success;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 999,
      background: card, border: `1px solid ${color}`, borderRadius: 12,
      padding: "12px 20px", color, fontSize: 13, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {msg}
    </div>
  );
}

// ─── Report Generator Modal ───────────────────────────────────────────────────
const REPORT_TYPES = [
  { id: "user_activity",    label: "User Activity Report",      icon: "👥", desc: "Logins, active sessions, registration trends" },
  { id: "submission_stats", label: "Submission Statistics",     icon: "📝", desc: "Submission counts, pass rates, grade distributions" },
  { id: "course_overview",  label: "Course & Section Overview", icon: "📚", desc: "Enrollment, capacity usage, instructor assignments" },
  { id: "dept_comparison",  label: "Department Comparison",     icon: "🏛️", desc: "Cross-department performance and policy compliance" },
  { id: "language_usage",   label: "Language Usage Report",     icon: "💻", desc: "Which languages are used and pass rates per language" },
  { id: "system_health",    label: "System Health Summary",     icon: "⚡", desc: "Uptime, error rates, execution metrics over period" },
];

const PERIOD_OPTIONS = ["Last 7 days", "Last 30 days", "Last 90 days", "This semester", "All time"];
const FORMAT_OPTIONS = ["PDF", "CSV", "JSON"];

function ReportModal({ onClose, onGenerate, availableDepts }) {
  const [selected, setSelected]   = useState(null);
  const [period, setPeriod]       = useState("Last 30 days");
  const [format, setFormat]       = useState("PDF");
  const [includeDepts, setIncludeDepts] = useState(availableDepts.map((d) => d.code));

  function toggleDept(code) {
    setIncludeDepts((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, width: 600, maxHeight: "88vh", overflowY: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>Generate Report</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Report type */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Report Type</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {REPORT_TYPES.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelected(r.id)} style={{
                background: selected === r.id ? "rgba(34,211,238,0.08)" : "transparent",
                border: `1px solid ${selected === r.id ? accent : border}`,
                borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ fontSize: 15, marginBottom: 4 }}>{r.icon} <span style={{ fontSize: 13, fontWeight: 600, color: selected === r.id ? accent : "#cbd5e1" }}>{r.label}</span></div>
                <div style={{ fontSize: 11, color: muted }}>{r.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Period + Format */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Time Period</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PERIOD_OPTIONS.map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} style={{
                  background: period === p ? "#1e3a5f" : "transparent",
                  border: `1px solid ${period === p ? accent : border}`,
                  borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                  color: period === p ? "#e2e8f0" : muted, fontSize: 12, textAlign: "left",
                }}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Output Format</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FORMAT_OPTIONS.map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)} style={{
                  background: format === f ? "#1e3a5f" : "transparent",
                  border: `1px solid ${format === f ? accent : border}`,
                  borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                  color: format === f ? "#e2e8f0" : muted, fontSize: 12, textAlign: "left",
                }}>{f}</button>
              ))}
            </div>
            {/* Departments filter */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Filter Departments</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {availableDepts.map((d) => (
                  <button key={d.code} type="button" onClick={() => toggleDept(d.code)} style={{
                    background: includeDepts.includes(d.code) ? (DEPT_COLORS[d.code] ?? accent) + "22" : "transparent",
                    border: `1px solid ${includeDepts.includes(d.code) ? (DEPT_COLORS[d.code] ?? accent) : border}`,
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                    color: includeDepts.includes(d.code) ? (DEPT_COLORS[d.code] ?? accent) : muted,
                    fontSize: 11, fontWeight: 700,
                  }}>{d.code}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, background: "transparent", border: `1px solid ${border}`,
            borderRadius: 10, color: muted, fontSize: 13, fontWeight: 600, padding: "11px 0", cursor: "pointer",
          }}>Cancel</button>
          <button type="button" disabled={!selected} onClick={() => onGenerate({ type: selected, period, format, depts: includeDepts })} style={{
            flex: 2, background: selected ? accent : dimmed, border: "none",
            borderRadius: 10, color: selected ? "#081018" : muted,
            fontSize: 13, fontWeight: 700, padding: "11px 0",
            cursor: selected ? "pointer" : "not-allowed",
          }}>Generate Report</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnalyticsDashboardPage() {
  const navigate = useNavigate();

  const [statsData, setStatsData]     = useState(null);
  const [reports, setReports]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [showModal, setShowModal]     = useState(false);
  const [toast, setToast]             = useState({ msg: "", type: "success" });
  const [activeTab, setActiveTab]     = useState("overview");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
  };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get("/admin/analytics"),
      api.get("/admin/analytics/reports"),
    ])
      .then(([analytics, savedReports]) => {
        setStatsData(analytics);
        setReports(Array.isArray(savedReports) ? savedReports : []);
      })
      .catch((err) => { if (err.status === 401) navigate("/"); else setError(err.message); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [navigate]);

  async function handleGenerate({ type, period, format, depts }) {
    const typeMeta = REPORT_TYPES.find((r) => r.id === type);
    try {
      const entry = await api.post("/admin/analytics/reports", {
        name: typeMeta?.label ?? type,
        type,
        filters: { period, format, depts },
      });
      setReports((prev) => [entry, ...prev]);
      setShowModal(false);
      setActiveTab("reports");
      showToast(`✓ ${typeMeta?.label} generated (${format})`, "success");
    } catch (err) {
      showToast(err.message, "error");
      setShowModal(false);
    }
  }

  async function deleteReport(id) {
    try {
      await api.delete(`/admin/analytics/reports/${id}`);
      setReports((prev) => prev.filter((r) => r.id !== id));
      showToast("Report deleted", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ background: bg, minHeight: "100vh", padding: "32px 36px", color: muted, fontSize: 14 }}>
          Loading...
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div style={{ background: bg, minHeight: "100vh", padding: "32px 36px" }}>
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: danger, fontSize: 13 }}>
            {error}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const stats = statsData?.stats ?? {};
  const deptSubs = statsData?.deptSubs ?? [];
  const weekly = statsData?.weekly ?? [];
  const langs = statsData?.langs ?? [];
  const availableDepts = deptSubs.map((d) => ({ code: d.code, name: d.name }));

  const users    = stats.users    ?? { total: 0, active: 0, students: 0, instructors: 0, admins: 0 };
  const courses  = stats.courses  ?? { total: 0, sections: 0, enrolled: 0 };
  const labs     = stats.labs     ?? { total: 0, submissions: 0, avgGrade: 0 };

  const weeklyMax = weekly.length > 0 ? Math.max(...weekly.map((w) => w.submissions)) : 1;

  return (
    <AdminLayout>
      <div style={{ background: bg, minHeight: "100vh", padding: "32px 36px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Analytics & Reports</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>Platform-wide usage statistics and exportable reports</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={loadData} style={{
              background: "transparent", border: `1px solid ${border}`,
              borderRadius: 10, color: muted, fontSize: 13, fontWeight: 600,
              padding: "9px 18px", cursor: "pointer",
            }}>↻ Refresh</button>
            <button type="button" onClick={() => setShowModal(true)} style={{
              background: accent, border: "none",
              borderRadius: 10, color: "#081018", fontSize: 13, fontWeight: 700,
              padding: "9px 22px", cursor: "pointer",
            }}>+ Generate Report</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#0a1628", borderRadius: 12, padding: 4, width: "fit-content" }}>
          {[["overview", "Overview"], ["reports", "Saved Reports"]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} style={{
              background: activeTab === id ? card : "transparent",
              border: activeTab === id ? `1px solid ${border}` : "1px solid transparent",
              borderRadius: 9, padding: "8px 20px", cursor: "pointer",
              color: activeTab === id ? "#e2e8f0" : muted,
              fontSize: 13, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <StatCard label="Total Users"       value={users.total}        sub={`${users.active} active`}      color={accent}  icon="👥" />
              <StatCard label="Total Courses"     value={courses.total}      sub={`${courses.sections} sections`} color={purple}  icon="📚" />
              <StatCard label="Labs Published"    value={labs.total}         sub="across all courses"             color={success} icon="🧪" />
              <StatCard label="Total Submissions" value={labs.submissions}   sub={`avg grade ${labs.avgGrade}%`}  color={warn}    icon="📝" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Weekly submissions chart */}
              <SectionCard title="Weekly Submissions (Last 8 Weeks)" icon="📈">
                {weekly.length > 0 ? (
                  <>
                    <BarChart
                      data={weekly.map((w) => ({ ...w, color: accent }))}
                      valueKey="submissions"
                      labelKey="week"
                      colorKey="color"
                      max={weeklyMax}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${border}` }}>
                      <div>
                        <div style={{ fontSize: 11, color: muted }}>Total this period</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: accent }}>{weekly.reduce((s, w) => s + w.submissions, 0)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: muted }}>Weekly avg</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
                          {Math.round(weekly.reduce((s, w) => s + w.submissions, 0) / weekly.length)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: muted }}>Peak week</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: warn }}>{weeklyMax}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No weekly data yet</div>
                )}
              </SectionCard>

              {/* User breakdown */}
              <SectionCard title="User Breakdown" icon="👤">
                <div style={{ marginBottom: 20 }}>
                  <HorizBar label="Students"    value={users.students}    max={users.total || 1} color="#60a5fa" unit="" />
                  <HorizBar label="Instructors" value={users.instructors} max={users.total || 1} color={purple}  unit="" />
                  <HorizBar label="Admins"      value={users.admins}      max={users.total || 1} color={warn}    unit="" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: "#0a1628", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Enrollment Rate</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: success }}>
                      {users.students > 0 ? Math.round((courses.enrolled / users.students) * 100) : 0}%
                    </div>
                    <div style={{ fontSize: 11, color: dimmed }}>students enrolled in ≥1 course</div>
                  </div>
                  <div style={{ background: "#0a1628", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Avg Sections / Course</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: orange }}>
                      {courses.total > 0 ? (courses.sections / courses.total).toFixed(1) : 0}
                    </div>
                    <div style={{ fontSize: 11, color: dimmed }}>across {courses.total} courses</div>
                  </div>
                </div>
              </SectionCard>

              {/* Dept submissions */}
              <SectionCard title="Submissions by Department" icon="🏛️">
                {deptSubs.length === 0 ? (
                  <div style={{ color: muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No department data yet</div>
                ) : (
                  <>
                    <BarChart
                      data={deptSubs.map((d) => ({ label: d.code, submissions: d.subs, color: d.color ?? DEPT_COLORS[d.code] ?? accent }))}
                      valueKey="submissions"
                      labelKey="label"
                      colorKey="color"
                    />
                    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                      {deptSubs.map((d) => (
                        <div key={d.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color ?? DEPT_COLORS[d.code] ?? accent, display: "inline-block" }} />
                            <span style={{ fontSize: 12, color: "#cbd5e1" }}>{d.name}</span>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span style={{ fontSize: 12, color: muted }}>{d.subs} subs</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: d.avgGrade >= 75 ? success : d.avgGrade >= 60 ? warn : danger }}>
                              {d.avgGrade}% avg
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </SectionCard>

              {/* Language usage */}
              <SectionCard title="Language Usage" icon="💻">
                {langs.length === 0 ? (
                  <div style={{ color: muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No language data yet</div>
                ) : (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      {langs.map((l) => (
                        <HorizBar key={l.lang} label={l.lang} value={l.pct} max={100} color={l.color} unit="%" />
                      ))}
                    </div>
                    <div style={{ padding: "14px 0 0", borderTop: `1px solid ${border}` }}>
                      <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Active Sessions by Language</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {langs.map((l) => (
                          <div key={l.lang} style={{
                            background: l.color + "15", border: `1px solid ${l.color}44`,
                            borderRadius: 8, padding: "6px 12px",
                            display: "flex", alignItems: "center", gap: 6,
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, display: "inline-block" }} />
                            <span style={{ fontSize: 12, color: "#e2e8f0" }}>{l.lang}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: l.color }}>{l.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </SectionCard>
            </div>
          </>
        )}

        {activeTab === "reports" && (
          <SectionCard title="Saved Reports" icon="📄" action={
            <button type="button" onClick={() => setShowModal(true)} style={{
              background: "rgba(34,211,238,0.1)", border: `1px solid ${accent}33`,
              borderRadius: 8, color: accent, fontSize: 12, fontWeight: 600,
              padding: "6px 14px", cursor: "pointer",
            }}>+ New Report</button>
          }>
            {reports.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14, color: muted, marginBottom: 8 }}>No reports generated yet</div>
                <div style={{ fontSize: 12, color: dimmed }}>Click "Generate Report" to create your first report</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Report", "Period", "Format", "Departments", "Size", "Generated", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: muted, padding: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const d = new Date(r.generatedAt);
                    const dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                    const filters = r.filters ?? {};
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${border}` }}>
                        <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{r.name}</td>
                        <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: muted }}>{filters.period ?? "—"}</td>
                        <td style={{ padding: "12px 12px 12px 0" }}>
                          <span style={{
                            background: filters.format === "PDF" ? "rgba(251,191,36,0.1)" : filters.format === "CSV" ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
                            color: filters.format === "PDF" ? warn : filters.format === "CSV" ? success : "#60a5fa",
                            border: "1px solid currentColor",
                            borderRadius: 6, fontSize: 10, fontWeight: 700, padding: "2px 8px",
                          }}>{filters.format ?? "—"}</span>
                        </td>
                        <td style={{ padding: "12px 12px 12px 0", fontSize: 11, color: muted }}>
                          {filters.depts?.length > 0 ? filters.depts.join(", ") : "All"}
                        </td>
                        <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: dimmed }}>{r.size ?? "—"}</td>
                        <td style={{ padding: "12px 12px 12px 0", fontSize: 11, color: dimmed }}>{dateStr}</td>
                        <td style={{ padding: "12px 0", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => showToast(`Downloading ${r.name}.${(filters.format ?? "pdf").toLowerCase()}…`, "success")} style={{
                              background: "rgba(34,211,238,0.1)", border: `1px solid ${accent}33`,
                              borderRadius: 6, color: accent, fontSize: 11, fontWeight: 600,
                              padding: "5px 12px", cursor: "pointer",
                            }}>Download</button>
                            <button type="button" onClick={() => deleteReport(r.id)} style={{
                              background: "transparent", border: `1px solid ${dimmed}`,
                              borderRadius: 6, color: muted, fontSize: 11,
                              padding: "5px 10px", cursor: "pointer",
                            }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        )}
      </div>

      {showModal && (
        <ReportModal
          onClose={() => setShowModal(false)}
          onGenerate={handleGenerate}
          availableDepts={availableDepts}
        />
      )}
      <Toast msg={toast.msg} type={toast.type} />
    </AdminLayout>
  );
}
