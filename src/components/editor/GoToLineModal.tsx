import React, { useState, useEffect, useRef } from "react";
import { Hash } from "lucide-react";

interface GoToLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxLines: number;
  onGoToLine: (line: number) => void;
}

export const GoToLineModal: React.FC<GoToLineModalProps> = ({
  isOpen,
  onClose,
  maxLines,
  onGoToLine,
}) => {
  const [lineStr, setLineStr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLineStr("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lineNum = parseInt(lineStr.trim(), 10);
    if (!isNaN(lineNum) && lineNum >= 1) {
      const targetLine = Math.min(lineNum, maxLines);
      onGoToLine(targetLine);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="p-3 border-b border-zinc-800/80 flex items-center space-x-2 bg-zinc-950">
          <Hash size={16} className="text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={maxLines}
            value={lineStr}
            onChange={(e) => setLineStr(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Type line number (1 - ${maxLines})...`}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono transition-colors"
          >
            Go
          </button>
        </form>
      </div>
    </div>
  );
};
