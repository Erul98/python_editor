'use client';

import React, { useCallback, useRef, useState } from 'react';
import { FileCode2, FlaskConical, TerminalSquare, X } from 'lucide-react';
import { FileExplorer } from '@/components/FileExplorer';
import { CodeEditor } from '@/components/CodeEditor';
import { Terminal } from '@/components/Terminal';
import { TestCasePanel } from '@/components/TestCasePanel';
import { TopBar } from '@/components/TopBar';
import { useFileSystem } from '@/hooks/useFileSystem';
import { TimeLimitExceededError, usePythonWorker } from '@/hooks/usePythonWorker';
import type { TerminalLine, TerminalLineType, TestCaseResult, TestRunSummary } from '@/types/runner';

type BottomTab = 'terminal' | 'tests';

const MAX_TERMINAL_LINES = 500;

export default function IDE() {
  const fsApi = useFileSystem();
  const runtime = usePythonWorker();
  const { fs, activeFile } = fsApi;

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [stdin, setStdin] = useState('');
  const [tab, setTab] = useState<BottomTab>('terminal');
  const [testResults, setTestResults] = useState<Record<string, TestRunSummary>>({});
  const [panelHeight, setPanelHeight] = useState(300);
  const lineId = useRef(0);

  const activePath = activeFile ? fsApi.getPath(activeFile.id) : null;

  const print = useCallback((type: TerminalLineType, text: string) => {
    if (!text) return;
    setLines((prev) => {
      const next = [...prev, { id: ++lineId.current, type, text: text.replace(/\n$/, '') }];
      return next.length > MAX_TERMINAL_LINES ? next.slice(-MAX_TERMINAL_LINES) : next;
    });
  }, []);

  /** Ghép các chunk stdout/stderr streaming đã được batch từ Worker */
  const appendStream = useCallback((stream: 'stdout' | 'stderr', chunk: string) => {
    if (!chunk) return;
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.type === stream) {
        return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
      }
      const next = [...prev, { id: ++lineId.current, type: stream, text: chunk }];
      return next.length > MAX_TERMINAL_LINES ? next.slice(-MAX_TERMINAL_LINES) : next;
    });
  }, []);

  // ---- Actions ---------------------------------------------------------

  const handleRun = useCallback(async () => {
    if (!activeFile || !activePath || !runtime.isReady) return;
    setTab('terminal');
    print('system', `$ python ${activePath}`);

    let streamedAny = false;
    try {
      const res = await runtime.runCode(activeFile.content ?? '', stdin, {
        files: fsApi.getWorkspaceFiles(),
        entryPath: activePath,
        onStream: (stream, chunk) => {
          streamedAny = true;
          appendStream(stream, chunk);
        },
      });
      if (!streamedAny) {
        print('stdout', res.stdout);
        print('stderr', res.stderr);
      }
      if (res.error) {
        print('stderr', res.traceback || res.error);
        print('system', `[Process exited with error · ${res.executionTime.toFixed(1)} ms]`);
      } else {
        print('success', `[Finished in ${res.executionTime.toFixed(1)} ms]`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      print(
        'stderr',
        err instanceof TimeLimitExceededError
          ? `⏱ ${msg}\nRuntime đã được khởi động lại (log đã in trước khi TLE được giữ nguyên ở trên).`
          : msg
      );
    }
  }, [activeFile, activePath, runtime, stdin, fsApi, print, appendStream]);

  const handleRunTests = useCallback(async () => {
    if (!activeFile || !activePath || !runtime.isReady) return;
    const testCases = activeFile.testCases ?? [];
    setTab('tests');
    if (testCases.length === 0) {
      fsApi.updateTestCases(activeFile.id, [
        {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
          input: '',
          expectedOutput: '',
        },
      ]);
      return;
    }

    try {
      const summary = await runtime.runTestCases(activeFile.content ?? '', testCases, {
        files: fsApi.getWorkspaceFiles(),
        entryPath: activePath,
        mode: activeFile.testMode ?? 'stdio',
        entryFunction: activeFile.entryFunction ?? '',
      });
      setTestResults((prev) => ({ ...prev, [activeFile.id]: summary }));
    } catch (err) {
      const isTle = err instanceof TimeLimitExceededError;
      const msg = err instanceof Error ? err.message : String(err);
      const completedMap = new Map<string, TestCaseResult>(
        isTle ? err.completedResults.map((r) => [String(r.id), r]) : []
      );

      const mergedResults: TestCaseResult[] = testCases.map((tc) => {
        const done = completedMap.get(String(tc.id));
        if (done) return done;
        return {
          id: tc.id,
          status: isTle ? 'TLE' : 'CRASH',
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: '',
          error: msg,
          executionTime: 0,
        };
      });

      const passed = mergedResults.filter((r) => r.status === 'PASSED').length;
      setTestResults((prev) => ({
        ...prev,
        [activeFile.id]: {
          mode: activeFile.testMode ?? 'stdio',
          summary: {
            total: mergedResults.length,
            passed,
            failed: mergedResults.length - passed,
          },
          results: mergedResults,
        },
      }));
    }
  }, [activeFile, activePath, runtime, fsApi]);

  const handleSave = useCallback(() => {
    if (activeFile) fsApi.flushSave(activeFile.id);
  }, [activeFile, fsApi]);

  // ---- Resizable bottom panel -------------------------------------------

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight;
    const onMove = (ev: MouseEvent) => {
      const h = startH + (startY - ev.clientY);
      setPanelHeight(Math.min(Math.max(h, 120), window.innerHeight - 200));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!fsApi.loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1e1e1e] text-sm text-zinc-500">
        Loading workspace...
      </div>
    );
  }

  const openTabs = (fs.openTabIds ?? [])
    .map((id) => fs.nodes[id])
    .filter((n): n is NonNullable<typeof n> => Boolean(n && n.type === 'file'));

  return (
    <div className="flex h-screen flex-col bg-[#1e1e1e] text-zinc-200">
      <TopBar
        filePath={activePath}
        isDirty={!!activeFile && fsApi.dirtyIds.has(activeFile.id)}
        status={runtime.status}
        statusMessage={runtime.statusMessage}
        onRun={handleRun}
        onRunTests={handleRunTests}
        onSave={handleSave}
        onRestart={runtime.restart}
        onSelectTemplate={(tpl) => {
          void fsApi.loadProblemTemplate(tpl);
          setTab('tests');
        }}
        onDownloadFile={fsApi.downloadActiveFile}
        onExportWorkspace={fsApi.exportWorkspaceJSON}
        onImportWorkspace={(raw) => void fsApi.importWorkspaceJSON(raw)}
        onResetWorkspace={() => void fsApi.resetWorkspace()}
      />

      <div className="flex min-h-0 flex-1">
        <FileExplorer
          fs={fs}
          activeFileId={fs.activeFileId}
          onSelectFile={fsApi.selectFile}
          onCreateNode={fsApi.createNode}
          onRenameNode={fsApi.renameNode}
          onDeleteNode={fsApi.deleteNode}
          onToggleFolder={fsApi.toggleFolder}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Open File Tabs Bar */}
          {openTabs.length > 0 && (
            <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-[#2d2d2d] bg-[#181818]">
              {openTabs.map((node) => {
                const isActive = node.id === fs.activeFileId;
                const isDirty = fsApi.dirtyIds.has(node.id);
                return (
                  <div
                    key={node.id}
                    onClick={() => fsApi.selectFile(node.id)}
                    className={`group flex h-full shrink-0 cursor-pointer items-center gap-2 border-r border-[#2d2d2d] px-3 text-xs transition-colors ${
                      isActive
                        ? 'border-t-2 border-t-sky-500 bg-[#1e1e1e] text-white'
                        : 'bg-[#181818] text-zinc-400 hover:bg-[#222222] hover:text-zinc-200'
                    }`}
                  >
                    <FileCode2 size={13} className="text-sky-400" />
                    <span className="font-mono">{node.name}</span>
                    {isDirty && (
                      <span className="text-[10px] text-amber-400" title="Unsaved">
                        ●
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fsApi.closeTab(node.id);
                      }}
                      title="Close tab"
                      className="rounded p-0.5 text-zinc-500 opacity-70 hover:bg-[#333] hover:text-white group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Editor */}
          <div className="min-h-0 flex-1">
            {activeFile ? (
              <CodeEditor
                fileId={activeFile.id}
                path={activePath ?? activeFile.id}
                value={activeFile.content ?? ''}
                onChange={(v) => fsApi.updateContent(activeFile.id, v)}
                onRun={handleRun}
                onRunTests={handleRunTests}
                onSave={handleSave}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Chọn một file .py bên trái hoặc mở mục &ldquo;DSA Problems&rdquo; ở thanh trên để bắt đầu.
              </div>
            )}
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={startResize}
            className="h-1 shrink-0 cursor-row-resize bg-[#2d2d2d] hover:bg-sky-600"
          />

          {/* Bottom panel */}
          <section style={{ height: panelHeight }} className="flex shrink-0 flex-col bg-[#181818]">
            <nav className="flex shrink-0 border-b border-[#2d2d2d] text-xs">
              <TabButton active={tab === 'terminal'} onClick={() => setTab('terminal')}>
                <TerminalSquare size={13} /> Terminal
              </TabButton>
              <TabButton active={tab === 'tests'} onClick={() => setTab('tests')}>
                <FlaskConical size={13} /> Test Cases
                {activeFile?.testCases?.length ? (
                  <span className="rounded bg-[#2d2d2d] px-1.5 text-[10px]">
                    {activeFile.testCases.length}
                  </span>
                ) : null}
                {activeFile?.testMode === 'function' && (
                  <span className="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-300">
                    fn
                  </span>
                )}
              </TabButton>
            </nav>
            <div className="min-h-0 flex-1">
              {tab === 'terminal' ? (
                <Terminal
                  lines={lines}
                  stdin={stdin}
                  onStdinChange={setStdin}
                  onClear={() => setLines([])}
                />
              ) : activeFile ? (
                <TestCasePanel
                  testCases={activeFile.testCases ?? []}
                  testMode={activeFile.testMode ?? 'stdio'}
                  entryFunction={activeFile.entryFunction ?? ''}
                  onChange={(tcs) => fsApi.updateTestCases(activeFile.id, tcs)}
                  onConfigChange={(mode, entryFn) =>
                    fsApi.updateTestConfig(activeFile.id, mode, entryFn)
                  }
                  result={testResults[activeFile.id] ?? null}
                />
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 border-b-2 px-4 py-2 ${
      active
        ? 'border-sky-500 text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`}
  >
    {children}
  </button>
);
