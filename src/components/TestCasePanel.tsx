'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Plus, X, XCircle, AlertTriangle, Code2, Terminal } from 'lucide-react';
import type { TestCase, TestMode } from '@/types/fs';
import type { TestCaseResult, TestRunSummary, TestStatus } from '@/types/runner';

interface TestCasePanelProps {
  testCases: TestCase[];
  testMode: TestMode;
  entryFunction: string;
  onChange: (testCases: TestCase[]) => void;
  onConfigChange: (mode: TestMode, entryFunction?: string) => void;
  result: TestRunSummary | null;
}

const STATUS_META: Record<TestStatus, { label: string; color: string; Icon: React.ElementType }> = {
  PASSED: { label: 'Accepted', color: 'text-emerald-400', Icon: CheckCircle2 },
  FAILED: { label: 'Wrong Answer', color: 'text-red-400', Icon: XCircle },
  ERROR: { label: 'Runtime Error', color: 'text-red-400', Icon: AlertTriangle },
  TLE: { label: 'Time Limit Exceeded', color: 'text-amber-400', Icon: Clock },
  CRASH: { label: 'Internal Error', color: 'text-amber-400', Icon: AlertTriangle },
};

const newCase = (): TestCase => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
  input: '',
  expectedOutput: '',
});

export const TestCasePanel: React.FC<TestCasePanelProps> = ({
  testCases,
  testMode,
  entryFunction,
  onChange,
  onConfigChange,
  result,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (activeIdx >= testCases.length) setActiveIdx(Math.max(0, testCases.length - 1));
  }, [testCases.length, activeIdx]);

  const resultById = new Map<string, TestCaseResult>(
    result?.results.map((r) => [String(r.id), r]) ?? []
  );
  const active = testCases[activeIdx];
  const activeResult = active ? resultById.get(active.id) : undefined;

  const update = (patch: Partial<TestCase>) =>
    onChange(testCases.map((tc, i) => (i === activeIdx ? { ...tc, ...patch } : tc)));

  const remove = (idx: number) => onChange(testCases.filter((_, i) => i !== idx));

  const add = () => {
    onChange([...testCases, newCase()]);
    setActiveIdx(testCases.length);
  };

  const allPassed = result && result.summary.passed === result.summary.total;

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      {/* Mode selector bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2d2d2d] bg-[#1b1b1b] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Mode:</span>
          <button
            onClick={() => onConfigChange('stdio')}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              testMode === 'stdio'
                ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/40'
                : 'text-zinc-400 hover:bg-[#2a2d2e]'
            }`}
            title="Đọc dữ liệu từ sys.stdin và so khớp sys.stdout (HackerRank / Codeforces)"
          >
            <Terminal size={12} /> Standard I/O
          </button>
          <button
            onClick={() => onConfigChange('function')}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              testMode === 'function'
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                : 'text-zinc-400 hover:bg-[#2a2d2e]'
            }`}
            title="Tự động gọi method trong class Solution hoặc hàm Python (LeetCode)"
          >
            <Code2 size={12} /> LeetCode Function
          </button>
        </div>

        {testMode === 'function' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Entry method:</span>
            <input
              type="text"
              value={entryFunction}
              onChange={(e) => onConfigChange('function', e.target.value)}
              placeholder="auto (class Solution)"
              className="w-40 rounded bg-[#141414] px-2 py-0.5 font-mono text-[11px] text-zinc-200 outline-none ring-1 ring-[#2d2d2d] focus:ring-amber-500"
            />
          </div>
        )}
      </div>

      {/* Summary */}
      {result && (
        <div
          className={`flex items-center gap-2 border-b border-[#2d2d2d] px-3 py-1.5 font-semibold ${
            allPassed ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {allPassed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {allPassed ? 'Accepted — All test cases passed' : 'Some test cases failed'}
          <span className="font-normal text-zinc-400">
            ({result.summary.passed}/{result.summary.total} passed)
          </span>
          {result.detectedEntry && (
            <span className="ml-auto rounded bg-[#2d2d2d] px-2 py-0.5 font-mono text-[11px] font-normal text-amber-300">
              called {result.detectedEntry}()
            </span>
          )}
        </div>
      )}

      {/* Case tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#2d2d2d] px-3 py-1.5">
        {testCases.map((tc, idx) => {
          const r = resultById.get(tc.id);
          const dot = r
            ? r.status === 'PASSED'
              ? 'bg-emerald-400'
              : r.status === 'TLE'
                ? 'bg-amber-400'
                : 'bg-red-400'
            : null;
          return (
            <div
              key={tc.id}
              onClick={() => setActiveIdx(idx)}
              className={`group flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 ${
                idx === activeIdx
                  ? 'bg-[#37373d] text-white'
                  : 'text-zinc-400 hover:bg-[#2a2d2e]'
              }`}
            >
              {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
              Case {idx + 1}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(idx);
                }}
                className="hidden text-zinc-500 hover:text-red-400 group-hover:block"
                title="Remove case"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button
          onClick={add}
          title="Add test case"
          className="rounded p-1 text-zinc-400 hover:bg-[#2d2d2d] hover:text-white"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Case detail */}
      <div className="flex-1 space-y-3 overflow-auto p-3">
        {!active ? (
          <div className="py-6 text-center text-zinc-500">Chưa có test case. Bấm + để thêm.</div>
        ) : (
          <>
            {activeResult && <ResultBadge result={activeResult} />}

            <Field
              label={
                testMode === 'function'
                  ? 'Arguments (mỗi dòng 1 tham số, hỗ trợ cả `nums = [2,7,11,15]` hoặc `[2,7,11,15]`)'
                  : 'Input (stdin)'
              }
            >
              <textarea
                value={active.input}
                onChange={(e) => update({ input: e.target.value })}
                rows={3}
                spellCheck={false}
                placeholder={
                  testMode === 'function'
                    ? 'nums = [2, 7, 11, 15]\ntarget = 9'
                    : '2 7 11 15\n9'
                }
                className="w-full resize-y rounded bg-[#1a1a1a] p-2 font-mono text-[13px] text-zinc-200 outline-none ring-1 ring-[#2d2d2d] focus:ring-sky-600"
              />
            </Field>

            <Field label={testMode === 'function' ? 'Expected Return Value' : 'Expected Output'}>
              <textarea
                value={active.expectedOutput}
                onChange={(e) => update({ expectedOutput: e.target.value })}
                rows={2}
                spellCheck={false}
                placeholder="[0, 1]"
                className="w-full resize-y rounded bg-[#1a1a1a] p-2 font-mono text-[13px] text-zinc-200 outline-none ring-1 ring-[#2d2d2d] focus:ring-sky-600"
              />
            </Field>

            {activeResult?.stdout && (
              <Field label="Stdout (debug print)">
                <pre className="whitespace-pre-wrap rounded bg-[#1a1a1a] p-2 font-mono text-[12px] text-zinc-300 ring-1 ring-[#2d2d2d]">
                  {activeResult.stdout}
                </pre>
              </Field>
            )}

            {activeResult && (
              <Field label={testMode === 'function' ? 'Actual Return Value' : 'Your Output'}>
                <pre
                  className={`min-h-[2.25rem] whitespace-pre-wrap rounded bg-[#1a1a1a] p-2 font-mono text-[13px] ring-1 ${
                    activeResult.status === 'PASSED'
                      ? 'text-emerald-300 ring-emerald-900'
                      : 'text-red-300 ring-red-900'
                  }`}
                >
                  {activeResult.actualOutput || <span className="text-zinc-600">(empty)</span>}
                </pre>
              </Field>
            )}

            {activeResult?.error && (
              <Field label={activeResult.status === 'PASSED' ? 'stderr' : 'Error'}>
                <pre className="whitespace-pre-wrap rounded bg-red-950/30 p-2 font-mono text-[12px] text-red-400 ring-1 ring-red-900">
                  {activeResult.error}
                </pre>
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
    {children}
  </div>
);

const ResultBadge: React.FC<{ result: TestCaseResult }> = ({ result }) => {
  const meta = STATUS_META[result.status];
  return (
    <div className={`flex items-center gap-2 text-sm font-semibold ${meta.color}`}>
      <meta.Icon size={16} />
      {meta.label}
      <span className="ml-auto text-xs font-normal text-zinc-500">
        {result.executionTime.toFixed(1)} ms
      </span>
    </div>
  );
};
