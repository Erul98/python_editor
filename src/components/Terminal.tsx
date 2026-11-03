'use client';

import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { TerminalLine } from '@/types/runner';

interface TerminalProps {
  lines: TerminalLine[];
  stdin: string;
  onStdinChange: (value: string) => void;
  onClear: () => void;
}

const LINE_STYLES: Record<TerminalLine['type'], string> = {
  stdout: 'text-zinc-200',
  stderr: 'text-red-400',
  info: 'text-sky-400',
  success: 'text-emerald-400',
  system: 'text-zinc-500 italic',
};

export const Terminal: React.FC<TerminalProps> = ({ lines, stdin, onStdinChange, onClear }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  return (
    <div className="flex h-full min-h-0">
      {/* Output */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] px-3 py-1">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Output</span>
          <button
            onClick={onClear}
            title="Clear terminal"
            className="rounded p-1 text-zinc-500 hover:bg-[#2d2d2d] hover:text-zinc-200"
          >
            <Trash2 size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-3 py-2 font-mono text-[13px] leading-relaxed">
          {lines.length === 0 ? (
            <div className="text-zinc-600">
              Nhấn <kbd className="rounded bg-[#2d2d2d] px-1">⌘/Ctrl + Enter</kbd> để chạy code.
            </div>
          ) : (
            lines.map((l) => (
              <pre key={l.id} className={`whitespace-pre-wrap break-words ${LINE_STYLES[l.type]}`}>
                {l.text}
              </pre>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Custom stdin */}
      <div className="flex w-64 shrink-0 flex-col border-l border-[#2d2d2d]">
        <div className="border-b border-[#2d2d2d] px-3 py-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
          stdin (custom input)
        </div>
        <textarea
          value={stdin}
          onChange={(e) => onStdinChange(e.target.value)}
          spellCheck={false}
          placeholder={'Dữ liệu cho input() / sys.stdin\nvd:\n2 7 11 15\n9'}
          className="flex-1 resize-none bg-[#1a1a1a] p-2 font-mono text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      </div>
    </div>
  );
};

