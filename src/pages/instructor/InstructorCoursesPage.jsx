import { useState, useEffect, useCallback } from "react";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";
import { useNavigate } from "react-router-dom";

const EMPTY_FORM = { code: "", name: "", department: "", semester: "", creditHours: 3, sectionNumber: "01" };

function getStudentKey(student) {
  if (!student) return "";
  if (typeof student === "string") return student;
  return String(student.id || student._id || student.studentId || student.email || "");
}

function addSectionStudents(target, section) {
  const students = section.enrolledStudentIds || section.students || [];
  students.forEach((student) => {
    const key = getStudentKey(student);
    if (key) target.add(key);
  });
}

function countUniqueStudents(sections = []) {
  const ids = new Set();
  sections.forEach((section) => addSectionStudents(ids, section));
  return ids.size;
}

export default function InstructorCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(null);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/instructor/courses");
      setCourses(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setError(err.message ?? "Failed to load courses.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const created = await api.post("/instructor/courses", {
        ...form,
        creditHours: Number(form.creditHours),
      });
      setCourses((prev) => [created, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err.message ?? "Failed to create course.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const totalStudents = countUniqueStudents(courses.flatMap((course) => course.sections || []));

  return (
    <InstructorLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>My Courses</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Create courses and share join codes with your students
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px",
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              border: "none", borderRadius: 10, color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(6,182,212,0.3)",
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> Create Course
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Total Courses", value: courses.length, icon: "📚", color: "#22d3ee" },
            { label: "Total Students", value: totalStudents, icon: "👥", color: "#4ade80" },
            { label: "Active Sections", value: courses.reduce((s, c) => s + (c.sections?.length ?? 0), 0), icon: "🏛️", color: "#a78bfa" },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 24 }}>{stat.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Course list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 32px", background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 16, color: "#94a3b8", fontSize: 14 }}>
            Loading courses...
          </div>
        ) : courses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 32px", background: "#0f1b33", border: "1px dashed #1e3a5f", borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 18 }}>No courses yet</h3>
            <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>Create your first course to get a join code for students</p>
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: "10px 24px", background: "linear-gradient(135deg, #06b6d4, #0891b2)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Create Course
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {courses.map((course) => {
              const studentCount = countUniqueStudents(course.sections || []);
              const isCopied = copied === course.joinCode;
              return (
                <div key={course.id} style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 16, padding: "22px 24px" }}>
                  {/* Course header */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {course.code}
                      </span>
                      <span style={{ fontSize: 11, color: "#475569" }}>{course.semester}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{course.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{course.department} · {course.creditHours} credit hrs</div>
                  </div>

                  {/* Students */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13, color: "#8898b3" }}>
                    <span>👥</span>
                    <span>{studentCount} student{studentCount !== 1 ? "s" : ""} enrolled</span>
                  </div>

                  {/* Join code */}
                  {course.joinCode ? (
                    <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                        Student Join Code
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "#22d3ee", letterSpacing: "0.15em", fontFamily: "monospace" }}>
                          {course.joinCode}
                        </span>
                        <button
                          onClick={() => copyCode(course.joinCode)}
                          style={{
                            padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: isCopied ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(34,211,238,0.3)",
                            background: isCopied ? "rgba(74,222,128,0.1)" : "rgba(34,211,238,0.1)",
                            color: isCopied ? "#4ade80" : "#22d3ee",
                            transition: "all 0.2s",
                          }}
                        >
                          {isCopied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "10px 14px", background: "#0a1628", borderRadius: 10, fontSize: 12, color: "#475569" }}>
                      No join code — created by admin
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create course modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 16, padding: 32, width: 440, maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Create New Course</h3>

            {formError && (
              <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "code", label: "Course Code", placeholder: "e.g. SWE363" },
                { key: "name", label: "Course Name", placeholder: "e.g. Software Engineering" },
                { key: "department", label: "Department", placeholder: "e.g. ICS" },
                { key: "semester", label: "Semester", placeholder: "e.g. T252" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8898b3", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {label}
                  </label>
                  <input
                    required
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: "100%", padding: "10px 12px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8898b3", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Credit Hours
                  </label>
                  <input
                    type="number" min={1} max={4}
                    value={form.creditHours}
                    onChange={(e) => setForm((f) => ({ ...f, creditHours: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8898b3", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Section #
                  </label>
                  <input
                    value={form.sectionNumber}
                    onChange={(e) => setForm((f) => ({ ...f, sectionNumber: e.target.value }))}
                    placeholder="01"
                    style={{ width: "100%", padding: "10px 12px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setFormError(""); }}
                  style={{ padding: "9px 20px", borderRadius: 9, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: "9px 24px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #06b6d4, #0891b2)", color: "#fff", fontSize: 14, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? "Creating…" : "Create Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </InstructorLayout>
  );
}
