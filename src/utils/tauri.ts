import {
  callBackend,
  isElectron,
  openFileDialog,
  openFolderDialog,
  openInFinder,
  saveFileDialog,
} from "../api/client";

export { isElectron };

export const isDesktopEnvironment = (): boolean => isElectron();

export const isTauriEnvironment = (): boolean => isDesktopEnvironment();

export const isDesktop = (): boolean => isDesktopEnvironment();

export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (cmd === "open_folder_dialog") {
    return (await openFolderDialog()) as unknown as T;
  }
  if (cmd === "open_file_dialog") {
    return (await openFileDialog()) as unknown as T;
  }
  if (cmd === "save_file_dialog") {
    const defaultName = args?.default_name as string | undefined;
    return (await saveFileDialog(defaultName)) as unknown as T;
  }
  if (cmd === "open_in_finder") {
    const path = (args?.path as string) || "";
    await openInFinder(path);
    return undefined as unknown as T;
  }

  const cmdToMethodMap: Record<string, string> = {
    get_app_cwd: "system/getCwd",
    get_current_workspace: "workspace/getCurrent",
    create_workspace: "workspace/create",
    read_file_content: "fs/readContent",
    save_file_content: "fs/saveContent",
    list_dir_files: "fs/listDir",
    get_workspace_type_defs: "fs/getTypeDefs",
    get_workspace_source_files: "fs/getSourceFiles",
    spawn_terminal: "pty/spawn",
    write_terminal: "pty/write",
    read_terminal_output: "pty/readOutput",
    get_terminal_cwd: "pty/getCwd",
    resize_terminal: "pty/resize",
    git_branch: "git/branch",
    git_repo_root: "git/repoRoot",
    git_branches: "git/branches",
    git_checkout: "git/checkout",
    git_status: "git/status",
    git_diff: "git/diff",
    git_file_head: "git/fileHead",
    git_discard: "git/discard",
    git_stage: "git/stage",
    git_stage_all: "git/stageAll",
    git_unstage: "git/unstage",
    git_commit: "git/commit",
    git_pr_template: "git/prTemplate",
    git_log: "git/log",
    git_stash_list: "git/stashList",
    git_stash_push: "git/stashPush",
    git_stash_apply: "git/stashApply",
    git_stash_drop: "git/stashDrop",
    git_commit_amend: "git/commitAmend",
    git_cherry_pick: "git/cherryPick",
    git_blame: "git/blame",
    git_stage_hunk: "git/stageHunk",
    git_conflict_resolve: "git/conflictResolve",
    generate_commit_message: "git/generateCommitMessage",
    lsp_start_server: "lsp/startServer",
    lsp_send_request: "lsp/sendRequest",
    lsp_send_notification: "lsp/sendNotification",
    lsp_stop_server: "lsp/stopServer",
    spawn_agent_task: "agent/spawnTask",
    get_agent_tasks: "agent/getTasks",
    gh_status: "github/status",
    gh_set_pat: "github/setPat",
    gh_switch: "github/switch",
    gh_logout: "github/logout",
    gh_device_start: "github/deviceStart",
    gh_device_poll: "github/devicePoll",
    gh_remote_info: "github/remoteInfo",
    gh_push: "github/push",
    gh_pull: "github/pull",
    gh_pr_for_branch: "github/prForBranch",
    gh_pr_reviews: "github/prReviews",
    gh_list_prs: "github/listPrs",
    gh_create_pr: "github/createPr",
    gh_pr_detail: "github/prDetail",
    gh_pr_files: "github/prFiles",
    gh_pr_reply_thread: "github/prReplyThread",
    gh_pr_resolve_thread: "github/prResolveThread",
    gh_pr_comment: "github/prComment",
    gh_pr_merge: "github/prMerge",
    gh_issues_list: "github/issuesList",
    gh_pr_mark_ready: "github/prMarkReady",
    gh_workflow_runs: "github/workflowRuns",
    gh_workflow_jobs: "github/workflowJobs",
    gh_job_log: "github/jobLog",
    gh_pr_checks: "github/prChecks",
    add_recent_folder: "store/addRecentFolder",
    clear_recent_folders: "store/clearRecentFolders",
  };

  const method = cmdToMethodMap[cmd] || cmd;
  const res = await callBackend<any>(method, args);

  if (res && typeof res === "object") {
    if (cmd === "spawn_terminal" && "sessionId" in res) return res.sessionId as T;
    if (cmd === "read_terminal_output" && "data" in res) return res.data as T;
    if (cmd === "get_terminal_cwd" && "cwd" in res) return res.cwd as T;
    if (cmd === "lsp_start_server" && "serverId" in res) return res.serverId as T;
  }

  return res as T;
}
