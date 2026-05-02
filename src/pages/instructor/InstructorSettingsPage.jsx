import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";
import { updateCurrentUser } from "../../utils/authStorage.js";

const card = "#0f1b33";
const border = "#1a2540";
const muted = "#64748b";
const text = "#e2e8f0";
const accent = "#22d3ee";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0a1628",
  border: `1px solid ${border}`,
  borderRadius: 10,
  color: text,
  padding: "10px 12px",
  outline: "none",
  fontSize: 13,
};

function Field({ label, children, hint, error }) {
  return (
    <div>
      <label style={{ display: "block", color: muted, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && !error ? <div style={{ color: "#475569", fontSize: 11, marginTop: 5 }}>{hint}</div> : null}
      {error ? <div style={{ color: "#f87171", fontSize: 11, marginTop: 5 }}>{error}</div> : null}
    </div>
  );
}

export default function InstructorSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ fullName: "", department: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/instructor/settings")
      .then((data) => {
        setSettings(data);
        setForm({
          fullName: data.fullName || "",
          department: data.department || "",
        });
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError(err.message ?? "Failed to load settings.");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: null }));
  };

  const setPasswordField = (key, value) => {
    setPasswords((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = "Full name is required";

    const wantsPasswordChange = passwords.currentPassword || passwords.newPassword || passwords.confirmPassword;
    if (wantsPasswordChange) {
      if (!passwords.currentPassword) errs.currentPassword = "Current password is required";
      if (!passwords.newPassword || passwords.newPassword.length < 6) {
        errs.newPassword = "New password must be at least 6 characters";
      }
      if (passwords.newPassword !== passwords.confirmPassword) {
        errs.confirmPassword = "Passwords do not match";
      }
    }

    return errs;
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setToast("");
    setError("");
    const errs = validate();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      fullName: form.fullName.trim(),
      department: form.department.trim(),
    };

    if (passwords.newPassword) {
      payload.currentPassword = passwords.currentPassword;
      payload.newPassword = passwords.newPassword;
    }

    setSaving(true);
    try {
      const updated = await api.patch("/instructor/settings", payload);
      setSettings(updated);
      setForm({
        fullName: updated.fullName || "",
        department: updated.department || "",
      });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      updateCurrentUser({ fullName: updated.fullName, department: updated.department });
      setToast("Settings saved");
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      if (err.status === 401) { navigate("/"); return; }
      setError(err.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <InstructorLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: text }}>Settings</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: muted }}>Manage your instructor profile and password</p>
        </div>

        {loading ? (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: "56px 24px", color: muted, textAlign: "center" }}>
            Loading settings...
          </div>
        ) : error && !settings ? (
          <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "14px 16px", color: "#f87171" }}>
            {error}
          </div>
        ) : (
          <form onSubmit={saveSettings} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)", gap: 18 }}>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: 22 }}>
              <h2 style={{ margin: "0 0 18px", color: text, fontSize: 15 }}>Profile</h2>
              <div style={{ display: "grid", gap: 16 }}>
                <Field label="Full Name" error={formErrors.fullName}>
                  <input
                    value={form.fullName}
                    onChange={(event) => setField("fullName", event.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.fullName ? "rgba(239,68,68,0.5)" : border }}
                  />
                </Field>

                <Field label="Department">
                  <input
                    value={form.department}
                    onChange={(event) => setField("department", event.target.value)}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Email" hint="Email is managed by your KFUPM account.">
                  <input value={settings?.email || ""} readOnly style={{ ...inputStyle, color: "#94a3b8", cursor: "not-allowed" }} />
                </Field>
              </div>
            </div>

            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: 22 }}>
              <h2 style={{ margin: "0 0 18px", color: text, fontSize: 15 }}>Password</h2>
              <div style={{ display: "grid", gap: 16 }}>
                <Field label="Current Password" error={formErrors.currentPassword}>
                  <input
                    type="password"
                    value={passwords.currentPassword}
                    onChange={(event) => setPasswordField("currentPassword", event.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.currentPassword ? "rgba(239,68,68,0.5)" : border }}
                  />
                </Field>

                <Field label="New Password" error={formErrors.newPassword}>
                  <input
                    type="password"
                    value={passwords.newPassword}
                    onChange={(event) => setPasswordField("newPassword", event.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.newPassword ? "rgba(239,68,68,0.5)" : border }}
                  />
                </Field>

                <Field label="Confirm Password" error={formErrors.confirmPassword}>
                  <input
                    type="password"
                    value={passwords.confirmPassword}
                    onChange={(event) => setPasswordField("confirmPassword", event.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.confirmPassword ? "rgba(239,68,68,0.5)" : border }}
                  />
                </Field>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div>
                {error ? <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div> : null}
                {toast ? <div style={{ color: accent, fontSize: 13, fontWeight: 700 }}>{toast}</div> : null}
              </div>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "10px 22px",
                  borderRadius: 10,
                  border: "none",
                  background: saving ? "#1e3a5f" : "linear-gradient(135deg, #06b6d4, #0891b2)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </InstructorLayout>
  );
}
