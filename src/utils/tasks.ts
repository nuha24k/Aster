/**
 * TASKS.md — the kanban board is just a view over a Markdown file in the
 * workspace root, so an AI running in the terminal can read the board with
 * `cat TASKS.md` and edit it with the same tools it edits code.
 *
 *   ## Todo
 *   - [ ] (P0) Fix terminal cwd
 *   - [x] (P2) Ship the menu bar
 */

export const TASKS_FILE = "TASKS.md";

export type Priority = "P0" | "P1" | "P2" | "P3";

export interface Task {
  id: string;
  text: string;
  priority: Priority;
  done: boolean;
}

export interface Column {
  title: string;
  tasks: Task[];
}

export interface Board {
  /** Everything above the first `## ` heading, kept verbatim on save. */
  header: string;
  columns: Column[];
}

export const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

const DEFAULT_HEADER = `# Tasks

<!-- ASTER Kanban. Columns are \`## headings\`, tasks are checkboxes.
     Priority tag: (P0) highest … (P3) lowest. Agents: read this file for
     what to work on next, and tick items off here when they are done. -->`;

const DEFAULT_COLUMNS = ["Todo", "In Progress", "Done"];

export const emptyBoard = (): Board => ({
  header: DEFAULT_HEADER,
  columns: DEFAULT_COLUMNS.map((title) => ({ title, tasks: [] })),
});

const newId = () => Math.random().toString(36).slice(2, 10);

export function parseBoard(markdown: string): Board {
  if (!markdown.trim()) return emptyBoard();

  const lines = markdown.split("\n");
  const firstHeading = lines.findIndex((l) => /^##\s+/.test(l));
  if (firstHeading === -1) return { ...emptyBoard(), header: markdown.trimEnd() };

  const columns: Column[] = [];
  for (const line of lines.slice(firstHeading)) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      columns.push({ title: heading[1].trim(), tasks: [] });
      continue;
    }
    const item = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (!item || columns.length === 0) continue;

    const tag = item[2].match(/^\((P[0-3])\)\s*/);
    columns[columns.length - 1].tasks.push({
      id: newId(),
      done: item[1].toLowerCase() === "x",
      priority: (tag?.[1] as Priority) ?? "P2",
      text: item[2].slice(tag?.[0].length ?? 0).trim(),
    });
  }

  return { header: lines.slice(0, firstHeading).join("\n").trimEnd(), columns };
}

export function serializeBoard(board: Board): string {
  const body = board.columns
    .map((col) => {
      const tasks = col.tasks
        .map((t) => `- [${t.done ? "x" : " "}] (${t.priority}) ${t.text}`)
        .join("\n");
      return `## ${col.title}\n\n${tasks}${tasks ? "\n" : ""}`;
    })
    .join("\n");

  return `${board.header.trimEnd()}\n\n${body}`;
}
