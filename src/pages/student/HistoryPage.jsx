import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

export default function HistoryPage() {
  const navigate = useNavigate();
  const [labs, setLabs]     = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }

    Promise.all([
      api.get("/student/labs"),
      api.get("/progress"),
    ])
      .then(([fetchedLabs, fetchedProgress]) => {
        setLabs(fetchedLabs);
        setProgress(fetchedProgress);
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load history. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // A lab "has history" if the student has started it (version snapshots are only
  // saved by students who've opened the workspace at least once)
  const hasStarted = (labId) => {
    const s = progress[labId]?.status;
    return s && s !== "not_started";
  };

  const fmtDate = (iso) => {
    if (!iso) return "No due date";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch {
      return "No due date";
    }
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{
          borderRadius: 16, border: "1px solid #1a2540",
          background: "#0b1220", padding: "20px 22px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: 8,
          }}>
            Available Labs
          </div>
          <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 700, color: "#e2e8f0" }}>
            Version History
          </h2>
          <p style={{ margin: "8px 0 0", color: "#9fb2ca", fontSize: 13 }}>
            Pick any lab to inspect version snapshots, compare attempts, and
            restore a previous version into your workspace.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#8898b3" }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#f87171" }}>{error}</div>
        ) : labs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#8898b3" }}>
            No labs assigned yet.
          </div>
        ) : (
          <div style={{
            marginTop: 18, display: "grid", gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}>
            {labs.map((lab) => {
              const started = hasStarted(lab.id);
              return (
                <div key={lab.id} style={{
                  background: "#0b1424",
                  border: `1px solid ${started ? "#1f3555" : "#1a2540"}`,
                  borderRadius: 16, padding: 18, minHeight: 170,
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                }}>
                  <div style={{ width: "100%" }}>
                    <div style={{ marginBottom: 12 }} />
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{lab.title}</div>
                    <div style={{ marginTop: 6, color: "#9fb2ca", fontSize: 13 }}>
                      {lab.courseCode || "Lab Assignment"}
                    </div>
                    <div style={{ marginTop: 2, color: "#8aa0bc", fontSize: 12 }}>
                      Due {fmtDate(lab.dueDate)}
                    </div>
                  </div>

                  {started ? (
                    <Link
                      to={`/history/${lab.id}`}
                      style={{
                        marginTop: 16, textDecoration: "none", color: "#e2e8f0",
                        background: "#0369a1", border: "1px solid #0b4f7a",
                        borderRadius: 10, padding: "9px 14px",
                        fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                        alignSelf: "flex-start",
                      }}
                    >
                      Open History
                    </Link>
                  ) : (
                    <button type="button" disabled style={{
                      marginTop: 16, color: "#64748b", background: "#111b31",
                      border: "1px dashed #334155", borderRadius: 10,
                      padding: "9px 14px", fontSize: 12, fontWeight: 700,
                      cursor: "not-allowed", alignSelf: "flex-start",
                    }}>
                      No History Yet
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
