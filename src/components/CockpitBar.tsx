import React, { useEffect, useState, useRef } from "react";
import { useWorkspaceStore } from "../store";
import { useGitStore, useGithubStore, Pr } from "../githubStore";
import { GithubMenu } from "./github/GithubMenu";
import { safeInvoke } from "../utils/tauri";
import {
  GitBranch,
  Terminal,
  FileCode,
  ScrollText,
  KanbanSquare,
  Play,
  AlertCircle,
  Sidebar as SidebarIcon,
  FolderOpen,
  RefreshCw,
  FileDiff,
  ArrowUpFromLine,
  ArrowDownToLine,
  GitPullRequest,
  Check,
  ChevronDown,
  Plus,
  Sparkles,
  Loader,
  X,
} from "lucide-react";

interface BranchInfo {
  name: string;
  current: boolean;
}

export const CockpitBar: React.FC = () => {
  const {
    workspaces,
    currentWorkspaceId,
    activeSurface,
    setActiveSurface,
    terminals,
    toggleSidebar,
    activeTerminalCwd,
  } = useWorkspaceStore();

  const gitStore = useGitStore();
  const githubStore = useGithubStore();

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const workingCount = terminals.filter((t) => t.status === "Working").length;
  const blockedCount = terminals.filter((t) => t.status === "Blocked").length;

  const effectiveRepoPath = activeTerminalCwd || currentWorkspace?.root_path || "";

  // Branch Switcher dropdown state
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [switching, setSwitching] = useState(false);
  const [generatingBranch, setGeneratingBranch] = useState(false);

  // PR status for active branch
  const [activePr, setActivePr] = useState<Pr | null>(null);
  const [prReviews, setPrReviews] = useState<{ approved: number; changes_requested: number; commented: number } | null>(null);
  const [ciChecks, setCiChecks] = useState<{ total: number; passed: number; failed: number; pending: number } | null>(null);

  const branchDropdownRef = useRef<HTMLDivElement>(null);

  // Shorten path to last 2 segments
  const cwdDisplay = effectiveRepoPath
    ? effectiveRepoPath.split(/[/\\]/).filter(Boolean).slice(-2).join("/")
    : "";

  const activeStatus = gitStore.statusByRepo[effectiveRepoPath] || null;

  // Poll PR status & refresh Git/GitHub data
  useEffect(() => {
    if (!effectiveRepoPath) return;

    gitStore.refresh(effectiveRepoPath);

    // Click outside handler for branch dropdown
    const clickOutside = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, [effectiveRepoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load PR details when branch changes
  useEffect(() => {
    if (!effectiveRepoPath || !activeStatus?.branch || !githubStore.user) {
      setActivePr(null);
      return;
    }

    githubStore.remoteInfo(effectiveRepoPath).then((remote) => {
      if (!remote) return;
      
      // Look up open PR matching current branch
      safeInvoke<Pr | null>("gh_pr_for_branch", {
        owner: remote.owner,
        name: remote.name,
        branch: activeStatus.branch,
      })
        .then((prData) => {
          setActivePr(prData);
          if (prData) {
            // Load reviews
            safeInvoke<any>("gh_pr_reviews", {
              owner: remote.owner,
              name: remote.name,
              number: prData.number,
            }).then(setPrReviews).catch(() => setPrReviews(null));

            // Load CI checks
            safeInvoke<any>("gh_pr_checks", {
              owner: remote.owner,
              name: remote.name,
              sha: prData.head_sha,
            }).then(setCiChecks).catch(() => setCiChecks(null));
          } else {
            setPrReviews(null);
            setCiChecks(null);
          }
        })
        .catch(() => setActivePr(null));
    });
  }, [effectiveRepoPath, activeStatus?.branch, githubStore.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBranchClick = async () => {
    if (!effectiveRepoPath) return;
    setBranchDropdownOpen(!branchDropdownOpen);
    try {
      const list = await safeInvoke<BranchInfo[]>("git_branches", { repo: effectiveRepoPath });
      setBranches(list);
    } catch (_) {
      setBranches([]);
    }
  };

  const handleCheckout = async (branchName: string, create = false) => {
    if (!effectiveRepoPath || switching) return;
    setSwitching(true);
    setBranchDropdownOpen(false);
    try {
      await safeInvoke("git_checkout", { repo: effectiveRepoPath, branch: branchName, create });
      setNewBranchOpen(false);
      setNewBranchName("");
      await gitStore.refresh(effectiveRepoPath);
    } catch (e) {
      alert(`Checkout failed: ${String(e)}`);
    } finally {
      setSwitching(false);
    }
  };

  const handleGenerateBranchName = async () => {
    if (!effectiveRepoPath || generatingBranch) return;
    setGeneratingBranch(true);
    try {
      const name = await safeInvoke<string>("ai_branch_name", {
        repo: effectiveRepoPath,
        task: newBranchName || "current changes",
        provider: null,
      });
      setNewBranchName(name);
    } catch (e) {
      alert(`AI branch name failed: ${String(e)}`);
    } finally {
      setGeneratingBranch(false);
    }
  };

  const handleRevealInFinder = async () => {
    if (!effectiveRepoPath) return;
    await safeInvoke("open_in_finder", { path: effectiveRepoPath }).catch(() => {});
  };

  const handleManualRefresh = async () => {
    if (!effectiveRepoPath) return;
    await gitStore.refresh(effectiveRepoPath);
    if (githubStore.user) {
      githubStore.listPrs(effectiveRepoPath);
    }
  };

  return (
    <header className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 text-xs shrink-0 select-none">
      {/* Left Area: Workspace + CWD + Git branch switcher + Chips */}
      <div className="flex items-center space-x-3 min-w-0">
        <button
          onClick={toggleSidebar}
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 p-1 rounded transition-colors shrink-0"
          title="Toggle Sidebar (Cmd/Ctrl+B)"
        >
          <SidebarIcon size={14} />
        </button>

        <div className="font-bold tracking-wider text-indigo-400 shrink-0 font-mono">ASTER</div>
        <div className="h-4 w-px bg-zinc-700 shrink-0" />

        {/* Workspace info */}
        <div className="flex items-center text-zinc-300 space-x-1.5 font-medium min-w-0 truncate">
          <span className="truncate">{currentWorkspace?.name || "No Workspace"}</span>
        </div>

        {/* Shortened CWD */}
        {cwdDisplay && (
          <>
            <div className="h-4 w-px bg-zinc-700/60 shrink-0" />
            <div
              className="flex items-center space-x-1 text-zinc-500 text-[10px] font-mono truncate min-w-0"
              title={effectiveRepoPath}
            >
              <FolderOpen size={11} className="text-zinc-650 shrink-0" />
              <span className="truncate">{cwdDisplay}</span>
            </div>
          </>
        )}

        {/* Git Branch Switcher Dropdown */}
        {activeStatus && (
          <>
            <div className="h-4 w-px bg-zinc-700/60 shrink-0" />
            <div className="relative shrink-0" ref={branchDropdownRef}>
              <button
                onClick={handleBranchClick}
                className="flex items-center gap-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded px-2.5 py-0.5 border border-zinc-800/80 font-mono text-[10.5px] transition-colors"
              >
                {switching ? (
                  <Loader size={11} className="animate-spin text-zinc-500" />
                ) : (
                  <GitBranch size={11} className="text-emerald-400" />
                )}
                <span>{activeStatus.branch || "detached"}</span>
                <ChevronDown size={9} className="text-zinc-500" />
              </button>

              {branchDropdownOpen && (
                <div className="absolute left-0 mt-1 w-52 bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 overflow-hidden font-mono text-[11px] max-h-60 overflow-y-auto">
                  <div className="py-1">
                    {branches.map((b) => (
                      <button
                        key={b.name}
                        onClick={() => !b.current && handleCheckout(b.name)}
                        className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center justify-between truncate ${
                          b.current ? "text-emerald-400 font-semibold" : "text-zinc-400"
                        }`}
                      >
                        <span className="truncate">{b.name}</span>
                        {b.current && <Check size={10} />}
                      </button>
                    ))}
                    <div className="border-t border-zinc-800 my-1" />
                    <button
                      onClick={() => {
                        setBranchDropdownOpen(false);
                        setNewBranchOpen(true);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5"
                    >
                      <Plus size={11} />
                      New branch…
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Changes chip */}
            <button
              onClick={() => setActiveSurface("Git")}
              className={`flex items-center gap-1 bg-zinc-850 hover:bg-zinc-800 rounded px-2.5 py-0.5 border border-zinc-800/80 font-mono text-[10.5px] transition-colors shrink-0 ${
                activeStatus.staged.length + activeStatus.unstaged.length > 0
                  ? "text-amber-400 border-amber-500/20"
                  : "text-zinc-500"
              }`}
            >
              <FileDiff size={11} />
              <span>
                {activeStatus.staged.length + activeStatus.unstaged.length > 0
                  ? `${activeStatus.staged.length + activeStatus.unstaged.length} changes`
                  : "clean"}
              </span>
            </button>

            {/* Sync Ahead / Behind status & push/pull triggers */}
            <span className="flex items-center gap-1.5 bg-zinc-850 rounded px-2.5 py-0.5 border border-zinc-800/80 font-mono text-[10.5px] text-zinc-500 shrink-0 select-text">
              {activeStatus.ahead > 0 && <span className="text-emerald-400 font-semibold">↑{activeStatus.ahead}</span>}
              {activeStatus.behind > 0 && <span className="text-amber-400 font-semibold">↓{activeStatus.behind}</span>}
              {activeStatus.ahead === 0 && activeStatus.behind === 0 && <span>synced</span>}

              {activeStatus.behind > 0 && (
                <button
                  onClick={() => githubStore.pull(effectiveRepoPath).then(handleManualRefresh)}
                  className="hover:text-zinc-200"
                  title="Pull changes"
                >
                  <ArrowDownToLine size={10} />
                </button>
              )}
              {activeStatus.ahead > 0 && (
                <button
                  onClick={() => githubStore.push(effectiveRepoPath).then(handleManualRefresh)}
                  className="hover:text-zinc-200"
                  title="Push changes"
                >
                  <ArrowUpFromLine size={10} />
                </button>
              )}
            </span>

            {/* Conflict display status */}
            {activeStatus.conflicts.length > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/5 text-rose-400 font-mono text-[10.5px] font-bold animate-pulse shrink-0">
                <AlertCircle size={11} />
                <span>{activeStatus.conflicts.length} conflicts</span>
              </span>
            )}

            {/* Active Pull Request indicator link */}
            {activePr && (
              <button
                onClick={() => githubStore.openPrDetail(effectiveRepoPath, activePr.number)}
                className="flex items-center gap-1 bg-zinc-850 hover:bg-zinc-800 hover:text-zinc-150 rounded px-2.5 py-0.5 border border-zinc-800/80 font-mono text-[10.5px] text-zinc-400 transition-colors truncate shrink-0 max-w-xs"
              >
                <GitPullRequest size={11} className={activePr.draft ? "text-zinc-500" : "text-emerald-400"} />
                <span>#{activePr.number}</span>
                <span className="truncate opacity-80">{activePr.title}</span>
                
                {/* PR reviews details */}
                {prReviews && prReviews.approved > 0 && (
                  <span className="text-emerald-400 text-[9px] font-semibold pl-1">✓{prReviews.approved}</span>
                )}

                {/* PR CI checks indicator */}
                {ciChecks && ciChecks.total > 0 && (
                  <span className={`w-1.5 h-1.5 rounded-full ml-1.5 ${
                    ciChecks.failed > 0
                      ? "bg-rose-500"
                      : ciChecks.pending > 0
                      ? "bg-amber-400"
                      : "bg-emerald-500"
                  }`} />
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Center Area: Surface tab selectors */}
      <nav className="flex items-center space-x-0.5 select-none">
        {(["Terminal", "Editor", "Git", "Kanban", "Logs"] as const).map((surface) => {
          const isActive = activeSurface === surface;
          const Icon =
            surface === "Terminal"
              ? Terminal
              : surface === "Editor"
              ? FileCode
              : surface === "Git"
              ? GitBranch
              : surface === "Kanban"
              ? KanbanSquare
              : ScrollText;

          return (
            <button
              key={surface}
              onClick={() => setActiveSurface(surface)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded transition-colors font-mono text-[10.5px] ${
                isActive
                  ? "bg-indigo-650/30 text-indigo-300 border border-indigo-500/30 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Icon size={12} />
              <span>{surface}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Area: Process statuses + Github Dropdown switcher */}
      <div className="flex items-center space-x-3 text-zinc-400 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded">
            <Play size={10} className="text-amber-400" />
            <span>{workingCount} working</span>
          </div>
          {blockedCount > 0 && (
            <div className="flex items-center space-x-1 text-[10px] font-mono bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-800/50">
              <AlertCircle size={10} className="text-rose-400" />
              <span>{blockedCount} blocked</span>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-zinc-700" />

        {/* reveal in Finder, refresh and user switch dropdown */}
        <div className="flex items-center space-x-1">
          {effectiveRepoPath && (
            <button
              onClick={handleRevealInFinder}
              className="p-1 rounded text-zinc-400 hover:text-zinc-150 hover:bg-zinc-800 transition-colors"
              title="Reveal in Finder"
            >
              <FolderOpen size={13} />
            </button>
          )}
          <button
            onClick={handleManualRefresh}
            className="p-1 rounded text-zinc-400 hover:text-zinc-150 hover:bg-zinc-800 transition-colors"
            title="Refresh Git status"
          >
            <RefreshCw size={13} />
          </button>
          
          <GithubMenu />
        </div>
      </div>

      {/* New Branch Modal Popup (Inline custom style) */}
      {newBranchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col font-mono text-xs">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
              <div className="flex items-center gap-2">
                <GitBranch size={15} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-zinc-100">New Branch</h3>
              </div>
              <button
                onClick={() => {
                  setNewBranchOpen(false);
                  setNewBranchName("");
                }}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <p className="text-[10px] text-zinc-400 leading-normal">
                Create from <strong className="text-zinc-200">{activeStatus?.branch}</strong> and switch to it.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/my-new-branch"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 placeholder-zinc-650 focus:border-indigo-500 outline-none"
                  onKeyDown={(e) => e.key === "Enter" && newBranchName.trim() && handleCheckout(newBranchName.trim(), true)}
                />
                <button
                  disabled={generatingBranch}
                  onClick={handleGenerateBranchName}
                  className="bg-zinc-850 hover:bg-zinc-800 border border-zinc-850 text-zinc-350 p-2 rounded transition-colors"
                  title="Generate branch name with AI"
                >
                  {generatingBranch ? (
                    <Loader size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                </button>
              </div>

              <button
                disabled={!newBranchName.trim() || switching}
                onClick={() => handleCheckout(newBranchName.trim(), true)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5"
              >
                {switching && <Loader size={12} className="animate-spin" />}
                Create & Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
