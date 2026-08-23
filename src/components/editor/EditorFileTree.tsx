import React from "react";
import {
  Folder,
  FolderOpen,
  FolderInput,
  ExternalLink,
  FileText,
  FilePlus,
  FileCode,
  FileJson,
  Search,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  File,
  Code2,
} from "lucide-react";

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

interface EditorFileTreeProps {
  currentRoot: string;
  rootFolderName: string;
  tree: TreeNode[];
  expandedFolders: Set<string>;
  activeTabPath: string | null;
  searchQuery: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setSearchQuery: (query: string) => void;
  onToggleFolder: (node: TreeNode) => void;
  onOpenFile: (node: TreeNode) => void;
  onNewFile: () => void;
  onNewFileOnDisk: () => void;
  onOpenFolderDialog: () => void;
  onOpenInFinder: () => void;
  onRefreshRoot: () => void;
}

export const renderFileIcon = (fileName: string) => {
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

export const EditorFileTree: React.FC<EditorFileTreeProps> = ({
  currentRoot,
  rootFolderName,
  tree,
  expandedFolders,
  activeTabPath,
  searchQuery,
  searchRef,
  setSearchQuery,
  onToggleFolder,
  onOpenFile,
  onNewFile,
  onNewFileOnDisk,
  onOpenFolderDialog,
  onOpenInFinder,
  onRefreshRoot,
}) => {
  const flattenTree = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((n) => [n, ...(n.is_dir && n.children ? flattenTree(n.children) : [])]);

  const searchResults = searchQuery.trim()
    ? flattenTree(tree).filter(
        (n) => !n.is_dir && n.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeTabPath === node.path;

    if (node.is_dir) {
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => onToggleFolder(node)}
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
            <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        onClick={() => onOpenFile(node)}
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

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col shrink-0">
      {/* Directory Header */}
      <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center space-x-2 min-w-0 pr-1">
          <Folder size={15} className="text-indigo-400 shrink-0" />
          <span
            className="font-medium text-xs text-zinc-200 truncate font-mono"
            title={currentRoot}
          >
            {rootFolderName}
          </span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={onNewFile}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="New Scratch File"
          >
            <FilePlus size={13} />
          </button>
          <button
            onClick={onNewFileOnDisk}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="New File on Disk..."
          >
            <FileCode size={13} />
          </button>
          <button
            onClick={onOpenFolderDialog}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="Open Folder..."
          >
            <FolderInput size={13} />
          </button>
          <button
            onClick={onOpenInFinder}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="Reveal in OS Explorer / Finder"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={onRefreshRoot}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="Refresh Explorer"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Quick Search Input */}
      <div className="px-2.5 py-2 border-b border-zinc-800/60 bg-zinc-900/20">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search files... (Cmd+P)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 transition-colors font-mono"
          />
        </div>
      </div>

      {/* Explorer Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
        {!currentRoot ? (
          <div className="p-4 text-center text-xs text-zinc-500">
            No folder loaded. Use the top icons to open a folder.
          </div>
        ) : searchResults ? (
          searchResults.length > 0 ? (
            searchResults.map((node) => renderTreeNode(node))
          ) : (
            <div className="p-3 text-center text-xs text-zinc-500">No matching files</div>
          )
        ) : tree.length > 0 ? (
          tree.map((node) => renderTreeNode(node))
        ) : (
          <div className="p-3 text-center text-xs text-zinc-500">Empty directory</div>
        )}
      </div>
    </div>
  );
};
