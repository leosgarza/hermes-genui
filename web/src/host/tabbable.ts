// The controls a real Tab press can reach inside an open layer, in tab order — the rule the expanded board
// dialog (host/BlockTag.tsx) proved, shared now with the Library (host/LibraryChrome.tsx): the focusable set
// minus the controls that are not actually stops: anything disabled (own .disabled or a disabled fieldset —
// Steps and Layers end on a spent Next, and a form's Send sits behind its fieldset once sent), anything
// asking not to be (negative tabindex, hidden inputs), anything not shown. The layout half of that read
// (rects, visibility) only counts where layout is real; jsdom reports a zero rect for every element, so
// there the attribute shape governs and Chrome measures the rest (tests/test_expand_fullscreen.py,
// tests/test_library_chrome.py). Recomputed per keypress: the DOM can change while a dialog is open.
import { isTopLayer } from "../core/overlays";

export function tabbableIn(root: HTMLElement): HTMLElement[] {
  const laidOut = root.getClientRects().length > 0;
  return [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(
    (el) =>
      el.tabIndex >= 0 &&
      el.getAttribute("type") !== "hidden" &&
      (el as HTMLButtonElement).disabled !== true &&
      !el.closest("fieldset[disabled]") &&
      !el.closest("[hidden]") &&
      (!laidOut || (el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible")),
  );
}

/** The keypress rules one window-owned dialog needs: Tab steps only through the dialog's own eligible
 *  controls (and never lets the event out while the dialog holds the keys), Escape answers the topmost
 *  layer of the shared overlay stack alone. `onEscape` runs when this layer owns the key. */
export function dialogKeys(
  root: HTMLElement,
  layer: number,
  onEscape: () => void,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!isTopLayer(layer)) return;
      e.stopImmediatePropagation();  // one keypress steps down exactly one layer
      onEscape();
      return;
    }
    if (e.key !== "Tab") return;
    if (!isTopLayer(layer)) return;  // the focus trap belongs to the topmost dialog alone
    const items = tabbableIn(root);
    if (!items.length) return;
    e.preventDefault();  // the dialog owns the keyboard: Tab steps only through its own eligible controls
    const active = document.activeElement as HTMLElement | null;
    const at = active === null ? -1 : items.indexOf(active);
    const step = e.shiftKey ? -1 : 1;
    const next = at === -1 ? (e.shiftKey ? items.length - 1 : 0) : (at + step + items.length) % items.length;
    items[next].focus();
  };
}
