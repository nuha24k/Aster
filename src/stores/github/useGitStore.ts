import { create } from "zustand";
import { safeInvoke } from "../../utils/tauri";
import {
  FileChange,
  GitStatus,
  Commit,
  StashEntry,
  BlameLine,
  SelectedFile,
} from "./types";

interface GitStore {
  statusByRepo: Record<string, GitStatus>;
  logByRepo: Record<string, Commit[]>;
  selectedRepo: string | null;
  selected: SelectedFile | null;
  diff: string;
  diffLoading: boolean;
  committing: boolean;
  error: string | null;
  gitBusy: boolean;
  stashList: StashEntry[];
  blameByPath: Record<string, BlameLine[]>;
  fileSearch: string;
  prTemplate: string | null;

  refresh: (repo: string) => Promise<void>;
  refreshAll: (repos: string[]) => Promise<void>;
  selectRepo: (repo: string) => Promise<void>;
  selectFile: (repo: string, file: FileChange) => Promise<void>;
  stage: (repo: string, paths: string[]) => Promise<void>;
  stageAll: (repo: string) => Promise<void>;
  unstage: (repo: string, paths: string[]) => Promise<void>;
  discard: (repo: string, file: FileChange) => Promise<void>;
  commit: (repo: string, summary: string, description: string) => Promise<boolean>;
  amendCommit: (repo: string, summary: string, description: string) => Promise<boolean>;
  cherryPick: (repo: string, hash: string) => Promise<boolean>;
  refreshStash: (repo: string) => Promise<void>;
  stashPush: (repo: string, message?: string) => Promise<boolean>;
  stashApply: (repo: string, index: number) => Promise<boolean>;
  stashDrop: (repo: string, index: number) => Promise<boolean>;
  loadBlame: (repo: string, path: string) => Promise<void>;
  stageHunk: (repo: string, patch: string) => Promise<boolean>;
  conflictResolve: (repo: string, path: string, resolution: "ours" | "theirs") => Promise<boolean>;
  loadPrTemplate: (repo: string) => Promise<void>;
  resetSelection: () => void;
  setFileSearch: (val: string) => void;
  checkpointSave: (repo: string, name: string) => Promise<boolean>;
  checkpointRestore: (repo: string, index: number) => Promise<boolean>;
  checkpointDrop: (repo: string, index: number) => Promise<boolean>;
}

let diffSeq = 0;

export const useGitStore = create<GitStore>((set, get) => ({
  statusByRepo: {},
  logByRepo: {},
  selectedRepo: null,
  selected: null,
  diff: "",
  diffLoading: false,
  committing: false,
  error: null,
  gitBusy: false,
  stashList: [],
  blameByPath: {},
  fileSearch: "",
  prTemplate: null,

  refresh: async (repo) => {
    try {
      const [s, l] = await Promise.all([
        safeInvoke<GitStatus>("git_status", { repo }),
        safeInvoke<Commit[]>("git_log", { repo, limit: 15 }),
      ]);
      set((state) => ({
        statusByRepo: { ...state.statusByRepo, [repo]: s },
        logByRepo: { ...state.logByRepo, [repo]: l },
        error: null,
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshAll: async (repos) => {
    await Promise.all(
      repos.map(async (repo) => {
        try {
          const s = await safeInvoke<GitStatus>("git_status", { repo });
          set((state) => ({
            statusByRepo: { ...state.statusByRepo, [repo]: s },
          }));
        } catch (_) {}
      })
    );
  },

  selectRepo: async (repo) => {
    set({ selectedRepo: repo, selected: null, diff: "" });
    await get().refresh(repo);
  },

  selectFile: async (repo, file) => {
    set({ selected: { repo, file }, diff: "", diffLoading: true });
    const seq = ++diffSeq;
    try {
      const result = await safeInvoke<string>("git_diff", {
        repo,
        path: file.path,
        staged: file.staged,
        untracked: file.status === "U",
      });
      if (seq === diffSeq) {
        set({ diff: result, diffLoading: false });
      }
    } catch (e) {
      if (seq === diffSeq) {
        set({ diff: "", error: String(e), diffLoading: false });
      }
    }
  },

  stage: async (repo, paths) => {
    if (get().gitBusy) return;
    set({ gitBusy: true });
    try {
      await safeInvoke("git_stage", { repo, paths });
      await get().refresh(repo);
    } finally {
      set({ gitBusy: false });
    }
  },

  stageAll: async (repo) => {
    if (get().gitBusy) return;
    set({ gitBusy: true });
    try {
      await safeInvoke("git_stage_all", { repo });
      await get().refresh(repo);
    } finally {
      set({ gitBusy: false });
    }
  },

  unstage: async (repo, paths) => {
    if (get().gitBusy) return;
    set({ gitBusy: true });
    try {
      await safeInvoke("git_unstage", { repo, paths });
      await get().refresh(repo);
    } finally {
      set({ gitBusy: false });
    }
  },

  discard: async (repo, file) => {
    if (get().gitBusy) return;
    set({ gitBusy: true });
    try {
      const untracked = file.status === "U";
      await safeInvoke("git_discard", {
        repo,
        tracked: untracked ? [] : [file.path],
        untracked: untracked ? [file.path] : [],
      });
      if (get().selected?.file.path === file.path) {
        set({ selected: null, diff: "" });
      }
      await get().refresh(repo);
    } finally {
      set({ gitBusy: false });
    }
  },

  commit: async (repo, summary, description) => {
    set({ committing: true });
    try {
      await safeInvoke("git_commit", { repo, summary, description: description || null });
      await get().refresh(repo);
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    } finally {
      set({ committing: false });
    }
  },

  amendCommit: async (repo, summary, description) => {
    set({ committing: true });
    try {
      await safeInvoke("git_commit_amend", { repo, summary, description: description || null });
      await get().refresh(repo);
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    } finally {
      set({ committing: false });
    }
  },

  cherryPick: async (repo, hash) => {
    try {
      await safeInvoke("git_cherry_pick", { repo, hash });
      await get().refresh(repo);
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  refreshStash: async (repo) => {
    try {
      const list = await safeInvoke<StashEntry[]>("git_stash_list", { repo });
      set({ stashList: list });
    } catch {
      set({ stashList: [] });
    }
  },

  stashPush: async (repo, message) => {
    try {
      await safeInvoke("git_stash_push", { repo, message: message || null });
      await Promise.all([get().refresh(repo), get().refreshStash(repo)]);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  stashApply: async (repo, index) => {
    try {
      await safeInvoke("git_stash_apply", { repo, index });
      await get().refresh(repo);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  stashDrop: async (repo, index) => {
    try {
      await safeInvoke("git_stash_drop", { repo, index });
      await get().refreshStash(repo);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  loadBlame: async (repo, path) => {
    const keys = Object.keys(get().blameByPath);
    if (keys.length >= 20) {
      const { [keys[0]!]: _, ...rest } = get().blameByPath;
      set({ blameByPath: rest });
    }
    try {
      const blame = await safeInvoke<BlameLine[]>("git_blame", { repo, path });
      set((state) => ({
        blameByPath: { ...state.blameByPath, [path]: blame },
      }));
    } catch {
      set((state) => ({
        blameByPath: { ...state.blameByPath, [path]: [] },
      }));
    }
  },

  stageHunk: async (repo, patch) => {
    try {
      await safeInvoke("git_stage_hunk", { repo, patch });
      await get().refresh(repo);
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  conflictResolve: async (repo, path, resolution) => {
    try {
      await safeInvoke("git_conflict_resolve", { repo, path, resolution });
      await get().refresh(repo);
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  loadPrTemplate: async (repo) => {
    const tpl = await safeInvoke<string | null>("git_pr_template", { repo }).catch(() => null);
    set({ prTemplate: tpl });
  },

  checkpointSave: async (repo, name) => {
    const msg = `checkpoint: ${name || new Date().toLocaleTimeString()}`;
    return get().stashPush(repo, msg);
  },

  checkpointRestore: async (repo, index) => {
    return get().stashApply(repo, index);
  },

  checkpointDrop: async (repo, index) => {
    return get().stashDrop(repo, index);
  },

  resetSelection: () => {
    set({
      selectedRepo: null,
      selected: null,
      diff: "",
      error: null,
      fileSearch: "",
      stashList: [],
      prTemplate: null,
    });
  },

  setFileSearch: (val) => set({ fileSearch: val }),
}));
