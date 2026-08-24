import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { WorkspaceInfo, TerminalPane, AgentStatus, LayoutNode, SplitDirection, getLayoutLeaves } from "./types";

interface WorkspaceStore {
  workspaces: WorkspaceInfo[];
  currentWorkspaceId: string | null;
  activeSurface: "Terminal" | "Editor" | "Git" | "Logs" | "Kanban";
  terminals: TerminalPane[];
  activeTerminalId: string | null;
  /** Current working directory of the active terminal — drives Editor rootPath */
  activeTerminalCwd: string | null;
  /** App launch CWD from Rust backend */
  appDefaultCwd: string | null;
  sidebarOpen: boolean;

  // Actions
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  createWorkspace: (name: string, root_path?: string) => void;
  switchWorkspace: (id: string) => void;
  setActiveSurface: (surface: "Terminal" | "Editor" | "Git" | "Logs" | "Kanban") => void;
  openTerminal: (workspaceId?: string) => void;
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
  initAppCwd: (path: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      activeSurface: "Terminal",
      terminals: [],
      activeTerminalId: null,
      activeTerminalCwd: null,
      appDefaultCwd: null,
      sidebarOpen: true,

      setWorkspaces: (workspaces) => set({ workspaces }),

      createWorkspace: (name, root_path = "") => {
        const trimmedPath = root_path.trim();
        let finalName = name.trim();
        if (!finalName && trimmedPath) {
          finalName = trimmedPath.split(/[/\\]/).filter(Boolean).pop() || "Workspace";
        } else if (!finalName) {
          finalName = "Workspace";
        }

        const id = `ws_${Date.now()}`;
        const newWs: WorkspaceInfo = {
          id,
          name: finalName,
          root_path: trimmedPath,
          layout: null, // NO terminal created automatically!
        };

        set((state) => ({
          workspaces: [...state.workspaces, newWs],
          currentWorkspaceId: id,
          activeTerminalId: null,
        }));
      },

      switchWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id);
        if (!ws) return;

        const leaves = getLayoutLeaves(ws.layout);
        const nextActiveId = leaves.length > 0 ? leaves[0] : null;

        set({
          currentWorkspaceId: id,
          activeTerminalId: nextActiveId,
        });
      },

      deleteWorkspace: (id) => {
        set((state) => {
          const remainingWorkspaces = state.workspaces.filter((w) => w.id !== id);
          let nextWsId = state.currentWorkspaceId;
          if (state.currentWorkspaceId === id) {
            nextWsId = remainingWorkspaces.length > 0 ? remainingWorkspaces[0].id : null;
          }

          const nextWs = remainingWorkspaces.find((w) => w.id === nextWsId);
          const nextLeaves = nextWs ? getLayoutLeaves(nextWs.layout) : [];
          const nextActiveId = nextLeaves.length > 0 ? nextLeaves[0] : null;

          const remainingLeaves = remainingWorkspaces.flatMap((w) => getLayoutLeaves(w.layout));
          const remainingTerminals = state.terminals.filter((t) => remainingLeaves.includes(t.id));

          return {
            workspaces: remainingWorkspaces,
            currentWorkspaceId: nextWsId,
            activeTerminalId: nextActiveId,
            terminals: remainingTerminals,
          };
        });
      },

      setActiveSurface: (surface) => set({ activeSurface: surface }),

      openTerminal: (workspaceId) => {
        const state = get();
        const targetWsId = workspaceId || state.currentWorkspaceId;
        if (!targetWsId) return;

        const ws = state.workspaces.find((w) => w.id === targetWsId);
        if (!ws) return;

        const newTermId = `term_${Date.now()}`;
        const termCwd = ws.root_path || state.appDefaultCwd || undefined;
        const newTerm: TerminalPane = {
          id: newTermId,
          title: `Terminal ${state.terminals.length + 1}`,
          cwd: termCwd,
          status: "Idle",
        };

        if (state.currentWorkspaceId !== targetWsId) {
          set({ currentWorkspaceId: targetWsId });
        }

        if (!ws.layout) {
          const updatedWs: WorkspaceInfo = {
            ...ws,
            layout: { type: "Surface", surfaceId: newTermId },
          };
          set((s) => ({
            workspaces: s.workspaces.map((w) => (w.id === ws.id ? updatedWs : w)),
            terminals: [...s.terminals, newTerm],
            activeTerminalId: newTermId,
            currentWorkspaceId: targetWsId,
          }));
        } else {
          const leaves = getLayoutLeaves(ws.layout);
          const targetSurfaceId =
            state.activeTerminalId && leaves.includes(state.activeTerminalId)
              ? state.activeTerminalId
              : leaves[0];
          if (targetSurfaceId) {
            get().splitPane(targetSurfaceId, "Vertical");
          }
        }
      },

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
        const currentWs = state.workspaces.find((w) => w.id === state.currentWorkspaceId);
        if (!currentWs || !currentWs.layout) return;

        const newId = `term_${Date.now()}`;
        const newTerm: TerminalPane = {
          id: newId,
          title: `Terminal ${state.terminals.length + 1}`,
          cwd: currentWs.root_path || state.appDefaultCwd || undefined,
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

        const updatedWs = { ...currentWs, layout: insertSplit(currentWs.layout) };

        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === currentWs.id ? updatedWs : w)),
          terminals: [...s.terminals, newTerm],
          activeTerminalId: newId,
        }));
      },

      closePane: (surfaceId) => {
        set((state) => {
          const currentWs = state.workspaces.find((w) => w.id === state.currentWorkspaceId);
          if (!currentWs || !currentWs.layout) return state;

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

          const newLayout = removeNode(currentWs.layout);
          const remainingTerminals = state.terminals.filter((t) => t.id !== surfaceId);

          const leaves = getLayoutLeaves(newLayout);
          const nextActiveId =
            state.activeTerminalId === surfaceId
              ? leaves[0] || null
              : state.activeTerminalId;

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
          if (!currentWs || !currentWs.layout) return state;

          const updateRatio = (node: LayoutNode): LayoutNode => {
            if (node.type === "Surface") return node;
            if (getLayoutLeaves(node.first).includes(firstSurfaceId)) {
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
        const { workspaces, currentWorkspaceId, activeTerminalId } = get();
        const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
        if (!currentWs || !currentWs.layout) return;

        const currentLeaves = getLayoutLeaves(currentWs.layout);
        if (currentLeaves.length === 0) return;

        const currentIndex = currentLeaves.findIndex((id) => id === activeTerminalId);
        const nextIndex = (currentIndex + 1) % currentLeaves.length;
        set({ activeTerminalId: currentLeaves[nextIndex] });
      },

      focusPrevPane: () => {
        const { workspaces, currentWorkspaceId, activeTerminalId } = get();
        const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
        if (!currentWs || !currentWs.layout) return;

        const currentLeaves = getLayoutLeaves(currentWs.layout);
        if (currentLeaves.length === 0) return;

        const currentIndex = currentLeaves.findIndex((id) => id === activeTerminalId);
        const prevIndex = (currentIndex - 1 + currentLeaves.length) % currentLeaves.length;
        set({ activeTerminalId: currentLeaves[prevIndex] });
      },

      initAppCwd: (path) => set({ appDefaultCwd: path }),
    }),
    {
      name: "aster-workspace-state",
      storage: createJSONStorage(() => localStorage),
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
