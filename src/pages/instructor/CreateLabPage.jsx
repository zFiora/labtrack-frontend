import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import TestCasesTab from "./TestCasesTab";
import SolutionsTab from "./SolutionsTab";
import { api } from "../../utils/api.js";

const LANGUAGES = ["Python", "C++", "C", "Java", "JavaScript", "Go", "Rust"];
const AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const inputStyle = {
  width: "100%",
  background: "#0a1628",
  border: "1px solid #1a2540",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#e2e8f0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const sectionStyle = {
  background: "#0f1b33",
  border: "1px solid #1a2540",
  borderRadius: 14,
  padding: "22px 24px",
  marginBottom: 16,
};

const sectionTitleStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#e2e8f0",
  margin: "0 0 18px",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLastSaved(date) {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 min ago";
  return `${diffMins} mins ago`;
}

const STATUS_BADGE = {
  draft: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", border: "rgba(148,163,184,0.25)" },
  active: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", border: "rgba(34,197,94,0.25)" },
};

function getLabPayload(data) {
  return data?.lab ?? data;
}

function getStarterCode(starterFiles) {
  return starterFiles
    .map((file) => file.content || file.code || "")
    .find((content) => content.trim()) ?? "";
}

function buildLabPayload(formData, starter, _supporting, tcs, sols) {
  return {
    courseId: formData.courseId.trim(),
    labNumber: Number.parseInt(formData.labNumber, 10) || undefined,
    title: formData.title.trim(),
    instructions: formData.instructions.trim(),
    dueDate: formData.dueDate || undefined,
    points: Number.parseInt(formData.points, 10) || undefined,
    difficulty: formData.difficulty,
    languages: formData.languages,
    starterCode: getStarterCode(starter),
    testCases: tcs,
    solutions: sols,
  };
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseValidationFailures(message) {
  if (Array.isArray(message)) return message.filter(Boolean);
  const text = String(message || "").trim();
  if (!text) return ["Lab could not be published."];

  return text
    .replace(/^validation failed:?\s*/i, "")
    .split(/\n|;|,(?=\s*[A-Z])|\.\s+(?=[A-Z])/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export default function CreateLabPage() {
  const navigate = useNavigate();
  const { labId } = useParams();
  const isEditing = Boolean(labId);

  const [form, setForm] = useState({
    courseId: "",
    labNumber: "",
    title: "",
    instructions: "",
    dueDate: "",
    points: "",
    difficulty: "medium",
    languages: [],
  });
  const [starterFiles, setStarterFiles] = useState([]);
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [publishErrors, setPublishErrors] = useState([]);
  const [toast, setToast] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [labStatus, setLabStatus] = useState("draft");
  const [isSaving, setIsSaving] = useState(false);
  const [labLoading, setLabLoading] = useState(isEditing);
  const [labLoadError, setLabLoadError] = useState("");
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [starterDragOver, setStarterDragOver] = useState(false);
  const [supportingDragOver, setSupportingDragOver] = useState(false);
  const [testCases, setTestCases]   = useState([]);
  const [solutions, setSolutions]   = useState([]);
  const [activeTab, setActiveTab]   = useState("details"); // "details" | "testcases" | "solutions"

  // Use a stable ID for the current lab session
  const currentLabIdRef = useRef(labId || Date.now().toString());
  const savedApiLabIdRef = useRef(labId || null);

  // Refs to hold latest values for the auto-save interval (avoids stale closure)
  const latestDataRef = useRef({ form, starterFiles, supportingFiles, labStatus, testCases, solutions });
  useEffect(() => {
    latestDataRef.current = { form, starterFiles, supportingFiles, labStatus, testCases, solutions };
  }, [form, starterFiles, supportingFiles, labStatus, testCases, solutions]);

  const starterInputRef = useRef(null);
  const supportingInputRef = useRef(null);

  // Load existing lab when editing
  useEffect(() => {
    if (!isEditing) return;
    setLabLoading(true);
    setLabLoadError("");

    api.get(`/instructor/labs/${labId}`)
      .then((data) => {
        const lab = getLabPayload(data);
        savedApiLabIdRef.current = lab.id || labId;
        currentLabIdRef.current = lab.id || labId;

        setForm({
          courseId: lab.courseId || lab.course?.id || lab.courseCode || "",
          labNumber: lab.labNumber || "",
          title: lab.title || "",
          instructions: lab.instructions ?? lab.description ?? "",
          dueDate: toDateTimeLocalValue(lab.dueDate),
          points: lab.points ? String(lab.points) : "",
          difficulty: lab.difficulty || "medium",
          languages: lab.languages || (lab.language ? [lab.language] : []),
        });
        setStarterFiles(lab.starterFiles || []);
        setSupportingFiles(lab.supportingFiles || []);
        setTestCases(lab.testCases || []);
        setSolutions(lab.solutions || []);
        setLabStatus(lab.status || "draft");
        if (lab.updatedAt) setLastSaved(new Date(lab.updatedAt));
      })
      .catch((err) => {
        if (err.status === 401) {
          navigate("/");
          return;
        }
        setLabLoadError(err.message ?? "Failed to load lab. Please try again.");
      })
      .finally(() => setLabLoading(false));
  }, [labId, isEditing, navigate]);

  const saveLab = useCallback(
    async (formData, starter, supporting, status, tcs, sols, silent = false) => {
      if (!formData.title && !isEditing) return false;

      const payload = buildLabPayload(formData, starter, supporting, tcs, sols);
      const targetId = savedApiLabIdRef.current || labId;
      const savedLab = getLabPayload(
        targetId
          ? await api.patch(`/instructor/labs/${targetId}`, payload)
          : await api.post("/instructor/labs", payload),
      );

      if (savedLab?.id) {
        savedApiLabIdRef.current = savedLab.id;
        currentLabIdRef.current = savedLab.id;
      }

      setLastSaved(savedLab?.updatedAt ? new Date(savedLab.updatedAt) : new Date());
      setLabStatus(savedLab?.status || status || "draft");
      if (!silent) showToast("success", "Lab saved as draft");
      return savedLab || true;
    },
    [isEditing, labId],
  );

  // Auto-save every 2 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      const { form: f, starterFiles: sf, supportingFiles: spf, labStatus: ls, testCases: tcs, solutions: sols } =
        latestDataRef.current;
      if (!f.title || (!isEditing && !f.courseId?.trim())) return;
      try {
        const saved = await saveLab(f, sf, spf, ls, tcs, sols, true);
        if (saved) showToast("info", "Auto-saved");
      } catch {
        showToast("error", "Auto-save failed");
      }
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isEditing, saveLab]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === "success" && message.includes("published") ? 5000 : 3000);
  };

  const validate = (forPublish = false) => {
    const errs = {};

    if (!form.title || form.title.trim().length < 5) {
      errs.title = "Lab title must be at least 5 characters";
    }

    if (!form.courseId.trim()) {
      errs.courseId = "Course ID is required";
    }

    if (form.dueDate || forPublish) {
      if (!form.dueDate) {
        errs.dueDate = "Due date is required";
      } else {
        const due = new Date(form.dueDate);
        const minDue = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (due < minDue) {
          errs.dueDate = "Due date must be at least 24 hours from now";
        }
      }
    }

    if (form.points !== "") {
      const pts = Number(form.points);
      if (!Number.isInteger(pts) || pts < 1 || pts > 200) {
        errs.points = "Points must be a whole number between 1 and 200";
      }
    } else if (forPublish) {
      errs.points = "Points is required to publish";
    }

    if (forPublish && form.languages.length === 0) {
      errs.languages = "Select at least one programming language";
    }

    if (forPublish && testCases.length < 3) {
      errs.testCases = `At least 3 test cases are required (currently ${testCases.length})`;
    }

    const totalBytes = [...starterFiles, ...supportingFiles].reduce(
      (sum, f) => sum + f.size,
      0,
    );
    if (totalBytes > 50 * 1024 * 1024) {
      errs.files = "Total file size cannot exceed 50 MB";
    }

    return errs;
  };

  const handleSaveDraft = async () => {
    setPublishErrors([]);
    const errs = validate(false);
    // For draft: only block on title (min length), points range if provided, file size
    const blockingErrs = {};
    if (errs.courseId) blockingErrs.courseId = errs.courseId;
    if (errs.title) blockingErrs.title = errs.title;
    if (errs.points) blockingErrs.points = errs.points;
    if (errs.dueDate) blockingErrs.dueDate = errs.dueDate;
    if (errs.files) blockingErrs.files = errs.files;

    setErrors(blockingErrs);
    if (Object.keys(blockingErrs).length > 0) return;

    setIsSaving(true);
    try {
      await saveLab(form, starterFiles, supportingFiles, "draft", testCases, solutions);
    } catch (err) {
      showToast("error", err.message ?? "Failed to save lab draft");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishClick = () => {
    setPublishErrors([]);
    const errs = validate(true);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      showToast("error", "Fix the errors below before publishing");
      return;
    }
    setShowPublishConfirm(true);
  };

  const confirmPublish = async () => {
    setIsPublishing(true);
    setPublishErrors([]);

    try {
      const savedLab = await saveLab(
        form,
        starterFiles,
        supportingFiles,
        labStatus,
        testCases,
        solutions,
        true,
      );
      const targetId = savedLab?.id || savedApiLabIdRef.current || labId;
      if (!targetId) throw new Error("Save the lab before publishing.");

      const publishedLab = getLabPayload(
        await api.patch(`/instructor/labs/${targetId}/publish`, { status: "active" }),
      );

      setLabStatus(publishedLab?.status || "active");
      setLastSaved(publishedLab?.updatedAt ? new Date(publishedLab.updatedAt) : new Date());
      showToast("success", "Lab published successfully! Students have been notified.");
      setIsPublishing(false);
      setShowPublishConfirm(false);
    } catch (err) {
      if (err.status === 400) {
        setPublishErrors(parseValidationFailures(err.message));
        setShowPublishConfirm(false);
        setActiveTab("details");
        showToast("error", "Publishing failed validation");
      } else {
        showToast("error", err.message ?? "Failed to publish lab");
      }
      setIsPublishing(false);
    }
  };

  const simulateUpload = (files, type) => {
    files.forEach((file) => {
      setUploadingFiles((prev) => ({ ...prev, [file.name + type]: 0 }));
      let progress = 0;
      const iv = setInterval(() => {
        progress += Math.random() * 35 + 15;
        if (progress >= 100) {
          clearInterval(iv);
          setUploadingFiles((prev) => {
            const next = { ...prev };
            delete next[file.name + type];
            return next;
          });
        } else {
          setUploadingFiles((prev) => ({
            ...prev,
            [file.name + type]: Math.round(progress),
          }));
        }
      }, 150);
    });
  };

  const handleFiles = (fileList, type) => {
    const incoming = Array.from(fileList);
    const infoList = incoming.map((f) => ({ name: f.name, size: f.size, fileType: f.type }));

    const currentStarter = type === "starter" ? [] : starterFiles;
    const currentSupporting = type === "supporting" ? [] : supportingFiles;
    const combined = [...starterFiles, ...supportingFiles, ...infoList];
    const totalBytes = combined.reduce((s, f) => s + f.size, 0);

    if (totalBytes > 50 * 1024 * 1024) {
      showToast("error", "Total file size would exceed 50 MB limit");
      return;
    }

    simulateUpload(incoming, type);

    if (type === "starter") {
      setStarterFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...infoList.filter((f) => !names.has(f.name))];
      });
    } else {
      setSupportingFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...infoList.filter((f) => !names.has(f.name))];
      });
    }

    if (errors.files) setErrors((prev) => ({ ...prev, files: null }));
  };

  const removeFile = (type, name) => {
    if (type === "starter") setStarterFiles((prev) => prev.filter((f) => f.name !== name));
    else setSupportingFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const toggleLanguage = (lang) => {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
    if (errors.languages) setErrors((prev) => ({ ...prev, languages: null }));
  };

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
    if (publishErrors.length > 0) setPublishErrors([]);
  };

  const minDateTime = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  const totalUploadedMB = (
    [...starterFiles, ...supportingFiles].reduce((s, f) => s + f.size, 0) /
    (1024 * 1024)
  ).toFixed(2);

  const statusBadge = STATUS_BADGE[labStatus] || STATUS_BADGE.draft;

  if (labLoading) {
    return (
      <InstructorLayout>
        <div style={{ padding: "48px 32px", color: "#94a3b8", fontSize: 14 }}>
          Loading lab...
        </div>
      </InstructorLayout>
    );
  }

  if (labLoadError) {
    return (
      <InstructorLayout>
        <div style={{ padding: "48px 32px" }}>
          <button
            onClick={() => navigate("/instructor/labs")}
            style={{
              background: "transparent",
              border: "1px solid #1a2540",
              borderRadius: 8,
              color: "#64748b",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Back
          </button>
          <div style={{ color: "#f87171", fontSize: 14 }}>{labLoadError}</div>
        </div>
      </InstructorLayout>
    );
  }

  // File upload drop zone component
  const DropZone = ({ type, files, dragOver, setDragOver, inputRef }) => (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files, type);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#22d3ee" : "#1e3a5f"}`,
          borderRadius: 10,
          padding: "24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "rgba(34,211,238,0.05)" : "transparent",
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>
          Drag & drop files here, or{" "}
          <span style={{ color: "#22d3ee", fontWeight: 600 }}>browse</span>
        </div>
        <div style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>
          Any file type supported
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files, type)}
        />
      </div>

      {/* Upload progress indicators */}
      {Object.entries(uploadingFiles)
        .filter(([key]) => key.endsWith(type))
        .map(([key, progress]) => {
          const fileName = key.replace(type, "");
          return (
            <div
              key={key}
              style={{
                marginTop: 8,
                background: "#0a1628",
                border: "1px solid #1a2540",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{fileName}</span>
                <span style={{ fontSize: 11, color: "#22d3ee" }}>{Math.round(progress)}%</span>
              </div>
              <div
                style={{
                  height: 3,
                  background: "#1a2540",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, #06b6d4, #22d3ee)",
                    borderRadius: 99,
                    transition: "width 0.15s ease",
                  }}
                />
              </div>
            </div>
          );
        })}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((file) => (
            <div
              key={file.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#0a1628",
                border: "1px solid #1a2540",
                borderRadius: 8,
                padding: "7px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>{file.name}</span>
                <span style={{ fontSize: 11, color: "#475569" }}>
                  ({formatFileSize(file.size)})
                </span>
              </div>
              <button
                onClick={() => removeFile(type, file.name)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#475569",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "0 2px",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <InstructorLayout>
      {/* Toast notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 100,
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background:
              toast.type === "success"
                ? "linear-gradient(135deg, #064e3b, #065f46)"
                : toast.type === "error"
                  ? "linear-gradient(135deg, #7f1d1d, #991b1b)"
                  : "#0f1b33",
            border: `1px solid ${
              toast.type === "success"
                ? "rgba(52,211,153,0.3)"
                : toast.type === "error"
                  ? "rgba(239,68,68,0.3)"
                  : "#1e3a5f"
            }`,
            color:
              toast.type === "success"
                ? "#6ee7b7"
                : toast.type === "error"
                  ? "#fca5a5"
                  : "#94a3b8",
            maxWidth: 380,
          }}
        >
          <span>
            {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "⟳"}
          </span>
          {toast.message}
        </div>
      )}

      {/* Page content */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 32px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => navigate("/instructor/labs")}
            style={{
              background: "transparent",
              border: "1px solid #1a2540",
              borderRadius: 8,
              color: "#64748b",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>
              {isEditing ? "Edit Lab" : "Create New Lab"}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Status badge */}
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                background: statusBadge.bg,
                color: statusBadge.text,
                border: `1px solid ${statusBadge.border}`,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {labStatus}
            </span>
            {/* Last saved */}
            {lastSaved && (
              <span style={{ fontSize: 12, color: "#475569" }}>
                Saved {formatLastSaved(lastSaved)}
              </span>
            )}
            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              style={{
                padding: "9px 18px",
                borderRadius: 9,
                border: "1px solid #1e3a5f",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 13,
                fontWeight: 600,
                cursor: isSaving ? "wait" : "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#22d3ee";
                e.currentTarget.style.color = "#22d3ee";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#1e3a5f";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={handlePublishClick}
              style={{
                padding: "9px 18px",
                borderRadius: 9,
                border: "none",
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(6,182,212,0.3)",
              }}
            >
              Publish Lab
            </button>
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 20,
            background: "#0a1628",
            border: "1px solid #1a2540",
            borderRadius: 12,
            padding: 4,
            width: "fit-content",
          }}
        >
          {[
            { key: "details",   label: "Lab Details",         icon: "📋" },
            { key: "testcases", label: "Test Cases",  icon: "🧪", badge: testCases.length },
            { key: "solutions", label: "Solutions",   icon: "💡", badge: solutions.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 18px",
                borderRadius: 9,
                border: "none",
                background: activeTab === tab.key ? "#10213f" : "transparent",
                color: activeTab === tab.key ? "#e2e8f0" : "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {tab.badge > 0 && (
                <span
                  style={{
                    padding: "1px 7px",
                    borderRadius: 99,
                    fontSize: 11,
                    background:
                      activeTab === tab.key
                        ? "rgba(34,211,238,0.15)"
                        : "rgba(71,85,105,0.3)",
                    color: activeTab === tab.key ? "#22d3ee" : "#64748b",
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error banners */}
        {(errors.files || errors.testCases || publishErrors.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {publishErrors.length > 0 && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: "#f87171",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Publish validation failed
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {publishErrors.map((failure) => (
                    <li key={failure}>{failure}</li>
                  ))}
                </ul>
              </div>
            )}
            {errors.files && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: "#f87171",
                  fontSize: 13,
                }}
              >
                ⚠ {errors.files}
              </div>
            )}
            {errors.testCases && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: "#f87171",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>⚠ {errors.testCases}</span>
                <button
                  onClick={() => setActiveTab("testcases")}
                  style={{
                    background: "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 6,
                    color: "#f87171",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 9px",
                    cursor: "pointer",
                  }}
                >
                  Go to Test Cases →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Details tab ── */}
        {activeTab === "details" && (<>

        {/* ── SECTION 1: Basic Information ── */}
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>
            <span>📋</span> Basic Information
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 110px 1fr 120px",
              gap: 16,
              marginBottom: 16,
            }}
          >
            {/* Course ID */}
            <div>
              <label style={labelStyle}>
                Course ID <span style={{ color: "#f87171" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="course-id"
                value={form.courseId}
                onChange={(e) => setField("courseId", e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: errors.courseId ? "rgba(239,68,68,0.5)" : "#1a2540",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) =>
                  (e.target.style.borderColor = errors.courseId
                    ? "rgba(239,68,68,0.5)"
                    : "#1a2540")
                }
              />
              {errors.courseId && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>
                  {errors.courseId}
                </p>
              )}
            </div>

            {/* Lab Number */}
            <div>
              <label style={labelStyle}>Lab #</label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={form.labNumber}
                onChange={(e) => setField("labNumber", e.target.value)}
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
              />
            </div>

            {/* Difficulty */}
            <div>
              <label style={labelStyle}>Difficulty Level</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["easy", "medium", "hard"].map((d) => {
                  const colors = {
                    easy: { active: "#4ade80", activeBg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)" },
                    medium: { active: "#facc15", activeBg: "rgba(250,204,21,0.12)", border: "rgba(250,204,21,0.3)" },
                    hard: { active: "#f87171", activeBg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)" },
                  }[d];
                  const selected = form.difficulty === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setField("difficulty", d)}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: 9,
                        border: `1px solid ${selected ? colors.border : "#1a2540"}`,
                        background: selected ? colors.activeBg : "transparent",
                        color: selected ? colors.active : "#475569",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        textTransform: "capitalize",
                        transition: "all 0.15s",
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Points */}
            <div>
              <label style={labelStyle}>Points</label>
              <input
                type="number"
                min="1"
                max="200"
                placeholder="100"
                value={form.points}
                onChange={(e) => setField("points", e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: errors.points ? "rgba(239,68,68,0.5)" : "#1a2540",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
                onBlur={(e) =>
                  (e.target.style.borderColor = errors.points
                    ? "rgba(239,68,68,0.5)"
                    : "#1a2540")
                }
              />
              {errors.points && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>
                  {errors.points}
                </p>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>
              Lab Title <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Binary Search Trees Implementation"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              style={{
                ...inputStyle,
                fontSize: 15,
                borderColor: errors.title ? "rgba(239,68,68,0.5)" : "#1a2540",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
              onBlur={(e) =>
                (e.target.style.borderColor = errors.title
                  ? "rgba(239,68,68,0.5)"
                  : "#1a2540")
              }
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              {errors.title ? (
                <p style={{ margin: 0, fontSize: 11, color: "#f87171" }}>
                  {errors.title}
                </p>
              ) : (
                <span />
              )}
              <span
                style={{
                  fontSize: 11,
                  color: form.title.length < 5 ? "#64748b" : "#4ade80",
                }}
              >
                {form.title.length} chars (min 5)
              </span>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Instructions ── */}
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>
            <span>📝</span> Lab Instructions
          </p>
          <textarea
            placeholder="Describe the lab objectives, requirements, and any additional context for students..."
            value={form.instructions}
            onChange={(e) => setField("instructions", e.target.value)}
            rows={8}
            style={{
              ...inputStyle,
              resize: "vertical",
              minHeight: 160,
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
            onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
            onBlur={(e) => (e.target.style.borderColor = "#1a2540")}
          />
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#475569" }}>
            Supports plain text. Markdown formatting will be displayed in the student view.
          </p>
        </div>

        {/* ── SECTION 3: Schedule ── */}
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>
            <span>📅</span> Schedule
          </p>
          <div style={{ maxWidth: 300 }}>
            <label style={labelStyle}>
              Due Date & Time <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="datetime-local"
              min={minDateTime}
              value={form.dueDate}
              onChange={(e) => setField("dueDate", e.target.value)}
              style={{
                ...inputStyle,
                colorScheme: "dark",
                borderColor: errors.dueDate ? "rgba(239,68,68,0.5)" : "#1a2540",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#22d3ee")}
              onBlur={(e) =>
                (e.target.style.borderColor = errors.dueDate
                  ? "rgba(239,68,68,0.5)"
                  : "#1a2540")
              }
            />
            {errors.dueDate ? (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>
                {errors.dueDate}
              </p>
            ) : (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#475569" }}>
                Must be at least 24 hours from now
              </p>
            )}
          </div>
        </div>

        {/* ── SECTION 4: Programming Languages ── */}
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>
            <span>💻</span> Allowed Programming Languages{" "}
            <span style={{ color: "#f87171", fontSize: 12 }}>*</span>
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {LANGUAGES.map((lang) => {
              const selected = form.languages.includes(lang);
              return (
                <button
                  key={lang}
                  onClick={() => toggleLanguage(lang)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 20,
                    border: `1px solid ${selected ? "rgba(34,211,238,0.4)" : "#1e3a5f"}`,
                    background: selected ? "rgba(34,211,238,0.12)" : "transparent",
                    color: selected ? "#22d3ee" : "#64748b",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {selected && (
                    <span style={{ fontSize: 11, color: "#22d3ee" }}>✓</span>
                  )}
                  {lang}
                </button>
              );
            })}
          </div>
          {errors.languages && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#f87171" }}>
              ⚠ {errors.languages}
            </p>
          )}
          {form.languages.length > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#475569" }}>
              {form.languages.length} language{form.languages.length > 1 ? "s" : ""} selected
            </p>
          )}
        </div>

        {/* ── SECTION 5: File Uploads ── */}
        <div style={sectionStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <p style={{ ...sectionTitleStyle, margin: 0 }}>
              <span>📦</span> File Uploads
            </p>
            <span
              style={{
                fontSize: 12,
                color:
                  parseFloat(totalUploadedMB) > 45
                    ? "#f87171"
                    : parseFloat(totalUploadedMB) > 30
                      ? "#facc15"
                      : "#64748b",
              }}
            >
              {totalUploadedMB} MB / 50 MB used
            </span>
          </div>

          {/* Progress bar for total size */}
          <div
            style={{
              height: 4,
              background: "#1a2540",
              borderRadius: 99,
              marginBottom: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min((parseFloat(totalUploadedMB) / 50) * 100, 100)}%`,
                background:
                  parseFloat(totalUploadedMB) > 45
                    ? "#ef4444"
                    : "linear-gradient(90deg, #06b6d4, #22d3ee)",
                borderRadius: 99,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Starter Code */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>
                Starter Code Templates
              </label>
              <DropZone
                type="starter"
                files={starterFiles}
                dragOver={starterDragOver}
                setDragOver={setStarterDragOver}
                inputRef={starterInputRef}
              />
            </div>

            {/* Supporting Files */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>
                Supporting Files
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 500,
                    color: "#475569",
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  (headers, data files, etc.)
                </span>
              </label>
              <DropZone
                type="supporting"
                files={supportingFiles}
                dragOver={supportingDragOver}
                setDragOver={setSupportingDragOver}
                inputRef={supportingInputRef}
              />
            </div>
          </div>
        </div>

        </>)}

        {/* ── Test Cases tab ── */}
        {activeTab === "testcases" && (
          <TestCasesTab
            testCases={testCases}
            setTestCases={setTestCases}
            labPoints={form.points}
            labLanguages={form.languages}
            showToast={showToast}
          />
        )}

        {/* ── Solutions tab ── */}
        {activeTab === "solutions" && (
          <SolutionsTab
            solutions={solutions}
            setSolutions={setSolutions}
            labLanguages={form.languages}
            labDueDate={form.dueDate}
            showToast={showToast}
          />
        )}

        {/* Bottom action bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            paddingTop: 8,
            paddingBottom: 16,
          }}
        >
          <button
            onClick={() => navigate("/instructor/labs")}
            style={{
              padding: "10px 20px",
              borderRadius: 9,
              border: "1px solid #1a2540",
              background: "transparent",
              color: "#64748b",
              fontSize: 14,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            style={{
              padding: "10px 20px",
              borderRadius: 9,
              border: "1px solid #1e3a5f",
              background: "transparent",
              color: "#94a3b8",
              fontSize: 14,
              fontWeight: 600,
              cursor: isSaving ? "wait" : "pointer",
            }}
          >
            {isSaving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={handlePublishClick}
            style={{
              padding: "10px 24px",
              borderRadius: 9,
              border: "none",
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(6,182,212,0.3)",
            }}
          >
            Publish Lab
          </button>
        </div>
      </div>

      {/* ── Publish Confirmation Modal ── */}
      {showPublishConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#0f1b33",
              border: "1px solid #1e3a5f",
              borderRadius: 18,
              padding: "32px 36px",
              width: 420,
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 16 }}>🚀</div>
            <h3
              style={{
                color: "#e2e8f0",
                margin: "0 0 10px",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Publish "{form.title}"?
            </h3>
            <p style={{ color: "#64748b", margin: "0 0 6px", fontSize: 14, lineHeight: 1.6 }}>
              This will make the lab visible to all enrolled students immediately.
            </p>
            <div
              style={{
                background: "rgba(34,211,238,0.07)",
                border: "1px solid rgba(34,211,238,0.15)",
                borderRadius: 10,
                padding: "12px 16px",
                margin: "16px 0 24px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {[
                { icon: "📋", label: "Lab", value: `#${form.labNumber || "—"} · ${form.title}` },
                { icon: "📅", label: "Due", value: form.dueDate ? new Date(form.dueDate).toLocaleString() : "—" },
                { icon: "🏆", label: "Points", value: `${form.points || 0} pts` },
                { icon: "💻", label: "Languages", value: form.languages.join(", ") || "—" },
                { icon: "🧪", label: "Tests", value: `${testCases.length} test case${testCases.length !== 1 ? "s" : ""}` },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span style={{ fontSize: 14 }}>{row.icon}</span>
                  <span style={{ fontSize: 12, color: "#64748b", width: 70 }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>{row.value}</span>
                </div>
              ))}
            </div>
            <p style={{ color: "#475569", fontSize: 12, margin: "0 0 20px" }}>
              A notification email will be sent to all enrolled students.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowPublishConfirm(false)}
                disabled={isPublishing}
                style={{
                  padding: "10px 20px",
                  borderRadius: 9,
                  border: "1px solid #1e3a5f",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmPublish}
                disabled={isPublishing}
                style={{
                  padding: "10px 24px",
                  borderRadius: 9,
                  border: "none",
                  background: isPublishing
                    ? "#0e7490"
                    : "linear-gradient(135deg, #06b6d4, #0891b2)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isPublishing ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 14px rgba(6,182,212,0.3)",
                }}
              >
                {isPublishing ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                    Publishing…
                  </>
                ) : (
                  "Publish Lab"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </InstructorLayout>
  );
}
