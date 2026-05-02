import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SideBar from "../../components/layout/SideBar";
import TopBar from "../../components/layout/TopBar";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

const KEYWORDS = [
  "def", "class", "return", "if", "else", "elif", "while", "for", "in",
  "not", "and", "or", "True", "False", "None", "import", "from", "pass",
  "self", "print", "range", "len", "append",
];

const RUNNABLE_EXTENSIONS_BY_LANGUAGE = {
  python: ["py"],
  javascript: ["js"],
  typescript: ["ts"],
  java: ["java"],
  c: ["c"],
  "c++": ["cpp", "cc", "cxx"],
  cpp: ["cpp", "cc", "cxx"],
  go: ["go"],
  rust: ["rs"],
};

function normalizeLanguage(language) {
  const value = String(language || "python").trim().toLowerCase();
  if (value === "c++") return "cpp";
  return value;
}

function labLanguages(lab) {
  if (Array.isArray(lab?.languages) && lab.languages.length > 0) return lab.languages;
  if (lab?.language) return [lab.language];
  return ["python"];
}

function displayLanguages(lab) {
  return labLanguages(lab).join(", ");
}

function defaultFileForLab(lab) {
  const language = normalizeLanguage(labLanguages(lab)[0]);
  if (language === "javascript") return "solution.js";
  if (language === "typescript") return "solution.ts";
  if (language === "java") return "Main.java";
  if (language === "c") return "solution.c";
  if (language === "cpp") return "solution.cpp";
  if (language === "go") return "solution.go";
  if (language === "rust") return "solution.rs";
  return "solution.py";
}

function languageForFile(lab, fileName) {
  const ext = fileName ? getFileExtension(fileName) : "";
  const languages = labLanguages(lab);
  const byExtension = languages.find((language) => {
    const normalized = normalizeLanguage(language);
    return RUNNABLE_EXTENSIONS_BY_LANGUAGE[normalized]?.includes(ext);
  });
  return normalizeLanguage(byExtension || languages[0]);
}

function isRunnableForLab(lab, fileName) {
  const ext = fileName ? getFileExtension(fileName) : "";
  return labLanguages(lab).some((language) => {
    const normalized = normalizeLanguage(language);
    return RUNNABLE_EXTENSIONS_BY_LANGUAGE[normalized]?.includes(ext);
  });
}

function pickStarterFile(files, lab) {
  return (
    files.find((file) => file.toLowerCase().includes("solution") && isRunnableForLab(lab, file)) ||
    files.find((file) => isRunnableForLab(lab, file)) ||
    files[0]
  );
}

function getFileExtension(fileName) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function syntaxHighlight(line) {
  const commentIdx = line.indexOf("#");
  if (commentIdx !== -1) {
    const before = line.slice(0, commentIdx);
    const comment = line.slice(commentIdx);
    return (
      <>
        {tokenize(before)}
        <span style={{ color: "#546e8a" }}>{comment}</span>
      </>
    );
  }
  return tokenize(line);
}

function tokenize(text) {
  const tokens = text
    .split(/(\b\w+\b|\[|\]|[(),:.{}=+\-*/<>!"']|\s+)/g)
    .filter(Boolean);
  return tokens.map((tok, i) => {
    if (KEYWORDS.includes(tok))
      return <span key={i} style={{ color: "#c792ea" }}>{tok}</span>;
    if (/^["'].*["']$/.test(tok))
      return <span key={i} style={{ color: "#c3e88d" }}>{tok}</span>;
    if (/^\d+$/.test(tok))
      return <span key={i} style={{ color: "#f78c6c" }}>{tok}</span>;
    return <span key={i}>{tok}</span>;
  });
}

function buildInitialFileContents(files, starterCode, lab) {
  const defaultTextByType = {
    py: "# Add your Python notes or helper code here\n",
    js: "// Start writing here.\n",
    java: "// Start writing here.\n",
    c: "/* Start writing here. */\n",
    cpp: "// Start writing here.\n",
    go: "// Start writing here.\n",
    rs: "// Start writing here.\n",
    md: "# Notes\n\nWrite your lab notes for this file here.\n",
  };
  const starterFile = pickStarterFile(files, lab);

  return files.reduce((acc, fileName) => {
    const lowerName = fileName.toLowerCase();
    if (fileName === starterFile && starterCode) {
      acc[fileName] = starterCode;
      return acc;
    }

    const ext = lowerName.split(".").pop();
    if (defaultTextByType[ext]) {
      acc[fileName] = `${defaultTextByType[ext]}`;
      return acc;
    }

    acc[fileName] = "";
    return acc;
  }, {});
}

function normalizeLabFileEntry(file) {
  if (typeof file === "string") return { name: file, content: "" };
  const name = file?.name || file?.fileName || file?.filename;
  return {
    name,
    content: typeof file?.content === "string" ? file.content : "",
  };
}

function getLabFileEntries(lab) {
  const byName = new Map();
  const add = (file) => {
    const entry = normalizeLabFileEntry(file);
    if (!entry.name) return;
    const existing = byName.get(entry.name);
    if (!existing || (!existing.content && entry.content)) byName.set(entry.name, entry);
  };

  (lab?.starterFiles || []).forEach(add);
  (lab?.supportingFiles || []).forEach(add);
  (lab?.files || []).forEach(add);
  return Array.from(byName.values());
}

function findProgressForLab(progressData, labId) {
  if (Array.isArray(progressData?.progress)) {
    return findProgressForLab(progressData.progress, labId);
  }
  const entries = Array.isArray(progressData)
    ? progressData
    : Object.values(progressData || {});
  return entries.find((entry) => String(entry?.labId ?? entry?.id) === String(labId)) ?? null;
}

function getSubmissionPayload(data) {
  return data?.submission ?? data;
}

function normalizeTestResult(result, index) {
  const status =
    result?.status ||
    (typeof result?.passed === "boolean" ? (result.passed ? "pass" : "fail") : "pending");
  const name = result?.name || result?.description || `Test ${index + 1}`;
  const points = result?.points ?? result?.maxPoints ?? 0;

  return {
    ...result,
    id: result?.id || result?.testCaseId || `test-${index + 1}`,
    name,
    description: result?.description || name,
    status,
    passed: result?.passed ?? status === "pass",
    points,
    earned: result?.earned ?? result?.earnedPoints ?? (status === "pass" ? points : 0),
    visible: result?.visible !== false,
  };
}

function normalizeTestResults(results = []) {
  return results.map((result, index) => normalizeTestResult(result, index));
}

function buildRunOutput(result, results) {
  if (!results.length) return "No test cases are configured for this lab.";

  const passedCount = result?.passed ?? results.filter((test) => test.status === "pass").length;
  const totalCount = result?.total ?? results.length;
  const lines = [`${passedCount}/${totalCount} test cases passed.`];

  results
    .filter((test) => test.visible !== false)
    .forEach((test) => {
      const icon = test.status === "pass"
        ? "PASS"
        : test.status === "fail"
          ? "FAIL"
          : test.status === "error"
            ? "ERROR"
            : "PENDING";
      lines.push(`${icon} ${test.name}`);
      if ((test.status === "fail" || test.status === "error") && (test.expectedOutput !== undefined || test.actualOutput !== undefined)) {
        lines.push(`  Expected: ${test.expectedOutput ?? ""}`);
        lines.push(`  Actual: ${test.actualOutput ?? ""}`);
      }
    });

  return lines.join("\n");
}

function buildNewFileContent(fileName) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".py")) return `# ${fileName}\n\n# Start writing here.\n`;
  if (lowerName.endsWith(".md")) return `# ${fileName}\n\nStart writing here.\n`;
  return "";
}

function resolveUniqueFileName(candidateName, existingNames, currentName) {
  const trimmed = candidateName.trim();
  if (!trimmed) return "";
  if (trimmed === currentName) return trimmed;
  if (!existingNames.includes(trimmed)) return trimmed;

  let suffix = 2;
  let nextName = `${trimmed} ${suffix}`;
  while (existingNames.includes(nextName)) {
    suffix += 1;
    nextName = `${trimmed} ${suffix}`;
  }
  return nextName;
}

function sidebarFileIcon(name) {
  if (name.endsWith(".py"))   return "🐍";
  if (name.endsWith(".md"))   return "📄";
  if (name.endsWith(".java")) return "☕";
  if (name.endsWith(".html")) return "🌐";
  if (name.endsWith(".css"))  return "🎨";
  if (name.endsWith(".jsx"))  return "⚛️";
  if (name.endsWith(".js"))   return "🟨";
  return "📋";
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LabWorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { labId } = useParams();
  const restoredSnapshot = location.state?.restoredSnapshot;

  // ── API state ────────────────────────────────────────────────────────────
  const [lab, setLab]           = useState(null);
  const [labLoading, setLabLoading] = useState(true);
  const [labError, setLabError] = useState(null);

  // ── Editor state ─────────────────────────────────────────────────────────
  const [files, setFiles]             = useState([]);
  const [openFiles, setOpenFiles]     = useState([]);
  const [activeFile, setActiveFile]   = useState(null);
  const [fileContents, setFileContents] = useState({});
  const [testResults, setTestResults] = useState([]);
  const [consoleTranscript, setConsoleTranscript] = useState("");
  const [consolePromptInput, setConsolePromptInput] = useState("");
  const [consolePendingRun, setConsolePendingRun] = useState(null);
  const consoleRef = useRef(null);
  const [consoleMeta, setConsoleMeta] = useState(null);
  const [isRunning, setIsRunning]     = useState(false);
  const [showSubmit, setShowSubmit]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [filePendingDelete, setFilePendingDelete] = useState(null);
  const [submitted, setSubmitted]     = useState(false);
  const [progressStatus, setProgressStatus] = useState("not_started");
  const [saveState, setSaveState] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionDesc, setVersionDesc] = useState("");
  const [versionDescErr, setVersionDescErr] = useState("");
  const [versionToast, setVersionToast] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail]   = useState("");
  const [shareEmailErr, setShareEmailErr] = useState("");
  const [shareToast, setShareToast]   = useState("");
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [descCollapsed, setDescCollapsed] = useState(false);
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [renamingFile, setRenamingFile] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [hoveredFile, setHoveredFile] = useState(null);
  const [hoveredSidebarFile, setHoveredSidebarFile] = useState(null);
  const [draggedTab, setDraggedTab]   = useState(null);
  const [dragOverTab, setDragOverTab] = useState(null);
  const initialLoadCompleteRef = useRef(false);
  const autoSaveTimerRef = useRef(null);
  const lastSavedCodeRef = useRef("");

  // ── Load lab + existing submission ────────────────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { navigate("/"); return; }
    initialLoadCompleteRef.current = false;

    Promise.all([
      api.get(`/student/labs/${labId}`),
      api.get(`/student/submissions/${labId}`).catch((err) => {
        if (err.status === 404) return null;
        throw err;
      }),
      api.get("/progress").catch(() => null),
    ])
      .then(([labData, submissionData, progressData]) => {
        const submission = getSubmissionPayload(submissionData);
        const progress = findProgressForLab(progressData, labId);
        setLab(labData);

        const labFileEntries = getLabFileEntries(labData);
        const labFileNames = labFileEntries.map((file) => file.name);
        const labSeedContents = labFileEntries.reduce((acc, file) => {
          if (typeof file.content === "string" && file.content.length > 0) {
            acc[file.name] = file.content;
          }
          return acc;
        }, {});
        const submissionFiles =
          submission?.files && typeof submission.files === "object"
            ? Object.keys(submission.files)
            : [];
        const progressFiles =
          progress?.files && typeof progress.files === "object"
            ? Object.keys(progress.files)
            : [];
        const labFiles = Array.from(new Set([
          ...(labFileNames.length ? labFileNames : [defaultFileForLab(labData)]),
          ...submissionFiles,
          ...progressFiles,
        ]));
        const starterCode = labData.starterCode ?? "";
        const solutionFile = pickStarterFile(labFiles, labData);

        const contents = {
          ...buildInitialFileContents(labFiles, starterCode, labData),
          ...labSeedContents,
          ...(progress?.files && typeof progress.files === "object" ? progress.files : {}),
          ...(submission?.files && typeof submission.files === "object" ? submission.files : {}),
        };

        // Restored snapshot takes priority over saved submission
        if (
          restoredSnapshot &&
          String(restoredSnapshot.labId) === String(labId) &&
          typeof restoredSnapshot.code === "string"
        ) {
          contents[solutionFile] = restoredSnapshot.code;
        } else if (typeof submission?.code === "string") {
          contents[solutionFile] = submission.code;
        } else if (typeof progress?.code === "string") {
          contents[solutionFile] = progress.code;
        }

        setFiles(labFiles);
        setOpenFiles(labFiles);
        setActiveFile(solutionFile);
        setFileContents(contents);
        const initialTestResults =
          Array.isArray(submission?.testResults) && submission.testResults.length > 0
            ? submission.testResults
            : labData.testCases ?? [];
        setTestResults(normalizeTestResults(initialTestResults));
        setProgressStatus(submission?.status ?? progress?.status ?? "not_started");
        lastSavedCodeRef.current = contents[solutionFile] ?? "";
        initialLoadCompleteRef.current = true;
      })
      .catch((err) => {
        if (err.status === 401) { navigate("/"); return; }
        setLabError("Failed to load lab. Please refresh.");
      })
      .finally(() => setLabLoading(false));
  }, [labId, navigate, restoredSnapshot]);

  const code = fileContents[activeFile] ?? "";

  const saveDraft = async ({ silent = false } = {}) => {
    if (!activeFile) return;
    if (!silent) setSaveState("saving");

    try {
      await api.patch(`/progress/${labId}`, {
        status: "in progress",
        code: fileContents[activeFile] ?? "",
      });
      lastSavedCodeRef.current = fileContents[activeFile] ?? "";
      setProgressStatus("in_progress");
      setSaveState(silent ? "idle" : "saved");
      if (!silent) setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  };

  useEffect(() => {
    if (!initialLoadCompleteRef.current || !activeFile || submitted) return;
    if (code === lastSavedCodeRef.current) return;

    setSaveState("saving");
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft({ silent: true });
    }, 900);

    return () => clearTimeout(autoSaveTimerRef.current);
  }, [activeFile, code, submitted]);

  const handleCreatePage = () => {
    const nextName = resolveUniqueFileName(newPageName, files);
    if (!nextName) return;

    setFiles((currentFiles) => [...currentFiles, nextName]);
    setOpenFiles((currentOpenFiles) => [...currentOpenFiles, nextName]);
    setFileContents((currentContents) => ({
      ...currentContents,
      [nextName]: buildNewFileContent(nextName),
    }));
    setActiveFile(nextName);
    setIsAddingPage(false);
    setNewPageName("");
  };

  const beginRenamePage = (fileName) => {
    setRenamingFile(fileName);
    setRenameDraft(fileName);
  };

  const commitRenamePage = () => {
    if (!renamingFile) return;
    const nextName = resolveUniqueFileName(renameDraft, files, renamingFile);
    if (!nextName || nextName === renamingFile) {
      setRenamingFile(null);
      setRenameDraft("");
      return;
    }

    setFiles((currentFiles) =>
      currentFiles.map((fileName) => (fileName === renamingFile ? nextName : fileName)),
    );
    setOpenFiles((currentOpenFiles) =>
      currentOpenFiles.map((fileName) => (fileName === renamingFile ? nextName : fileName)),
    );
    setFileContents((currentContents) => {
      const nextContents = { ...currentContents };
      nextContents[nextName] = nextContents[renamingFile] ?? buildNewFileContent(nextName);
      delete nextContents[renamingFile];
      return nextContents;
    });
    setActiveFile((currentActiveFile) =>
      currentActiveFile === renamingFile ? nextName : currentActiveFile,
    );
    setRenamingFile(null);
    setRenameDraft("");
  };

  const cancelRenamePage = () => {
    setRenamingFile(null);
    setRenameDraft("");
  };

  const handleRenameKeyDown = (event) => {
    if (event.key === "Enter") { event.preventDefault(); commitRenamePage(); }
    if (event.key === "Escape") { event.preventDefault(); cancelRenamePage(); }
  };

  const handleNewPageKeyDown = (event) => {
    if (event.key === "Enter") { event.preventDefault(); handleCreatePage(); }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsAddingPage(false);
      setNewPageName("");
    }
  };

  const handleCloseTab = (fileToClose) => {
    setOpenFiles((currentOpenFiles) => {
      const nextOpenFiles = currentOpenFiles.filter((f) => f !== fileToClose);
      if (activeFile === fileToClose) setActiveFile(nextOpenFiles[0] ?? null);
      return nextOpenFiles;
    });
  };

  const handleTabDragStart = (event, fileName) => {
    event.dataTransfer.setData("text/plain", fileName);
    event.dataTransfer.effectAllowed = "move";
    setDraggedTab(fileName);
    setDragOverTab(fileName);
  };

  const handleTabDragOver = (event, fileName) => {
    event.preventDefault();
    if (dragOverTab !== fileName) setDragOverTab(fileName);
  };

  const handleTabDrop = (event, targetFile) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedTab || draggedTab === targetFile) {
      setDragOverTab(null);
      setDraggedTab(null);
      return;
    }

    setOpenFiles((currentOpenFiles) => {
      const sourceIndex = currentOpenFiles.indexOf(draggedTab);
      const targetIndex = currentOpenFiles.indexOf(targetFile);
      if (sourceIndex === -1 || targetIndex === -1) return currentOpenFiles;
      const reordered = [...currentOpenFiles];
      reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, draggedTab);
      return reordered;
    });
    setDragOverTab(null);
    setDraggedTab(null);
  };

  const handleTabDragEnd = () => {
    setDraggedTab(null);
    setDragOverTab(null);
  };

  const handleDeleteFile = (fileToDelete) => {
    const remainingFiles = files.filter((f) => f !== fileToDelete);
    const remainingOpenFiles = openFiles.filter((f) => f !== fileToDelete);
    setFiles(remainingFiles);
    setOpenFiles(remainingOpenFiles);
    setFileContents((currentContents) => {
      const nextContents = { ...currentContents };
      delete nextContents[fileToDelete];
      return nextContents;
    });
    if (activeFile === fileToDelete) setActiveFile(remainingOpenFiles[0] ?? remainingFiles[0] ?? null);
    if (renamingFile === fileToDelete) { setRenamingFile(null); setRenameDraft(""); }
  };

  const requestDeleteFile = (fileName) => {
    setFilePendingDelete(fileName);
    setShowDeleteConfirm(true);
  };

  const cancelDeleteFile = () => {
    setShowDeleteConfirm(false);
    setFilePendingDelete(null);
  };

  const confirmDeleteFile = () => {
    if (!filePendingDelete) return;
    handleDeleteFile(filePendingDelete);
    setShowDeleteConfirm(false);
    setFilePendingDelete(null);
  };

  // ── Run ──────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!isActiveFileRunnable) {
      setConsoleTranscript(
        `Cannot run ${activeFile}. This lab only supports ${supportedExtensions.map((e) => `.${e}`).join(", ")} files.`,
      );
      setConsolePromptInput("");
      setConsolePendingRun(null);
      setConsoleMeta({ isError: true, time: new Date().toLocaleTimeString(), runtime: "0.000s" });
      return;
    }

    setIsRunning(true);
    setConsoleTranscript("");
    setConsolePromptInput("");
    setConsolePendingRun(null);
    setConsoleMeta(null);

    try {
      const result = await api.post(`/student/labs/${labId}/run`, {
        code: fileContents[activeFile] ?? "",
        language: languageForFile(lab, activeFile),
      });
      const nextTestResults = normalizeTestResults(result.testResults ?? []);
      setTestResults(nextTestResults);

      const failed = nextTestResults.some((test) => test.status === "fail" || test.status === "error");
      setConsoleTranscript(buildRunOutput(result, nextTestResults));
      setConsoleMeta({
        isError: failed,
        time: new Date().toLocaleTimeString(),
        runtime: result.executionTime ? `${result.executionTime}s` : result.time ? `${result.time}s` : "—",
      });
    } catch (err) {
      setConsoleTranscript(err.message ?? "Compilation failed.");
      setConsoleMeta({ isError: true, time: new Date().toLocaleTimeString(), runtime: "0.000s" });
    } finally {
      setIsRunning(false);
    }
  };

  const finalizeConsoleInput = () => {
    if (!consolePendingRun) return;
    const inputLine = consolePromptInput.trim();
    const continuationText = consolePendingRun.requiresInput
      ? `\nStarting traversal from node ${inputLine || "<no input>"}\n\n${consolePendingRun.outputText}`
      : consolePendingRun.outputText;
    setConsoleTranscript((currentTranscript) => {
      const separator = currentTranscript.endsWith(">>> ") ? "" : "\n";
      return `${currentTranscript}${inputLine}${separator}${continuationText}`;
    });
    setConsoleMeta({
      isError: consolePendingRun.isError,
      time: consolePendingRun.time,
      runtime: consolePendingRun.runtime,
    });
    setConsolePendingRun(null);
    setConsolePromptInput("");
    setIsRunning(false);
  };

  const handleConsoleChange = (event) => {
    if (!consolePendingRun) return;
    const nextValue = event.target.value;
    if (!nextValue.startsWith(consoleTranscript)) return;
    setConsolePromptInput(nextValue.slice(consoleTranscript.length));
  };

  const handleConsoleKeyDown = (event) => {
    if (!consolePendingRun) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finalizeConsoleInput();
    }
  };

  useEffect(() => {
    if (!consolePendingRun || !consoleRef.current) return;
    const caret = consoleRef.current.value.length;
    consoleRef.current.setSelectionRange(caret, caret);
  }, [consolePendingRun, consoleTranscript, consolePromptInput]);

  // ── Save Version ─────────────────────────────────────────────────────────
  const handleSaveVersion = async () => {
    const desc = versionDesc.trim();
    if (desc.length < 5) {
      setVersionDescErr("Description must be at least 5 characters.");
      return;
    }
    setVersionDescErr("");

    try {
      await api.post(`/student/labs/${labId}/versions`, {
        code: fileContents[activeFile] ?? "",
        description: desc,
      });
      setShowVersionModal(false);
      setVersionDesc("");
      setVersionToast("Version saved successfully");
      setTimeout(() => setVersionToast(""), 3000);
    } catch (err) {
      if (err.status === 400 && /no changes/i.test(err.message ?? "")) {
        setVersionDescErr("No changes since last version");
      } else {
        setVersionDescErr(err.message ?? "Failed to save version. Please try again.");
      }
    }
  };

  // ── Share for Review ─────────────────────────────────────────────────────
  const handleShare = async () => {
    const email = shareEmail.trim().toLowerCase();
    if (!email.endsWith("@kfupm.edu.sa")) {
      setShareEmailErr("Must be a valid @kfupm.edu.sa email address.");
      return;
    }

    const user = getCurrentUser();
    if (user && user.email.toLowerCase() === email) {
      setShareEmailErr("You cannot share a review with yourself.");
      return;
    }

    try {
      await api.post("/peer-reviews/share", {
        labId,
        reviewerEmail: email,
        fileContents,
        files,
      });
      setShowShareModal(false);
      setShareEmail("");
      setShareToast(`Shared with ${email} for review`);
      setTimeout(() => setShareToast(""), 3500);
    } catch (err) {
      if (err.status === 409) {
        setShareEmailErr("You have already shared with this reviewer.");
      } else {
        setShareEmailErr(err.message ?? "Failed to share. Please try again.");
      }
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleConfirmSubmit = async () => {
    setShowSubmit(false);
    setSubmitError("");

    try {
      const submission = getSubmissionPayload(await api.post(`/student/submissions/${labId}`, {
        code: fileContents[activeFile] ?? "",
        language: languageForFile(lab, activeFile),
      }));
      if (Array.isArray(submission?.testResults)) {
        setTestResults(normalizeTestResults(submission.testResults));
      }
      setProgressStatus("submitted");
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message ?? "Submission failed. Please try again.");
    }
  };

  const visibleTests = testResults.filter((r) => r.visible !== false && r.status !== "hidden" && r.type !== "hidden");
  const passed = visibleTests.filter((r) => r.status === "pass").length;
  const visibleTotal = visibleTests.length;
  const hasVisibleFailures = visibleTests.some((r) => r.status === "fail" || r.status === "error");
  const allVisiblePassed = visibleTotal > 0 && passed === visibleTotal && !hasVisibleFailures;
  const resultCountColor = allVisiblePassed ? "#4ade80" : hasVisibleFailures ? "#f87171" : "#4a5568";
  const supportedExtensions = Array.from(new Set(
    labLanguages(lab).flatMap((language) =>
      RUNNABLE_EXTENSIONS_BY_LANGUAGE[normalizeLanguage(language)] ?? [],
    ),
  ));
  const activeFileExtension = activeFile ? getFileExtension(activeFile) : "";
  const isActiveFileRunnable = !!activeFile && supportedExtensions.includes(activeFileExtension);
  const saveLabel = saveState === "saving"
    ? "Saving..."
    : saveState === "saved"
      ? "Saved"
      : saveState === "error"
        ? "Save failed"
        : "Save Draft";
  const lines = code.split("\n");

  const handleEditorChange = (value) => {
    if (!activeFile) return;
    setFileContents((prev) => ({ ...prev, [activeFile]: value }));
  };

  const pageTitle = lab
    ? (lab.title?.includes("—")
        ? `Lab ${labId} — ${lab.title.split("—").slice(1).join("—").trim()}`
        : `Lab ${labId} — ${lab.title ?? ""}`)
    : "Lab Workspace";

  // ── Styles ──────────────────────────────────────────────────────────────
  const bg0 = "#050b18";
  const bg1 = "#080f1e";
  const bg2 = "#0b1424";
  const border = "#1a2540";
  const accent = "#22d3ee";
  const muted = "#8898b3";
  const dimmed = "#4a5568";
  const panelHeaderHeight = 46;

  if (labLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", background: bg0, color: muted, alignItems: "center", justifyContent: "center", fontSize: 14 }}>
        Loading lab…
      </div>
    );
  }

  if (labError) {
    return (
      <div style={{ display: "flex", height: "100vh", background: bg0, color: "#f87171", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
        {labError}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: bg0,
        color: "#e2e8f0",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        overflow: "hidden",
      }}
    >
      <SideBar
        footer={
          files.length > 0 ? (
            <div
              style={{
                borderTop: `1px solid ${border}`,
                padding: "16px 14px 18px",
                maxHeight: "42%",
                overflow: "auto",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: dimmed,
                  letterSpacing: "0.14em",
                  padding: "0 10px 10px",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                Files
              </p>

              {files.map((f) => (
                <div
                  key={f}
                  onMouseEnter={() => setHoveredSidebarFile(f)}
                  onMouseLeave={() => setHoveredSidebarFile(null)}
                  style={{ position: "relative", marginBottom: 4 }}
                >
                  <button
                    onClick={() => {
                      setOpenFiles((currentOpenFiles) =>
                        currentOpenFiles.includes(f)
                          ? currentOpenFiles
                          : [...currentOpenFiles, f],
                      );
                      setActiveFile(f);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      background: activeFile === f ? "#0f1d34" : "transparent",
                      border: `1px solid ${activeFile === f ? "#1c3557" : "transparent"}`,
                      borderRadius: 12,
                      color: activeFile === f ? "#e2e8f0" : "#6b7a99",
                      fontSize: 13,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{sidebarFileIcon(f)}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {f}
                    </span>
                  </button>

                  {hoveredSidebarFile === f && activeFile === f && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        requestDeleteFile(f);
                      }}
                      aria-label={`Delete ${f}`}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 20,
                        height: 20,
                        border: "none",
                        borderRadius: 999,
                        background: "rgba(248,113,113,0.12)",
                        color: "#f87171",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null
        }
      />

      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          flexDirection: "column",
        }}
      >
        <TopBar title={pageTitle} />

        {/* ── Body ── */}
        <main
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* ── Description Panel ── */}
          <div
            style={{
              width: descCollapsed ? 40 : 260,
              minWidth: descCollapsed ? 40 : 260,
              background: bg1,
              borderRight: `1px solid ${border}`,
              display: "flex",
              flexDirection: "column",
              transition: "width 0.2s,min-width 0.2s",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: panelHeaderHeight,
                padding: "0 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: descCollapsed ? "center" : "space-between",
                borderBottom: `1px solid ${border}`,
              }}
            >
              {!descCollapsed && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: dimmed,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Lab Details
                </span>
              )}
              <button
                onClick={() => setDescCollapsed(!descCollapsed)}
                style={{
                  background: "none",
                  border: "none",
                  color: muted,
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 2,
                }}
              >
                {descCollapsed ? "›" : "‹"}
              </button>
            </div>

            {!descCollapsed && (
              <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      background: "#1a2540",
                      borderRadius: 20,
                      padding: "3px 10px",
                      fontSize: 11,
                      color: "#f59e0b",
                    }}
                  >
                    {lab?.dueDate ? `⏰ Due: ${new Date(lab.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "No due date"}
                  </span>
                  <span
                    style={{
                      background: "#1a2540",
                      borderRadius: 20,
                      padding: "3px 10px",
                      fontSize: 11,
                      color: accent,
                    }}
                  >
                    {displayLanguages(lab)}
                  </span>
                </div>
                <pre
                  style={{
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: "#94a3b8",
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    margin: 0,
                  }}
                >
                  {lab?.description ?? ""}
                </pre>
              </div>
            )}
          </div>

          {/* ── Code Editor ── */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: bg2,
              overflow: "hidden",
            }}
          >
            {/* Tab bar */}
            <div
              style={{
                display: "flex",
                minHeight: panelHeaderHeight,
                alignItems: "stretch",
                borderBottom: `1px solid ${border}`,
                background: bg1,
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                if (event.target !== event.currentTarget) return;
                if (!draggedTab) return;
                setOpenFiles((currentOpenFiles) => {
                  const sourceIndex = currentOpenFiles.indexOf(draggedTab);
                  if (sourceIndex === -1) return currentOpenFiles;
                  const reordered = [...currentOpenFiles];
                  reordered.splice(sourceIndex, 1);
                  reordered.push(draggedTab);
                  return reordered;
                });
                setDragOverTab(null);
                setDraggedTab(null);
              }}
            >
              {openFiles.map((f) =>
                renamingFile === f ? (
                  <input
                    key={f}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={commitRenamePage}
                    onKeyDown={handleRenameKeyDown}
                    autoFocus
                    style={{
                      width: 180,
                      height: panelHeaderHeight,
                      padding: "0 14px",
                      fontSize: 12,
                      background: bg2,
                      borderBottom: `2px solid ${accent}`,
                      border: "none",
                      color: "#e2e8f0",
                      outline: "none",
                    }}
                  />
                ) : (
                  <div
                    key={f}
                    draggable
                    onDragStart={(event) => handleTabDragStart(event, f)}
                    onDragOver={(event) => handleTabDragOver(event, f)}
                    onDrop={(event) => handleTabDrop(event, f)}
                    onDragEnd={handleTabDragEnd}
                    onMouseEnter={() => setHoveredFile(f)}
                    onMouseLeave={() => setHoveredFile(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      opacity: draggedTab === f ? 0.55 : 1,
                      borderLeft:
                        dragOverTab === f && draggedTab !== f
                          ? `2px solid ${accent}`
                          : "2px solid transparent",
                    }}
                  >
                    <button
                      onClick={() =>
                        f === activeFile ? beginRenamePage(f) : setActiveFile(f)
                      }
                      style={{
                        height: panelHeaderHeight,
                        padding: "0 20px",
                        fontSize: 12,
                        background: "none",
                        borderBottom:
                          f === activeFile
                            ? `2px solid ${accent}`
                            : "2px solid transparent",
                        border: "none",
                        borderTop: "none",
                        borderLeft: "none",
                        borderRight: "none",
                        color: f === activeFile ? accent : "#6b7a99",
                        cursor: "grab",
                      }}
                    >
                      {f}
                    </button>
                    {f === activeFile && hoveredFile === f && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTab(f);
                        }}
                        aria-label="Close tab"
                        style={{
                          width: 20,
                          height: 20,
                          padding: 0,
                          fontSize: 14,
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ),
              )}
              {isAddingPage ? (
                <input
                  value={newPageName}
                  onChange={(event) => setNewPageName(event.target.value)}
                  onBlur={handleCreatePage}
                  onKeyDown={handleNewPageKeyDown}
                  autoFocus
                  placeholder="Page name"
                  style={{
                    width: 180,
                    height: panelHeaderHeight,
                    padding: "0 14px",
                    fontSize: 12,
                    background: bg2,
                    borderBottom: `2px solid ${accent}`,
                    border: "none",
                    color: "#e2e8f0",
                    outline: "none",
                  }}
                />
              ) : (
                <button
                  onClick={() => setIsAddingPage(true)}
                  aria-label="Add page"
                  style={{
                    width: 40,
                    height: panelHeaderHeight,
                    padding: 0,
                    fontSize: 16,
                    background: "none",
                    borderBottom: "2px solid transparent",
                    border: "none",
                    color: "#6b7a99",
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              )}
              <div
                style={{
                  marginLeft: "auto",
                  padding: "0 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: saveState === "error" ? "#f87171" : "#6b7a99",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                <span>{saveLabel}</span>
                <span style={{ color: dimmed }}>Status: {progressStatus.replace("_", " ")}</span>
              </div>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
              <div style={{ display: "flex", minHeight: "100%" }}>
                {/* Line numbers */}
                <div
                  style={{
                    minWidth: 50,
                    padding: "16px 0",
                    textAlign: "right",
                    color: "#2d3f5c",
                    fontSize: 13,
                    lineHeight: "1.6",
                    userSelect: "none",
                    fontFamily: "'JetBrains Mono','Fira Code',monospace",
                    background: bg1,
                    borderRight: `1px solid ${border}`,
                  }}
                >
                  {lines.map((_, i) => (
                    <div key={i} style={{ paddingRight: 12 }}>
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Highlighted + textarea overlay */}
                <div style={{ flex: 1, position: "relative" }}>
                  <pre
                    style={{
                      margin: 0,
                      padding: "16px",
                      fontSize: 13,
                      lineHeight: "1.6",
                      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                      color: "#cdd6f4",
                      pointerEvents: "none",
                      whiteSpace: "pre",
                      minHeight: "100%",
                    }}
                  >
                    {lines.map((line, i) => (
                      <div key={i} style={{ minHeight: "1.6em" }}>
                        {syntaxHighlight(line)}
                      </div>
                    ))}
                  </pre>
                  <textarea
                    value={code}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    spellCheck={false}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      padding: "16px",
                      fontSize: 13,
                      lineHeight: "1.6",
                      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                      background: "transparent",
                      color: "transparent",
                      caretColor: accent,
                      border: "none",
                      outline: "none",
                      resize: "none",
                      whiteSpace: "pre",
                      overflow: "hidden",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Test Results Panel ── */}
          <div
            style={{
              width: 360,
              minWidth: 360,
              background: bg1,
              borderLeft: `1px solid ${border}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: panelHeaderHeight,
                padding: "0 16px",
                borderBottom: `1px solid ${border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                Test Results
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: resultCountColor,
                }}
              >
                {passed}/{visibleTotal}
              </span>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "12px 0" }}>
              <div style={{ padding: "0 16px 14px" }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: dimmed,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Test Results
                </p>
                <div
                  style={{
                    border: `1px solid #0f1b30`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: bg2,
                  }}
                >
                  {visibleTests.length === 0 ? (
                    <div style={{ padding: "12px 14px", fontSize: 12, color: dimmed }}>
                      Run the lab to see test results.
                    </div>
                  ) : (
                    visibleTests.map((t, index) => (
                      <div
                        key={t.id || t.name || `test-${index + 1}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "9px 14px",
                          borderBottom:
                            index === visibleTests.length - 1
                              ? "none"
                              : `1px solid #0f1b30`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: "monospace",
                            color:
                              t.status === "pass"
                                ? "#4ade80"
                                : t.status === "fail" || t.status === "error"
                                  ? "#f87171"
                                  : "#6b7a99",
                          }}
                        >
                          {t.name}
                        </span>
                        <span style={{ fontSize: 14 }}>
                          {t.status === "pass" ? "✓" : t.status === "fail" || t.status === "error" ? "✗" : "•"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ padding: "0 16px 14px" }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: dimmed,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Output
                </p>
                <textarea
                  ref={consoleRef}
                  value={
                    consolePendingRun
                      ? `${consoleTranscript}${consolePromptInput}`
                      : consoleTranscript
                  }
                  onChange={handleConsoleChange}
                  onKeyDown={handleConsoleKeyDown}
                  readOnly={!consolePendingRun}
                  placeholder={
                    consolePendingRun
                      ? "Type input and press Enter"
                      : isActiveFileRunnable
                        ? "Run the lab to see output here."
                        : `Select a ${displayLanguages(lab)} source file to run.`
                  }
                  spellCheck={false}
                  style={{
                    width: "100%",
                    minHeight: 240,
                    padding: 14,
                    background: bg0,
                    border: `1px solid ${border}`,
                    borderRadius: 12,
                    color: consoleMeta
                      ? consoleMeta.isError
                        ? "#f87171"
                        : "#4ade80"
                      : "#e2e8f0",
                    fontSize: 12,
                    fontFamily: "monospace",
                    lineHeight: 1.55,
                    resize: "vertical",
                    outline: "none",
                    whiteSpace: "pre-wrap",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                padding: "8px 16px 10px",
                borderTop: `1px solid ${border}`,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: dimmed,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Run Details
              </p>
              <p style={{ fontSize: 11, color: "#6b7a99", margin: "2px 0" }}>
                {consoleMeta ? `Run at ${consoleMeta.time}` : "Click Run to check details."}
              </p>
              <p style={{ fontSize: 11, color: "#6b7a99", minHeight: 16 }}>
                {consoleMeta ? `Runtime: ${consoleMeta.runtime}` : ""}
              </p>
            </div>

            {/* Buttons */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: `1px solid ${border}`,
                display: "flex",
                gap: 8,
              }}
            >
              <button
                onClick={handleRun}
                disabled={isRunning || !isActiveFileRunnable}
                title={
                  isActiveFileRunnable
                    ? "Run active file"
                    : `Running is only available for ${supportedExtensions.map((ext) => `.${ext}`).join(", ")} files.`
                }
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: isRunning || !isActiveFileRunnable ? "#1a2540" : "#16a34a",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isRunning || !isActiveFileRunnable ? "not-allowed" : "pointer",
                }}
              >
                {isRunning ? "Running…" : "▶  Run"}
              </button>
              <button
                onClick={() => saveDraft()}
                disabled={saveState === "saving"}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: saveState === "saving" ? "#1a2540" : "transparent",
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  color: saveState === "error" ? "#f87171" : muted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: saveState === "saving" ? "wait" : "pointer",
                }}
              >
                {saveLabel}
              </button>
              <button
                onClick={() => { setVersionDesc(""); setVersionDescErr(""); setShowVersionModal(true); }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "transparent",
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  color: muted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                💾 Save Version
              </button>
              <button
                onClick={() => { setShareEmail(""); setShareEmailErr(""); setShowShareModal(true); }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "transparent",
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  color: muted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                👥 Share for Review
              </button>
              <button
                onClick={() => setShowSubmit(true)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#0369a1",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* ── Version toast ── */}
      {versionToast && (
        <div style={{
          position: "fixed", bottom: 32, right: 32,
          background: "#16a34a", color: "#fff",
          borderRadius: 10, padding: "12px 20px",
          fontSize: 13, fontWeight: 600, zIndex: 2000,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          ✓ {versionToast}
        </div>
      )}

      {/* ── Save Version Modal ── */}
      {showVersionModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: bg2, borderRadius: 16, padding: 32, width: 440,
            border: `1px solid ${border}`,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginTop: 0, marginBottom: 8 }}>
              Save Version
            </h2>
            <p style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
              Add a short description so you can identify this snapshot later.
            </p>
            <input
              autoFocus
              type="text"
              value={versionDesc}
              onChange={(e) => { setVersionDesc(e.target.value); setVersionDescErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { handleSaveVersion(); } else if (e.key === "Escape") { setShowVersionModal(false); } }}
              placeholder="e.g. Fixed insert method"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0b1424", border: `1px solid ${versionDescErr ? "#f87171" : border}`,
                borderRadius: 8, color: "#e2e8f0", fontSize: 13,
                padding: "10px 14px", outline: "none", marginBottom: 6,
              }}
            />
            {versionDescErr && (
              <p style={{ fontSize: 12, color: "#f87171", margin: "0 0 14px" }}>{versionDescErr}</p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setShowVersionModal(false)}
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: `1px solid ${border}`, borderRadius: 8,
                  color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVersion}
                style={{
                  flex: 1, padding: "10px 0", background: "#16a34a",
                  border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Save Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share toast ── */}
      {shareToast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          background: "#0369a1", color: "#fff",
          borderRadius: 10, padding: "12px 24px",
          fontSize: 13, fontWeight: 600, zIndex: 2000,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          whiteSpace: "nowrap",
        }}>
          👥 {shareToast}
        </div>
      )}

      {/* ── Share for Review Modal ── */}
      {showShareModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: bg2, borderRadius: 16, padding: 32, width: 440,
            border: `1px solid ${border}`,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginTop: 0, marginBottom: 8 }}>
              Share Code for Peer Review
            </h2>
            <p style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
              Enter your lab partner's KFUPM email. They will be able to view your code and submit a review.
            </p>
            <input
              autoFocus
              type="email"
              value={shareEmail}
              onChange={(e) => { setShareEmail(e.target.value); setShareEmailErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { handleShare(); } else if (e.key === "Escape") { setShowShareModal(false); } }}
              placeholder="e.g. s202312345@kfupm.edu.sa"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0b1424", border: `1px solid ${shareEmailErr ? "#f87171" : border}`,
                borderRadius: 8, color: "#e2e8f0", fontSize: 13,
                padding: "10px 14px", outline: "none", marginBottom: 6,
              }}
            />
            {shareEmailErr && (
              <p style={{ fontSize: 12, color: "#f87171", margin: "0 0 14px" }}>{shareEmailErr}</p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setShowShareModal(false)}
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: `1px solid ${border}`, borderRadius: 8,
                  color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleShare}
                style={{
                  flex: 1, padding: "10px 0", background: "#0369a1",
                  border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Share Code
              </button>
            </div>

            {/* OR divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: border }} />
              <span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: border }} />
            </div>

            {/* Shareable link */}
            <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>
              Generate a shareable review link anyone with the URL can use:
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{
                flex: 1, background: "#0b1424", border: `1px solid ${border}`,
                borderRadius: 8, padding: "10px 14px", fontSize: 12,
                color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {`${globalThis.location.origin}/peer-reviews/link/${labId}-${Date.now().toString(36)}`}
              </div>
              <button
                onClick={() => {
                  const link = `${globalThis.location.origin}/peer-reviews/link/${labId}-${Date.now().toString(36)}`;
                  navigator.clipboard.writeText(link).catch(() => {});
                  setShareLinkCopied(true);
                  setTimeout(() => setShareLinkCopied(false), 2000);
                }}
                style={{
                  padding: "10px 16px", background: shareLinkCopied ? "#16a34a" : "#1a2540",
                  border: `1px solid ${shareLinkCopied ? "#16a34a" : border}`,
                  borderRadius: 8, color: shareLinkCopied ? "#fff" : "#e2e8f0",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s", whiteSpace: "nowrap",
                }}
              >
                {shareLinkCopied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: bg2,
              borderRadius: 16,
              padding: 32,
              width: 420,
              border: `1px solid ${border}`,
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#e2e8f0",
                marginTop: 0,
                marginBottom: 8,
              }}
            >
              Delete File?
            </h2>
            <p style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
              This will permanently delete
              <span style={{ color: accent, fontWeight: 700 }}>
                {` ${filePendingDelete || "this file"}`}
              </span>
              . This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={cancelDeleteFile}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#1a2540",
                  border: "none",
                  borderRadius: 8,
                  color: muted,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#b91c1c",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Modal ── */}
      {showSubmit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: bg2,
              borderRadius: 16,
              padding: 32,
              width: 400,
              border: `1px solid ${border}`,
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#e2e8f0",
                marginTop: 0,
                marginBottom: 8,
              }}
            >
              Submit Lab {labId}?
            </h2>
            <p style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
              Current score:{" "}
              <span style={{ color: accent, fontWeight: 700 }}>
                {passed}/{visibleTotal}
              </span>{" "}
              Tests passed. Grade will be evaluated after submission.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowSubmit(false)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#1a2540",
                  border: "none",
                  borderRadius: 8,
                  color: muted,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#0369a1",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Submit ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Toast ── */}
      {submitted && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#16a34a",
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 2000,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          ✓ Lab submitted. Test results updated.
        </div>
      )}

      {submitError && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#b91c1c",
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 2000,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          {submitError}
        </div>
      )}
    </div>
  );
}
