import React, { useState, useEffect } from "react";
import { useGitStore, useGithubStore, FileChange } from "../githubStore";
import { PrSection } from "./github/PrSection";
import { PrDetailView } from "./github/PrDetailView";
import { CiLogsModal } from "./github/CiLogsModal";
import { safeInvoke } from "../utils/tauri";
import {
  GitBranch,
  Plus,
  Minus,
  RefreshCw,
  FileText,
  Sparkles,
  Loader,
  Undo2,
} from "lucide-react";

interface GitViewProps {
  repoPath: string;
}

export const GitView: React.FC<GitViewProps> = ({ repoPath }) => {
  const git = useGitStore();
  const github = useGithubStore();

  const [commitMsg, setCommitMsg] = useState("");
  const [commitDesc, setCommitDesc] = useState("");
  const [amendMode, setAmendMode] = useState(false);
  const [stashMsg, setStashMsg] = useState("");
  const [checkpointName, setCheckpointName] = useState("");

  const status = git.statusByRepo[repoPath] || null;

  useEffect(() => {
    git.selectRepo(repoPath);
    git.refreshStash(repoPath);
  }, [repoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStageFile = async (filePath: string) => {
    await git.stage(repoPath, [filePath]);
  };

  const handleUnstageFile = async (filePath: string) => {
    await git.unstage(repoPath, [filePath]);
  };

  const handleDiscardChange = async (file: FileChange) => {
    if (confirm(`Are you sure you want to discard changes in ${file.path}? This cannot be undone.`)) {
      await git.discard(repoPath, file);
    }
  };

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMsg.trim()) return;
    
    let success = false;
    if (amendMode) {
      success = await git.amendCommit(repoPath, commitMsg.trim(), commitDesc.trim());
    } else {
      success = await git.commit(repoPath, commitMsg.trim(), commitDesc.trim());
    }

    if (success) {
      setCommitMsg("");
      setCommitDesc("");
      setAmendMode(false);
    }
  };

  const handleGenerateCommitMsg = async () => {
    if (!status || status.staged.length === 0) return;
    try {
      const generated = await safeInvoke<string>("generate_commit_message", { repoPath });
      const lines = generated.split("\n");
      setCommitMsg(lines[0] || "");
      if (lines.length > 1) {
        setCommitDesc(lines.slice(1).join("\n").trim());
      }
    } catch (err: any) {
      alert(`AI commit message failed: ${err}`);
    }
  };

  const handleStashPushSubmit = async () => {
    if (await git.stashPush(repoPath, stashMsg.trim())) {
      setStashMsg("");
    }
  };

  const handleCheckpointSubmit = async () => {
    if (await git.checkpointSave(repoPath, checkpointName.trim())) {
      setCheckpointName("");
    }
  };

  const handleConflictResolve = async (filePath: string, resolution: "ours" | "theirs") => {
    await git.conflictResolve(repoPath, filePath, resolution);
  };

  const renderDiffLine = (line: string, idx: number) => {
    const className =
      line.startsWith("+") && !line.startsWith("+++")
        ? "text-emerald-400 bg-emerald-950/10"
        : line.startsWith("-") && !line.startsWith("---")
        ? "text-rose-400 bg-rose-950/10"
        : line.startsWith("@@")
        ? "text-sky-400 bg-sky-950/5"
        : "text-zinc-300";
    return (
      <div key={idx} className={`${className} leading-relaxed font-mono whitespace-pre`}>
        {line}
      </div>
    );
  };

  // Group unstaged changes by folder structure
  const getFoldersList = () => {
    if (!status) return [];
    const groups: Record<string, string[]> = {};
    status.unstaged.forEach((f) => {
      const folder = f.path.includes("/") ? f.path.split("/")[0] : ".";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(f.path);
    });
    return Object.entries(groups);
  };

  const handleStageFolder = async (_folder: string, filePaths: string[]) => {
    await git.stage(repoPath, filePaths);
  };

  return (
    <div className="flex h-full w-full bg-zinc-950 text-zinc-200 select-none overflow-hidden font-mono text-xs">
      {/* 1. Left Section: Staging changes & commit control */}
      <div className="w-80 bg-zinc-900/60 border-r border-zinc-800 flex flex-col justify-between h-full min-w-[20rem]">
        <div className="p-3 space-y-4 flex-1 overflow-y-auto min-h-0">
          
          {/* Header & sync branch */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-bold text-zinc-300 text-[11px]">
              <GitBranch size={13} className="text-emerald-400" />
              <span>{status?.branch || "detached"}</span>
            </div>
            <button
              onClick={() => git.refresh(repoPath)}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              title="Refresh status"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {/* Staged files section */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex justify-between">
              <span>Staged ({status?.staged.length || 0})</span>
              {status && status.staged.length > 0 && (
                <button
                  onClick={() => git.unstage(repoPath, status.staged.map((f) => f.path))}
                  className="text-[9px] text-zinc-400 hover:text-zinc-200 hover:underline"
                >
                  unstage all
                </button>
              )}
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {status?.staged.map((file) => (
                <div
                  key={file.path}
                  onClick={() => git.selectFile(repoPath, file)}
                  className={`flex items-center justify-between p-1.5 rounded cursor-pointer ${
                    git.selected?.file.path === file.path && git.selected?.file.staged
                      ? "bg-indigo-950/40 text-indigo-300"
                      : "hover:bg-zinc-800/40 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <FileText size={12} className="text-emerald-400 shrink-0" />
                    <span className="truncate">{file.path}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnstageFile(file.path);
                    }}
                    className="p-0.5 hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 rounded shrink-0"
                    title="Unstage file"
                  >
                    <Minus size={11} />
                  </button>
                </div>
              ))}
              {status?.staged.length === 0 && (
                <span className="text-[10px] text-zinc-650 italic pl-1 block">No staged changes.</span>
              )}
            </div>
          </div>

          {/* Unstaged files section */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex justify-between">
              <span>Unstaged ({status?.unstaged.length || 0})</span>
              {status && status.unstaged.length > 0 && (
                <button
                  onClick={() => git.stageAll(repoPath)}
                  className="text-[9px] text-zinc-400 hover:text-zinc-200 hover:underline"
                >
                  stage all
                </button>
              )}
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {status?.unstaged.map((file) => (
                <div
                  key={file.path}
                  onClick={() => git.selectFile(repoPath, file)}
                  className={`flex items-center justify-between p-1.5 rounded cursor-pointer ${
                    git.selected?.file.path === file.path && !git.selected?.file.staged
                      ? "bg-zinc-850/60 text-zinc-300"
                      : "hover:bg-zinc-800/40 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <FileText size={12} className={file.status === "U" ? "text-blue-400" : "text-amber-500"} />
                    <span className="truncate">{file.path}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Conflict resolution buttons */}
                    {file.status === "!" && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConflictResolve(file.path, "ours"); }}
                          className="bg-indigo-950 text-indigo-300 border border-indigo-900 rounded px-1 text-[9px] hover:bg-indigo-900"
                          title="Accept ours"
                        >
                          ours
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConflictResolve(file.path, "theirs"); }}
                          className="bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1 text-[9px] hover:bg-zinc-700"
                          title="Accept theirs"
                        >
                          theirs
                        </button>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDiscardChange(file); }}
                      className="p-0.5 hover:bg-zinc-800 text-zinc-500 hover:text-rose-500 rounded shrink-0"
                      title="Discard change"
                    >
                      <Undo2 size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStageFile(file.path); }}
                      className="p-0.5 hover:bg-zinc-800 text-zinc-550 hover:text-emerald-400 rounded shrink-0"
                      title="Stage file"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {status?.unstaged.length === 0 && (
                <span className="text-[10px] text-zinc-650 italic pl-1 block">Clean working tree.</span>
              )}
            </div>
          </div>

          {/* Folder-based bulk staging list */}
          {getFoldersList().length > 1 && (
            <div className="space-y-1 pt-1.5 border-t border-zinc-800/40">
              <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block mb-1">
                Bulk Stage by Folder
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {getFoldersList().map(([folder, filePaths]) => (
                  <div key={folder} className="flex items-center justify-between px-2 py-1 bg-zinc-950/40 border border-zinc-850 rounded">
                    <span className="text-[10px] font-medium text-zinc-400 truncate max-w-[9rem]">{folder}</span>
                    <button
                      onClick={() => handleStageFolder(folder, filePaths)}
                      className="text-[9px] text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      <Plus size={10} />
                      stage ({filePaths.length})
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Git Stash controls */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-850">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider block">
              Git Stash
            </span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={stashMsg}
                onChange={(e) => setStashMsg(e.target.value)}
                placeholder="Stash message…"
                className="flex-grow bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10.5px] outline-none text-zinc-300 placeholder-zinc-650"
              />
              <button
                onClick={handleStashPushSubmit}
                className="bg-zinc-800 hover:bg-zinc-755 border border-zinc-800 hover:border-zinc-700 text-zinc-200 px-2 py-1 rounded text-[10.5px]"
              >
                Stash
              </button>
            </div>

            {/* List stashes */}
            {git.stashList.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto pt-1">
                {git.stashList.map((entry) => (
                  <div key={entry.index} className="flex items-center justify-between text-[9px] bg-zinc-950/40 p-1.5 rounded border border-zinc-850">
                    <span className="text-zinc-400 truncate max-w-[10rem] font-mono">
                      #{entry.index} {entry.message || "WIP"}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => git.stashApply(repoPath, entry.index)}
                        className="text-emerald-400 hover:underline"
                      >
                        apply
                      </button>
                      <button
                        onClick={() => git.stashDrop(repoPath, entry.index)}
                        className="text-rose-400 hover:underline"
                      >
                        drop
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Checkpoints management */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-850">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider block">
              Checkpoint (local snapshot)
            </span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={checkpointName}
                onChange={(e) => setCheckpointName(e.target.value)}
                placeholder="Save checkpoint name…"
                className="flex-grow bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10.5px] outline-none text-zinc-300 placeholder-zinc-650"
              />
              <button
                onClick={handleCheckpointSubmit}
                className="bg-zinc-800 hover:bg-zinc-755 border border-zinc-800 hover:border-zinc-700 text-zinc-200 px-2.5 py-1 rounded text-[10.5px]"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Commit message panel & actions */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/40 space-y-2 select-none">
          <form onSubmit={handleCommitSubmit} className="space-y-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit summary (required)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder-zinc-650 focus:border-indigo-500"
            />
            <textarea
              value={commitDesc}
              onChange={(e) => setCommitDesc(e.target.value)}
              placeholder="Commit description (optional)"
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder-zinc-650 focus:border-indigo-500 resize-none"
            />

            {/* Staged details alert */}
            {status && status.staged.length > 0 && (
              <button
                type="button"
                onClick={handleGenerateCommitMsg}
                className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors py-0.5"
              >
                <Sparkles size={11} />
                Generate AI Commit
              </button>
            )}

            {/* Amend option */}
            <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer py-0.5 select-none font-mono">
              <input
                type="checkbox"
                checked={amendMode}
                onChange={(e) => setAmendMode(e.target.checked)}
                className="rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-0"
              />
              Amend last commit
            </label>

            <button
              type="submit"
              disabled={!commitMsg.trim() || git.committing}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5 font-bold border border-zinc-750"
            >
              {git.committing && <Loader size={11} className="animate-spin text-zinc-500" />}
              {amendMode ? "Amend Commit" : "Commit Changes"}
            </button>
          </form>

          {git.error && (
            <div className="p-2 bg-rose-500/5 border border-rose-500/20 text-[10px] text-rose-400 rounded leading-normal max-h-24 overflow-y-auto">
              {git.error}
            </div>
          )}
        </div>
      </div>

      {/* 2. Middle Section: PR details / diff viewer */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {github.prDetail ? (
          <PrDetailView />
        ) : (
          <div className="flex-1 flex flex-col min-w-0 h-full bg-zinc-950/30">
            {git.selected ? (
              <div className="flex-1 flex flex-col min-h-0 w-full">
                {/* Diff Viewer Title Header */}
                <div className="h-9 border-b border-zinc-800/80 px-4 bg-zinc-900/40 flex items-center justify-between select-none">
                  <div className="flex items-center gap-2 truncate max-w-xl">
                    <FileText size={13} className="text-zinc-500" />
                    <span className="font-semibold text-zinc-200 truncate">{git.selected.file.path}</span>
                    <span className="text-[10px] text-zinc-650 bg-zinc-900 border border-zinc-800/40 px-1 rounded uppercase">
                      {git.selected.file.status === "U" ? "untracked" : git.selected.file.staged ? "staged" : "unstaged"}
                    </span>
                  </div>
                </div>

                {/* Diff content view */}
                <div className="flex-1 overflow-auto p-4 select-text">
                  {git.diffLoading ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Loader size={16} className="animate-spin text-zinc-500 mr-1.5" />
                      <span className="text-zinc-500">Retrieving diff…</span>
                    </div>
                  ) : git.diff ? (
                    <div className="space-y-0.5">
                      {git.diff.split("\n").map((line, idx) => renderDiffLine(line, idx))}
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-zinc-500 italic select-none">
                      No changes or binary diff output.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-grow flex items-center justify-center text-zinc-600 select-none">
                <div className="flex flex-col items-center gap-2 max-w-xs text-center">
                  <FileText size={28} className="text-zinc-700" />
                  <p className="text-[11px] leading-normal">
                    Select a modified file from the left sidebar to view its side-by-side git diff.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Right Section: Repository Pull Requests Section list */}
      {github.user && (
        <div className="w-80 bg-zinc-900/60 border-l border-zinc-800 flex flex-col p-3 h-full overflow-y-auto space-y-4">
          <PrSection />
        </div>
      )}

      {/* Dynamic S3 action logs modal popups */}
      <CiLogsModal />
    </div>
  );
};
