import React from "react";
import { useGithubStore } from "../../githubStore";
import { Loader, X, FileText } from "lucide-react";

export const CiLogsModal: React.FC = () => {
  const {
    ciLogsModalOpen,
    ciLogsContent,
    ciLogsLoading,
    ciLogsJobName,
    setCiLogsModalOpen,
  } = useGithubStore();

  if (!ciLogsModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-3xl h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-indigo-400" />
            <h3 className="text-xs font-semibold text-zinc-100 font-mono truncate max-w-xl">
              CI Logs: {ciLogsJobName}
            </h3>
          </div>
          <button onClick={() => setCiLogsModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow bg-zinc-950 p-4 font-mono text-[11px] text-zinc-300 overflow-auto whitespace-pre leading-normal relative select-text">
          {ciLogsLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50">
              <div className="flex flex-col items-center gap-2">
                <Loader size={20} className="animate-spin text-indigo-500" />
                <span className="text-xs text-zinc-500">Loading logs from S3…</span>
              </div>
            </div>
          ) : (
            <code className="block">{ciLogsContent || "No logs available for this job."}</code>
          )}
        </div>
      </div>
    </div>
  );
};
