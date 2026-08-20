export interface GitDiffDecoration {
  lineNumber: number;
  type: "added" | "modified" | "deleted";
}

/**
 * Computes line-by-line Git diff between HEAD text and current working text.
 * Returns array of line decorations for Monaco Editor gutter.
 */
export function computeLineDiff(headText: string | null, currentText: string): GitDiffDecoration[] {
  if (headText === null) {
    // File does not exist in HEAD (new/untracked file): all lines are added
    const currentLines = currentText.split("\n");
    return currentLines.map((_, i) => ({ lineNumber: i + 1, type: "added" }));
  }

  const headLines = headText.split("\n");
  const currentLines = currentText.split("\n");

  // Short circuit if identical
  if (headText === currentText) {
    return [];
  }

  const n = headLines.length;
  const m = currentLines.length;

  // DP table for LCS length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (headLines[i - 1] === currentLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build edit script
  let i = n;
  let j = m;

  const currentLineState: Map<number, "added" | "modified" | "deleted"> = new Map();
  const deletedBeforeLine: Set<number> = new Set();

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && headLines[i - 1] === currentLines[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Line j in current file was added
      currentLineState.set(j, "added");
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      // Line i in head was deleted
      const targetCurrentLine = Math.max(1, Math.min(j + 1, m));
      deletedBeforeLine.add(targetCurrentLine);
      i--;
    }
  }

  // Mark modified lines (where added and deleted coincide near the same line)
  const result: GitDiffDecoration[] = [];

  for (let line = 1; line <= m; line++) {
    const isAdded = currentLineState.get(line) === "added";
    const hasDeletedNear = deletedBeforeLine.has(line);

    if (isAdded && hasDeletedNear) {
      result.push({ lineNumber: line, type: "modified" });
    } else if (isAdded) {
      result.push({ lineNumber: line, type: "added" });
    } else if (hasDeletedNear) {
      result.push({ lineNumber: line, type: "deleted" });
    }
  }

  return result;
}
