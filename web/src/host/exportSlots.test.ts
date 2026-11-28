import { describe, expect, it } from "vitest";
import { reduceSlot, settleSlots, type SlotDraw } from "../core/slotDraw";

describe("export slot resolution", () => {
  it("keeps the ordered slots provisional until every child is ready or skipped", () => {
    let slots: SlotDraw<string>[] = [
      { state: "loading" },
      { state: "loading" },
      { state: "ready", value: "third table" },
    ];
    expect(settleSlots(slots)).toBeNull();

    slots = reduceSlot(slots, 0, "first table");
    expect(settleSlots(slots)).toBeNull();

    slots = reduceSlot(slots, 1, null);
    expect(settleSlots(slots)).toEqual(["first table", null, "third table"]);
  });
});
