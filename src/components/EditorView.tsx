import React, { useState, useEffect, useCallback, useRef } from "react";
import { safeInvoke } from "../utils/tauri";
import { subscribeMenu } from "../api/client";
import { useWorkspaceStore } from "../store";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { FileItem, EditorTabItem } from "../types";
import { computeLineDiff } from "../utils/gitDiff";
import { configureMonacoTypeScriptForWorkspace } from "../utils/monacoTypeScript";
import { initLspBridge, lspNotifyOpen, lspNotifyChange, lspNotifySave } from "../utils/monacoLsp";
import { getLanguageFromPath } from "../utils/editorLanguage";
import { EditorFileTree, TreeNode } from "./editor/EditorFileTree";
import { EditorTabBar } from "./editor/EditorTabBar";
import { EditorStatusBar } from "./editor/EditorStatusBar";
import { QuickOpenModal } from "./editor/QuickOpenModal";
import { CommandPaletteModal, CommandItem } from "./editor/CommandPaletteModal";
import { GoToLineModal } from "./editor/GoToLineModal";
import { GoToSymbolModal } from "./editor/GoToSymbolModal";
import { WorkspaceSearchModal } from "./editor/WorkspaceSearchModal";
import {
  FileCode,
  Save,
  Search,
  Code2,
  WrapText,
  Hash,
  Layers,
} from "lucide-react";

interface EditorViewProps {
  rootPath: string;
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
      const items = await safeInvoke<FileItem[]>("list_dir_files", { path: dirPath });
      return items.map((f: FileItem) => ({
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

  // Open native OS Folder Dialog
  const handleOpenFolderDialog = async () => {
    try {
      const selected = await safeInvoke<string | null>("open_folder_dialog");
      if (selected) {
        setCurrentRoot(selected);
        safeInvoke("add_recent_folder", { path: selected }).catch(() => {});
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
      await safeInvoke("open_in_finder", { path: currentRoot });
    } catch (err) {
      console.error("Failed to open Finder:", err);
    }
  };

  // Helper to find and update nodes in the tree
  const updateNodeInTree = (nodes: TreeNode[], path: string, updater: (node: TreeNode) => TreeNode): TreeNode[] => {
    return nodes.map((n) => {
      if (n.path === path) return updater(n);
      if (n.children) return { ...n, children: updateNodeInTree(n.children, path, updater) };
      return n;
    });
  };

  // Directory Tree Toggle
  const toggleFolder = async (node: TreeNode) => {
    setTree((prev) =>
      updateNodeInTree(prev, node.path, (n) => ({
        ...n,
        loading: !n.loaded,
      }))
    );

    if (!node.loaded) {
      const children = await loadChildren(node.path);
      const sorted = [...children].sort((a, b) =>
        (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0) || a.name.localeCompare(b.name)
      );

      setTree((prev) =>
        updateNodeInTree(prev, node.path, (n) => ({
          ...n,
          children: sorted,
          loaded: true,
          loading: false,
        }))
      );
    }

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  };

  // Open File into Editor Tab
  const handleOpenFile = async (node: { name: string; path: string }) => {
    const existingIndex = tabs.findIndex((t) => t.path === node.path);
    if (existingIndex !== -1) {
      setActiveTabPath(node.path);
      return;
    }

    try {
      const content = await safeInvoke<string>("read_file_content", { path: node.path });
      const language = getLanguageFromPath(node.name);

      const newTab: EditorTabItem = {
        path: node.path,
        name: node.name,
        content,
        language,
        isDirty: false,
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
    await safeInvoke("save_file_content", { path, content: tab.content });
    lspNotifySave(path, tab.language).catch(console.error);
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
    const chosen = await safeInvoke<string | null>("save_file_dialog", { default_name: "untitled.txt" })
      .catch(() => null);
    if (!chosen) return;
    await safeInvoke("save_file_content", { path: chosen, content: "" }).catch(console.error);
    loadRoot(currentRoot);
    const name = chosen.split(/[/\\]/).pop() || chosen;
    handleOpenFile({ name, path: chosen });
  };

  const handleOpenFileDialog = async () => {
    const selected = await safeInvoke<string | null>("open_file_dialog").catch(() => null);
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
      const chosen = await safeInvoke<string | null>("save_file_dialog", {
        default_name: isUntitled(path) ? "untitled.txt" : activeTab.name,
      }).catch(() => null);
      if (!chosen) return;
      path = chosen;
    }
    await writeTab(activeTab, path).catch(console.error);
  };

  // Save All
  const handleSaveAll = async () => {
    for (const tab of tabs.filter((t) => t.isDirty && !isUntitled(t.path))) {
      await writeTab(tab, tab.path).catch(console.error);
    }
  };

  const handleRevertFile = async () => {
    if (!activeTab || isUntitled(activeTab.path)) return;
    try {
      const content = await safeInvoke<string>("read_file_content", { path: activeTab.path });
      setTabs((prev) =>
        prev.map((t) => (t.path === activeTab.path ? { ...t, content, isDirty: false } : t))
      );
      updateGitDiffDecorations(activeTab.path, activeTab.content);
    } catch (err) {
      console.error(err);
    }
  };

  const cursorListenerRef = useRef<monaco.IDisposable | null>(null);

  // Clean up all Monaco models on unmount
  useEffect(() => {
    return () => {
      if (cursorListenerRef.current) {
        cursorListenerRef.current.dispose();
      }
      if (diffDebounceRef.current) {
        clearTimeout(diffDebounceRef.current);
      }
      Object.values(modelsRef.current).forEach((m) => {
        if (m && !m.isDisposed()) {
          m.dispose();
        }
      });
      modelsRef.current = {};
      viewStatesRef.current = {};
    };
  }, []);

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

    // Dispose Monaco model to prevent memory leaks
    if (modelsRef.current[path]) {
      if (!modelsRef.current[path].isDisposed()) {
        modelsRef.current[path].dispose();
      }
      delete modelsRef.current[path];
    }
    delete viewStatesRef.current[path];
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
      headText = await safeInvoke<string>("git_file_head", {
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

    initLspBridge().catch(console.error);

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

    if (currentRoot) {
      configureMonacoTypeScriptForWorkspace(currentRoot).catch(console.error);
    }

    if (cursorListenerRef.current) {
      cursorListenerRef.current.dispose();
    }
    cursorListenerRef.current = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  // Re-configure Monaco TypeScript service when currentRoot workspace changes
  useEffect(() => {
    if (currentRoot && monacoRef.current) {
      configureMonacoTypeScriptForWorkspace(currentRoot).catch(console.error);
    }
  }, [currentRoot]);

  // Handle active tab change & preserve model state
  useEffect(() => {
    if (!activeTabPath || !editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monacoInst = monacoRef.current;

    if (currentTabPathRef.current && currentTabPathRef.current !== activeTabPath) {
      viewStatesRef.current[currentTabPathRef.current] = editor.saveViewState();
    }
    currentTabPathRef.current = activeTabPath;

    const tab = tabs.find((t) => t.path === activeTabPath);
    if (!tab) return;

    let model = modelsRef.current[activeTabPath];
    if (!model || model.isDisposed()) {
      const uri = monacoInst.Uri.file(activeTabPath);
      model = monacoInst.editor.getModel(uri) || monacoInst.editor.createModel(tab.content, tab.language, uri);
      modelsRef.current[activeTabPath] = model;
    }

    if (editor.getModel() !== model) {
      editor.setModel(model);
    }

    if (viewStatesRef.current[activeTabPath]) {
      editor.restoreViewState(viewStatesRef.current[activeTabPath]);
    }

    editor.focus();
    updateGitDiffDecorations(activeTabPath, model.getValue());
    lspNotifyOpen(tab.path, tab.language, tab.content, currentRoot).catch(console.error);
  }, [activeTabPath, tabs, currentRoot]);

  // Handle content edits in Monaco
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !activeTabPath) return;

    const tab = tabs.find((t) => t.path === activeTabPath);
    if (tab) {
      lspNotifyChange(activeTabPath, tab.language, value, currentRoot).catch(console.error);
    }

    setTabs((prev) =>
      prev.map((t) => (t.path === activeTabPath ? { ...t, content: value, isDirty: true } : t))
    );

    if (diffDebounceRef.current) clearTimeout(diffDebounceRef.current);
    diffDebounceRef.current = setTimeout(() => {
      updateGitDiffDecorations(activeTabPath, value);
    }, 300);
  };

  // Keyboard shortcuts
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

  const runEditorAction = (actionId: string) => {
    const editor = editorRef.current;
    if (!editor || activeSurface !== "Editor") return;
    editor.focus();
    editor.getAction(actionId)?.run();
  };

  // Auto Save
  useEffect(() => {
    if (!autoSave || !activeTab || !activeTab.isDirty || isUntitled(activeTab.path)) return;
    const t = setTimeout(() => writeTab(activeTab, activeTab.path).catch(console.error), 800);
    return () => clearTimeout(t);
  }, [autoSave, activeTab?.content, activeTab?.isDirty]);

  // Native menu listener
  useEffect(() => {
    const unsubscribe = subscribeMenu((id) => {
      switch (id) {
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
        case "find_file": setActiveSurface("Editor"); setIsQuickOpenOpen(true); break;
        case "go_to_line": setActiveSurface("Editor"); setIsGoToLineOpen(true); break;
        case "go_to_symbol": setActiveSurface("Editor"); setIsGoToSymbolOpen(true); break;
        case "find_in_files": setActiveSurface("Editor"); setIsWorkspaceSearchOpen(true); break;
        case "editor_commands": setActiveSurface("Editor"); setIsCommandPaletteOpen(true); break;
        case "find": runEditorAction("actions.find"); break;
        case "replace": runEditorAction("editor.action.startFindReplaceAction"); break;
        case "find_next": runEditorAction("editor.action.nextMatchFindAction"); break;
        case "find_prev": runEditorAction("editor.action.previousMatchFindAction"); break;
        case "toggle_comment": runEditorAction("editor.action.commentLine"); break;
        case "toggle_block_comment": runEditorAction("editor.action.blockComment"); break;
        case "format_document": runEditorAction("editor.action.formatDocument"); break;
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
      unsubscribe();
    };
  }, [activeTab, tabs, activeTabPath, currentRoot, activeSurface, closedTabsHistory]);

  const lineCount = activeTab ? activeTab.content.split("\n").length : 0;
  const rootFolderName =
    typeof currentRoot === "string" && currentRoot
      ? currentRoot.split(/[/\\]/).filter(Boolean).pop() || "Workspace"
      : "Workspace";

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
  ];

  return (
    <div className="flex h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* File Explorer Sidebar */}
      <EditorFileTree
        currentRoot={currentRoot}
        rootFolderName={rootFolderName}
        tree={tree}
        expandedFolders={expandedFolders}
        activeTabPath={activeTabPath}
        searchQuery={searchQuery}
        searchRef={searchRef}
        setSearchQuery={setSearchQuery}
        onToggleFolder={toggleFolder}
        onOpenFile={handleOpenFile}
        onNewFile={handleNewFile}
        onNewFileOnDisk={handleNewFileOnDisk}
        onOpenFolderDialog={handleOpenFolderDialog}
        onOpenInFinder={handleOpenInFinder}
        onRefreshRoot={() => loadRoot(currentRoot)}
      />

      {/* Editor & Tabs Container */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-900/30">
        <EditorTabBar
          tabs={tabs}
          activeTabPath={activeTabPath}
          onTabClick={setActiveTabPath}
          onTabClose={handleCloseTab}
          onNewFile={handleNewFile}
          onOpenFileDialog={handleOpenFileDialog}
        />

        {/* Editor Main Content Area */}
        <div className="flex-1 relative bg-zinc-950">
          {activeTab ? (
            <Editor
              height="100%"
              theme="aster-dark"
              language={activeTab.language}
              value={activeTab.content}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
                fontLigatures: true,
                minimap: { enabled: true, side: "right" },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                smoothScrolling: true,
                wordWrap: wordWrap,
                renderLineHighlight: "all",
                lineNumbersMinChars: 4,
                padding: { top: 8, bottom: 8 },
                folding: true,
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3 bg-zinc-950">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shadow-inner">
                <FileCode size={24} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-300">No File Selected</p>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Select a file from the explorer on the left or use keyboard shortcuts to open or search files.
                </p>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <button
                  onClick={() => setIsQuickOpenOpen(true)}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-xs text-zinc-300 transition-colors font-mono"
                >
                  Cmd+P Quick Open
                </button>
                <button
                  onClick={handleNewFile}
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 rounded text-xs text-indigo-300 transition-colors font-mono"
                >
                  + Scratch File
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar Footer */}
        <EditorStatusBar
          activeTab={activeTab}
          cursorPosition={cursorPosition}
          lineCount={lineCount}
          wordWrap={wordWrap}
          autoSave={autoSave}
          onToggleWordWrap={() => setWordWrap((w) => (w === "on" ? "off" : "on"))}
          onToggleAutoSave={() => setAutoSave((v) => !v)}
        />
      </div>

      {/* Modals */}
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

      {activeTab && editorRef.current && (
        <>
          <GoToLineModal
            isOpen={isGoToLineOpen}
            onClose={() => setIsGoToLineOpen(false)}
            maxLines={lineCount}
            onGoToLine={(line) => {
              if (editorRef.current) {
                editorRef.current.revealLineInCenter(line);
                editorRef.current.setPosition({ lineNumber: line, column: 1 });
                editorRef.current.focus();
              }
            }}
          />
          <GoToSymbolModal
            isOpen={isGoToSymbolOpen}
            onClose={() => setIsGoToSymbolOpen(false)}
            content={activeTab.content}
            onSelectSymbol={(line) => {
              if (editorRef.current) {
                editorRef.current.revealLineInCenter(line);
                editorRef.current.setPosition({ lineNumber: line, column: 1 });
                editorRef.current.focus();
              }
            }}
          />
        </>
      )}

      <WorkspaceSearchModal
        isOpen={isWorkspaceSearchOpen}
        onClose={() => setIsWorkspaceSearchOpen(false)}
        rootPath={currentRoot}
        onSelectMatch={(filePath, name, line) => {
          handleOpenFile({ path: filePath, name }).then(() => {
            setTimeout(() => {
              if (editorRef.current) {
                editorRef.current.revealLineInCenter(line);
                editorRef.current.setPosition({ lineNumber: line, column: 1 });
                editorRef.current.focus();
              }
            }, 150);
          });
        }}
      />
    </div>
  );
};
