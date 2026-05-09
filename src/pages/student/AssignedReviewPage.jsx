import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { api } from "../../utils/api";

function starRatingWidget(label, value, onChange, readonly) {
  return (
    <div>
      <p className="text-white font-semibold mb-2">{label}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => { if (!readonly) onChange(star); }}
            className={`text-3xl transition ${star <= value ? "text-yellow-400" : "text-slate-500"} ${readonly ? "cursor-default" : "hover:text-yellow-300"}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function lineBackground(hasComment, isActive) {
  if (hasComment) return "bg-yellow-500/10";
  if (isActive)   return "bg-cyan-500/10";
  return "hover:bg-white/5";
}

export default function AssignedReviewPage() {
  const { reviewId } = useParams();
  const navigate = useNavigate();

  const [review, setReview]               = useState(null);
  const [activeFile, setActiveFile]       = useState(null);
  const [readability, setReadability]     = useState(0);
  const [efficiency, setEfficiency]       = useState(0);
  const [commentsRating, setCommentsRating] = useState(0);
  const [strengths, setStrengths]         = useState("");
  const [improvements, setImprovements]   = useState("");
  const [overallComment, setOverallComment] = useState("");
  const [submitted, setSubmitted]         = useState(false);
  const [lineComments, setLineComments]   = useState({});
  const [activeCommentLine, setActiveCommentLine] = useState(null);
  const [commentDraft, setCommentDraft]   = useState("");

  useEffect(() => {
    api.get(`/peer-reviews/${reviewId}`)
      .then((data) => {
        // Normalise files to an array of name strings
        const fileList = (data.files || []).map((f) => f.filename || f).filter(Boolean);
        const firstName = fileList[0] || "submission";
        // fileContents is stored as JSON-stringified map; fall back to plain string for old records
        let contentsMap;
        try {
          const parsed = JSON.parse(data.fileContents || "{}");
          contentsMap = typeof parsed === "object" && parsed !== null ? parsed : { [firstName]: data.fileContents || "" };
        } catch {
          contentsMap = { [firstName]: data.fileContents || "" };
        }

        const normalised = {
          ...data,
          labTitle: data.labId?.title || "Lab",
          sharedAt: data.createdAt,
          files: fileList,
          fileContents: contentsMap,
        };
        setReview(normalised);
        setActiveFile(firstName);

        // Pre-fill form if already submitted
        if (data.status === "submitted") {
          setReadability(data.readability || 0);
          setEfficiency(data.efficiency || 0);
          setCommentsRating(typeof data.comments === "number" ? data.comments : 0);
          setStrengths(data.strengths || "");
          setImprovements(data.improvements || "");
          setOverallComment(data.overallComment || "");
          // lineComments stored as [{line, comment}] — convert to {lineIdx: text}
          const map = {};
          (data.lineComments || []).forEach(({ line, comment }) => { map[line] = comment; });
          setLineComments(map);
          setSubmitted(true);
        }
      })
      .catch(() => setReview(null));
  }, [reviewId]);

  if (!review) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-slate-400">Loading review…</div>
      </DashboardLayout>
    );
  }

  const isCompleted = review.status === "completed";
  const code = review.fileContents?.[activeFile] || "";
  // Annotated lines give each line a stable 1-based lineNum so we don't use
  // the raw array index as the React key (satisfies S6479).
  const annotatedLines = code.split("\n").map((text, i) => ({ text, lineNum: i + 1 }));

  const isFormValid =
    readability > 0 &&
    efficiency > 0 &&
    commentsRating > 0 &&
    strengths.trim().length >= 10 &&
    improvements.trim().length >= 10 &&
    overallComment.trim().length >= 10;

  const handleSubmit = async () => {
    if (!isFormValid || submitted) return;

    const lineCommentsArray = Object.entries(lineComments).map(([lineIdx, text]) => ({
      line: Number(lineIdx),
      comment: text,
    }));

    try {
      await api.post(`/peer-reviews/${reviewId}/submit`, {
        readability,
        efficiency,
        comments: commentsRating,
        strengths: strengths.trim(),
        improvements: improvements.trim(),
        overallComment: overallComment.trim(),
        lineComments: lineCommentsArray,
        submittedAt: new Date().toISOString(),
      });
      setSubmitted(true);
      setTimeout(() => navigate("/peer-review"), 1500);
    } catch (e) {
      console.warn("Could not submit review", e);
    }
  };

  const handleSaveComment = (lineIdx) => {
    const text = commentDraft.trim();
    if (text.length > 0) {
      setLineComments((prev) => ({ ...prev, [lineIdx]: text }));
    }
    setActiveCommentLine(null);
    setCommentDraft("");
  };

  const handleRemoveComment = (lineIdx) => {
    setLineComments((prev) => {
      const next = { ...prev };
      delete next[lineIdx];
      return next;
    });
  };

  const handleLineClick = (lineIdx) => {
    if (isCompleted) return;
    if (activeCommentLine === lineIdx) {
      setActiveCommentLine(null);
      setCommentDraft("");
    } else {
      setActiveCommentLine(lineIdx);
      setCommentDraft(lineComments[lineIdx] || "");
    }
  };

  const handleLineKeyDown = (e, lineIdx) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleLineClick(lineIdx);
    }
  };

  const relDue = () => {
    const ms = new Date(review.dueDate).getTime() - Date.now();
    if (ms < 0) return "Overdue";
    const h = Math.floor(ms / 3600000);
    if (h < 24) return `Due in ${h}h`;
    return `Due in ${Math.floor(h / 24)}d`;
  };

  const commentCount = Object.keys(lineComments).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="border border-cyan-400 rounded-2xl bg-[#111a2e] px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{review.labTitle} — Peer Review</h1>
            <p className="text-slate-400 mt-2">Anonymous Submission · {review.testsPassed} tests passed</p>
          </div>
          <div className={`font-bold px-5 py-2 rounded-full text-sm ${isCompleted ? "bg-green-500/20 text-green-400" : "bg-yellow-500 text-black"}`}>
            {isCompleted ? "Completed" : relDue()}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left — file list */}
          <div className="xl:col-span-2 bg-[#111a2e] border border-white/5 rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4">Files</p>
            <div className="space-y-2">
              {review.files?.map((file) => (
                <button
                  key={file}
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
            <div className="mt-6 space-y-3 text-sm">
              <div>
                <p className="text-slate-500">Submitted</p>
                <p className="text-white font-medium">
                  {new Date(review.sharedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tests</p>
                <p className="text-green-400 font-semibold">{review.testsPassed}</p>
              </div>
              {commentCount > 0 && (
                <div>
                  <p className="text-slate-500">Line Comments</p>
                  <p className="text-yellow-400 font-semibold">{commentCount}</p>
                </div>
              )}
            </div>
          </div>

          {/* Center — interactive code */}
          <div className="xl:col-span-6 bg-[#111a2e] border border-white/5 rounded-2xl overflow-hidden">
            <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white">Submission to Review</h2>
                {commentCount > 0 && (
                  <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-1 rounded-full">
                    {commentCount} comment{commentCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <span className="text-sm text-slate-400">
                {isCompleted ? activeFile : `${activeFile} · Click a line to comment`}
              </span>
            </div>
            <div className="p-5">
              <div className="bg-[#09111f] rounded-xl border border-cyan-500/10 min-h-[550px] overflow-x-auto font-mono text-sm">
                {annotatedLines.map(({ text, lineNum }) => {
                  const lineIdx    = lineNum - 1;
                  const hasComment = Boolean(lineComments[lineIdx]);
                  const isActive   = activeCommentLine === lineIdx;
                  const bg         = lineBackground(hasComment, isActive);

                  return (
                    <div key={lineNum}>
                      <button
                        type="button"
                        tabIndex={isCompleted ? -1 : 0}
                        onClick={() => handleLineClick(lineIdx)}
                        onKeyDown={(e) => handleLineKeyDown(e, lineIdx)}
                        className={`flex group leading-7 w-full text-left ${isCompleted ? "" : "cursor-pointer"} ${bg}`}
                      >
                        <span className="select-none w-10 shrink-0 text-right pr-3 text-slate-600 border-r border-white/5 py-0.5">
                          {lineNum}
                        </span>
                        <span className="flex-1 px-4 py-0.5 text-slate-200 whitespace-pre">
                          {text || " "}
                        </span>
                        {hasComment && (
                          <span className="shrink-0 pr-3 py-0.5 text-yellow-400 text-xs self-center">💬</span>
                        )}
                        {hasComment || isCompleted ? null : (
                          <span className="shrink-0 pr-3 py-0.5 text-slate-700 text-xs self-center opacity-0 group-hover:opacity-100 transition">
                            + comment
                          </span>
                        )}
                      </button>

                      {/* Existing comment — shown when not editing */}
                      {hasComment && !isActive && (
                        <div className="bg-yellow-500/10 border-l-2 border-yellow-400 mx-4 mb-1 px-3 py-2 rounded-r text-xs text-yellow-200 flex items-start justify-between gap-2">
                          <span>{lineComments[lineIdx]}</span>
                          {isCompleted ? null : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleRemoveComment(lineIdx); }}
                              className="text-yellow-500 hover:text-red-400 shrink-0"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}

                      {/* Inline comment input */}
                      {isActive && (
                        <div className="bg-[#0f172a] border-l-2 border-cyan-400 mx-4 mb-1 p-3 rounded-r">
                          <textarea
                            autoFocus
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveComment(lineIdx);
                              } else if (e.key === "Escape") {
                                setActiveCommentLine(null);
                                setCommentDraft("");
                              }
                            }}
                            placeholder="Add a comment… (Enter to save, Esc to cancel)"
                            className="w-full bg-[#09111f] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white outline-none resize-none min-h-[60px]"
                          />
                          <div className="flex gap-2 mt-2 justify-end">
                            <button
                              type="button"
                              onClick={() => { setActiveCommentLine(null); setCommentDraft(""); }}
                              className="text-xs text-slate-500 hover:text-white px-2 py-1"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveComment(lineIdx)}
                              className="text-xs bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-1 rounded font-semibold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right — review form */}
          <div className="xl:col-span-4 bg-[#111a2e] border border-white/5 rounded-2xl p-5">
            <h2 className="text-2xl font-bold text-white mb-6">
              {isCompleted ? "Your Review" : "Write Review"}
            </h2>
            <div className="space-y-6">
              {starRatingWidget("Code Readability",    readability,    setReadability,    isCompleted)}
              {starRatingWidget("Algorithm Efficiency", efficiency,     setEfficiency,     isCompleted)}
              {starRatingWidget("Code Comments",        commentsRating, setCommentsRating, isCompleted)}

              {[
                { label: "Strengths (min 10 chars)",            val: strengths,      set: setStrengths,      ph: "What did the student do well?" },
                { label: "Areas of Improvement (min 10 chars)", val: improvements,   set: setImprovements,   ph: "What can be improved?" },
                { label: "Overall Comment (min 10 chars)",       val: overallComment, set: setOverallComment, ph: "Your final feedback…" },
              ].map(({ label, val, set, ph }) => (
                <div key={label}>
                  <label className="block text-white font-semibold mb-2">{label}</label>
                  <textarea
                    value={val}
                    onChange={(e) => { if (!isCompleted) set(e.target.value); }}
                    readOnly={isCompleted}
                    className="w-full min-h-[80px] bg-[#1a2438] border border-white/5 rounded-xl px-4 py-3 text-white outline-none resize-none"
                    placeholder={isCompleted ? "" : ph}
                  />
                </div>
              ))}

              {isCompleted ? null : (
                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid || submitted}
                  className={`w-full py-3 rounded-xl font-bold text-lg transition ${
                    !isFormValid || submitted
                      ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {submitted ? "Review Submitted ✓" : "Submit Review"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
