import React, { useEffect, useState } from "react";
import { CockpitBar } from "./components/CockpitBar";
import { Sidebar } from "./components/Sidebar";
import { LayoutNodeRenderer } from "./components/LayoutNodeRenderer";
import { GitView } from "./components/GitView";
import { LogsView } from "./components/LogsView";
import { EditorView } from "./components/EditorView";
import { KanbanView } from "./components/KanbanView";
import { CommandPalette } from "./components/CommandPalette";
import { AgentPanel } from "./components/AgentPanel";
import { useWorkspaceStore } from "./store";
import { useGitStore, useGithubStore } from "./githubStore";
import { listen } from "@tauri-apps/api/event";
import { safeInvoke, isTauriEnvironment } from "./utils/tauri";
import { Bot, FolderPlus, Terminal as TermIcon, Plus } from "lucide-react";

export const App: React.FC = () => {
  const {
    workspaces,
    currentWorkspaceId,
    activeSurface,
    setActiveSurface,
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

  // Cmd/Ctrl+R would hard-reload the webview — ASTER manages its own state.
  // Every other shortcut lives in the native menu bar (src-tauri/src/menu.rs).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") e.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // The effective root path for Git and Editor:
  // 1. Use activeTerminalCwd if the terminal has navigated somewhere
  // 2. Fall back to workspace root_path
  const effectiveRootPath =
    activeTerminalCwd || currentWorkspace?.root_path || "";

  // Native menu bar events. File/editor items are handled inside EditorView.
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const unlisten = listen<string>("menu", async ({ payload: id }) => {
      switch (id) {
        case "open_folder": {
          const path = await safeInvoke<string | null>("open_folder_dialog").catch(() => null);
          if (path) {
            createWorkspace("", path);
            safeInvoke("add_recent_folder", { path }).catch(() => {});
          }
          break;
        }
        case "clear_recents":
          safeInvoke("clear_recent_folders").catch(() => {});
          break;
        case "new_workspace":
          createWorkspace("New Workspace");
          break;
        case "reveal_in_finder":
          if (effectiveRootPath) safeInvoke("open_in_finder", { path: effectiveRootPath }).catch(() => {});
          break;
        case "toggle_sidebar":
          toggleSidebar();
          break;
        case "surface_terminal":
          setActiveSurface("Terminal");
          break;
        case "surface_editor":
          setActiveSurface("Editor");
          break;
        case "surface_git":
          setActiveSurface("Git");
          break;
        case "surface_logs":
          setActiveSurface("Logs");
          break;
        case "surface_kanban":
          setActiveSurface("Kanban");
          break;
        case "command_palette":
          setCommandPaletteOpen((prev) => !prev);
          break;
        case "agent_panel":
          setAgentPanelOpen((prev) => !prev);
          break;
        case "new_terminal":
          setActiveSurface("Terminal");
          openTerminal();
          break;
        case "split_vertical":
          if (activeTerminalId) splitPane(activeTerminalId, "Vertical");
          break;
        case "split_horizontal":
          if (activeTerminalId) splitPane(activeTerminalId, "Horizontal");
          break;
        case "close_pane":
          if (activeTerminalId) closePane(activeTerminalId);
          break;
        case "next_pane":
          focusNextPane();
          break;
        case "prev_pane":
          focusPrevPane();
          break;
        case "git_refresh":
          if (effectiveRootPath) useGitStore.getState().refresh(effectiveRootPath);
          break;
        case "git_push":
          if (effectiveRootPath) useGithubStore.getState().push(effectiveRootPath);
          break;
        case "git_pull":
          if (effectiveRootPath) useGithubStore.getState().pull(effectiveRootPath);
          break;
        default:
          // File ▸ Open Recent entries carry their path in the id.
          if (id.startsWith("recent:")) {
            const path = id.slice("recent:".length);
            createWorkspace("", path);
            safeInvoke("add_recent_folder", { path }).catch(() => {});
          }
      }
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, [
    effectiveRootPath,
    activeTerminalId,
    createWorkspace,
    toggleSidebar,
    setActiveSurface,
    openTerminal,
    splitPane,
    closePane,
    focusNextPane,
    focusPrevPane,
  ]);

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
              {/* ─── Persistent Terminal Layout Renderers per Workspace ────────
                  All workspace terminal layouts are kept mounted in DOM so 
                  PTY processes and xterm buffers are never lost on workspace switch.
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
                workspaces.map((ws) => {
                  if (!ws.layout) return null;
                  const isCurrent = ws.id === currentWorkspaceId;
                  const isVisible = activeSurface === "Terminal" && isCurrent;
                  return (
                    <div
                      key={ws.id}
                      className="relative flex-1 w-full h-full min-h-0 min-w-0"
                      style={{ display: isVisible ? "flex" : "none" }}
                    >
                      <LayoutNodeRenderer
                        node={ws.layout}
                        cwd={ws.root_path}
                      />
                    </div>
                  );
                })
              )}

              {/* ─── Git Surface ──────────────────────────────────────────────── */}
              {activeSurface === "Git" && (
                <GitView repoPath={effectiveRootPath} />
              )}

              {/* ─── Task Board Surface ───────────────────────────────────────── */}
              {activeSurface === "Kanban" && <KanbanView rootPath={effectiveRootPath} />}

              {/* ─── Logs Surface ─────────────────────────────────────────────── */}
              {activeSurface === "Logs" && <LogsView />}

              {/* ─── Editor Surface ─────────────────────────────────────────────
                  Kept in DOM like the terminal so open tabs, unsaved edits and
                  the File menu handlers survive a surface switch.
              ──────────────────────────────────────────────────────────────── */}
              <div
                className="flex-1 min-h-0 min-w-0"
                style={{ display: activeSurface === "Editor" ? "flex" : "none" }}
              >
                <EditorView rootPath={effectiveRootPath} />
              </div>
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
