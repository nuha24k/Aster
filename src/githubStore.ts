import { create } from "zustand";
import { safeInvoke } from "./utils/tauri";

// ─── TYPES DEFINITIONS ────────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  orig_path: string | null;
  status: string; // M, A, D, R, C, U (untracked), ! (conflict)
  staged: boolean;
  added: number | null;
  removed: number | null;
}

export interface GitStatus {
  branch: string | null;
  oid: string | null;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  conflicts: string[];
}

export interface Commit {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  date: string;
}

export interface BlameLine {
  line: number;
  hash: string;
  short_hash: string;
  author: string;
  timestamp: number;
  summary: string;
}

export interface SelectedFile {
  repo: string;
  file: FileChange;
}

export interface GhUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export interface RemoteInfo {
  owner: string;
  name: string;
}

export interface Pr {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  head_ref: string;
  base_ref: string;
  head_sha: string;
  html_url: string;
  author: string;
  created_at: string;
}

export interface CheckSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface GhStatusResponse {
  user: GhUser | null;
  accounts: string[];
  active: string | null;
}

export interface TimelineItem {
  kind: "comment" | "review" | "commit" | "event";
  author: string;
  avatar_url: string | null;
  association: string | null;
  body: string;
  created_at: string;
  sha: string | null;
  review_state: string | null;
  event: string | null;
}

export interface ThreadComment {
  id: number;
  author: string;
  avatar_url: string | null;
  association: string | null;
  body: string;
  created_at: string;
  diff_hunk: string | null;
}

export interface ReviewThread {
  id: string;
  resolved: boolean;
  outdated: boolean;
  path: string;
  line: number | null;
  comments: ThreadComment[];
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
}

export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrDetail {
  number: number;
  title: string;
  body: string;
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  draft: boolean;
  head_ref: string;
  base_ref: string;
  head_sha: string;
  author: string;
  author_avatar: string | null;
  html_url: string;
  additions: number;
  deletions: number;
  commits: number;
  changed_files: number;
  timeline: TimelineItem[];
  threads: ReviewThread[];
  checks: CheckRun[];
}

export interface GhIssue {
  number: number;
  title: string;
  state: string;
  body: string;
  author: string;
  created_at: string;
  html_url: string;
  labels: string[];
  comments: number;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// ─── GIT STORE ────────────────────────────────────────────────────────────────

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

// ─── GITHUB STORE ─────────────────────────────────────────────────────────────

interface GithubStore {
  user: GhUser | null;
  accounts: string[];
  activeAccount: string | null;
  initialized: boolean;
  remoteByRepo: Record<string, RemoteInfo | null>;
  prsByRepo: Record<string, Pr[]>;
  checksBySha: Record<string, CheckSummary>;
  syncing: "push" | "pull" | null;
  loadingPrs: boolean;
  error: string | null;
  issuesByRepo: Record<string, GhIssue[]>;
  workflowRuns: WorkflowRun[];
  workflowJobs: WorkflowJob[];
  ciLogsModalOpen: boolean;
  ciLogsContent: string;
  ciLogsLoading: boolean;
  ciLogsJobName: string;

  prDetail: PrDetail | null;
  prDetailRepo: string | null;
  loadingDetail: boolean;
  prFiles: PrFile[] | null;
  loadingFiles: boolean;

  init: () => Promise<void>;
  reload: () => Promise<void>;
  connectPat: (token: string) => Promise<void>;
  switchAccount: (login: string) => Promise<void>;
  logout: (login?: string) => Promise<void>;
  remoteInfo: (repo: string) => Promise<RemoteInfo | null>;
  listPrs: (repo: string) => Promise<void>;
  createPr: (repo: string, head: string, base: string, title: string, body: string) => Promise<Pr | null>;
  loadPrFiles: () => Promise<void>;
  openPrDetail: (repo: string, number: number) => Promise<void>;
  closePrDetail: () => void;
  refreshPrDetail: () => Promise<void>;
  commentOnPr: (body: string) => Promise<boolean>;
  replyToThread: (commentId: number, body: string) => Promise<boolean>;
  resolveThread: (threadId: string, resolved: boolean) => Promise<boolean>;
  mergePr: (method: "merge" | "squash" | "rebase") => Promise<boolean>;
  listIssues: (repo: string) => Promise<void>;
  markPrReady: (repo: string, number: number) => Promise<boolean>;
  loadWorkflowRuns: (repo: string, branch?: string) => Promise<void>;
  openJobLog: (repo: string, runId: number, jobId: number, jobName: string) => Promise<void>;
  push: (repo: string, options?: { autoDraft?: boolean }) => Promise<boolean>;
  pull: (repo: string) => Promise<boolean>;
  setCiLogsModalOpen: (open: boolean) => void;
  setCiLogsContent: (content: string) => void;
}

export const useGithubStore = create<GithubStore>((set, get) => ({
  user: null,
  accounts: [],
  activeAccount: null,
  initialized: false,
  remoteByRepo: {},
  prsByRepo: {},
  checksBySha: {},
  syncing: null,
  loadingPrs: false,
  error: null,
  issuesByRepo: {},
  workflowRuns: [],
  workflowJobs: [],
  ciLogsModalOpen: false,
  ciLogsContent: "",
  ciLogsLoading: false,
  ciLogsJobName: "",

  prDetail: null,
  prDetailRepo: null,
  loadingDetail: false,
  prFiles: null,
  loadingFiles: false,

  reload: async () => {
    const status = await safeInvoke<GhStatusResponse>("gh_status").catch(() => null);
    set({
      user: status?.user ?? null,
      accounts: status?.accounts ?? [],
      activeAccount: status?.active ?? null,
      prsByRepo: {},
      checksBySha: {},
      remoteByRepo: {},
      issuesByRepo: {},
    });
  },

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    await get().reload();
  },

  connectPat: async (token) => {
    await safeInvoke<GhUser>("gh_set_pat", { token });
    await get().reload();
  },

  switchAccount: async (login) => {
    if (login === get().activeAccount) return;
    await safeInvoke("gh_switch", { login });
    await get().reload();
  },

  logout: async (login) => {
    await safeInvoke("gh_logout", { login: login ?? null });
    await get().reload();
  },

  remoteInfo: async (repo) => {
    const cached = get().remoteByRepo[repo];
    if (cached !== undefined) return cached;

    const remote = await safeInvoke<RemoteInfo | null>("gh_remote_info", { repo }).catch(() => null);
    set((state) => ({
      remoteByRepo: { ...state.remoteByRepo, [repo]: remote },
    }));
    return remote;
  },

  listPrs: async (repo) => {
    const remote = await get().remoteInfo(repo);
    if (!remote || !get().user) {
      set({ loadingPrs: false });
      return;
    }
    set({ loadingPrs: true });
    try {
      const prs = await safeInvoke<Pr[]>("gh_list_prs", { owner: remote.owner, name: remote.name });
      set((state) => ({
        prsByRepo: { ...state.prsByRepo, [repo]: prs },
        error: null,
      }));
      for (const pr of prs.slice(0, 10)) {
        safeInvoke<CheckSummary>("gh_pr_checks", {
          owner: remote.owner,
          name: remote.name,
          sha: pr.head_sha,
        })
          .then((summary) => {
            set((state) => ({
              checksBySha: { ...state.checksBySha, [pr.head_sha]: summary },
            }));
          })
          .catch(() => {});
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loadingPrs: false });
    }
  },

  createPr: async (repo, head, base, title, body) => {
    const remote = await get().remoteInfo(repo);
    if (!remote) return null;
    try {
      const pr = await safeInvoke<Pr>("gh_create_pr", {
        owner: remote.owner,
        name: remote.name,
        head,
        base,
        title,
        body: body || null,
      });
      set({ error: null });
      await get().listPrs(repo);
      return pr;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  loadPrFiles: async () => {
    const detail = get().prDetail;
    const detailRepo = get().prDetailRepo;
    if (!detail || !detailRepo || get().loadingFiles || get().prFiles) return;
    const remote = await get().remoteInfo(detailRepo);
    if (!remote) return;
    set({ loadingFiles: true });
    try {
      const files = await safeInvoke<PrFile[]>("gh_pr_files", {
        owner: remote.owner,
        name: remote.name,
        number: detail.number,
      });
      set({ prFiles: files });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loadingFiles: false });
    }
  },

  openPrDetail: async (repo, number) => {
    const remote = await get().remoteInfo(repo);
    if (!remote) return;
    set({ prDetailRepo: repo, loadingDetail: true, prFiles: null });
    try {
      const detail = await safeInvoke<PrDetail>("gh_pr_detail", {
        owner: remote.owner,
        name: remote.name,
        number,
      });
      set({ prDetail: detail, error: null });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loadingDetail: false });
    }
  },

  closePrDetail: () => {
    set({ prDetail: null, prDetailRepo: null, prFiles: null });
  },

  refreshPrDetail: async () => {
    const detail = get().prDetail;
    const detailRepo = get().prDetailRepo;
    if (detail && detailRepo) {
      await get().openPrDetail(detailRepo, detail.number);
    }
  },

  commentOnPr: async (body) => {
    const detail = get().prDetail;
    const detailRepo = get().prDetailRepo;
    if (!detail || !detailRepo) return false;
    const remote = await get().remoteInfo(detailRepo);
    if (!remote) return false;
    try {
      await safeInvoke("gh_pr_comment", {
        owner: remote.owner,
        name: remote.name,
        number: detail.number,
        body,
      });
      await get().refreshPrDetail();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  replyToThread: async (commentId, body) => {
    const detail = get().prDetail;
    const detailRepo = get().prDetailRepo;
    if (!detail || !detailRepo) return false;
    const remote = await get().remoteInfo(detailRepo);
    if (!remote) return false;
    try {
      await safeInvoke("gh_pr_reply_thread", {
        owner: remote.owner,
        name: remote.name,
        number: detail.number,
        comment_id: commentId,
        body,
      });
      await get().refreshPrDetail();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  resolveThread: async (threadId, resolved) => {
    try {
      await safeInvoke("gh_pr_resolve_thread", { threadId, resolved });
      await get().refreshPrDetail();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  mergePr: async (method) => {
    const detail = get().prDetail;
    const detailRepo = get().prDetailRepo;
    if (!detail || !detailRepo) return false;
    const remote = await get().remoteInfo(detailRepo);
    if (!remote) return false;
    try {
      await safeInvoke("gh_pr_merge", {
        owner: remote.owner,
        name: remote.name,
        number: detail.number,
        method,
      });
      await get().refreshPrDetail();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  listIssues: async (repo) => {
    const remote = await get().remoteInfo(repo);
    if (!remote || !get().user) return;
    try {
      const issues = await safeInvoke<GhIssue[]>("gh_issues_list", {
        owner: remote.owner,
        name: remote.name,
      });
      set((state) => ({
        issuesByRepo: { ...state.issuesByRepo, [repo]: issues },
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  markPrReady: async (repo, number) => {
    const remote = await get().remoteInfo(repo);
    if (!remote) return false;
    try {
      await safeInvoke("gh_pr_mark_ready", { owner: remote.owner, name: remote.name, number });
      await get().refreshPrDetail();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  loadWorkflowRuns: async (repo, branch) => {
    const remote = await get().remoteInfo(repo);
    if (!remote) return;
    try {
      const runs = await safeInvoke<WorkflowRun[]>("gh_workflow_runs", {
        owner: remote.owner,
        name: remote.name,
        branch: branch ?? null,
      });
      set({ workflowRuns: runs });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openJobLog: async (repo, runId, jobId, jobName) => {
    const remote = await get().remoteInfo(repo);
    if (!remote) return;
    set({ ciLogsModalOpen: true, ciLogsLoading: true, ciLogsContent: "", ciLogsJobName: jobName });
    try {
      const jobs = await safeInvoke<WorkflowJob[]>("gh_workflow_jobs", {
        owner: remote.owner,
        name: remote.name,
        run_id: runId,
      });
      set({ workflowJobs: jobs });
      const logs = await safeInvoke<string>("gh_job_log", {
        owner: remote.owner,
        name: remote.name,
        job_id: jobId,
      });
      set({ ciLogsContent: logs });
    } catch (e) {
      set({ ciLogsContent: String(e) });
    } finally {
      set({ ciLogsLoading: false });
    }
  },

  push: async (repo, options) => {
    set({ syncing: "push" });
    try {
      await safeInvoke("gh_push", { repo });
      set({ error: null });

      const autoDraft = options?.autoDraft ?? false;
      if (autoDraft && get().user) {
        const remote = await get().remoteInfo(repo);
        const gitStore = useGitStore.getState();
        const branch = gitStore.statusByRepo[repo]?.branch;
        if (remote && branch && branch !== "main" && branch !== "master") {
          const existing = await safeInvoke<Pr | null>("gh_pr_for_branch", {
            owner: remote.owner,
            name: remote.name,
            branch,
          }).catch(() => null);
          if (!existing) {
            // Suggest commit name or default
            await safeInvoke("gh_create_pr", {
              owner: remote.owner,
              name: remote.name,
              head: branch,
              base: "main",
              title: branch,
              body: null,
            }).catch(() => {});
            await get().listPrs(repo);
          }
        }
      }
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    } finally {
      set({ syncing: null });
    }
  },

  pull: async (repo) => {
    set({ syncing: "pull" });
    try {
      await safeInvoke("gh_pull", { repo });
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    } finally {
      set({ syncing: null });
    }
  },

  setCiLogsModalOpen: (open) => set({ ciLogsModalOpen: open }),
  setCiLogsContent: (content) => set({ ciLogsContent: content }),
}));
