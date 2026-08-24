import React from "react";
import { History, Command, Terminal as TermIcon, GitBranch, Folder, FileText } from "lucide-react";
import { SuggestionItem } from "./terminalSuggestions";

interface TerminalAutocompleteMenuProps {
  show: boolean;
  coords: { left: number; top: number } | null;
  suggestions: SuggestionItem[];
  selectedIndex: number;
  onApplySuggestion: (value: string, execute?: boolean) => void;
}

const renderSuggestionIcon = (type: SuggestionItem["type"]) => {
  switch (type) {
    case "history":
      return <History size={12} className="text-zinc-400 shrink-0" />;
    case "command":
      return <Command size={12} className="text-amber-400 shrink-0" />;
    case "arg":
      return <TermIcon size={12} className="text-cyan-400 shrink-0" />;
    case "branch":
      return <GitBranch size={12} className="text-emerald-400 shrink-0" />;
    case "folder":
      return <Folder size={12} className="text-blue-400 shrink-0" />;
    case "file":
      return <FileText size={12} className="text-zinc-400 shrink-0" />;
  }
};

export const TerminalAutocompleteMenu: React.FC<TerminalAutocompleteMenuProps> = ({
  show,
  coords,
  suggestions,
  selectedIndex,
  onApplySuggestion,
}) => {
  if (!show || !coords || suggestions.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${coords.left}px`,
        top: `${coords.top}px`,
      }}
      className="z-40 w-80 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-md shadow-2xl overflow-hidden font-mono text-xs flex flex-col animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-950/60 text-[10px] text-zinc-400">
        <span className="font-semibold text-zinc-300">Suggestions</span>
        <span className="text-[9.5px]">↑↓ navigate · Tab fill · Enter run</span>
      </div>

      <div className="max-h-48 overflow-y-auto py-1">
        {suggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={item.value + idx}
              onClick={(e) => {
                e.stopPropagation();
                onApplySuggestion(item.value, false);
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 cursor-pointer text-[11.5px] transition-colors ${
                isSelected
                  ? "bg-indigo-600/30 text-indigo-100 border-l-2 border-indigo-500 font-medium"
                  : "text-zinc-300 hover:bg-zinc-800/80"
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                {renderSuggestionIcon(item.type)}
                <span className="truncate">{item.value}</span>
              </div>

              <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 font-sans">
                {item.type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
