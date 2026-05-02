import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

// ─── Style tokens ─────────────────────────────────────────────────────────────
const accent  = "#22d3ee";
const muted   = "#8898b3";
const dimmed  = "#4a5568";
const success = "#34d399";
const warn    = "#fbbf24";
const danger  = "#f87171";
const border  = "#1a2540";
const card    = "#0b1424";

function isUnlocked(lab) {
  return (lab.solutions?.length ?? 0) > 0;
}

function unlockDate(lab) {
  if (!lab.dueDate) return "";
  const d = new Date(lab.dueDate);
  d.setDate(d.getDate() + 2);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function labTitle(lab) {
  if (lab.labNumber && !String(lab.title ?? "").toLowerCase().startsWith("lab")) {
    return `Lab ${lab.labNumber} - ${lab.title}`;
  }
  return lab.title ?? "Lab";
}

function courseLabel(lab) {
  return [lab.courseCode, lab.sectionNumber ? `SEC ${lab.sectionNumber}` : null].filter(Boolean).join(" - ");
}

function isSubmitted(lab) {
  return Boolean(lab.submittedAt) || ["submitted", "graded"].includes(lab.submissionStatus);
}

function normalizeLab(lab) {
  return {
    ...lab,
    title: labTitle(lab),
    course: courseLabel(lab) || lab.courseTitle || "Course",
    solutions: Array.isArray(lab.solutions) ? lab.solutions : [],
    submitted: isSubmitted(lab),
  };
}

// ─── Syntax helpers ───────────────────────────────────────────────────────────
const KEYWORDS = ["def","class","return","if","else","elif","while","for","in","not","and","or",
  "True","False","None","import","from","pass","self","print","range","len","append","set","while",
  "with","as","try","except","raise","yield","lambda","continue","break","assert","del","global"];

function syntaxHighlight(line) {
  const commentIdx = line.indexOf("#");
  if (commentIdx !== -1) {
    return (
      <>
        {tokenize(line.slice(0, commentIdx))}
        <span style={{ color: "#546e8a" }}>{line.slice(commentIdx)}</span>
      </>
    );
  }
  return tokenize(line);
}

function tokenize(text) {
  return text
    .split(/(\b\w+\b|\[|\]|[(),:.{}=+\-*/<>!"']|\s+)/g)
    .filter(Boolean)
    .map((tok, i) => {
      if (KEYWORDS.includes(tok)) return <span key={i} style={{ color: "#c792ea" }}>{tok}</span>;
      if (/^["'].*["']$/.test(tok)) return <span key={i} style={{ color: "#c3e88d" }}>{tok}</span>;
      if (/^\d+$/.test(tok)) return <span key={i} style={{ color: "#f78c6c" }}>{tok}</span>;
      return <span key={i}>{tok}</span>;
    });
}

function buildDiff(refCode, studentCode) {
  const refLines     = refCode.split("\n");
  const studentLines = studentCode.split("\n");
  const len = Math.max(refLines.length, studentLines.length);
  const diff = [];
  for (let i = 0; i < len; i++) {
    const r = refLines[i];
    const s = studentLines[i];
    if (r === s) {
      if (r !== undefined) diff.push({ type: "same", text: r });
    } else {
      if (r !== undefined) diff.push({ type: "added",   text: r });
      if (s !== undefined) diff.push({ type: "removed", text: s });
    }
  }
  return diff;
}

// ─── Code viewer ──────────────────────────────────────────────────────────────
function CodeViewer({ code, diffWith, downloadName }) {
  const lines = code.split("\n");
  const diffLines = diffWith ? buildDiff(code, diffWith) : null;

  function handleDownload() {
    const blob = new Blob([code], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = downloadName ?? "solution.py";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ background: "#070d1a", border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${border}`, background: "#0a1220" }}>
        <span style={{ fontSize: 11, color: muted, fontFamily: "monospace" }}>
          {downloadName ?? "solution.py"} · {lines.length} lines
        </span>
        <button type="button" onClick={handleDownload} style={{
          background: "rgba(34,211,238,0.08)", border: `1px solid ${accent}33`,
          borderRadius: 6, color: accent, fontSize: 11, fontWeight: 600,
          padding: "4px 12px", cursor: "pointer",
        }}>⬇ Download</button>
      </div>

      {/* code */}
      <div style={{ overflowY: "auto", maxHeight: 480, padding: "14px 0" }}>
        {diffLines ? (
          diffLines.map((dl, i) => {
            const bgColor = dl.type === "added" ? "rgba(52,211,153,0.08)" : dl.type === "removed" ? "rgba(248,113,113,0.08)" : "transparent";
            const prefix  = dl.type === "added" ? "+" : dl.type === "removed" ? "−" : " ";
            const prefixColor = dl.type === "added" ? success : dl.type === "removed" ? danger : dimmed;
            return (
              <div key={i} style={{ display: "flex", background: bgColor, minHeight: 20 }}>
                <span style={{ width: 24, textAlign: "center", fontSize: 12, color: prefixColor, flexShrink: 0, userSelect: "none", fontFamily: "monospace" }}>{prefix}</span>
                <pre style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "#cdd6f4", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1, paddingRight: 12 }}>
                  {syntaxHighlight(dl.text)}
                </pre>
              </div>
            );
          })
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ display: "flex", minHeight: 20 }}>
              <span style={{ width: 36, textAlign: "right", paddingRight: 12, fontSize: 11, color: dimmed, flexShrink: 0, userSelect: "none", fontFamily: "monospace" }}>{i + 1}</span>
              <pre style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "#cdd6f4", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1, paddingRight: 12 }}>
                {syntaxHighlight(line)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Lab selector card ────────────────────────────────────────────────────────
function LabCard({ lab, onClick }) {
  const unlocked = isUnlocked(lab);
  const dueDate = lab.dueDate ? new Date(lab.dueDate) : null;

  return (
    <div style={{
      background: card,
      border: `1px solid ${unlocked ? "#1f3555" : border}`,
      borderRadius: 16,
      padding: 18,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      minHeight: 160,
    }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{lab.title}</div>
          <span style={{
            background: unlocked ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
            color: unlocked ? success : danger,
            border: `1px solid ${unlocked ? success : danger}33`,
            borderRadius: 6, fontSize: 10, fontWeight: 700,
            padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
          }}>
            {unlocked ? "Available" : lab.submitted ? "Pending" : "Not Submitted"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: muted }}>{lab.course}</div>
        <div style={{ fontSize: 12, color: dimmed, marginTop: 4 }}>
          Deadline: {dueDate ? dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not scheduled"}
        </div>
        {!unlocked && lab.submitted && (
          <div style={{ fontSize: 11, color: warn, marginTop: 6 }}>
            Solutions unlock on {unlockDate(lab)}
          </div>
        )}
        {!lab.submitted && (
          <div style={{ fontSize: 11, color: danger, marginTop: 6 }}>
            You must submit the lab to view solutions
          </div>
        )}
      </div>

      {unlocked ? (
        <button type="button" onClick={onClick} style={{
          marginTop: 14, background: "#0369a1", border: "1px solid #0b4f7a",
          borderRadius: 10, color: "#e2e8f0", fontSize: 12, fontWeight: 700,
          padding: "9px 14px", cursor: "pointer", alignSelf: "flex-start",
        }}>
          View Reference Solutions
        </button>
      ) : (
        <button type="button" disabled style={{
          marginTop: 14, background: "#111b31", border: "1px dashed #334155",
          borderRadius: 10, color: "#64748b", fontSize: 12, fontWeight: 700,
          padding: "9px 14px", cursor: "not-allowed", alignSelf: "flex-start",
        }}>
          {lab.submitted ? `Unlocks ${unlockDate(lab)}` : "Submit Lab First"}
        </button>
      )}
    </div>
  );
}

// ─── Solutions viewer ─────────────────────────────────────────────────────────
const SOLUTION_ICONS = {
  instructor: "ðŸŽ“",
  top_student: "ðŸ†",
  own: "ðŸ‘¤",
};

function filesToCode(files) {
  if (!files || typeof files !== "object") return "";
  return Object.entries(files)
    .map(([filename, content]) => `# ${filename}\n${content}`)
    .join("\n\n");
}

function solutionAuthor(solution) {
  if (solution.type === "top_student") return "Student (anonymised)";
  if (solution.type === "own") return "You";
  return "Instructor";
}

function solutionDescription(solution) {
  if (solution.explanation) return solution.explanation;
  if (solution.type === "top_student") return "High-scoring student reference solution.";
  if (solution.type === "own") return "Your submitted code for side-by-side comparison.";
  return "Instructor reference solution.";
}

function solutionToTab(solution) {
  return {
    id: solution.id ?? solution.type,
    type: solution.type,
    label: solution.title ?? (solution.type === "top_student" ? "Top Student Solution" : "Instructor Solution"),
    author: solutionAuthor(solution),
    description: solutionDescription(solution),
    code: filesToCode(solution.files),
    filename: Object.keys(solution.files ?? {})[0] ?? "solution.py",
    mistakes: solution.mistakes ?? [],
  };
}

function solutionTabs(lab) {
  const apiSolutions = (lab.solutions ?? []).map(solutionToTab);
  const ownFiles = lab.studentSolution?.files ?? lab.submission?.files;
  if (!ownFiles) return apiSolutions;
  return [
    ...apiSolutions,
    solutionToTab({ id: "own", type: "own", title: "Your Submission", files: ownFiles }),
  ];
}

function SolutionsViewer({ lab, onBack }) {
  const tabs = solutionTabs(lab);
  const [activeTab, setActiveTab]   = useState(tabs[0]?.id ?? "");
  const [showDiff, setShowDiff]     = useState(false);
  const [toast, setToast]           = useState("");

  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const ownCode = tabs.find((tab) => tab.type === "own")?.code;
  const refCode = current?.code ?? "";
  const diffCode = (showDiff && current?.type !== "own" && ownCode) ? ownCode : null;

  if (!current) return null;

  const TAB_LABELS = {
    instructor:  { label: "Instructor Solution", icon: "🎓" },
    top_student: { label: "Top Student",          icon: "🏆" },
    own:         { label: "Your Submission",      icon: "👤" },
  };

  function handleDownload() {
    const blob = new Blob([current.code], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${lab.title.replace(/\s/g, "_")}_${current.type}.py`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Solution downloaded successfully");
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <div>
      {/* Back header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button type="button" onClick={onBack} style={{
          background: "transparent", border: `1px solid ${border}`,
          borderRadius: 8, color: muted, fontSize: 12, fontWeight: 600,
          padding: "7px 14px", cursor: "pointer",
        }}>← Back</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{lab.title}</div>
          <div style={{ fontSize: 12, color: muted }}>{lab.course} · Reference Solutions</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "#0a1628", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setShowDiff(false); }} style={{
            background: activeTab === tab.id ? card : "transparent",
            border: activeTab === tab.id ? `1px solid ${border}` : "1px solid transparent",
            borderRadius: 9, padding: "8px 16px", cursor: "pointer",
            color: activeTab === tab.id ? "#e2e8f0" : muted, fontSize: 13, fontWeight: 600,
          }}>
            {TAB_LABELS[tab.type]?.icon ?? SOLUTION_ICONS[tab.type] ?? "ðŸ“„"} {tab.label}
          </button>
        ))}
      </div>

      {/* Solution meta card */}
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{current.label}</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>by {current.author}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{current.description}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {current.type !== "own" && ownCode && (
            <button type="button" onClick={() => setShowDiff(!showDiff)} style={{
              background: showDiff ? "rgba(251,191,36,0.12)" : "transparent",
              border: `1px solid ${showDiff ? warn : border}`,
              borderRadius: 8, color: showDiff ? warn : muted, fontSize: 12, fontWeight: 600,
              padding: "7px 14px", cursor: "pointer",
            }}>
              {showDiff ? "Hide Diff" : "Diff with My Code"}
            </button>
          )}
          <button type="button" onClick={handleDownload} style={{
            background: "rgba(34,211,238,0.08)", border: `1px solid ${accent}33`,
            borderRadius: 8, color: accent, fontSize: 12, fontWeight: 600,
            padding: "7px 14px", cursor: "pointer",
          }}>⬇ Download</button>
        </div>
      </div>

      {/* Diff legend */}
      {showDiff && (
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: muted }}>
          <span><span style={{ color: success, fontWeight: 700 }}>+</span> Reference solution line</span>
          <span><span style={{ color: danger, fontWeight: 700 }}>−</span> Your code line (differs)</span>
          <span><span style={{ color: dimmed }}>·</span> Identical lines</span>
        </div>
      )}

      {/* Code viewer */}
      <CodeViewer
        code={refCode}
        diffWith={diffCode}
        downloadName={`${lab.title.replace(/[^a-z0-9]/gi, "_")}_${current.type}.py`}
      />

      {/* Common mistakes */}
      {current.mistakes?.length > 0 && (
        <div style={{ background: "rgba(251,191,36,0.05)", border: `1px solid ${warn}33`, borderRadius: 14, padding: "18px 20px", marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: warn, marginBottom: 12 }}>⚠ Common Mistakes</div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {current.mistakes.map((m, i) => (
              <li key={i} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 999,
          background: card, border: `1px solid ${success}`, borderRadius: 12,
          padding: "12px 20px", color: success, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>{toast}</div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ReferenceSolutionsPage() {
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }

    api.get("/student/labs")
      .then((labList) => Promise.all(
        labList.map((lab) => api.get(`/student/labs/${lab.id}`).then((detail) => normalizeLab({ ...lab, ...detail })))
      ))
      .then((details) => {
        const sorted = [...details].sort((a, b) => {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return da - db;
        });
        setLabs(sorted);
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setError("Failed to load reference solutions. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {!selectedLab ? (
          <>
            {/* Header */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: "20px 24px", marginBottom: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>
                Reference Solutions
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>Solution Library</h2>
              <p style={{ margin: "8px 0 0", color: "#9fb2ca", fontSize: 13 }}>
                Instructor and top-student solutions become available 2 days after each lab deadline.
                You must submit a lab before viewing its solutions.
              </p>
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "56px 0", color: muted }}>
                Loading reference solutionsâ€¦
              </div>
            )}

            {error && (
              <div style={{ textAlign: "center", padding: "56px 0", color: danger }}>
                {error}
              </div>
            )}

            {!loading && !error && labs.length === 0 && (
              <div style={{ textAlign: "center", padding: "56px 0", color: muted }}>
                No labs are available yet.
              </div>
            )}

            {!loading && !error && labs.length > 0 && (
              <>
            {/* Info bar */}
            <div style={{
              display: "flex", gap: 16, marginBottom: 20,
              background: "rgba(34,211,238,0.04)", border: `1px solid ${accent}22`,
              borderRadius: 12, padding: "12px 18px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: success, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: muted }}><span style={{ color: success, fontWeight: 700 }}>Available</span> — deadline + 2 days passed</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: warn, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: muted }}><span style={{ color: warn, fontWeight: 700 }}>Pending</span> — submitted, grace period not over</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: danger, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: muted }}><span style={{ color: danger, fontWeight: 700 }}>Not Submitted</span> — must submit to unlock</span>
              </div>
            </div>

            {/* Lab cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {labs.map((lab) => (
                <LabCard key={lab.id} lab={lab} onClick={() => setSelectedLab(lab)} />
              ))}
            </div>
              </>
            )}
          </>
        ) : (
          <SolutionsViewer lab={selectedLab} onBack={() => setSelectedLab(null)} />
        )}
      </div>
    </DashboardLayout>
  );
}
