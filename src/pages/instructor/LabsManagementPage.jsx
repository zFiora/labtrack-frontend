import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import InstructorLayout from "../../components/layout/InstructorLayout";
import { api } from "../../utils/api.js";

const STATUS_STYLES = {
  draft: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", border: "rgba(148,163,184,0.25)" },
  active: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", border: "rgba(34,197,94,0.25)" },
  closed: { bg: "rgba(239,68,68,0.12)", text: "#f87171", border: "rgba(239,68,68,0.25)" },
};

const DIFFICULTY_STYLES = {
  easy: { text: "#4ade80" },
  medium: { text: "#facc15" },
  hard: { text: "#f87171" },
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLabsPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.labs)) return data.labs;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getLabPayload(data) {
  return data?.lab ?? data;
}

function courseMeta(lab) {
  const courseCode = lab.courseCode || lab.course?.code || "Unassigned Course";
  const courseName = lab.courseName || lab.course?.name || "";
  const semester = lab.semester || lab.course?.semester || "";
  return { courseCode, courseName, semester };
}

export default function LabsManagementPage() {
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [allLabs, setAllLabs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // lab id to confirm delete
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchLabs = useCallback(async (targetFilter = filter, { showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const listPath =
        targetFilter === "all"
          ? "/instructor/labs"
          : `/instructor/labs?status=${encodeURIComponent(targetFilter)}`;

      const [allData, filteredData] = await Promise.all([
        api.get("/instructor/labs"),
        targetFilter === "all" ? Promise.resolve(null) : api.get(listPath),
      ]);

      const all = getLabsPayload(allData);
      setAllLabs(all);
      setLabs(targetFilter === "all" ? all : getLabsPayload(filteredData));
    } catch (err) {
      if (err.status === 401) {
        navigate("/");
        return;
      }
      setError(err.message ?? "Failed to load labs. Please try again.");
      setLabs([]);
      setAllLabs([]);
    } finally {
      setLoading(false);
    }
  }, [filter, navigate]);

  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  const filtered = labs;
  const groupedLabs = useMemo(() => {
    const groups = new Map();
    filtered.forEach((lab) => {
      const meta = courseMeta(lab);
      const key = `${meta.courseCode}-${meta.semester}`;
      if (!groups.has(key)) {
        groups.set(key, { ...meta, labs: [] });
      }
      groups.get(key).labs.push(lab);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        labs: [...group.labs].sort((a, b) => {
          const numberA = Number(a.labNumber) || Number.MAX_SAFE_INTEGER;
          const numberB = Number(b.labNumber) || Number.MAX_SAFE_INTEGER;
          if (numberA !== numberB) return numberA - numberB;
          return String(a.title || "").localeCompare(String(b.title || ""));
        }),
      }))
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }, [filtered]);

  const counts = {
    all: allLabs.length,
    active: allLabs.filter((l) => l.status === "active").length,
    draft: allLabs.filter((l) => l.status === "draft").length,
    closed: allLabs.filter((l) => l.status === "closed").length,
  };

  const syncUpdatedLab = (updatedLab) => {
    if (!updatedLab?.id) return;
    setAllLabs((current) =>
      current.map((lab) => (String(lab.id) === String(updatedLab.id) ? updatedLab : lab)),
    );
    setLabs((current) => {
      const belongsInCurrentFilter =
        filter === "all" || updatedLab.status === filter;
      const alreadyVisible = current.some((lab) => String(lab.id) === String(updatedLab.id));

      if (!belongsInCurrentFilter) {
        return current.filter((lab) => String(lab.id) !== String(updatedLab.id));
      }
      if (alreadyVisible) {
        return current.map((lab) => (String(lab.id) === String(updatedLab.id) ? updatedLab : lab));
      }
      return [updatedLab, ...current];
    });
  };

  const handleDelete = async (id) => {
    setActionError("");
    try {
      await api.delete(`/instructor/labs/${id}`);
      setAllLabs((current) => current.filter((lab) => String(lab.id) !== String(id)));
      setLabs((current) => current.filter((lab) => String(lab.id) !== String(id)));
      setDeleteConfirm(null);
    } catch (err) {
      setActionError(err.message ?? "Failed to delete lab. Please try again.");
    }
  };

  const handleQuickPublish = async (id) => {
    setActionError("");
    try {
      const updatedLab = getLabPayload(
        await api.patch(`/instructor/labs/${id}/publish`, { status: "active" }),
      );
      if (updatedLab?.id) {
        syncUpdatedLab(updatedLab);
      } else {
        fetchLabs(filter, { showLoading: false });
      }
    } catch (err) {
      setActionError(err.message ?? "Failed to publish lab. Please try again.");
    }
  };

  const handleClose = async (id) => {
    setActionError("");
    try {
      const updatedLab = getLabPayload(
        await api.patch(`/instructor/labs/${id}`, { status: "closed" }),
      );
      if (updatedLab?.id) {
        syncUpdatedLab(updatedLab);
      } else {
        fetchLabs(filter, { showLoading: false });
      }
    } catch (err) {
      setActionError(err.message ?? "Failed to close lab. Please try again.");
    }
  };

  const TABS = ["all", "active", "draft", "closed"];

  return (
    <InstructorLayout>
      <div style={{ padding: "28px 32px", minHeight: "100%" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}
            >
              Lab Management
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Create, manage, and publish lab assignments for your course
            </p>
          </div>
          <button
            onClick={() => navigate("/instructor/labs/create")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(6,182,212,0.3)",
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> Create New Lab
          </button>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 28,
          }}
        >
          {[
            { label: "Total Labs", value: counts.all, icon: "🧪", color: "#22d3ee" },
            { label: "Active", value: counts.active, icon: "✅", color: "#4ade80" },
            { label: "Drafts", value: counts.draft, icon: "📝", color: "#94a3b8" },
            { label: "Closed", value: counts.closed, icon: "🔒", color: "#f87171" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "#0f1b33",
                border: "1px solid #1a2540",
                borderRadius: 14,
                padding: "18px 20px",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span style={{ fontSize: 24 }}>{stat.icon}</span>
              <div>
                <div
                  style={{ fontSize: 22, fontWeight: 700, color: stat.color }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            background: "#0a1628",
            border: "1px solid #1a2540",
            borderRadius: 12,
            padding: 4,
            width: "fit-content",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: "7px 16px",
                borderRadius: 9,
                border: "none",
                background: filter === tab ? "#10213f" : "transparent",
                color: filter === tab ? "#e2e8f0" : "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.2s",
              }}
            >
              {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: filter === tab ? "#22d3ee" : "#475569",
                }}
              >
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Labs list */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {actionError && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(250,204,21,0.10)",
              border: "1px solid rgba(250,204,21,0.25)",
              color: "#facc15",
              fontSize: 13,
            }}
          >
            {actionError}
          </div>
        )}

        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "64px 32px",
              background: "#0f1b33",
              border: "1px solid #1a2540",
              borderRadius: 16,
              color: "#94a3b8",
              fontSize: 14,
            }}
          >
            Loading labs...
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "64px 32px",
              background: "#0f1b33",
              border: "1px dashed #1e3a5f",
              borderRadius: 16,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 18 }}>
              {filter === "all" ? "No labs yet" : `No ${filter} labs`}
            </h3>
            <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>
              {filter === "all"
                ? "Create your first lab assignment to get started"
                : `You don't have any ${filter} labs`}
            </p>
            {filter === "all" && (
              <button
                onClick={() => navigate("/instructor/labs/create")}
                style={{
                  padding: "10px 24px",
                  background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Create New Lab
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              background: "#0a1628",
              border: "1px solid #1a2540",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 110px 160px 70px 90px 1fr 220px",
                gap: 0,
                padding: "12px 20px",
                borderBottom: "1px solid #1a2540",
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span>#</span>
              <span>Title</span>
              <span>Status</span>
              <span>Due Date</span>
              <span>Pts</span>
              <span>Level</span>
              <span>Languages</span>
              <span>Actions</span>
            </div>

            {groupedLabs.map((group, groupIndex) => (
              <div key={`${group.courseCode}-${group.semester || groupIndex}`}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "12px 20px",
                    borderTop: groupIndex === 0 ? "none" : "1px solid #1a2540",
                    borderBottom: "1px solid #0f1b33",
                    background: "rgba(16,33,63,0.72)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: "#22d3ee", fontSize: 13, fontWeight: 800, fontFamily: "monospace" }}>
                        {group.courseCode}
                      </span>
                      {group.courseName && (
                        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>
                          {group.courseName}
                        </span>
                      )}
                      {group.semester && (
                        <span
                          style={{
                            color: "#a78bfa",
                            background: "rgba(168,85,247,0.10)",
                            border: "1px solid rgba(168,85,247,0.20)",
                            borderRadius: 7,
                            padding: "2px 7px",
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          {group.semester}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>
                    {group.labs.length} lab{group.labs.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {group.labs.map((lab, i) => {
                  const statusStyle = STATUS_STYLES[lab.status] || STATUS_STYLES.draft;
                  const diffStyle = DIFFICULTY_STYLES[lab.difficulty] || DIFFICULTY_STYLES.medium;
                  const isLast = i === group.labs.length - 1;

                  return (
                    <div
                      key={lab.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "60px 1fr 110px 160px 70px 90px 1fr 220px",
                        gap: 0,
                        padding: "14px 20px",
                        borderBottom: isLast ? "none" : "1px solid #0f1b33",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "rgba(16,33,63,0.5)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span style={{ color: "#475569", fontSize: 13, fontWeight: 600 }}>
                        {lab.labNumber || "—"}
                      </span>
                      <div>
                        <div
                          style={{
                            color: "#e2e8f0",
                            fontSize: 14,
                            fontWeight: 600,
                            marginBottom: 2,
                          }}
                        >
                          {lab.title || "Untitled Lab"}
                        </div>
                        <div style={{ color: "#475569", fontSize: 11 }}>
                          {lab.starterFiles?.length > 0
                            ? `${lab.starterFiles.length} starter file${lab.starterFiles.length > 1 ? "s" : ""}`
                            : "No files"}
                        </div>
                      </div>
                      <span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            background: statusStyle.bg,
                            color: statusStyle.text,
                            border: `1px solid ${statusStyle.border}`,
                            textTransform: "capitalize",
                          }}
                        >
                          {lab.status}
                        </span>
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        {formatDate(lab.dueDate)}
                      </span>
                      <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                        {lab.points || 0}
                      </span>
                      <span
                        style={{
                          color: diffStyle.text,
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {lab.difficulty || "medium"}
                      </span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(lab.languages || []).slice(0, 3).map((lang) => (
                          <span
                            key={lang}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              background: "rgba(34,211,238,0.1)",
                              color: "#22d3ee",
                              border: "1px solid rgba(34,211,238,0.2)",
                            }}
                          >
                            {lang}
                          </span>
                        ))}
                        {(lab.languages || []).length > 3 && (
                          <span style={{ fontSize: 11, color: "#475569" }}>
                            +{lab.languages.length - 3}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => navigate(`/instructor/labs/${lab.id}/submissions`)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 7,
                            border: "1px solid rgba(34,211,238,0.2)",
                            background: "rgba(34,211,238,0.1)",
                            color: "#22d3ee",
                            fontSize: 12,
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Submissions
                        </button>
                        <button
                          onClick={() => navigate(`/instructor/labs/${lab.id}/edit`)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 7,
                            border: "1px solid #1e3a5f",
                            background: "transparent",
                            color: "#94a3b8",
                            fontSize: 12,
                            cursor: "pointer",
                            fontWeight: 500,
                          }}
                        >
                          Edit
                        </button>
                        {lab.status === "draft" && (
                          <button
                            onClick={() => handleQuickPublish(lab.id)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 7,
                              border: "none",
                              background: "rgba(34,211,238,0.15)",
                              color: "#22d3ee",
                              fontSize: 12,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Publish
                          </button>
                        )}
                        {lab.status === "active" && (
                          <button
                            onClick={() => handleClose(lab.id)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 7,
                              border: "none",
                              background: "rgba(239,68,68,0.12)",
                              color: "#f87171",
                              fontSize: 12,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Close
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(lab.id)}
                          style={{
                            padding: "5px 8px",
                            borderRadius: 7,
                            border: "1px solid rgba(239,68,68,0.2)",
                            background: "transparent",
                            color: "#f87171",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
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
              borderRadius: 16,
              padding: 32,
              width: 380,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 17 }}>
              Delete Lab?
            </h3>
            <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14 }}>
              This action cannot be undone. All lab data including files and
              settings will be permanently deleted.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: "9px 20px",
                  borderRadius: 9,
                  border: "1px solid #1e3a5f",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 14,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: "9px 20px",
                  borderRadius: 9,
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#fff",
                  fontSize: 14,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Delete Lab
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorLayout>
  );
}
