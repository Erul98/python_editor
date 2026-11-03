'use client';

import React, { useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  FlaskConical,
  FolderSync,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Upload,
  FileDown,
  RefreshCw,
} from 'lucide-react';
import type { RuntimeStatus } from '@/hooks/usePythonWorker';
import { PROBLEM_TEMPLATES, type ProblemTemplate } from '@/lib/problemTemplates';

interface TopBarProps {
  filePath: string | null;
  isDirty: boolean;
  status: RuntimeStatus;
  statusMessage: string;
  onRun: () => void;
  onRunTests: () => void;
  onSave: () => void;
  onRestart: () => void;
  onSelectTemplate: (tpl: ProblemTemplate) => void;
  onDownloadFile: () => void;
  onExportWorkspace: () => void;
  onImportWorkspace: (rawJson: string) => void;
  onResetWorkspace: () => void;
}

const STATUS_DOT: Record<RuntimeStatus, string> = {
  loading: 'bg-amber-400 animate-pulse',
  ready: 'bg-emerald-400',
  running: 'bg-sky-400 animate-pulse',
  error: 'bg-red-500',
};

const DIFF_COLOR: Record<ProblemTemplate['difficulty'], string> = {
  Easy: 'text-emerald-400',
  Medium: 'text-amber-400',
  Hard: 'text-red-400',
};

export const TopBar: React.FC<TopBarProps> = ({
  filePath,
  isDirty,
  status,
  statusMessage,
  onRun,
  onRunTests,
  onSave,
  onRestart,
  onSelectTemplate,
  onDownloadFile,
  onExportWorkspace,
  onImportWorkspace,
  onResetWorkspace,
}) => {
  const [openMenu, setOpenMenu] = useState<'problems' | 'workspace' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const disabled = !filePath || status === 'loading' || status === 'running' || status === 'error';

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onImportWorkspace(String(reader.result ?? ''));
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Không thể đọc file workspace');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-[#2d2d2d] bg-[#1f1f1f] px-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-semibold text-zinc-100">
          🐍 <span className="text-sky-400">PyDSA</span> Editor
        </span>

        {/* Problem Templates Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === 'problems' ? null : 'problems'))}
            className="flex items-center gap-1.5 rounded bg-[#2a2d2e] px-2.5 py-1 text-xs text-zinc-200 hover:bg-[#37373d]"
          >
            <BookOpen size={13} className="text-sky-400" />
            <span>DSA Problems</span>
          </button>

          {openMenu === 'problems' && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />
              <div className="absolute left-0 top-8 z-30 w-80 rounded-md border border-[#3a3a3a] bg-[#252526] py-1 shadow-xl">
                <div className="border-b border-[#333] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Load LeetCode Problem Preset
                </div>
                {PROBLEM_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      onSelectTemplate(tpl);
                      setOpenMenu(null);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-200 hover:bg-[#37373d]"
                  >
                    <span className="truncate pr-2">{tpl.title}</span>
                    <span className={`shrink-0 text-[11px] font-medium ${DIFF_COLOR[tpl.difficulty]}`}>
                      {tpl.difficulty}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Workspace Backup / Export Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === 'workspace' ? null : 'workspace'))}
            className="flex items-center gap-1.5 rounded bg-[#2a2d2e] px-2.5 py-1 text-xs text-zinc-300 hover:bg-[#37373d]"
          >
            <FolderSync size={13} />
            <span className="hidden sm:inline">Workspace</span>
          </button>

          {openMenu === 'workspace' && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />
              <div className="absolute left-0 top-8 z-30 w-56 rounded-md border border-[#3a3a3a] bg-[#252526] py-1 text-xs shadow-xl">
                <button
                  onClick={() => {
                    onDownloadFile();
                    setOpenMenu(null);
                  }}
                  disabled={!filePath}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-[#37373d] disabled:opacity-40"
                >
                  <FileDown size={14} /> Download active .py
                </button>
                <button
                  onClick={() => {
                    onExportWorkspace();
                    setOpenMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-[#37373d]"
                >
                  <Download size={14} /> Export Workspace (.json)
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setOpenMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-[#37373d]"
                >
                  <Upload size={14} /> Import Workspace (.json)
                </button>
                <div className="my-1 border-t border-[#333]" />
                <button
                  onClick={() => {
                    setOpenMenu(null);
                    if (confirm('Khôi phục workspace về các file mẫu ban đầu?')) {
                      onResetWorkspace();
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-amber-400 hover:bg-[#37373d]"
                >
                  <RefreshCw size={14} /> Reset Default Workspace
                </button>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {filePath && (
          <span className="hidden truncate font-mono text-xs text-zinc-400 lg:inline">
            {filePath}
            {isDirty && (
              <span className="ml-1 text-amber-400" title="Unsaved changes">
                ●
              </span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="mr-2 flex items-center gap-1.5 text-xs text-zinc-400"
          title={statusMessage}
        >
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          <span className="hidden max-w-[220px] truncate md:inline">{statusMessage}</span>
        </div>

        <IconButton title="Restart Python runtime" onClick={onRestart}>
          <RotateCcw size={14} />
        </IconButton>
        <IconButton title="Save (⌘/Ctrl + S)" onClick={onSave} disabled={!filePath}>
          <Save size={14} />
        </IconButton>

        <button
          onClick={onRunTests}
          disabled={disabled}
          title="Run test cases (⌘/Ctrl + Shift + Enter)"
          className="flex items-center gap-1.5 rounded bg-[#2d2d2d] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FlaskConical size={14} />
          Run Tests
        </button>
        <button
          onClick={onRun}
          disabled={disabled}
          title="Run (⌘/Ctrl + Enter)"
          className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'running' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          Run
        </button>
      </div>
    </header>
  );
};

const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  ...props
}) => (
  <button
    {...props}
    className="rounded p-1.5 text-zinc-400 hover:bg-[#2d2d2d] hover:text-white disabled:opacity-40"
  >
    {children}
  </button>
);
