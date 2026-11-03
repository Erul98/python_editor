export type FileNodeType = 'file' | 'folder';

/**
 * - 'stdio'    : Đọc từ sys.stdin, so khớp sys.stdout (HackerRank / Codeforces)
 * - 'function' : Gọi trực tiếp method trong class Solution hoặc hàm Python (LeetCode)
 */
export type TestMode = 'stdio' | 'function';

export interface TestCase {
  id: string;
  input: string; // Với 'stdio': dữ liệu stdin. Với 'function': mỗi dòng 1 tham số (hỗ trợ cả `nums = [1,2]` hoặc `[1,2]`)
  expectedOutput: string; // Output hoặc giá trị return kỳ vọng
}

export interface FileNode {
  id: string;
  name: string;
  type: FileNodeType;
  parentId: string | null;
  content?: string; // Only for files
  children?: string[]; // Array of child IDs for folders
  isOpen?: boolean; // Folder expand/collapse state in UI
  testMode?: TestMode; // Chế độ chấm test cho file này
  entryFunction?: string; // Tên hàm/method cần gọi (để trống = tự động phát hiện)
  testCases?: TestCase[]; // Test cases gắn với từng file bài tập
  createdAt: number;
  updatedAt: number;
}

export interface FileSystemState {
  nodes: Record<string, FileNode>;
  rootIds: string[];
  activeFileId: string | null;
  openTabIds?: string[];
}
