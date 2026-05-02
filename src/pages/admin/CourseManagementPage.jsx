import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEPARTMENTS = ["COE", "ICS", "SWE", "MATH", "PHYS", "CHEM"];
const SEMESTERS = ["T251", "T252", "T261", "T262"];
const DAYS_LIST = ["Sun", "Mon", "Tue", "Wed", "Thu"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function parseMeetingSchedule(value) {
  const raw = Array.isArray(value) ? value.join("/") : String(value || "").trim();
  if (!raw) return { days: [], startTime: "", endTime: "" };
  const match = raw.match(/^(.*?)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
  const daysPart = match ? match[1] : raw;
  return {
    days: daysPart.split(/[,\s/]+/).map((day) => day.trim()).filter(Boolean),
    startTime: match?.[2] || "",
    endTime: match?.[3] || "",
  };
}

function sectionDays(section) {
  const days = Array.isArray(section?.meetingDays) ? section.meetingDays.filter(Boolean) : [];
  if (days.length > 0) return days;
  if (typeof section?.meetingDays === "string" && section.meetingDays.trim()) return parseMeetingSchedule(section.meetingDays).days;
  return parseMeetingSchedule(section?.meetingTimes).days;
}

function sectionStart(section) {
  return section?.startTime || parseMeetingSchedule(section?.meetingTimes).startTime;
}

function sectionEnd(section) {
  return section?.endTime || parseMeetingSchedule(section?.meetingTimes).endTime;
}

function sectionTimeLabel(section) {
  const start = sectionStart(section);
  const end = sectionEnd(section);
  if (!start && !end && section?.meetingTimes) return section.meetingTimes;
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function timesOverlap(s1, e1, s2, e2) {
  if (!s1 || !e1 || !s2 || !e2) return false;
  return s1 < e2 && e1 > s2;
}

function daysOverlap(d1, d2) {
  const left = Array.isArray(d1) ? d1 : parseMeetingSchedule(d1).days;
  const right = Array.isArray(d2) ? d2 : parseMeetingSchedule(d2).days;
  return left.some((d) => right.includes(d));
}

function findTimeConflict(instructorId, section, allCourses, excludeSectionId = null) {
  for (const course of allCourses) {
    for (const sec of course.sections) {
      if (sec.id === excludeSectionId) continue;
      if (sec.instructorId !== instructorId) continue;
      if (
        daysOverlap(sectionDays(sec), sectionDays(section)) &&
        timesOverlap(sectionStart(sec), sectionEnd(sec), sectionStart(section), sectionEnd(section))
      ) {
        return `Conflict with ${course.courseCode} Sec ${sec.sectionNumber} (${sectionDays(sec).join("/")} ${formatTime(sectionStart(sec))}–${formatTime(sectionEnd(sec))})`;
      }
    }
  }
  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const DEPT_COLORS = {
  COE: "#f97316", ICS: "#22d3ee", SWE: "#a78bfa",
  MATH: "#34d399", PHYS: "#fb7185", CHEM: "#fbbf24",
};

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 9,
  border: "1px solid #1e3a5f", background: "#0a1628",
  color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, children, error }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171" }}>{error}</p>}
    </div>
  );
}

function Modal({ title, onClose, width = 520, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 16, padding: 32, width, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#475569", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

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

// ─── Empty form defaults ──────────────────────────────────────────────────────
const EMPTY_COURSE = { courseCode: "", name: "", department: "ICS", creditHours: 3, semester: "T252" };
const EMPTY_SECTION = { sectionNumber: "", meetingDays: [], startTime: "", endTime: "", capacity: 30, instructorId: "" };

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CourseManagementPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [semFilter, setSemFilter] = useState("all");

  // Modal visibility
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [addSectionFor, setAddSectionFor] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [enrollFor, setEnrollFor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [removeInstTarget, setRemoveInstTarget] = useState(null);

  // Form state
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE);
  const [sectionForm, setSectionForm] = useState(EMPTY_SECTION);
  const [courseErrors, setCourseErrors] = useState({});
  const [sectionErrors, setSectionErrors] = useState({});
  const [instSearch, setInstSearch] = useState("");
  const [instDropdown, setInstDropdown] = useState(false);

  // Enrollment state
  const [enrollTab, setEnrollTab] = useState("csv");
  const [enrollPreview, setEnrollPreview] = useState(null);
  const [enrollManualInput, setEnrollManualInput] = useState("");
  const [enrollError, setEnrollError] = useState("");

  const [toast, setToast] = useState(null);
  const enrollFileRef = useRef();

  // ── Load ──
  useEffect(() => {
    Promise.all([
      api.get("/admin/courses"),
      api.get("/admin/users"),
    ])
      .then(([coursesData, usersData]) => {
        setCourses(Array.isArray(coursesData) ? coursesData : []);
        setUsers(Array.isArray(usersData) ? usersData : []);
      })
      .catch((err) => { if (err.status === 401) navigate("/"); else setError(err.message); })
      .finally(() => setLoading(false));
  }, [navigate]);

  // ── Utilities ──
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const instructors = users.filter((u) => u.role === "instructor");
  const students = users.filter((u) => u.role === "student");
  const getUser = (id) => users.find((u) => u.id === id);

  // ── Derived ──
  const filtered = courses.filter((c) => {
    const q = search.toLowerCase();
    return (
      (!q || (c.courseCode || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q)) &&
      (deptFilter === "all" || c.department === deptFilter) &&
      (semFilter === "all" || c.semester === semFilter)
    );
  });

  const totalSections = courses.reduce((n, c) => n + (c.sections || []).length, 0);
  const totalEnrolled = courses.reduce((n, c) => n + (c.sections || []).reduce((s, sec) => s + (sec.enrolledStudentIds || []).length, 0), 0);

  // ── Course validation & CRUD ──
  const validateCourse = (data, editId = null) => {
    const errs = {};
    if (!data.courseCode.trim()) {
      errs.courseCode = "Course code is required";
    } else {
      const dup = courses.find(
        (c) => c.courseCode.toLowerCase() === data.courseCode.trim().toLowerCase() &&
               c.semester === data.semester && c.id !== editId,
      );
      if (dup) errs.courseCode = `${data.courseCode.trim()} already exists in ${data.semester}`;
    }
    if (!data.name.trim()) errs.name = "Course name is required";
    if (!data.semester) errs.semester = "Semester is required";
    return errs;
  };

  const handleCreateCourse = async () => {
    const errs = validateCourse(courseForm);
    if (Object.keys(errs).length) { setCourseErrors(errs); return; }
    try {
      const nc = await api.post("/admin/courses", {
        courseCode: courseForm.courseCode.trim().toUpperCase(),
        name: courseForm.name.trim(),
        department: courseForm.department,
        creditHours: Number(courseForm.creditHours),
        semester: courseForm.semester,
        sections: [],
      });
      setCourses((prev) => [...prev, nc]);
      setShowCreateCourse(false);
      setCourseForm(EMPTY_COURSE);
      setCourseErrors({});
      showToast(`Course created successfully — ${nc.courseCode}`);
    } catch (err) {
      setCourseErrors({ _general: err.message });
    }
  };

  const handleEditCourse = async () => {
    const errs = validateCourse(editingCourse, editingCourse.id);
    if (Object.keys(errs).length) { setCourseErrors(errs); return; }
    try {
      const updated = await api.patch(`/admin/courses/${editingCourse.id}`, {
        courseCode: editingCourse.courseCode.trim().toUpperCase(),
        name: editingCourse.name.trim(),
        department: editingCourse.department,
        creditHours: Number(editingCourse.creditHours),
        semester: editingCourse.semester,
      });
      setCourses((prev) => prev.map((c) => c.id !== editingCourse.id ? c : { ...c, ...updated }));
      setEditingCourse(null);
      setCourseErrors({});
      showToast("Course updated successfully");
    } catch (err) {
      setCourseErrors({ _general: err.message });
    }
  };

  const handleDeleteCourse = async () => {
    try {
      await api.delete(`/admin/courses/${deleteTarget.courseId}`);
      setCourses((prev) => prev.filter((c) => c.id !== deleteTarget.courseId));
      setDeleteTarget(null);
      showToast("Course deleted");
    } catch (err) {
      showToast(err.message, "error");
      setDeleteTarget(null);
    }
  };

  // ── Section validation & CRUD ──
  const validateSection = (data, courseId, excludeId = null) => {
    const errs = {};
    if (!data.sectionNumber.trim()) {
      errs.sectionNumber = "Section number is required";
    } else {
      const course = courses.find((c) => c.id === courseId);
      if (course?.sections.some((s) => s.sectionNumber === data.sectionNumber.trim() && s.id !== excludeId)) {
        errs.sectionNumber = "Section number already exists in this course";
      }
    }
    if ((data.meetingDays || []).length === 0) errs.meetingDays = "Select at least one day";
    if (!data.startTime) errs.startTime = "Start time is required";
    if (!data.endTime) errs.endTime = "End time is required";
    if (data.startTime && data.endTime && data.startTime >= data.endTime) {
      errs.endTime = "End time must be after start time";
    }
    const cap = Number(data.capacity);
    if (!cap || cap < 1 || cap > 200) errs.capacity = "Capacity must be between 1 and 200";
    if (data.instructorId) {
      const inst = users.find((u) => u.id === data.instructorId);
      if (!inst || inst.role !== "instructor") {
        errs.instructorId = "Selected user is not an instructor";
      } else {
        const conflict = findTimeConflict(data.instructorId, data, courses, excludeId);
        if (conflict) errs.instructorId = `Time conflict: ${conflict}`;
      }
    }
    return errs;
  };

  const handleAddSection = async () => {
    const errs = validateSection(sectionForm, addSectionFor);
    if (Object.keys(errs).length) { setSectionErrors(errs); return; }
    try {
      const updated = await api.patch(`/admin/courses/${addSectionFor}`, {
        sections: [
          ...(courses.find((c) => c.id === addSectionFor)?.sections || []),
          {
            sectionNumber: sectionForm.sectionNumber.trim(),
            meetingDays: sectionForm.meetingDays,
            startTime: sectionForm.startTime,
            endTime: sectionForm.endTime,
            capacity: Number(sectionForm.capacity),
            instructorId: sectionForm.instructorId || null,
            enrolledStudentIds: [],
          },
        ],
      });
      setCourses((prev) => prev.map((c) => c.id === addSectionFor ? { ...c, ...updated } : c));
      closeSectionModal();
      showToast(sectionForm.instructorId ? "Section created with instructor assigned" : "Section created successfully");
    } catch (err) {
      setSectionErrors({ _general: err.message });
    }
  };

  const handleEditSection = async () => {
    const { courseId, section } = editingSection;
    const errs = validateSection(sectionForm, courseId, section.id);
    if (Object.keys(errs).length) { setSectionErrors(errs); return; }
    const course = courses.find((c) => c.id === courseId);
    const newSections = (course?.sections || []).map((s) =>
      s.id !== section.id ? s : {
        ...s,
        sectionNumber: sectionForm.sectionNumber.trim(),
        meetingDays: sectionForm.meetingDays,
        startTime: sectionForm.startTime,
        endTime: sectionForm.endTime,
        capacity: Number(sectionForm.capacity),
        instructorId: sectionForm.instructorId || null,
      },
    );
    try {
      const updated = await api.patch(`/admin/courses/${courseId}`, { sections: newSections });
      setCourses((prev) => prev.map((c) => c.id !== courseId ? c : { ...c, ...updated }));
      closeSectionModal();
      showToast("Section updated successfully");
    } catch (err) {
      setSectionErrors({ _general: err.message });
    }
  };

  const handleDeleteSection = async () => {
    const { courseId, sectionId } = deleteTarget;
    const course = courses.find((c) => c.id === courseId);
    const newSections = (course?.sections || []).filter((s) => s.id !== sectionId);
    try {
      const updated = await api.patch(`/admin/courses/${courseId}`, { sections: newSections });
      setCourses((prev) => prev.map((c) => c.id !== courseId ? c : { ...c, ...updated }));
      setDeleteTarget(null);
      showToast("Section deleted");
    } catch (err) {
      showToast(err.message, "error");
      setDeleteTarget(null);
    }
  };

  const handleRemoveInstructor = async () => {
    const { courseId, sectionId } = removeInstTarget;
    const course = courses.find((c) => c.id === courseId);
    const newSections = (course?.sections || []).map((s) => s.id !== sectionId ? s : { ...s, instructorId: null });
    try {
      const updated = await api.patch(`/admin/courses/${courseId}`, { sections: newSections });
      setCourses((prev) => prev.map((c) => c.id !== courseId ? c : { ...c, ...updated }));
      setRemoveInstTarget(null);
      showToast("Instructor removed from section");
    } catch (err) {
      showToast(err.message, "error");
      setRemoveInstTarget(null);
    }
  };

  // ── Enrollment ──
  const buildPreview = (courseId, sectionId, rawIds) => {
    const course = courses.find((c) => c.id === courseId);
    const section = course?.sections.find((s) => s.id === sectionId);
    if (!section) return;

    const allEnrolledInCourse = new Set(course.sections.flatMap((s) => s.enrolledStudentIds || []));
    const matched = [], notFound = [], alreadyEnrolled = [];

    rawIds.forEach((sid) => {
      const user = students.find((u) => u.studentId === sid || u.id === sid);
      if (!user) {
        notFound.push(sid);
      } else if ((section.enrolledStudentIds || []).includes(user.id)) {
        alreadyEnrolled.push({ ...user, note: "already in this section" });
      } else if (allEnrolledInCourse.has(user.id)) {
        alreadyEnrolled.push({ ...user, note: "enrolled in another section of this course" });
      } else {
        matched.push(user);
      }
    });

    setEnrollPreview({ matched, notFound, alreadyEnrolled });
  };

  const parseIds = (text) => text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

  const handleEnrollFile = (file) => {
    if (!file) return;
    file.text().then((text) => {
      const ids = parseIds(text);
      if (ids.length > 1000) { setEnrollError("Cannot enroll more than 1000 students at once"); return; }
      setEnrollError("");
      buildPreview(enrollFor.courseId, enrollFor.section.id, ids);
    }).catch(() => setEnrollError("Failed to read file"));
  };

  const handleManualPreview = () => {
    const ids = parseIds(enrollManualInput);
    if (ids.length === 0) { setEnrollError("Enter at least one student ID"); return; }
    setEnrollError("");
    buildPreview(enrollFor.courseId, enrollFor.section.id, ids);
  };

  const handleConfirmEnroll = async () => {
    const newIds = enrollPreview.matched.map((u) => u.id);
    const { courseId, section } = enrollFor;
    const course = courses.find((c) => c.id === courseId);
    const newSections = (course?.sections || []).map((s) =>
      s.id !== section.id ? s : {
        ...s,
        enrolledStudentIds: [...new Set([...(s.enrolledStudentIds || []), ...newIds])],
      },
    );
    try {
      const updated = await api.patch(`/admin/courses/${courseId}`, { sections: newSections });
      setCourses((prev) => prev.map((c) => c.id !== courseId ? c : { ...c, ...updated }));
      showToast(`${newIds.length} students enrolled in section`);
      closeEnroll();
    } catch (err) {
      showToast(err.message, "error");
      closeEnroll();
    }
  };

  const closeEnroll = () => {
    setEnrollFor(null);
    setEnrollPreview(null);
    setEnrollManualInput("");
    setEnrollError("");
    setEnrollTab("csv");
    if (enrollFileRef.current) enrollFileRef.current.value = "";
  };

  // ── Section modal helpers ──
  const openAddSection = (courseId) => {
    setAddSectionFor(courseId);
    setSectionForm(EMPTY_SECTION);
    setSectionErrors({});
    setInstSearch("");
    setInstDropdown(false);
  };

  const openEditSection = (courseId, section) => {
    setEditingSection({ courseId, section });
    setSectionForm({
      ...section,
      meetingDays: sectionDays(section),
      startTime: sectionStart(section),
      endTime: sectionEnd(section),
      instructorId: section.instructorId || "",
    });
    const inst = getUser(section.instructorId);
    setInstSearch(inst ? inst.fullName : "");
    setSectionErrors({});
    setInstDropdown(false);
  };

  const closeSectionModal = () => {
    setAddSectionFor(null);
    setEditingSection(null);
    setSectionForm(EMPTY_SECTION);
    setSectionErrors({});
    setInstSearch("");
    setInstDropdown(false);
  };

  const toggleDay = (day, form, setForm) => {
    const days = (form.meetingDays || []).includes(day)
      ? form.meetingDays.filter((d) => d !== day)
      : [...(form.meetingDays || []), day];
    setForm({ ...form, meetingDays: days });
  };

  const filteredInstructors = instructors.filter(
    (u) => !instSearch || u.fullName.toLowerCase().includes(instSearch.toLowerCase()),
  );

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Course Management</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Create and configure courses, sections, and student enrollment
            </p>
          </div>
          <button
            onClick={() => { setShowCreateCourse(true); setCourseForm(EMPTY_COURSE); setCourseErrors({}); }}
            style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(6,182,212,0.3)" }}
          >
            + Create New Course
          </button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#f87171", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Courses", value: courses.length, icon: "📚", color: "#22d3ee" },
            { label: "Total Sections", value: totalSections, icon: "📋", color: "#c084fc" },
            { label: "Students Enrolled", value: totalEnrolled, icon: "🎓", color: "#4ade80" },
            { label: "Instructors", value: instructors.length, icon: "🧑‍🏫", color: "#facc15" },
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

        {/* ── Filters ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: 14 }}>🔍</span>
            <input
              type="text" placeholder="Search by code or name…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34, background: "#0a1628", border: "1px solid #1a2540" }}
            />
          </div>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ ...inputStyle, width: "auto", cursor: "pointer" }}>
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={semFilter} onChange={(e) => setSemFilter(e.target.value)} style={{ ...inputStyle, width: "auto", cursor: "pointer" }}>
            <option value="all">All Semesters</option>
            {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "#475569", marginLeft: "auto" }}>
            {filtered.length} course{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Course list ── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 32px", background: "#0f1b33", border: "1px dashed #1e3a5f", borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px" }}>No courses found</h3>
            <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>
              {search || deptFilter !== "all" || semFilter !== "all" ? "Try adjusting your filters" : "Create your first course to get started"}
            </p>
            {!search && deptFilter === "all" && semFilter === "all" && (
              <button
                onClick={() => { setShowCreateCourse(true); setCourseForm(EMPTY_COURSE); setCourseErrors({}); }}
                style={{ ...btnPrimary }}
              >
                Create New Course
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((course) => {
              const isExp = !!expanded[course.id];
              const deptColor = DEPT_COLORS[course.department] || "#94a3b8";
              const courseEnrolled = (course.sections || []).reduce((n, s) => n + (s.enrolledStudentIds || []).length, 0);

              return (
                <div key={course.id} style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 14, overflow: "hidden" }}>
                  {/* Course row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px" }}>
                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [course.id]: !p[course.id] }))}
                      style={{ background: "transparent", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", padding: "0 4px", flexShrink: 0 }}
                    >
                      {isExp ? "▼" : "▶"}
                    </button>

                    {/* Course info — clickable to expand */}
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [course.id]: !p[course.id] }))}
                      style={{ flex: 1, display: "flex", alignItems: "center", gap: 16, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0, minWidth: 0 }}
                    >
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#22d3ee", width: 90, flexShrink: 0 }}>{course.courseCode}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: deptColor, width: 48, flexShrink: 0 }}>{course.department}</span>
                      <span style={{ fontSize: 12, color: "#64748b", width: 48, flexShrink: 0 }}>{course.creditHours} cr</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)", flexShrink: 0 }}>
                        {course.semester}
                      </span>
                      <span style={{ fontSize: 12, color: "#475569", flexShrink: 0 }}>
                        {(course.sections || []).length} sec · {courseEnrolled} std
                      </span>
                    </button>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => openAddSection(course.id)}
                        style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(34,211,238,0.2)", background: "rgba(34,211,238,0.1)", color: "#22d3ee", fontSize: 12, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        + Section
                      </button>
                      <button
                        onClick={() => { setEditingCourse({ ...course }); setCourseErrors({}); }}
                        style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "course", courseId: course.id, label: `${course.courseCode} — ${course.name}`, sectionCount: (course.sections || []).length, enrolledCount: courseEnrolled })}
                        style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: "#f87171", fontSize: 13, cursor: "pointer" }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Sections ── expanded */}
                  {isExp && (
                    <div style={{ borderTop: "1px solid #1a2540" }}>
                      {(course.sections || []).length === 0 ? (
                        <div style={{ padding: "24px", textAlign: "center" }}>
                          <p style={{ color: "#475569", fontSize: 13, margin: "0 0 12px" }}>No sections yet</p>
                          <button
                            onClick={() => openAddSection(course.id)}
                            style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", color: "#22d3ee", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                          >
                            + Add First Section
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Section table header */}
                          <div style={{ display: "grid", gridTemplateColumns: "70px 130px 180px 80px 110px 1fr 220px", padding: "8px 20px 8px 56px", background: "rgba(0,0,0,0.2)", fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            <span>Section</span><span>Days</span><span>Time</span><span>Cap</span><span>Enrolled</span><span>Instructor</span><span>Actions</span>
                          </div>

                          {(course.sections || []).map((sec, si) => {
                            const inst = getUser(sec.instructorId);
                            const enrolled = (sec.enrolledStudentIds || []).length;
                            const capacity = Number(sec.capacity) || 0;
                            const pct = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;
                            const isLast = si === course.sections.length - 1;

                            return (
                              <div
                                key={sec.id || `${course.id}-${sec.sectionNumber}`}
                                style={{ display: "grid", gridTemplateColumns: "70px 130px 180px 80px 110px 1fr 220px", padding: "12px 20px 12px 56px", borderBottom: isLast ? "none" : "1px solid #0f1b33", alignItems: "center" }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>§ {sec.sectionNumber}</span>
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>{sectionDays(sec).join(" / ") || "—"}</span>
                                <span style={{ fontSize: 12, color: "#64748b" }}>{sectionTimeLabel(sec)}</span>
                                <span style={{ fontSize: 12, color: "#64748b" }}>{capacity || "—"}</span>

                                {/* Enrollment bar */}
                                <div>
                                  <div style={{ fontSize: 12, color: pct >= 90 ? "#f87171" : "#64748b" }}>{enrolled}/{capacity || "—"}</div>
                                  <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: "#1a2540" }}>
                                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 2, background: pct >= 90 ? "#f87171" : "#22d3ee" }} />
                                  </div>
                                </div>

                                {/* Instructor */}
                                <div>
                                  {inst ? (
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: "#c084fc" }}>{inst.fullName}</div>
                                      <div style={{ fontSize: 10, color: "#475569" }}>{inst.department}</div>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: 12, color: "#334155", fontStyle: "italic" }}>Unassigned</span>
                                  )}
                                </div>

                                {/* Actions */}
                                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                  <button
                                    onClick={() => setEnrollFor({ courseId: course.id, section: sec })}
                                    style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.08)", color: "#4ade80", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                                  >
                                    Enroll Students
                                  </button>
                                  <button
                                    onClick={() => openEditSection(course.id, sec)}
                                    style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}
                                  >
                                    Edit
                                  </button>
                                  {inst && (
                                    <button
                                      onClick={() => setRemoveInstTarget({ courseId: course.id, sectionId: sec.id, instructorName: inst.fullName, label: `${course.courseCode} Sec ${sec.sectionNumber}` })}
                                      style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(250,204,21,0.2)", background: "rgba(250,204,21,0.06)", color: "#facc15", fontSize: 11, cursor: "pointer" }}
                                    >
                                      Remove Inst.
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setDeleteTarget({ type: "section", courseId: course.id, sectionId: sec.id, label: `${course.courseCode} Sec ${sec.sectionNumber}`, enrolledCount: enrolled })}
                                    style={{ padding: "4px 7px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: "#f87171", fontSize: 12, cursor: "pointer" }}
                                  >
                                    🗑
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Add section footer */}
                          <div style={{ padding: "10px 20px 10px 56px", borderTop: "1px solid #0f1b33" }}>
                            <button
                              onClick={() => openAddSection(course.id)}
                              style={{ padding: "6px 14px", borderRadius: 8, border: "1px dashed rgba(34,211,238,0.2)", background: "transparent", color: "#22d3ee", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                            >
                              + Add Section
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, padding: "12px 20px", borderRadius: 12, background: toast.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, color: toast.type === "success" ? "#4ade80" : "#f87171", fontSize: 13, fontWeight: 600, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {toast.type === "success" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* ── Create / Edit Course Modal ── */}
      {(showCreateCourse || editingCourse) && (() => {
        const isEdit = !!editingCourse;
        const form = isEdit ? editingCourse : courseForm;
        const setForm = isEdit
          ? (v) => setEditingCourse(typeof v === "function" ? v(editingCourse) : { ...editingCourse, ...v })
          : (v) => setCourseForm(typeof v === "function" ? v(courseForm) : { ...courseForm, ...v });

        return (
          <Modal
            title={isEdit ? "Edit Course" : "Create New Course"}
            onClose={() => { setShowCreateCourse(false); setEditingCourse(null); setCourseErrors({}); }}
          >
            {courseErrors._general && (
              <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13, marginBottom: 16 }}>
                {courseErrors._general}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <Field label="Course Code *" error={courseErrors.courseCode}>
                <input style={inputStyle} placeholder="e.g. ICS 202" value={form.courseCode}
                  onChange={(e) => setForm({ ...form, courseCode: e.target.value })} />
              </Field>
              <Field label="Credit Hours" error={courseErrors.creditHours}>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={form.creditHours}
                  onChange={(e) => setForm({ ...form, creditHours: e.target.value })}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Course Name *" error={courseErrors.name}>
              <input style={inputStyle} placeholder="e.g. Data Structures" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <Field label="Department" error={courseErrors.department}>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Semester *" error={courseErrors.semester}>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}>
                  {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => { setShowCreateCourse(false); setEditingCourse(null); setCourseErrors({}); }} style={btnSecondary}>Cancel</button>
              <button onClick={isEdit ? handleEditCourse : handleCreateCourse} style={btnPrimary}>
                {isEdit ? "Save Changes" : "Create Course"}
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* ── Add / Edit Section Modal ── */}
      {(addSectionFor || editingSection) && (
        <Modal
          title={editingSection ? "Edit Section" : `Add Section — ${courses.find((c) => c.id === (addSectionFor || editingSection?.courseId))?.courseCode}`}
          onClose={closeSectionModal}
          width={580}
        >
          {sectionErrors._general && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13, marginBottom: 16 }}>
              {sectionErrors._general}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Section Number *" error={sectionErrors.sectionNumber}>
              <input style={inputStyle} placeholder="e.g. 01" value={sectionForm.sectionNumber}
                onChange={(e) => setSectionForm({ ...sectionForm, sectionNumber: e.target.value })} />
            </Field>
            <Field label="Capacity * (1–200)" error={sectionErrors.capacity}>
              <input type="number" min={1} max={200} style={inputStyle} value={sectionForm.capacity}
                onChange={(e) => setSectionForm({ ...sectionForm, capacity: e.target.value })} />
            </Field>
          </div>

          <Field label="Meeting Days *" error={sectionErrors.meetingDays}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAYS_LIST.map((day) => {
                const active = (sectionForm.meetingDays || []).includes(day);
                return (
                  <button
                    key={day} type="button"
                    onClick={() => toggleDay(day, sectionForm, setSectionForm)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: active ? "rgba(34,211,238,0.15)" : "transparent",
                      border: `1px solid ${active ? "rgba(34,211,238,0.4)" : "#1e3a5f"}`,
                      color: active ? "#22d3ee" : "#64748b",
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Start Time *" error={sectionErrors.startTime}>
              <input type="time" style={inputStyle} value={sectionForm.startTime}
                onChange={(e) => setSectionForm({ ...sectionForm, startTime: e.target.value })} />
            </Field>
            <Field label="End Time *" error={sectionErrors.endTime}>
              <input type="time" style={inputStyle} value={sectionForm.endTime}
                onChange={(e) => setSectionForm({ ...sectionForm, endTime: e.target.value })} />
            </Field>
          </div>

          {/* Instructor search */}
          <Field label="Instructor (optional)" error={sectionErrors.instructorId}>
            <div style={{ position: "relative" }}>
              <input
                style={inputStyle} placeholder="Search instructor name…"
                value={instSearch}
                onChange={(e) => { setInstSearch(e.target.value); setInstDropdown(true); if (!e.target.value) setSectionForm({ ...sectionForm, instructorId: "" }); }}
                onFocus={() => setInstDropdown(true)}
              />
              {sectionForm.instructorId && (
                <button
                  onClick={() => { setSectionForm({ ...sectionForm, instructorId: "" }); setInstSearch(""); }}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}
                >
                  ×
                </button>
              )}
              {instDropdown && instSearch && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 9, zIndex: 10, maxHeight: 180, overflowY: "auto", marginTop: 4 }}>
                  {filteredInstructors.length === 0 ? (
                    <div style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>No instructors found</div>
                  ) : filteredInstructors.map((u) => (
                    <button
                      key={u.id} type="button"
                      onClick={() => { setSectionForm({ ...sectionForm, instructorId: u.id }); setInstSearch(u.fullName); setInstDropdown(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#10213f")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#06b6d4,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                        {u.fullName.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{u.fullName}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{u.department}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sectionForm.instructorId && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#4ade80" }}>✓ Instructor selected</p>
            )}
          </Field>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={closeSectionModal} style={btnSecondary}>Cancel</button>
            <button onClick={editingSection ? handleEditSection : handleAddSection} style={btnPrimary}>
              {editingSection ? "Save Changes" : "Add Section"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Enroll Students Modal ── */}
      {enrollFor && (() => {
        const course = courses.find((c) => c.id === enrollFor.courseId);
        const sec = enrollFor.section;
        return (
          <Modal
            title={`Enroll Students — ${course?.courseCode} Sec ${sec.sectionNumber}`}
            onClose={closeEnroll}
            width={560}
          >
            {enrollPreview ? (
              // Preview screen
              <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "Will enroll", value: enrollPreview.matched.length, color: "#4ade80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.2)" },
                    { label: "Not found", value: enrollPreview.notFound.length, color: "#f87171", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
                    { label: "Skipped (conflict)", value: enrollPreview.alreadyEnrolled.length, color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.2)" },
                  ].map((s) => (
                    <div key={s.label} style={{ flex: 1, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {enrollPreview.matched.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Will be enrolled</p>
                    <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 8, maxHeight: 140, overflowY: "auto" }}>
                      {enrollPreview.matched.map((u) => (
                        <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: "1px solid #0f1b33", fontSize: 12 }}>
                          <span style={{ color: "#4ade80" }}>✓</span>
                          <span style={{ color: "#e2e8f0", flex: 1 }}>{u.fullName}</span>
                          <span style={{ color: "#475569" }}>{u.studentId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(enrollPreview.notFound.length > 0 || enrollPreview.alreadyEnrolled.length > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Skipped</p>
                    <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "8px 12px", maxHeight: 100, overflowY: "auto" }}>
                      {enrollPreview.notFound.map((sid) => (
                        <div key={sid} style={{ fontSize: 12, color: "#f87171", marginBottom: 2 }}>ID not found: {sid}</div>
                      ))}
                      {enrollPreview.alreadyEnrolled.map((u) => (
                        <div key={u.id} style={{ fontSize: 12, color: "#facc15", marginBottom: 2 }}>{u.fullName} — {u.note}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setEnrollPreview(null)} style={btnSecondary}>Back</button>
                  <button
                    onClick={handleConfirmEnroll}
                    disabled={enrollPreview.matched.length === 0}
                    style={{ ...btnPrimary, opacity: enrollPreview.matched.length === 0 ? 0.5 : 1, cursor: enrollPreview.matched.length === 0 ? "not-allowed" : "pointer" }}
                  >
                    Enroll {enrollPreview.matched.length} Students
                  </button>
                </div>
              </div>
            ) : (
              // Input screen
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
                  Current enrollment: <strong style={{ color: "#e2e8f0" }}>{(sec.enrolledStudentIds || []).length}/{sec.capacity}</strong>
                </p>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, padding: 4, width: "fit-content" }}>
                  {["csv", "manual"].map((tab) => (
                    <button
                      key={tab} type="button" onClick={() => { setEnrollTab(tab); setEnrollError(""); }}
                      style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: enrollTab === tab ? "#10213f" : "transparent", color: enrollTab === tab ? "#e2e8f0" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
                    >
                      {tab === "csv" ? "CSV Upload" : "Manual Entry"}
                    </button>
                  ))}
                </div>

                {enrollTab === "csv" ? (
                  <div>
                    <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 14px" }}>
                      Upload a file with one student ID per line (studentId column).
                    </p>
                    <button
                      type="button"
                      onClick={() => enrollFileRef.current?.click()}
                      style={{ width: "100%", border: "2px dashed #1e3a5f", borderRadius: 10, padding: "28px", textAlign: "center", cursor: "pointer", background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#22d3ee")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                      <p style={{ color: "#94a3b8", margin: 0, fontSize: 13, fontWeight: 600 }}>Click to upload student ID list</p>
                      <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 12 }}>.csv or .txt, one ID per line</p>
                    </button>
                    <input ref={enrollFileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={(e) => handleEnrollFile(e.target.files[0])} />
                  </div>
                ) : (
                  <div>
                    <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 10px" }}>
                      Enter student IDs separated by commas, semicolons, or new lines.
                    </p>
                    <textarea
                      value={enrollManualInput}
                      onChange={(e) => setEnrollManualInput(e.target.value)}
                      placeholder={"20200001\n20200002\n20200003"}
                      style={{ ...inputStyle, height: 120, resize: "vertical", fontFamily: "monospace" }}
                    />
                    <button onClick={handleManualPreview} style={{ ...btnPrimary, marginTop: 10, width: "100%" }}>
                      Preview Enrollment
                    </button>
                  </div>
                )}

                {enrollError && <p style={{ marginTop: 10, fontSize: 13, color: "#f87171" }}>{enrollError}</p>}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button onClick={closeEnroll} style={btnSecondary}>Cancel</button>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <Modal title="Confirm Delete" onClose={() => setDeleteTarget(null)} width={400}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "#e2e8f0", fontSize: 15, margin: "0 0 8px", fontWeight: 600 }}>
              Delete <span style={{ color: "#22d3ee" }}>{deleteTarget.label}</span>?
            </p>
            {deleteTarget.type === "course" && deleteTarget.sectionCount > 0 && (
              <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 8px", fontWeight: 600 }}>
                This will delete {deleteTarget.sectionCount} section{deleteTarget.sectionCount !== 1 ? "s" : ""} and unenroll {deleteTarget.enrolledCount} students.
              </p>
            )}
            {deleteTarget.type === "section" && deleteTarget.enrolledCount > 0 && (
              <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 8px", fontWeight: 600 }}>
                This will unenroll {deleteTarget.enrolledCount} students. Continue?
              </p>
            )}
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>This action cannot be undone.</p>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteTarget(null)} style={btnSecondary}>Cancel</button>
            <button
              onClick={deleteTarget.type === "course" ? handleDeleteCourse : handleDeleteSection}
              style={{ ...btnPrimary, background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* ── Remove Instructor Confirmation ── */}
      {removeInstTarget && (
        <Modal title="Remove Instructor" onClose={() => setRemoveInstTarget(null)} width={400}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "#e2e8f0", fontSize: 15, margin: "0 0 8px", fontWeight: 600 }}>
              Remove <span style={{ color: "#c084fc" }}>{removeInstTarget.instructorName}</span>?
            </p>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>
              Removing them from <strong style={{ color: "#e2e8f0" }}>{removeInstTarget.label}</strong> will leave the section unassigned.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setRemoveInstTarget(null)} style={btnSecondary}>Cancel</button>
            <button onClick={handleRemoveInstructor} style={{ ...btnPrimary, background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
              Remove Instructor
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
