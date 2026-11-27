/// <reference types="vite/client" />
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetBoards } from "../checklist/savedState";
import { drawWithActions as draw, withStyles } from "../../core/testing";
import tilesCss from "./tiles.css?raw";

afterEach(cleanup);
beforeEach(() => forgetBoards());

describe("tiles", () => {
  const tiles = { type: "tiles", items: [
    { title: "Arashiyama", subtitle: "Bamboo grove", icon: "leaf", image: "https://x.example/a.jpg", ask: "Add Arashiyama" },
    { title: "Gion", run: "Add a Gion walk" }] };

  it("fills the composer with ask, sends run", () => {
    const { fill, send } = draw([tiles]);
    fireEvent.click(screen.getByRole("button", { name: /Arashiyama/ }));
    fireEvent.click(screen.getByRole("button", { name: /Gion/ }));
    expect(fill).toHaveBeenCalledWith("Add Arashiyama");
    expect(send).toHaveBeenCalledWith("Add a Gion walk");
    expect(screen.getByText("Bamboo grove")).toBeTruthy();
  });

  it("renders informational tiles as noninteractive gradient cards", () => {
    const { container, fill, send } = draw([{
      type: "tiles",
      items: [
        { title: "Scenic drive", subtitle: "Hudson Valley views" },
        { title: "Village stroll", subtitle: "Browse local shops" },
      ],
    }]);

    const cards = container.querySelectorAll(".hb-tile");
    expect(cards).toHaveLength(2);
    expect(cards[0].tagName).toBe("DIV");
    expect(cards[1].tagName).toBe("DIV");
    expect(cards[0].getAttribute("style")).toContain("linear-gradient");
    expect(screen.queryByRole("button")).toBeNull();
    expect(fill).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("draws a photo without a referrer, and hides it when it fails to load", () => {
    const { container } = draw([tiles]);
    const img = container.querySelector(".hb-tile img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://x.example/a.jpg");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    fireEvent.error(img);
    expect(container.querySelector(".hb-tile img")).toBeNull();
  });

  // Regression: a decision card's reason (its subtitle) had to be read by HOVERING — the reader cut it at 80
  // characters, the CSS clamped it to two low-contrast lines, and the wording was complete only in the native
  // `title` tooltip. The whole reason must be visible and legible without any hover.
  describe("reads in full without hovering", () => {
    // A 1–2 sentence decision reason: longer than the old 80-char cap, inside the new one.
    const reason =
      "Take the 08:12 local to Omiya and the Keihin-Tohoku line direct to Tokyo Station — about 85 minutes, and it skips the shinkansen fare.";

    it("shows the whole reason, not a cut-off teaser", () => {
      expect(reason.length).toBeGreaterThan(80);
      draw([{ type: "tiles", items: [{ title: "Local train", subtitle: reason, run: "Book the 08:12 local" }] }]);
      expect(screen.getByText(reason)).toBeTruthy();
    });

    // Review regression: an 180-character cap still cut real reasons — a single 206-character sentence and a
    // 244-character two-sentence reason each lost their ending on the card itself. Neither may be shortened here:
    // whatever the reader hands the renderer must paint whole, with no ellipsis and nothing held for the hover.
    const longOneSentence =
      "Compare all four hotels side by side before booking: the riverside one is 12k a night but a twenty-minute walk to the office, the Grand is loudest but cheapest, and only the corner suites get morning light.";
    const twoSentences =
      "Take the 08:12 local to Omiya and the Keihin-Tohoku line direct to Tokyo Station — about 85 minutes, and it skips the shinkansen fare. Arriving before nine leaves the whole morning free for the east side, which the later trains cannot give you.";

    for (const [name, text] of [["a 206-character single sentence", longOneSentence], ["a longer two-sentence reason", twoSentences]] as const) {
      it(`renders ${name} in full, uncut`, () => {
        const { container } = draw([{ type: "tiles", items: [{ title: "Hotels", subtitle: text, run: "Compare hotels" }] }]);
        const sub = container.querySelector(".hb-tile-subtitle")!;
        expect(sub.textContent).toBe(text);              // every word of it is on the card
        expect(sub.textContent!.endsWith("…")).toBe(false);  // nothing cut away
      });
    }

    it("keeps hover a supplement: the tap message still rides in the native title", () => {
      draw([{ type: "tiles", items: [{ title: "Local train", subtitle: reason, run: "Book the 08:12 local" }] }]);
      expect(screen.getByRole("button", { name: /Local train/ }).getAttribute("title")).toBe("Book the 08:12 local");
    });

    it("draws the subtitle in full white, with a shadow, never line-clamped, and lets the card grow to fit it", () => {
      const { container } = draw([{ type: "tiles", items: [{ title: "Local train", subtitle: reason, run: "Book the 08:12 local" }] }]);
      const unstyle = withStyles(tilesCss);
      try {
        const sub = getComputedStyle(container.querySelector(".hb-tile-subtitle")!);
        expect(sub.color).toBe("rgb(255, 255, 255)");
        expect(sub.textShadow).toMatch(/rgba\(12, ?8, ?24/);
        expect(sub.webkitLineClamp, "the reason must not be clamped away").toBeFalsy();
        const card = getComputedStyle(container.querySelector(".hb-tile")!);
        const text = getComputedStyle(container.querySelector(".hb-tile-text")!);
        expect(text.position, "in flow but positioned: the reason must paint above the scrim").toBe("relative");
        expect(card.minHeight, "short cards keep the old cover height").toBe("158px");
        expect(getComputedStyle(container.querySelector(".hb-tile-shade")!).background).toMatch(/rgba\(12, ?8, ?24, ?0\.8/);
      } finally {
        unstyle();
      }
    });
  });
});
