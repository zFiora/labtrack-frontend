import { useState } from "react";
import { api } from "../../utils/api.js";

const inputStyle = {
  width: "100%",
  background: "#0a1628",
  border: "1px solid #1a2540",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#e2e8f0",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color 0.2s",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  marginBottom: 5,
};

const EMPTY_FORM = {
  description: "",
  input: "",
  expectedOutput: "",
  points: "",
  visibility: "visible",
  timeout: "5",
};

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid rgba(255,255,255,0.25)",
        borderTopColor: "#22d3ee",
        borderRadius: "50%",
        animation: "tc-spin 0.7s linear infinite",
      }}
    />
  );
}

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

export default function TestCasesTab({ testCases, setTestCases, labPoints, labLanguages, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = new, else id
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  // Test runner state
  const [showRunner, setShowRunner] = useState(false);
  const [runnerCode, setRunnerCode] = useState("");
  const [runnerLang, setRunnerLang] = useState(labLanguages?.[0] || "Python");
  const [runResult, setRunResult] = useState(null); // null | { status, output }
  const [isRunning, setIsRunning] = useState(false);

  // Drag-to-reorder state
  const [dragSrcIdx, setDragSrcIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Derived: total points from test cases
  const tcTotalPoints = testCases.reduce((s, tc) => s + (Number(tc.points) || 0), 0);
  const labPts = Number(labPoints) || 0;
  const pointsMismatch = labPts > 0 && tcTotalPoints !== labPts;

  // ── Form helpers ──────────────────────────────────────────
  const setField = (f, v) => {
    setForm((prev) => ({ ...prev, [f]: v }));
    if (formErrors[f]) setFormErrors((prev) => ({ ...prev, [f]: null }));
  };

  const openNewForm = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setEditingId(null);
    setShowForm(true);
    setRunResult(null);
  };

  const openEditForm = (tc) => {
    setForm({
      description: tc.description,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      points: String(tc.points),
      visibility: tc.visibility,
      timeout: String(tc.timeout),
    });
    setFormErrors({});
    setEditingId(tc.id);
    setShowForm(true);
    setRunResult(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setRunResult(null);
  };

  // ── Validation ────────────────────────────────────────────
  const validateForm = () => {
    const errs = {};
    if (!form.description.trim()) errs.description = "Description is required";
    if (!form.expectedOutput.trim()) errs.expectedOutput = "Expected output is required";
    const pts = Number(form.points);
    if (!form.points || !Number.isInteger(pts) || pts < 1 || pts > 200) {
      errs.points = "Points must be a whole number between 1 and 200";
    }
    const to = Number(form.timeout);
    if (!form.timeout || !Number.isInteger(to) || to < 1 || to > 30) {
      errs.timeout = "Timeout must be between 1 and 30 seconds";
    }
    return errs;
  };

  // ── Save test case ────────────────────────────────────────
  const handleSave = () => {
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    const saved = {
      id: editingId || `tc-${Date.now()}`,
      description: form.description.trim(),
      input: form.input.trim(),
      expectedOutput: form.expectedOutput.trim(),
      points: Number(form.points),
      visibility: form.visibility,
      timeout: Number(form.timeout),
      verified: runResult?.status === "pass",
    };

    if (editingId) {
      setTestCases((prev) => prev.map((tc) => (tc.id === editingId ? saved : tc)));
      showToast("success", "Test case updated");
    } else {
      setTestCases((prev) => [...prev, saved]);
      showToast("success", `Test case added (${testCases.length + 1} total)`);
    }
    closeForm();
  };

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = (id) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
    showToast("success", "Test case removed");
  };

  // ── Toggle visibility ─────────────────────────────────────
  const handleToggleVisibility = (id) => {
    setTestCases((prev) =>
      prev.map((tc) =>
        tc.id === id
          ? { ...tc, visibility: tc.visibility === "visible" ? "hidden" : "visible" }
          : tc,
      ),
    );
  };

  // ── Test runner ───────────────────────────────────────────
  const openRunner = () => {
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      showToast("error", "Fill in all required fields before testing");
      return;
    }
    setRunnerCode("");
    setRunResult(null);
    setRunnerLang(labLanguages?.[0] || "Python");
    setShowRunner(true);
  };

  const runTest = async () => {
    if (!runnerCode.trim()) {
      setRunResult({ status: "error", output: "Error: No solution code provided." });
      return;
    }
    setIsRunning(true);
    setRunResult(null);

    try {
      const result = await api.post("/compile", {
        code: runnerCode,
        language: normalizeLanguage(runnerLang),
        input: form.input.trim(),
      });
      const expectedTrimmed = form.expectedOutput.trim();
      const actualOutput = result.output ?? result.stdout ?? result.stderr ?? result.error ?? "";
      const actualTrimmed = actualOutput.trim();
      const failed = isCompileError(result);

      setRunResult({
        status: !failed && actualTrimmed === expectedTrimmed ? "pass" : "fail",
        output: actualOutput || "Program exited with no output.",
      });
    } catch (err) {
      setRunResult({
        status: "error",
        output: err.message ?? "Failed to run test case.",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const confirmFromRunner = () => {
    if (runResult?.status !== "pass") {
      showToast("error", "Run the test successfully before confirming it");
      return;
    }
    setShowRunner(false);
    showToast("success", "Test case verified — ready to save");
  };

  // ── Drag-to-reorder ───────────────────────────────────────
  const handleDragStart = (idx) => setDragSrcIdx(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx) => {
    if (dragSrcIdx === null || dragSrcIdx === idx) {
      setDragSrcIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...testCases];
    const [moved] = reordered.splice(dragSrcIdx, 1);
    reordered.splice(idx, 0, moved);
    setTestCases(reordered);
    setDragSrcIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragSrcIdx(null);
    setDragOverIdx(null);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <style>{`@keyframes tc-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>
            Test Cases
            <span
              style={{
                marginLeft: 8,
                padding: "2px 9px",
                borderRadius: 99,
                fontSize: 11,
                background: "rgba(34,211,238,0.1)",
                color: "#22d3ee",
                border: "1px solid rgba(34,211,238,0.2)",
              }}
            >
              {testCases.length}
            </span>
          </h2>

          {/* Points counter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 8,
              background: pointsMismatch
                ? "rgba(250,204,21,0.08)"
                : tcTotalPoints > 0
                  ? "rgba(74,222,128,0.08)"
                  : "transparent",
              border: `1px solid ${
                pointsMismatch
                  ? "rgba(250,204,21,0.25)"
                  : tcTotalPoints > 0
                    ? "rgba(74,222,128,0.2)"
                    : "#1a2540"
              }`,
            }}
          >
            <span style={{ fontSize: 12, color: "#64748b" }}>Points:</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: pointsMismatch ? "#facc15" : tcTotalPoints > 0 ? "#4ade80" : "#475569",
              }}
            >
              {tcTotalPoints}
            </span>
            {labPts > 0 && (
              <span style={{ fontSize: 11, color: "#475569" }}>/ {labPts}</span>
            )}
          </div>

          {/* Mismatch warning */}
          {pointsMismatch && (
            <span
              style={{
                fontSize: 12,
                color: "#facc15",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ⚠ Test case points ({tcTotalPoints}) ≠ lab points ({labPts})
            </span>
          )}
        </div>

        <button
          onClick={openNewForm}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 9,
            border: "none",
            background: "linear-gradient(135deg, #06b6d4, #0891b2)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(6,182,212,0.25)",
          }}
        >
          <span style={{ fontSize: 15 }}>+</span> Add Test Case
        </button>
      </div>

      {/* Min 3 warning */}
      {testCases.length < 3 && testCases.length > 0 && (
        <div
          style={{
            background: "rgba(250,204,21,0.07)",
            border: "1px solid rgba(250,204,21,0.2)",
            borderRadius: 10,
            padding: "9px 14px",
            color: "#fbbf24",
            fontSize: 12,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ⚠ At least 3 test cases are required before publishing.
          Currently {testCases.length} / 3 added.
        </div>
      )}

      {/* Empty state */}
      {testCases.length === 0 && !showForm && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 32px",
            background: "#0a1628",
            border: "1px dashed #1e3a5f",
            borderRadius: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧪</div>
          <h3 style={{ color: "#e2e8f0", margin: "0 0 6px", fontSize: 15 }}>
            No test cases yet
          </h3>
          <p style={{ color: "#475569", margin: "0 0 18px", fontSize: 13 }}>
            Add at least 3 test cases to validate student submissions
          </p>
          <button
            onClick={openNewForm}
            style={{
              padding: "8px 20px",
              borderRadius: 9,
              border: "none",
              background: "rgba(34,211,238,0.12)",
              color: "#22d3ee",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid rgba(34,211,238,0.25)",
            }}
          >
            Add First Test Case
          </button>
        </div>
      )}

      {/* Test cases list */}
      {testCases.length > 0 && (
        <div
          style={{
            background: "#0a1628",
            border: "1px solid #1a2540",
            borderRadius: 14,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {/* Column header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "32px 36px 1fr 90px 60px 70px 60px 90px",
              padding: "10px 16px",
              borderBottom: "1px solid #1a2540",
              fontSize: 10,
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <span />
            <span>#</span>
            <span>Description</span>
            <span>Visibility</span>
            <span>Pts</span>
            <span>Timeout</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {testCases.map((tc, idx) => {
            const isDragSrc = dragSrcIdx === idx;
            const isDragOver = dragOverIdx === idx && dragSrcIdx !== idx;
            const isLast = idx === testCases.length - 1;

            return (
              <div
                key={tc.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 36px 1fr 90px 60px 70px 60px 90px",
                  padding: "12px 16px",
                  alignItems: "center",
                  borderBottom: isLast ? "none" : "1px solid #0f1b33",
                  opacity: isDragSrc ? 0.4 : 1,
                  background: isDragOver
                    ? "rgba(34,211,238,0.05)"
                    : "transparent",
                  borderTop: isDragOver ? "2px solid #22d3ee" : "2px solid transparent",
                  transition: "background 0.15s",
                  cursor: "grab",
                }}
              >
                {/* Drag handle */}
                <span
                  style={{
                    color: "#2d4a70",
                    fontSize: 14,
                    cursor: "grab",
                    userSelect: "none",
                    letterSpacing: "-2px",
                  }}
                >
                  ⠿
                </span>

                {/* Index */}
                <span style={{ color: "#475569", fontSize: 12, fontWeight: 700 }}>
                  {idx + 1}
                </span>

                {/* Description */}
                <div>
                  <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>
                    {tc.description}
                  </div>
                  {tc.input && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: "#475569",
                        fontFamily: "monospace",
                      }}
                    >
                      in: {tc.input.length > 30 ? tc.input.slice(0, 30) + "…" : tc.input}
                    </div>
                  )}
                </div>

                {/* Visibility toggle */}
                <button
                  onClick={() => handleToggleVisibility(tc.id)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 20,
                    border: "none",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    background:
                      tc.visibility === "visible"
                        ? "rgba(34,211,238,0.1)"
                        : "rgba(148,163,184,0.1)",
                    color: tc.visibility === "visible" ? "#22d3ee" : "#64748b",
                    border: `1px solid ${
                      tc.visibility === "visible"
                        ? "rgba(34,211,238,0.2)"
                        : "rgba(148,163,184,0.2)"
                    }`,
                  }}
                >
                  {tc.visibility === "visible" ? "Visible" : "Hidden"}
                </button>

                {/* Points */}
                <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                  {tc.points}
                </span>

                {/* Timeout */}
                <span style={{ color: "#64748b", fontSize: 12 }}>{tc.timeout}s</span>

                {/* Verified */}
                <span style={{ fontSize: 12 }}>
                  {tc.verified ? (
                    <span style={{ color: "#4ade80" }}>✓ Verified</span>
                  ) : (
                    <span style={{ color: "#475569" }}>Unverified</span>
                  )}
                </span>

                {/* Actions */}
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={() => openEditForm(tc)}
                    style={{
                      padding: "4px 9px",
                      borderRadius: 6,
                      border: "1px solid #1e3a5f",
                      background: "transparent",
                      color: "#94a3b8",
                      fontSize: 11,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(tc.id)}
                    style={{
                      padding: "4px 7px",
                      borderRadius: 6,
                      border: "1px solid rgba(239,68,68,0.2)",
                      background: "transparent",
                      color: "#f87171",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div
          style={{
            background: "#0f1b33",
            border: "1px solid #1e3a5f",
            borderRadius: 14,
            padding: "22px 24px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
              {editingId ? "Edit Test Case" : `New Test Case #${testCases.length + 1}`}
            </h3>
            <button
              onClick={closeForm}
              style={{
                background: "transparent",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Run result banner */}
          {runResult && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 14px",
                borderRadius: 9,
                background:
                  runResult.status === "pass"
                    ? "rgba(74,222,128,0.08)"
                    : "rgba(239,68,68,0.08)",
                border: `1px solid ${
                  runResult.status === "pass"
                    ? "rgba(74,222,128,0.25)"
                    : "rgba(239,68,68,0.25)"
                }`,
                color: runResult.status === "pass" ? "#4ade80" : "#f87171",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {runResult.status === "pass" ? "✓" : "✕"}
              {runResult.status === "pass"
                ? "Test passed — solution output matches expected output"
                : runResult.output}
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {/* Description */}
            <div>
              <label style={labelStyle}>
                Description <span style={{ color: "#f87171" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Find maximum of three positive numbers"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: formErrors.description
                    ? "rgba(239,68,68,0.5)"
                    : "#1a2540",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) =>
                  (e.target.style.borderColor = formErrors.description
                    ? "rgba(239,68,68,0.5)"
                    : "#1a2540")
                }
              />
              {formErrors.description && (
                <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>
                  {formErrors.description}
                </p>
              )}
            </div>

            {/* Input + Expected Output side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Input Data</label>
                <textarea
                  rows={4}
                  placeholder={"e.g.\n5 10 15"}
                  value={form.input}
                  onChange={(e) => setField("input", e.target.value)}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
                />
                <p style={{ margin: "3px 0 0", fontSize: 10, color: "#475569" }}>
                  Whitespace will be auto-trimmed on save
                </p>
              </div>
              <div>
                <label style={labelStyle}>
                  Expected Output <span style={{ color: "#f87171" }}>*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder={"e.g.\n15"}
                  value={form.expectedOutput}
                  onChange={(e) => setField("expectedOutput", e.target.value)}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    fontFamily: "monospace",
                    fontSize: 12,
                    borderColor: formErrors.expectedOutput
                      ? "rgba(239,68,68,0.5)"
                      : "#1a2540",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) =>
                    (e.target.style.borderColor = formErrors.expectedOutput
                      ? "rgba(239,68,68,0.5)"
                      : "#1a2540")
                  }
                />
                {formErrors.expectedOutput && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>
                    {formErrors.expectedOutput}
                  </p>
                )}
              </div>
            </div>

            {/* Points + Visibility + Timeout */}
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: 14 }}>
              {/* Points */}
              <div>
                <label style={labelStyle}>
                  Points <span style={{ color: "#f87171" }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  placeholder="10"
                  value={form.points}
                  onChange={(e) => setField("points", e.target.value)}
                  style={{
                    ...inputStyle,
                    borderColor: formErrors.points ? "rgba(239,68,68,0.5)" : "#1a2540",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) =>
                    (e.target.style.borderColor = formErrors.points
                      ? "rgba(239,68,68,0.5)"
                      : "#1a2540")
                  }
                />
                {formErrors.points && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>
                    {formErrors.points}
                  </p>
                )}
              </div>

              {/* Visibility */}
              <div>
                <label style={labelStyle}>Visibility</label>
                <div style={{ display: "flex", gap: 8, paddingTop: 2 }}>
                  {["visible", "hidden"].map((v) => {
                    const selected = form.visibility === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setField("visibility", v)}
                        style={{
                          flex: 1,
                          padding: "9px 12px",
                          borderRadius: 9,
                          border: `1px solid ${
                            selected
                              ? v === "visible"
                                ? "rgba(34,211,238,0.35)"
                                : "rgba(148,163,184,0.35)"
                              : "#1a2540"
                          }`,
                          background: selected
                            ? v === "visible"
                              ? "rgba(34,211,238,0.1)"
                              : "rgba(148,163,184,0.08)"
                            : "transparent",
                          color: selected
                            ? v === "visible"
                              ? "#22d3ee"
                              : "#94a3b8"
                            : "#475569",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          textTransform: "capitalize",
                          transition: "all 0.15s",
                        }}
                      >
                        {v === "visible" ? "👁 Visible" : "🔒 Hidden"}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 10, color: "#475569" }}>
                  Hidden cases are not shown to students
                </p>
              </div>

              {/* Timeout */}
              <div>
                <label style={labelStyle}>
                  Timeout (seconds) <span style={{ color: "#f87171" }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  placeholder="5"
                  value={form.timeout}
                  onChange={(e) => setField("timeout", e.target.value)}
                  style={{
                    ...inputStyle,
                    borderColor: formErrors.timeout ? "rgba(239,68,68,0.5)" : "#1a2540",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                  onBlur={(e) =>
                    (e.target.style.borderColor = formErrors.timeout
                      ? "rgba(239,68,68,0.5)"
                      : "#1a2540")
                  }
                />
                {formErrors.timeout ? (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: "#f87171" }}>
                    {formErrors.timeout}
                  </p>
                ) : (
                  <p style={{ margin: "3px 0 0", fontSize: 10, color: "#475569" }}>
                    1–30 seconds allowed
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Form action buttons */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #1a2540",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              onClick={openRunner}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 9,
                border: "1px solid rgba(250,204,21,0.3)",
                background: "rgba(250,204,21,0.07)",
                color: "#fbbf24",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ▶ Test This Case
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={closeForm}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9,
                  border: "1px solid #1a2540",
                  background: "transparent",
                  color: "#64748b",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: "8px 20px",
                  borderRadius: 9,
                  border: "none",
                  background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(6,182,212,0.25)",
                }}
              >
                {editingId ? "Update Test Case" : "Save Test Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Test Runner Modal ── */}
      {showRunner && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div
            style={{
              background: "#0d1b30",
              border: "1px solid #1e3a5f",
              borderRadius: 18,
              padding: "28px 32px",
              width: 620,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>
                ▶ Test This Case
              </h3>
              <button
                onClick={() => setShowRunner(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#475569",
                  cursor: "pointer",
                  fontSize: 20,
                }}
              >
                ×
              </button>
            </div>

            {/* Test info */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {[
                { label: "Input", value: form.input || "(none)", mono: true },
                { label: "Expected Output", value: form.expectedOutput, mono: true },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: "#0a1628",
                    border: "1px solid #1a2540",
                    borderRadius: 9,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#475569",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#94a3b8",
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {item.value}
                  </pre>
                </div>
              ))}
            </div>

            {/* Language selector */}
            {labLanguages && labLanguages.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>Language</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {labLanguages.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setRunnerLang(lang)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 20,
                        border: `1px solid ${
                          runnerLang === lang
                            ? "rgba(34,211,238,0.4)"
                            : "#1e3a5f"
                        }`,
                        background:
                          runnerLang === lang
                            ? "rgba(34,211,238,0.1)"
                            : "transparent",
                        color: runnerLang === lang ? "#22d3ee" : "#64748b",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Code input */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Paste your solution code ({runnerLang})
              </label>
              <textarea
                rows={8}
                placeholder={`# Paste your working ${runnerLang} solution here...\n# The system will run it with the test input above`}
                value={runnerCode}
                onChange={(e) => setRunnerCode(e.target.value)}
                style={{
                  ...inputStyle,
                  fontFamily: "monospace",
                  fontSize: 12,
                  resize: "vertical",
                  lineHeight: 1.5,
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
              />
            </div>

            {/* Run result */}
            {runResult && (
              <div
                style={{
                  marginBottom: 16,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: `1px solid ${
                    runResult.status === "pass"
                      ? "rgba(74,222,128,0.25)"
                      : "rgba(239,68,68,0.25)"
                  }`,
                }}
              >
                <div
                  style={{
                    padding: "8px 14px",
                    background:
                      runResult.status === "pass"
                        ? "rgba(74,222,128,0.08)"
                        : "rgba(239,68,68,0.08)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    color: runResult.status === "pass" ? "#4ade80" : "#f87171",
                  }}
                >
                  {runResult.status === "pass" ? "✓ Test Passed" : "✕ Test Failed"}
                </div>
                <div style={{ padding: "10px 14px", background: "#0a1628" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      marginBottom: 4,
                    }}
                  >
                    Actual Output
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "#94a3b8",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {runResult.output}
                  </pre>
                </div>
              </div>
            )}

            {/* Runner action buttons */}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                onClick={runTest}
                disabled={isRunning}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 20px",
                  borderRadius: 9,
                  border: "none",
                  background: isRunning ? "#1e3a5f" : "rgba(250,204,21,0.12)",
                  color: isRunning ? "#64748b" : "#fbbf24",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isRunning ? "default" : "pointer",
                  border: "1px solid rgba(250,204,21,0.2)",
                }}
              >
                {isRunning ? (
                  <>
                    <Spinner /> Running…
                  </>
                ) : (
                  "▶ Run Test"
                )}
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowRunner(false)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 9,
                    border: "1px solid #1e3a5f",
                    background: "transparent",
                    color: "#94a3b8",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                {runResult?.status === "pass" && (
                  <button
                    onClick={confirmFromRunner}
                    style={{
                      padding: "9px 20px",
                      borderRadius: 9,
                      border: "none",
                      background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(6,182,212,0.25)",
                    }}
                  >
                    ✓ Confirm Test Case
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
