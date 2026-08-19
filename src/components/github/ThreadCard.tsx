import React, { useState } from "react";
import { useGithubStore, ReviewThread } from "../../githubStore";
import { MarkdownRenderer, getRelativeDate } from "./CommentCard";
import { ChevronDown, ChevronRight, User, CornerDownRight, Check } from "lucide-react";

interface ThreadCardProps {
  thread: ReviewThread;
  prAuthor: string;
}

export const ThreadCard: React.FC<ThreadCardProps> = ({ thread, prAuthor }) => {
  const github = useGithubStore();
  const [expanded, setExpanded] = useState(!thread.resolved);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const rootHunk = thread.comments[0]?.diff_hunk ?? null;

  // Last few lines of the diff hunk for context (GitHub-style)
  const getHunkLines = () => {
    if (!rootHunk) return [];
    return rootHunk
      .split("\n")
      .filter((line) => !line.startsWith("@@"))
      .slice(-4)
      .map((line) => {
        let cls = "text-zinc-500";
        if (line.startsWith("+")) {
          cls = "text-emerald-400 bg-emerald-950/20";
        } else if (line.startsWith("-")) {
          cls = "text-rose-400 bg-rose-950/20";
        }
        return { text: line, cls };
      });
  };

  const getChips = (association: string | null, author: string) => {
    const out: string[] = [];
    if (association === "OWNER") out.push("Owner");
    else if (association === "MEMBER") out.push("Member");
    if (author === prAuthor) out.push("Author");
    return out;
  };

  const handleSubmitReply = async () => {
    const text = reply.trim();
    const rootId = thread.comments[0]?.id;
    if (!text || !rootId || replying) return;
    setReplying(true);
    const success = await github.replyToThread(rootId, text);
    if (success) {
      setReply("");
    }
    setReplying(false);
  };

  const handleToggleResolved = async () => {
    setResolving(true);
    await github.resolveThread(thread.id, !thread.resolved);
    setResolving(false);
  };

  const hunkLines = getHunkLines();

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/20 overflow-hidden text-xs">
      {/* File Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 bg-zinc-900 border-b border-zinc-850 text-left"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-zinc-500 shrink-0" />
        )}
        <span className="font-mono text-[10px] text-zinc-300 truncate">
          {thread.path}
          {thread.line && `:${thread.line}`}
        </span>
        {thread.outdated && (
          <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-medium font-mono scale-90">
            Outdated
          </span>
        )}
        <span className="flex-grow" />
        {thread.resolved && (
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[9px] font-medium font-mono flex items-center gap-1 scale-90">
            <Check size={8} />
            Resolved
          </span>
        )}
      </button>

      {expanded && (
        <>
          {/* Diff Context */}
          {hunkLines.length > 0 && (
            <pre className="text-[10px] font-mono leading-snug overflow-x-auto bg-zinc-950/80 border-b border-zinc-850 py-1">
              {hunkLines.map((line, i) => (
                <div key={i} className={`px-3 py-0.5 whitespace-pre truncate ${line.cls}`}>
                  {line.text}
                </div>
              ))}
            </pre>
          )}

          {/* Thread Comments */}
          <div className="divide-y divide-zinc-900/60 bg-zinc-950/10">
            {thread.comments.map((comment) => (
              <div key={comment.id} className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-mono pb-1 text-zinc-450">
                  {comment.avatar_url ? (
                    <img src={comment.avatar_url} alt={comment.author} className="w-4 h-4 rounded-full" />
                  ) : (
                    <User size={10} className="text-zinc-500" />
                  )}
                  <span className="font-semibold text-zinc-300">{comment.author}</span>
                  <span className="text-zinc-500">{getRelativeDate(comment.created_at)}</span>
                  <span className="flex-grow" />
                  <div className="flex gap-1">
                    {getChips(comment.association, comment.author).map((c) => (
                      <span
                        key={c}
                        className="px-1 rounded border border-zinc-800 text-zinc-500 text-[8px] font-medium scale-90"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="pl-5 pt-0.5">
                  <MarkdownRenderer content={comment.body} />
                </div>
              </div>
            ))}
          </div>

          {/* Reply + Resolve Box */}
          <div className="px-3 py-2.5 bg-zinc-900/20 border-t border-zinc-850 space-y-2">
            <div className="flex gap-2">
              <CornerDownRight size={13} className="text-zinc-600 mt-2 shrink-0" />
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply…"
                className="flex-grow bg-zinc-950 border border-zinc-850 text-xs rounded px-2 py-1.5 text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleSubmitReply()}
              />
            </div>
            <div className="flex items-center justify-between pl-5">
              <button
                onClick={handleToggleResolved}
                disabled={resolving}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 rounded px-2 py-1 disabled:opacity-50 transition-all"
              >
                {thread.resolved ? "Unresolve conversation" : "Resolve conversation"}
              </button>
              {reply.trim() && (
                <button
                  onClick={handleSubmitReply}
                  disabled={replying}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-mono font-medium rounded px-2.5 py-1 transition-colors"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
