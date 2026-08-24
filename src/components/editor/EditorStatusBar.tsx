import React from "react";
import { WrapText, Code2 } from "lucide-react";
import { EditorTabItem } from "../../types";

interface EditorStatusBarProps {
  activeTab: EditorTabItem | undefined;
  cursorPosition: { line: number; col: number };
  lineCount: number;
  wordWrap: "on" | "off";
  autoSave: boolean;
  onToggleWordWrap: () => void;
  onToggleAutoSave: () => void;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  activeTab,
  cursorPosition,
  lineCount,
  wordWrap,
  autoSave,
  onToggleWordWrap,
  onToggleAutoSave,
}) => {
  return (
    <div className="h-6 bg-zinc-950 border-t border-zinc-800/80 px-3 flex items-center justify-between text-[10px] font-mono text-zinc-400 shrink-0">
      <div className="flex items-center space-x-4">
        {activeTab && (
          <>
            <span>
              Ln {cursorPosition.line}, Col {cursorPosition.col}
            </span>
            <span>{lineCount} lines</span>
            <span>{activeTab.content.length} chars</span>
          </>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleWordWrap}
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors ${
            wordWrap === "on" ? "text-indigo-300 font-medium" : "text-zinc-400"
          }`}
          title="Toggle Word Wrap"
        >
          <WrapText size={11} />
          <span>Wrap: {wordWrap}</span>
        </button>

        <button
          onClick={onToggleAutoSave}
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors ${
            autoSave ? "text-emerald-400 font-medium" : "text-zinc-400"
          }`}
          title="Auto save file on pause"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              autoSave ? "bg-emerald-400" : "bg-zinc-600"
            }`}
          />
          <span>AutoSave: {autoSave ? "ON" : "OFF"}</span>
        </button>

        {activeTab && (
          <span className="text-zinc-400 uppercase font-medium bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
            {activeTab.language}
          </span>
        )}

        <div className="flex items-center space-x-1 text-zinc-400">
          <Code2 size={11} />
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
};
