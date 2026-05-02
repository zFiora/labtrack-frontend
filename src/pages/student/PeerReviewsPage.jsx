import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

// ─── Small UI helpers ─────────────────────────────────────────────────────────
function StatusBadge({ text, type = "default" }) {
  const styles = {
    pending:   "bg-yellow-500/20 text-yellow-400",
    completed: "bg-green-500/20 text-green-400",
    available: "bg-cyan-500/20 text-cyan-400",
    default:   "bg-slate-700 text-slate-200",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[type] ?? styles.default}`}>
      {text}
    </span>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-[#111a2e] border border-cyan-500/20 rounded-2xl p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-white mb-5">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function relDue(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "Overdue";
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `Due in ${h}h`;
  return `Due in ${Math.floor(h / 24)}d`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PeerReviewsPage() {
  const navigate = useNavigate();
  const [assigned, setAssigned] = useState([]);
  const [received, setReceived] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }

    api.get("/peer-reviews")
      .then((all) => {
        // Reviews where I am the reviewer → assigned to me
        const myAssigned = all.filter((r) => r.reviewerEmail === user.email);

        // Reviews where I am the owner and someone completed a review → received
        const myReceived = all.filter(
          (r) => r.reviewerEmail !== user.email && r.status === "completed"
        );

        setAssigned(myAssigned);
        setReceived(myReceived);
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load peer reviews. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* Header */}
        <div className="border border-cyan-400 rounded-2xl bg-[#111a2e] px-6 py-5">
          <h1 className="text-3xl font-bold text-white">Peer Reviews</h1>
          <p className="text-slate-400 mt-2">
            View reviews received on your labs and complete reviews assigned by your instructor.
          </p>
        </div>

        {loading && (
          <div className="text-center py-16 text-slate-500">Loading peer reviews…</div>
        )}

        {error && (
          <div className="text-center py-16 text-red-400">{error}</div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* ── Assigned to me ── */}
            <SectionCard title={`Assigned Reviews (${assigned.length})`}>
              {assigned.length === 0 ? (
                <p className="text-slate-500 text-sm">No reviews assigned yet.</p>
              ) : (
                assigned.map((review) => (
                  <div
                    key={review.id}
                    className="bg-[#1a2438] border border-white/5 rounded-xl p-5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {review.labTitle ?? "Lab Review"}
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">Anonymous Submission</p>
                      <p className="text-sm text-slate-500 mt-2">
                        Shared {fmtDate(review.sharedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-3 min-w-[140px]">
                      <StatusBadge
                        text={review.status === "pending" ? "Pending" : "Completed"}
                        type={review.status === "pending" ? "pending" : "completed"}
                      />
                      {review.dueDate && (
                        <span className="text-sm text-yellow-400 font-medium">
                          {relDue(review.dueDate)}
                        </span>
                      )}
                      <button
                        onClick={() => navigate(`/peer-reviews/assigned/${review.id}`)}
                        className="bg-blue-500 hover:bg-blue-600 transition px-4 py-2 rounded-lg text-white font-semibold text-sm"
                      >
                        {review.status === "pending" ? "Open Review" : "View Review"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </SectionCard>

            {/* ── Received on my code ── */}
            <SectionCard title={`Reviews Received (${received.length})`}>
              {received.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  No feedback received yet. Share your code from the lab workspace to request a review.
                </p>
              ) : (
                received.map((review) => {
                  const r = review.review;
                  const avg = r
                    ? ((r.readability + r.efficiency + r.comments) / 3).toFixed(1)
                    : "—";
                  return (
                    <div
                      key={review.id}
                      className="bg-[#1a2438] border border-white/5 rounded-xl p-5 flex items-center justify-between gap-4"
                    >
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {review.labTitle ?? "Lab Review"}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">1 review received</p>
                        <p className="text-sm text-cyan-400 mt-2 font-medium">
                          Average rating: {avg}/5
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-3 min-w-[140px]">
                        <StatusBadge text="Available" type="available" />
                        <button
                          onClick={() => navigate(`/peer-reviews/received/${review.id}`)}
                          className="bg-blue-500 hover:bg-blue-600 transition px-4 py-2 rounded-lg text-white font-semibold text-sm"
                        >
                          View Feedback
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </SectionCard>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}