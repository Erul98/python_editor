'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecutionResult, TestCaseResult, TestRunSummary, WorkspaceFile } from '@/types/runner';
import type { TestCase, TestMode } from '@/types/fs';

export type RuntimeStatus = 'loading' | 'ready' | 'running' | 'error';

/** Giới hạn thời gian cho mỗi lần Run hoặc mỗi Test Case đơn lẻ */
const DEFAULT_RUN_TIME_LIMIT_MS = 10_000;
const DEFAULT_TEST_CASE_TIME_LIMIT_MS = 5_000;
const WORKER_URL = '/workers/pythonWorker.js';

export class TimeLimitExceededError extends Error {
  constructor(
    public limitMs: number,
    public completedResults: TestCaseResult[] = [],
    public timedOutCaseId: string | null = null
  ) {
    super(
      timedOutCaseId
        ? `Time Limit Exceeded (> ${limitMs / 1000}s) tại test case.`
        : `Time Limit Exceeded (> ${limitMs / 1000}s). Có thể code bị vòng lặp vô hạn.`
    );
    this.name = 'TimeLimitExceededError';
  }
}

interface Pending {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
  limitMs: number;
  resetTimer: () => void;
  completedResults: TestCaseResult[];
  activeCaseId: string | null;
  onStream?: (stream: 'stdout' | 'stderr', text: string) => void;
}

export interface RunOptions {
  files?: WorkspaceFile[];
  entryPath?: string;
  timeLimitMs?: number;
  mode?: TestMode;
  entryFunction?: string;
  onStream?: (stream: 'stdout' | 'stderr', text: string) => void;
}

export function usePythonWorker() {
  const [status, setStatus] = useState<RuntimeStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Initializing Python runtime...');
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef<Map<string, Pending>>(new Map());

  const spawnWorker = useCallback(() => {
    pending.current.forEach((req) => {
      clearTimeout(req.timer);
      req.reject(new Error('Execution cancelled (Python runtime restarted).'));
    });
    pending.current.clear();

    workerRef.current?.terminate();
    setStatus('loading');

    const worker = new Worker(WORKER_URL);
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { action, messageId, data, error, message, stream, text, caseId, result } = event.data;

      if (action === 'STATUS') {
        setStatusMessage(message);
        return;
      }
      if (action === 'INIT_COMPLETE') {
        setStatus('ready');
        setStatusMessage('Python 3.12 (Pyodide) ready');
        return;
      }
      if (action === 'STREAM') {
        const req = messageId ? pending.current.get(messageId) : undefined;
        req?.onStream?.(stream, text);
        return;
      }
      if (action === 'TEST_CASE_START') {
        const req = messageId ? pending.current.get(messageId) : undefined;
        if (req) {
          req.activeCaseId = String(caseId);
          req.resetTimer();
        }
        return;
      }
      if (action === 'TEST_CASE_DONE') {
        const req = messageId ? pending.current.get(messageId) : undefined;
        if (req && result) {
          req.completedResults.push(result as TestCaseResult);
          req.resetTimer();
        }
        return;
      }

      const req = messageId ? pending.current.get(messageId) : undefined;
      if (!req) {
        if (action === 'GLOBAL_ERROR') {
          setStatus('error');
          setStatusMessage(`Runtime error: ${error}`);
        }
        return;
      }

      clearTimeout(req.timer);
      pending.current.delete(messageId);
      if (action === 'GLOBAL_ERROR' || action === 'ERROR') req.reject(new Error(error));
      else req.resolve(data);
    };

    worker.onerror = (e) => {
      setStatus('error');
      setStatusMessage(`Worker failed: ${e.message}`);
    };

    worker.postMessage({ action: 'INIT', messageId: `init-${Date.now()}` });
  }, []);

  useEffect(() => {
    spawnWorker();
    const map = pending.current;
    return () => {
      workerRef.current?.terminate();
      map.forEach((p) => clearTimeout(p.timer));
      map.clear();
    };
  }, [spawnWorker]);

  const request = useCallback(
    <T,>(
      action: string,
      payload: unknown,
      timeLimitMs: number,
      onStream?: (stream: 'stdout' | 'stderr', text: string) => void
    ): Promise<T> => {
      const worker = workerRef.current;
      if (!worker) return Promise.reject(new Error('Worker not initialized'));

      setStatus('running');
      const messageId = `${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      return new Promise<T>((resolve, reject) => {
        const onTimeout = () => {
          const req = pending.current.get(messageId);
          const completed = req ? [...req.completedResults] : [];
          const activeCaseId = req?.activeCaseId ?? null;
          pending.current.delete(messageId);
          spawnWorker();
          reject(new TimeLimitExceededError(timeLimitMs, completed, activeCaseId));
        };

        const entry: Pending = {
          resolve,
          reject,
          limitMs: timeLimitMs,
          timer: setTimeout(onTimeout, timeLimitMs),
          resetTimer: () => {
            clearTimeout(entry.timer);
            entry.timer = setTimeout(onTimeout, entry.limitMs);
          },
          completedResults: [],
          activeCaseId: null,
          onStream,
        };

        pending.current.set(messageId, entry);
        worker.postMessage({ action, messageId, payload });
      }).finally(() => {
        setStatus((s) => (s === 'running' ? 'ready' : s));
      });
    },
    [spawnWorker]
  );

  const runCode = useCallback(
    (code: string, input = '', opts: RunOptions = {}) =>
      request<ExecutionResult>(
        'RUN_CODE',
        { code, input, files: opts.files ?? [], entryPath: opts.entryPath ?? 'solution.py' },
        opts.timeLimitMs ?? DEFAULT_RUN_TIME_LIMIT_MS,
        opts.onStream
      ),
    [request]
  );

  const runTestCases = useCallback(
    (code: string, testCases: TestCase[], opts: RunOptions = {}) =>
      request<TestRunSummary>(
        'RUN_TEST_CASES',
        {
          code,
          testCases,
          files: opts.files ?? [],
          entryPath: opts.entryPath ?? 'solution.py',
          mode: opts.mode ?? 'stdio',
          entryFunction: opts.entryFunction ?? '',
        },
        opts.timeLimitMs ?? DEFAULT_TEST_CASE_TIME_LIMIT_MS
      ),
    [request]
  );

  return {
    status,
    statusMessage,
    isReady: status === 'ready',
    isRunning: status === 'running',
    runCode,
    runTestCases,
    restart: spawnWorker,
  };
}
