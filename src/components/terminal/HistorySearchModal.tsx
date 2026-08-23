import React from "react";
import { Search, X, History, CornerDownLeft } from "lucide-react";

interface HistorySearchModalProps {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  filteredHistory: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onSelectIndex: (index: number | ((prev: number) => number)) => void;
  onClose: () => void;
  onApply: (cmd: string) => void;
}

export const HistorySearchModal: React.FC<HistorySearchModalProps> = ({
  isOpen,
  searchQuery,
  selectedIndex,
  filteredHistory,
  inputRef,
  onQueryChange,
  onSelectIndex,
  onClose,
  onApply,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-96 bg-zinc-900 border border-zinc-700/90 rounded-lg shadow-2xl overflow-hidden font-mono text-xs flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <Search size={13} className="text-indigo-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            onQueryChange(e.target.value);
            onSelectIndex(0);
          }}
          placeholder="Fuzzy search command history (Ctrl+R)..."
          className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onSelectIndex((prev) => Math.min(prev + 1, filteredHistory.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onSelectIndex((prev) => Math.max(prev - 1, 0));
            }
            if (e.key === "Enter" && filteredHistory[selectedIndex]) {
              e.preventDefault();
              onApply(filteredHistory[selectedIndex]);
              onClose();
            }
          }}
        />
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
        >
          <X size={13} />
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto py-1">
        {filteredHistory.length === 0 ? (
          <div className="p-3 text-center text-zinc-500 text-[11px]">No history matches found</div>
        ) : (
          filteredHistory.map((cmd, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={cmd + idx}
                onClick={() => {
                  onApply(cmd);
                  onClose();
                }}
                className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                  isSelected
                    ? "bg-indigo-600/30 text-indigo-100 border-l-2 border-indigo-500 font-medium"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <History size={12} className="text-zinc-500 shrink-0" />
                  <span className="truncate">{cmd}</span>
                </div>
                {isSelected && <CornerDownLeft size={11} className="text-indigo-400 shrink-0" />}
              </div>
            );
          })
        )}
      </div>

      <div className="px-3 py-1 border-t border-zinc-800 bg-zinc-950 text-[10px] text-zinc-500 flex justify-between">
        <span>↑↓ navigate</span>
        <span>Enter to insert command</span>
      </div>
    </div>
  );
};
