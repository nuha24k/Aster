/** Line-based edits for a plain <textarea>: what VS Code's Selection menu does. */

export interface EditState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Index of the first and last line touched by the selection. */
const selectedLines = (s: EditState): [number, number] => [
  s.value.slice(0, s.selectionStart).split("\n").length - 1,
  s.value.slice(0, s.selectionEnd).split("\n").length - 1,
];

/** Character offset where `index` starts. */
const offsetOf = (lines: string[], index: number): number =>
  lines.slice(0, index).reduce((n, l) => n + l.length + 1, 0);

export function moveLines(s: EditState, dir: -1 | 1): EditState {
  const lines = s.value.split("\n");
  const [first, last] = selectedLines(s);
  if (dir === -1 ? first === 0 : last === lines.length - 1) return s;

  const before = offsetOf(lines, first);
  const block = lines.splice(first, last - first + 1);
  lines.splice(first + dir, 0, ...block);
  const delta = offsetOf(lines, first + dir) - before;

  return {
    value: lines.join("\n"),
    selectionStart: s.selectionStart + delta,
    selectionEnd: s.selectionEnd + delta,
  };
}

export function copyLines(s: EditState, dir: -1 | 1): EditState {
  const lines = s.value.split("\n");
  const [first, last] = selectedLines(s);
  const block = lines.slice(first, last + 1);
  lines.splice(first, 0, ...block);
  // Copying up leaves the caret on the new upper copy, copying down on the lower one.
  const delta = dir === 1 ? block.join("\n").length + 1 : 0;

  return {
    value: lines.join("\n"),
    selectionStart: s.selectionStart + delta,
    selectionEnd: s.selectionEnd + delta,
  };
}

export function duplicateSelection(s: EditState): EditState {
  if (s.selectionStart === s.selectionEnd) return copyLines(s, 1);
  const selected = s.value.slice(s.selectionStart, s.selectionEnd);
  return {
    value: s.value.slice(0, s.selectionEnd) + selected + s.value.slice(s.selectionEnd),
    selectionStart: s.selectionEnd,
    selectionEnd: s.selectionEnd + selected.length,
  };
}

export function deleteLines(s: EditState): EditState {
  const lines = s.value.split("\n");
  const [first, last] = selectedLines(s);
  lines.splice(first, last - first + 1);
  if (lines.length === 0) lines.push("");
  const caret = offsetOf(lines, Math.min(first, lines.length - 1));
  return { value: lines.join("\n"), selectionStart: caret, selectionEnd: caret };
}

/** Comment token per file extension; `//` covers most of what ASTER edits. */
export function commentToken(fileName: string): string {
  switch (fileName.split(".").pop()?.toLowerCase()) {
    case "py":
    case "rb":
    case "sh":
    case "bash":
    case "zsh":
    case "yml":
    case "yaml":
    case "toml":
    case "conf":
    case "env":
      return "#";
    case "sql":
    case "lua":
      return "--";
    default:
      return "//";
  }
}

export function toggleComment(s: EditState, token: string): EditState {
  const lines = s.value.split("\n");
  const [first, last] = selectedLines(s);
  const block = lines.slice(first, last + 1);
  const touched = block.filter((l) => l.trim() !== "");
  if (touched.length === 0) return s;

  const commented = touched.every((l) => l.trimStart().startsWith(token));
  let firstDelta = 0;
  let totalDelta = 0;

  const next = block.map((line) => {
    if (line.trim() === "") return line;
    const indent = line.length - line.trimStart().length;
    let out: string;
    if (commented) {
      const rest = line.slice(indent + token.length);
      out = line.slice(0, indent) + (rest.startsWith(" ") ? rest.slice(1) : rest);
    } else {
      out = line.slice(0, indent) + token + " " + line.slice(indent);
    }
    const delta = out.length - line.length;
    if (totalDelta === 0 && firstDelta === 0) firstDelta = delta;
    totalDelta += delta;
    return out;
  });

  lines.splice(first, last - first + 1, ...next);
  return {
    value: lines.join("\n"),
    selectionStart: Math.max(offsetOf(lines, first), s.selectionStart + firstDelta),
    selectionEnd: s.selectionEnd + totalDelta,
  };
}
