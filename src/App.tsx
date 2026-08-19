import React, { useEffect, useState } from "react";
import { CockpitBar } from "./components/CockpitBar";
import { Sidebar } from "./components/Sidebar";
import { LayoutNodeRenderer } from "./components/LayoutNodeRenderer";
import { GitView } from "./components/GitView";
import { LogsView } from "./components/LogsView";
import { EditorView } from "./components/EditorView";
import { CommandPalette } from "./components/CommandPalette";
import { AgentPanel } from "./components/AgentPanel";
import { useWorkspaceStore } from "./store";
import { safeInvoke, isTauriEnvironment } from "./utils/tauri";
import { Bot, FolderPlus, Terminal as TermIcon, Plus } from "lucide-react";

export const App: React.FC = () => {
  const {
    workspaces,
    currentWorkspaceId,
    activeSurface,
    activeTerminalId,
    activeTerminalCwd,
    openTerminal,
    createWorkspace,
    splitPane,
    closePane,
    toggleSidebar,
    focusNextPane,
    focusPrevPane,
    initAppCwd,
  } = useWorkspaceStore();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  // On first mount: fetch the real project root from Rust so app default CWD is known.
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    safeInvoke<string>("get_app_cwd")
      .then((cwd) => {
        if (cwd) initAppCwd(cwd);
      })
      .catch(() => {});
  }, [initAppCwd]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Prevent hard browser reload — ASTER manages its own state
      if (isCmdOrCtrl && e.key.toLowerCase() === "r") {
        e.preventDefault();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setAgentPanelOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (activeTerminalId) splitPane(activeTerminalId, "Horizontal");
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (activeTerminalId) splitPane(activeTerminalId, "Vertical");
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeTerminalId) closePane(activeTerminalId);
      } else if (isCmdOrCtrl && e.key === "]") {
        e.preventDefault();
        focusNextPane();
      } else if (isCmdOrCtrl && e.key === "[") {
        e.preventDefault();
        focusPrevPane();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTerminalId, splitPane, closePane, toggleSidebar, focusNextPane, focusPrevPane]);

  // The effective root path for Git and Editor:
  // 1. Use activeTerminalCwd if the terminal has navigated somewhere
  // 2. Fall back to workspace root_path
  const effectiveRootPath =
    activeTerminalCwd || currentWorkspace?.root_path || "";

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      <CockpitBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 bg-zinc-950 relative overflow-hidden p-1 flex">
          {/* ─── No Active Workspace State ───────────────────────────────── */}
          {!currentWorkspace ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-900/30 border border-zinc-800/60 rounded-lg m-2">
              <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
                <FolderPlus size={24} />
              </div>
              <h2 className="text-sm font-bold text-zinc-100 mb-1 tracking-wide">No Workspace Selected</h2>
              <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
                Create a new workspace or open a project folder to start working with terminals, editor, and git.
              </p>
              <button
                onClick={async () => {
                  if (isTauriEnvironment()) {
                    try {
                      const path = await safeInvoke<string | null>("open_folder_dialog");
                      if (path) {
                        createWorkspace("", path);
                        return;
                      }
                    } catch (_) {}
                  }
                  createWorkspace("New Workspace");
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded shadow-md transition-colors flex items-center space-x-2 active:scale-95"
              >
                <Plus size={14} />
                <span>Create Workspace</span>
              </button>
            </div>
          ) : (
            <>
              {/* ─── Terminal Surface ───────────────────────────────────────────
                  ALWAYS kept in DOM when layout exists so PTY sessions are
                  never destroyed on surface switch. Visibility toggled via CSS.
              ──────────────────────────────────────────────────────────────── */}
              {activeSurface === "Terminal" && !currentWorkspace.layout ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-900/30 border border-zinc-800/60 rounded-lg m-2">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
                    <TermIcon size={24} />
                  </div>
                  <h2 className="text-sm font-bold text-zinc-100 mb-1 tracking-wide">No Terminal Opened</h2>
                  <p className="text-xs text-zinc-400 max-w-sm mb-1 font-mono">
                    Workspace: <span className="text-indigo-300 font-semibold">{currentWorkspace.name}</span>
                  </p>
                  {currentWorkspace.root_path && (
                    <p className="text-[11px] text-zinc-500 font-mono max-w-md truncate mb-6">
                      {currentWorkspace.root_path}
                    </p>
                  )}
                  <button
                    onClick={() => openTerminal()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded shadow-md transition-colors flex items-center space-x-2 active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Open Terminal</span>
                  </button>
                </div>
              ) : (
                currentWorkspace.layout && (
                  <div
                    className="relative flex-1 w-full h-full min-h-0 min-w-0"
                    style={{ display: activeSurface === "Terminal" ? "flex" : "none" }}
                  >
                    <LayoutNodeRenderer
                      node={currentWorkspace.layout}
                      cwd={currentWorkspace.root_path}
                    />
                  </div>
                )
              )}

              {/* ─── Git Surface ──────────────────────────────────────────────── */}
              {activeSurface === "Git" && (
                <GitView repoPath={effectiveRootPath} />
              )}

              {/* ─── Logs Surface ─────────────────────────────────────────────── */}
              {activeSurface === "Logs" && <LogsView />}

              {/* ─── Editor Surface ───────────────────────────────────────────── */}
              {activeSurface === "Editor" && (
                <EditorView rootPath={effectiveRootPath} />
              )}
            </>
          )}

          {/* Floating AI Agent Trigger Button */}
          <button
            onClick={() => setAgentPanelOpen(!agentPanelOpen)}
            className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-full shadow-2xl flex items-center space-x-1.5 z-40 transition-transform active:scale-95"
            title="Toggle Developer Intelligence Agent Panel (Cmd/Ctrl+I)"
          >
            <Bot size={18} />
            <span className="text-xs font-semibold pr-1">AI Agent</span>
          </button>
        </main>
      </div>

      {/* Command Palette Modal */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Developer Intelligence Panel */}
      {currentWorkspace && (
        <AgentPanel
          isOpen={agentPanelOpen}
          onClose={() => setAgentPanelOpen(false)}
          rootPath={effectiveRootPath}
        />
      )}
    </div>
  );
};

export default App;
