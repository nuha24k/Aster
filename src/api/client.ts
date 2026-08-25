export const isElectron = (): boolean => {
  if (typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron)) {
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron")) {
    return true;
  }
  return false;
};

export const isDesktopEnvironment = (): boolean => {
  return isElectron();
};

export const isTauriEnvironment = (): boolean => {
  return isElectron();
};

export async function callBackend<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (isElectron()) {
    return window.electronAPI!.rpc<T>(method, params);
  }
  return Promise.reject(new Error("Running in Web Browser mode without Electron desktop environment."));
}

export function subscribeMenu(callback: (id: string) => void): () => void {
  if (isElectron()) {
    return window.electronAPI!.onMenu(callback);
  }
  return () => {};
}

export function subscribeNotification(callback: (msg: any) => void): () => void {
  if (isElectron()) {
    return window.electronAPI!.onNotification(callback);
  }
  return () => {};
}

export async function openFolderDialog(): Promise<string | null> {
  if (isElectron()) {
    return window.electronAPI!.openFolderDialog();
  }
  return null;
}

export async function openFileDialog(): Promise<string | null> {
  if (isElectron()) {
    return window.electronAPI!.openFileDialog();
  }
  return null;
}

export async function saveFileDialog(defaultName?: string): Promise<string | null> {
  if (isElectron()) {
    return window.electronAPI!.saveFileDialog(defaultName);
  }
  return null;
}

export async function openInFinder(path: string): Promise<void> {
  if (isElectron()) {
    return window.electronAPI!.openInFinder(path);
  }
}

export const coreAPI = {
  system: {
    getCwd: () => callBackend<string>("system/getCwd"),
  },
  workspace: {
    getCurrent: () => callBackend<any>("workspace/getCurrent"),
    create: (name: string, path?: string) => callBackend<any>("workspace/create", { name, path }),
  },
  fs: {
    readContent: (path: string) => callBackend<string>("fs/readContent", { path }),
    saveContent: (path: string, content: string) => callBackend<void>("fs/saveContent", { path, content }),
    listDir: (path: string) => callBackend<any[]>("fs/listDir", { path }),
    getTypeDefs: (rootPath: string) => callBackend<any[]>("fs/getTypeDefs", { rootPath }),
    getSourceFiles: (rootPath: string) => callBackend<any[]>("fs/getSourceFiles", { rootPath }),
  },
  pty: {
    spawn: (sessionId?: string, cwd?: string) => callBackend<{ sessionId: string }>("pty/spawn", { sessionId, cwd }),
    write: (sessionId: string, data: string) => callBackend<void>("pty/write", { sessionId, data }),
    readOutput: (sessionId: string) => callBackend<{ data: string }>("pty/readOutput", { sessionId }),
    getCwd: (sessionId: string) => callBackend<{ cwd: string }>("pty/getCwd", { sessionId }),
    resize: (sessionId: string, cols: number, rows: number) => callBackend<void>("pty/resize", { sessionId, cols, rows }),
  },
  git: {
    branch: (path: string) => callBackend<string | null>("git/branch", { path }),
    repoRoot: (path: string) => callBackend<string | null>("git/repoRoot", { path }),
    branches: (repo: string) => callBackend<any[]>("git/branches", { repo }),
    checkout: (repo: string, branch: string, create: boolean) => callBackend<void>("git/checkout", { repo, branch, create }),
    status: (repo: string) => callBackend<any>("git/status", { repo }),
    diff: (repo: string, path: string, staged?: boolean, untracked?: boolean) => callBackend<string>("git/diff", { repo, path, staged, untracked }),
    fileHead: (repo: string, path: string) => callBackend<string>("git/fileHead", { repo, path }),
    discard: (repo: string, tracked: string[], untracked: string[]) => callBackend<void>("git/discard", { repo, tracked, untracked }),
    stage: (repo: string, paths: string[]) => callBackend<void>("git/stage", { repo, paths }),
    stageAll: (repo: string) => callBackend<void>("git/stageAll", { repo }),
    unstage: (repo: string, paths: string[]) => callBackend<void>("git/unstage", { repo, paths }),
    commit: (repo: string, summary: string, description?: string) => callBackend<any>("git/commit", { repo, summary, description }),
    prTemplate: (repo: string) => callBackend<string | null>("git/prTemplate", { repo }),
    log: (repo: string, limit?: number) => callBackend<any[]>("git/log", { repo, limit }),
    stashList: (repo: string) => callBackend<any[]>("git/stashList", { repo }),
    stashPush: (repo: string, message?: string) => callBackend<void>("git/stashPush", { repo, message }),
    stashApply: (repo: string, index: number) => callBackend<void>("git/stashApply", { repo, index }),
    stashDrop: (repo: string, index: number) => callBackend<void>("git/stashDrop", { repo, index }),
    commitAmend: (repo: string, summary: string, description?: string) => callBackend<any>("git/commitAmend", { repo, summary, description }),
    cherryPick: (repo: string, hash: string) => callBackend<void>("git/cherryPick", { repo, hash }),
    blame: (repo: string, path: string) => callBackend<any[]>("git/blame", { repo, path }),
    stageHunk: (repo: string, patch: string) => callBackend<void>("git/stageHunk", { repo, patch }),
    conflictResolve: (repo: string, path: string, resolution: string) => callBackend<void>("git/conflictResolve", { repo, path, resolution }),
    generateCommitMessage: (repoPath: string) => callBackend<string>("git/generateCommitMessage", { repoPath }),
  },
  lsp: {
    startServer: (language: string, rootPath: string) => callBackend<{ serverId: string }>("lsp/startServer", { language, rootPath }),
    sendRequest: (serverId: string, method: string, params: any) => callBackend<any>("lsp/sendRequest", { serverId, method, params }),
    sendNotification: (serverId: string, method: string, params: any) => callBackend<void>("lsp/sendNotification", { serverId, method, params }),
    stopServer: (serverId: string) => callBackend<void>("lsp/stopServer", { serverId }),
  },
  agent: {
    spawnTask: (name: string, prompt: string, rootPath: string) => callBackend<void>("agent/spawnTask", { name, prompt, rootPath }),
    getTasks: () => callBackend<any[]>("agent/getTasks"),
  },
  github: {
    status: () => callBackend<any>("github/status"),
    setPat: (token: string) => callBackend<any>("github/setPat", { token }),
    switch: (username: string) => callBackend<void>("github/switch", { username }),
    logout: (username?: string) => callBackend<void>("github/logout", { username }),
    deviceStart: (clientId?: string) => callBackend<any>("github/deviceStart", { clientId }),
    devicePoll: (clientId: string, deviceCode: string) => callBackend<any>("github/devicePoll", { clientId, deviceCode }),
    remoteInfo: (repo: string) => callBackend<any>("github/remoteInfo", { repo }),
    push: (repo: string) => callBackend<void>("github/push", { repo }),
    pull: (repo: string) => callBackend<void>("github/pull", { repo }),
    prForBranch: (owner: string, name: string, branch: string) => callBackend<any>("github/prForBranch", { owner, name, branch }),
    prReviews: (owner: string, name: string, number: number) => callBackend<any>("github/prReviews", { owner, name, number }),
    listPrs: (owner: string, name: string) => callBackend<any[]>("github/listPrs", { owner, name }),
    createPr: (owner: string, name: string, head: string, base: string, title: string, body?: string) => callBackend<any>("github/createPr", { owner, name, head, base, title, body }),
    prDetail: (owner: string, name: string, number: number) => callBackend<any>("github/prDetail", { owner, name, number }),
    prFiles: (owner: string, name: string, number: number) => callBackend<any[]>("github/prFiles", { owner, name, number }),
    prReplyThread: (owner: string, name: string, number: number, commentId: number, body: string) => callBackend<void>("github/prReplyThread", { owner, name, number, commentId, body }),
    prResolveThread: (threadId: string, resolved: boolean) => callBackend<void>("github/prResolveThread", { threadId, resolved }),
    prComment: (owner: string, name: string, number: number, body: string) => callBackend<void>("github/prComment", { owner, name, number, body }),
    prMerge: (owner: string, name: string, number: number, method: string) => callBackend<void>("github/prMerge", { owner, name, number, method }),
    issuesList: (owner: string, name: string) => callBackend<any[]>("github/issuesList", { owner, name }),
    prMarkReady: (owner: string, name: string, number: number) => callBackend<void>("github/prMarkReady", { owner, name, number }),
    workflowRuns: (owner: string, name: string, branch?: string) => callBackend<any[]>("github/workflowRuns", { owner, name, branch }),
    workflowJobs: (owner: string, name: string, runId: number) => callBackend<any[]>("github/workflowJobs", { owner, name, runId }),
    jobLog: (owner: string, name: string, jobId: number) => callBackend<string>("github/jobLog", { owner, name, jobId }),
    prChecks: (owner: string, name: string, sha: string) => callBackend<any>("github/prChecks", { owner, name, sha }),
  },
  store: {
    addRecentFolder: (path: string) => callBackend<void>("store/addRecentFolder", { path }),
    clearRecentFolders: () => callBackend<void>("store/clearRecentFolders"),
  },
};
