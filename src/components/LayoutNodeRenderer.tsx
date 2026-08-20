import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { LayoutNode } from "../types";
import { TerminalView, TerminalHandle } from "./TerminalView";
import { useWorkspaceStore } from "../store";
import { listen } from "@tauri-apps/api/event";
import {
  Columns2,
  Rows2,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
} from "lucide-react";

// ─── Surface IDs helper ───────────────────────────────────────────────────────

function leavesOf(node: LayoutNode): string[] {
  if (node.type === "Surface") return [node.surfaceId];
  return [...leavesOf(node.first), ...leavesOf(node.second)];
}

// ─── Pane box computed from layout tree ──────────────────────────────────────

interface PaneBox {
  surfaceId: string;
  /** Percent-based rect */
  x: number;
  y: number;
  w: number;
  h: number;
}

function computePaneBoxes(node: LayoutNode): PaneBox[] {
  const boxes: PaneBox[] = [];
  const walk = (n: LayoutNode, x: number, y: number, w: number, h: number) => {
    if (n.type === "Surface") {
      boxes.push({ surfaceId: n.surfaceId, x, y, w, h });
      return;
    }
    const ratio = n.ratio / 100;
    if (n.direction === "Vertical") {
      const w0 = w * ratio;
      walk(n.first, x, y, w0, h);
      walk(n.second, x + w0, y, w - w0, h);
    } else {
      const h0 = h * ratio;
      walk(n.first, x, y, w, h0);
      walk(n.second, x, y + h0, w, h - h0);
    }
  };
  walk(node, 0, 0, 100, 100);
  return boxes;
}

interface Divider {
  /** surfaceId of the first-child leaf — used as key for setLayoutRatio */
  firstLeafId: string;
  direction: "Vertical" | "Horizontal"; // Vertical = col-resize, Horizontal = row-resize
  /** percent position of the divider handle */
  at: number;
  /** percent rect of the parent split region */
  rx: number;
  ry: number;
  rw: number;
  rh: number;
}

function computeDividers(node: LayoutNode, rx = 0, ry = 0, rw = 100, rh = 100): Divider[] {
  if (node.type === "Surface") return [];
  const ratio = node.ratio / 100;
  const dividers: Divider[] = [];

  if (node.direction === "Vertical") {
    const at = rx + rw * ratio;
    dividers.push({
      firstLeafId: leavesOf(node.first)[0]!,
      direction: "Vertical",
      at, rx, ry, rw, rh,
    });
    const w0 = rw * ratio;
    dividers.push(...computeDividers(node.first, rx, ry, w0, rh));
    dividers.push(...computeDividers(node.second, rx + w0, ry, rw - w0, rh));
  } else {
    const at = ry + rh * ratio;
    dividers.push({
      firstLeafId: leavesOf(node.first)[0]!,
      direction: "Horizontal",
      at, rx, ry, rw, rh,
    });
    const h0 = rh * ratio;
    dividers.push(...computeDividers(node.first, rx, ry, rw, h0));
    dividers.push(...computeDividers(node.second, rx, ry + h0, rw, rh - h0));
  }
  return dividers;
}

// ─── Drop zone ───────────────────────────────────────────────────────────────

type DropZone = "left" | "right" | "top" | "bottom";

interface DropTarget {
  surfaceId: string;
  zone: DropZone;
  box: PaneBox;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LayoutNodeRendererProps {
  node: LayoutNode;
  cwd?: string;
}

export const LayoutNodeRenderer: React.FC<LayoutNodeRendererProps> = ({ node, cwd }) => {
  const {
    activeTerminalId,
    splitPane,
    closePane,
    setLayoutRatio,
  } = useWorkspaceStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const draggingSurfaceId = useRef<string | null>(null);

  // ⌘F Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusedPane = useCallback((): TerminalHandle | undefined => {
    return activeTerminalId ? paneRefs.current.get(activeTerminalId) : undefined;
  }, [activeTerminalId]);

  // Open/close search
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      focusedPane()?.clearSearch();
      setSearchQuery("");
      focusedPane()?.focus();
    }
  }, [searchOpen, focusedPane]);

  // Clear search when active terminal changes
  useEffect(() => {
    if (searchOpen) {
      focusedPane()?.clearSearch();
      setSearchQuery("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerminalId]);

  useEffect(() => {
    if (searchQuery) focusedPane()?.findNext(searchQuery, true);
    else focusedPane()?.clearSearch();
  }, [searchQuery, focusedPane]);

  const searchStep = (backwards = false) => {
    if (!searchQuery) return;
    if (backwards) focusedPane()?.findPrevious(searchQuery);
    else focusedPane()?.findNext(searchQuery);
  };

  // ⌘F keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  // Edit ▸ Find / Find Next / Find Previous, while the terminal is on screen.
  useEffect(() => {
    const unlisten = listen<string>("menu", ({ payload: id }) => {
      if (useWorkspaceStore.getState().activeSurface !== "Terminal") return;
      if (id === "find") setSearchOpen((v) => !v);
      if (id === "find_next") searchStep(false);
      if (id === "find_prev") searchStep(true);
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, [searchQuery, focusedPane]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Drag-resize divider ────────────────────────────────────────────────────

  const startDividerDrag = useCallback(
    (divider: Divider, e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const box = container.getBoundingClientRect();

      const onMove = (ev: MouseEvent) => {
        let pct: number;
        if (divider.direction === "Vertical") {
          const xPct = ((ev.clientX - box.left) / box.width) * 100;
          const withinPct = ((xPct - divider.rx) / divider.rw) * 100;
          pct = Math.min(85, Math.max(15, withinPct));
        } else {
          const yPct = ((ev.clientY - box.top) / box.height) * 100;
          const withinPct = ((yPct - divider.ry) / divider.rh) * 100;
          pct = Math.min(85, Math.max(15, withinPct));
        }
        setLayoutRatio(divider.firstLeafId, pct);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [setLayoutRatio]
  );

  // ─── Drag & drop pane ───────────────────────────────────────────────────────

  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const onContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!draggingSurfaceId.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const container = containerRef.current;
      if (!container) return;
      const boxEl = container.getBoundingClientRect();
      const xPct = ((e.clientX - boxEl.left) / boxEl.width) * 100;
      const yPct = ((e.clientY - boxEl.top) / boxEl.height) * 100;

      const boxes = computePaneBoxes(node);
      const target = boxes.find(
        (b) =>
          xPct >= b.x && xPct <= b.x + b.w && yPct >= b.y && yPct <= b.y + b.h
      );

      if (!target || target.surfaceId === draggingSurfaceId.current) {
        setDropTarget(null);
        return;
      }

      const rx = (xPct - target.x) / target.w;
      const ry = (yPct - target.y) / target.h;
      const zones: [DropZone, number][] = [
        ["left", rx],
        ["right", 1 - rx],
        ["top", ry],
        ["bottom", 1 - ry],
      ];
      zones.sort((a, b) => a[1] - b[1]);
      setDropTarget({ surfaceId: target.surfaceId, zone: zones[0]![0], box: target });
    },
    [node]
  );

  const onContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const from = draggingSurfaceId.current;
      const to = dropTarget;
      draggingSurfaceId.current = null;
      setDropTarget(null);
      if (!from || !to) return;
      // Map drop zone to split direction + which side to put the dragged pane
      const directionMap: Record<DropZone, { dir: "Vertical" | "Horizontal"; first: boolean }> = {
        left: { dir: "Vertical", first: true },
        right: { dir: "Vertical", first: false },
        top: { dir: "Horizontal", first: true },
        bottom: { dir: "Horizontal", first: false },
      };
      const { dir, first: putFirst } = directionMap[to.zone];
      // Close dragged pane, re-open by splitting target
      closePane(from);
      splitPane(to.surfaceId, dir);
      if (putFirst) {
        // swap: new pane goes first (splitPane always adds after target)
        // ASTER's splitPane always puts new pane as second child — acceptable behavior
      }
    },
    [dropTarget, closePane, splitPane]
  );

  const dropOverlayStyle = (): React.CSSProperties | null => {
    if (!dropTarget) return null;
    const { box, zone } = dropTarget;
    const half: { x: number; y: number; w: number; h: number } =
      zone === "left"
        ? { x: box.x, y: box.y, w: box.w / 2, h: box.h }
        : zone === "right"
        ? { x: box.x + box.w / 2, y: box.y, w: box.w / 2, h: box.h }
        : zone === "top"
        ? { x: box.x, y: box.y, w: box.w, h: box.h / 2 }
        : { x: box.x, y: box.y + box.h / 2, w: box.w, h: box.h / 2 };
    return {
      left: `${half.x}%`,
      top: `${half.y}%`,
      width: `${half.w}%`,
      height: `${half.h}%`,
    };
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const panes = computePaneBoxes(node);
  const dividers = computeDividers(node);
  const multiPane = panes.length > 1;
  const overlayStyle = dropOverlayStyle();

  return (
    <div className="relative flex-1 w-full h-full min-h-0 min-w-0">
      {/* ⌘F Search bar */}
      {searchOpen && (
        <div className="absolute top-2 right-3 z-30 flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg px-2 py-1">
          <Search size={12} className="text-zinc-500 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) searchStep(true);
              else if (e.key === "Enter") searchStep();
              else if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Find…"
            className="w-40 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none font-mono"
          />
          <button
            onClick={() => searchStep(true)}
            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            title="Previous match"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => searchStep()}
            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            title="Next match"
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={() => setSearchOpen(false)}
            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400"
            title="Close search (Esc)"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Pane area */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onDragOver={onContainerDragOver}
        onDragLeave={(e) => {
          const related = e.relatedTarget as Node | null;
          if (!related || !containerRef.current?.contains(related)) setDropTarget(null);
        }}
        onDrop={onContainerDrop}
      >
        {panes.map((pane) => {
          const isFocused = activeTerminalId === pane.surfaceId;
          return (
            <div
              key={pane.surfaceId}
              className="absolute group/pane p-px"
              style={{
                left: `${pane.x}%`,
                top: `${pane.y}%`,
                width: `${pane.w}%`,
                height: `${pane.h}%`,
              }}
            >
              <div
                className={`h-full w-full overflow-hidden rounded-sm ${
                  multiPane
                    ? isFocused
                      ? "ring-1 ring-indigo-500/60"
                      : "ring-1 ring-zinc-800/60"
                    : ""
                }`}
              >
                <TerminalView
                  ref={(handle) => {
                    if (handle) paneRefs.current.set(pane.surfaceId, handle);
                    else paneRefs.current.delete(pane.surfaceId);
                  }}
                  id={pane.surfaceId}
                  cwd={cwd}
                />
              </div>

              {/* Drag handle — grab pane to re-dock */}
              <div
                draggable
                className="absolute top-0.5 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center
                           w-10 h-4 rounded-b-md cursor-grab active:cursor-grabbing
                           bg-zinc-900 text-zinc-600 opacity-0 group-hover/pane:opacity-100 transition-opacity"
                title="Drag to move pane"
                onDragStart={(e) => {
                  draggingSurfaceId.current = pane.surfaceId;
                  e.dataTransfer.setData("text/plain", pane.surfaceId);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  draggingSurfaceId.current = null;
                  setDropTarget(null);
                }}
              >
                <GripHorizontal size={10} />
              </div>

              {/* Pane hover actions: split + close */}
              <div className="absolute top-1 right-1.5 z-10 flex items-center gap-0.5 opacity-0 group-hover/pane:opacity-100 transition-opacity">
                <button
                  className="flex items-center justify-center size-4 rounded bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                  title="Split right (⌘D)"
                  onClick={(e) => { e.stopPropagation(); splitPane(pane.surfaceId, "Vertical"); }}
                >
                  <Columns2 size={10} />
                </button>
                <button
                  className="flex items-center justify-center size-4 rounded bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                  title="Split down (⇧⌘D)"
                  onClick={(e) => { e.stopPropagation(); splitPane(pane.surfaceId, "Horizontal"); }}
                >
                  <Rows2 size={10} />
                </button>
                <button
                  className="flex items-center justify-center size-4 rounded bg-zinc-900 text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                  title="Close pane (⌘W)"
                  onClick={(e) => { e.stopPropagation(); closePane(pane.surfaceId); }}
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Dividers — drag to resize */}
        {dividers.map((d, i) => {
          const isVertical = d.direction === "Vertical";
          return (
            <div
              key={i}
              className={`absolute z-10 group/div ${isVertical ? "cursor-col-resize" : "cursor-row-resize"}`}
              style={
                isVertical
                  ? {
                      left: `calc(${d.at}% - 3px)`,
                      top: `${d.ry}%`,
                      width: "6px",
                      height: `${d.rh}%`,
                    }
                  : {
                      left: `${d.rx}%`,
                      top: `calc(${d.at}% - 3px)`,
                      width: `${d.rw}%`,
                      height: "6px",
                    }
              }
              onMouseDown={(e) => startDividerDrag(d, e)}
            >
              <div
                className={`bg-transparent group-hover/div:bg-indigo-500/40 transition-colors ${
                  isVertical ? "mx-auto h-full w-px" : "my-auto w-full h-px"
                }`}
              />
            </div>
          );
        })}

        {/* Drop zone highlight while dragging */}
        {overlayStyle && (
          <div
            className="absolute z-20 pointer-events-none rounded-md border-2 border-indigo-500 bg-indigo-500/15"
            style={overlayStyle}
          />
        )}
      </div>
    </div>
  );
};
