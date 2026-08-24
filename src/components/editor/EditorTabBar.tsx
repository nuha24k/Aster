import React from "react";
import { X, FilePlus, ExternalLink } from "lucide-react";
import { EditorTabItem } from "../../types";
import { renderFileIcon } from "./EditorFileTree";

interface EditorTabBarProps {
  tabs: EditorTabItem[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void;
  onNewFile: () => void;
  onOpenFileDialog: () => void;
}

export const EditorTabBar: React.FC<EditorTabBarProps> = ({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
  onNewFile,
  onOpenFileDialog,
}) => {
  if (tabs.length === 0) return null;

  return (
    <div className="flex bg-zinc-950 border-b border-zinc-800/80 overflow-x-auto shrink-0 custom-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.path === activeTabPath;
        return (
          <div
            key={tab.path}
            onClick={() => onTabClick(tab.path)}
            className={`group flex items-center space-x-2 px-3 py-2 border-r border-zinc-800/60 text-xs cursor-pointer transition-colors shrink-0 max-w-[200px] ${
              isActive
                ? "bg-zinc-900/90 text-zinc-100 font-medium border-t-2 border-t-indigo-500"
                : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
            }`}
          >
            {renderFileIcon(tab.name)}
            <span className="truncate font-mono text-[11px] flex-1">{tab.name}</span>
            {tab.isDirty && (
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" title="Unsaved changes" />
            )}
            <button
              onClick={(e) => onTabClose(tab.path, e)}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Close Tab"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <div className="flex items-center px-2 space-x-1 shrink-0">
        <button
          onClick={onNewFile}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded transition-colors"
          title="New Scratch Tab"
        >
          <FilePlus size={13} />
        </button>
        <button
          onClick={onOpenFileDialog}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded transition-colors"
          title="Open File..."
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
};
