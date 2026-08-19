import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { WorkspaceInfo, TerminalPane, AgentStatus, LayoutNode, SplitDirection } from "./types";

interface WorkspaceStore {
  workspaces: WorkspaceInfo[];
  currentWorkspaceId: string | null;
  activeSurface: "Terminal" | "Editor" | "Git" | "Logs";
  terminals: TerminalPane[];
  activeTerminalId: string | null;
  /** Current working directory of the active terminal — drives Editor rootPath */
  activeTerminalCwd: string | null;
  sidebarOpen: boolean;

  // Actions
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  createWorkspace: (name: string, root_path: string) => void;
  switchWorkspace: (id: string) => void;
  setActiveSurface: (surface: "Terminal" | "Editor" | "Git" | "Logs") => void;
  addTerminal: (term: TerminalPane) => void;
  setActiveTerminal: (id: string) => void;
  updateTerminalStatus: (id: string, status: AgentStatus) => void;
  /** Split the pane containing targetSurfaceId and add a new terminal session */
  splitPane: (targetSurfaceId: string, direction: SplitDirection) => void;
  closePane: (surfaceId: string) => void;
  deleteWorkspace: (id: string) => void;
  toggleSidebar: () => void;
  /** Update the split ratio for the Split node containing firstSurfaceId */
  setLayoutRatio: (firstSurfaceId: string, ratio: number) => void;

  updateCurrentWorkspaceRootPath: (newRootPath: string) => void;
  updateActiveTerminalCwd: (cwd: string) => void;
  focusNextPane: () => void;
  focusPrevPane: () => void;
  /** Initialise workspace root path from the backend (call once on app start) */
  initDefaultWorkspacePath: (path: string) => void;
}


const INITIAL_TERMINAL_ID = "term_1";

const DEFAULT_WORKSPACE: WorkspaceInfo = {
  id: "ws_aster",
  name: "Aster Workspace",
  // Will be overwritten by initDefaultWorkspacePath() on mount
  root_path: "",
  layout: { type: "Surface", surfaceId: INITIAL_TERMINAL_ID },
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [DEFAULT_WORKSPACE],
      currentWorkspaceId: "ws_aster",
      activeSurface: "Terminal",
      terminals: [{ id: INITIAL_TERMINAL_ID, title: "Terminal 1", status: "Idle" }],
      activeTerminalId: INITIAL_TERMINAL_ID,
      activeTerminalCwd: null,
      sidebarOpen: true,

      setWorkspaces: (workspaces) => set({ workspaces }),

      createWorkspace: (name, root_path) => {
        const id = `ws_${Date.now()}`;
        const termId = `term_${Date.now()}`;
        const newWs: WorkspaceInfo = {
          id,
          name,
          root_path,
          layout: { type: "Surface", surfaceId: termId },
        };
        set((state) => ({
          workspaces: [...state.workspaces, newWs],
          currentWorkspaceId: id,
          terminals: [...state.terminals, { id: termId, title: "Terminal 1", status: "Idle" }],
          activeTerminalId: termId,
        }));
      },

      switchWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id);
        if (!ws) return;
        set({ currentWorkspaceId: id });
      },

      deleteWorkspace: (id) => {
        set((state) => {
          if (state.workspaces.length <= 1) return state;
          const remaining = state.workspaces.filter((w) => w.id !== id);
          const nextWsId =
            state.currentWorkspaceId === id ? remaining[0].id : state.currentWorkspaceId;
          return {
            workspaces: remaining,
            currentWorkspaceId: nextWsId,
          };
        });
      },


      setActiveSurface: (surface) => set({ activeSurface: surface }),

      addTerminal: (term) =>
        set((state) => ({
          terminals: [...state.terminals, term],
          activeTerminalId: term.id,
        })),

      setActiveTerminal: (id) => set({ activeTerminalId: id }),

      updateTerminalStatus: (id, status) =>
        set((state) => ({
          terminals: state.terminals.map((t) => (t.id === id ? { ...t, status } : t)),
        })),

      splitPane: (targetSurfaceId, direction) => {
        const state = get();
        const newId = `term_${Date.now()}`;
        const newTerm: TerminalPane = {
          id: newId,
          title: `Terminal ${state.terminals.length + 1}`,
          status: "Idle",
        };

        const insertSplit = (node: LayoutNode): LayoutNode => {
          if (node.type === "Surface") {
            if (node.surfaceId === targetSurfaceId) {
              return {
                type: "Split",
                direction,
                ratio: 50,
                first: { type: "Surface", surfaceId: targetSurfaceId },
                second: { type: "Surface", surfaceId: newId },
              };
            }
            return node;
          }
          return {
            ...node,
            first: insertSplit(node.first),
            second: insertSplit(node.second),
          };
        };

        const currentWs = state.workspaces.find((w) => w.id === state.currentWorkspaceId);
        if (!currentWs) return;

        const updatedWs = { ...currentWs, layout: insertSplit(currentWs.layout) };

        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === currentWs.id ? updatedWs : w)),
          terminals: [...s.terminals, newTerm],
          activeTerminalId: newId,
        }));
      },

      closePane: (surfaceId) => {
        set((state) => {
          const remainingTerminals = state.terminals.filter((t) => t.id !== surfaceId);
          const nextActiveId = remainingTerminals.length > 0 ? remainingTerminals[0].id : null;

          const removeNode = (node: LayoutNode): LayoutNode | null => {
            if (node.type === "Surface") {
              return node.surfaceId === surfaceId ? null : node;
            }
            const first = removeNode(node.first);
            const second = removeNode(node.second);

            if (!first) return second;
            if (!second) return first;
            return { ...node, first, second };
          };

          const currentWs = state.workspaces.find((w) => w.id === state.currentWorkspaceId);
          if (!currentWs) return state;

          const newLayout =
            removeNode(currentWs.layout) || {
              type: "Surface",
              surfaceId: nextActiveId || INITIAL_TERMINAL_ID,
            };
          const updatedWs = { ...currentWs, layout: newLayout };

          return {
            terminals: remainingTerminals,
            activeTerminalId: nextActiveId,
            workspaces: state.workspaces.map((w) => (w.id === currentWs.id ? updatedWs : w)),
          };
        });
      },

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setLayoutRatio: (firstSurfaceId, ratio) => {
        set((state) => {
          const currentWs = state.workspaces.find((w) => w.id === state.currentWorkspaceId);
          if (!currentWs) return state;

          const updateRatio = (node: LayoutNode): LayoutNode => {
            if (node.type === "Surface") return node;
            // Match Split whose first child (eventually) contains firstSurfaceId
            const firstLeaves = (n: LayoutNode): string[] =>
              n.type === "Surface"
                ? [n.surfaceId]
                : [...firstLeaves(n.first), ...firstLeaves(n.second)];
            if (firstLeaves(node.first).includes(firstSurfaceId)) {
              return { ...node, ratio: Math.min(85, Math.max(15, ratio)) };
            }
            return { ...node, first: updateRatio(node.first), second: updateRatio(node.second) };
          };

          const updatedWs = { ...currentWs, layout: updateRatio(currentWs.layout) };
          return { workspaces: state.workspaces.map((w) => (w.id === currentWs.id ? updatedWs : w)) };
        });
      },

      updateCurrentWorkspaceRootPath: (newRootPath) =>
        set((state) => {
          const currentWs = state.workspaces.find((w) => w.id === state.currentWorkspaceId);
          if (!currentWs || currentWs.root_path === newRootPath) return state;

          const folderName =
            newRootPath.split(/[/\\]/).filter(Boolean).pop() || currentWs.name;
          const updatedWs = {
            ...currentWs,
            name: folderName,
            root_path: newRootPath,
          };

          return {
            workspaces: state.workspaces.map((w) =>
              w.id === currentWs.id ? updatedWs : w
            ),
          };
        }),

      updateActiveTerminalCwd: (cwd) => set({ activeTerminalCwd: cwd }),

      focusNextPane: () => {
        const { terminals, activeTerminalId } = get();
        if (terminals.length === 0) return;
        const currentIndex = terminals.findIndex((t) => t.id === activeTerminalId);
        const nextIndex = (currentIndex + 1) % terminals.length;
        set({ activeTerminalId: terminals[nextIndex].id });
      },

      focusPrevPane: () => {
        const { terminals, activeTerminalId } = get();
        if (terminals.length === 0) return;
        const currentIndex = terminals.findIndex((t) => t.id === activeTerminalId);
        const prevIndex = (currentIndex - 1 + terminals.length) % terminals.length;
        set({ activeTerminalId: terminals[prevIndex].id });
      },

      initDefaultWorkspacePath: (path) =>
        set((state) => {
          // Only update the default workspace if its root_path is still empty
          const updatedWorkspaces = state.workspaces.map((ws) => {
            if (ws.id === "ws_aster" && ws.root_path === "") {
              const name = path.split(/[/\\]/).filter(Boolean).pop() || "Workspace";
              return { ...ws, name, root_path: path };
            }
            return ws;
          });
          return { workspaces: updatedWorkspaces };
        }),
    }),
    {
      name: "aster-workspace-state",
      storage: createJSONStorage(() => localStorage),
      // Only persist layout/workspace data — not runtime PTY state
      partialize: (state) => ({
        workspaces: state.workspaces,
        currentWorkspaceId: state.currentWorkspaceId,
        activeSurface: state.activeSurface,
        terminals: state.terminals,
        activeTerminalId: state.activeTerminalId,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
