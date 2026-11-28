// Slot-keeping for the three lists that have no cell wrappers: the board's top level, section bodies and
// tab panels. Grid/row/column lists already keep slots — the cell div in layout/Containers.tsx is present
// whether or not its child draws anything — so pairing there is index-honest by construction. A block that
// draws nothing (an empty source line, an image strip whose photos all failed) in one of the three bare
// lists used to vanish from the DOM, shifting every later pairing: table B's export button exported table
// A's CSV (CodeRabbit on #75, the maintainer's merge gate). The fix is the SAME mechanism the cells already
// use: wrap each child in one identity-keyed slot div per child, `display: contents` so the slot itself
// generates NO box and the block participates in the parent's layout exactly as if it sat there directly.
// The slot stays in the DOM even when the child draws nothing, so index = slot, nulls kept. Cell children
// are deliberately NOT wrapped a second time: the cells are already the slots, and a wrapper inside a cell
// would re-target every `.hb-*-cell > *` rule onto the boxless slot and break equal heights (layout.css) —
// the geometry parity in tests/test_export_chrome.py pins that this DOM adds no layout anywhere.
import { isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";
import { setSlotStatus } from "./slotDraw";

/** A slot shares the drawn child's identity key, exactly like a cell: on a living board's update that
 *  inserts or reorders, each retained child — and every typed draft, dragged slider and clicked state
 *  mounted inside it — travels to its new place on the SAME element. */
function slotKey(child: ReactNode, i: number): string {
  const k = isValidElement(child) ? child.key : null;
  return `s:${k ?? i}`;
}

/** One child's slot. It publishes its draw state beside the DOM (ready when a child drew, skipped when it
 *  never did) so the export scan can refuse to pair until every sibling has settled. */
export function DrawSlot({ child }: { child: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Publish on mount, and re-publish on any childList change: the draw (or its absence) IS the DOM of this
  // slot. Deliberately NOT keyed on `child` — a parent re-render brings a fresh element for the SAME DOM, and
  // republishing then would clobber the settled state (and a test-injected `loading`) with a redundant echo.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const publish = () => setSlotStatus(node, node.firstElementChild ? "ready" : "skipped", "renderer");
    publish();
    const observer = new MutationObserver(publish);
    observer.observe(node, { childList: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="hb-slot" style={{ display: "contents" }}>
      {child}
    </div>
  );
}

/** Wrap every child of a slotless list — top level, a section body, a tab panel — in its slot. */
export function slotList(nodes: ReactNode): ReactNode[] {
  const items = Array.isArray(nodes) ? nodes : [nodes];
  return items.map((child, i) => <DrawSlot key={slotKey(child, i)} child={child} />);
}
