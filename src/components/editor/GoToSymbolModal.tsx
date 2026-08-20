import React, { useState, useEffect, useRef } from "react";
import { Search, Code, Layers, Box, Cpu } from "lucide-react";

export interface DocumentSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "constant" | "variable" | "type";
  lineNumber: number;
}

interface GoToSymbolModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onSelectSymbol: (lineNumber: number) => void;
}

export const GoToSymbolModal: React.FC<GoToSymbolModalProps> = ({
  isOpen,
  onClose,
  content,
  onSelectSymbol,
}) => {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Parse symbols from active content using pattern matching
      const lines = content.split("\n");
      const parsed: DocumentSymbol[] = [];

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        // Functions / Arrow functions / Methods
        const fnMatch = trimmed.match(/(?:async\s+)?function\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(/);
        if (fnMatch) {
          parsed.push({ name: fnMatch[1] || fnMatch[2], kind: "function", lineNumber: lineNum });
          return;
        }

        // Classes / Structs
        const classMatch = trimmed.match(/(?:export\s+)?(?:class|struct|enum)\s+([a-zA-Z0-9_]+)/);
        if (classMatch) {
          parsed.push({ name: classMatch[1], kind: "class", lineNumber: lineNum });
          return;
        }

        // Interfaces / Types
        const typeMatch = trimmed.match(/(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_]+)/);
        if (typeMatch) {
          parsed.push({ name: typeMatch[1], kind: "interface", lineNumber: lineNum });
          return;
        }

        // Rust fn / pub fn
        const rustFnMatch = trimmed.match(/(?:pub\s+)?fn\s+([a-zA-Z0-9_]+)/);
        if (rustFnMatch) {
          parsed.push({ name: rustFnMatch[1], kind: "function", lineNumber: lineNum });
          return;
        }
      });

      setSymbols(parsed);
    }
  }, [isOpen, content]);

  const filtered = query.trim()
    ? symbols.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : symbols;

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
      onSelectSymbol(filtered[selectedIndex].lineNumber);
      onClose();
    }
  };

  const renderSymbolIcon = (kind: DocumentSymbol["kind"]) => {
    switch (kind) {
      case "function":
        return <Code size={14} className="text-purple-400 shrink-0" />;
      case "class":
        return <Box size={14} className="text-amber-400 shrink-0" />;
      case "interface":
        return <Layers size={14} className="text-blue-400 shrink-0" />;
      default:
        return <Cpu size={14} className="text-emerald-400 shrink-0" />;
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
        <div className="p-3 border-b border-zinc-800/80 flex items-center space-x-2 bg-zinc-950/80">
          <Search size={16} className="text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to symbol in file... (Cmd+Shift+O)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1 divide-y divide-zinc-800/30">
          {filtered.length > 0 ? (
            filtered.map((sym, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${sym.name}_${sym.lineNumber}`}
                  onClick={() => {
                    onSelectSymbol(sym.lineNumber);
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
                    {renderSymbolIcon(sym.kind)}
                    <span className="font-mono text-zinc-200">{sym.name}</span>
                    <span className="text-[10px] text-zinc-500 capitalize">({sym.kind})</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400">Line {sym.lineNumber}</span>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-zinc-500">No symbols found in this file</div>
          )}
        </div>

        <div className="px-3 py-1.5 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>↑↓ Navigate</span>
          <span>↵ Jump to symbol</span>
          <span>esc Dismiss</span>
        </div>
      </div>
    </div>
  );
};
