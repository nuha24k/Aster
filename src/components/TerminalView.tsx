import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { safeInvoke, isTauriEnvironment } from "../utils/tauri";
import { useWorkspaceStore } from "../store";
import { useAutocompleteStore } from "../autocompleteStore";
import { History, Command, Terminal as TermIcon, GitBranch, Folder, FileText, CornerDownLeft, X, Search } from "lucide-react";

export interface TerminalHandle {
  findNext: (q: string, incremental?: boolean) => void;
  findPrevious: (q: string) => void;
  clearSearch: () => void;
  focus: () => void;
}

export interface SuggestionItem {
  value: string;
  type: "history" | "command" | "arg" | "file" | "folder" | "branch";
}

const POPULAR_COMMANDS = [
  "git", "cd", "ls", "npm", "cargo", "docker", "node", "npx", "python",
  "pip", "grep", "cat", "mkdir", "rm", "cp", "mv", "ssh", "curl", "wget",
  "make", "yarn", "pnpm", "bun", "clear", "exit", "pwd", "nano", "vim"
];

const GIT_SUBCOMMANDS = [
  "status", "diff", "add", "commit", "push", "pull", "checkout", "branch",
  "merge", "rebase", "stash", "log", "clone", "init", "reset", "cherry-pick"
];

const NPM_SUBCOMMANDS = ["run", "install", "test", "build", "start", "init", "publish", "ci"];
const CARGO_SUBCOMMANDS = ["check", "build", "run", "test", "clippy", "fmt", "init", "new", "doc", "bench"];

function fuzzyMatch(input: string, candidate: string): boolean {
  if (!input) return true;
  const q = input.toLowerCase();
  const c = candidate.toLowerCase();
  if (c.includes(q)) return true;
  let qIdx = 0;
  for (let i = 0; i < c.length && qIdx < q.length; i++) {
    if (c[i] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}

interface TerminalViewProps {
  id: string;
  cwd?: string;
}

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  ({ id, cwd }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const ptySessionIdRef = useRef<string>(id);

    const { updateActiveTerminalCwd, activeTerminalId, setActiveTerminal } = useWorkspaceStore();
    const isActiveRef = useRef(false);

    // Interactive Autocomplete States
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
    const [showAutocomplete, setShowAutocomplete] = useState(false);

    // Dedicated Ctrl+R History Search Modal
    const [historySearchOpen, setHistorySearchOpen] = useState(false);
    const [historySearchQuery, setHistorySearchQuery] = useState("");
    const [historySearchIndex, setHistorySearchIndex] = useState(0);
    const historySearchInputRef = useRef<HTMLInputElement>(null);

    const showAutocompleteRef = useRef(showAutocomplete);
    const suggestionsRef = useRef(suggestions);
    const selectedIndexRef = useRef(selectedIndex);
    const historySearchOpenRef = useRef(historySearchOpen);

    useEffect(() => { showAutocompleteRef.current = showAutocomplete; }, [showAutocomplete]);
    useEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);
    useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
    useEffect(() => { historySearchOpenRef.current = historySearchOpen; }, [historySearchOpen]);

    const getCursorCoords = () => {
      if (!terminalRef.current) return null;
      const cursorEl = terminalRef.current.querySelector(".xterm-cursor");
      if (!cursorEl) return null;
      const cursorRect = cursorEl.getBoundingClientRect();
      const containerRect = terminalRef.current.getBoundingClientRect();
      return {
        left: Math.min(cursorRect.left - containerRect.left, Math.max(10, containerRect.width - 340)),
        top: Math.min(cursorRect.top - containerRect.top + 18, Math.max(10, containerRect.height - 220)),
      };
    };

    const applySuggestion = (suggestionValue: string, execute: boolean = false) => {
      if (!xtermRef.current) return;
      const term = xtermRef.current;
      const cursorY = term.buffer.active.cursorY;
      const line = term.buffer.active.getLine(term.buffer.active.baseY + cursorY);
      const lineText = line ? line.translateToString(true) : "";
      const cursorX = term.buffer.active.cursorX;
      const textBeforeCursor = lineText.substring(0, cursorX);

      const promptMarkers = [" ❯ ", " % ", " $ ", " > ", " # ", "] "];
      let inputCommand = textBeforeCursor;
      for (const marker of promptMarkers) {
        const idx = textBeforeCursor.lastIndexOf(marker);
        if (idx !== -1) {
          inputCommand = textBeforeCursor.substring(idx + marker.length);
          break;
        }
      }

      const leadingSpaces = inputCommand.match(/^\s*/)?.[0] || "";
      const actualInput = inputCommand.substring(leadingSpaces.length);
      const backspaces = "\x7f".repeat(actualInput.length);
      const payload = backspaces + suggestionValue + (execute ? "\r" : "");

      safeInvoke("write_terminal", {
        sessionId: ptySessionIdRef.current,
        data: payload,
      }).catch(() => {});

      setShowAutocomplete(false);
      setSuggestions([]);
      setSelectedIndex(0);
    };

    const generateSuggestions = async (inputCommand: string) => {
      if (!inputCommand || !inputCommand.trim()) {
        setSuggestions([]);
        setShowAutocomplete(false);
        return;
      }

      const words = inputCommand.split(/\s+/);
      const mainCommand = words[0] || "";
      const currentWord = words[words.length - 1] || "";
      const isTypingMainCommand = words.length === 1;

      let list: SuggestionItem[] = [];

      // 1. Command History Matches (Highest Priority)
      const history = useAutocompleteStore.getState().history;
      history.forEach((cmd) => {
        if (fuzzyMatch(inputCommand, cmd) && cmd !== inputCommand) {
          list.push({ value: cmd, type: "history" });
        }
      });

      // 2. Main Shell Command Matches
      if (isTypingMainCommand) {
        POPULAR_COMMANDS.forEach((cmd) => {
          if (cmd.startsWith(currentWord) && cmd !== currentWord) {
            list.push({ value: cmd, type: "command" });
          }
        });
      } else {
        // 3. Sub-commands
        if (mainCommand === "git") {
          const gitWord = words[1] || "";
          const isTypingGitSub = words.length === 2;

          if (isTypingGitSub) {
            GIT_SUBCOMMANDS.forEach((sub) => {
              if (sub.startsWith(gitWord) && sub !== gitWord) {
                list.push({ value: `git ${sub}`, type: "arg" });
              }
            });
          } else if (words[1] === "checkout" || words[1] === "merge") {
            const activeCwd = useWorkspaceStore.getState().activeTerminalCwd || cwd || "";
            try {
              const branches = await safeInvoke<{ name: string }[]>("git_branches", { repo: activeCwd });
              branches.forEach((b) => {
                if (fuzzyMatch(currentWord, b.name) && b.name !== currentWord) {
                  const prefix = words.slice(0, -1).join(" ");
                  list.push({ value: `${prefix} ${b.name}`, type: "branch" });
                }
              });
            } catch (_) {}
          }
        } else if (mainCommand === "npm") {
          const npmWord = words[1] || "";
          const isTypingNpmSub = words.length === 2;
          if (isTypingNpmSub) {
            NPM_SUBCOMMANDS.forEach((sub) => {
              if (sub.startsWith(npmWord) && sub !== npmWord) {
                list.push({ value: `npm ${sub}`, type: "arg" });
              }
            });
          }
        } else if (mainCommand === "cargo") {
          const cargoWord = words[1] || "";
          const isTypingCargoSub = words.length === 2;
          if (isTypingCargoSub) {
            CARGO_SUBCOMMANDS.forEach((sub) => {
              if (sub.startsWith(cargoWord) && sub !== cargoWord) {
                list.push({ value: `cargo ${sub}`, type: "arg" });
              }
            });
          }
        }

        // 4. Filesystem path completion
        const activeCwd = useWorkspaceStore.getState().activeTerminalCwd || cwd || "";
        if (activeCwd && currentWord) {
          try {
            const files = await safeInvoke<{ name: string; is_dir: boolean }[]>("list_dir_files", {
              path: activeCwd,
            });
            files.forEach((f) => {
              if (fuzzyMatch(currentWord, f.name) && f.name !== currentWord) {
                const prefix = words.slice(0, -1).join(" ");
                list.push({
                  value: `${prefix} ${f.name}`,
                  type: f.is_dir ? "folder" : "file",
                });
              }
            });
          } catch (_) {}
        }
      }

      const uniqueList = list.filter(
        (item, index, self) => self.findIndex((t) => t.value === item.value) === index
      ).slice(0, 8);

      if (uniqueList.length > 0) {
        setSuggestions(uniqueList);
        setSelectedIndex(0);
        setShowAutocomplete(true);
        setTimeout(() => {
          const c = getCursorCoords();
          if (c) setCoords(c);
        }, 10);
      } else {
        setSuggestions([]);
        setShowAutocomplete(false);
      }
    };

    // Expose search/focus API to parent (LayoutNodeRenderer)
    useImperativeHandle(ref, () => ({
      findNext: (q, incremental) => {
        searchAddonRef.current?.findNext(q, { incremental: incremental ?? false, regex: false });
      },
      findPrevious: (q) => {
        searchAddonRef.current?.findPrevious(q, { regex: false });
      },
      clearSearch: () => {
        searchAddonRef.current?.clearDecorations();
      },
      focus: () => {
        try { xtermRef.current?.focus(); } catch (_) {}
      },
    }));

    useEffect(() => {
      const isFocused = activeTerminalId === id;
      isActiveRef.current = isFocused;
      if (isFocused && xtermRef.current) {
        try { xtermRef.current.focus(); } catch (_) {}
      }
    }, [activeTerminalId, id]);

    useEffect(() => {
      if (!terminalRef.current) return;

      let term = xtermRef.current;
      let fitAddon = fitAddonRef.current;
      let searchAddon = searchAddonRef.current;

      if (!term) {
        term = new Terminal({
          theme: {
            background: "#09090b",
            foreground: "#f4f4f5",
            cursor: "#a1a1aa",
            selectionBackground: "#3f3f46",
            black: "#18181b", brightBlack: "#27272a",
            red: "#f43f5e", brightRed: "#fb7185",
            green: "#10b981", brightGreen: "#34d399",
            yellow: "#f59e0b", brightYellow: "#fbbf24",
            blue: "#3b82f6", brightBlue: "#60a5fa",
            magenta: "#ec4899", brightMagenta: "#f472b6",
            cyan: "#06b6d4", brightCyan: "#22d3ee",
            white: "#f4f4f5", brightWhite: "#ffffff",
          },
          fontFamily:
            "'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', 'Hack Nerd Font', " +
            "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.2,
          cursorBlink: true,
          cursorStyle: "block",
          allowProposedApi: true,
          scrollback: 10000,
        });

        fitAddon = new FitAddon();
        searchAddon = new SearchAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.open(terminalRef.current);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;
      } else {
        try { term.open(terminalRef.current); } catch (_) {}
      }

      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        const isCmdOrCtrl = event.metaKey || event.ctrlKey;

        // Trigger Ctrl+R History Search
        if (isCmdOrCtrl && event.key.toLowerCase() === "r" && event.type === "keydown") {
          setHistorySearchOpen((v) => !v);
          setHistorySearchQuery("");
          setHistorySearchIndex(0);
          return false;
        }

        // Navigation inside interactive Autocomplete Overlay
        if (showAutocompleteRef.current && suggestionsRef.current.length > 0) {
          if (event.key === "ArrowDown" && event.type === "keydown") {
            setSelectedIndex((prev) => (prev + 1) % suggestionsRef.current.length);
            return false;
          }
          if (event.key === "ArrowUp" && event.type === "keydown") {
            setSelectedIndex((prev) => (prev - 1 + suggestionsRef.current.length) % suggestionsRef.current.length);
            return false;
          }
          if ((event.key === "Tab" || event.key === "ArrowRight") && event.type === "keydown") {
            const currentItem = suggestionsRef.current[selectedIndexRef.current];
            if (currentItem) applySuggestion(currentItem.value, false);
            return false;
          }
          if (event.key === "Enter" && event.type === "keydown") {
            const currentItem = suggestionsRef.current[selectedIndexRef.current];
            if (currentItem) applySuggestion(currentItem.value, true);
            setShowAutocomplete(false);
            setSuggestions([]);
            setSelectedIndex(0);
            return false;
          }
          if (event.key === "Escape" && event.type === "keydown") {
            setShowAutocomplete(false);
            setSuggestions([]);
            setSelectedIndex(0);
            return false;
          }
        }

        if (event.key === "Enter" && event.type === "keydown") {
          setShowAutocomplete(false);
          setSuggestions([]);
          setSelectedIndex(0);
          requestAnimationFrame(() => {
            if (!term) return;
            const cursorY = term.buffer.active.cursorY;
            const line = term.buffer.active.getLine(term.buffer.active.baseY + cursorY - 1);
            const lineText = line ? line.translateToString(true) : "";

            const promptMarkers = [" ❯ ", " % ", " $ ", " > ", " # ", "] "];
            let inputCommand = lineText;
            for (const marker of promptMarkers) {
              const idx = lineText.lastIndexOf(marker);
              if (idx !== -1) {
                inputCommand = lineText.substring(idx + marker.length);
                break;
              }
            }
            inputCommand = inputCommand.trim();
            if (inputCommand && !inputCommand.includes("  ")) {
              useAutocompleteStore.getState().addHistory(inputCommand);
            }
          });
        }

        return true;
      });

      requestAnimationFrame(() => {
        try { fitAddon?.fit(); } catch (_) {}
      });

      let isDisposed = false;
      let pollerId: number | null = null;

      const initTerminal = async () => {
        if (!isTauriEnvironment()) {
          term?.writeln("\x1b[33mRunning in browser — PTY unavailable.\x1b[0m");
          return;
        }
        try {
          const spawnedId = await safeInvoke<string>("spawn_terminal", {
            sessionId: id,
            cwd: cwd || null,
          });
          if (isDisposed) return;
          ptySessionIdRef.current = spawnedId;
          if (term?.cols && term?.rows) {
            safeInvoke("resize_terminal", {
              sessionId: ptySessionIdRef.current,
              cols: term.cols,
              rows: term.rows,
            }).catch(() => {});
          }
        } catch (err: any) {
          term?.writeln(`\x1b[31m${err?.message || err}\x1b[0m`);
          return;
        }

        const pollOutput = async () => {
          if (isDisposed) return;
          try {
            const output = await safeInvoke<string>("read_terminal_output", {
              sessionId: ptySessionIdRef.current,
            });
            if (output && output.length > 0 && !isDisposed && term) {
              term.write(output);
            }
            if (isActiveRef.current) {
              const newCwd = await safeInvoke<string>("get_terminal_cwd", {
                sessionId: ptySessionIdRef.current,
              });
              if (newCwd && !isDisposed) updateActiveTerminalCwd(newCwd);
            }
          } catch (_) {}
          if (!isDisposed) pollerId = window.setTimeout(pollOutput, 100);
        };

        pollOutput();
      };

      initTerminal();

      const dataDisposable = term.onData((data: string) => {
        safeInvoke("write_terminal", {
          sessionId: ptySessionIdRef.current,
          data,
        }).catch(() => {});

        if (data.includes("\r") || data.includes("\n") || data.includes("\x03") || data.includes("\x1b")) {
          setShowAutocomplete(false);
          setSuggestions([]);
          setSelectedIndex(0);
          return;
        }

        requestAnimationFrame(() => {
          if (!term) return;
          const cursorY = term.buffer.active.cursorY;
          const line = term.buffer.active.getLine(term.buffer.active.baseY + cursorY);
          const lineText = line ? line.translateToString(true) : "";
          const cursorX = term.buffer.active.cursorX;
          const textBeforeCursor = lineText.substring(0, cursorX);

          const promptMarkers = [" ❯ ", " % ", " $ ", " > ", " # ", "] "];
          let inputCommand = textBeforeCursor;
          for (const marker of promptMarkers) {
            const idx = textBeforeCursor.lastIndexOf(marker);
            if (idx !== -1) {
              inputCommand = textBeforeCursor.substring(idx + marker.length);
              break;
            }
          }

          inputCommand = inputCommand.replace(/^\s+/, "");
          generateSuggestions(inputCommand);
        });
      });

      const handleResize = () => {
        if (!fitAddonRef.current || !xtermRef.current) return;
        try { fitAddonRef.current.fit(); } catch (_) {}
        safeInvoke("resize_terminal", {
          sessionId: ptySessionIdRef.current,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        }).catch(() => {});
      };

      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }

      window.addEventListener("resize", handleResize);

      return () => {
        isDisposed = true;
        if (pollerId !== null) clearTimeout(pollerId);
        dataDisposable.dispose();
        resizeObserver.disconnect();
        window.removeEventListener("resize", handleResize);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, cwd, updateActiveTerminalCwd]);

    const handleClick = () => {
      setActiveTerminal(id);
      try { xtermRef.current?.focus(); } catch (_) {}
    };

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

    const historyStore = useAutocompleteStore((s) => s.history);
    const filteredHistory = historyStore.filter((h) => fuzzyMatch(historySearchQuery, h));

    return (
      <div
        onClick={handleClick}
        className="relative w-full h-full bg-[#09090b] overflow-hidden flex flex-col cursor-text select-none"
      >
        <div ref={terminalRef} className="w-full flex-1" style={{ minHeight: 0 }} />

        {/* Interactive Floating Autocomplete Suggestions Overlay Menu */}
        {showAutocomplete && coords && suggestions.length > 0 && (
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
                      applySuggestion(item.value, false);
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
        )}

        {/* Dedicated Ctrl+R History Fuzzy Search Modal Popover */}
        {historySearchOpen && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-96 bg-zinc-900 border border-zinc-700/90 rounded-lg shadow-2xl overflow-hidden font-mono text-xs flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
              <Search size={13} className="text-indigo-400 shrink-0" />
              <input
                ref={historySearchInputRef}
                type="text"
                value={historySearchQuery}
                onChange={(e) => {
                  setHistorySearchQuery(e.target.value);
                  setHistorySearchIndex(0);
                }}
                placeholder="Fuzzy search command history (Ctrl+R)..."
                className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") setHistorySearchOpen(false);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHistorySearchIndex((prev) => Math.min(prev + 1, filteredHistory.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHistorySearchIndex((prev) => Math.max(prev - 1, 0));
                  }
                  if (e.key === "Enter" && filteredHistory[historySearchIndex]) {
                    e.preventDefault();
                    applySuggestion(filteredHistory[historySearchIndex], false);
                    setHistorySearchOpen(false);
                  }
                }}
              />
              <button
                onClick={() => setHistorySearchOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
              >
                <X size={13} />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto py-1">
              {filteredHistory.length === 0 ? (
                <div className="p-3 text-center text-zinc-500 text-[11px]">No history matches found</div>
              ) : (
                filteredHistory.map((cmd, idx) => {
                  const isSelected = idx === historySearchIndex;
                  return (
                    <div
                      key={cmd + idx}
                      onClick={() => {
                        applySuggestion(cmd, false);
                        setHistorySearchOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? "bg-indigo-600/30 text-indigo-100 border-l-2 border-indigo-500 font-medium"
                          : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <History size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{cmd}</span>
                      </div>
                      {isSelected && <CornerDownLeft size={11} className="text-indigo-400 shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-3 py-1 border-t border-zinc-800 bg-zinc-950 text-[10px] text-zinc-500 flex justify-between">
              <span>↑↓ navigate</span>
              <span>Enter to insert command</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

TerminalView.displayName = "TerminalView";
