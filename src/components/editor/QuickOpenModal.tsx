import React, { useState, useEffect, useRef } from "react";
import { Search, FileCode, FileText, FileJson, Code2, File } from "lucide-react";
import { safeInvoke } from "../../utils/tauri";
import { FileItem } from "../../types";

interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onSelectFile: (filePath: string, fileName: string) => void;
}

export const QuickOpenModal: React.FC<QuickOpenModalProps> = ({
  isOpen,
  onClose,
  rootPath,
  onSelectFile,
}) => {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<{ path: string; name: string; relPath: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Collect all files in rootPath recursively (ignoring build dirs)
      const fetchWorkspaceFiles = async () => {
        try {
          const collectFiles = async (dir: string): Promise<{ path: string; name: string; relPath: string }[]> => {
            const items = await safeInvoke<FileItem[]>("list_dir_files", { path: dir });
            let result: { path: string; name: string; relPath: string }[] = [];
            for (const item of items) {
              const rel = item.path.replace(rootPath, "").replace(/^[/\\]/, "");
              if (item.is_dir) {
                // Skip large build directories
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

          const allFiles = await collectFiles(rootPath);
          setFiles(allFiles);
        } catch (err) {
          console.error("Failed to load workspace files for Quick Open:", err);
        }
      };

      fetchWorkspaceFiles();
    }
  }, [isOpen, rootPath]);

  const filtered = query.trim()
    ? files.filter(
        (f) =>
          f.name.toLowerCase().includes(query.toLowerCase()) ||
          f.relPath.toLowerCase().includes(query.toLowerCase())
      )
    : files;

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
      const target = filtered[selectedIndex];
      onSelectFile(target.path, target.name);
      onClose();
    }
  };

  const renderFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return <FileCode size={14} className="text-blue-400 shrink-0" />;
      case "js":
      case "jsx":
        return <FileCode size={14} className="text-yellow-400 shrink-0" />;
      case "rs":
        return <Code2 size={14} className="text-orange-400 shrink-0" />;
      case "json":
        return <FileJson size={14} className="text-yellow-500 shrink-0" />;
      case "md":
        return <FileText size={14} className="text-sky-300 shrink-0" />;
      default:
        return <File size={14} className="text-zinc-400 shrink-0" />;
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
        {/* Input header */}
        <div className="p-3 border-b border-zinc-800/80 flex items-center space-x-2 bg-zinc-950/80">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a file name to open... (Cmd+P)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
          />
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1 divide-y divide-zinc-800/30">
          {filtered.length > 0 ? (
            filtered.slice(0, 50).map((file, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={file.path}
                  onClick={() => {
                    onSelectFile(file.path, file.name);
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
                    {renderFileIcon(file.name)}
                    <span className="font-mono text-zinc-200">{file.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500 truncate ml-4">
                    {file.relPath}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-zinc-500">No matching files found</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>esc Dismiss</span>
        </div>
      </div>
    </div>
  );
};
