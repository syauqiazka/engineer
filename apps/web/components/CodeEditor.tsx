"use client";

/**
 * CodeEditor: editor kode berbasis CodeMirror 6 (via @uiw/react-codemirror).
 * Mendukung SQL dan Python dengan syntax highlighting + autocompletion.
 * Ctrl+Enter / Cmd+Enter untuk menjalankan kode.
 */

import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";

export type EditorLanguage = "sql" | "python" | "text";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  placeholder?: string;
  height?: string;
  minHeight?: string;
  onRun?: (value: string) => void;
  className?: string;
  id?: string;
}

// Custom theme yang sesuai dengan design token workspace
const workspaceTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    backgroundColor: "var(--surface-sunk, #0f1117)",
    color: "var(--foreground, #e2e8f0)",
  },
  ".cm-content": {
    padding: "10px 0",
    caretColor: "var(--action, #6366f1)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--action, #6366f1)",
    borderLeftWidth: "2px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-sunk, #0f1117)",
    borderRight: "1px solid var(--rule, #1e2433)",
    color: "var(--muted, #4a5568)",
    minWidth: "44px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    paddingRight: "10px",
    paddingLeft: "6px",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(99, 102, 241, 0.04)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(99, 102, 241, 0.07)",
    color: "var(--foreground, #e2e8f0)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(99, 102, 241, 0.25) !important",
  },
  ".cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(99, 102, 241, 0.3) !important",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  ".cm-placeholder": {
    color: "var(--muted, #4a5568)",
    fontStyle: "italic",
  },
});

function getExtensions(language: EditorLanguage, onRun?: (val: string) => void) {
  const langExt = language === "sql" ? sql() : language === "python" ? python() : [];

  const runKm = onRun
    ? keymap.of([
        {
          key: "Ctrl-Enter",
          mac: "Cmd-Enter",
          run: (view) => {
            onRun(view.state.doc.toString());
            return true;
          },
        },
        {
          key: "Ctrl-Shift-Enter",
          mac: "Cmd-Shift-Enter",
          run: (view) => {
            const sel = view.state.selection.main;
            const text =
              sel.from !== sel.to
                ? view.state.sliceDoc(sel.from, sel.to)
                : view.state.doc.toString();
            onRun(text);
            return true;
          },
        },
      ])
    : [];

  return [workspaceTheme, oneDark, langExt, runKm].flat();
}

export default function CodeEditor({
  value,
  onChange,
  language = "sql",
  readOnly = false,
  placeholder,
  height = "auto",
  minHeight = "120px",
  onRun,
  className = "",
  id,
}: CodeEditorProps) {
  const extensions = useMemo(
    () => getExtensions(language, onRun),
    [language, onRun]
  );

  return (
    <div className={`code-editor-wrapper ${className}`} id={id}>
      <CodeMirror
        value={value}
        height={height !== "auto" ? height : undefined}
        minHeight={minHeight}
        extensions={extensions}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: false,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: false,
          completionKeymap: true,
          lintKeymap: false,
        }}
        style={{ border: "none" }}
      />
    </div>
  );
}

/**
 * CodeViewer: read-only version dari CodeEditor.
 */
export function CodeViewer({
  value,
  language = "sql",
  height,
  minHeight = "200px",
  className = "",
}: Pick<CodeEditorProps, "value" | "language" | "height" | "minHeight" | "className">) {
  return (
    <CodeEditor
      value={value}
      language={language}
      readOnly
      height={height}
      minHeight={minHeight}
      className={`code-viewer ${className}`}
    />
  );
}
