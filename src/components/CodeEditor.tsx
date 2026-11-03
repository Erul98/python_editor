'use client';

import React, { useEffect, useRef } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type * as MonacoNS from 'monaco-editor';
import { DSA_SNIPPETS } from '@/lib/dsaSnippets';

interface CodeEditorProps {
  fileId: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onRunTests: () => void;
  onSave: () => void;
}

// Monaco là singleton toàn cục -> chỉ đăng ký completion provider một lần
let snippetsRegistered = false;

function registerDsaSnippets(monaco: Monaco) {
  if (snippetsRegistered) return;
  snippetsRegistered = true;

  monaco.languages.registerCompletionItemProvider('python', {
    provideCompletionItems(model: MonacoNS.editor.ITextModel, position: MonacoNS.Position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: DSA_SNIPPETS.map((s) => ({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: `DSA · ${s.detail}`,
          documentation: { value: '```python\n' + s.body.replace(/\$\{\d+:?([^}]*)\}/g, '$1') + '\n```' },
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
      };
    },
  });
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  fileId,
  path,
  value,
  onChange,
  onRun,
  onRunTests,
  onSave,
}) => {
  // Giữ handler mới nhất trong ref để keybinding (đăng ký 1 lần) không bị stale closure
  const handlers = useRef({ onRun, onRunTests, onSave });
  useEffect(() => {
    handlers.current = { onRun, onRunTests, onSave };
  }, [onRun, onRunTests, onSave]);

  const handleMount: OnMount = (editor, monaco) => {
    registerDsaSnippets(monaco);
    const { KeyMod, KeyCode } = monaco;

    // Ctrl/Cmd + Enter         -> Run
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => handlers.current.onRun());
    // Ctrl/Cmd + Shift + Enter -> Run test cases
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () => handlers.current.onRunTests());
    // Ctrl/Cmd + S             -> Save ngay vào IndexedDB
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => handlers.current.onSave());

    editor.focus();
  };

  return (
    <Editor
      // `path` giúp Monaco giữ model riêng cho từng file (undo stack, cursor, scroll)
      path={`file:///workspace/${path || fileId}`}
      defaultLanguage="python"
      language="python"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      loading={<div className="p-4 text-xs text-zinc-500">Loading editor...</div>}
      options={{
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        tabSize: 4,
        insertSpaces: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: true },
        suggest: { showSnippets: true, snippetsPreventQuickSuggestions: false },
        quickSuggestions: { other: true, comments: false, strings: false },
        smoothScrolling: true,
        padding: { top: 12 },
      }}
    />
  );
};
