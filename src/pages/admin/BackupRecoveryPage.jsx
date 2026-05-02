import { useState, useEffect } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api";

const DEFAULT_SCHEDULE = {
  enabled: true,
  frequency: "daily",
  time: "02:00",
  dayOfWeek: "sunday",
  dayOfMonth: 1,
  scope: "full",
  retentionDays: 30,
  destination: "local",
  s3Bucket: "labtrack-backups",
  notifyOnFailure: true,
  notifyOnSuccess: false,
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
const purple  = "#a78bfa";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTs(ts) {
  return new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
function ago(ts) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function nextRun(schedule) {
  if (!schedule.enabled) return "Disabled";
  const now = new Date();
  const [h, m] = schedule.time.split(":").map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const diff = next - now;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `in ${hrs}h ${mins}m`;
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

function StatTile({ label, value, sub, color = "#e2e8f0" }) {
  return (
    <div style={{ background: "#0a1628", border: `1px solid ${border}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: dimmed, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, border: "none",
      background: value ? accent : "#1e3a5f", cursor: "pointer",
      position: "relative", transition: "background 0.2s",
    }}>
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", display: "block",
      }} />
    </button>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8,
      color: "#e2e8f0", fontSize: 12, padding: "7px 12px", outline: "none", cursor: "pointer",
    }}>
      {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function Toast({ msg, type, onDismiss }) {
  if (!msg) return null;
  const color = type === "error" ? danger : type === "warn" ? warn : success;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 999,
      background: card, border: `1px solid ${color}`, borderRadius: 12,
      padding: "12px 20px", color, fontSize: 13, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)", cursor: "pointer",
    }} onClick={onDismiss}>
      {msg}
    </div>
  );
}

// ─── Manual Backup Modal ──────────────────────────────────────────────────────
function ManualBackupModal({ onClose, onConfirm, loading }) {
  const [name, setName]   = useState(`manual_${new Date().toISOString().slice(0,10)}`);
  const [scope, setScope] = useState("full");
  const [retention, setRetention] = useState(90);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, width: 480, padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>Create Manual Backup</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 6 }}>Backup Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{
            width: "100%", boxSizing: "border-box",
            background: "#0f1b33", border: `1px solid ${border}`,
            borderRadius: 8, color: "#e2e8f0", fontSize: 13,
            padding: "9px 12px", outline: "none", fontFamily: "monospace",
          }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 8 }}>Scope</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["full","Full Backup"],["users-only","Users Only"],["courses-only","Courses Only"],["submissions-only","Submissions Only"]].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setScope(v)} style={{
                background: scope === v ? "rgba(34,211,238,0.1)" : "transparent",
                border: `1px solid ${scope === v ? accent : border}`,
                borderRadius: 8, padding: "9px 12px", cursor: "pointer",
                color: scope === v ? accent : muted, fontSize: 12, fontWeight: 600,
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 6 }}>Retention Period</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" value={retention} min={1} max={365}
              onChange={(e) => setRetention(Math.min(365, Math.max(1, Number(e.target.value))))}
              style={{ width: 80, background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "7px 10px", outline: "none", textAlign: "right" }} />
            <span style={{ fontSize: 12, color: muted }}>days</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, background: "transparent", border: `1px solid ${border}`,
            borderRadius: 10, color: muted, fontSize: 13, fontWeight: 600, padding: "11px 0", cursor: "pointer",
          }}>Cancel</button>
          <button type="button" disabled={loading} onClick={() => onConfirm({ name: name.trim() || `manual_${Date.now()}`, scope, retention })} style={{
            flex: 2, background: loading ? dimmed : accent, border: "none",
            borderRadius: 10, color: "#081018", fontSize: 13, fontWeight: 700, padding: "11px 0", cursor: loading ? "not-allowed" : "pointer",
          }}>{loading ? "Starting…" : "Start Backup"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Restore Confirm Modal ────────────────────────────────────────────────────
function RestoreModal({ backup, onClose, onConfirm }) {
  const [typed, setTyped] = useState("");
  const CONFIRM_WORD = "RESTORE";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: card, border: `1px solid ${danger}`, borderRadius: 20, width: 460, padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: danger }}>Restore Backup</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ background: "rgba(248,113,113,0.08)", border: `1px solid ${danger}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: danger }}>
          ⚠ This will overwrite all current platform data with the selected backup. This action cannot be undone.
        </div>
        <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 4 }}>Restoring from:</div>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: accent, marginBottom: 20 }}>{backup.name}</div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
          Type <span style={{ color: danger, fontWeight: 700 }}>{CONFIRM_WORD}</span> to confirm
        </div>
        <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_WORD}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#0f1b33", border: `1px solid ${typed === CONFIRM_WORD ? danger : border}`,
            borderRadius: 8, color: "#e2e8f0", fontSize: 13,
            padding: "9px 12px", outline: "none", marginBottom: 20,
          }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, background: "transparent", border: `1px solid ${border}`,
            borderRadius: 10, color: muted, fontSize: 13, fontWeight: 600, padding: "11px 0", cursor: "pointer",
          }}>Cancel</button>
          <button type="button" disabled={typed !== CONFIRM_WORD} onClick={onConfirm} style={{
            flex: 2, background: typed === CONFIRM_WORD ? danger : dimmed, border: "none",
            borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700,
            padding: "11px 0", cursor: typed === CONFIRM_WORD ? "pointer" : "not-allowed",
          }}>Restore Now</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BackupRecoveryPage() {
  const [backups, setBackups]       = useState([]);
  const [schedule, setSchedule]     = useState(DEFAULT_SCHEDULE);
  const [toast, setToast]           = useState({ msg: "", type: "success" });
  const [showManual, setShowManual] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [unsavedSched, setUnsavedSched] = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bks, sched] = await Promise.all([
          api.get("/admin/system/backups"),
          api.get("/admin/system/backup-schedule"),
        ]);
        setBackups(Array.isArray(bks) ? bks : []);
        setSchedule(sched || DEFAULT_SCHEDULE);
      } catch (err) {
        setToast({ msg: `Failed to load: ${err.message}`, type: "error" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (toast.msg) {
      const t = setTimeout(() => setToast({ msg: "", type: "success" }), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function saveSchedule() {
    try {
      const updated = await api.patch("/admin/system/backup-schedule", schedule);
      setSchedule(updated);
      setUnsavedSched(false);
      setToast({ msg: "✓ Backup schedule saved", type: "success" });
    } catch (err) {
      setToast({ msg: `Save failed: ${err.message}`, type: "error" });
    }
  }

  function patchSchedule(key, value) {
    setSchedule((prev) => ({ ...prev, [key]: value }));
    setUnsavedSched(true);
  }

  async function startManualBackup({ name, scope, retention }) {
    setTriggering(true);
    try {
      const saved = await api.post("/admin/system/backups/trigger", { name, scope, retention });
      setBackups((prev) => [saved, ...prev]);
      setShowManual(false);
      setToast({ msg: "✓ Backup created successfully", type: "success" });
    } catch (err) {
      setToast({ msg: `Backup failed: ${err.message}`, type: "error" });
    } finally {
      setTriggering(false);
    }
  }

  async function deleteBackup(id) {
    try {
      await api.delete(`/admin/system/backups/${id}`);
      setBackups((prev) => prev.filter((b) => b.id !== id));
      setToast({ msg: "Backup deleted", type: "success" });
    } catch (err) {
      setToast({ msg: `Delete failed: ${err.message}`, type: "error" });
    }
  }

  function confirmRestore() {
    setRestoreTarget(null);
    setToast({ msg: `✓ Platform restored from "${restoreTarget.name}"`, type: "success" });
  }

  const successCount = backups.filter((b) => b.status === "success" || b.status === "completed").length;
  const failedCount  = backups.filter((b) => b.status === "failed").length;
  const lastSuccess  = backups.find((b) => b.status === "success" || b.status === "completed");
  const totalSize    = backups.filter((b) => b.status === "success" || b.status === "completed")
    .reduce((s, b) => s + parseFloat(b.size || "0"), 0).toFixed(1);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Backup & Recovery</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>
              Manage automated backups, run manual backups, and restore platform data
            </p>
          </div>
          <button type="button" onClick={() => setShowManual(true)} style={{
            background: accent, border: "none", borderRadius: 10,
            color: "#081018", fontSize: 13, fontWeight: 700,
            padding: "9px 22px", cursor: "pointer",
          }}>+ Manual Backup</button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatTile label="Total Backups"   value={backups.length}             sub="all time"               color={accent}  />
          <StatTile label="Successful"      value={successCount}               sub="completed cleanly"      color={success} />
          <StatTile label="Failed"          value={failedCount}                sub="need attention"         color={failedCount > 0 ? danger : muted} />
          <StatTile label="Storage Used"    value={`${totalSize} GB`}          sub="across all backups"     color={purple}  />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* Schedule config */}
          <div>
            <SectionCard title="Backup Schedule" icon="🗓️" action={
              unsavedSched && (
                <button type="button" onClick={saveSchedule} style={{
                  background: accent, border: "none", borderRadius: 8,
                  color: "#081018", fontSize: 12, fontWeight: 700,
                  padding: "6px 16px", cursor: "pointer",
                }}>Save Schedule</button>
              )
            }>
              <FieldRow label="Automated Backups" hint="Run backups on the configured schedule">
                <Toggle value={!!schedule.enabled} onChange={(v) => patchSchedule("enabled", v)} />
              </FieldRow>

              {schedule.enabled && (
                <>
                  <FieldRow label="Frequency" hint="How often backups run">
                    <SelectInput value={schedule.frequency} onChange={(v) => patchSchedule("frequency", v)}
                      options={[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]]} />
                  </FieldRow>
                  <FieldRow label="Time" hint="Time of day to run (server local time)">
                    <input type="time" value={schedule.time}
                      onChange={(e) => patchSchedule("time", e.target.value)}
                      style={{ background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 12, padding: "7px 10px", outline: "none" }} />
                  </FieldRow>
                  {schedule.frequency === "weekly" && (
                    <FieldRow label="Day of Week">
                      <SelectInput value={schedule.dayOfWeek} onChange={(v) => patchSchedule("dayOfWeek", v)}
                        options={["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].map((d) => [d, d.charAt(0).toUpperCase()+d.slice(1)])} />
                    </FieldRow>
                  )}
                  {schedule.frequency === "monthly" && (
                    <FieldRow label="Day of Month">
                      <input type="number" value={schedule.dayOfMonth} min={1} max={28}
                        onChange={(e) => patchSchedule("dayOfMonth", Math.min(28, Math.max(1, Number(e.target.value))))}
                        style={{ width: 70, background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "7px 10px", outline: "none", textAlign: "right" }} />
                    </FieldRow>
                  )}
                  <FieldRow label="Scope" hint="What data to include">
                    <SelectInput value={schedule.scope} onChange={(v) => patchSchedule("scope", v)}
                      options={[["full","Full Backup"],["users-only","Users Only"],["courses-only","Courses Only"],["submissions-only","Submissions Only"]]} />
                  </FieldRow>
                  <FieldRow label="Retention" hint="Auto-delete backups older than N days">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="number" value={schedule.retentionDays} min={1} max={365}
                        onChange={(e) => patchSchedule("retentionDays", Math.min(365, Math.max(1, Number(e.target.value))))}
                        style={{ width: 70, background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "7px 10px", outline: "none", textAlign: "right" }} />
                      <span style={{ fontSize: 12, color: muted }}>days</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Destination" hint="Where backup files are stored">
                    <SelectInput value={schedule.destination} onChange={(v) => patchSchedule("destination", v)}
                      options={[["local","Local Storage"],["s3","Amazon S3"],["ftp","FTP Server"]]} />
                  </FieldRow>
                  {schedule.destination === "s3" && (
                    <FieldRow label="S3 Bucket">
                      <input type="text" value={schedule.s3Bucket}
                        onChange={(e) => patchSchedule("s3Bucket", e.target.value)}
                        style={{ width: 180, background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 12, padding: "7px 10px", outline: "none", fontFamily: "monospace" }} />
                    </FieldRow>
                  )}
                  <FieldRow label="Notify on Failure" hint="Email admin if a scheduled backup fails">
                    <Toggle value={!!schedule.notifyOnFailure} onChange={(v) => patchSchedule("notifyOnFailure", v)} />
                  </FieldRow>
                  <FieldRow label="Notify on Success" hint="Email admin after every successful backup">
                    <Toggle value={!!schedule.notifyOnSuccess} onChange={(v) => patchSchedule("notifyOnSuccess", v)} />
                  </FieldRow>
                </>
              )}

              {/* Next run info */}
              <div style={{ marginTop: 4, padding: "12px 16px", background: "#0a1628", border: `1px solid ${border}`, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 11, color: muted }}>Next scheduled run</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: schedule.enabled ? accent : dimmed, marginTop: 3 }}>
                      {nextRun(schedule)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: muted }}>Last successful backup</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: success, marginTop: 3 }}>
                      {lastSuccess ? ago(lastSuccess.ts) : "Never"}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Backup list */}
          <div>
            <SectionCard title="Backup History" icon="💾">
              {backups.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: muted, fontSize: 13 }}>
                  No backups yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {backups.map((b) => {
                    const statusColor = b.status === "completed" || b.status === "success" ? success : b.status === "failed" ? danger : warn;
                    const statusLabel = b.status;
                    return (
                      <div key={b.id} style={{
                        padding: "12px 14px",
                        background: "#0a1628",
                        border: `1px solid ${border}`,
                        borderRadius: 12,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{
                                background: statusColor + "18", color: statusColor,
                                border: `1px solid ${statusColor}33`,
                                borderRadius: 5, fontSize: 9, fontWeight: 700,
                                padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                              }}>{statusLabel}</span>
                              <span style={{
                                background: b.type === "manual" ? "rgba(167,139,250,0.1)" : "rgba(34,211,238,0.08)",
                                color: b.type === "manual" ? purple : accent,
                                border: `1px solid ${b.type === "manual" ? purple : accent}33`,
                                borderRadius: 5, fontSize: 9, fontWeight: 700,
                                padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
                              }}>{b.type}</span>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {b.name}
                            </div>
                            <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
                              {b.scope} · {b.size} · {fmtTs(b.ts)} · retain {b.retention}d
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {(b.status === "success" || b.status === "completed") && (
                              <button type="button" onClick={() => setRestoreTarget(b)} style={{
                                background: "rgba(248,113,113,0.1)", border: `1px solid ${danger}33`,
                                borderRadius: 6, color: danger, fontSize: 11, fontWeight: 600,
                                padding: "5px 10px", cursor: "pointer",
                              }}>Restore</button>
                            )}
                            <button type="button" onClick={() => deleteBackup(b.id)} style={{
                              background: "transparent", border: `1px solid ${dimmed}`,
                              borderRadius: 6, color: muted, fontSize: 11,
                              padding: "5px 10px", cursor: "pointer",
                            }}>Delete</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      {showManual && <ManualBackupModal onClose={() => setShowManual(false)} onConfirm={startManualBackup} loading={triggering} />}
      {restoreTarget && <RestoreModal backup={restoreTarget} onClose={() => setRestoreTarget(null)} onConfirm={confirmRestore} />}
      <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast({ msg: "", type: "success" })} />
    </AdminLayout>
  );
}
