import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Style constants ──────────────────────────────────────────────────────────
const DEPT_COLORS = {
  COE: "#f97316", ICS: "#22d3ee", SWE: "#a78bfa",
  MATH: "#34d399", PHYS: "#fb7185", CHEM: "#fbbf24",
};

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 9,
  border: "1px solid #1e3a5f", background: "#0a1628",
  color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const btnPrimary = {
  padding: "9px 20px", borderRadius: 9, border: "none",
  background: "linear-gradient(135deg, #06b6d4, #0891b2)",
  color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 600,
};

const btnSecondary = {
  padding: "9px 20px", borderRadius: 9,
  border: "1px solid #1e3a5f", background: "transparent",
  color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600,
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, hint, children, error }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "#475569", marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
      {error && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171" }}>{error}</p>}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? "linear-gradient(135deg,#06b6d4,#0891b2)" : "#1a2540",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3,
        left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
      }} />
    </button>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #1a2540" }}>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DepartmentSettingsPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [headSearch, setHeadSearch] = useState("");
  const [headDropdown, setHeadDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  // ── Load ──
  useEffect(() => {
    Promise.all([
      api.get("/admin/departments"),
      api.get("/admin/users"),
      api.get("/admin/courses"),
    ])
      .then(([depts, usersData, coursesData]) => {
        setDepartments(Array.isArray(depts) ? depts : []);
        setUsers(Array.isArray(usersData) ? usersData : []);
        setCourses(Array.isArray(coursesData) ? coursesData : []);
      })
      .catch((err) => { if (err.status === 401) navigate("/"); else setError(err.message); })
      .finally(() => setLoading(false));
  }, [navigate]);

  // ── Helpers ──
  const headCandidates = users.filter((u) => u.role === "instructor" || u.role === "admin");
  const filteredHeads = headCandidates.filter(
    (u) => !headSearch || u.fullName.toLowerCase().includes(headSearch.toLowerCase()),
  );

  const getUser = (id) => users.find((u) => u.id === id);

  const deptStats = (deptCode) => ({
    instructors: users.filter((u) => u.role === "instructor" && u.department === deptCode).length,
    courses: courses.filter((c) => c.department === deptCode).length,
    students: courses
      .filter((c) => c.department === deptCode)
      .reduce((n, c) => n + (c.sections || []).reduce((s, sec) => s + (sec.enrolledStudentIds || []).length, 0), 0),
  });

  // ── Validation ──
  const validate = (data) => {
    const errs = {};
    if (!data.name.trim()) errs.name = "Department name is required";
    if (!isValidEmail(data.contactEmail)) errs.contactEmail = "Enter a valid email address";
    if (data.headId) {
      const head = getUser(data.headId);
      if (!head || (head.role !== "instructor" && head.role !== "admin")) {
        errs.headId = "Department head must have instructor or admin role";
      }
    }
    const p = data.policies;
    if (p.latePenaltyPercent < 0 || p.latePenaltyPercent > 100) errs.latePenalty = "Late penalty must be 0–100%";
    if (p.plagiarismThreshold < 0 || p.plagiarismThreshold > 100) errs.plagiarismThreshold = "Threshold must be 0–100%";
    if (p.allowPeerCollaboration && (p.maxGroupSize < 2 || p.maxGroupSize > 10)) {
      errs.maxGroupSize = "Group size must be 2–10 when collaboration is enabled";
    }
    return errs;
  };

  // ── Save ──
  const handleSave = async () => {
    const errs = validate(editing);
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    try {
      const updated = await api.patch(`/admin/departments/${editing.id}`, {
        name: editing.name,
        contactEmail: editing.contactEmail,
        headId: editing.headId,
        policies: editing.policies,
      });
      setDepartments((prev) => prev.map((d) => d.id === editing.id ? { ...d, ...updated } : d));
      const courseCount = courses.filter((c) => c.department === editing.code).length;
      setSaveSuccess({ courseCount });
      setFormErrors({});
    } catch (err) {
      setFormErrors({ _general: err.message });
    }
  };

  const handleClose = () => {
    setEditing(null);
    setFormErrors({});
    setHeadSearch("");
    setHeadDropdown(false);
    setSaveSuccess(null);
  };

  const openEdit = (dept) => {
    setEditing({ ...dept, policies: { ...dept.policies } });
    const head = getUser(dept.headId);
    setHeadSearch(head ? head.fullName : "");
    setFormErrors({});
    setSaveSuccess(null);
    setHeadDropdown(false);
  };

  const setPolicy = (key, value) => {
    setEditing((prev) => ({ ...prev, policies: { ...prev.policies, [key]: value } }));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminLayout>
        <div style={{ padding: "28px 32px", color: "#94a3b8", fontSize: 14 }}>Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Department Settings</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Configure department policies, assign department heads, and manage contact information
          </p>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#f87171", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* ── Stats bar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Departments", value: departments.length, icon: "🏛️", color: "#22d3ee" },
            { label: "Total Instructors", value: users.filter((u) => u.role === "instructor").length, icon: "🧑‍🏫", color: "#c084fc" },
            { label: "Total Courses", value: courses.length, icon: "📚", color: "#4ade80" },
            { label: "Heads Assigned", value: departments.filter((d) => d.headId).length, icon: "👤", color: "#facc15" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Department cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {departments.map((dept) => {
            const color = DEPT_COLORS[dept.code] || "#94a3b8";
            const head = getUser(dept.headId);
            const stats = deptStats(dept.code);
            const p = dept.policies || {};

            return (
              <div key={dept.id} style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 16, overflow: "hidden" }}>
                {/* Card header */}
                <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1a2540" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color }}>
                        {dept.code.slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{dept.name}</div>
                        <div style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{dept.code}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => openEdit(dept)}
                      style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                    >
                      Edit
                    </button>
                  </div>

                  {/* Head */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#475569", width: 80 }}>Head</span>
                    {head ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#c084fc" }}>{head.fullName}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#334155", fontStyle: "italic" }}>Unassigned</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#475569", width: 80 }}>Contact</span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{dept.contactEmail}</span>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "12px 20px", borderBottom: "1px solid #1a2540" }}>
                  {[
                    { label: "Instructors", value: stats.instructors, color: "#c084fc" },
                    { label: "Courses", value: stats.courses, color: "#22d3ee" },
                    { label: "Students", value: stats.students, color: "#4ade80" },
                  ].map((s) => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Policy summary */}
                <div style={{ padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}>
                    {p.latePenaltyPercent ?? 0}% late penalty
                  </span>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(250,204,21,0.08)", color: "#facc15", border: "1px solid rgba(250,204,21,0.15)" }}>
                    {p.plagiarismThreshold ?? 0}% plagiarism threshold
                  </span>
                  {p.requireCodeComments && (
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(34,211,238,0.08)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.15)" }}>
                      Comments required
                    </span>
                  )}
                  {p.allowPeerCollaboration && (
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.15)" }}>
                      Peer collab (max {p.maxGroupSize})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Edit Department Modal ── */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 16, width: 600, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px 20px", borderBottom: "1px solid #1a2540", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${DEPT_COLORS[editing.code] || "#94a3b8"}18`, border: `1px solid ${DEPT_COLORS[editing.code] || "#94a3b8"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: DEPT_COLORS[editing.code] || "#94a3b8" }}>
                  {editing.code.slice(0, 2)}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{editing.name}</h2>
                  <div style={{ fontSize: 12, color: "#475569" }}>Department Settings</div>
                </div>
              </div>
              <button onClick={handleClose} style={{ background: "transparent", border: "none", color: "#475569", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* API error banner */}
            {formErrors._general && (
              <div style={{ margin: "20px 28px 0", padding: "14px 18px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>{formErrors._general}</div>
              </div>
            )}

            {/* Success banner */}
            {saveSuccess && (
              <div style={{ margin: "20px 28px 0", padding: "14px 18px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginBottom: 2 }}>✓ Department updated successfully</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Settings will apply to {saveSuccess.courseCount} course{saveSuccess.courseCount !== 1 ? "s" : ""} in this department. All department instructors have been notified.
                </div>
              </div>
            )}

            {/* Form body */}
            <div style={{ padding: "24px 28px", flex: 1, overflowY: "auto" }}>

              {/* ── Basic Information ── */}
              <SectionTitle>Basic Information</SectionTitle>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Field label="Department Name *" error={formErrors.name}>
                  <input style={inputStyle} value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </Field>
                <Field label="Department Code">
                  <input style={{ ...inputStyle, color: "#64748b", cursor: "not-allowed" }} value={editing.code} readOnly />
                </Field>
              </div>

              <Field label="Contact Email *" error={formErrors.contactEmail}>
                <input style={inputStyle} type="email" placeholder="dept@kfupm.edu.sa"
                  value={editing.contactEmail}
                  onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })} />
              </Field>

              {/* Department head search */}
              <Field label="Department Head" hint="(instructor or admin)" error={formErrors.headId}>
                <div style={{ position: "relative" }}>
                  <input
                    style={inputStyle}
                    placeholder="Search by name…"
                    value={headSearch}
                    onChange={(e) => {
                      setHeadSearch(e.target.value);
                      setHeadDropdown(true);
                      if (!e.target.value) setEditing({ ...editing, headId: null });
                    }}
                    onFocus={() => setHeadDropdown(true)}
                  />
                  {editing.headId && (
                    <button
                      onClick={() => { setEditing({ ...editing, headId: null }); setHeadSearch(""); }}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}
                    >
                      ×
                    </button>
                  )}
                  {headDropdown && headSearch && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 9, zIndex: 10, maxHeight: 180, overflowY: "auto", marginTop: 4 }}>
                      {filteredHeads.length === 0 ? (
                        <div style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>No matches found</div>
                      ) : filteredHeads.map((u) => (
                        <button
                          key={u.id} type="button"
                          onClick={() => { setEditing({ ...editing, headId: u.id }); setHeadSearch(u.fullName); setHeadDropdown(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#10213f")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#06b6d4,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {u.fullName.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{u.fullName}</div>
                            <div style={{ fontSize: 11, color: "#475569" }}>{u.role} · {u.department}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {editing.headId && (
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#4ade80" }}>✓ Head assigned</p>
                )}
              </Field>

              {/* ── Grading Policies ── */}
              <SectionTitle>Grading Policies</SectionTitle>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Field label="Late Submission Penalty" hint="(0–100%)" error={formErrors.latePenalty}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number" min={0} max={100} style={{ ...inputStyle, flex: 1 }}
                      value={editing.policies.latePenaltyPercent}
                      onChange={(e) => setPolicy("latePenaltyPercent", Number(e.target.value))}
                    />
                    <span style={{ color: "#64748b", fontSize: 13 }}>%</span>
                  </div>
                </Field>
                <Field label="Default Deadline Time">
                  <input
                    type="time" style={inputStyle}
                    value={editing.policies.defaultDeadlineTime}
                    onChange={(e) => setPolicy("defaultDeadlineTime", e.target.value)}
                  />
                </Field>
              </div>

              {/* ── Plagiarism & Code Quality ── */}
              <SectionTitle>Code Quality & Plagiarism</SectionTitle>

              <Field label="Plagiarism Detection Threshold" hint="(0–100%)" error={formErrors.plagiarismThreshold}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={editing.policies.plagiarismThreshold}
                    onChange={(e) => setPolicy("plagiarismThreshold", Number(e.target.value))}
                    style={{ flex: 1, accentColor: "#22d3ee" }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#22d3ee", width: 42, textAlign: "right" }}>
                    {editing.policies.plagiarismThreshold}%
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#334155" }}>Lenient (0%)</span>
                  <span style={{ fontSize: 10, color: "#334155" }}>Strict (100%)</span>
                </div>
              </Field>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Require Code Comments</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>Students must comment their code to receive full marks</div>
                </div>
                <Toggle value={editing.policies.requireCodeComments} onChange={(v) => setPolicy("requireCodeComments", v)} />
              </div>

              {/* ── Collaboration ── */}
              <SectionTitle>Collaboration Settings</SectionTitle>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, marginBottom: editing.policies.allowPeerCollaboration ? 12 : 18 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Allow Peer Collaboration</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>Students may work in groups on lab assignments</div>
                </div>
                <Toggle
                  value={editing.policies.allowPeerCollaboration}
                  onChange={(v) => {
                    setPolicy("allowPeerCollaboration", v);
                    if (!v) setPolicy("maxGroupSize", 1);
                    else if (editing.policies.maxGroupSize < 2) setPolicy("maxGroupSize", 2);
                  }}
                />
              </div>

              {editing.policies.allowPeerCollaboration && (
                <Field label="Maximum Group Size" hint="(2–10)" error={formErrors.maxGroupSize}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setPolicy("maxGroupSize", Math.max(2, editing.policies.maxGroupSize - 1))}
                      style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 16, cursor: "pointer", flexShrink: 0 }}
                    >
                      −
                    </button>
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", width: 32, textAlign: "center" }}>
                      {editing.policies.maxGroupSize}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPolicy("maxGroupSize", Math.min(10, editing.policies.maxGroupSize + 1))}
                      style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 16, cursor: "pointer", flexShrink: 0 }}
                    >
                      +
                    </button>
                    <span style={{ fontSize: 12, color: "#475569" }}>students per group</span>
                  </div>
                </Field>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: "16px 28px 24px", borderTop: "1px solid #1a2540", flexShrink: 0, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={handleClose} style={btnSecondary}>
                {saveSuccess ? "Close" : "Cancel"}
              </button>
              {!saveSuccess && (
                <button onClick={handleSave} style={btnPrimary}>
                  Save Department Settings
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
