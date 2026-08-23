export interface SuggestionItem {
  value: string;
  type: "history" | "command" | "arg" | "file" | "folder" | "branch";
}

export const POPULAR_COMMANDS = [
  "git", "cd", "ls", "npm", "cargo", "docker", "node", "npx", "python",
  "pip", "grep", "cat", "mkdir", "rm", "cp", "mv", "ssh", "curl", "wget",
  "make", "yarn", "pnpm", "bun", "clear", "exit", "pwd", "nano", "vim"
];

export const GIT_SUBCOMMANDS = [
  "status", "diff", "add", "commit", "push", "pull", "checkout", "branch",
  "merge", "rebase", "stash", "log", "clone", "init", "reset", "cherry-pick"
];

export const NPM_SUBCOMMANDS = ["run", "install", "test", "build", "start", "init", "publish", "ci"];
export const CARGO_SUBCOMMANDS = ["check", "build", "run", "test", "clippy", "fmt", "init", "new", "doc", "bench"];

export function fuzzyMatch(input: string, candidate: string): boolean {
  if (!input) return true;
  const q = input.toLowerCase();
  const c = candidate.toLowerCase();
  if (c.includes(q)) return true;
  let qIdx = 0;
  for (let i = 0; i < c.length && qIdx < q.length; i++) {
    if (c[i] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}
