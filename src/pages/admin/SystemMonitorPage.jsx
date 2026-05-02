import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api";

// ─── Style tokens ─────────────────────────────────────────────────────────────
const bg        = "#080f1e";
const card      = "#0b1424";
const border    = "#1a2540";
const accent    = "#22d3ee";
const muted     = "#8898b3";
const dimmed    = "#4a5568";
const success   = "#34d399";
const warn      = "#fbbf24";
const danger    = "#f87171";
const info      = "#60a5fa";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function levelColor(level) {
  if (level === "error") return danger;
  if (level === "warn")  return warn;
  return info;
}

function levelBg(level) {
  if (level === "error") return "rgba(248,113,113,0.1)";
  if (level === "warn")  return "rgba(251,191,36,0.1)";
  return "rgba(96,165,250,0.1)";
}

// ─── Simulated live metrics (randomized on each tick) ─────────────────────────
function genMetrics() {
  return {
    cpu:         Math.floor(18 + Math.random() * 45),
    memory:      Math.floor(42 + Math.random() * 30),
    disk:        78,
    activeJobs:  Math.floor(Math.random() * 12),
    queuedJobs:  Math.floor(Math.random() * 6),
    uptime:      "14d 6h 32m",
    activeSessions: Math.floor(8 + Math.random() * 20),
    requestsMin: Math.floor(40 + Math.random() * 80),
    avgLatencyMs: Math.floor(120 + Math.random() * 160),
    errorRate:   (Math.random() * 0.8).toFixed(2),
  };
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

function MetricBar({ label, value, max = 100, unit = "%", warnAt = 70, dangerAt = 90 }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= dangerAt ? danger : pct >= warnAt ? warn : success;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: muted }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}{unit}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#0f1b33", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, color = "#e2e8f0" }) {
  return (
    <div style={{ background: "#0a1628", border: `1px solid ${border}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: dimmed, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ level }) {
  return (
    <span style={{
      background: levelBg(level),
      color: levelColor(level),
      border: `1px solid ${levelColor(level)}33`,
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 8px",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
    }}>
      {level}
    </span>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, border: "none",
      background: value ? accent : "#1e3a5f", cursor: "pointer", position: "relative", transition: "background 0.2s",
    }}>
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block",
      }} />
    </button>
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SystemMonitorPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics]           = useState(genMetrics);
  const [logs, setLogs]                 = useState([]);
  const [maintenance, setMaintenance]   = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [logFilter, setLogFilter]       = useState("all");
  const [logSearch, setLogSearch]       = useState("");
  const [toast, setToast]               = useState({ msg: "", type: "success" });
  const [maintDraft, setMaintDraft]     = useState(null); // null = closed, obj = open
  const [confirmEnd, setConfirmEnd]     = useState(false);

  useEffect(() => {
    Promise.all([api.get("/admin/system/logs"), api.get("/admin/system/maintenance")])
      .then(([logsData, maintData]) => {
        setLogs(logsData);
        setMaintenance(maintData);
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // Live metrics refresh every 4 s
  useEffect(() => {
    const id = setInterval(() => setMetrics(genMetrics()), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (toast.msg) {
      const t = setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function resolveLog(id) {
    try {
      const updated = await api.patch(`/admin/system/logs/${id}`, { resolved: true });
      setLogs((prev) => prev.map((l) => l.id === id ? updated : l));
      setToast({ msg: "Log entry marked as resolved", type: "success" });
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setToast({ msg: err.message || "Failed to resolve log", type: "error" });
    }
  }

  async function deleteLog(id) {
    try {
      await api.delete(`/admin/system/logs/${id}`);
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setToast({ msg: "Log entry deleted", type: "success" });
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setToast({ msg: err.message || "Failed to delete log", type: "error" });
    }
  }

  async function clearResolved() {
    try {
      await api.delete("/admin/system/logs");
      setLogs((prev) => prev.filter((l) => !l.resolved));
      setToast({ msg: "Cleared all resolved logs", type: "success" });
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setToast({ msg: err.message || "Failed to clear logs", type: "error" });
    }
  }

  const activateMaintenance = useCallback(async () => {
    if (!maintDraft) return;
    const next = {
      ...maintenance,
      active: true,
      message: maintDraft.message,
      scheduledStart: maintDraft.scheduledStart,
      scheduledEnd: maintDraft.scheduledEnd,
      allowAdminAccess: maintDraft.allowAdminAccess,
    };
    try {
      const updated = await api.patch("/admin/system/maintenance", next);
      setMaintenance(updated);
      setMaintDraft(null);
      setToast({ msg: "Maintenance mode activated", type: "warn" });
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setToast({ msg: err.message || "Failed to activate maintenance", type: "error" });
    }
  }, [maintDraft, maintenance, navigate]);

  async function endMaintenance() {
    const entry = {
      message: maintenance.message,
      start: maintenance.scheduledStart || new Date(Date.now() - 3600000).toISOString().slice(0, 16),
      end: new Date().toISOString().slice(0, 16),
      duration: "—",
    };
    const next = {
      ...maintenance,
      active: false,
      scheduledStart: "",
      scheduledEnd: "",
      history: [entry, ...maintenance.history],
    };
    try {
      const updated = await api.patch("/admin/system/maintenance", next);
      setMaintenance(updated);
      setConfirmEnd(false);
      setToast({ msg: "Maintenance mode ended", type: "success" });
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setToast({ msg: err.message || "Failed to end maintenance", type: "error" });
    }
  }

  const filtered = logs.filter((l) => {
    if (logFilter !== "all" && l.level !== logFilter) return false;
    if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase()) &&
        !l.service.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const unresolvedCount = logs.filter((l) => !l.resolved).length;

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 14, color: muted }}>Loading system monitor...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 14, color: danger }}>{error}</div>
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
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>System Monitor</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>
              Live platform metrics, error logs, and maintenance control
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: card, border: `1px solid ${border}`,
              borderRadius: 10, padding: "8px 14px",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: maintenance?.active ? danger : success, display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: maintenance?.active ? danger : success }}>
                {maintenance?.active ? "Maintenance Active" : "System Operational"}
              </span>
            </div>
            {!maintenance?.active ? (
              <button type="button" onClick={() => setMaintDraft({
                message: maintenance?.message ?? "",
                scheduledStart: "",
                scheduledEnd: "",
                allowAdminAccess: maintenance?.allowAdminAccess ?? true,
              })} style={{
                background: "rgba(248,113,113,0.1)", border: `1px solid ${danger}`,
                borderRadius: 10, color: danger, fontSize: 12, fontWeight: 700,
                padding: "8px 16px", cursor: "pointer",
              }}>
                Enable Maintenance
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmEnd(true)} style={{
                background: "rgba(52,211,153,0.1)", border: `1px solid ${success}`,
                borderRadius: 10, color: success, fontSize: 12, fontWeight: 700,
                padding: "8px 16px", cursor: "pointer",
              }}>
                End Maintenance
              </button>
            )}
          </div>
        </div>

        {/* Maintenance banner */}
        {maintenance?.active && (
          <div style={{
            background: "rgba(248,113,113,0.08)", border: `1px solid ${danger}`,
            borderRadius: 12, padding: "14px 20px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: danger }}>Maintenance Mode Active</div>
              <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{maintenance.message}</div>
            </div>
          </div>
        )}

        {/* Live Metrics */}
        <SectionCard title="Live Metrics" icon="📊" action={
          <span style={{ fontSize: 11, color: dimmed }}>Auto-refreshes every 4s</span>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <StatTile label="Active Sessions"   value={metrics.activeSessions} sub="logged-in users" color={accent} />
            <StatTile label="Requests / min"    value={metrics.requestsMin}    sub="avg last 5 min"  color="#a78bfa" />
            <StatTile label="Avg Latency"       value={`${metrics.avgLatencyMs}ms`} sub="p50 response" color={warn} />
            <StatTile label="Error Rate"        value={`${metrics.errorRate}%`}     sub="last 5 min"   color={Number(metrics.errorRate) > 0.5 ? danger : success} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <MetricBar label="CPU Usage"    value={metrics.cpu}    warnAt={60} dangerAt={85} />
              <MetricBar label="Memory Usage" value={metrics.memory} warnAt={70} dangerAt={90} />
              <MetricBar label="Disk Usage"   value={metrics.disk}   warnAt={75} dangerAt={90} />
            </div>
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <StatTile label="Active Jobs"  value={metrics.activeJobs}  sub="running now"   color={success} />
                <StatTile label="Queued Jobs"  value={metrics.queuedJobs}  sub="waiting"       color={warn} />
                <StatTile label="System Uptime" value={metrics.uptime}     sub="since last restart" color={muted} />
                <StatTile label="Unresolved Logs" value={unresolvedCount}  sub="need attention" color={unresolvedCount > 0 ? danger : success} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Error Logs */}
        <SectionCard title="Error Logs" icon="📋" action={
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Search logs..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              style={{
                background: "#0f1b33", border: `1px solid ${border}`,
                borderRadius: 8, color: "#e2e8f0", fontSize: 12,
                padding: "6px 12px", outline: "none", width: 180,
              }}
            />
            {["all", "error", "warn", "info"].map((f) => (
              <button key={f} type="button" onClick={() => setLogFilter(f)} style={{
                background: logFilter === f ? (f === "error" ? "rgba(248,113,113,0.15)" : f === "warn" ? "rgba(251,191,36,0.15)" : f === "info" ? "rgba(96,165,250,0.15)" : "#1e3a5f") : "transparent",
                border: `1px solid ${logFilter === f ? (f === "error" ? danger : f === "warn" ? warn : f === "info" ? info : accent) : border}`,
                borderRadius: 8, color: logFilter === f ? "#e2e8f0" : muted,
                fontSize: 11, fontWeight: 600, padding: "5px 12px", cursor: "pointer",
                textTransform: "capitalize",
              }}>
                {f}
              </button>
            ))}
            <button type="button" onClick={clearResolved} style={{
              background: "transparent", border: `1px solid ${dimmed}`,
              borderRadius: 8, color: muted, fontSize: 11, fontWeight: 600,
              padding: "5px 12px", cursor: "pointer",
            }}>
              Clear Resolved
            </button>
          </div>
        }>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: muted, fontSize: 13 }}>
              No log entries match your filter
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((log) => (
                <div key={log.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "12px 16px",
                  background: log.resolved ? "transparent" : levelBg(log.level),
                  border: `1px solid ${log.resolved ? border : levelColor(log.level) + "33"}`,
                  borderRadius: 10,
                  opacity: log.resolved ? 0.55 : 1,
                }}>
                  <Badge level={log.level} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{log.service}</span>
                      <span style={{ fontSize: 11, color: dimmed }}>{ago(log.timestamp)}</span>
                      {log.resolved && <span style={{ fontSize: 10, color: success, fontWeight: 700 }}>RESOLVED</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", wordBreak: "break-word" }}>{log.message}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!log.resolved && (
                      <button type="button" onClick={() => resolveLog(log.id)} style={{
                        background: "rgba(52,211,153,0.1)", border: `1px solid ${success}33`,
                        borderRadius: 6, color: success, fontSize: 11, fontWeight: 600,
                        padding: "4px 10px", cursor: "pointer",
                      }}>
                        Resolve
                      </button>
                    )}
                    <button type="button" onClick={() => deleteLog(log.id)} style={{
                      background: "transparent", border: `1px solid ${dimmed}`,
                      borderRadius: 6, color: muted, fontSize: 11,
                      padding: "4px 10px", cursor: "pointer",
                    }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Maintenance History */}
        <SectionCard title="Maintenance History" icon="🕐">
          {maintenance?.history?.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: muted, fontSize: 13 }}>
              No maintenance windows recorded yet
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Description", "Start", "End", "Duration"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: muted, padding: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maintenance?.history?.map((m) => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${border}` }}>
                    <td style={{ fontSize: 12, color: "#cbd5e1", padding: "11px 0" }}>{m.message}</td>
                    <td style={{ fontSize: 12, color: muted, padding: "11px 16px 11px 0" }}>{m.start.replace("T", " ")}</td>
                    <td style={{ fontSize: 12, color: muted, padding: "11px 16px 11px 0" }}>{m.end.replace("T", " ")}</td>
                    <td style={{ fontSize: 12, color: accent, fontWeight: 700, padding: "11px 0" }}>{m.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {/* Enable Maintenance Modal */}
      {maintDraft && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, width: 520, padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: danger }}>Enable Maintenance Mode</h2>
              <button type="button" onClick={() => setMaintDraft(null)} style={{ background: "none", border: "none", color: muted, fontSize: 20, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ background: "rgba(248,113,113,0.08)", border: `1px solid ${danger}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: danger }}>
              Activating maintenance mode will show a maintenance screen to all non-admin users.
            </div>
            <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 6 }}>Maintenance Message</label>
            <textarea
              value={maintDraft.message}
              onChange={(e) => setMaintDraft({ ...maintDraft, message: e.target.value })}
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0f1b33", border: `1px solid ${border}`,
                borderRadius: 8, color: "#e2e8f0", fontSize: 13,
                padding: "10px 12px", outline: "none", resize: "vertical",
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 6 }}>Scheduled Start (optional)</label>
                <input type="datetime-local" value={maintDraft.scheduledStart}
                  onChange={(e) => setMaintDraft({ ...maintDraft, scheduledStart: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 12, padding: "8px 12px", outline: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 6 }}>Scheduled End (optional)</label>
                <input type="datetime-local" value={maintDraft.scheduledEnd}
                  onChange={(e) => setMaintDraft({ ...maintDraft, scheduledEnd: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", background: "#0f1b33", border: `1px solid ${border}`, borderRadius: 8, color: "#e2e8f0", fontSize: 12, padding: "8px 12px", outline: "none" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "12px 0", borderTop: `1px solid ${border}` }}>
              <span style={{ fontSize: 13, color: "#cbd5e1" }}>Allow admin access during maintenance</span>
              <Toggle value={maintDraft.allowAdminAccess} onChange={(v) => setMaintDraft({ ...maintDraft, allowAdminAccess: v })} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="button" onClick={() => setMaintDraft(null)} style={{
                flex: 1, background: "transparent", border: `1px solid ${border}`,
                borderRadius: 10, color: muted, fontSize: 13, fontWeight: 600, padding: "11px 0", cursor: "pointer",
              }}>Cancel</button>
              <button type="button" onClick={activateMaintenance} style={{
                flex: 2, background: danger, border: "none",
                borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, padding: "11px 0", cursor: "pointer",
              }}>Activate Maintenance Mode</button>
            </div>
          </div>
        </div>
      )}

      {/* End Maintenance Confirm */}
      {confirmEnd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, width: 420, padding: 32 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>End Maintenance Mode?</h2>
            <p style={{ fontSize: 13, color: muted, margin: "0 0 24px" }}>
              The platform will become accessible to all users. This window will be added to the maintenance history.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirmEnd(false)} style={{
                flex: 1, background: "transparent", border: `1px solid ${border}`,
                borderRadius: 10, color: muted, fontSize: 13, fontWeight: 600, padding: "11px 0", cursor: "pointer",
              }}>Cancel</button>
              <button type="button" onClick={endMaintenance} style={{
                flex: 2, background: success, border: "none",
                borderRadius: 10, color: "#081018", fontSize: 13, fontWeight: 700, padding: "11px 0", cursor: "pointer",
              }}>End Maintenance</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} type={toast.type} />
    </AdminLayout>
  );
}
