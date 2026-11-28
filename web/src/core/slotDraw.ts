export type SlotState = "loading" | "ready" | "skipped";
export type SlotDraw<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "skipped" };

export type SlotStatusOrigin = "test" | "renderer";
type Status = { state: SlotState; origin: SlotStatusOrigin };
const statuses = new WeakMap<Element, Status>();

/** Keep draw state beside the DOM without changing the board markup the reader sees. */
export function setSlotStatus(element: Element, state: SlotState, origin: SlotStatusOrigin = "test"): void {
  statuses.set(element, { state, origin });
}

export function getSlotStatus(element: Element): Status | undefined {
  return statuses.get(element);
}

/** Resolve one child's draw without changing the order of its siblings. */
export function reduceSlot<T>(slots: SlotDraw<T>[], index: number, value: T | null): SlotDraw<T>[] {
  if (index < 0 || index >= slots.length) return slots;
  return slots.map((slot, at) => at !== index ? slot
    : value === null ? { state: "skipped" } : { state: "ready", value });
}

/** The positional list is final only after every child has settled; skipped children remain null slots. */
export function settleSlots<T>(slots: SlotDraw<T>[]): (T | null)[] | null {
  if (slots.some((slot) => slot.state === "loading")) return null;
  return slots.map((slot) => slot.state === "ready" ? slot.value : null);
}
