import { useState, useEffect } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api";

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_PERMISSIONS = {
  student: {
    viewOwnSubmissions: true,  editOwnSubmissions: true,  viewGrades: true,
    downloadLabFiles: true,    viewLeaderboard: true,     postComments: true,
    viewOtherSubmissions: false, accessAnalytics: false,  manageUsers: false,
  },
  instructor: {
    viewOwnSubmissions: true,  editOwnSubmissions: true,  viewGrades: true,
    downloadLabFiles: true,    viewLeaderboard: true,     postComments: true,
    viewOtherSubmissions: true, accessAnalytics: true,   manageUsers: false,
    createLabs: true,          gradeLabs: true,           viewAllSubmissions: true,
    runPlagiarism: true,       manageSections: true,
  },
  admin: {
    viewOwnSubmissions: true,  editOwnSubmissions: true,  viewGrades: true,
    downloadLabFiles: true,    viewLeaderboard: true,     postComments: true,
    viewOtherSubmissions: true, accessAnalytics: true,   manageUsers: true,
    createLabs: true,          gradeLabs: true,           viewAllSubmissions: true,
    runPlagiarism: true,       manageSections: true,
    manageSystem: true,        viewAuditLogs: true,       manageSecurity: true,
    backupData: true,
  },
};

const PERMISSION_LABELS = {
  viewOwnSubmissions:    { label: "View Own Submissions",     group: "Submissions" },
  editOwnSubmissions:    { label: "Edit Own Submissions",     group: "Submissions" },
  viewOtherSubmissions:  { label: "View Others' Submissions", group: "Submissions" },
  viewAllSubmissions:    { label: "View All Submissions",     group: "Submissions" },
  viewGrades:            { label: "View Grades",              group: "Grading" },
  gradeLabs:             { label: "Grade Labs",               group: "Grading" },
  accessAnalytics:       { label: "Access Analytics",         group: "Grading" },
  runPlagiarism:         { label: "Run Plagiarism Check",     group: "Grading" },
  downloadLabFiles:      { label: "Download Lab Files",       group: "Labs" },
  createLabs:            { label: "Create/Edit Labs",         group: "Labs" },
  manageSections:        { label: "Manage Sections",          group: "Labs" },
  viewLeaderboard:       { label: "View Leaderboard",         group: "Social" },
  postComments:          { label: "Post Comments",            group: "Social" },
  manageUsers:           { label: "Manage Users",             group: "Administration" },
  manageSystem:          { label: "Manage System Settings",   group: "Administration" },
  viewAuditLogs:         { label: "View Audit Logs",          group: "Administration" },
  manageSecurity:        { label: "Manage Security",          group: "Administration" },
  backupData:            { label: "Backup & Restore Data",    group: "Administration" },
};

const DEFAULT_SECURITY = {
  twoFactorRequired: { admin: true, instructor: false, student: false },
  sessionTimeoutMin: { admin: 30, instructor: 120, student: 240 },
  maxLoginAttempts: 5,
  lockoutDurationMin: 15,
  passwordExpiryDays: 90,
  requireStrongPassword: true,
  examMode: {
    enabled: false,
    allowedIpRanges: ["10.0.0.0/24", "192.168.1.0/24"],
    blockVPN: true,
    lockBrowser: false,
  },
};

// ─── Style tokens ─────────────────────────────────────────────────────────────
const bg      = "#080f1e";
const card    = "#0b1424";
const border  = "#1a2540";
const accent  = "#22d3ee";
const muted   = "#8898b3";
const dimmed  = "#4a5568";
const success = "#34d399";
const warn    = "#fbbf24";
const danger  = "#f87171";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function severityColor(s) {
  if (s === "error") return danger;
  if (s === "warn")  return warn;
  return accent;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
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

function Toggle({ value, onChange, disabled = false }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, border: "none",
      background: value ? accent : "#1e3a5f",
      cursor: disabled ? "not-allowed" : "pointer",
      position: "relative", transition: "background 0.2s",
      opacity: disabled ? 0.45 : 1,
    }}>
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", display: "block",
      }} />
    </button>
  );
}

function NumberInput({ value, onChange, min, max, unit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        style={{
          width: 80, background: "#0f1b33", border: `1px solid ${border}`,
          borderRadius: 8, color: "#e2e8f0", fontSize: 13,
          padding: "7px 10px", outline: "none", textAlign: "right",
        }} />
      {unit && <span style={{ fontSize: 12, color: muted }}>{unit}</span>}
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

// ─── Permissions Matrix ───────────────────────────────────────────────────────
function PermissionsMatrix({ perms, onChange }) {
  const groups = [...new Set(Object.values(PERMISSION_LABELS).map((p) => p.group))];
  const ROLES = ["student", "instructor", "admin"];
  const ROLE_COLORS = { student: "#60a5fa", instructor: "#a78bfa", admin: accent };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontSize: 11, color: muted, fontWeight: 700, padding: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em", width: "46%" }}>Permission</th>
            {ROLES.map((r) => (
              <th key={r} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: ROLE_COLORS[r], padding: "0 0 14px", textTransform: "capitalize", width: "18%" }}>{r}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const groupPerms = Object.entries(PERMISSION_LABELS).filter(([, v]) => v.group === group);
            return [
              <tr key={`g_${group}`}>
                <td colSpan={4} style={{ padding: "12px 0 6px", fontSize: 10, fontWeight: 700, color: dimmed, textTransform: "uppercase", letterSpacing: "0.1em" }}>{group}</td>
              </tr>,
              ...groupPerms.map(([key, meta]) => (
                <tr key={key} style={{ borderTop: `1px solid ${border}` }}>
                  <td style={{ padding: "10px 0", fontSize: 12, color: "#cbd5e1" }}>{meta.label}</td>
                  {ROLES.map((role) => {
                    const has = perms[role]?.[key] ?? false;
                    const isAdminLocked = role === "admin" && ["manageSystem","viewAuditLogs","manageSecurity","backupData","manageUsers"].includes(key);
                    return (
                      <td key={role} style={{ textAlign: "center", padding: "10px 0" }}>
                        <Toggle
                          value={has}
                          onChange={(v) => onChange(role, key, v)}
                          disabled={isAdminLocked}
                        />
                      </td>
                    );
                  })}
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── IP Range editor ──────────────────────────────────────────────────────────
function IpRangeEditor({ ranges, onChange }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");

  function add() {
    const val = draft.trim();
    if (!val) return;
    const cidrRe = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!cidrRe.test(val)) { setErr("Invalid IP / CIDR format"); return; }
    if (ranges.includes(val)) { setErr("Already in list"); return; }
    onChange([...ranges, val]);
    setDraft("");
    setErr("");
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {ranges.map((ip) => (
          <div key={ip} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(34,211,238,0.08)", border: `1px solid ${accent}33`,
            borderRadius: 8, padding: "4px 10px",
          }}>
            <span style={{ fontSize: 12, fontFamily: "monospace", color: accent }}>{ip}</span>
            <button type="button" onClick={() => onChange(ranges.filter((r) => r !== ip))} style={{
              background: "none", border: "none", color: muted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
            }}>×</button>
          </div>
        ))}
        {ranges.length === 0 && <span style={{ fontSize: 12, color: dimmed }}>No IP ranges configured — all IPs allowed</span>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="e.g. 10.0.0.0/24 or 192.168.1.5"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{
            flex: 1, background: "#0f1b33", border: `1px solid ${err ? danger : border}`,
            borderRadius: 8, color: "#e2e8f0", fontSize: 12,
            padding: "7px 12px", outline: "none", fontFamily: "monospace",
          }}
        />
        <button type="button" onClick={add} style={{
          background: "rgba(34,211,238,0.1)", border: `1px solid ${accent}44`,
          borderRadius: 8, color: accent, fontSize: 12, fontWeight: 600,
          padding: "7px 16px", cursor: "pointer",
        }}>Add</button>
      </div>
      {err && <div style={{ fontSize: 11, color: danger, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SecurityAccessPage() {
  const [perms, setPerms]         = useState(() => structuredClone(DEFAULT_PERMISSIONS));
  const [security, setSecurity]   = useState(structuredClone(DEFAULT_SECURITY));
  const [audit, setAudit]         = useState([]);
  const [toast, setToast]         = useState({ msg: "", type: "success" });
  const [activeTab, setActiveTab] = useState("permissions");
  const [auditFilter, setAuditFilter] = useState("all");
  const [unsaved, setUnsaved]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [sec, logs] = await Promise.all([
          api.get("/admin/security/settings"),
          api.get("/admin/audit-logs"),
        ]);
        setSecurity({
          ...DEFAULT_SECURITY,
          ...sec,
          twoFactorRequired: { ...DEFAULT_SECURITY.twoFactorRequired, ...(sec.twoFactorRequired || {}) },
          sessionTimeoutMin: { ...DEFAULT_SECURITY.sessionTimeoutMin, ...(sec.sessionTimeoutMin || {}) },
          examMode: { ...DEFAULT_SECURITY.examMode, ...(sec.examMode || {}) },
        });
        setAudit(Array.isArray(logs) ? logs : []);
      } catch (err) {
        setToast({ msg: `Load failed: ${err.message}`, type: "error" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (toast.msg) {
      const t = setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function patchSecurity(path, value) {
    setSecurity((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    setUnsaved(true);
  }

  function togglePerm(role, key, value) {
    setPerms((prev) => {
      const next = structuredClone(prev);
      if (!next[role]) next[role] = {};
      next[role][key] = value;
      return next;
    });
    setUnsaved(true);
  }

  async function saveAll() {
    setSaving(true);
    try {
      const updated = await api.patch("/admin/security/settings", security);
      setSecurity({
        ...DEFAULT_SECURITY,
        ...updated,
        twoFactorRequired: { ...DEFAULT_SECURITY.twoFactorRequired, ...(updated.twoFactorRequired || {}) },
        sessionTimeoutMin: { ...DEFAULT_SECURITY.sessionTimeoutMin, ...(updated.sessionTimeoutMin || {}) },
        examMode: { ...DEFAULT_SECURITY.examMode, ...(updated.examMode || {}) },
      });
      setUnsaved(false);
      setToast({ msg: "✓ Security settings saved", type: "success" });
    } catch (err) {
      setToast({ msg: `Save failed: ${err.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function clearAudit() {
    try {
      await api.delete("/admin/audit-logs");
      setAudit([]);
      setToast({ msg: "Audit log cleared", type: "warn" });
    } catch (err) {
      setToast({ msg: `Clear failed: ${err.message}`, type: "error" });
    }
  }

  const filteredAudit = auditFilter === "all"
    ? audit
    : audit.filter((a) => a.severity === auditFilter);

  const ROLES = ["admin", "instructor", "student"];

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ background: bg, minHeight: "100vh", padding: "32px 36px", color: muted, fontSize: 14 }}>
          Loading…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{ background: bg, minHeight: "100vh", padding: "32px 36px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Security & Access Control</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>
              Role permissions, authentication policies, exam mode, and audit logs
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {unsaved && <span style={{ fontSize: 11, color: warn, fontWeight: 600 }}>● Unsaved changes</span>}
            <button type="button" onClick={saveAll} disabled={saving} style={{
              background: saving ? dimmed : accent, border: "none", borderRadius: 10,
              color: "#081018", fontSize: 13, fontWeight: 700,
              padding: "9px 22px", cursor: saving ? "not-allowed" : "pointer",
            }}>{saving ? "Saving…" : "Save Settings"}</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#0a1628", borderRadius: 12, padding: 4, width: "fit-content" }}>
          {[["permissions","Permissions Matrix"],["auth","Authentication"],["exam","Exam Mode"],["audit","Audit Log"]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} style={{
              background: activeTab === id ? card : "transparent",
              border: activeTab === id ? `1px solid ${border}` : "1px solid transparent",
              borderRadius: 9, padding: "8px 18px", cursor: "pointer",
              color: activeTab === id ? "#e2e8f0" : muted, fontSize: 13, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>

        {/* ── Permissions Matrix ── */}
        {activeTab === "permissions" && (
          <SectionCard title="Role Permissions Matrix" icon="🔐" action={
            <span style={{ fontSize: 11, color: dimmed }}>Admin core permissions are locked</span>
          }>
            <PermissionsMatrix perms={perms} onChange={togglePerm} />
          </SectionCard>
        )}

        {/* ── Authentication ── */}
        {activeTab === "auth" && (
          <>
            <SectionCard title="Two-Factor Authentication" icon="🔒">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                {ROLES.map((role) => (
                  <div key={role} style={{
                    background: "#0a1628", border: `1px solid ${border}`,
                    borderRadius: 12, padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", textTransform: "capitalize" }}>{role}</span>
                      <Toggle
                        value={!!security.twoFactorRequired?.[role]}
                        onChange={(v) => patchSecurity(`twoFactorRequired.${role}`, v)}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: muted }}>
                      {security.twoFactorRequired?.[role] ? "2FA required on login" : "2FA optional"}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Session & Password Policies" icon="🛡️">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 12, color: muted, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Session Timeout</div>
                  {ROLES.map((role) => (
                    <div key={role} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 13, color: "#cbd5e1", textTransform: "capitalize" }}>{role}</span>
                      <NumberInput
                        value={security.sessionTimeoutMin?.[role] ?? 60}
                        onChange={(v) => patchSecurity(`sessionTimeoutMin.${role}`, v)}
                        min={5} max={1440} unit="min"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: muted, marginBottom: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Login Security</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#cbd5e1" }}>Max Login Attempts</div>
                      <div style={{ fontSize: 11, color: muted }}>Before account lockout</div>
                    </div>
                    <NumberInput value={security.maxLoginAttempts ?? 5} onChange={(v) => patchSecurity("maxLoginAttempts", v)} min={3} max={10} unit="tries" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#cbd5e1" }}>Lockout Duration</div>
                      <div style={{ fontSize: 11, color: muted }}>After max attempts reached</div>
                    </div>
                    <NumberInput value={security.lockoutDurationMin ?? 15} onChange={(v) => patchSecurity("lockoutDurationMin", v)} min={5} max={1440} unit="min" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#cbd5e1" }}>Password Expiry</div>
                      <div style={{ fontSize: 11, color: muted }}>Force reset after N days (0 = never)</div>
                    </div>
                    <NumberInput value={security.passwordExpiryDays ?? 90} onChange={(v) => patchSecurity("passwordExpiryDays", v)} min={0} max={365} unit="days" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#cbd5e1" }}>Require Strong Password</div>
                      <div style={{ fontSize: 11, color: muted }}>Upper, lower, number, 8+ chars</div>
                    </div>
                    <Toggle value={!!security.requireStrongPassword} onChange={(v) => patchSecurity("requireStrongPassword", v)} />
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Exam Mode ── */}
        {activeTab === "exam" && (
          <SectionCard title="Exam Mode" icon="📋">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Enable Exam Mode</div>
                <div style={{ fontSize: 12, color: muted }}>Restricts platform access to approved IP ranges only. Use during proctored exams.</div>
              </div>
              <Toggle value={!!security.examMode?.enabled} onChange={(v) => patchSecurity("examMode.enabled", v)} />
            </div>

            {security.examMode?.enabled && (
              <div style={{
                background: "rgba(251,191,36,0.06)", border: `1px solid ${warn}33`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: warn,
              }}>
                ⚠ Exam mode is active. Only the IP ranges below can access the platform.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#0a1628", border: `1px solid ${border}`, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>Block VPN Access</div>
                    <div style={{ fontSize: 11, color: muted }}>Detect and reject VPN/proxy connections</div>
                  </div>
                  <Toggle value={!!security.examMode?.blockVPN} onChange={(v) => patchSecurity("examMode.blockVPN", v)} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#0a1628", border: `1px solid ${border}`, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>Browser Lock</div>
                    <div style={{ fontSize: 11, color: muted }}>Prevent tab switching and copy-paste</div>
                  </div>
                  <Toggle value={!!security.examMode?.lockBrowser} onChange={(v) => patchSecurity("examMode.lockBrowser", v)} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 10 }}>Allowed IP Ranges</div>
                <IpRangeEditor
                  ranges={security.examMode?.allowedIpRanges || []}
                  onChange={(v) => patchSecurity("examMode.allowedIpRanges", v)}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {/* ── Audit Log ── */}
        {activeTab === "audit" && (
          <SectionCard title="Audit Log" icon="📜" action={
            <div style={{ display: "flex", gap: 8 }}>
              {["all","info","warn","error"].map((f) => (
                <button key={f} type="button" onClick={() => setAuditFilter(f)} style={{
                  background: auditFilter === f ? (f === "error" ? "rgba(248,113,113,0.15)" : f === "warn" ? "rgba(251,191,36,0.15)" : "#1e3a5f") : "transparent",
                  border: `1px solid ${auditFilter === f ? (f === "error" ? danger : f === "warn" ? warn : accent) : border}`,
                  borderRadius: 8, color: auditFilter === f ? "#e2e8f0" : muted,
                  fontSize: 11, fontWeight: 600, padding: "5px 12px", cursor: "pointer", textTransform: "capitalize",
                }}>{f}</button>
              ))}
              <button type="button" onClick={clearAudit} style={{
                background: "transparent", border: `1px solid ${dimmed}`,
                borderRadius: 8, color: muted, fontSize: 11, fontWeight: 600,
                padding: "5px 12px", cursor: "pointer",
              }}>Clear All</button>
            </div>
          }>
            {filteredAudit.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: muted, fontSize: 13 }}>No audit entries found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredAudit.map((entry) => {
                  const rowBg = entry.severity !== "info"
                    ? (entry.severity === "error" ? "rgba(248,113,113,0.05)" : "rgba(251,191,36,0.05)")
                    : "transparent";
                  const rowBorder = entry.severity !== "info"
                    ? `1px solid ${severityColor(entry.severity)}22`
                    : `1px solid ${border}`;
                  const actorLabel = entry.actor?.email || entry.actor?.fullName || entry.actor || "—";
                  return (
                    <div key={entry.id} style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr 160px 90px 72px",
                      alignItems: "center", gap: 12,
                      padding: "10px 14px",
                      background: rowBg,
                      border: rowBorder,
                      borderRadius: 10,
                    }}>
                      <span style={{
                        background: entry.severity === "error" ? "rgba(248,113,113,0.12)" : entry.severity === "warn" ? "rgba(251,191,36,0.12)" : "rgba(34,211,238,0.08)",
                        color: severityColor(entry.severity),
                        borderRadius: 6, fontSize: 10, fontWeight: 700,
                        padding: "3px 8px", textAlign: "center", textTransform: "uppercase",
                      }}>{entry.severity}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{entry.action}</div>
                        <div style={{ fontSize: 11, color: muted }}>on <span style={{ color: accent }}>{entry.target}</span></div>
                      </div>
                      <div style={{ fontSize: 11, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {actorLabel}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: dimmed }}>{entry.ip || "—"}</div>
                      <div style={{ fontSize: 11, color: dimmed, textAlign: "right" }}>{ago(entry.ts)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        )}
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </AdminLayout>
  );
}
