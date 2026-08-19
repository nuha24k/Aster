import React, { useState } from "react";
import { useWorkspaceStore } from "../store";
import { AgentStatus } from "../types";
import {
  Folder,
  Terminal as TermIcon,
  CheckCircle2,
  AlertCircle,
  Play,
  Circle,
  FolderPlus,
  SplitSquareVertical,
  SplitSquareHorizontal,
  Trash2,
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const {
    workspaces,
    currentWorkspaceId,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    terminals,
    activeTerminalId,
    setActiveTerminal,
    splitPane,
    closePane,
    sidebarOpen,
    activeSurface,
    setActiveSurface,
  } = useWorkspaceStore();

  const [newWsName, setNewWsName] = useState("");
  const [newWsPath, setNewWsPath] = useState("");
  const [showNewWsInput, setShowNewWsInput] = useState(false);

  if (!sidebarOpen) return null;

  // Add terminal as a split pane in the layout (multiplexer behaviour)
  const handleAddTerminal = () => {
    if (!activeTerminalId) return;
    splitPane(activeTerminalId, "Vertical");
    if (activeSurface !== "Terminal") setActiveSurface("Terminal");
  };

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    const path =
      newWsPath.trim() ||
      (newWsName.trim().startsWith("/")
        ? newWsName.trim()
        : `/Users/sofwannuhaalfaruq/Documents/${newWsName.trim()}`);
    createWorkspace(newWsName.trim(), path);
    setNewWsName("");
    setNewWsPath("");
    setShowNewWsInput(false);
  };

  const renderStatusBadge = (status: AgentStatus) => {
    switch (status) {
      case "Working":
        return <Play size={12} className="text-amber-400 animate-pulse" />;
      case "Blocked":
        return <AlertCircle size={12} className="text-rose-400" />;
      case "Done":
        return <CheckCircle2 size={12} className="text-emerald-400" />;
      default:
        return <Circle size={10} className="text-zinc-500 fill-zinc-500" />;
    }
  };

  return (
    <aside className="w-56 bg-zinc-900/70 border-r border-zinc-800 flex flex-col justify-between text-xs select-none">
      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Workspaces Section */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            <span>Workspaces</span>
            <button
              onClick={() => setShowNewWsInput(!showNewWsInput)}
              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 p-0.5 rounded transition-colors"
              title="New Workspace"
            >
              <FolderPlus size={13} />
            </button>
          </div>

          {showNewWsInput && (
            <form
              onSubmit={handleCreateWorkspace}
              className="mb-2 space-y-1 bg-zinc-950 p-2 rounded border border-zinc-800"
            >
              <input
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="Workspace name..."
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <input
                type="text"
                value={newWsPath}
                onChange={(e) => setNewWsPath(e.target.value)}
                placeholder="Absolute path (optional)..."
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-1 rounded text-xs transition-colors"
              >
                Create Workspace
              </button>
            </form>
          )}

          <div className="space-y-1">
            {workspaces.map((ws) => {
              const isSelected = ws.id === currentWorkspaceId;
              return (
                <div
                  key={ws.id}
                  onClick={() => switchWorkspace(ws.id)}
                  className={`group flex items-center justify-between p-2 rounded cursor-pointer border transition-all ${
                    isSelected
                      ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Folder size={14} className={isSelected ? "text-indigo-400 shrink-0" : "text-zinc-500 shrink-0"} />
                    <div className="flex flex-col truncate">
                      <span className="truncate font-medium">{ws.name}</span>
                      {ws.root_path && (
                        <span className="text-[10px] text-zinc-500 font-mono truncate">
                          {ws.root_path.split(/[/\\]/).slice(-2).join("/")}
                        </span>
                      )}
                    </div>
                  </div>
                  {workspaces.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkspace(ws.id);
                      }}
                      className="hover:text-rose-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="Delete Workspace"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Terminal Panes Section */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            <span>Terminal Panes</span>
            <div className="flex items-center space-x-0.5">
              <button
                onClick={handleAddTerminal}
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 p-0.5 rounded transition-colors"
                title="Split Vertical (Cmd/Ctrl+D)"
              >
                <SplitSquareVertical size={13} />
              </button>
              <button
                onClick={() => {
                  if (!activeTerminalId) return;
                  splitPane(activeTerminalId, "Horizontal");
                  if (activeSurface !== "Terminal") setActiveSurface("Terminal");
                }}
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 p-0.5 rounded transition-colors"
                title="Split Horizontal (Cmd/Ctrl+Shift+D)"
              >
                <SplitSquareHorizontal size={13} />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {terminals.map((term) => {
              const isActive = term.id === activeTerminalId;
              return (
                <div
                  key={term.id}
                  onClick={() => {
                    setActiveTerminal(term.id);
                    if (activeSurface !== "Terminal") setActiveSurface("Terminal");
                  }}
                  className={`group flex items-center justify-between p-2 rounded cursor-pointer border transition-all ${
                    isActive
                      ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <TermIcon size={13} className={isActive ? "text-indigo-400 shrink-0" : "text-zinc-500 shrink-0"} />
                    <span className="truncate">{term.title}</span>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    {renderStatusBadge(term.status)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closePane(term.id);
                      }}
                      className="hover:text-rose-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Terminal Pane"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-zinc-800 text-[11px] text-zinc-500 flex justify-between items-center">
        <span>Tauri + React Engine</span>
        <span className="text-emerald-500 font-mono">v1.1.0</span>
      </div>
    </aside>
  );
};
