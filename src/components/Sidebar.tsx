import React, { useState } from "react";
import { useWorkspaceStore } from "../store";
import { AgentStatus, getLayoutLeaves } from "../types";
import { safeInvoke, isDesktopEnvironment } from "../utils/tauri";
import {
  Folder,
  Terminal as TermIcon,
  CheckCircle2,
  AlertCircle,
  Play,
  Circle,
  FolderPlus,
  Trash2,
  FolderOpen,
  Plus,
  Layers,
  ChevronDown,
  ChevronRight,
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
    openTerminal,
    closePane,
    sidebarOpen,
    activeSurface,
    setActiveSurface,
  } = useWorkspaceStore();

  const [newWsName, setNewWsName] = useState("");
  const [newWsPath, setNewWsPath] = useState("");
  const [showNewWsInput, setShowNewWsInput] = useState(false);
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});

  if (!sidebarOpen) return null;

  const toggleWorkspaceCollapse = (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedWorkspaces((prev) => ({ ...prev, [wsId]: !prev[wsId] }));
  };

  const handleBrowseFolder = async () => {
    if (!isDesktopEnvironment()) return;
    try {
      const selectedPath = await safeInvoke<string | null>("open_folder_dialog");
      if (selectedPath) {
        setNewWsPath(selectedPath);
        if (!newWsName.trim()) {
          const folderName = selectedPath.split(/[/\\]/).filter(Boolean).pop() || "";
          setNewWsName(folderName);
        }
      }
    } catch (_) {}
  };

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    createWorkspace(newWsName.trim(), newWsPath.trim());
    setNewWsName("");
    setNewWsPath("");
    setShowNewWsInput(false);
  };

  const renderStatusBadge = (status: AgentStatus) => {
    switch (status) {
      case "Working":
        return <Play size={11} className="text-amber-400 animate-pulse shrink-0" />;
      case "Blocked":
        return <AlertCircle size={11} className="text-rose-400 shrink-0" />;
      case "Done":
        return <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />;
      default:
        return <Circle size={9} className="text-zinc-500 fill-zinc-500 shrink-0" />;
    }
  };

  // Calculate global running process stats
  const totalWorking = terminals.filter((t) => t.status === "Working").length;
  const totalBlocked = terminals.filter((t) => t.status === "Blocked").length;

  return (
    <aside className="w-60 bg-zinc-900/80 border-r border-zinc-800 flex flex-col justify-between text-xs select-none">
      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        {/* Workspace & Terminal Groups Header */}
        <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          <div className="flex items-center space-x-1">
            <Layers size={12} className="text-indigo-400" />
            <span>Workspace Groups</span>
          </div>
          <button
            onClick={() => setShowNewWsInput(!showNewWsInput)}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 p-1 rounded transition-colors flex items-center space-x-1"
            title="New Workspace"
          >
            <FolderPlus size={13} />
          </button>
        </div>

        {/* New Workspace Form Modal */}
        {showNewWsInput && (
          <form
            onSubmit={handleCreateWorkspace}
            className="space-y-1.5 bg-zinc-950 p-2.5 rounded-md border border-zinc-800 shadow-lg"
          >
            <div className="text-[11px] font-semibold text-zinc-300">Create New Workspace</div>
            <input
              type="text"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="Workspace name..."
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <div className="flex gap-1">
              <input
                type="text"
                value={newWsPath}
                onChange={(e) => {
                  const pathVal = e.target.value;
                  setNewWsPath(pathVal);
                  if (!newWsName.trim() && pathVal.trim()) {
                    const derived = pathVal.trim().split(/[/\\]/).filter(Boolean).pop() || "";
                    setNewWsName(derived);
                  }
                }}
                placeholder="Absolute path (optional)..."
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
              />
              {isDesktopEnvironment() && (
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-1.5 py-1 rounded transition-colors"
                  title="Browse Folder"
                >
                  <FolderOpen size={12} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-1 rounded text-xs transition-colors"
            >
              Create Workspace
            </button>
          </form>
        )}

        {/* Grouped Workspaces List */}
        {workspaces.length === 0 ? (
          <div className="bg-zinc-950/40 p-4 rounded-md border border-zinc-800/80 text-center space-y-2">
            <span className="text-zinc-500 text-xs block">No workspaces created yet</span>
            <button
              onClick={() => setShowNewWsInput(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-medium inline-flex items-center space-x-1"
            >
              <Plus size={12} />
              <span>Create Workspace</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaces.map((ws) => {
              const isSelectedWorkspace = ws.id === currentWorkspaceId;
              const isCollapsed = collapsedWorkspaces[ws.id] || false;
              const leaves = getLayoutLeaves(ws.layout);
              const wsTerminals = terminals.filter((t) => leaves.includes(t.id));
              const activeCount = wsTerminals.filter((t) => t.status === "Working").length;

              return (
                <div
                  key={ws.id}
                  className={`rounded-md border transition-all overflow-hidden ${
                    isSelectedWorkspace
                      ? "bg-zinc-950/60 border-indigo-500/50 shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  {/* Workspace Group Header */}
                  <div
                    onClick={() => switchWorkspace(ws.id)}
                    className={`flex items-center justify-between p-2 cursor-pointer ${
                      isSelectedWorkspace
                        ? "bg-indigo-950/40 text-indigo-200"
                        : "text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 min-w-0 truncate">
                      <button
                        onClick={(e) => toggleWorkspaceCollapse(ws.id, e)}
                        className="text-zinc-400 hover:text-zinc-200 p-0.5"
                      >
                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <Folder
                        size={14}
                        className={isSelectedWorkspace ? "text-indigo-400 shrink-0" : "text-zinc-500 shrink-0"}
                      />
                      <div className="flex flex-col truncate">
                        <span className="truncate font-semibold text-[11.5px] leading-snug">
                          {ws.name}
                        </span>
                        {typeof ws.root_path === "string" && ws.root_path && (
                          <span className="text-[9.5px] text-zinc-500 font-mono truncate">
                            {ws.root_path.split(/[/\\]/).slice(-2).join("/")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      {/* Active processes badge in this workspace */}
                      {activeCount > 0 && (
                        <span className="flex items-center space-x-0.5 text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">
                          <Play size={8} className="animate-pulse" />
                          <span>{activeCount}</span>
                        </span>
                      )}

                      {/* Terminal count pill */}
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                        {wsTerminals.length}
                      </span>

                      {/* Quick Add Terminal to this workspace */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTerminal(ws.id);
                          if (activeSurface !== "Terminal") setActiveSurface("Terminal");
                        }}
                        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 p-1 rounded transition-colors"
                        title="Add Terminal to Workspace"
                      >
                        <Plus size={12} />
                      </button>

                      {/* Delete workspace */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWorkspace(ws.id);
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                        title="Delete Workspace"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Grouped Terminal Panes List */}
                  {!isCollapsed && (
                    <div className="px-2 pb-2 pt-1 border-t border-zinc-800/40 bg-zinc-950/30 space-y-1">
                      {wsTerminals.length === 0 ? (
                        <div className="flex items-center justify-between p-1.5 text-[10.5px] text-zinc-500 italic">
                          <span>No terminals opened</span>
                          <button
                            onClick={() => {
                              openTerminal(ws.id);
                              if (activeSurface !== "Terminal") setActiveSurface("Terminal");
                            }}
                            className="text-indigo-400 hover:text-indigo-300 not-italic font-sans flex items-center space-x-1"
                          >
                            <Plus size={10} />
                            <span>Open</span>
                          </button>
                        </div>
                      ) : (
                        wsTerminals.map((term) => {
                          const isFocusedTerminal =
                            isSelectedWorkspace && term.id === activeTerminalId;
                          return (
                            <div
                              key={term.id}
                              onClick={() => {
                                switchWorkspace(ws.id);
                                setActiveTerminal(term.id);
                                if (activeSurface !== "Terminal") setActiveSurface("Terminal");
                              }}
                              className={`group/term flex items-center justify-between p-1.5 rounded cursor-pointer border transition-all text-[11px] ${
                                isFocusedTerminal
                                  ? "bg-indigo-900/30 border-indigo-500/60 text-indigo-100 font-medium"
                                  : "bg-zinc-900/80 border-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                              }`}
                            >
                              <div className="flex items-center space-x-1.5 truncate">
                                <TermIcon
                                  size={12}
                                  className={
                                    isFocusedTerminal
                                      ? "text-indigo-400 shrink-0"
                                      : "text-zinc-500 shrink-0"
                                  }
                                />
                                <span className="truncate">{term.title}</span>
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                {renderStatusBadge(term.status)}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closePane(term.id);
                                  }}
                                  className="hover:text-rose-400 p-0.5 rounded transition-colors opacity-0 group-hover/term:opacity-100 text-zinc-500"
                                  title="Close Pane"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Global Process Summary Footer */}
      <div className="p-2.5 border-t border-zinc-800/80 bg-zinc-950/60 text-[10.5px] text-zinc-400 flex justify-between items-center font-mono">
        <div className="flex items-center space-x-2">
          {totalWorking > 0 ? (
            <span className="flex items-center space-x-1 text-amber-400">
              <Play size={10} className="animate-pulse" />
              <span>{totalWorking} active</span>
            </span>
          ) : (
            <span className="text-zinc-500">0 active</span>
          )}
          {totalBlocked > 0 && (
            <span className="flex items-center space-x-1 text-rose-400">
              <AlertCircle size={10} />
              <span>{totalBlocked} blocked</span>
            </span>
          )}
        </div>
        <span className="text-emerald-500">v1.2.0</span>
      </div>
    </aside>
  );
};
