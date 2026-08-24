// Run: node --test src/utils/tasks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoard, serializeBoard, emptyBoard } from "./tasks.ts";

const SAMPLE = `# Tasks

Notes an agent left here.

## Todo

- [ ] (P0) Fix terminal cwd
- [ ] plain task without a tag

## Done

- [x] (P1) Ship the menu bar
`;

test("parses columns, checkboxes and priority tags", () => {
  const b = parseBoard(SAMPLE);
  assert.deepEqual(b.columns.map((c) => c.title), ["Todo", "Done"]);
  assert.equal(b.columns[0].tasks[0].priority, "P0");
  assert.equal(b.columns[0].tasks[0].text, "Fix terminal cwd");
  assert.equal(b.columns[0].tasks[1].priority, "P2"); // untagged defaults to P2
  assert.equal(b.columns[1].tasks[0].done, true);
});

test("keeps the header, so agent notes survive a save", () => {
  assert.match(parseBoard(SAMPLE).header, /Notes an agent left here\./);
  assert.match(serializeBoard(parseBoard(SAMPLE)), /Notes an agent left here\./);
});

test("round-trips without drift", () => {
  const once = serializeBoard(parseBoard(SAMPLE));
  assert.equal(serializeBoard(parseBoard(once)), once);
});

test("an empty or column-less file still gives a usable board", () => {
  assert.deepEqual(parseBoard("").columns.map((c) => c.title), ["Todo", "In Progress", "Done"]);
  assert.equal(parseBoard("just a note").header, "just a note");
  assert.equal(parseBoard("").columns.length, emptyBoard().columns.length);
});

test("empty columns serialize as headings an agent can append to", () => {
  assert.match(serializeBoard(emptyBoard()), /## In Progress/);
});
