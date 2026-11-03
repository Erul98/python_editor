import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FileNode, FileSystemState } from '@/types/fs';

interface EditorDB extends DBSchema {
  files: {
    key: string;
    value: FileNode;
  };
  metadata: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'python-dsa-ide-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<EditorDB>> | null = null;

/** Singleton connection — tránh mở nhiều kết nối IndexedDB */
export function initDB(): Promise<IDBPDatabase<EditorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<EditorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
      },
    });
  }
  return dbPromise;
}

// ---- Seed data ---------------------------------------------------------

const TWO_SUM_CODE = `# 1. Two Sum
# Input : dòng 1 là mảng nums (cách nhau bởi dấu cách), dòng 2 là target
# Output: chỉ số của 2 phần tử có tổng bằng target
import sys
from typing import List


def two_sum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, num in enumerate(nums):
        if target - num in seen:
            return [seen[target - num], i]
        seen[num] = i
    return []


if __name__ == "__main__":
    data = sys.stdin.read().split("\\n")
    nums = list(map(int, data[0].split()))
    target = int(data[1])
    print(two_sum(nums, target))
`;

const UTILS_CODE = `# Có thể import từ file khác trong workspace:
#   from utils.helpers import print_grid
def print_grid(grid):
    for row in grid:
        print(" ".join(map(str, row)))
`;

const BFS_CODE = `# BFS trên lưới — ví dụ import module từ thư mục utils/
from collections import deque
from utils.helpers import print_grid

grid = [
    [0, 0, 1],
    [1, 0, 1],
    [0, 0, 0],
]


def shortest_path(grid):
    n, m = len(grid), len(grid[0])
    dist = [[-1] * m for _ in range(n)]
    dist[0][0] = 0
    q = deque([(0, 0)])
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < m and grid[nr][nc] == 0 and dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return dist


print_grid(shortest_path(grid))
`;

export function seedNodes(): {
  nodes: FileNode[];
  rootIds: string[];
  activeFileId: string;
  openTabIds: string[];
} {
  const now = Date.now();
  const base = { createdAt: now, updatedAt: now };
  const nodes: FileNode[] = [
    {
      id: 'seed-utils',
      name: 'utils',
      type: 'folder',
      parentId: null,
      children: ['seed-utils-init', 'seed-helpers'],
      isOpen: true,
      ...base,
    },
    {
      id: 'seed-utils-init',
      name: '__init__.py',
      type: 'file',
      parentId: 'seed-utils',
      content: '',
      testMode: 'stdio',
      testCases: [],
      ...base,
    },
    {
      id: 'seed-helpers',
      name: 'helpers.py',
      type: 'file',
      parentId: 'seed-utils',
      content: UTILS_CODE,
      testMode: 'stdio',
      testCases: [],
      ...base,
    },
    {
      id: 'seed-bfs',
      name: 'bfs_grid.py',
      type: 'file',
      parentId: null,
      content: BFS_CODE,
      testMode: 'stdio',
      testCases: [],
      ...base,
    },
    {
      id: 'seed-two-sum',
      name: 'two_sum.py',
      type: 'file',
      parentId: null,
      content: TWO_SUM_CODE,
      testMode: 'stdio',
      testCases: [
        { id: 'tc-1', input: '2 7 11 15\n9', expectedOutput: '[0, 1]' },
        { id: 'tc-2', input: '3 2 4\n6', expectedOutput: '[1, 2]' },
        { id: 'tc-3', input: '3 3\n6', expectedOutput: '[0, 1]' },
      ],
      ...base,
    },
  ];
  return {
    nodes,
    rootIds: ['seed-utils', 'seed-bfs', 'seed-two-sum'],
    activeFileId: 'seed-two-sum',
    openTabIds: ['seed-two-sum', 'seed-bfs'],
  };
}

// ---- Public API --------------------------------------------------------

export async function loadFileSystem(): Promise<FileSystemState> {
  const db = await initDB();
  const allNodes = await db.getAll('files');

  if (allNodes.length === 0) {
    return resetFileSystemInDB();
  }

  const nodes: Record<string, FileNode> = Object.fromEntries(allNodes.map((n) => [n.id, n]));
  const storedRoots = (await db.get('metadata', 'rootIds')) as string[] | undefined;
  const storedActive = (await db.get('metadata', 'activeFileId')) as string | undefined;
  const storedTabs = (await db.get('metadata', 'openTabIds')) as string[] | undefined;

  const rootIds = (storedRoots ?? []).filter((id) => nodes[id] && !nodes[id].parentId);
  Object.values(nodes).forEach((n) => {
    if (!n.parentId && !rootIds.includes(n.id)) rootIds.push(n.id);
  });

  const activeFileId =
    storedActive && nodes[storedActive]
      ? storedActive
      : Object.values(nodes).find((n) => n.type === 'file')?.id ?? null;

  const validTabs = (storedTabs ?? []).filter((id) => nodes[id]?.type === 'file');
  if (activeFileId && !validTabs.includes(activeFileId)) {
    validTabs.push(activeFileId);
  }

  return { nodes, rootIds, activeFileId, openTabIds: validTabs };
}

export async function resetFileSystemInDB(): Promise<FileSystemState> {
  const db = await initDB();
  const seed = seedNodes();
  const tx = db.transaction(['files', 'metadata'], 'readwrite');
  await tx.objectStore('files').clear();
  await Promise.all([
    ...seed.nodes.map((n) => tx.objectStore('files').put(n)),
    tx.objectStore('metadata').put(seed.rootIds, 'rootIds'),
    tx.objectStore('metadata').put(seed.activeFileId, 'activeFileId'),
    tx.objectStore('metadata').put(seed.openTabIds, 'openTabIds'),
    tx.done,
  ]);
  return {
    nodes: Object.fromEntries(seed.nodes.map((n) => [n.id, n])),
    rootIds: seed.rootIds,
    activeFileId: seed.activeFileId,
    openTabIds: seed.openTabIds,
  };
}

export async function replaceFileSystemInDB(state: FileSystemState): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['files', 'metadata'], 'readwrite');
  await tx.objectStore('files').clear();
  await Promise.all([
    ...Object.values(state.nodes).map((n) => tx.objectStore('files').put(n)),
    tx.objectStore('metadata').put(state.rootIds, 'rootIds'),
    state.activeFileId
      ? tx.objectStore('metadata').put(state.activeFileId, 'activeFileId')
      : tx.objectStore('metadata').delete('activeFileId'),
    tx.objectStore('metadata').put(state.openTabIds ?? [], 'openTabIds'),
    tx.done,
  ]);
}

export async function saveNode(node: FileNode): Promise<void> {
  const db = await initDB();
  await db.put('files', node);
}

export async function saveNodes(nodes: FileNode[]): Promise<void> {
  if (nodes.length === 0) return;
  const db = await initDB();
  const tx = db.transaction('files', 'readwrite');
  await Promise.all([...nodes.map((n) => tx.store.put(n)), tx.done]);
}

export async function deleteNodeFromDB(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('files', id);
}

export async function deleteNodesFromDB(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await initDB();
  const tx = db.transaction('files', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function saveFSMeta(
  rootIds: string[],
  activeFileId: string | null,
  openTabIds?: string[]
): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('metadata', 'readwrite');
  const ops: Promise<unknown>[] = [
    tx.store.put(rootIds, 'rootIds'),
    activeFileId ? tx.store.put(activeFileId, 'activeFileId') : tx.store.delete('activeFileId'),
  ];
  if (openTabIds) {
    ops.push(tx.store.put(openTabIds, 'openTabIds'));
  }
  ops.push(tx.done);
  await Promise.all(ops);
}
