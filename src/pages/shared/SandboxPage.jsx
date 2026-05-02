import { useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import AdminLayout from "../../components/layout/AdminLayout.jsx";
import DashboardLayout from "../../components/layout/DashboardLayout.jsx";
import InstructorLayout from "../../components/layout/InstructorLayout.jsx";
import { getCurrentUser } from "../../utils/authStorage.js";
import { api } from "../../utils/api.js";

const LANGUAGES = [
  {
    value: "python",
    label: "Python 3",
    extension: "main.py",
    template: [
      "import sys",
      "",
      'name = sys.stdin.read().strip() or "LabTrack"',
      'print(f"Hello, {name}!")',
    ].join("\n"),
  },
  {
    value: "javascript",
    label: "JavaScript",
    extension: "main.js",
    template: [
      'const fs = require("fs");',
      'const name = fs.readFileSync(0, "utf8").trim() || "LabTrack";',
      "console.log(`Hello, ${name}!`);",
    ].join("\n"),
  },
  {
    value: "java",
    label: "Java",
    extension: "Main.java",
    template: [
      "import java.util.Scanner;",
      "",
      "class Main {",
      "  public static void main(String[] args) {",
      "    Scanner input = new Scanner(System.in);",
      '    String name = input.hasNextLine() ? input.nextLine().trim() : "";',
      '    if (name.isEmpty()) name = "LabTrack";',
      '    System.out.println("Hello, " + name + "!");',
      "  }",
      "}",
    ].join("\n"),
  },
  {
    value: "cpp",
    label: "C++17",
    extension: "main.cpp",
    template: [
      "#include <bits/stdc++.h>",
      "using namespace std;",
      "",
      "int main() {",
      "    string name;",
      "    getline(cin, name);",
      '    if (name.empty()) name = "LabTrack";',
      '    cout << "Hello, " << name << "!" << endl;',
      "    return 0;",
      "}",
    ].join("\n"),
  },
  {
    value: "c",
    label: "C",
    extension: "main.c",
    template: [
      "#include <stdio.h>",
      "#include <string.h>",
      "",
      "int main() {",
      "    char name[120] = \"\";",
      "    fgets(name, sizeof(name), stdin);",
      '    name[strcspn(name, "\\n")] = 0;',
      '    printf("Hello, %s!\\n", strlen(name) ? name : "LabTrack");',
      "    return 0;",
      "}",
    ].join("\n"),
  },
  {
    value: "go",
    label: "Go",
    extension: "main.go",
    template: [
      "package main",
      "",
      "import (",
      '    "bufio"',
      '    "fmt"',
      '    "os"',
      '    "strings"',
      ")",
      "",
      "func main() {",
      "    reader := bufio.NewReader(os.Stdin)",
      "    name, _ := reader.ReadString('\\n')",
      "    name = strings.TrimSpace(name)",
      '    if name == "" {',
      '        name = "LabTrack"',
      "    }",
      '    fmt.Println("Hello, " + name + "!")',
      "}",
    ].join("\n"),
  },
  {
    value: "rust",
    label: "Rust",
    extension: "main.rs",
    template: [
      "use std::io::{self, Read};",
      "",
      "fn main() {",
      "    let mut input = String::new();",
      "    io::stdin().read_to_string(&mut input).unwrap();",
      "    let name = input.trim();",
      '    let name = if name.is_empty() { "LabTrack" } else { name };',
      '    println!("Hello, {}!", name);',
      "}",
    ].join("\n"),
  },
];

const languageByValue = Object.fromEntries(
  LANGUAGES.map((language) => [language.value, language]),
);

const shell = "#0a1324";
const panel = "#0f1b2f";
const border = "#1a2a46";
const cyan = "#22d3ee";
const muted = "#94a3b8";
const faint = "#64748b";
const text = "#e2e8f0";

function isCompileError(result) {
  const statusCode = result?.statusCode ?? result?.exitCode;
  return Boolean(result?.isError || result?.error || result?.stderr)
    || (statusCode !== undefined && !["0", "200"].includes(String(statusCode)));
}

function readableOutput(result) {
  return result?.output
    ?? result?.stdout
    ?? result?.stderr
    ?? result?.error
    ?? "";
}

function formatMeta(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function SandboxContent() {
  const [language, setLanguage] = useState(LANGUAGES[0].value);
  const [code, setCode] = useState(LANGUAGES[0].template);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const selectedLanguage = languageByValue[language] ?? LANGUAGES[0];
  const output = useMemo(() => readableOutput(result), [result]);
  const failed = result ? isCompileError(result) : false;
  const canRun = code.trim() && !isRunning;

  const handleLanguageChange = (nextLanguage) => {
    const currentTemplate = selectedLanguage.template;
    const next = languageByValue[nextLanguage] ?? LANGUAGES[0];
    setLanguage(next.value);
    setResult(null);
    setError("");

    if (!code.trim() || code === currentTemplate) {
      setCode(next.template);
    }
  };

  const loadExample = () => {
    setCode(selectedLanguage.template);
    setResult(null);
    setError("");
  };

  const runCode = async () => {
    if (!code.trim()) return;
    setIsRunning(true);
    setResult(null);
    setError("");

    try {
      const response = await api.post("/compile", {
        code,
        language,
        input: stdin,
      });
      setResult(response);
    } catch (err) {
      setError(err.message || "Failed to run code.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section
      style={{
        minHeight: "100%",
        padding: "28px 36px 36px",
        color: text,
        background: "#0b1220",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              lineHeight: 1.2,
              color: text,
              fontWeight: 800,
            }}
          >
            Code Sandbox
          </h1>
          <p style={{ marginTop: 8, color: muted, fontSize: 14 }}>
            Choose a language, run code, and inspect the output.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <select
            value={language}
            onChange={(event) => handleLanguageChange(event.target.value)}
            style={{
              width: 190,
              height: 44,
              borderRadius: 8,
              border: `1px solid ${border}`,
              background: panel,
              color: text,
              padding: "0 14px",
              fontSize: 14,
              fontWeight: 700,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadExample}
            style={{
              height: 44,
              borderRadius: 8,
              border: `1px solid ${border}`,
              background: "transparent",
              color: muted,
              padding: "0 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Load Example
          </button>

          <button
            type="button"
            onClick={runCode}
            disabled={!canRun}
            style={{
              height: 44,
              minWidth: 118,
              borderRadius: 8,
              border: "none",
              background: canRun
                ? "linear-gradient(135deg, #16a34a, #22c55e)"
                : "#13213a",
              color: canRun ? "#f8fafc" : faint,
              padding: "0 18px",
              fontSize: 14,
              fontWeight: 800,
              cursor: canRun ? "pointer" : "default",
              boxShadow: canRun ? "0 10px 24px rgba(34,197,94,0.18)" : "none",
            }}
          >
            {isRunning ? "Running..." : "Run Code"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            flex: "1 1 560px",
            background: panel,
            border: `1px solid ${border}`,
            borderRadius: 10,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              borderBottom: `1px solid ${border}`,
              background: shell,
            }}
          >
            <span style={{ color: cyan, fontSize: 13, fontWeight: 800 }}>
              {selectedLanguage.extension}
            </span>
            <span style={{ color: faint, fontSize: 12, fontWeight: 700 }}>
              {selectedLanguage.label}
            </span>
          </div>

          <textarea
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setResult(null);
              setError("");
            }}
            spellCheck={false}
            style={{
              width: "100%",
              height: "min(56vh, 620px)",
              minHeight: 420,
              resize: "vertical",
              border: "none",
              outline: "none",
              background: "#0b1628",
              color: "#dbeafe",
              padding: "20px 22px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 14,
              lineHeight: 1.65,
              tabSize: 2,
            }}
          />
        </div>

        <div
          style={{
            flex: "1 1 360px",
            display: "grid",
            gridTemplateRows: "220px minmax(360px, 1fr)",
            gap: 18,
            minWidth: 0,
          }}
        >
          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 46,
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                borderBottom: `1px solid ${border}`,
                color: muted,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Input
            </div>
            <textarea
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              placeholder="stdin"
              spellCheck={false}
              style={{
                width: "100%",
                height: 174,
                resize: "none",
                border: "none",
                outline: "none",
                background: "#0b1628",
                color: text,
                padding: "16px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            />
          </div>

          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 10,
              overflow: "hidden",
              minHeight: 360,
            }}
          >
            <div
              style={{
                minHeight: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 16px",
                borderBottom: `1px solid ${border}`,
                background: shell,
              }}
            >
              <div>
                <div
                  style={{
                    color: text,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Output
                </div>
                <div style={{ marginTop: 4, color: faint, fontSize: 12 }}>
                  Status code {formatMeta(result?.statusCode)}
                </div>
              </div>
              <span
                style={{
                  minWidth: 84,
                  textAlign: "center",
                  borderRadius: 999,
                  padding: "5px 10px",
                  border: `1px solid ${
                    error || failed ? "rgba(248,113,113,0.35)" : "rgba(74,222,128,0.35)"
                  }`,
                  background:
                    error || failed ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.12)",
                  color: error || failed ? "#f87171" : "#4ade80",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {error || failed ? "Error" : result ? "Success" : "Ready"}
              </span>
            </div>

            <pre
              style={{
                minHeight: 245,
                maxHeight: 410,
                margin: 0,
                padding: "18px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: error || failed ? "#fca5a5" : "#dbeafe",
                background: "#071020",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.55,
                textAlign: "left",
              }}
            >
              {error || output || (result ? "Program exited with no output." : "Run code to see output here.")}
            </pre>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                borderTop: `1px solid ${border}`,
              }}
            >
              {[
                ["CPU", formatMeta(result?.cpuTime)],
                ["Memory", formatMeta(result?.memory)],
                ["Language", selectedLanguage.label],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    padding: "14px 16px",
                    borderRight: label === "Language" ? "none" : `1px solid ${border}`,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      color: faint,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      color: label === "Language" ? cyan : text,
                      fontSize: 13,
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={value}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SandboxPage() {
  const user = getCurrentUser();
  const location = useLocation();

  if (!user?.role) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  const content = <SandboxContent />;

  if (user.role === "admin") {
    return (
      <AdminLayout>
        {content}
      </AdminLayout>
    );
  }

  if (user.role === "instructor") {
    return (
      <InstructorLayout>
        {content}
      </InstructorLayout>
    );
  }

  return (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  );
}
