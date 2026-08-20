// Run: node --test src/utils/textedit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveLines, copyLines, duplicateSelection, deleteLines, toggleComment, commentToken,
} from "./textedit.ts";

const at = (value: string, pos: number) => ({ value, selectionStart: pos, selectionEnd: pos });

test("move lines up and down", () => {
  const s = at("a\nb\nc", 2); // caret on "b"
  assert.equal(moveLines(s, -1).value, "b\na\nc");
  assert.equal(moveLines(s, 1).value, "a\nc\nb");
  assert.equal(moveLines(at("a\nb", 0), -1).value, "a\nb"); // first line: no-op
  assert.equal(moveLines(at("a\nb", 2), 1).value, "a\nb"); // last line: no-op
});

test("moved caret stays on the moved line", () => {
  const moved = moveLines(at("a\nbb\nc", 3), -1); // caret inside "bb"
  assert.equal(moved.value, "bb\na\nc");
  assert.equal(moved.value[moved.selectionStart], "b");
});

test("copy line up keeps caret above, copy down moves it below", () => {
  assert.equal(copyLines(at("a\nb", 2), -1).selectionStart, 2);
  assert.equal(copyLines(at("a\nb", 2), 1).value, "a\nb\nb");
  assert.equal(copyLines(at("a\nb", 2), 1).selectionStart, 4);
});

test("duplicate selection duplicates text, or the line when empty", () => {
  const sel = { value: "abcd", selectionStart: 1, selectionEnd: 3 };
  assert.equal(duplicateSelection(sel).value, "abcbcd");
  assert.equal(duplicateSelection(at("x\ny", 0)).value, "x\nx\ny");
});

test("delete line", () => {
  assert.equal(deleteLines(at("a\nb\nc", 2)).value, "a\nc");
  assert.equal(deleteLines(at("only", 1)).value, "");
});

test("toggle comment adds then removes, preserving indent", () => {
  const s = { value: "  let x = 1;", selectionStart: 0, selectionEnd: 12 };
  const on = toggleComment(s, "//");
  assert.equal(on.value, "  // let x = 1;");
  assert.equal(toggleComment(on, "//").value, s.value);
});

test("toggle comment skips blank lines in a block", () => {
  const s = { value: "a\n\nb", selectionStart: 0, selectionEnd: 3 };
  assert.equal(toggleComment(s, "#").value, "# a\n\n# b");
});

test("comment token per extension", () => {
  assert.equal(commentToken("main.rs"), "//");
  assert.equal(commentToken("deploy.sh"), "#");
  assert.equal(commentToken("q.sql"), "--");
});
