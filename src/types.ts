export type SplitDirection = "Vertical" | "Horizontal";

export type LayoutNode =
  | { type: "Surface"; surfaceId: string }
  | {
      type: "Split";
      direction: SplitDirection;
      /** 0–100, percentage of space given to the first child */
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };


export interface WorkspaceInfo {
  id: string;
  name: string;
  root_path: string;
  layout: LayoutNode;
}

export type AgentStatus = "Idle" | "Working" | "Blocked" | "Done";

export interface TerminalPane {
  id: string;
  title: string;
  cwd?: string;
  status: AgentStatus;
}

export interface GitFileStatus {
  path: string;
  status: string;
  is_staged: boolean;
}

export interface GitStatus {
  branch: String;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

export interface LogEvent {
  id: string;
  timestamp: string;
  source: "Terminal" | "Git" | "Editor" | "System";
  level: "Info" | "Warn" | "Error" | "Debug";
  message: string;
}

export interface FileItem {
  path: string;
  name: string;
  is_dir: boolean;
}

export interface EditorTabItem {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
}

export interface AgentTask {
  id: string;
  name: string;
  status: string;
  prompt: string;
  result?: string;
}
