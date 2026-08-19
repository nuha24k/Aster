import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileItem, EditorTabItem } from "../types";
import { isTauriEnvironment } from "../utils/tauri";
import {
  Folder,
  FolderOpen,
  FolderInput,
  ExternalLink,
  FileText,
  FileCode,
  FileJson,
  Save,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  File,
  Code2,
} from "lucide-react";

interface EditorViewProps {
  rootPath: string;
}

interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

export const EditorView: React.FC<EditorViewProps> = ({ rootPath }) => {
  const [currentRoot, setCurrentRoot] = useState<string>(rootPath);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<EditorTabItem[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const activeTab = tabs.find((t) => t.path === activeTabPath);

  // Sync currentRoot when rootPath prop changes (e.g., when terminal cwd updates)
  useEffect(() => {
    if (rootPath && rootPath !== currentRoot) {
      setCurrentRoot(rootPath);
    }
  }, [rootPath]);

  // Load child items for a directory
  const loadChildren = async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const items = await invoke<FileItem[]>("list_dir_files", { path: dirPath });
      return items.map((f) => ({
        name: f.name,
        path: f.path,
        is_dir: f.is_dir,
        children: f.is_dir ? [] : undefined,
        loaded: !f.is_dir,
      }));
    } catch {
      return [];
    }
  };

  // Load root directory contents
  const loadRoot = useCallback(async (root: string) => {
    if (!root) return;
    const children = await loadChildren(root);
    const sorted = [...children].sort((a, b) =>
      (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0) || a.name.localeCompare(b.name)
    );
    setTree(sorted);
    setExpandedFolders(new Set());
  }, []);

  useEffect(() => {
    loadRoot(currentRoot);
  }, [currentRoot, loadRoot]);

  // Open native OS Folder Dialog
  const handleOpenFolderDialog = async () => {
    if (!isTauriEnvironment()) {
      const p = window.prompt("Enter absolute folder path:", currentRoot);
      if (p?.trim()) setCurrentRoot(p.trim());
      return;
    }
    try {
      const selected = await invoke<string | null>("open_folder_dialog");
      if (selected) {
        setCurrentRoot(selected);
      }
    } catch {
      const p = window.prompt("Enter absolute folder path:", currentRoot);
      if (p?.trim()) setCurrentRoot(p.trim());
    }
  };

  // Open current folder in native OS Finder / File Explorer
  const handleOpenInFinder = async () => {
    if (!currentRoot) return;
    try {
      await invoke("open_in_finder", { path: currentRoot });
    } catch (err) {
      console.error("Failed to open Finder:", err);
    }
  };

  // Expand / collapse folder node lazily
  const toggleFolder = async (node: TreeNode) => {
    const isExpanded = expandedFolders.has(node.path);
    if (isExpanded) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }

    if (node.is_dir && !node.loaded) {
      const children = await loadChildren(node.path);
      const sorted = [...children].sort((a, b) =>
        (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0) || a.name.localeCompare(b.name)
      );
      const updateChildren = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.path === node.path) return { ...n, children: sorted, loaded: true };
          if (n.children) return { ...n, children: updateChildren(n.children) };
          return n;
        });
      setTree((prev) => updateChildren(prev));
    }

    setExpandedFolders((prev) => new Set([...prev, node.path]));
  };

  // Open file into active tabs
  const handleOpenFile = async (node: TreeNode) => {
    if (node.is_dir) {
      toggleFolder(node);
      return;
    }

    const existing = tabs.find((t) => t.path === node.path);
    if (existing) {
      setActiveTabPath(node.path);
      return;
    }

    try {
      const content = await invoke<string>("read_file_content", { path: node.path });
      const newTab: EditorTabItem = {
        path: node.path,
        name: node.name,
        content,
        isDirty: false,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabPath(node.path);
    } catch (err) {
      console.error(err);
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!activeTabPath) return;
    setTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTabPath ? { ...tab, content: newContent, isDirty: true } : tab
      )
    );
  };

  const handleSaveFile = async () => {
    if (!activeTab) return;
    try {
      await invoke("save_file_content", { path: activeTab.path, content: activeTab.content });
      setTabs((prev) =>
        prev.map((tab) => (tab.path === activeTab.path ? { ...tab, isDirty: false } : tab))
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Keyboard shortcut Cmd/Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  const handleCloseTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = tabs.filter((t) => t.path !== path);
    setTabs(remaining);
    if (activeTabPath === path) {
      setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
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
      case "html":
      case "css":
        return <FileCode size={14} className="text-pink-400 shrink-0" />;
      default:
        return <File size={14} className="text-zinc-400 shrink-0" />;
    }
  };

  // Flatten tree for filtering search results
  const flattenTree = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((n) => [n, ...(n.is_dir && n.children ? flattenTree(n.children) : [])]);

  const searchResults = searchQuery.trim()
    ? flattenTree(tree).filter(
        (n) => !n.is_dir && n.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeTabPath === node.path;

    if (node.is_dir) {
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleFolder(node)}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            className="flex items-center space-x-1.5 py-1 px-2 rounded hover:bg-zinc-800/70 text-zinc-300 cursor-pointer transition-colors text-xs"
          >
            {isExpanded ? (
              <ChevronDown size={13} className="text-zinc-400 shrink-0" />
            ) : (
              <ChevronRight size={13} className="text-zinc-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="text-indigo-400 shrink-0" />
            ) : (
              <Folder size={14} className="text-indigo-400/80 shrink-0" />
            )}
            <span className="truncate font-mono text-[11px]">{node.name}</span>
          </div>

          {isExpanded && node.children && node.children.length > 0 && (
            <div>
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        onClick={() => handleOpenFile(node)}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        className={`flex items-center space-x-1.5 py-1 px-2 rounded text-xs cursor-pointer transition-colors ${
          isActive
            ? "bg-indigo-950/70 text-indigo-200 font-medium border-l-2 border-indigo-500"
            : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {renderFileIcon(node.name)}
        <span className="truncate font-mono text-[11px]">{node.name}</span>
      </div>
    );
  };

  const lineCount = activeTab ? activeTab.content.split("\n").length : 0;
  const rootFolderName = currentRoot.split(/[/\\]/).filter(Boolean).pop() || "Workspace";

  return (
    <div className="flex h-full w-full bg-zinc-950 text-zinc-200 select-none overflow-hidden font-sans">
      {/* Sidebar Explorer */}
      <div className="w-60 bg-zinc-900/80 border-r border-zinc-800 flex flex-col justify-between">
        <div className="p-2 space-y-2 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-2 pt-1 pb-1 border-b border-zinc-800/60">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              EXPLORER
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={handleOpenFolderDialog}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="Open Folder Dialog..."
              >
                <FolderInput size={13} />
              </button>
              <button
                onClick={handleOpenInFinder}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="Open in Finder / File Manager"
              >
                <ExternalLink size={13} />
              </button>
              <button
                onClick={() => loadRoot(currentRoot)}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="Refresh File Tree"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Root Directory Display */}
          <div
            onClick={handleOpenInFinder}
            className="flex items-center justify-between px-2 py-1 bg-zinc-950/60 rounded border border-zinc-800/80 text-xs cursor-pointer hover:border-zinc-700 transition-colors"
            title={`Click to open in Finder: ${currentRoot}`}
          >
            <div className="flex items-center space-x-1.5 truncate">
              <FolderOpen size={13} className="text-indigo-400 shrink-0" />
              <span className="font-mono text-[11px] text-zinc-200 truncate font-semibold">
                {rootFolderName}
              </span>
            </div>
            <ExternalLink size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0" />
          </div>

          {/* Search Bar */}
          <div className="relative px-1">
            <Search size={12} className="absolute left-3 top-2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Collapsible File Tree */}
          <div className="py-1">
            {searchResults ? (
              searchResults.length > 0 ? (
                searchResults.map((n) => (
                  <div
                    key={n.path}
                    onClick={() => handleOpenFile(n)}
                    className={`flex items-center space-x-1.5 py-1 px-2 rounded text-xs cursor-pointer transition-colors ${
                      activeTabPath === n.path
                        ? "bg-indigo-950/70 text-indigo-200 font-medium border-l-2 border-indigo-500"
                        : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {renderFileIcon(n.name)}
                    <span className="truncate font-mono text-[11px]">{n.name}</span>
                  </div>
                ))
              ) : (
                <div className="text-[11px] text-zinc-500 px-2 py-2">
                  No files match "{searchQuery}"
                </div>
              )
            ) : (
              tree.map((node) => renderTreeNode(node, 0))
            )}
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
        {/* Tabs Bar */}
        <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center px-1 space-x-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => setActiveTabPath(tab.path)}
                className={`flex items-center space-x-2 px-3 py-1.5 text-xs cursor-pointer border-t-2 border-r border-zinc-800/80 transition-colors shrink-0 ${
                  isActive
                    ? "bg-zinc-950 border-t-indigo-500 text-zinc-100 font-medium"
                    : "bg-zinc-900/60 border-t-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                {renderFileIcon(tab.name)}
                <span className="font-mono text-[11px]">{tab.name}</span>
                {tab.isDirty ? (
                  <span className="w-2 h-2 bg-amber-400 rounded-full" title="Unsaved changes" />
                ) : (
                  <button
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    className="hover:bg-zinc-800 hover:text-rose-400 p-0.5 rounded transition-colors text-zinc-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Active Tab Content */}
        {activeTab ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Breadcrumb Header */}
            <div className="h-7 bg-zinc-900/40 border-b border-zinc-800/80 flex items-center justify-between px-3 text-xs text-zinc-400">
              <div className="flex items-center space-x-1.5 font-mono text-[11px] text-zinc-400 truncate">
                <span>{rootFolderName}</span>
                <span>/</span>
                <span className="text-zinc-200 font-semibold">
                  {activeTab.path.replace(currentRoot, "").replace(/^[/\\]/, "")}
                </span>
              </div>
              <button
                onClick={handleSaveFile}
                disabled={!activeTab.isDirty}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium transition-colors"
              >
                <Save size={12} />
                <span>Save</span>
              </button>
            </div>

            {/* Code Textarea */}
            <textarea
              value={activeTab.content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="flex-1 w-full h-full bg-zinc-950 p-4 font-mono text-xs text-zinc-100 focus:outline-none resize-none leading-relaxed selection:bg-indigo-900/60"
              spellCheck={false}
            />

            {/* Status Bar */}
            <div className="h-6 bg-indigo-950/80 border-t border-indigo-900/60 flex items-center justify-between px-3 text-[10px] text-indigo-300 font-mono select-none">
              <div className="flex items-center space-x-3">
                <span>UTF-8</span>
                <span>{activeTab.name.split(".").pop()?.toUpperCase() || "TXT"}</span>
              </div>
              <div>Lines: {lineCount}</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs space-y-3 select-none">
            <Code2 size={40} className="text-zinc-700" />
            <div>Select a file from the explorer tree to start editing</div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={handleOpenFolderDialog}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded text-xs transition-colors"
              >
                <FolderInput size={13} />
                <span>Open Folder...</span>
              </button>
              <button
                onClick={handleOpenInFinder}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded text-xs transition-colors"
              >
                <ExternalLink size={13} />
                <span>Open in Finder</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
