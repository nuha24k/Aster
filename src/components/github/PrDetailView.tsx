import React, { useState, useEffect } from "react";
import { useGithubStore } from "../../githubStore";
import { CommentCard, getRelativeDate } from "./CommentCard";
import { ThreadCard } from "./ThreadCard";
import { safeInvoke } from "../../utils/tauri";
import {
  RefreshCw,
  ExternalLink,
  X,
  FileCode,
  CheckCircle,
  AlertCircle,
  Loader,
  GitMerge,
  Eye,
  ChevronDown,
  MessageSquare,
  FileText,
} from "lucide-react";

export const PrDetailView: React.FC = () => {
  const github = useGithubStore();
  const pr = github.prDetail;
  const repo = github.prDetailRepo;

  const [tab, setTab] = useState<"conversation" | "files" | "checks">("conversation");
  const [newComment, setNewComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [merging, setMerging] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);

  useEffect(() => {
    if (tab === "files") {
      github.loadPrFiles();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (github.loadingDetail && !pr) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950/20 text-zinc-500">
        <Loader size={20} className="animate-spin text-indigo-500 mr-2" />
        <span className="font-mono text-xs">Loading Pull Request...</span>
      </div>
    );
  }

  if (!pr) return null;

  const getVerdictLabel = (state: string) => {
    switch (state) {
      case "merged":
        return { label: "Merged", className: "bg-purple-950/40 border border-purple-500/30 text-purple-400" };
      case "closed":
        return { label: "Closed", className: "bg-rose-950/40 border border-rose-500/30 text-rose-400" };
      default:
        return pr.draft
          ? { label: "Draft", className: "bg-zinc-800 border border-zinc-700 text-zinc-400" }
          : { label: "Open", className: "bg-emerald-950/40 border border-emerald-500/30 text-emerald-400" };
    }
  };

  const handleOpenInBrowser = async () => {
    await safeInvoke("open_in_finder", { path: pr.html_url }).catch(() => {
      window.open(pr.html_url, "_blank");
    });
  };

  const handleMarkPrReady = async () => {
    if (!repo) return;
    setMarkingReady(true);
    await github.markPrReady(repo, pr.number);
    setMarkingReady(false);
  };

  const handleCommentSubmit = async () => {
    const text = newComment.trim();
    if (!text || commenting) return;
    setCommenting(true);
    const success = await github.commentOnPr(text);
    if (success) {
      setNewComment("");
    }
    setCommenting(false);
  };

  const handleMergeSubmit = async () => {
    setMerging(true);
    await github.mergePr(mergeMethod);
    setMerging(false);
    setMergeOpen(false);
  };

  const checkDot = (check: any): string => {
    if (check.status !== "completed") return "bg-amber-400 animate-pulse";
    switch (check.conclusion) {
      case "success":
      case "neutral":
      case "skipped":
        return "bg-emerald-500";
      case "failure":
      case "timed_out":
      case "cancelled":
      case "action_required":
        return "bg-rose-500";
      default:
        return "bg-zinc-650";
    }
  };

  const fileBadge = (status: string) => {
    switch (status) {
      case "added":
        return { label: "A", class: "text-emerald-400 bg-emerald-950/30 border border-emerald-900/50" };
      case "removed":
        return { label: "D", class: "text-rose-400 bg-rose-950/30 border border-rose-900/50" };
      case "renamed":
        return { label: "R", class: "text-blue-400 bg-blue-950/30 border border-blue-900/50" };
      default:
        return { label: "M", class: "text-amber-400 bg-amber-950/30 border border-amber-900/50" };
    }
  };

  const renderDiffLine = (line: string, idx: number) => {
    const className =
      line.startsWith("+") && !line.startsWith("+++")
        ? "text-emerald-400 bg-emerald-950/10"
        : line.startsWith("-") && !line.startsWith("---")
        ? "text-rose-400 bg-rose-950/10"
        : line.startsWith("@@")
        ? "text-sky-400 bg-sky-950/5"
        : "text-zinc-400";

    return (
      <div key={idx} className={`${className} leading-relaxed px-3 font-mono text-[10.5px] truncate whitespace-pre`}>
        {line}
      </div>
    );
  };

  const badge = getVerdictLabel(pr.state);

  // Group reviews and CI checks summary
  const conversationCount = pr.timeline.filter(
    (e) => e.kind === "comment" || e.kind === "review"
  ).length + pr.threads.length;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-zinc-950/10 border border-zinc-800 rounded font-mono text-xs select-none">
      {/* Header bar */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3 space-y-2 bg-zinc-900/30">
        <div className="flex items-start gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
            {badge.label}
          </span>
          <h2 className="flex-grow min-w-0 text-[13px] font-semibold text-zinc-100 leading-snug">
            {pr.title} <span className="text-zinc-500">#{pr.number}</span>
          </h2>
          <button
            onClick={() => github.refreshPrDetail()}
            className={`p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all ${
              github.loadingDetail ? "animate-spin" : ""
            }`}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={handleOpenInBrowser}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            title="Open in Browser"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={() => github.closePrDetail()}
            className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800"
            title="Close panel"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-zinc-500 flex-wrap select-text">
          <span className="flex items-center gap-1 font-semibold text-zinc-450">
            {pr.author_avatar && (
              <img src={pr.author_avatar} alt={pr.author} className="w-3.5 h-3.5 rounded-full" />
            )}
            {pr.author}
          </span>
          <span className="text-zinc-600 bg-zinc-900 px-1 rounded">{pr.head_ref}</span>
          <span className="text-zinc-650">→</span>
          <span className="text-zinc-600 bg-zinc-900 px-1 rounded">{pr.base_ref}</span>
          <span className="text-emerald-400">+{pr.additions}</span>
          <span className="text-rose-400">-{pr.deletions}</span>
          <span>{pr.commits} commit{pr.commits === 1 ? "" : "s"}</span>

          <span className="flex-grow" />

          {/* Mark PR Ready for Review */}
          {pr.draft && pr.state === "open" && (
            <button
              onClick={handleMarkPrReady}
              disabled={markingReady}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-2 py-0.5 rounded border border-zinc-750 flex items-center gap-1 scale-95"
            >
              {markingReady ? <Loader size={10} className="animate-spin" /> : <Eye size={10} />}
              Mark Ready
            </button>
          )}

          {/* Confirm Merge Dropdown */}
          {!pr.merged && pr.state === "open" && !pr.draft && (
            <div className="relative">
              <button
                onClick={() => setMergeOpen(!mergeOpen)}
                disabled={pr.mergeable === false}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-2 py-0.5 rounded flex items-center gap-1 scale-95 font-bold transition-all"
                title={pr.mergeable === false ? "Has conflicts — resolve first" : "Merge PR"}
              >
                <GitMerge size={11} />
                Merge
                <ChevronDown size={10} />
              </button>

              {mergeOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 p-2.5 space-y-2">
                  <span className="text-[10px] text-zinc-400 block leading-tight">
                    Merge <strong className="text-zinc-200">#{pr.number}</strong> into {pr.base_ref}?
                  </span>
                  <select
                    value={mergeMethod}
                    onChange={(e) => setMergeMethod(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-1 text-[10px] outline-none text-zinc-300"
                  >
                    <option value="merge">Create a merge commit</option>
                    <option value="squash">Squash and merge</option>
                    <option value="rebase">Rebase and merge</option>
                  </select>
                  <button
                    onClick={handleMergeSubmit}
                    disabled={merging}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] py-1 rounded font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    {merging && <Loader size={9} className="animate-spin" />}
                    Confirm Merge
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex gap-1.5 pt-1.5">
          <button
            onClick={() => setTab("conversation")}
            className={`px-3 py-1 rounded-sm text-[10.5px] border ${
              tab === "conversation"
                ? "border-zinc-800 bg-zinc-900 text-zinc-150"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Conversation {conversationCount > 0 && `(${conversationCount})`}
          </button>
          <button
            onClick={() => setTab("files")}
            className={`px-3 py-1 rounded-sm text-[10.5px] border ${
              tab === "files"
                ? "border-zinc-800 bg-zinc-900 text-zinc-150"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Files Changed ({pr.changed_files})
          </button>
          <button
            onClick={() => setTab("checks")}
            className={`px-3 py-1 rounded-sm text-[10.5px] border ${
              tab === "checks"
                ? "border-zinc-800 bg-zinc-900 text-zinc-150"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Checks ({pr.checks.length})
          </button>
        </div>
      </div>

      {/* Tabs Contents */}
      <div className="flex-1 overflow-y-auto p-4 select-text">
        {/* CONVERSATION TAB */}
        {tab === "conversation" && (
          <div className="max-w-3xl space-y-4">
            {/* PR Main Description */}
            <CommentCard
              author={pr.author}
              avatarUrl={pr.author_avatar}
              createdAt={""}
              body={pr.body || "*No description provided.*"}
              prAuthor={pr.author}
            />

            {/* Interleaved Conversation History */}
            {pr.timeline.map((item, idx) => {
              if (item.kind === "comment" || item.kind === "review") {
                return (
                  <CommentCard
                    key={idx}
                    author={item.author}
                    avatarUrl={item.avatar_url}
                    association={item.association}
                    createdAt={item.created_at}
                    body={item.body}
                    verdict={item.review_state}
                    prAuthor={pr.author}
                  />
                );
              }

              if (item.kind === "commit") {
                return (
                  <div key={idx} className="flex items-center gap-2 pl-8 text-[10px] text-zinc-500">
                    <FileCode size={12} className="text-zinc-650 shrink-0" />
                    <span className="truncate text-zinc-300 font-semibold">{item.body}</span>
                    <span className="flex-grow" />
                    <span className="text-[9px] font-mono text-zinc-600">{item.sha}</span>
                  </div>
                );
              }

              if (item.kind === "event") {
                const getEventStyle = () => {
                  switch (item.event) {
                    case "merged":
                      return { icon: <GitMerge size={12} />, className: "text-purple-400" };
                    case "closed":
                      return { icon: <AlertCircle size={12} />, className: "text-rose-400" };
                    case "reopened":
                      return { icon: <CheckCircle size={12} />, className: "text-emerald-400" };
                    default:
                      return { icon: <MessageSquare size={12} />, className: "text-zinc-600" };
                  }
                };

                const style = getEventStyle();
                return (
                  <div key={idx} className="flex items-center gap-2 pl-8 text-[10px] text-zinc-500 select-none">
                    <span className={style.className}>{style.icon}</span>
                    <span>
                      <strong className="text-zinc-400 font-medium">{item.author}</strong>{" "}
                      {item.event === "merged"
                        ? "merged this pull request"
                        : item.event === "closed"
                        ? "closed this"
                        : item.event === "reopened"
                        ? "reopened this"
                        : item.event || ""}
                    </span>
                    <span className="text-zinc-600">{getRelativeDate(item.created_at)}</span>
                  </div>
                );
              }

              return null;
            })}

            {/* Inline review discussion threads */}
            {pr.threads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} prAuthor={pr.author} />
            ))}

            {/* Comment Composer */}
            {pr.state === "open" && (
              <div className="shrink-0 border-t border-zinc-800/40 pt-4 space-y-2 select-none">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment… (Press Reply or use Cmd/Ctrl+Enter to send)"
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded px-2.5 py-1.5 text-zinc-200 placeholder-zinc-650 focus:border-indigo-500 outline-none resize-none font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleCommentSubmit();
                    }
                  }}
                />
                <div className="flex justify-end">
                  <button
                    disabled={!newComment.trim() || commenting}
                    onClick={handleCommentSubmit}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono font-medium rounded px-3 py-1.5 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {commenting && <Loader size={10} className="animate-spin" />}
                    Comment
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FILES CHANGED TAB */}
        {tab === "files" && (
          <div className="space-y-4 max-w-4xl">
            {github.loadingFiles && (
              <div className="flex justify-center py-8">
                <Loader size={20} className="animate-spin text-zinc-500" />
              </div>
            )}

            {github.prFiles?.map((file) => {
              const badgeStyle = fileBadge(file.status);
              return (
                <div key={file.filename} className="rounded border border-zinc-800 bg-zinc-950/20 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-850 select-none">
                    <span className={`w-3.5 h-3.5 flex items-center justify-center rounded-sm font-semibold font-mono text-[9px] ${badgeStyle.class}`}>
                      {badgeStyle.label}
                    </span>
                    <span className="font-mono text-[10.5px] text-zinc-300 truncate">{file.filename}</span>
                    <span className="flex-grow" />
                    <span className="text-[10px] font-mono text-emerald-400">+{file.additions}</span>
                    <span className="text-[10px] font-mono text-rose-400">-{file.deletions}</span>
                  </div>

                  {file.patch ? (
                    <div className="py-1 bg-zinc-950/60 overflow-x-auto">
                      {file.patch.split("\n").map((line, idx) => renderDiffLine(line, idx))}
                    </div>
                  ) : (
                    <p className="px-3 py-3 text-[10px] text-zinc-500 italic select-none">
                      No textual diff available (binary or too large).
                    </p>
                  )}
                </div>
              );
            })}

            {!github.loadingFiles && github.prFiles?.length === 0 && (
              <p className="text-[10.5px] text-zinc-500 italic select-none">
                No files changed.
              </p>
            )}
          </div>
        )}

        {/* CI CHECKS TAB */}
        {tab === "checks" && (
          <div className="space-y-1 max-w-2xl select-none">
            {pr.checks.map((check) => (
              <button
                key={check.name}
                onClick={() => {
                  if (repo) {
                    // Open S3 log in modal (loads workflow job log dynamically)
                    github.openJobLog(repo, 0, 0, check.name); // runId/jobId dummy, backend resolves it from name
                  }
                }}
                className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded hover:bg-zinc-900/40 text-left text-[11px] text-zinc-300 transition-colors"
              >
                <span className={`size-1.5 shrink-0 rounded-full ${checkDot(check)}`} />
                <span className="flex-grow truncate font-medium">{check.name}</span>
                <span className="text-[9px] text-zinc-500 font-mono font-medium lowercase px-1 bg-zinc-900 border border-zinc-800 rounded">
                  {check.conclusion || check.status}
                </span>
                <FileText size={12} className="text-zinc-500" />
              </button>
            ))}

            {pr.checks.length === 0 && (
              <p className="text-[10.5px] text-zinc-500 italic">
                No CI checks registered on this commit.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
