import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../store";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { FileItem, EditorTabItem } from "../types";
import { isTauriEnvironment } from "../utils/tauri";
import { computeLineDiff } from "../utils/gitDiff";
import { QuickOpenModal } from "./editor/QuickOpenModal";
import { CommandPaletteModal, CommandItem } from "./editor/CommandPaletteModal";
import { GoToLineModal } from "./editor/GoToLineModal";
import { GoToSymbolModal } from "./editor/GoToSymbolModal";
import { WorkspaceSearchModal } from "./editor/WorkspaceSearchModal";
import {
  Folder,
  FolderOpen,
  FolderInput,
  ExternalLink,
  FileText,
  FilePlus,
  FileCode,
  FileJson,
  Save,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  File,
  Code2,
  WrapText,
  Hash,
  Layers,
} from "lucide-react";

interface EditorViewProps {
  rootPath: string;
}

interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

export const EditorView: React.FC<EditorViewProps> = ({ rootPath }) => {
  const [currentRoot, setCurrentRoot] = useState<string>(rootPath);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<EditorTabItem[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [closedTabsHistory, setClosedTabsHistory] = useState<EditorTabItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
  const [wordWrap, setWordWrap] = useState<"on" | "off">("off");
  const [autoSave, setAutoSave] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const setActiveSurface = useWorkspaceStore((s) => s.setActiveSurface);
  const activeSurface = useWorkspaceStore((s) => s.activeSurface);

  // Modals state
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isGoToLineOpen, setIsGoToLineOpen] = useState(false);
  const [isGoToSymbolOpen, setIsGoToSymbolOpen] = useState(false);
  const [isWorkspaceSearchOpen, setIsWorkspaceSearchOpen] = useState(false);

  // Monaco refs & state preservation
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const modelsRef = useRef<Record<string, monaco.editor.ITextModel>>({});
  const viewStatesRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const decorationsRef = useRef<string[]>([]);
  const diffDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTabPathRef = useRef<string | null>(null);

  const activeTab = tabs.find((t) => t.path === activeTabPath);

  // Synchronize currentRoot when prop changes
  useEffect(() => {
    if (rootPath && rootPath !== currentRoot) {
      setCurrentRoot(rootPath);
    }
  }, [rootPath]);

  // Load directory children
  const loadChildren = async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const items = await invoke<FileItem[]>("list_dir_files", { path: dirPath });
      return items.map((f) => ({
        name: f.name,
        path: f.path,
        is_dir: f.is_dir,
        children: f.is_dir ? [] : undefined,
        loaded: !f.is_dir,
      }));
    } catch {
      return [];
    }
  };

  const loadRoot = useCallback(async (root: string) => {
    if (!root) return;
    const children = await loadChildren(root);
    const sorted = [...children].sort((a, b) =>
      (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0) || a.name.localeCompare(b.name)
    );
    setTree(sorted);
    setExpandedFolders(new Set());
  }, []);

  useEffect(() => {
    loadRoot(currentRoot);
  }, [currentRoot, loadRoot]);

  // Language mapping
  const getLanguageFromPath = (filePath: string): string => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "json":
        return "json";
      case "rs":
        return "rust";
      case "py":
        return "python";
      case "go":
        return "go";
      case "html":
        return "html";
      case "css":
      case "scss":
        return "css";
      case "md":
      case "markdown":
        return "markdown";
      case "yaml":
      case "yml":
        return "yaml";
      case "toml":
        return "toml";
      case "sql":
        return "sql";
      case "sh":
      case "bash":
      case "zsh":
        return "shell";
      case "xml":
        return "xml";
      default:
        return "plaintext";
    }
  };

  // Open native OS Folder Dialog
  const handleOpenFolderDialog = async () => {
    if (!isTauriEnvironment()) {
      const p = window.prompt("Enter absolute folder path:", currentRoot);
      if (p?.trim()) setCurrentRoot(p.trim());
      return;
    }
    try {
      const selected = await invoke<string | null>("open_folder_dialog");
      if (selected) {
        setCurrentRoot(selected);
        invoke("add_recent_folder", { path: selected }).catch(() => {});
      }
    } catch {
      const p = window.prompt("Enter absolute folder path:", currentRoot);
      if (p?.trim()) setCurrentRoot(p.trim());
    }
  };

  // Open current folder in native OS Finder
  const handleOpenInFinder = async () => {
    if (!currentRoot) return;
    try {
      await invoke("open_in_finder", { path: currentRoot });
    } catch (err) {
      console.error("Failed to open Finder:", err);
    }
  };

  // Toggle folder node
  const toggleFolder = async (node: TreeNode) => {
    const isExpanded = expandedFolders.has(node.path);
    if (isExpanded) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }

    if (node.is_dir && !node.loaded) {
      const children = await loadChildren(node.path);
      const sorted = [...children].sort((a, b) =>
        (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0) || a.name.localeCompare(b.name)
      );
      const updateChildren = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.path === node.path) return { ...n, children: sorted, loaded: true };
          if (n.children) return { ...n, children: updateChildren(n.children) };
          return n;
        });
      setTree((prev) => updateChildren(prev));
    }

    setExpandedFolders((prev) => new Set([...prev, node.path]));
  };

  // Open file into tabs
  const handleOpenFile = async (node: TreeNode | { path: string; name: string }) => {
    if ("is_dir" in node && node.is_dir) {
      toggleFolder(node as TreeNode);
      return;
    }

    const existing = tabs.find((t) => t.path === node.path);
    if (existing) {
      setActiveTabPath(node.path);
      return;
    }

    try {
      const content = await invoke<string>("read_file_content", { path: node.path });
      const newTab: EditorTabItem = {
        path: node.path,
        name: node.name,
        content,
        isDirty: false,
        language: getLanguageFromPath(node.path),
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabPath(node.path);
    } catch (err) {
      console.error(err);
    }
  };

  // Untitled tabs live under an "untitled:N" pseudo-path until first save.
  const isUntitled = (path: string) => path.startsWith("untitled:");

  const writeTab = async (tab: EditorTabItem, path: string) => {
    await invoke("save_file_content", { path, content: tab.content });
    const name = path.split(/[/\\]/).pop() || path;
    setTabs((prev) => prev.map((t) => (t.path === tab.path ? { ...t, path, name, isDirty: false } : t)));
    if (path !== tab.path) {
      setActiveTabPath(path);
      loadRoot(currentRoot);
    }
  };

  const handleNewFile = () => {
    const path = `untitled:${Date.now()}`;
    setTabs((prev) => [...prev, { path, name: "untitled.txt", content: "", isDirty: true }]);
    setActiveTabPath(path);
  };

  /** File ▸ New File… — asks for the path up front and creates it on disk. */
  const handleNewFileOnDisk = async () => {
    const chosen = await invoke<string | null>("save_file_dialog", { defaultName: "untitled.txt" })
      .catch(() => null);
    if (!chosen) return;
    await invoke("save_file_content", { path: chosen, content: "" }).catch(console.error);
    loadRoot(currentRoot);
    const name = chosen.split(/[/\\]/).pop() || chosen;
    handleOpenFile({ name, path: chosen });
  };

  const handleOpenFileDialog = async () => {
    const selected = await invoke<string | null>("open_file_dialog").catch(() => null);
    if (selected) {
      const name = selected.split(/[/\\]/).pop() || selected;
      handleOpenFile({ name, path: selected });
    }
  };

  // Save active file
  const handleSaveFile = async (saveAs = false) => {
    if (!activeTab) return;
    let path = activeTab.path;
    if (saveAs || isUntitled(path)) {
      const chosen = await invoke<string | null>("save_file_dialog", {
        defaultName: isUntitled(path) ? "untitled.txt" : activeTab.name,
      }).catch(() => null);
      if (!chosen) return;
      path = chosen;
    }
    await writeTab(activeTab, path).catch(console.error);
  };

  // Untitled tabs are skipped — each would need its own Save As dialog.
  const handleSaveAll = async () => {
    for (const tab of tabs.filter((t) => t.isDirty && !isUntitled(t.path))) {
      await writeTab(tab, tab.path).catch(console.error);
    }
  };

  const handleRevertFile = async () => {
    if (!activeTab || isUntitled(activeTab.path)) return;
    try {
      const content = await invoke<string>("read_file_content", { path: activeTab.path });
      setTabs((prev) =>
        prev.map((t) => (t.path === activeTab.path ? { ...t, content, isDirty: false } : t))
      );
      updateGitDiffDecorations(activeTab.path, activeTab.content);
    } catch (err) {
      console.error(err);
    }
  };

  // Close tab & Reopen tab
  const handleCloseTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const closed = tabs.find((t) => t.path === path);
    if (closed) {
      setClosedTabsHistory((prev) => [...prev, closed]);
    }
    const remaining = tabs.filter((t) => t.path !== path);
    setTabs(remaining);
    if (activeTabPath === path) {
      setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  };

  const handleReopenClosedTab = () => {
    if (closedTabsHistory.length === 0) return;
    const last = closedTabsHistory[closedTabsHistory.length - 1];
    setClosedTabsHistory((prev) => prev.slice(0, -1));
    setTabs((prev) => [...prev, last]);
    setActiveTabPath(last.path);
  };

  // Git Diff decorations calculation
  const updateGitDiffDecorations = async (filePath: string, currentContent: string) => {
    if (!editorRef.current || !monacoRef.current) return;

    let headText: string | null = null;
    try {
      headText = await invoke<string>("git_file_head", {
        repo: currentRoot,
        path: filePath,
      });
    } catch {
      headText = null;
    }

    const diffs = computeLineDiff(headText, currentContent);
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = diffs.map((d) => {
      let cls = "git-gutter-added";
      if (d.type === "modified") cls = "git-gutter-modified";
      if (d.type === "deleted") cls = "git-gutter-deleted";

      return {
        range: new monacoRef.current!.Range(d.lineNumber, 1, d.lineNumber, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: cls,
        },
      };
    });

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  };

  // Monaco editor mount handler
  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;

    // Define Aster Dark Monaco Theme
    monacoInstance.editor.defineTheme("aster-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "e4e4e7", background: "09090b" },
        { token: "comment", foreground: "71717a", fontStyle: "italic" },
        { token: "keyword", foreground: "c084fc", fontStyle: "bold" },
        { token: "string", foreground: "a3e635" },
        { token: "number", foreground: "fb923c" },
        { token: "type", foreground: "38bdf8" },
        { token: "function", foreground: "60a5fa" },
        { token: "variable", foreground: "f4f4f5" },
      ],
      colors: {
        "editor.background": "#09090b",
        "editor.foreground": "#e4e4e7",
        "editor.lineHighlightBackground": "#18181b80",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#a1a1aa",
        "editorGutter.background": "#09090b",
        "editor.selectionBackground": "#312e81aa",
        "editor.inactiveSelectionBackground": "#1e1b4b80",
        "editorCursor.foreground": "#818cf8",
        "editorWidget.background": "#18181b",
        "editorWidget.border": "#27272a",
        "input.background": "#09090b",
        "input.border": "#27272a",
        "input.foreground": "#f4f4f5",
      },
    });
    monacoInstance.editor.setTheme("aster-dark");

    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  // Handle active tab change & preserve model state
  useEffect(() => {
    if (!activeTabPath || !editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monacoInst = monacoRef.current;

    // Save previous tab's view state
    if (currentTabPathRef.current && currentTabPathRef.current !== activeTabPath) {
      viewStatesRef.current[currentTabPathRef.current] = editor.saveViewState();
    }
    currentTabPathRef.current = activeTabPath;

    const tab = tabs.find((t) => t.path === activeTabPath);
    if (!tab) return;

    const uri = monacoInst.Uri.file(tab.path);
    let model = monacoInst.editor.getModel(uri);
    if (!model) {
      const lang = getLanguageFromPath(tab.path);
      model = monacoInst.editor.createModel(tab.content, lang, uri);
      modelsRef.current[tab.path] = model;
    }

    if (editor.getModel() !== model) {
      editor.setModel(model);
    }

    // Restore view state
    if (viewStatesRef.current[activeTabPath]) {
      editor.restoreViewState(viewStatesRef.current[activeTabPath]);
    }

    editor.focus();
    updateGitDiffDecorations(activeTabPath, model.getValue());
  }, [activeTabPath, tabs]);

  // Handle content edits in Monaco
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !activeTabPath) return;

    setTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTabPath ? { ...tab, content: value, isDirty: true } : tab
      )
    );

    // Debounced Git diff update
    if (diffDebounceRef.current) clearTimeout(diffDebounceRef.current);
    diffDebounceRef.current = setTimeout(() => {
      updateGitDiffDecorations(activeTabPath, value);
    }, 300);
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        setIsQuickOpenOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveFile();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setIsGoToLineOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setIsGoToSymbolOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsWorkspaceSearchOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleReopenClosedTab();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabPath, tabs, closedTabsHistory]);

  /** Edit/Selection menu items are Monaco's built-in actions. */
  const runEditorAction = (actionId: string) => {
    const editor = editorRef.current;
    if (!editor || activeSurface !== "Editor") return;
    editor.focus();
    editor.getAction(actionId)?.run();
  };

  // Auto Save (File menu toggle) — debounced, saved files only.
  useEffect(() => {
    if (!autoSave || !activeTab || !activeTab.isDirty || isUntitled(activeTab.path)) return;
    const t = setTimeout(() => writeTab(activeTab, activeTab.path).catch(console.error), 800);
    return () => clearTimeout(t);
  }, [autoSave, activeTab?.content, activeTab?.isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Native menu bar items that act on the editor.
  useEffect(() => {
    const unlisten = listen<string>("menu", ({ payload: id }) => {
      switch (id) {
        // File
        case "save": handleSaveFile(); break;
        case "save_as": handleSaveFile(true); break;
        case "save_all": handleSaveAll(); break;
        case "revert_file": handleRevertFile(); break;
        case "auto_save": setAutoSave((v) => !v); break;
        case "new_file": setActiveSurface("Editor"); handleNewFile(); break;
        case "new_file_on_disk": setActiveSurface("Editor"); handleNewFileOnDisk(); break;
        case "open_file": setActiveSurface("Editor"); handleOpenFileDialog(); break;
        case "close_tab": if (activeTabPath) handleCloseTab(activeTabPath); break;
        case "reopen_tab": handleReopenClosedTab(); break;
        case "close_folder": setCurrentRoot(""); setTree([]); break;

        // Go
        case "find_file": setActiveSurface("Editor"); setIsQuickOpenOpen(true); break;
        case "go_to_line": setActiveSurface("Editor"); setIsGoToLineOpen(true); break;
        case "go_to_symbol": setActiveSurface("Editor"); setIsGoToSymbolOpen(true); break;
        case "find_in_files": setActiveSurface("Editor"); setIsWorkspaceSearchOpen(true); break;
        case "editor_commands": setActiveSurface("Editor"); setIsCommandPaletteOpen(true); break;

        // Edit — find/replace is per-surface, the terminal owns it on its own surface.
        case "find": runEditorAction("actions.find"); break;
        case "replace": runEditorAction("editor.action.startFindReplaceAction"); break;
        case "find_next": runEditorAction("editor.action.nextMatchFindAction"); break;
        case "find_prev": runEditorAction("editor.action.previousMatchFindAction"); break;
        case "toggle_comment": runEditorAction("editor.action.commentLine"); break;
        case "toggle_block_comment": runEditorAction("editor.action.blockComment"); break;
        case "format_document": runEditorAction("editor.action.formatDocument"); break;

        // Selection
        case "expand_selection": runEditorAction("editor.action.smartSelect.expand"); break;
        case "shrink_selection": runEditorAction("editor.action.smartSelect.shrink"); break;
        case "move_line_up": runEditorAction("editor.action.moveLinesUpAction"); break;
        case "move_line_down": runEditorAction("editor.action.moveLinesDownAction"); break;
        case "copy_line_up": runEditorAction("editor.action.copyLinesUpAction"); break;
        case "copy_line_down": runEditorAction("editor.action.copyLinesDownAction"); break;
        case "duplicate_selection": runEditorAction("editor.action.duplicateSelection"); break;
        case "delete_line": runEditorAction("editor.action.deleteLines"); break;
        case "cursor_above": runEditorAction("editor.action.insertCursorAbove"); break;
        case "cursor_below": runEditorAction("editor.action.insertCursorBelow"); break;
        case "cursors_line_ends": runEditorAction("editor.action.insertCursorAtEndOfEachLineSelected"); break;
        case "add_next_occurrence": runEditorAction("editor.action.addSelectionToNextFindMatch"); break;
        case "add_prev_occurrence": runEditorAction("editor.action.addSelectionToPreviousFindMatch"); break;
        case "select_all_occurrences": runEditorAction("editor.action.selectHighlights"); break;
      }
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, [activeTab, tabs, activeTabPath, currentRoot, activeSurface, closedTabsHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return <FileCode size={14} className="text-blue-400 shrink-0" />;
      case "js":
      case "jsx":
        return <FileCode size={14} className="text-yellow-400 shrink-0" />;
      case "rs":
        return <Code2 size={14} className="text-orange-400 shrink-0" />;
      case "json":
        return <FileJson size={14} className="text-yellow-500 shrink-0" />;
      case "md":
        return <FileText size={14} className="text-sky-300 shrink-0" />;
      case "html":
      case "css":
        return <FileCode size={14} className="text-pink-400 shrink-0" />;
      default:
        return <File size={14} className="text-zinc-400 shrink-0" />;
    }
  };

  const flattenTree = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((n) => [n, ...(n.is_dir && n.children ? flattenTree(n.children) : [])]);

  const searchResults = searchQuery.trim()
    ? flattenTree(tree).filter(
        (n) => !n.is_dir && n.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeTabPath === node.path;

    if (node.is_dir) {
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleFolder(node)}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            className="flex items-center space-x-1.5 py-1 px-2 rounded hover:bg-zinc-800/70 text-zinc-300 cursor-pointer transition-colors text-xs"
          >
            {isExpanded ? (
              <ChevronDown size={13} className="text-zinc-400 shrink-0" />
            ) : (
              <ChevronRight size={13} className="text-zinc-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="text-indigo-400 shrink-0" />
            ) : (
              <Folder size={14} className="text-indigo-400/80 shrink-0" />
            )}
            <span className="truncate font-mono text-[11px]">{node.name}</span>
          </div>

          {isExpanded && node.children && node.children.length > 0 && (
            <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        onClick={() => handleOpenFile(node)}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        className={`flex items-center space-x-1.5 py-1 px-2 rounded text-xs cursor-pointer transition-colors ${
          isActive
            ? "bg-indigo-950/70 text-indigo-200 font-medium border-l-2 border-indigo-500"
            : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {renderFileIcon(node.name)}
        <span className="truncate font-mono text-[11px]">{node.name}</span>
      </div>
    );
  };

  const lineCount = activeTab ? activeTab.content.split("\n").length : 0;
  const rootFolderName = currentRoot.split(/[/\\]/).filter(Boolean).pop() || "Workspace";

  // Commands for Command Palette
  const commandPaletteItems: CommandItem[] = [
    {
      id: "quick_open",
      label: "Quick Open File",
      category: "File",
      shortcut: "Cmd+P",
      icon: <FileCode size={14} className="text-blue-400 shrink-0" />,
      action: () => setIsQuickOpenOpen(true),
    },
    {
      id: "save_file",
      label: "Save Active File",
      category: "File",
      shortcut: "Cmd+S",
      icon: <Save size={14} className="text-emerald-400 shrink-0" />,
      action: handleSaveFile,
    },
    {
      id: "go_to_line",
      label: "Go to Line...",
      category: "Navigation",
      shortcut: "Cmd+G",
      icon: <Hash size={14} className="text-indigo-400 shrink-0" />,
      action: () => setIsGoToLineOpen(true),
    },
    {
      id: "go_to_symbol",
      label: "Go to Symbol in File...",
      category: "Navigation",
      shortcut: "Cmd+Shift+O",
      icon: <Layers size={14} className="text-purple-400 shrink-0" />,
      action: () => setIsGoToSymbolOpen(true),
    },
    {
      id: "workspace_search",
      label: "Search Text Across Workspace...",
      category: "Search",
      shortcut: "Cmd+Shift+F",
      icon: <Search size={14} className="text-amber-400 shrink-0" />,
      action: () => setIsWorkspaceSearchOpen(true),
    },
    {
      id: "format_doc",
      label: "Format Document",
      category: "Editor",
      shortcut: "Shift+Option+F",
      icon: <Code2 size={14} className="text-sky-400 shrink-0" />,
      action: () => editorRef.current?.getAction("editor.action.formatDocument")?.run(),
    },
    {
      id: "toggle_wrap",
      label: `Toggle Word Wrap (Current: ${wordWrap})`,
      category: "View",
      icon: <WrapText size={14} className="text-pink-400 shrink-0" />,
      action: () => setWordWrap((prev) => (prev === "on" ? "off" : "on")),
    },
    {
      id: "fold_all",
      label: "Fold All Code Regions",
      category: "Editor",
      action: () => editorRef.current?.getAction("editor.foldAll")?.run(),
    },
    {
      id: "unfold_all",
      label: "Unfold All Code Regions",
      category: "Editor",
      action: () => editorRef.current?.getAction("editor.unfoldAll")?.run(),
    },
    {
      id: "reopen_tab",
      label: "Reopen Closed Tab",
      category: "View",
      shortcut: "Cmd+Shift+T",
      action: handleReopenClosedTab,
    },
    {
      id: "close_tab",
      label: "Close Active Tab",
      category: "View",
      action: () => activeTabPath && handleCloseTab(activeTabPath),
    },
  ];

  return (
    <div className="flex h-full w-full bg-zinc-950 text-zinc-200 select-none overflow-hidden font-sans">
      {/* Sidebar Explorer */}
      <div className="w-60 bg-zinc-900/80 border-r border-zinc-800 flex flex-col justify-between">
        <div className="p-2 space-y-2 flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-2 pt-1 pb-1 border-b border-zinc-800/60">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              EXPLORER
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={handleNewFile}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="New File (Cmd/Ctrl+N)"
              >
                <FilePlus size={13} />
              </button>
              <button
                onClick={handleOpenFolderDialog}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="Open Folder Dialog..."
              >
                <FolderInput size={13} />
              </button>
              <button
                onClick={handleOpenInFinder}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="Open in Finder / File Manager"
              >
                <ExternalLink size={13} />
              </button>
              <button
                onClick={() => loadRoot(currentRoot)}
                className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded transition-colors"
                title="Refresh File Tree"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Root Directory Display */}
          <div
            onClick={handleOpenInFinder}
            className="flex items-center justify-between px-2 py-1 bg-zinc-950/60 rounded border border-zinc-800/80 text-xs cursor-pointer hover:border-zinc-700 transition-colors"
            title={`Click to open in Finder: ${currentRoot}`}
          >
            <div className="flex items-center space-x-1.5 truncate">
              <FolderOpen size={13} className="text-indigo-400 shrink-0" />
              <span className="font-mono text-[11px] text-zinc-200 truncate font-semibold">
                {rootFolderName}
              </span>
            </div>
            <ExternalLink size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0" />
          </div>

          {/* Search Bar */}
          <div className="relative px-1">
            <Search size={12} className="absolute left-3 top-2 text-zinc-500" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter explorer..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* File Tree */}
          <div className="py-1">
            {searchResults ? (
              searchResults.length > 0 ? (
                searchResults.map((n) => (
                  <div
                    key={n.path}
                    onClick={() => handleOpenFile(n)}
                    className={`flex items-center space-x-1.5 py-1 px-2 rounded text-xs cursor-pointer transition-colors ${
                      activeTabPath === n.path
                        ? "bg-indigo-950/70 text-indigo-200 font-medium border-l-2 border-indigo-500"
                        : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {renderFileIcon(n.name)}
                    <span className="truncate font-mono text-[11px]">{n.name}</span>
                  </div>
                ))
              ) : (
                <div className="text-[11px] text-zinc-500 px-2 py-2">
                  No files match "{searchQuery}"
                </div>
              )
            ) : (
              tree.map((node) => renderTreeNode(node, 0))
            )}
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
        {/* Tabs Bar */}
        <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center px-1 space-x-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => setActiveTabPath(tab.path)}
                onMouseDown={(e) => {
                  if (e.button === 1) handleCloseTab(tab.path);
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 text-xs cursor-pointer border-t-2 border-r border-zinc-800/80 transition-colors shrink-0 ${
                  isActive
                    ? "bg-zinc-950 border-t-indigo-500 text-zinc-100 font-medium"
                    : "bg-zinc-900/60 border-t-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                {renderFileIcon(tab.name)}
                <span className="font-mono text-[11px]">{tab.name}</span>
                {tab.isDirty ? (
                  <span className="w-2 h-2 bg-amber-400 rounded-full" title="Unsaved changes" />
                ) : (
                  <button
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    className="hover:bg-zinc-800 hover:text-rose-400 p-0.5 rounded transition-colors text-zinc-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Active Tab Content */}
        {activeTab ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Breadcrumb Header */}
            <div className="h-7 bg-zinc-900/40 border-b border-zinc-800/80 flex items-center justify-between px-3 text-xs text-zinc-400">
              <div className="flex items-center space-x-1.5 font-mono text-[11px] text-zinc-400 truncate">
                <span>{rootFolderName}</span>
                <span>/</span>
                <span className="text-zinc-200 font-semibold">
                  {activeTab.path.replace(currentRoot, "").replace(/^[/\\]/, "")}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsQuickOpenOpen(true)}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono transition-colors"
                  title="Quick Open File (Cmd+P)"
                >
                  Cmd+P
                </button>
                <button
                  onClick={() => setIsCommandPaletteOpen(true)}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono transition-colors"
                  title="Command Palette (Cmd+Shift+P)"
                >
                  Cmd+Shift+P
                </button>
                <button
                  onClick={() => handleSaveFile()}
                  disabled={!activeTab.isDirty}
                  className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium transition-colors"
                >
                  <Save size={12} />
                  <span>{activeTab.isDirty ? "Save" : "Saved"}</span>
                </button>
              </div>
            </div>

            {/* Monaco Editor Container */}
            <div className="flex-1 w-full h-full relative">
              <Editor
                height="100%"
                path={activeTab.path}
                language={getLanguageFromPath(activeTab.path)}
                theme="aster-dark"
                value={activeTab.content}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  lineHeight: 20,
                  fontFamily: '"JetBrains Mono", "Fira Code", "Menlo", "Monaco", "Consolas", monospace',
                  tabSize: 2,
                  lineNumbers: "on",
                  glyphMargin: true,
                  folding: true,
                  foldingHighlight: true,
                  bracketPairColorization: { enabled: true },
                  autoClosingBrackets: "always",
                  autoClosingQuotes: "always",
                  formatOnType: true,
                  formatOnPaste: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  renderLineHighlight: "all",
                  wordWrap: wordWrap,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  contextmenu: true,
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                }}
              />
            </div>

            {/* Status Bar */}
            <div className="h-6 bg-indigo-950/80 border-t border-indigo-900/60 flex items-center justify-between px-3 text-[10px] text-indigo-300 font-mono select-none">
              <div className="flex items-center space-x-4">
                <span>Ln {cursorPosition.line}, Col {cursorPosition.col}</span>
                <span>UTF-8</span>
                <span className="capitalize">{getLanguageFromPath(activeTab.path)}</span>
              </div>
              <div className="flex items-center space-x-3">
                <span>Lines: {lineCount}</span>
                {activeTab.isDirty && <span className="text-amber-400 font-semibold">• Modified</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs space-y-3 select-none">
            <Code2 size={40} className="text-zinc-700" />
            <div>Select a file from the explorer or press <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded font-mono">Cmd + P</kbd> to open</div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setIsQuickOpenOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs transition-colors"
              >
                <FileCode size={13} />
                <span>Quick Open (Cmd+P)</span>
              </button>
              <button
                onClick={handleOpenFolderDialog}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded text-xs transition-colors"
              >
                <FolderInput size={13} />
                <span>Open Folder...</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation & Command Modals */}
      <QuickOpenModal
        isOpen={isQuickOpenOpen}
        onClose={() => setIsQuickOpenOpen(false)}
        rootPath={currentRoot}
        onSelectFile={(path, name) => handleOpenFile({ path, name })}
      />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commandPaletteItems}
      />

      <GoToLineModal
        isOpen={isGoToLineOpen}
        onClose={() => setIsGoToLineOpen(false)}
        maxLines={lineCount || 1}
        onGoToLine={(line) => {
          if (editorRef.current) {
            editorRef.current.setPosition({ lineNumber: line, column: 1 });
            editorRef.current.revealLineInCenter(line);
            editorRef.current.focus();
          }
        }}
      />

      <GoToSymbolModal
        isOpen={isGoToSymbolOpen}
        onClose={() => setIsGoToSymbolOpen(false)}
        content={activeTab ? activeTab.content : ""}
        onSelectSymbol={(line) => {
          if (editorRef.current) {
            editorRef.current.setPosition({ lineNumber: line, column: 1 });
            editorRef.current.revealLineInCenter(line);
            editorRef.current.focus();
          }
        }}
      />

      <WorkspaceSearchModal
        isOpen={isWorkspaceSearchOpen}
        onClose={() => setIsWorkspaceSearchOpen(false)}
        rootPath={currentRoot}
        onSelectMatch={async (filePath, fileName, line) => {
          await handleOpenFile({ path: filePath, name: fileName });
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.setPosition({ lineNumber: line, column: 1 });
              editorRef.current.revealLineInCenter(line);
              editorRef.current.focus();
            }
          }, 100);
        }}
      />
    </div>
  );
};
