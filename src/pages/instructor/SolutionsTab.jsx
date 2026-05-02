import { useState } from "react";
import { api } from "../../utils/api.js";

// FR-I6: Reference Solution Publishing

const inputStyle = {
  width: "100%", background: "#0a1628", border: "1px solid #1a2540",
  borderRadius: 10, padding: "10px 14px", color: "#e2e8f0",
  fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  transition: "border-color 0.2s",
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#64748b",
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5,
};

const RELEASE_OPTIONS = [
  { key: "immediate",    label: "Immediately after publish",    icon: "⚡" },
  { key: "after_graded", label: "After all submissions graded", icon: "✅" },
  { key: "scheduled",    label: "Specific date / time",         icon: "📅" },
];

const EMPTY_SOL = {
  id: null,
  title: "",
  language: "",
  code: "",
  explanation: "",
  releaseMode: "after_graded",
  releaseDate: "",
};

function normalizeLanguage(language) {
  const value = String(language || "python").trim().toLowerCase();
  if (value === "c++") return "cpp";
  if (value === "python") return "python";
  if (value === "javascript") return "javascript";
  return value;
}

function isCompileError(result) {
  const statusCode = result.statusCode ?? result.exitCode;
  return Boolean(result.isError || result.error || result.stderr)
    || (statusCode !== undefined && !["0", "200"].includes(String(statusCode)));
}

function CompileValidator({ code, language, onResult }) {
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!code.trim()) { onResult({ ok: false, msg: "No code provided." }); return; }
    setRunning(true);
    onResult(null);

    try {
      const result = await api.post("/compile", {
        code,
        language: normalizeLanguage(language),
        input: "",
      });
      const failed = isCompileError(result);
      onResult({
        ok: !failed,
        msg: failed
          ? (result.stderr || result.error || result.output || "Compilation failed.")
          : "Compilation successful — no errors detected.",
      });
    } catch (err) {
      onResult({ ok: false, msg: err.message || "Compilation failed." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={running}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "8px 16px", borderRadius: 9,
        border: "1px solid rgba(250,204,21,0.3)",
        background: running ? "#0f1b33" : "rgba(250,204,21,0.07)",
        color: running ? "#475569" : "#fbbf24",
        fontSize: 12, fontWeight: 600, cursor: running ? "default" : "pointer",
      }}
    >
      {running ? (
        <>
          <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "sol-spin 0.7s linear infinite" }} />
          Compiling solution…
        </>
      ) : "▶ Compile & Validate"}
    </button>
  );
}

export default function SolutionsTab({ solutions, setSolutions, labLanguages, labDueDate, showToast }) {
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_SOL);
  const [formErrors, setFormErrors] = useState({});
  const [compileResult, setCompileResult] = useState(null); // null | {ok, msg}
  const [showPreview, setShowPreview]     = useState(null); // solution id

  const setField = (f, v) => {
    setForm((p) => ({ ...p, [f]: v }));
    if (formErrors[f]) setFormErrors((p) => ({ ...p, [f]: null }));
  };

  const openNew = () => {
    setForm({ ...EMPTY_SOL, language: labLanguages?.[0] || "" });
    setFormErrors({});
    setCompileResult(null);
    setShowForm(true);
  };

  const openEdit = (sol) => {
    setForm({ ...sol });
    setFormErrors({});
    setCompileResult(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_SOL);
    setFormErrors({});
    setCompileResult(null);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.language) errs.language = "Select a language";
    if (!form.code.trim()) errs.code = "Solution code is required";
    if (!form.explanation.trim() || form.explanation.trim().length < 50)
      errs.explanation = "Explanation must be at least 50 characters";
    if (form.releaseMode === "scheduled") {
      if (!form.releaseDate)
        errs.releaseDate = "Release date is required for scheduled publish";
      else if (labDueDate && new Date(form.releaseDate) <= new Date(labDueDate))
        errs.releaseDate = "Release date must be after the lab deadline";
    }
    return errs;
  };

  const handlePublish = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    if (!compileResult?.ok) {
      showToast("error", "Compile & validate the solution before publishing");
      return;
    }

    const saved = {
      ...form,
      id: form.id || `sol-${Date.now()}`,
      publishedAt: form.releaseMode === "immediate" ? new Date().toISOString() : null,
      status: form.releaseMode === "immediate" ? "published" : "scheduled",
    };

    setSolutions((prev) =>
      form.id
        ? prev.map((s) => (s.id === form.id ? saved : s))
        : [...prev, saved],
    );

    const confirmMsg =
      form.releaseMode === "immediate"
        ? "Solution published successfully"
        : form.releaseMode === "after_graded"
          ? "Solution will be published after all submissions are graded"
          : `Solution will be published on ${new Date(form.releaseDate).toLocaleString()}`;

    showToast("success", confirmMsg);
    closeForm();
  };

  const handleDelete = (id) => {
    setSolutions((prev) => prev.filter((s) => s.id !== id));
    showToast("success", "Solution removed");
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const releaseLabel = (sol) => {
    if (sol.status === "published") return "Published";
    if (sol.releaseMode === "immediate") return "On publish";
    if (sol.releaseMode === "after_graded") return "After all graded";
    if (sol.releaseDate) return new Date(sol.releaseDate).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return "Scheduled";
  };

  const STATUS_CFG = {
    published: { bg: "rgba(34,197,94,0.1)",  text: "#4ade80", border: "rgba(34,197,94,0.25)" },
    scheduled: { bg: "rgba(250,204,21,0.1)",  text: "#facc15", border: "rgba(250,204,21,0.25)" },
    draft:     { bg: "rgba(148,163,184,0.1)", text: "#94a3b8", border: "rgba(148,163,184,0.25)" },
  };

  const minReleaseDate = labDueDate
    ? new Date(new Date(labDueDate).getTime() + 60_000).toISOString().slice(0, 16)
    : new Date(Date.now() + 3600_000).toISOString().slice(0, 16);

  return (
    <div>
      <style>{`@keyframes sol-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>
          Reference Solutions
          {solutions.length > 0 && (
            <span style={{ marginLeft: 8, padding: "2px 9px", borderRadius: 99, fontSize: 11, background: "rgba(34,211,238,0.1)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)" }}>
              {solutions.length}
            </span>
          )}
        </h2>
        <button
          onClick={openNew}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg,#06b6d4,#0891b2)",
            color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(6,182,212,0.25)",
          }}
        >
          <span style={{ fontSize: 15 }}>+</span> Add Solution
        </button>
      </div>

      {/* Due-date hint */}
      {labDueDate && (
        <div style={{ marginBottom: 14, padding: "8px 14px", background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)", borderRadius: 9, fontSize: 12, color: "#475569" }}>
          ⏰ Lab deadline: <span style={{ color: "#94a3b8" }}>{new Date(labDueDate).toLocaleString()}</span> · Solutions scheduled before the deadline will be rejected.
        </div>
      )}

      {/* Empty state */}
      {solutions.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "48px 32px", background: "#0a1628", border: "1px dashed #1e3a5f", borderRadius: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💡</div>
          <h3 style={{ color: "#e2e8f0", margin: "0 0 6px", fontSize: 15 }}>No reference solutions yet</h3>
          <p style={{ color: "#475569", margin: "0 0 18px", fontSize: 13 }}>
            Add solutions after the lab deadline to help students understand the correct approach.
          </p>
          <button
            onClick={openNew}
            style={{ padding: "8px 20px", borderRadius: 9, border: "1px solid rgba(34,211,238,0.25)", background: "rgba(34,211,238,0.1)", color: "#22d3ee", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Add First Solution
          </button>
        </div>
      )}

      {/* Solutions list */}
      {solutions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {solutions.map((sol) => {
            const cfg = STATUS_CFG[sol.status] || STATUS_CFG.draft;
            return (
              <div key={sol.id} style={{ background: "#0f1b33", border: "1px solid #1a2540", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{sol.title}</span>
                      <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`, textTransform: "capitalize" }}>
                        {sol.status}
                      </span>
                      <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 10, background: "rgba(34,211,238,0.08)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.15)" }}>
                        {sol.language}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#475569" }}>
                      <span>📅 Release: {releaseLabel(sol)}</span>
                      <span>{sol.code.split("\n").length} lines</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
                        {sol.explanation.slice(0, 80)}{sol.explanation.length > 80 ? "…" : ""}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setShowPreview(showPreview === sol.id ? null : sol.id)}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      {showPreview === sol.id ? "Hide" : "Preview"}
                    </button>
                    <button
                      onClick={() => openEdit(sol)}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #1e3a5f", background: "transparent", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(sol.id)}
                      style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: "#f87171", fontSize: 13, cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Student view preview */}
                {showPreview === sol.id && (
                  <div style={{ borderTop: "1px solid #1a2540", background: "#071020" }}>
                    <div style={{ padding: "8px 18px", borderBottom: "1px solid #0f1b33", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#22d3ee", letterSpacing: "0.06em", textTransform: "uppercase" }}>Student View Preview</span>
                      <span style={{ fontSize: 11, color: "#334155" }}>This is how students will see the solution</span>
                    </div>
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>{sol.title}</div>
                      <div style={{ background: "#0a1628", border: "1px solid #1a2540", borderRadius: 9, overflow: "hidden", marginBottom: 12 }}>
                        <div style={{ padding: "5px 12px", background: "#071020", borderBottom: "1px solid #1a2540", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#475569" }}>{sol.language}</span>
                          <span style={{ fontSize: 11, color: "#334155" }}>{sol.code.split("\n").length} lines</span>
                        </div>
                        <pre style={{ margin: 0, padding: "12px 14px", fontFamily: "monospace", fontSize: 12, color: "#94a3b8", overflowX: "auto", maxHeight: 200, overflowY: "auto", lineHeight: 1.6 }}>
                          {sol.code}
                        </pre>
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{sol.explanation}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div style={{ background: "#0f1b33", border: "1px solid #1e3a5f", borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
              {form.id ? "Edit Solution" : `New Reference Solution`}
            </h3>
            <button onClick={closeForm} style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {/* Title + Language */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 14 }}>
              <div>
                <label style={labelStyle}>Solution Title <span style={{ color: "#f87171" }}>*</span></label>
                <input
                  type="text" placeholder="e.g. Optimal approach using max()"
                  value={form.title} onChange={(e) => setField("title", e.target.value)}
                  style={{ ...inputStyle, borderColor: formErrors.title ? "rgba(239,68,68,0.5)" : "#1a2540" }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) => (e.target.style.borderColor = formErrors.title ? "rgba(239,68,68,0.5)" : "#1a2540")}
                />
                {formErrors.title && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>{formErrors.title}</p>}
              </div>
              <div>
                <label style={labelStyle}>Language <span style={{ color: "#f87171" }}>*</span></label>
                <select
                  value={form.language} onChange={(e) => setField("language", e.target.value)}
                  style={{ ...inputStyle, borderColor: formErrors.language ? "rgba(239,68,68,0.5)" : "#1a2540", cursor: "pointer" }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
                >
                  <option value="">Select…</option>
                  {(labLanguages?.length ? labLanguages : ["Python","C++","C","Java","JavaScript","Go","Rust"]).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                {formErrors.language && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>{formErrors.language}</p>}
              </div>
            </div>

            {/* Code */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Solution Code <span style={{ color: "#f87171" }}>*</span></label>
                <CompileValidator
                  code={form.code}
                  language={form.language}
                  onResult={(r) => {
                    setCompileResult(r);
                    if (r?.ok) showToast("success", "Compilation successful");
                    else if (r) showToast("error", `Compilation failed: ${r.msg}`);
                  }}
                />
              </div>

              {/* Compile result banner */}
              {compileResult && (
                <div style={{
                  marginBottom: 8, padding: "8px 12px", borderRadius: 8,
                  background: compileResult.ok ? "rgba(74,222,128,0.07)" : "rgba(239,68,68,0.07)",
                  border: `1px solid ${compileResult.ok ? "rgba(74,222,128,0.2)" : "rgba(239,68,68,0.2)"}`,
                  color: compileResult.ok ? "#4ade80" : "#f87171", fontSize: 12,
                  display: "flex", alignItems: "center", gap: 7,
                }}>
                  {compileResult.ok ? "✓" : "✕"} {compileResult.msg}
                </div>
              )}

              <textarea
                rows={10}
                placeholder="# Paste or type the reference solution here..."
                value={form.code}
                onChange={(e) => { setField("code", e.target.value); setCompileResult(null); }}
                style={{
                  ...inputStyle, resize: "vertical", fontFamily: "monospace",
                  fontSize: 12, lineHeight: 1.6,
                  borderColor: formErrors.code ? "rgba(239,68,68,0.5)" : "#1a2540",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) => (e.target.style.borderColor = formErrors.code ? "rgba(239,68,68,0.5)" : "#1a2540")}
              />
              {formErrors.code && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>{formErrors.code}</p>}
            </div>

            {/* Explanation */}
            <div>
              <label style={labelStyle}>Explanation <span style={{ color: "#f87171" }}>*</span></label>
              <textarea
                rows={6}
                placeholder="Describe the optimal approach, key insights, common mistakes students make, and why this solution is correct..."
                value={form.explanation}
                onChange={(e) => setField("explanation", e.target.value)}
                style={{
                  ...inputStyle, resize: "vertical", lineHeight: 1.6,
                  borderColor: formErrors.explanation ? "rgba(239,68,68,0.5)" : "#1a2540",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) => (e.target.style.borderColor = formErrors.explanation ? "rgba(239,68,68,0.5)" : "#1a2540")}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                {formErrors.explanation
                  ? <p style={{ margin: 0, fontSize: 11, color: "#f87171" }}>{formErrors.explanation}</p>
                  : <span />}
                <span style={{ fontSize: 11, color: form.explanation.length >= 50 ? "#4ade80" : "#475569" }}>
                  {form.explanation.length} / 50 min
                </span>
              </div>
            </div>

            {/* Release schedule */}
            <div>
              <label style={labelStyle}>Release Schedule <span style={{ color: "#f87171" }}>*</span></label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {RELEASE_OPTIONS.map((opt) => {
                  const selected = form.releaseMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setField("releaseMode", opt.key)}
                      style={{
                        flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                        border: `1px solid ${selected ? "rgba(34,211,238,0.4)" : "#1a2540"}`,
                        background: selected ? "rgba(34,211,238,0.08)" : "transparent",
                        color: selected ? "#22d3ee" : "#475569",
                        fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{opt.icon}</span>
                      <span style={{ textAlign: "center", lineHeight: 1.3 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {form.releaseMode === "scheduled" && (
                <div style={{ maxWidth: 280 }}>
                  <label style={labelStyle}>Release Date & Time</label>
                  <input
                    type="datetime-local"
                    min={minReleaseDate}
                    value={form.releaseDate}
                    onChange={(e) => setField("releaseDate", e.target.value)}
                    style={{
                      ...inputStyle, colorScheme: "dark",
                      borderColor: formErrors.releaseDate ? "rgba(239,68,68,0.5)" : "#1a2540",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                    onBlur={(e) => (e.target.style.borderColor = formErrors.releaseDate ? "rgba(239,68,68,0.5)" : "#1a2540")}
                  />
                  {formErrors.releaseDate
                    ? <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>{formErrors.releaseDate}</p>
                    : <p style={{ margin: "3px 0 0", fontSize: 11, color: "#475569" }}>Must be after lab deadline</p>}
                </div>
              )}
            </div>
          </div>

          {/* Form action buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid #1a2540", justifyContent: "flex-end", alignItems: "center" }}>
            {!compileResult?.ok && (
              <span style={{ fontSize: 12, color: "#475569", marginRight: "auto" }}>
                ⚠ Compile the solution before publishing
              </span>
            )}
            <button
              onClick={closeForm}
              style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid #1a2540", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handlePublish}
              style={{
                padding: "9px 22px", borderRadius: 9, border: "none",
                background: compileResult?.ok
                  ? "linear-gradient(135deg,#06b6d4,#0891b2)"
                  : "#0e2a45",
                color: compileResult?.ok ? "#fff" : "#334155",
                fontSize: 13, fontWeight: 700,
                cursor: compileResult?.ok ? "pointer" : "default",
                boxShadow: compileResult?.ok ? "0 4px 14px rgba(6,182,212,0.3)" : "none",
              }}
            >
              Publish Solution
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
