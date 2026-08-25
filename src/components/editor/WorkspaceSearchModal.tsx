import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { safeInvoke } from "../../utils/tauri";
import { FileItem } from "../../types";

export interface SearchMatch {
  path: string;
  name: string;
  relPath: string;
  lineNumber: number;
  lineContent: string;
}

interface WorkspaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onSelectMatch: (filePath: string, fileName: string, lineNumber: number) => void;
}

export const WorkspaceSearchModal: React.FC<WorkspaceSearchModalProps> = ({
  isOpen,
  onClose,
  rootPath,
  onSelectMatch,
}) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setMatches([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setMatches([]);
      return;
    }

    setIsSearching(true);
    try {
      // Scan workspace files
      const collectFiles = async (dir: string): Promise<{ path: string; name: string; relPath: string }[]> => {
        const items = await safeInvoke<FileItem[]>("list_dir_files", { path: dir });
        let result: { path: string; name: string; relPath: string }[] = [];
        for (const item of items) {
          const rel = item.path.replace(rootPath, "").replace(/^[/\\]/, "");
          if (item.is_dir) {
            if (
              !item.name.startsWith(".") &&
              item.name !== "node_modules" &&
              item.name !== "target" &&
              item.name !== "dist"
            ) {
              const subFiles = await collectFiles(item.path);
              result = [...result, ...subFiles];
            }
          } else {
            result.push({ path: item.path, name: item.name, relPath: rel });
          }
        }
        return result;
      };

      const files = await collectFiles(rootPath);
      const searchResults: SearchMatch[] = [];

      for (const file of files) {
        // Skip binary or large files based on extension
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (["png", "jpg", "jpeg", "gif", "ico", "icns", "pdf", "zip", "tar", "gz", "exe", "dll"].includes(ext || "")) {
          continue;
        }

        try {
          const content = await safeInvoke<string>("read_file_content", { path: file.path });
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
              searchResults.push({
                path: file.path,
                name: file.name,
                relPath: file.relPath,
                lineNumber: idx + 1,
                lineContent: line.trim(),
              });
            }
          });
        } catch {
          // ignore unreadable files
        }

        if (searchResults.length >= 100) break;
      }

      setMatches(searchResults);
    } catch (err) {
      console.error("Workspace search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (matches.length > 0 ? (prev + 1) % matches.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (matches.length > 0 ? (prev - 1 + matches.length) % matches.length : 0));
    } else if (e.key === "Enter" && matches[selectedIndex]) {
      e.preventDefault();
      const m = matches[selectedIndex];
      onSelectMatch(m.path, m.name, m.lineNumber);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col"
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
            placeholder="Search text across workspace... (Cmd+Shift+F)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
          />
          {isSearching && <Loader2 size={16} className="animate-spin text-indigo-400 shrink-0" />}
        </div>

        <div className="max-h-96 overflow-y-auto p-1 divide-y divide-zinc-800/30">
          {matches.length > 0 ? (
            matches.map((m, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${m.path}_${m.lineNumber}_${idx}`}
                  onClick={() => {
                    onSelectMatch(m.path, m.name, m.lineNumber);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex flex-col px-3 py-2 text-xs rounded cursor-pointer transition-colors space-y-1 ${
                    isSelected
                      ? "bg-indigo-600/30 text-indigo-100"
                      : "text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-indigo-300 font-semibold truncate">{m.relPath}</span>
                    <span className="text-zinc-500 shrink-0 ml-2">Line {m.lineNumber}</span>
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400 truncate bg-zinc-950/60 px-2 py-1 rounded border border-zinc-800/50">
                    {m.lineContent}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-xs text-zinc-500">
              {query.trim() ? (isSearching ? "Searching workspace..." : "No matches found") : "Type to search workspace"}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>↑↓ Navigate</span>
          <span>↵ Jump to match</span>
          <span>esc Dismiss</span>
        </div>
      </div>
    </div>
  );
};
