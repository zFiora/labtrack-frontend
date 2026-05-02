import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";

const card = "#0f1b33";
const border = "#1a2540";
const muted = "#64748b";
const text = "#e2e8f0";
const accent = "#22d3ee";
const success = "#4ade80";

function formatLastSeen(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function courseLabel(student) {
  return [
    student.courseCode,
    student.sectionNumber ? `SEC ${student.sectionNumber}` : null,
  ].filter(Boolean).join(" - ");
}

function enrollmentLabel(enrollment) {
  return [
    enrollment.courseCode,
    enrollment.sectionNumber ? `SEC ${enrollment.sectionNumber}` : null,
  ].filter(Boolean).join(" - ");
}

function getCourseLabels(student) {
  if (Array.isArray(student.courseSections) && student.courseSections.length > 0) {
    return student.courseSections.filter(Boolean);
  }
  if (Array.isArray(student.enrollments) && student.enrollments.length > 0) {
    return student.enrollments.map(enrollmentLabel).filter(Boolean);
  }
  return [courseLabel(student)].filter(Boolean);
}

export default function InstructorStudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/instructor/students")
      .then((data) => setStudents(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError(err.message ?? "Failed to load students.");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const courseOptions = useMemo(() => {
    const seen = new Map();
    students.forEach((student) => {
      getCourseLabels(student).forEach((label) => seen.set(label, label));
    });
    return Array.from(seen.values()).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students.filter((student) => {
      const labels = getCourseLabels(student);
      if (courseFilter !== "all" && !labels.includes(courseFilter)) return false;
      if (!needle) return true;
      return [
        student.fullName,
        student.email,
        student.studentId,
        student.department,
        ...labels,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [courseFilter, query, students]);

  const activeCount = students.filter((student) => student.status === "active").length;
  const sectionCount = courseOptions.length;

  return (
    <InstructorLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: text }}>Students</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>
              Students enrolled in sections assigned to you
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/instructor/courses")}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: "transparent",
              color: accent,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Manage Courses
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            ["Total Students", students.length, accent],
            ["Active Students", activeCount, success],
            ["Course Sections", sectionCount, "#a78bfa"],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students"
            style={{
              flex: 1,
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 10,
              color: text,
              padding: "10px 12px",
              outline: "none",
              fontSize: 13,
            }}
          />
          <select
            value={courseFilter}
            onChange={(event) => setCourseFilter(event.target.value)}
            style={{
              minWidth: 220,
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 10,
              color: text,
              padding: "10px 12px",
              outline: "none",
              fontSize: 13,
            }}
          >
            <option value="all">All sections</option>
            {courseOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "56px 24px", textAlign: "center", color: muted }}>Loading students...</div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div style={{ color: text, fontWeight: 700, marginBottom: 6 }}>No students found</div>
              <div style={{ color: muted, fontSize: 13 }}>
                Enrolled students will appear here once they join your course sections.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0a1628" }}>
                  {["Student", "Student ID", "Course Sections", "Department", "Status", "Last Login"].map((header) => (
                    <th key={header} style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const labels = getCourseLabels(student);
                  return (
                  <tr key={student.id} style={{ borderTop: `1px solid ${border}` }}>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ color: text, fontWeight: 700, fontSize: 13 }}>{student.fullName || "Unnamed student"}</div>
                      <div style={{ color: muted, fontSize: 12, marginTop: 3 }}>{student.email || "No email"}</div>
                    </td>
                    <td style={{ padding: "13px 16px", color: "#94a3b8", fontSize: 13 }}>{student.studentId || "-"}</td>
                    <td style={{ padding: "13px 16px" }}>
                      {labels.length === 0 ? (
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>-</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {labels.map((label) => (
                            <span
                              key={label}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "3px 8px",
                                borderRadius: 8,
                                background: "rgba(34,211,238,0.08)",
                                border: "1px solid rgba(34,211,238,0.18)",
                                color: accent,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "13px 16px", color: "#94a3b8", fontSize: 13 }}>{student.department || "-"}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 9px",
                        borderRadius: 999,
                        border: `1px solid ${student.status === "active" ? "rgba(74,222,128,0.3)" : "rgba(148,163,184,0.25)"}`,
                        color: student.status === "active" ? success : "#94a3b8",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}>
                        {student.status || "inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", color: "#94a3b8", fontSize: 12 }}>{formatLastSeen(student.lastLogin)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </InstructorLayout>
  );
}
