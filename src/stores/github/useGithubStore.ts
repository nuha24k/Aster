import { create } from "zustand";
import { safeInvoke } from "../../utils/tauri";
import { useGitStore } from "./useGitStore";
import {
  GhUser,
  RemoteInfo,
  Pr,
  CheckSummary,
  GhStatusResponse,
  PrFile,
  PrDetail,
  GhIssue,
  WorkflowRun,
  WorkflowJob,
} from "./types";

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
