import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { safeInvoke, isTauriEnvironment } from "../utils/tauri";
import { useWorkspaceStore } from "../store";
import { useAutocompleteStore } from "../autocompleteStore";


export interface TerminalHandle {
  findNext: (q: string, incremental?: boolean) => void;
  findPrevious: (q: string) => void;
  clearSearch: () => void;
  focus: () => void;
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

    // Autocomplete States
    const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);
    const [ghostText, setGhostText] = useState<string>("");
    const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
    const [showAutocomplete, setShowAutocomplete] = useState(false);

    const showAutocompleteRef = useRef(showAutocomplete);
    const activeSuggestionRef = useRef(activeSuggestion);

    useEffect(() => { showAutocompleteRef.current = showAutocomplete; }, [showAutocomplete]);
    useEffect(() => { activeSuggestionRef.current = activeSuggestion; }, [activeSuggestion]);

    const getCursorCoords = () => {
      if (!terminalRef.current) return null;
      const cursorEl = terminalRef.current.querySelector(".xterm-cursor");
      if (!cursorEl) return null;
      const cursorRect = cursorEl.getBoundingClientRect();
      const containerRect = terminalRef.current.getBoundingClientRect();
      return {
        left: cursorRect.left - containerRect.left,
        top: cursorRect.top - containerRect.top, // Align vertically with cursor
      };
    };

    const applySuggestion = (suggestionValue: string) => {
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

      safeInvoke("write_terminal", {
        sessionId: ptySessionIdRef.current,
        data: backspaces + suggestionValue,
      }).catch(() => {});

      setActiveSuggestion(null);
      setGhostText("");
      setShowAutocomplete(false);
    };

    const generateSuggestions = async (inputCommand: string) => {
      if (!inputCommand || !inputCommand.trim()) {
        setActiveSuggestion(null);
        setGhostText("");
        setShowAutocomplete(false);
        return;
      }

      const words = inputCommand.split(/\s+/);
      const mainCommand = words[0] || "";
      const currentWord = words[words.length - 1] || "";
      const isTypingMainCommand = words.length === 1;

      let list: { value: string; type: "command" | "arg" | "file" | "folder" | "branch" | "history" }[] = [];

      // 1. History
      const history = useAutocompleteStore.getState().history;
      history.forEach((cmd) => {
        if (cmd.startsWith(inputCommand) && cmd !== inputCommand) {
          list.push({ value: cmd, type: "history" });
        }
      });

      // 2. Main command
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
                if (b.name.startsWith(currentWord) && b.name !== currentWord) {
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
        if (activeCwd) {
          try {
            const files = await safeInvoke<{ name: string; is_dir: boolean }[]>("list_dir_files", {
              path: activeCwd,
            });
            files.forEach((f) => {
              if (f.name.startsWith(currentWord) && f.name !== currentWord) {
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
      );

      const bestMatch = uniqueList[0];
      if (bestMatch && bestMatch.value.toLowerCase().startsWith(inputCommand.toLowerCase())) {
        const remaining = bestMatch.value.substring(inputCommand.length);
        setActiveSuggestion(bestMatch.value);
        setGhostText(remaining);
        setShowAutocomplete(true);
        setTimeout(() => {
          const coords = getCursorCoords();
          if (coords) setCoords(coords);
        }, 10);
      } else {
        setActiveSuggestion(null);
        setGhostText("");
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
        if (showAutocompleteRef.current && activeSuggestionRef.current) {
          if (event.key === "Tab" && event.type === "keydown") {
            applySuggestion(activeSuggestionRef.current);
            return false; // prevent default Tab action
          }
          if (event.key === "Escape" && event.type === "keydown") {
            setActiveSuggestion(null);
            setGhostText("");
            setShowAutocomplete(false);
            return false;
          }
        }

        if (event.key === "Enter" && event.type === "keydown") {
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

    return (
      <div
        onClick={handleClick}
        className="relative w-full h-full bg-[#09090b] overflow-hidden flex flex-col cursor-text"
      >
        <div ref={terminalRef} className="w-full flex-1" style={{ minHeight: 0 }} />

        {/* Ghost Text Autocomplete Inline Overlay */}
        {showAutocomplete && coords && ghostText && (
          <span
            style={{
              position: "absolute",
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              pointerEvents: "none",
              fontFamily:
                "'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', 'Hack Nerd Font', " +
                "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "13px",
              lineHeight: "1.2",
            }}
            className="text-zinc-650 select-none opacity-80 whitespace-pre"
          >
            {ghostText}
          </span>
        )}
      </div>
    );
  }
);

TerminalView.displayName = "TerminalView";
