import { useState, useEffect } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { api } from "../../utils/api";

const DEFAULT_SETTINGS = {
  execution: {
    compilationTimeoutSec: 30,
    executionTimeoutSec: 10,
    memoryLimitMB: 256,
    maxOutputKB: 512,
    sandboxEnabled: true,
  },
  languages: [
    { id: "python",     label: "Python 3.11",          icon: "🐍", enabled: true  },
    { id: "cpp",        label: "C++ 17",               icon: "⚙️", enabled: true  },
    { id: "java",       label: "Java 21",              icon: "☕", enabled: true  },
    { id: "javascript", label: "JavaScript (Node 20)", icon: "🟨", enabled: true  },
    { id: "c",          label: "C 11",                 icon: "🔵", enabled: false },
    { id: "rust",       label: "Rust 1.75",            icon: "🦀", enabled: false },
    { id: "go",         label: "Go 1.22",              icon: "🐹", enabled: false },
    { id: "r",          label: "R 4.3",                icon: "📊", enabled: false },
  ],
  api: {
    judgeApiUrl: "",
    judgeApiKey: "",
    aiAssistApiKey: "",
    aiAssistEnabled: true,
    aiAssistModel: "gpt-4o",
  },
  testing: {
    defaultTestCaseTimeout: 5,
    maxTestCasesPerLab: 50,
    allowCustomTestCases: true,
    showTestOutputToStudent: true,
    partialCreditEnabled: true,
    autoGradeOnSubmit: true,
  },
  notifications: {
    emailNotificationsEnabled: true,
    submissionAlerts: true,
    gradePublishedAlerts: true,
    systemAlerts: true,
    digestFrequency: "daily",
  },
};

// ─── Style tokens ─────────────────────────────────────────────────────────────
const bg = "#080f1e";
const card = "#0b1424";
const cardBorder = "#1a2540";
const accent = "#22d3ee";
const muted = "#8898b3";
const dimmed = "#4a5568";
const danger = "#f87171";
const success = "#34d399";
const warn = "#fbbf24";

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionCard({ title, icon, children }) {
  return (
    <div style={{
      background: card,
      border: `1px solid ${cardBorder}`,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 24,
    }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: `1px solid ${cardBorder}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{title}</span>
      </div>
      <div style={{ padding: "20px 24px" }}>{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 24,
      paddingBottom: 18,
      marginBottom: 18,
      borderBottom: `1px solid ${cardBorder}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, unit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        style={{
          width: 90,
          background: "#0f1b33",
          border: `1px solid ${cardBorder}`,
          borderRadius: 8,
          color: "#e2e8f0",
          fontSize: 13,
          padding: "7px 12px",
          outline: "none",
          textAlign: "right",
        }}
      />
      {unit && <span style={{ fontSize: 12, color: muted }}>{unit}</span>}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: value ? accent : "#1e3a5f",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute",
        top: 3,
        left: value ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        display: "block",
      }} />
    </button>
  );
}

function ApiKeyField({ value, onChange }) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleSave() {
    onChange(draft);
    setEditing(false);
    setShow(false);
  }

  const displayValue = value || "";
  const masked = displayValue.length > 10
    ? displayValue.slice(0, 6) + "••••••••••••••••••••" + displayValue.slice(-4)
    : "•".repeat(displayValue.length || 8);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: 280,
              background: "#0f1b33",
              border: `1px solid ${accent}`,
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: 12,
              padding: "6px 10px",
              outline: "none",
              fontFamily: "monospace",
            }}
          />
          <button type="button" onClick={handleSave} style={smallBtn(accent)}>Save</button>
          <button type="button" onClick={() => { setEditing(false); setDraft(value); }} style={smallBtn(dimmed)}>Cancel</button>
        </>
      ) : (
        <>
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>
            {show ? displayValue : masked}
          </span>
          <button type="button" onClick={() => setShow(!show)} style={smallBtn("#1e3a5f")}>
            {show ? "Hide" : "Show"}
          </button>
          <button type="button" onClick={() => { setEditing(true); setDraft(value); }} style={smallBtn("#1e3a5f")}>
            Edit
          </button>
        </>
      )}
    </div>
  );
}

function smallBtn(bg) {
  return {
    background: bg,
    border: "none",
    borderRadius: 6,
    color: "#e2e8f0",
    fontSize: 11,
    fontWeight: 600,
    padding: "5px 10px",
    cursor: "pointer",
  };
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const color = type === "error" ? danger : type === "warn" ? warn : success;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 999,
      background: "#0b1424", border: `1px solid ${color}`,
      borderRadius: 12, padding: "12px 20px",
      color, fontSize: 13, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {msg}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SystemSettingsPage() {
  const [settings, setSettings] = useState(structuredClone(DEFAULT_SETTINGS));
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [unsaved, setUnsaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/admin/system/settings")
      .then((data) => {
        setSettings({
          execution:     { ...DEFAULT_SETTINGS.execution,     ...(data.execution     || {}) },
          languages:     Array.isArray(data.languages) && data.languages.length ? data.languages : DEFAULT_SETTINGS.languages,
          api:           { ...DEFAULT_SETTINGS.api,           ...(data.api           || {}) },
          testing:       { ...DEFAULT_SETTINGS.testing,       ...(data.testing       || {}) },
          notifications: { ...DEFAULT_SETTINGS.notifications, ...(data.notifications || {}) },
        });
      })
      .catch((err) => setToast({ msg: `Load failed: ${err.message}`, type: "error" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast.msg) {
      const t = setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function patch(path, value) {
    setSettings((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    setUnsaved(true);
  }

  function toggleLanguage(id) {
    setSettings((prev) => {
      const next = structuredClone(prev);
      const lang = next.languages.find((l) => l.id === id);
      if (lang) lang.enabled = !lang.enabled;
      return next;
    });
    setUnsaved(true);
  }

  async function saveAll() {
    setSaving(true);
    try {
      const updated = await api.patch("/admin/system/settings", settings);
      setSettings({
        execution:     { ...DEFAULT_SETTINGS.execution,     ...(updated.execution     || {}) },
        languages:     Array.isArray(updated.languages) && updated.languages.length ? updated.languages : DEFAULT_SETTINGS.languages,
        api:           { ...DEFAULT_SETTINGS.api,           ...(updated.api           || {}) },
        testing:       { ...DEFAULT_SETTINGS.testing,       ...(updated.testing       || {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(updated.notifications || {}) },
      });
      setUnsaved(false);
      setToast({ msg: "✓ System settings saved successfully", type: "success" });
    } catch (err) {
      setToast({ msg: `Save failed: ${err.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    setSettings(structuredClone(DEFAULT_SETTINGS));
    setUnsaved(true);
    setToast({ msg: "Settings reset to defaults — click Save to apply", type: "warn" });
  }

  const { execution, languages, api: apiSettings, testing, notifications } = settings;

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
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>System Settings</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>
              Configure platform-wide execution, language support, API keys, and testing behavior
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {unsaved && (
              <span style={{ fontSize: 11, color: warn, fontWeight: 600 }}>● Unsaved changes</span>
            )}
            <button type="button" onClick={resetToDefaults} style={{
              background: "transparent",
              border: `1px solid ${dimmed}`,
              borderRadius: 10,
              color: muted,
              fontSize: 13,
              fontWeight: 600,
              padding: "9px 18px",
              cursor: "pointer",
            }}>
              Reset to Defaults
            </button>
            <button type="button" onClick={saveAll} disabled={saving} style={{
              background: saving ? dimmed : accent,
              border: "none",
              borderRadius: 10,
              color: "#081018",
              fontSize: 13,
              fontWeight: 700,
              padding: "9px 22px",
              cursor: saving ? "not-allowed" : "pointer",
            }}>
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Left column */}
          <div>
            {/* Execution Environment */}
            <SectionCard title="Execution Environment" icon="⚡">
              <FieldRow label="Compilation Timeout" hint="Max time allowed to compile submitted code">
                <NumberInput
                  value={execution.compilationTimeoutSec}
                  onChange={(v) => patch("execution.compilationTimeoutSec", v)}
                  min={5} max={120} unit="sec"
                />
              </FieldRow>
              <FieldRow label="Execution Timeout" hint="Max time a program can run per test case">
                <NumberInput
                  value={execution.executionTimeoutSec}
                  onChange={(v) => patch("execution.executionTimeoutSec", v)}
                  min={1} max={60} unit="sec"
                />
              </FieldRow>
              <FieldRow label="Memory Limit" hint="Maximum RAM per submission process">
                <NumberInput
                  value={execution.memoryLimitMB}
                  onChange={(v) => patch("execution.memoryLimitMB", v)}
                  min={32} max={2048} unit="MB"
                />
              </FieldRow>
              <FieldRow label="Max Output Size" hint="Truncate stdout/stderr beyond this limit">
                <NumberInput
                  value={execution.maxOutputKB}
                  onChange={(v) => patch("execution.maxOutputKB", v)}
                  min={64} max={4096} unit="KB"
                />
              </FieldRow>
              <FieldRow label="Sandbox Mode" hint="Isolate student code in a secure container">
                <Toggle value={!!execution.sandboxEnabled} onChange={(v) => patch("execution.sandboxEnabled", v)} />
              </FieldRow>
            </SectionCard>

            {/* Testing Configuration */}
            <SectionCard title="Testing Configuration" icon="🧪">
              <FieldRow label="Default Test Case Timeout" hint="Per-case timeout used when instructor doesn't specify">
                <NumberInput
                  value={testing.defaultTestCaseTimeout}
                  onChange={(v) => patch("testing.defaultTestCaseTimeout", v)}
                  min={1} max={30} unit="sec"
                />
              </FieldRow>
              <FieldRow label="Max Test Cases per Lab" hint="Limit instructor can add per assignment">
                <NumberInput
                  value={testing.maxTestCasesPerLab}
                  onChange={(v) => patch("testing.maxTestCasesPerLab", v)}
                  min={5} max={200} unit="cases"
                />
              </FieldRow>
              <FieldRow label="Allow Custom Test Cases" hint="Students can add their own private test cases">
                <Toggle value={!!testing.allowCustomTestCases} onChange={(v) => patch("testing.allowCustomTestCases", v)} />
              </FieldRow>
              <FieldRow label="Show Test Output to Student" hint="Display actual vs. expected on failed cases">
                <Toggle value={!!testing.showTestOutputToStudent} onChange={(v) => patch("testing.showTestOutputToStudent", v)} />
              </FieldRow>
              <FieldRow label="Partial Credit" hint="Award partial score for partially-passing submissions">
                <Toggle value={!!testing.partialCreditEnabled} onChange={(v) => patch("testing.partialCreditEnabled", v)} />
              </FieldRow>
              <FieldRow label="Auto-Grade on Submit" hint="Run test suite immediately on submission">
                <Toggle value={!!testing.autoGradeOnSubmit} onChange={(v) => patch("testing.autoGradeOnSubmit", v)} />
              </FieldRow>
            </SectionCard>
          </div>

          {/* Right column */}
          <div>
            {/* Supported Languages */}
            <SectionCard title="Supported Languages" icon="💻">
              <p style={{ fontSize: 12, color: muted, marginBottom: 16 }}>
                Enable or disable language runtimes available to instructors when creating labs.
              </p>
              {languages.map((lang) => (
                <div key={lang.id} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 14px",
                  background: lang.enabled ? "rgba(34,211,238,0.04)" : "transparent",
                  border: `1px solid ${lang.enabled ? "#1e3a5f" : cardBorder}`,
                  borderRadius: 10,
                  marginBottom: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{lang.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: lang.enabled ? "#e2e8f0" : muted }}>
                      {lang.label}
                    </span>
                  </div>
                  <Toggle value={!!lang.enabled} onChange={() => toggleLanguage(lang.id)} />
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 11, color: dimmed }}>
                {languages.filter((l) => l.enabled).length} of {languages.length} runtimes enabled
              </div>
            </SectionCard>

            {/* API Configuration */}
            <SectionCard title="API Configuration" icon="🔑">
              <FieldRow label="Judge API URL" hint="Endpoint for code execution service">
                <input
                  type="text"
                  value={apiSettings.judgeApiUrl || ""}
                  onChange={(e) => patch("api.judgeApiUrl", e.target.value)}
                  style={{
                    width: 260,
                    background: "#0f1b33",
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 12,
                    padding: "7px 12px",
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
              </FieldRow>
              <FieldRow label="Judge API Key" hint="Secret key for the execution backend">
                <ApiKeyField
                  value={apiSettings.judgeApiKey || ""}
                  onChange={(v) => patch("api.judgeApiKey", v)}
                />
              </FieldRow>
              <FieldRow label="AI Assistant" hint="Enable AI code hints for students">
                <Toggle value={!!apiSettings.aiAssistEnabled} onChange={(v) => patch("api.aiAssistEnabled", v)} />
              </FieldRow>
              {apiSettings.aiAssistEnabled && (
                <>
                  <FieldRow label="AI Model" hint="Model used for code assistance">
                    <select
                      value={apiSettings.aiAssistModel || "gpt-4o"}
                      onChange={(e) => patch("api.aiAssistModel", e.target.value)}
                      style={{
                        background: "#0f1b33",
                        border: `1px solid ${cardBorder}`,
                        borderRadius: 8,
                        color: "#e2e8f0",
                        fontSize: 12,
                        padding: "7px 12px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="AI API Key" hint="API key for the selected AI model provider">
                    <ApiKeyField
                      value={apiSettings.aiAssistApiKey || ""}
                      onChange={(v) => patch("api.aiAssistApiKey", v)}
                    />
                  </FieldRow>
                </>
              )}
            </SectionCard>

            {/* Notification Settings */}
            <SectionCard title="Notification Settings" icon="🔔">
              <FieldRow label="Email Notifications" hint="Global toggle for all outbound emails">
                <Toggle value={!!notifications.emailNotificationsEnabled} onChange={(v) => patch("notifications.emailNotificationsEnabled", v)} />
              </FieldRow>
              {notifications.emailNotificationsEnabled && (
                <>
                  <FieldRow label="Submission Alerts" hint="Notify instructors when a student submits">
                    <Toggle value={!!notifications.submissionAlerts} onChange={(v) => patch("notifications.submissionAlerts", v)} />
                  </FieldRow>
                  <FieldRow label="Grade Published Alerts" hint="Notify students when grades are released">
                    <Toggle value={!!notifications.gradePublishedAlerts} onChange={(v) => patch("notifications.gradePublishedAlerts", v)} />
                  </FieldRow>
                  <FieldRow label="System Alerts" hint="Send critical system event emails to admins">
                    <Toggle value={!!notifications.systemAlerts} onChange={(v) => patch("notifications.systemAlerts", v)} />
                  </FieldRow>
                  <FieldRow label="Digest Frequency" hint="How often to batch non-urgent notifications">
                    <select
                      value={notifications.digestFrequency || "daily"}
                      onChange={(e) => patch("notifications.digestFrequency", e.target.value)}
                      style={{
                        background: "#0f1b33",
                        border: `1px solid ${cardBorder}`,
                        borderRadius: 8,
                        color: "#e2e8f0",
                        fontSize: 12,
                        padding: "7px 12px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="realtime">Real-time</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </FieldRow>
                </>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
      <Toast msg={toast.msg} type={toast.type} />
    </AdminLayout>
  );
}
