import React, { useState } from "react";
import { LogEvent } from "../types";
import { Search, Filter, Pause, Play, Trash2 } from "lucide-react";

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<LogEvent[]>([
    { id: "1", timestamp: "2026-08-18 20:20:01", source: "System", level: "Info", message: "ASTER Workspace initialized" },
    { id: "2", timestamp: "2026-08-18 20:20:05", source: "Terminal", level: "Info", message: "PTY Session term_1 spawned" },
    { id: "3", timestamp: "2026-08-18 20:21:12", source: "Git", level: "Debug", message: "Git repository status updated" },
  ]);

  const [filterSource, setFilterSource] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const filteredLogs = logs.filter((log) => {
    const matchesSource = filterSource === "All" || log.source === filterSource;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesSearch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case "Error":
        return "text-rose-400 bg-rose-950/40 border-rose-800/40";
      case "Warn":
        return "text-amber-400 bg-amber-950/40 border-amber-800/40";
      case "Debug":
        return "text-indigo-400 bg-indigo-950/40 border-indigo-800/40";
      default:
        return "text-emerald-400 bg-emerald-950/40 border-emerald-800/40";
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-200 select-none overflow-hidden">
      {/* Logs Toolbar */}
      <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 text-xs">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search log messages..."
              className="bg-zinc-950 border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 w-60"
            />
          </div>

          <div className="flex items-center space-x-1">
            <Filter size={13} className="text-zinc-500" />
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="All">All Sources</option>
              <option value="System">System</option>
              <option value="Terminal">Terminal</option>
              <option value="Git">Git</option>
              <option value="Editor">Editor</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-1 text-zinc-400">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
              isPaused ? "bg-amber-950/60 text-amber-300" : "hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {isPaused ? <Play size={13} /> : <Pause size={13} />}
            <span>{isPaused ? "Resume" : "Pause"}</span>
          </button>
          <button
            onClick={() => setLogs([])}
            className="p-1 hover:bg-zinc-800 hover:text-rose-400 rounded transition-colors"
            title="Clear Logs"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Logs Output List */}
      <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1.5 bg-zinc-950">
        {filteredLogs.map((log) => (
          <div key={log.id} className="flex items-start space-x-3 hover:bg-zinc-900/50 p-1 rounded">
            <span className="text-zinc-600 text-[11px] select-none">{log.timestamp}</span>
            <span className={`px-1.5 py-0.2 text-[10px] font-semibold rounded border ${getLevelColor(log.level)}`}>
              {log.level}
            </span>
            <span className="text-zinc-400 text-[11px] font-semibold min-w-[70px]">[{log.source}]</span>
            <span className="text-zinc-200 flex-1">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
