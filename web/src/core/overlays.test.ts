// The layered overlay stack: one window's full-size layers (an expanded board, a chart's drill-down detail, a
// photo) open over each other, and Escape and Tab belong to the TOP of the stack alone. A lower layer must not
// also answer the key, and the top must come back when the layer above it closes.
import { afterEach, describe, expect, it } from "vitest";
import { isTopLayer, popLayer, pushLayer } from "./overlays";

// The stack is module state, like the browser's real one; unwind whatever a test left on it.
let opened: number[] = [];
afterEach(() => {
  for (const id of opened.reverse()) popLayer(id);
  opened = [];
  const fresh = pushLayer();               // nothing of the last test may still hold the top
  expect(isTopLayer(fresh)).toBe(true);
  popLayer(fresh);
});

const open = () => { const id = pushLayer(); opened.push(id); return id; };

describe("overlay layer stack", () => {
  it("an open layer is the top until something opens over it", () => {
    const board = open();
    expect(isTopLayer(board)).toBe(true);
    const detail = open();
    expect(isTopLayer(detail)).toBe(true);
    expect(isTopLayer(board)).toBe(false);
  });

  it("when the top layer closes, the layer under it owns the keys again", () => {
    const board = open();
    const detail = open();
    popLayer(detail);
    expect(isTopLayer(board)).toBe(true);
  });

  it("nothing is the top with the stack empty", () => {
    const board = open();
    popLayer(board);
    expect(isTopLayer(board)).toBe(false);
  });

  it("a layer closing out of order leaves the one above it on top", () => {
    const board = open();
    const detail = open();
    popLayer(board);                       // the board gave up while something was over it
    expect(isTopLayer(detail)).toBe(true);
    popLayer(detail);
    expect(isTopLayer(board)).toBe(false);
    expect(isTopLayer(detail)).toBe(false);
  });

  it("reopening a layer takes the top again, id or no id", () => {
    const first = open();
    popLayer(first);
    const again = open();
    expect(isTopLayer(again)).toBe(true);
    expect(isTopLayer(first)).toBe(false);
  });
});
