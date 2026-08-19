import React, { useState } from "react";
import { useWorkspaceStore } from "../store";
import { Search, Terminal, GitBranch, ScrollText, Sidebar as SidebarIcon, X } from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { setActiveSurface, toggleSidebar, splitPane, activeTerminalId } = useWorkspaceStore();
  const [query, setQuery] = useState("");

  if (!isOpen) return null;

  const commands = [
    {
      id: "term",
      label: "Open Terminal Surface",
      icon: Terminal,
      action: () => setActiveSurface("Terminal"),
    },
    {
      id: "git",
      label: "Open Git & Diff Cockpit Surface",
      icon: GitBranch,
      action: () => setActiveSurface("Git"),
    },
    {
      id: "logs",
      label: "Open Structured Logs Surface",
      icon: ScrollText,
      action: () => setActiveSurface("Logs"),
    },
    {
      id: "split-v",
      label: "Split Terminal Vertically",
      icon: Terminal,
      action: () => activeTerminalId && splitPane(activeTerminalId, "Vertical"),
    },
    {
      id: "split-h",
      label: "Split Terminal Horizontally",
      icon: Terminal,
      action: () => activeTerminalId && splitPane(activeTerminalId, "Horizontal"),
    },
    {
      id: "editor",
      label: "Open Editor (Follow Workspace Directory)",
      icon: Terminal,
      action: () => setActiveSurface("Editor"),
    },
    {
      id: "sidebar",
      label: "Toggle Workspace Sidebar",
      icon: SidebarIcon,
      action: () => toggleSidebar(),
    },
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div className="bg-zinc-900 border border-zinc-700/80 w-[500px] rounded-lg shadow-2xl overflow-hidden select-none">
        <div className="flex items-center px-3 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500 mr-2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="w-full bg-transparent py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            autoFocus
          />
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
          {filteredCommands.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <div
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className="flex items-center space-x-3 px-3 py-2 rounded text-xs text-zinc-300 hover:bg-indigo-600/30 hover:text-indigo-200 cursor-pointer transition-colors"
              >
                <Icon size={14} className="text-zinc-400" />
                <span>{cmd.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
