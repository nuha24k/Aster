import React, { useState, useEffect } from "react";
import { useGithubStore } from "../../githubStore";
import { useGitStore } from "../../githubStore";
import { safeInvoke } from "../../utils/tauri";
import {
  GitPullRequest,
  Plus,
  Loader,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Sparkles,
  GitBranch,
  AlertTriangle,
} from "lucide-react";

export const PrSection: React.FC = () => {
  const github = useGithubStore();
  const git = useGitStore();

  const [prsOpen, setPrsOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("main");
  const [creating, setCreating] = useState(false);

  const repo = git.selectedRepo;
  const prs = repo ? github.prsByRepo[repo] || [] : [];

  useEffect(() => {
    github.error = null;
    if (repo && github.user) {
      github.listPrs(repo);
    }
  }, [repo, github.user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill template when create modal opens
  useEffect(() => {
    if (createOpen && repo && !body.trim()) {
      git.loadPrTemplate(repo).then(() => {
        if (git.prTemplate) {
          setBody(git.prTemplate);
        }
      });
    }
  }, [createOpen, repo]); // eslint-disable-line react-hooks/exhaustive-deps

  const ciColor = (sha: string): string => {
    const c = github.checksBySha[sha];
    if (!c || !c.total) return "bg-zinc-600";
    if (c.failed) return "bg-rose-500";
    if (c.pending) return "bg-amber-400";
    return "bg-emerald-500";
  };

  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateWithAi = async () => {
    if (!repo || generating) return;
    setGenerating(true);
    setAiError(null);
    try {
      const suggestion = await safeInvoke<{ title: string; body: string }>("ai_pr_message", {
        repo,
        base: base.trim() || "main",
        provider: null, // default
      });
      setTitle(suggestion.title);
      setBody(suggestion.body);
    } catch (e) {
      setAiError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitPr = async () => {
    const branch = git.statusByRepo[repo || ""]?.branch;
    if (!repo || !title.trim() || !branch) return;
    setCreating(true);
    const newPr = await github.createPr(
      repo,
      branch,
      base.trim() || "main",
      title.trim(),
      body.trim()
    );
    setCreating(false);
    if (newPr) {
      setTitle("");
      setBody("");
      setCreateOpen(false);
      github.openPrDetail(repo, newPr.number);
    }
  };

  if (!github.user || !repo) return null;

  return (
    <div className="border border-zinc-800 bg-zinc-950/20 rounded overflow-hidden text-xs">
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/40 select-none">
        <button
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 font-mono font-bold"
          onClick={() => setPrsOpen(!prsOpen)}
        >
          {prsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Pull Requests</span>
          <span className="text-[10px] text-zinc-650 font-medium">({prs.length})</span>
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="ml-auto flex items-center gap-1 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 font-bold"
        >
          <Plus size={10} />
          New
        </button>
      </div>

      {prsOpen && (
        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
          {github.loadingPrs && (
            <div className="flex justify-center py-2">
              <Loader size={14} className="animate-spin text-zinc-500" />
            </div>
          )}

          {prs.map((pr) => (
            <button
              key={pr.number}
              onClick={() => github.openPrDetail(repo, pr.number)}
              className="flex w-full gap-2 text-left group items-start hover:bg-zinc-900/40 p-1.5 rounded transition-all font-mono"
            >
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${ciColor(pr.head_sha)}`} />
              <div className="min-w-0 flex-grow">
                <span className="block text-[11px] text-zinc-300 truncate leading-tight group-hover:text-zinc-100">
                  {pr.draft && <span className="text-zinc-500">[draft] </span>}
                  {pr.title}
                </span>
                <span className="block text-[9px] text-zinc-500 leading-tight pt-0.5 truncate">
                  #{pr.number} · {pr.head_ref} → {pr.base_ref} · {pr.author}
                </span>
              </div>
            </button>
          ))}

          {!github.loadingPrs && prs.length === 0 && (
            <p className="text-[10px] text-zinc-500 italic font-mono pl-3.5">
              No open pull requests.
            </p>
          )}

          {github.error && !github.error.includes("remote") && (
            <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-[10px] text-rose-400 font-mono rounded">
              {github.error}
            </div>
          )}
        </div>
      )}

      {/* Create PR Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col font-mono text-xs">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
              <div className="flex items-center gap-2">
                <GitPullRequest size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Create Pull Request</h3>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <XButton onClose={() => setCreateOpen(false)} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                <GitBranch size={13} />
                <code className="text-zinc-200 font-semibold bg-zinc-850 px-1 rounded">
                  {git.statusByRepo[repo || ""]?.branch || "?"}
                </code>
                <ArrowRight size={12} />
                <input
                  type="text"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  placeholder="base branch (e.g. main)"
                  className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200 focus:border-indigo-500 outline-none w-28 text-[11px]"
                />
              </div>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (required)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 placeholder-zinc-650 focus:border-indigo-500 outline-none"
              />

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Description (optional)"
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 placeholder-zinc-650 focus:border-indigo-500 outline-none resize-none"
              />

              <button
                disabled={generating}
                onClick={handleGenerateWithAi}
                className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Sparkles size={11} />
                {generating ? "Generating…" : "Generate with AI"}
              </button>

              {aiError && (
                <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-[10px] text-rose-400 rounded">
                  {aiError}
                </div>
              )}

              <button
                disabled={!title.trim() || creating}
                onClick={handleSubmitPr}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono font-medium py-2 rounded transition-colors flex items-center justify-center gap-2"
              >
                {creating && <Loader size={12} className="animate-spin" />}
                Create Pull Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const XButton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
    <AlertTriangle size={14} className="opacity-0 w-0 h-0" />
    <span>Close</span>
  </button>
);
