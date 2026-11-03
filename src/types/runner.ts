import type { TestMode } from '@/types/fs';

export type TestStatus = 'PASSED' | 'FAILED' | 'ERROR' | 'TLE' | 'CRASH';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  error: string | null;
  traceback: string;
  executionTime: number;
}

export interface WorkspaceFile {
  path: string; // Đường dẫn tương đối, vd: "utils/graph.py"
  content: string;
}

export interface TestCaseResult {
  id: string;
  status: TestStatus;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  stdout?: string; // Debug print() riêng khi chạy ở chế độ LeetCode function
  error: string | null;
  executionTime: number;
}

export interface TestRunSummary {
  mode?: TestMode;
  detectedEntry?: string | null;
  summary: { total: number; passed: number; failed: number };
  results: TestCaseResult[];
}

export type TerminalLineType = 'stdout' | 'stderr' | 'info' | 'success' | 'system';

export interface TerminalLine {
  id: number;
  type: TerminalLineType;
  text: string;
}
