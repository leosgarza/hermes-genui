import { describe, expect, it } from "vitest";
import { pickedMessage, rowMatches } from "./pick";

describe("rowMatches", () => {
  it("shows every row on an empty or blank-only query", () => {
    expect(rowMatches(["Pixel 10a", "₹44,999"], "")).toBe(true);
    expect(rowMatches(["Pixel 10a"], "   ")).toBe(true);
  });
  it("finds a word in any cell, whatever its case", () => {
    const row = ["Pixel 10a", "₹44,999", "Great camera"];
    expect(rowMatches(row, "pixel")).toBe(true);
    expect(rowMatches(row, "10A")).toBe(true);
    expect(rowMatches(row, "44,999")).toBe(true);
    expect(rowMatches(row, "camera")).toBe(true);
    expect(rowMatches(row, "galaxy")).toBe(false);
  });
});

describe("pickedMessage", () => {
  const columns = ["Phone", "Price", "Camera"];
  const rows = [
    ["Pixel 10a", "₹44,999", "Great"],
    ["Nothing 4", "₹39,999", "OK"],
    ["Galaxy A56", "₹42,999", "Fine"],
  ];

  it("sends the caption, the column names and the chosen rows in order", () => {
    expect(pickedMessage("Phones under ₹50k", columns, rows, [2, 0])).toBe(
      "Phones under ₹50k:\nPhone | Price | Camera\nPixel 10a | ₹44,999 | Great\nGalaxy A56 | ₹42,999 | Fine",
    );
  });
  it("says where the rows come from when there is no caption", () => {
    expect(pickedMessage(undefined, columns, rows, [1])).toBe(
      "Table:\nPhone | Price | Camera\nNothing 4 | ₹39,999 | OK",
    );
  });
});
