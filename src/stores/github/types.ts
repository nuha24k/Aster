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
