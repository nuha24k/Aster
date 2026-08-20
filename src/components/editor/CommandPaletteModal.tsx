import React, { useState, useEffect, useRef } from "react";
import { Terminal, Code } from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  category?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  commands,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          (c.category && c.category.toLowerCase().includes(query.toLowerCase()))
      )
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Header */}
        <div className="p-3 border-b border-zinc-800/80 flex items-center space-x-2 bg-zinc-950/80">
          <Terminal size={16} className="text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search... (Cmd+Shift+P)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
          />
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1 divide-y divide-zinc-800/30">
          {filtered.length > 0 ? (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 text-xs rounded cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-indigo-600/30 text-indigo-100 font-medium"
                      : "text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {cmd.icon || <Code size={14} className="text-zinc-400 shrink-0" />}
                    <span className="font-mono text-zinc-200">{cmd.label}</span>
                  </div>
                  {cmd.shortcut && (
                    <kbd className="px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded text-[10px] font-mono shrink-0 ml-3">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-zinc-500">No matching commands found</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>↑↓ Navigate</span>
          <span>↵ Execute</span>
          <span>esc Dismiss</span>
        </div>
      </div>
    </div>
  );
};
