import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgentTask } from "../types";
import { Bot, Play, CheckCircle2, RefreshCw, Sparkles, X } from "lucide-react";

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ isOpen, onClose, rootPath }) => {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [taskName, setTaskName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await invoke<AgentTask[]>("get_agent_tasks");
      setTasks(res);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
    }
  }, [isOpen]);

  const handleSpawnTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim() || !prompt.trim()) return;

    setLoading(true);
    try {
      await invoke("spawn_agent_task", { name: taskName.trim(), prompt: prompt.trim(), rootPath });
      setTaskName("");
      setPrompt("");
      setTimeout(fetchTasks, 400);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 bottom-4 w-96 bg-zinc-900 border border-zinc-700/90 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden text-xs select-none">
      {/* Header */}
      <div className="h-9 bg-zinc-800/80 px-3 flex items-center justify-between border-b border-zinc-700">
        <div className="flex items-center space-x-1.5 font-semibold text-indigo-300">
          <Bot size={15} />
          <span>Developer Intelligence Panel</span>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={fetchTasks} className="p-1 text-zinc-400 hover:text-zinc-200">
            <RefreshCw size={13} />
          </button>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-rose-400">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Task Creation Form */}
      <form onSubmit={handleSpawnTask} className="p-3 border-b border-zinc-800 space-y-2 bg-zinc-950/50">
        <input
          type="text"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          placeholder="Task title (e.g., Explain Error)..."
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt agent (e.g., Check compilation output and suggest refactor)..."
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 h-14 resize-none"
        />
        <button
          type="submit"
          disabled={loading || !taskName.trim() || !prompt.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium py-1 rounded flex items-center justify-center space-x-1 transition-colors"
        >
          <Sparkles size={13} />
          <span>Run Contextual Agent</span>
        </button>
      </form>

      {/* Task List */}
      <div className="p-3 max-h-60 overflow-y-auto space-y-2">
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          Active & Recent Agent Tasks ({tasks.length})
        </div>

        {tasks.length === 0 ? (
          <div className="text-zinc-500 text-[11px] py-4 text-center">No active agent tasks.</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="bg-zinc-950 border border-zinc-800/80 p-2 rounded space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">{task.name}</span>
                <span className="flex items-center space-x-1 text-[10px] font-mono">
                  {task.status.includes("Completed") ? (
                    <CheckCircle2 size={12} className="text-emerald-400" />
                  ) : (
                    <Play size={12} className="text-amber-400 animate-pulse" />
                  )}
                  <span className="text-zinc-400">{task.status}</span>
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] font-mono line-clamp-1">{task.prompt}</p>
              {task.result && (
                <div className="mt-1 bg-zinc-900 p-1.5 rounded text-[10px] text-emerald-300 font-mono whitespace-pre-wrap">
                  {task.result}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
