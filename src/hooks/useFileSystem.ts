'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileNode, FileNodeType, FileSystemState, TestCase, TestMode } from '@/types/fs';
import type { WorkspaceFile } from '@/types/runner';
import type { ProblemTemplate } from '@/lib/problemTemplates';
import {
  deleteNodesFromDB,
  loadFileSystem,
  replaceFileSystemInDB,
  resetFileSystemInDB,
  saveFSMeta,
  saveNode,
  saveNodes,
} from '@/lib/indexedDb';

const SAVE_DEBOUNCE_MS = 350;

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const NEW_FILE_TEMPLATE = (name: string) => `# ${name}
import sys
input = sys.stdin.readline


def solve():
    pass


if __name__ == "__main__":
    solve()
`;

export function useFileSystem() {
  const [fs, setFs] = useState<FileSystemState>({
    nodes: {},
    rootIds: [],
    activeFileId: null,
    openTabIds: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const fsRef = useRef(fs);
  fsRef.current = fs;
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Cập nhật đồng thời cả fsRef.current và React state để tránh stale ref khi gọi liên tiếp */
  const commitFs = useCallback((next: FileSystemState) => {
    fsRef.current = next;
    setFs(next);
  }, []);

  useEffect(() => {
    loadFileSystem().then((state) => {
      commitFs(state);
      setLoaded(true);
    });
  }, [commitFs]);

  // ---- Helpers ---------------------------------------------------------

  const siblingsOf = (state: FileSystemState, parentId: string | null) =>
    parentId ? state.nodes[parentId]?.children ?? [] : state.rootIds;

  const sortIds = (state: Record<string, FileNode>, ids: string[]) =>
    [...ids].sort((a, b) => {
      const na = state[a],
        nb = state[b];
      if (!na || !nb) return 0;
      if (na.type !== nb.type) return na.type === 'folder' ? -1 : 1;
      return na.name.localeCompare(nb.name);
    });

  const nameExists = (
    state: FileSystemState,
    parentId: string | null,
    name: string,
    exceptId?: string
  ) =>
    siblingsOf(state, parentId).some(
      (id) => id !== exceptId && state.nodes[id]?.name.toLowerCase() === name.toLowerCase()
    );

  const getPath = useCallback((id: string): string => {
    const parts: string[] = [];
    const visited = new Set<string>();
    let cur: FileNode | undefined = fsRef.current.nodes[id];
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parentId ? fsRef.current.nodes[cur.parentId] : undefined;
    }
    return parts.join('/');
  }, []);

  const getWorkspaceFiles = useCallback((): WorkspaceFile[] => {
    return Object.values(fsRef.current.nodes)
      .filter((n) => n.type === 'file')
      .map((n) => ({ path: getPath(n.id), content: n.content ?? '' }));
  }, [getPath]);

  // ---- Actions ---------------------------------------------------------

  const createNode = useCallback(
    async (rawName: string, type: FileNodeType, parentId: string | null) => {
      const state = fsRef.current;
      let name = rawName.replace(/[\\/]/g, '_');
      if (nameExists(state, parentId, name)) {
        const dot = name.lastIndexOf('.');
        const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
        let i = 1;
        while (nameExists(state, parentId, `${base}_${i}${ext}`)) i++;
        name = `${base}_${i}${ext}`;
      }

      const now = Date.now();
      const node: FileNode = {
        id: genId(),
        name,
        type,
        parentId,
        createdAt: now,
        updatedAt: now,
        ...(type === 'folder'
          ? { children: [], isOpen: true }
          : { content: NEW_FILE_TEMPLATE(name), testMode: 'stdio', testCases: [] }),
      };

      const nodes = { ...state.nodes, [node.id]: node };
      let rootIds = state.rootIds;
      const changed: FileNode[] = [node];

      if (parentId) {
        const parent = { ...nodes[parentId], isOpen: true };
        parent.children = sortIds(nodes, [...(parent.children ?? []), node.id]);
        nodes[parentId] = parent;
        changed.push(parent);
      } else {
        rootIds = sortIds(nodes, [...rootIds, node.id]);
      }

      const activeFileId = type === 'file' ? node.id : state.activeFileId;
      const currentTabs = state.openTabIds ?? [];
      const openTabIds =
        type === 'file' && !currentTabs.includes(node.id)
          ? [...currentTabs, node.id]
          : currentTabs;

      commitFs({ nodes, rootIds, activeFileId, openTabIds });
      await saveNodes(changed);
      await saveFSMeta(rootIds, activeFileId, openTabIds);
    },
    [commitFs]
  );

  const loadProblemTemplate = useCallback(
    async (tpl: ProblemTemplate) => {
      const state = fsRef.current;
      const existing = Object.values(state.nodes).find(
        (n) => n.type === 'file' && n.parentId === null && n.name === tpl.fileName
      );

      const now = Date.now();
      const id = existing ? existing.id : genId();
      const node: FileNode = {
        id,
        name: tpl.fileName,
        type: 'file',
        parentId: null,
        content: tpl.code,
        testMode: tpl.testMode,
        entryFunction: tpl.entryFunction ?? '',
        testCases: tpl.testCases.map((tc) => ({ ...tc })),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const nodes = { ...state.nodes, [id]: node };
      const rootIds = existing ? state.rootIds : sortIds(nodes, [...state.rootIds, id]);
      const currentTabs = state.openTabIds ?? [];
      const openTabIds = currentTabs.includes(id) ? currentTabs : [...currentTabs, id];

      commitFs({ nodes, rootIds, activeFileId: id, openTabIds });
      await saveNode(node);
      await saveFSMeta(rootIds, id, openTabIds);
    },
    [commitFs]
  );

  const renameNode = useCallback(
    async (id: string, rawName: string) => {
      const state = fsRef.current;
      const node = state.nodes[id];
      const name = rawName.replace(/[\\/]/g, '_');
      if (!node || node.name === name) return;
      if (nameExists(state, node.parentId, name, id)) {
        alert(`"${name}" đã tồn tại trong thư mục này.`);
        return;
      }

      const updated = { ...node, name, updatedAt: Date.now() };
      const nodes = { ...state.nodes, [id]: updated };
      let rootIds = state.rootIds;
      const changed: FileNode[] = [updated];

      if (node.parentId) {
        const parent = { ...nodes[node.parentId] };
        parent.children = sortIds(nodes, parent.children ?? []);
        nodes[node.parentId] = parent;
        changed.push(parent);
      } else {
        rootIds = sortIds(nodes, rootIds);
      }

      commitFs({ ...state, nodes, rootIds });
      await saveNodes(changed);
      await saveFSMeta(rootIds, state.activeFileId, state.openTabIds);
    },
    [commitFs]
  );

  const deleteNode = useCallback(
    async (id: string) => {
      const state = fsRef.current;
      const node = state.nodes[id];
      if (!node) return;

      const toDelete: string[] = [];
      const visited = new Set<string>();
      const walk = (nid: string) => {
        if (visited.has(nid)) return;
        visited.add(nid);
        toDelete.push(nid);
        state.nodes[nid]?.children?.forEach(walk);
      };
      walk(id);

      const nodes = { ...state.nodes };
      toDelete.forEach((nid) => delete nodes[nid]);

      let rootIds = state.rootIds;
      const changed: FileNode[] = [];
      if (node.parentId && nodes[node.parentId]) {
        const parent = { ...nodes[node.parentId] };
        parent.children = (parent.children ?? []).filter((c) => c !== id);
        nodes[node.parentId] = parent;
        changed.push(parent);
      } else {
        rootIds = rootIds.filter((r) => r !== id);
      }

      const openTabIds = (state.openTabIds ?? []).filter((tid) => !toDelete.includes(tid));
      let activeFileId = state.activeFileId;
      if (activeFileId && toDelete.includes(activeFileId)) {
        activeFileId =
          openTabIds[openTabIds.length - 1] ??
          Object.values(nodes).find((n) => n.type === 'file')?.id ??
          null;
        if (activeFileId && !openTabIds.includes(activeFileId)) {
          openTabIds.push(activeFileId);
        }
      }

      toDelete.forEach((nid) => {
        clearTimeout(saveTimers.current.get(nid));
        saveTimers.current.delete(nid);
      });

      commitFs({ nodes, rootIds, activeFileId, openTabIds });
      await deleteNodesFromDB(toDelete);
      await saveNodes(changed);
      await saveFSMeta(rootIds, activeFileId, openTabIds);
    },
    [commitFs]
  );

  const toggleFolder = useCallback(
    async (id: string) => {
      const state = fsRef.current;
      const node = state.nodes[id];
      if (!node || node.type !== 'folder') return;
      const updated = { ...node, isOpen: !node.isOpen };
      commitFs({ ...state, nodes: { ...state.nodes, [id]: updated } });
      await saveNode(updated);
    },
    [commitFs]
  );

  const selectFile = useCallback(
    async (id: string) => {
      const state = fsRef.current;
      if (!state.nodes[id] || state.nodes[id].type !== 'file') return;
      const currentTabs = state.openTabIds ?? [];
      const openTabIds = currentTabs.includes(id) ? currentTabs : [...currentTabs, id];
      commitFs({ ...state, activeFileId: id, openTabIds });
      await saveFSMeta(state.rootIds, id, openTabIds);
    },
    [commitFs]
  );

  const closeTab = useCallback(
    async (id: string) => {
      const state = fsRef.current;
      const currentTabs = state.openTabIds ?? [];
      const idx = currentTabs.indexOf(id);
      if (idx === -1) return;

      const openTabIds = currentTabs.filter((tid) => tid !== id);
      let activeFileId = state.activeFileId;
      if (activeFileId === id) {
        activeFileId = openTabIds[idx] ?? openTabIds[idx - 1] ?? null;
      }

      commitFs({ ...state, activeFileId, openTabIds });
      await saveFSMeta(state.rootIds, activeFileId, openTabIds);
    },
    [commitFs]
  );

  const flushSave = useCallback(async (id: string) => {
    clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    const node = fsRef.current.nodes[id];
    if (!node) return;
    await saveNode(node);
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const scheduleSave = useCallback(
    (id: string) => {
      setDirtyIds((prev) => new Set(prev).add(id));
      clearTimeout(saveTimers.current.get(id));
      saveTimers.current.set(id, setTimeout(() => flushSave(id), SAVE_DEBOUNCE_MS));
    },
    [flushSave]
  );

  const patchNode = useCallback(
    (id: string, patch: Partial<FileNode>) => {
      setFs((prev) => {
        const node = prev.nodes[id];
        if (!node) return prev;
        const next = {
          ...prev,
          nodes: { ...prev.nodes, [id]: { ...node, ...patch, updatedAt: Date.now() } },
        };
        fsRef.current = next;
        return next;
      });
      scheduleSave(id);
    },
    [scheduleSave]
  );

  const updateContent = useCallback(
    (id: string, content: string) => patchNode(id, { content }),
    [patchNode]
  );

  const updateTestCases = useCallback(
    (id: string, testCases: TestCase[]) => patchNode(id, { testCases }),
    [patchNode]
  );

  const updateTestConfig = useCallback(
    (id: string, testMode: TestMode, entryFunction?: string) =>
      patchNode(id, {
        testMode,
        ...(entryFunction !== undefined ? { entryFunction } : {}),
      }),
    [patchNode]
  );

  const resetWorkspace = useCallback(async () => {
    saveTimers.current.forEach((t) => clearTimeout(t));
    saveTimers.current.clear();
    setDirtyIds(new Set());
    const fresh = await resetFileSystemInDB();
    commitFs(fresh);
  }, [commitFs]);

  const exportWorkspaceJSON = useCallback(() => {
    const payload = JSON.stringify(fsRef.current, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pydsa-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importWorkspaceJSON = useCallback(
    async (rawJson: string) => {
      const parsed = JSON.parse(rawJson) as FileSystemState;
      if (
        !parsed ||
        typeof parsed.nodes !== 'object' ||
        parsed.nodes === null ||
        !Array.isArray(parsed.rootIds)
      ) {
        throw new Error('File JSON không đúng định dạng PyDSA Workspace.');
      }

      for (const [id, node] of Object.entries(parsed.nodes)) {
        if (
          !node ||
          node.id !== id ||
          typeof node.name !== 'string' ||
          (node.type !== 'file' && node.type !== 'folder')
        ) {
          throw new Error(`Node "${id}" trong file JSON không hợp lệ.`);
        }
      }

      await replaceFileSystemInDB(parsed);
      setDirtyIds(new Set());
      commitFs(parsed);
    },
    [commitFs]
  );

  const downloadActiveFile = useCallback(() => {
    const activeId = fsRef.current.activeFileId;
    const node = activeId ? fsRef.current.nodes[activeId] : null;
    if (!node || node.type !== 'file') return;
    const blob = new Blob([node.content ?? ''], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = node.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const flushAll = () => saveTimers.current.forEach((_, id) => void flushSave(id));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    window.addEventListener('beforeunload', flushAll);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flushSave]);

  return {
    fs,
    loaded,
    dirtyIds,
    activeFile: fs.activeFileId ? fs.nodes[fs.activeFileId] ?? null : null,
    createNode,
    renameNode,
    deleteNode,
    toggleFolder,
    selectFile,
    closeTab,
    updateContent,
    updateTestCases,
    updateTestConfig,
    loadProblemTemplate,
    resetWorkspace,
    exportWorkspaceJSON,
    importWorkspaceJSON,
    downloadActiveFile,
    flushSave,
    getPath,
    getWorkspaceFiles,
  };
}
