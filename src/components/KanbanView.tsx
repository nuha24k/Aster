import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../store";
import { safeInvoke, isTauriEnvironment } from "../utils/tauri";
import {
  Board, Column, Priority, PRIORITIES, TASKS_FILE, emptyBoard, parseBoard, serializeBoard,
} from "../utils/tasks";
import {
  KanbanSquare, Plus, RefreshCw, Trash2, Terminal as TermIcon, GripVertical, FileText,
} from "lucide-react";

interface KanbanViewProps {
  rootPath: string;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  P0: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  P1: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  P2: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  P3: "bg-zinc-500/15 text-zinc-400 border-zinc-600/40",
};

const joinPath = (root: string, name: string) =>
  `${root.replace(/[/\\]+$/, "")}/${name}`;

export const KanbanView: React.FC<KanbanViewProps> = ({ rootPath }) => {
  const activeTerminalId = useWorkspaceStore((s) => s.activeTerminalId);
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  /** Last content this view wrote or read — lets the poll ignore its own saves. */
  const fileRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragged = useRef<{ col: number; id: string } | null>(null);

  const filePath = rootPath ? joinPath(rootPath, TASKS_FILE) : "";

  const load = useCallback(async () => {
    if (!filePath) return;
    const text = await safeInvoke<string>("read_file_content", { path: filePath }).catch(() => "");
    fileRef.current = text;
    setBoard(parseBoard(text));
  }, [filePath]);

  useEffect(() => {
    load();
  }, [load]);

  // The agent in the terminal edits TASKS.md too — pick its changes up.
  useEffect(() => {
    if (!filePath) return;
    const poll = setInterval(async () => {
      if (editing || saveTimer.current) return;
      const text = await safeInvoke<string>("read_file_content", { path: filePath }).catch(() => null);
      if (text !== null && text !== fileRef.current) {
        fileRef.current = text;
        setBoard(parseBoard(text));
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [filePath, editing]);

  const commit = (next: Board) => {
    setBoard(next);
    if (!filePath) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const content = serializeBoard(next);
      try {
        await safeInvoke("save_file_content", { path: filePath, content });
        fileRef.current = content;
        setStatus(`Saved ${TASKS_FILE}`);
      } catch (e) {
        setStatus(`Save failed: ${String(e)}`);
      }
      saveTimer.current = null;
      setTimeout(() => setStatus(""), 2000);
    }, 400);
  };

  const mapColumn = (index: number, fn: (col: Column) => Column) =>
    commit({ ...board, columns: board.columns.map((c, i) => (i === index ? fn(c) : c)) });

  const addTask = (colIndex: number) => {
    const text = (draft[colIndex] || "").trim();
    if (!text) return;
    setDraft((d) => ({ ...d, [colIndex]: "" }));
    mapColumn(colIndex, (col) => ({
      ...col,
      tasks: [...col.tasks, { id: Math.random().toString(36).slice(2, 10), text, priority: "P2", done: false }],
    }));
  };

  const cyclePriority = (colIndex: number, id: string) =>
    mapColumn(colIndex, (col) => ({
      ...col,
      tasks: col.tasks.map((t) =>
        t.id === id ? { ...t, priority: PRIORITIES[(PRIORITIES.indexOf(t.priority) + 1) % PRIORITIES.length] } : t
      ),
    }));

  const toggleDone = (colIndex: number, id: string) =>
    mapColumn(colIndex, (col) => ({
      ...col,
      tasks: col.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));

  const editText = (colIndex: number, id: string, text: string) =>
    mapColumn(colIndex, (col) => ({
      ...col,
      tasks: col.tasks.map((t) => (t.id === id ? { ...t, text } : t)),
    }));

  const removeTask = (colIndex: number, id: string) =>
    mapColumn(colIndex, (col) => ({ ...col, tasks: col.tasks.filter((t) => t.id !== id) }));

  const dropOn = (targetCol: number) => {
    const from = dragged.current;
    dragged.current = null;
    if (!from || from.col === targetCol) return;
    const task = board.columns[from.col]?.tasks.find((t) => t.id === from.id);
    if (!task) return;
    commit({
      ...board,
      columns: board.columns.map((col, i) => {
        if (i === from.col) return { ...col, tasks: col.tasks.filter((t) => t.id !== from.id) };
        if (i === targetCol) return { ...col, tasks: [...col.tasks, task] };
        return col;
      }),
    });
  };

  /** Hand the board to whatever is running in the focused terminal. */
  const sendToTerminal = () => {
    if (!activeTerminalId || !isTauriEnvironment()) return;
    safeInvoke("write_terminal", {
      sessionId: activeTerminalId,
      data: `cat ${TASKS_FILE}\n`,
    }).catch(() => {});
    useWorkspaceStore.getState().setActiveSurface("Terminal");
  };

  if (!rootPath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs">
        <KanbanSquare size={40} className="text-zinc-700 mb-3" />
        Open a workspace folder to use the task board.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden select-none">
      {/* Header */}
      <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 text-zinc-300">
          <KanbanSquare size={14} className="text-indigo-400" />
          <span className="text-xs font-semibold tracking-wide">Task Board</span>
          <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500" title={filePath}>
            <FileText size={10} />
            {TASKS_FILE}
          </span>
          {status && <span className="text-[10px] font-mono text-emerald-400">{status}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={sendToTerminal}
            disabled={!activeTerminalId}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-zinc-850 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            title={`Run "cat ${TASKS_FILE}" in the active terminal so the agent reads the board`}
          >
            <TermIcon size={12} />
            Send to Terminal
          </button>
          <button
            onClick={load}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Reload from disk"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
        <div className="flex gap-3 h-full min-w-min">
          {board.columns.map((col, colIndex) => (
            <div
              key={col.title + colIndex}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(colIndex)}
              className="w-72 shrink-0 flex flex-col bg-zinc-900/50 border border-zinc-800/80 rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80">
                <span className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider truncate">
                  {col.title}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">{col.tasks.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {[...col.tasks]
                  .sort((a, b) => a.priority.localeCompare(b.priority))
                  .map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => (dragged.current = { col: colIndex, id: task.id })}
                      className={`group bg-zinc-900 border border-zinc-800 rounded p-2 flex items-start gap-1.5 hover:border-zinc-700 transition-colors ${
                        task.done ? "opacity-50" : ""
                      }`}
                    >
                      <GripVertical size={12} className="text-zinc-700 mt-0.5 shrink-0 cursor-grab" />
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggleDone(colIndex, task.id)}
                        className="mt-0.5 accent-indigo-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        {editing === task.id ? (
                          <input
                            autoFocus
                            defaultValue={task.text}
                            onBlur={(e) => {
                              setEditing(null);
                              const v = e.target.value.trim();
                              if (v && v !== task.text) editText(colIndex, task.id, v);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            className="w-full bg-zinc-950 border border-indigo-500/60 rounded px-1.5 py-0.5 text-[11px] text-zinc-100 focus:outline-none"
                          />
                        ) : (
                          <div
                            onDoubleClick={() => setEditing(task.id)}
                            className={`text-[11px] text-zinc-200 leading-snug break-words cursor-text ${
                              task.done ? "line-through" : ""
                            }`}
                            title="Double-click to edit"
                          >
                            {task.text}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            onClick={() => cyclePriority(colIndex, task.id)}
                            className={`px-1.5 py-px rounded border text-[9px] font-mono font-bold ${PRIORITY_STYLE[task.priority]}`}
                            title="Click to change priority"
                          >
                            {task.priority}
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => removeTask(colIndex, task.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition-opacity shrink-0"
                        title="Delete task"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
              </div>

              <div className="p-2 border-t border-zinc-800/80 flex items-center gap-1">
                <input
                  value={draft[colIndex] || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [colIndex]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTask(colIndex)}
                  placeholder="Add a task…"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => addTask(colIndex)}
                  className="p-1 rounded text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
