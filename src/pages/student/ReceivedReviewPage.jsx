import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { api } from "../../utils/api.js";

function renderStars(value) {
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function unwrapReview(payload) {
  return payload?.review ?? payload?.peerReview ?? payload;
}

function getFiles(review) {
  if (Array.isArray(review?.files) && review.files.length > 0) return review.files;
  return Object.keys(review?.fileContents ?? {});
}

function getLineComment(lineComments, file, lineNum, index) {
  return (
    lineComments?.[`${file}:${lineNum}`] ??
    lineComments?.[lineNum] ??
    lineComments?.[index] ??
    null
  );
}

export default function ReceivedReviewPage() {
  const { reviewId } = useParams();
  const navigate = useNavigate();
  const [reviewData, setReviewData] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    api.get(`/peer-reviews/${reviewId}`)
      .then((payload) => {
        if (!alive) return;

        const found = unwrapReview(payload);
        setError(null);
        setReviewData(found);
        setActiveFile(getFiles(found)[0] ?? null);
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load peer review feedback. Please refresh.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [navigate, reviewId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-slate-400">Loading feedback…</div>
      </DashboardLayout>
    );
  }

  if (error || !reviewData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-red-400">
          {error ?? "Peer review feedback was not found."}
        </div>
      </DashboardLayout>
    );
  }

  const r = reviewData.review;
  const average = r
    ? ((r.readability + r.efficiency + r.comments) / 3).toFixed(1)
    : "—";

  const files = getFiles(reviewData);
  const lineComments = r?.lineComments || {};

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="border border-cyan-400 rounded-2xl bg-[#111a2e] px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{reviewData.labTitle} — Feedback</h1>
            <p className="text-slate-400 mt-2">Peer review received on your submission</p>
          </div>
          <div className="bg-cyan-500/20 text-cyan-400 font-bold px-5 py-2 rounded-full text-sm">
            Avg {average}/5
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left — summary */}
          <div className="xl:col-span-2 bg-[#111a2e] border border-white/5 rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4">Feedback Summary</p>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-slate-500">Reviews received</p>
                <p className="text-white font-semibold">1</p>
              </div>
              <div>
                <p className="text-slate-500">Average score</p>
                <p className="text-cyan-400 font-semibold">{average}/5</p>
              </div>
              <div>
                <p className="text-slate-500 mb-2">Files</p>
                <div className="space-y-2">
                  {files.map((file) => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => setActiveFile(file)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                        activeFile === file
                          ? "bg-[#1b2942] text-cyan-400 border border-cyan-500/30"
                          : "bg-[#0f172a] text-slate-300 border border-transparent"
                      }`}
                    >
                      {file}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Center — your code with inline comments */}
          <div className="xl:col-span-5 bg-[#111a2e] border border-white/5 rounded-2xl overflow-hidden">
            <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Your Submission</h2>
              <span className="text-sm text-slate-400">{activeFile}</span>
            </div>
            <div className="p-5">
              <div className="bg-[#09111f] rounded-xl border border-cyan-500/10 min-h-[550px] overflow-x-auto font-mono text-sm">
                {(reviewData.fileContents?.[activeFile] || "").split("\n").map((text, i) => {
                  const lineNum = i + 1;
                  const comment = getLineComment(lineComments, activeFile, lineNum, i);
                  const hasComment = Boolean(comment);
                  return (
                    <div key={lineNum}>
                      <div className={`flex leading-7 ${hasComment ? "bg-yellow-500/10" : "hover:bg-white/5"}`}>
                        <span className="select-none w-10 shrink-0 text-right pr-3 text-slate-600 border-r border-white/5 py-0.5">
                          {lineNum}
                        </span>
                        <span className="flex-1 px-4 py-0.5 text-slate-200 whitespace-pre">
                          {text || " "}
                        </span>
                        {hasComment && (
                          <span className="shrink-0 pr-3 py-0.5 text-yellow-400 text-xs self-center">💬</span>
                        )}
                      </div>
                      {hasComment && (
                        <div className="bg-yellow-500/10 border-l-2 border-yellow-400 mx-4 mb-1 px-3 py-2 rounded-r text-xs text-yellow-200">
                          {comment}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right — review feedback */}
          <div className="xl:col-span-5 bg-[#111a2e] border border-white/5 rounded-2xl p-5">
            <h2 className="text-2xl font-bold text-white mb-6">Classmate Feedback</h2>
            {r ? (
              <div className="bg-[#1a2438] border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-white">Anonymous Reviewer</h3>
                  <span className="text-cyan-400 font-semibold">{average}/5</span>
                </div>
                <div className="space-y-3 text-sm">
                  {[
                    { label: "Code Readability",    val: r.readability },
                    { label: "Algorithm Efficiency", val: r.efficiency  },
                    { label: "Code Comments",        val: r.comments    },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <p className="text-slate-400">{label}</p>
                      <p className="text-yellow-400 text-base">{renderStars(val)}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-slate-400">Strengths</p>
                    <p className="text-white mt-1">{r.strengths}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Areas of Improvement</p>
                    <p className="text-white mt-1">{r.improvements}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Overall Comment</p>
                    <p className="text-white mt-1">{r.overallComment}</p>
                  </div>
                  <p className="text-slate-600 text-xs pt-2">
                    Submitted {new Date(r.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No review submitted yet.</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
