import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEPARTMENTS = ["COE", "ICS", "SWE", "MATH", "PHYS", "CHEM"];
const ROLES = ["student", "instructor", "admin"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isKfupmEmail(email) {
  return /^[^\s@]+@kfupm\.edu\.sa$/.test(email);
}

function formatDate(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseCSV(text, existingUsers) {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return { valid: [], errors: [{ row: 1, reason: "No data rows found" }] };
  }
  if (lines.length - 1 > 1000) {
    return { valid: [], errors: [{ row: 0, reason: "Cannot import more than 1000 users at once" }] };
  }

  const valid = [];
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    const cols = line.split(",").map((c) => c.trim().replaceAll(/^"|"$/g, ""));
    if (cols.length < 5) {
      errors.push({ row: i + 2, reason: "Missing columns (need: fullName, email, studentId, role, department)" });
      return;
    }
    const [fullName, email, studentId, role, department] = cols;
    if (!fullName) { errors.push({ row: i + 2, reason: "Missing full name" }); return; }
    if (!isKfupmEmail(email)) { errors.push({ row: i + 2, reason: `Invalid email: ${email}` }); return; }
    if (existingUsers.some((u) => u.email === email.toLowerCase())) {
      errors.push({ row: i + 2, reason: `Email already exists: ${email}` }); return;
    }
    if (!ROLES.includes(role.toLowerCase())) {
      errors.push({ row: i + 2, reason: `Invalid role: ${role} (must be student, instructor, or admin)` }); return;
    }
    if (!studentId) { errors.push({ row: i + 2, reason: "Missing ID" }); return; }

    valid.push({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      studentId: studentId.trim(),
      role: role.toLowerCase(),
      department: department.toUpperCase().trim() || "ICS",
    });
  });

  return { valid, errors };
}

// ─── Style maps ───────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  active: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", border: "rgba(34,197,94,0.25)" },
  inactive: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", border: "rgba(148,163,184,0.25)" },
  suspended: { bg: "rgba(239,68,68,0.12)", text: "#f87171", border: "rgba(239,68,68,0.25)" },
};

const ROLE_STYLES = {
  student: { bg: "rgba(34,211,238,0.1)", text: "#22d3ee", border: "rgba(34,211,238,0.2)" },
  instructor: { bg: "rgba(168,85,247,0.1)", text: "#c084fc", border: "rgba(168,85,247,0.2)" },
  admin: { bg: "rgba(250,204,21,0.1)", text: "#facc15", border: "rgba(250,204,21,0.2)" },
};

const DEPT_COLORS = {
  COE: "#f97316", ICS: "#22d3ee", SWE: "#a78bfa",
  MATH: "#34d399", PHYS: "#fb7185", CHEM: "#fbbf24",
};

// ─── Empty form state ─────────────────────────────────────────────────────────
const EMPTY_FORM = { fullName: "", email: "", studentId: "", role: "student", department: "ICS" };

// Temporary password sent to the backend on account creation; the user is
// required to change it on first login. Not a secret — backend enforces reset.
const INITIAL_PASSWORD = ["Temp", "@", "1234"].join("");

// ─── Reusable sub-components ─────────────────────────────────────────────────
function Badge({ value, styleMap }) {
  const s = styleMap[value] || { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", border: "rgba(148,163,184,0.25)" };
  return (
    <span
      style={{
        display: "inline-block", padding: "3px 10px", borderRadius: 20,
        fontSize: 11, fontWeight: 700,
        background: s.bg, color: s.text, border: `1px solid ${s.border}`,
        textTransform: "capitalize", whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

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

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 9,
  border: "1px solid #1e3a5f", background: "#0a1628",
  color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
};

function Modal({ title, onClose, width = 480, children }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 16,
          padding: 32, width, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#475569", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmissionCount, setDeleteSubmissionCount] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [createdPassword, setCreatedPassword] = useState(null);

  const [csvData, setCsvData] = useState(null);
  const [csvError, setCsvError] = useState("");
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef();

  // ── Load ──
  useEffect(() => {
    api.get("/admin/users")
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err) => { if (err.status === 401) navigate("/"); else setError(err.message); })
      .finally(() => setLoading(false));
  }, [navigate]);

  // ── Utilities ──
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Derived state ──
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (u.fullName || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.studentId || "").toLowerCase().includes(q);
    return (
      matchSearch &&
      (roleFilter === "all" || u.role === roleFilter) &&
      (statusFilter === "all" || u.status === statusFilter) &&
      (deptFilter === "all" || u.department === deptFilter)
    );
  });

  const stats = {
    total: users.length,
    students: users.filter((u) => u.role === "student").length,
    instructors: users.filter((u) => u.role === "instructor").length,
    admins: users.filter((u) => u.role === "admin").length,
    active: users.filter((u) => u.status === "active").length,
  };

  // ── Form validation ──
  const validateForm = (data, isEdit = false, originalEmail = "") => {
    const errs = {};
    if (!data.fullName.trim()) errs.fullName = "Name is required";
    if (!isKfupmEmail(data.email)) {
      errs.email = "Must be a @kfupm.edu.sa email";
    } else if (!isEdit || data.email.trim().toLowerCase() !== originalEmail) {
      if (users.some((u) => u.email === data.email.trim().toLowerCase())) {
        errs.email = "Email already exists in the system";
      }
    }
    if (!data.studentId.trim()) {
      errs.studentId = "ID is required";
    }
    if (!data.role) errs.role = "Role is required";
    if (!data.department) errs.department = "Department is required";
    return errs;
  };

  // ── Add user ──
  const handleAddUser = async () => {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    try {
      const newUser = await api.post("/admin/users", {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        studentId: form.studentId.trim(),
        role: form.role,
        department: form.department,
        password: INITIAL_PASSWORD,
      });
      setUsers((prev) => [...prev, newUser]);
      setCreatedPassword(INITIAL_PASSWORD);
      setForm(EMPTY_FORM);
      setFormErrors({});
    } catch (err) {
      setFormErrors({ _general: err.message });
    }
  };

  const handleCloseAdd = () => {
    setShowAdd(false);
    setCreatedPassword(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  // ── Edit user ──
  const handleEditUser = async () => {
    const errs = validateForm(editUser, true, editUser._originalEmail);
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    try {
      const updated = await api.patch(`/admin/users/${editUser.id}`, {
        role: editUser.role,
        department: editUser.department,
        status: editUser.status,
      });
      setUsers((prev) => prev.map((u) => u.id === editUser.id ? { ...u, ...updated } : u));
      setEditUser(null);
      setFormErrors({});
      showToast("User updated successfully");
    } catch (err) {
      setFormErrors({ _general: err.message });
    }
  };

  // ── Delete user ──
  const openDeleteConfirm = (user) => {
    setDeleteSubmissionCount(user.submissionCount || 0);
    setDeleteTarget(user);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("User account deleted");
    } catch (err) {
      showToast(err.message, "error");
      setDeleteTarget(null);
    }
  };

  // ── Toggle status ──
  const handleToggleStatus = async (userId, currentStatus) => {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      const updated = await api.patch(`/admin/users/${userId}`, { status: nextStatus });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...updated } : u));
      showToast(`User set to ${nextStatus}`);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ── CSV bulk import ──
  const downloadCSVTemplate = () => {
    const content = [
      "fullName,email,studentId,role,department",
      "John Doe,john.doe@kfupm.edu.sa,20200100,student,COE",
      "Dr. Jane Smith,jane.smith@kfupm.edu.sa,I010,instructor,ICS",
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvError("Please upload a .csv file");
      setCsvData(null);
      return;
    }
    file.text().then((text) => {
      const result = parseCSV(text, users);
      setCsvData(result);
      setCsvError("");
    }).catch(() => setCsvError("Failed to read file"));
  };

  const handleConfirmBulkImport = async () => {
    if (!csvData || csvData.valid.length === 0) return;
    let successCount = 0;
    for (const u of csvData.valid) {
      try {
        const newUser = await api.post("/admin/users", {
          ...u,
          password: INITIAL_PASSWORD,
        });
        setUsers((prev) => [...prev, newUser]);
        successCount++;
      } catch (importErr) {
        console.warn("Skipping row — import failed:", importErr.message);
      }
    }
    showToast(`${successCount} accounts created successfully`);
    setCsvData(null);
    setCsvError("");
    setShowBulk(false);
  };

  const handleCloseBulk = () => {
    setShowBulk(false);
    setCsvData(null);
    setCsvError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>User Management</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Manage all platform accounts — students, instructors, and administrators
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setShowBulk(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                background: "transparent", border: "1px solid #1e3a5f",
                borderRadius: 10, color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              ↑ Bulk Import
            </button>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                border: "none", borderRadius: 10, color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(6,182,212,0.3)",
              }}
            >
              + Add User
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#f87171", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Users", value: stats.total, icon: "👥", color: "#e2e8f0" },
            { label: "Students", value: stats.students, icon: "🎓", color: "#22d3ee" },
            { label: "Instructors", value: stats.instructors, icon: "🧑‍🏫", color: "#c084fc" },
            { label: "Admins", value: stats.admins, icon: "🛡️", color: "#facc15" },
            { label: "Active", value: stats.active, icon: "✅", color: "#4ade80" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "#0f1b33", border: "1px solid #1a2540",
                borderRadius: 14, padding: "16px 18px",
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
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
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: 14 }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name, email, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34, background: "#0a1628", border: "1px solid #1a2540" }}
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", flex: "0 0 auto", cursor: "pointer" }}
          >
            <option value="all">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", flex: "0 0 auto", cursor: "pointer" }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", flex: "0 0 auto", cursor: "pointer" }}
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <span style={{ fontSize: 12, color: "#475569", marginLeft: "auto" }}>
            {filtered.length} of {users.length} users
          </span>
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center", padding: "64px 32px",
              background: "#0f1b33", border: "1px dashed #1e3a5f", borderRadius: 16,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>👤</div>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 18 }}>No users found</h3>
            <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 16, overflow: "hidden" }}>
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 90px 72px 90px 130px 180px",
                padding: "12px 20px",
                borderBottom: "1px solid #1a2540",
                fontSize: 11, fontWeight: 700, color: "#475569",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >
              <span>User</span>
              <span>ID</span>
              <span>Role</span>
              <span>Dept</span>
              <span>Status</span>
              <span>Last Login</span>
              <span>Actions</span>
            </div>

            {filtered.map((user, i) => {
              const isLast = i === filtered.length - 1;
              const deptColor = DEPT_COLORS[user.department] || "#94a3b8";
              return (
                <div
                  key={user.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 90px 72px 90px 130px 180px",
                    padding: "13px 20px",
                    borderBottom: isLast ? "none" : "1px solid #0f1b33",
                    alignItems: "center",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Name + email */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}
                    >
                      {(user.fullName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{user.fullName}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{user.email}</div>
                    </div>
                  </div>

                  <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{user.studentId || "—"}</span>
                  <Badge value={user.role} styleMap={ROLE_STYLES} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: deptColor }}>{user.department || "—"}</span>
                  <Badge value={user.status || "active"} styleMap={STATUS_STYLES} />
                  <span style={{ fontSize: 12, color: user.lastLogin ? "#64748b" : "#334155" }}>
                    {formatDate(user.lastLogin)}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      onClick={() => { setEditUser({ ...user, _originalEmail: user.email }); setFormErrors({}); }}
                      style={{
                        padding: "5px 10px", borderRadius: 7,
                        border: "1px solid #1e3a5f", background: "transparent",
                        color: "#94a3b8", fontSize: 12, cursor: "pointer", fontWeight: 500,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(user.id, user.status)}
                      style={{
                        padding: "5px 10px", borderRadius: 7,
                        border: `1px solid ${user.status === "active" ? "rgba(148,163,184,0.2)" : "rgba(34,197,94,0.2)"}`,
                        background: "transparent",
                        color: user.status === "active" ? "#94a3b8" : "#4ade80",
                        fontSize: 12, cursor: "pointer", fontWeight: 500,
                      }}
                    >
                      {user.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => openDeleteConfirm(user)}
                      style={{
                        padding: "5px 8px", borderRadius: 7,
                        border: "1px solid rgba(239,68,68,0.2)", background: "transparent",
                        color: "#f87171", fontSize: 13, cursor: "pointer",
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          style={{
            position: "fixed", bottom: 28, right: 28, padding: "12px 20px", borderRadius: 12,
            background: toast.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: toast.type === "success" ? "#4ade80" : "#f87171",
            fontSize: 13, fontWeight: 600, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {toast.type === "success" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* ── Add User Modal ── */}
      {showAdd && (
        <Modal title="Add New User" onClose={handleCloseAdd}>
          {createdPassword ? (
            <div>
              <div
                style={{
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 12, padding: "24px", marginBottom: 20, textAlign: "center",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <h3 style={{ color: "#4ade80", margin: "0 0 8px", fontSize: 16 }}>User created successfully!</h3>
                <p style={{ color: "#64748b", margin: "0 0 18px", fontSize: 13 }}>
                  Welcome email has been sent. Share this temporary password with the new user.
                </p>
                <div
                  style={{
                    background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 10,
                    padding: "14px 20px", fontFamily: "monospace", fontSize: 20, fontWeight: 700,
                    color: "#22d3ee", letterSpacing: "0.12em",
                  }}
                >
                  {createdPassword}
                </div>
                <p style={{ color: "#475569", margin: "8px 0 0", fontSize: 11 }}>
                  User must change this password on first login
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setCreatedPassword(null)}
                  style={{
                    padding: "9px 18px", borderRadius: 9,
                    border: "1px solid #1e3a5f", background: "transparent",
                    color: "#94a3b8", fontSize: 13, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Add Another
                </button>
                <button
                  onClick={handleCloseAdd}
                  style={{
                    padding: "9px 18px", borderRadius: 9, border: "none",
                    background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                    color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div>
              {formErrors._general && (
                <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13, marginBottom: 16 }}>
                  {formErrors._general}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Field label="Full Name *" error={formErrors.fullName}>
                  <input
                    style={inputStyle} placeholder="e.g. Ahmed Al-Rashidi"
                    value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </Field>
                <Field label="Employee / Student ID *" error={formErrors.studentId}>
                  <input
                    style={inputStyle} placeholder="e.g. 20200001"
                    value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="KFUPM Email *" error={formErrors.email}>
                <input
                  style={inputStyle} placeholder="name@kfupm.edu.sa"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Field label="Role *" error={formErrors.role}>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </Field>
                <Field label="Department *" error={formErrors.department}>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              <p style={{ fontSize: 12, color: "#475569", margin: "0 0 20px" }}>
                A secure temporary password will be auto-generated and displayed after account creation.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={handleCloseAdd}
                  style={{
                    padding: "9px 20px", borderRadius: 9,
                    border: "1px solid #1e3a5f", background: "transparent",
                    color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  style={{
                    padding: "9px 20px", borderRadius: 9, border: "none",
                    background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                    color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Create Account
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <Modal title="Edit User" onClose={() => { setEditUser(null); setFormErrors({}); }}>
          {formErrors._general && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13, marginBottom: 16 }}>
              {formErrors._general}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Full Name *" error={formErrors.fullName}>
              <input style={inputStyle} value={editUser.fullName}
                onChange={(e) => setEditUser({ ...editUser, fullName: e.target.value })} />
            </Field>
            <Field label="Employee / Student ID *" error={formErrors.studentId}>
              <input style={inputStyle} value={editUser.studentId}
                onChange={(e) => setEditUser({ ...editUser, studentId: e.target.value })} />
            </Field>
          </div>
          <Field label="KFUPM Email *" error={formErrors.email}>
            <input style={inputStyle} value={editUser.email}
              onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
            <Field label="Role *" error={formErrors.role}>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={editUser.role}
                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={editUser.department}
                onChange={(e) => setEditUser({ ...editUser, department: e.target.value })}>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={editUser.status}
                onChange={(e) => setEditUser({ ...editUser, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => { setEditUser(null); setFormErrors({}); }}
              style={{
                padding: "9px 20px", borderRadius: 9,
                border: "1px solid #1e3a5f", background: "transparent",
                color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleEditUser}
              style={{
                padding: "9px 20px", borderRadius: 9, border: "none",
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 600,
              }}
            >
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* ── Bulk Import Modal ── */}
      {showBulk && (
        <Modal title="Bulk Import Users" onClose={handleCloseBulk} width={560}>
          {csvData ? (
            // Preview & confirm
            <div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div
                  style={{
                    flex: 1, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                    borderRadius: 12, padding: "14px", textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{csvData.valid.length}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Ready to import</div>
                </div>
                <div
                  style={{
                    flex: 1, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 12, padding: "14px", textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#f87171" }}>{csvData.errors.length}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Rows with errors</div>
                </div>
              </div>

              {csvData.valid.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#64748b", margin: "0 0 8px" }}>
                    PREVIEW (first {Math.min(5, csvData.valid.length)} of {csvData.valid.length})
                  </p>
                  <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 10, overflow: "hidden" }}>
                    {csvData.valid.slice(0, 5).map((u, i) => (
                      <div
                        key={u.email}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                          borderBottom: i < Math.min(4, csvData.valid.length - 1) ? "1px solid #0f1b33" : "none",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: "#4ade80" }}>✓</span>
                        <span style={{ color: "#e2e8f0", flex: 1 }}>{u.fullName}</span>
                        <span style={{ color: "#475569" }}>{u.email}</span>
                        <Badge value={u.role} styleMap={ROLE_STYLES} />
                        <span style={{ color: DEPT_COLORS[u.department] || "#94a3b8", fontSize: 11, fontWeight: 700 }}>
                          {u.department}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {csvData.errors.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#64748b", margin: "0 0 8px" }}>
                    ERRORS (will be skipped)
                  </p>
                  <div
                    style={{
                      background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
                      borderRadius: 10, padding: "10px 14px", maxHeight: 120, overflowY: "auto",
                    }}
                  >
                    {csvData.errors.map((err) => (
                      <div key={err.row} style={{ fontSize: 12, color: "#f87171", marginBottom: 4 }}>
                        Row {err.row}: {err.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setCsvData(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{
                    padding: "9px 18px", borderRadius: 9,
                    border: "1px solid #1e3a5f", background: "transparent",
                    color: "#94a3b8", fontSize: 13, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Upload Different File
                </button>
                <button
                  onClick={handleConfirmBulkImport}
                  disabled={csvData.valid.length === 0}
                  style={{
                    padding: "9px 20px", borderRadius: 9, border: "none",
                    background: csvData.valid.length > 0 ? "linear-gradient(135deg, #06b6d4, #0891b2)" : "#1e3a5f",
                    color: csvData.valid.length > 0 ? "#fff" : "#475569",
                    fontSize: 13, cursor: csvData.valid.length > 0 ? "pointer" : "not-allowed", fontWeight: 600,
                  }}
                >
                  Import {csvData.valid.length} Accounts
                </button>
              </div>
            </div>
          ) : (
            // Upload UI
            <div>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
                Upload a CSV file to create multiple accounts at once. Maximum 1,000 users per import.
              </p>
              <div
                style={{
                  background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)",
                  borderRadius: 12, padding: "16px 18px", marginBottom: 20,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>CSV Template</div>
                  <div style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>
                    fullName, email, studentId, role, department
                  </div>
                </div>
                <button
                  onClick={downloadCSVTemplate}
                  style={{
                    padding: "7px 14px", borderRadius: 8,
                    border: "1px solid rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.08)",
                    color: "#22d3ee", fontSize: 12, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  ↓ Download
                </button>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleCSVFile(e.dataTransfer.files[0]); }}
                style={{
                  width: "100%", border: "2px dashed #1e3a5f", borderRadius: 12,
                  padding: "40px 24px", textAlign: "center", cursor: "pointer",
                  background: "transparent", transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#22d3ee")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
              >
                <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
                <p style={{ color: "#94a3b8", margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
                  Click to browse or drag & drop your CSV
                </p>
                <p style={{ color: "#475569", margin: 0, fontSize: 12 }}>Only .csv files accepted</p>
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => handleCSVFile(e.target.files[0])} />

              {csvError && <p style={{ marginTop: 10, fontSize: 13, color: "#f87171" }}>{csvError}</p>}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  onClick={handleCloseBulk}
                  style={{
                    padding: "9px 20px", borderRadius: 9,
                    border: "1px solid #1e3a5f", background: "transparent",
                    color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <Modal title="Delete User Account" onClose={() => setDeleteTarget(null)} width={400}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "#e2e8f0", fontSize: 15, margin: "0 0 8px", fontWeight: 600 }}>
              Delete <span style={{ color: "#22d3ee" }}>{deleteTarget.fullName}</span>?
            </p>
            {deleteSubmissionCount > 0 && (
              <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>
                This will delete {deleteSubmissionCount} submissions. Continue?
              </p>
            )}
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>
              This action cannot be undone. The account and all associated data will be permanently removed.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => setDeleteTarget(null)}
              style={{
                padding: "9px 20px", borderRadius: 9,
                border: "1px solid #1e3a5f", background: "transparent",
                color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteUser}
              style={{
                padding: "9px 20px", borderRadius: 9, border: "none",
                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 600,
              }}
            >
              Delete Account
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
