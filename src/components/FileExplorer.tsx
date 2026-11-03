'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode2,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  Edit2,
  Trash2,
} from 'lucide-react';
import { FileNode, FileNodeType, FileSystemState } from '@/types/fs';

interface FileExplorerProps {
  fs: FileSystemState;
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateNode: (name: string, type: FileNodeType, parentId: string | null) => void;
  onRenameNode: (id: string, newName: string) => void;
  onDeleteNode: (id: string) => void;
  onToggleFolder: (folderId: string) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  fs,
  activeFileId,
  onSelectFile,
  onCreateNode,
  onRenameNode,
  onDeleteNode,
  onToggleFolder,
}) => {
  // Creation state
  const [creatingType, setCreatingType] = useState<FileNodeType | null>(null);
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [newEntryName, setNewEntryName] = useState('');

  // Renaming state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  // Ngăn onBlur gọi lại handleCommit khi người dùng vừa bấm Enter hoặc Escape
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (creatingType || editingId) {
      skipBlurRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [creatingType, editingId]);

  const handleStartCreate = (type: FileNodeType, parentId: string | null = null) => {
    skipBlurRef.current = false;
    setCreatingType(type);
    setTargetParentId(parentId);
    setNewEntryName(type === 'file' ? 'solution.py' : 'new_folder');
    setEditingId(null);
  };

  const handleCommitCreate = (fromBlur = false) => {
    if (fromBlur && skipBlurRef.current) return;
    skipBlurRef.current = true;

    const trimmed = newEntryName.trim();
    if (trimmed && creatingType) {
      const finalName =
        creatingType === 'file' && !trimmed.endsWith('.py') ? `${trimmed}.py` : trimmed;
      onCreateNode(finalName, creatingType, targetParentId);
    }
    setCreatingType(null);
    setTargetParentId(null);
    setNewEntryName('');
  };

  const handleCancelCreate = () => {
    skipBlurRef.current = true;
    setCreatingType(null);
    setTargetParentId(null);
    setNewEntryName('');
  };

  const handleStartRename = (node: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    skipBlurRef.current = false;
    setEditingId(node.id);
    setEditingName(node.name);
    setCreatingType(null);
  };

  const handleCommitRename = (id: string, fromBlur = false) => {
    if (fromBlur && skipBlurRef.current) return;
    skipBlurRef.current = true;

    const trimmed = editingName.trim();
    if (trimmed && fs.nodes[id]) {
      const node = fs.nodes[id];
      const finalName =
        node.type === 'file' && !trimmed.endsWith('.py') ? `${trimmed}.py` : trimmed;
      onRenameNode(id, finalName);
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelRename = () => {
    skipBlurRef.current = true;
    setEditingId(null);
    setEditingName('');
  };

  const renderTree = (nodeId: string, depth: number = 0, visited: Set<string> = new Set()) => {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);

    const node = fs.nodes[nodeId];
    if (!node) return null;

    const isFolder = node.type === 'folder';
    const isSelected = activeFileId === node.id;
    const isEditing = editingId === node.id;

    return (
      <div key={node.id} className="select-none text-xs">
        {/* Node Row */}
        <div
          onClick={() => {
            if (isFolder) {
              onToggleFolder(node.id);
            } else {
              onSelectFile(node.id);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2.5 cursor-pointer transition-colors duration-150 rounded-sm ${
            isSelected
              ? 'bg-[#37373d] text-white font-medium'
              : 'text-zinc-400 hover:bg-[#2a2d2e] hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isFolder ? (
              <span className="text-zinc-500 hover:text-zinc-300">
                {node.isOpen ? (
                  <ChevronDown size={14} className="shrink-0" />
                ) : (
                  <ChevronRight size={14} className="shrink-0" />
                )}
              </span>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            {isFolder ? (
              node.isOpen ? (
                <FolderOpen size={15} className="text-amber-400 shrink-0" />
              ) : (
                <Folder size={15} className="text-amber-400 shrink-0" />
              )
            ) : (
              <FileCode2 size={15} className="text-sky-400 shrink-0" />
            )}

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitRename(node.id, false);
                  if (e.key === 'Escape') handleCancelRename();
                }}
                onBlur={() => handleCommitRename(node.id, true)}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1e1e1e] border border-sky-500 rounded px-1.5 py-0.5 text-xs text-white outline-none w-full"
              />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </div>

          {/* Action buttons (Rename / Delete / Add inside folder) */}
          <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
            {isFolder && (
              <>
                <button
                  title="New File Inside"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!node.isOpen) onToggleFolder(node.id);
                    handleStartCreate('file', node.id);
                  }}
                  className="p-1 hover:text-white rounded hover:bg-[#383b3d]"
                >
                  <FilePlus size={13} />
                </button>
                <button
                  title="New Folder Inside"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!node.isOpen) onToggleFolder(node.id);
                    handleStartCreate('folder', node.id);
                  }}
                  className="p-1 hover:text-white rounded hover:bg-[#383b3d]"
                >
                  <FolderPlus size={13} />
                </button>
              </>
            )}
            <button
              title="Rename"
              onClick={(e) => handleStartRename(node, e)}
              className="p-1 hover:text-white rounded hover:bg-[#383b3d]"
            >
              <Edit2 size={13} />
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${node.name}?`)) {
                  onDeleteNode(node.id);
                }
              }}
              className="p-1 hover:text-red-400 rounded hover:bg-[#383b3d]"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Children Render */}
        {isFolder && node.isOpen && (
          <div>
            {creatingType && targetParentId === node.id && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                className="flex items-center gap-1.5 py-1 pr-2"
              >
                {creatingType === 'folder' ? (
                  <Folder size={14} className="text-amber-400 shrink-0" />
                ) : (
                  <FileCode2 size={14} className="text-sky-400 shrink-0" />
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={newEntryName}
                  onChange={(e) => setNewEntryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitCreate(false);
                    if (e.key === 'Escape') handleCancelCreate();
                  }}
                  onBlur={() => handleCommitCreate(true)}
                  className="bg-[#1e1e1e] border border-sky-500 rounded px-1.5 py-0.5 text-xs text-white outline-none w-full"
                />
              </div>
            )}

            {node.children &&
              node.children.map((childId) => renderTree(childId, depth + 1, new Set(visited)))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 h-full bg-[#181818] border-r border-[#2d2d2d] flex flex-col select-none text-zinc-300">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2d2d2d]">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleStartCreate('file', null)}
            title="New File (Root)"
            className="p-1 text-zinc-400 hover:text-white hover:bg-[#2d2d2d] rounded transition-colors"
          >
            <FilePlus size={15} />
          </button>
          <button
            onClick={() => handleStartCreate('folder', null)}
            title="New Folder (Root)"
            className="p-1 text-zinc-400 hover:text-white hover:bg-[#2d2d2d] rounded transition-colors"
          >
            <FolderPlus size={15} />
          </button>
        </div>
      </div>

      {/* File Tree Body */}
      <div className="flex-1 overflow-y-auto py-2">
        {creatingType && targetParentId === null && (
          <div className="flex items-center gap-1.5 px-3 py-1">
            {creatingType === 'folder' ? (
              <Folder size={14} className="text-amber-400 shrink-0" />
            ) : (
              <FileCode2 size={14} className="text-sky-400 shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={newEntryName}
              onChange={(e) => setNewEntryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitCreate(false);
                if (e.key === 'Escape') handleCancelCreate();
              }}
              onBlur={() => handleCommitCreate(true)}
              className="bg-[#1e1e1e] border border-sky-500 rounded px-1.5 py-0.5 text-xs text-white outline-none w-full"
            />
          </div>
        )}

        {fs.rootIds.length === 0 && !creatingType ? (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            No files yet. Click + to create your first Python script.
          </div>
        ) : (
          fs.rootIds.map((rootId) => renderTree(rootId, 0))
        )}
      </div>
    </div>
  );
};
