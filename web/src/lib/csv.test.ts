// CSV is the table block's own data told the way every spreadsheet reads it (RFC 4180): CRLF between records,
// and a cell quoted exactly when it cannot travel plain — when it holds a comma, a double quote, or a line break —
// with each inner quote doubled. The reader's view (filter box, sort order, ticks) is state on the page; the export
// is the stored table: headers first, then every row in the order it was saved.
import { describe, expect, it } from "vitest";
import { csvCell, csvOf } from "./csv";

/** A reader for the round-trip, exactly as RFC 4180 says: bare or quoted cells, doubled quotes, records
 *  ended by CRLF (or a bare LF or CR, which real files carry too). Lives here, not in the shipped module:
 *  the export writes, and only the test needs to read. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      let value = "";
      for (i++; i < text.length; i++) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { value += '"'; i++; } else break;
        } else value += text[i];
      }
      i++;  // the closing quote
      row.push(value);
    } else {
      let j = i;
      while (j < text.length && text[j] !== "," && text[j] !== "\r" && text[j] !== "\n") j++;
      row.push(text.slice(i, j));
      i = j;
    }
    if (i < text.length && text[i] === ",") { i++; if (i === text.length) row.push(""); continue; }
    if (text[i] === "\r") i += text[i + 1] === "\n" ? 2 : 1;
    else if (text[i] === "\n") i += 1;
    rows.push(row);
    row = [];
  }
  if (i === text.length && row.length > 0 && !/[\r\n]$/.test(text)) rows.push(row);
  return rows;
}

describe("csvCell", () => {
  it("leaves plain words bare", () => {
    expect(csvCell("Pixel")).toBe("Pixel");
    expect(csvCell("")).toBe("");
  });
  it("quotes the cells that cannot travel bare", () => {
    expect(csvCell("₹42,999")).toBe('"₹42,999"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("two\r\nlines")).toBe('"two\r\nlines"');
  });
  it("keeps literal table text from becoming spreadsheet formulas (CWE-1236, raised on #75)", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1+contact()")).toBe("'+1+contact()");
    expect(csvCell("@SUM(1,2)")).toBe("\"'@SUM(1,2)\"");   // trigger AND a comma: neutralized, then quoted
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("\tx")).toBe("'\tx");                     // a tab lead is a trigger; a tab is no delimiter
    expect(csvCell("\rx")).toBe("\"'\rx\"");                  // a CR cannot travel bare, so it quotes too
    expect(csvCell('=HYPERLINK("x")')).toBe("\"'=HYPERLINK(\"\"x\"\")\"");  // apostrophe first, RFC quoting after
  });
  it("neutralizes signed numeric strings too — the agreed rule takes EVERY leading trigger (raised on #75)", () => {
    expect(csvCell("-42")).toBe("'-42");
    expect(csvCell("+7.5")).toBe("'+7.5");
    expect(csvCell("-0.001")).toBe("'-0.001");
    expect(csvCell("-1e9")).toBe("'-1e9");
    expect(csvCell("3e8")).toBe("3e8");   // no trigger lead: a digit-first word travels exactly as stored
    expect(csvCell("42")).toBe("42");
  });
  it("a neutralized cell with delimiters still quotes whole", () => {
    expect(csvCell("=a,b")).toBe('"\'=a,b"');
  });
});

describe("csvOf", () => {
  it("writes headers first, then every row, one record per line with CRLF", () => {
    expect(csvOf(["Phone", "Price"], [["Pixel", "₹44,999"], ["Galaxy", "₹42,999"]])).toBe(
      "Phone,Price\r\nPixel,\"₹44,999\"\r\nGalaxy,\"₹42,999\"\r\n",
    );
  });
  it("signed numeric strings travel neutralized in headers AND in data, byte for byte", () => {
    // The agreed safety rule makes no exception for a word that merely LOOKS like a number: a header "-42"
    // and a data "+7.5" arrive apostrophe-first exactly like a formula word; 42 and 3e8 lead with digits
    // and travel as stored. A neutralized trigger that also holds a comma quotes after the prefix.
    expect(csvOf(["-42", "Balance"], [["+7.5", "-0.001"], ["42", "@SUM(1,2)"]])).toBe(
      "'-42,Balance\r\n'+7.5,'-0.001\r\n42,\"'@SUM(1,2)\"\r\n",
    );
  });
  it("keeps empty cells as empty fields, never as nothing", () => {
    expect(csvOf(["A", "B", "C"], [["x", "", "z"]])).toBe("A,B,C\r\nx,,z\r\n");
  });
  it("survives the nastiest words: quotes, commas, newlines and unicode, in every position", () => {
    const rows = [['He said "ok, sure"', "a\r\nb", "— dash ₹ —"]];
    expect(parseCsv(csvOf(["q", "n", "u"], rows))).toEqual([["q", "n", "u"], ...rows]);
  });
});

describe("round trips", () => {
  it("a table written out reads back as the same table, cell for cell", () => {
    const columns = ["Plan", "Cost", "Notes"];
    const rows = [
      ["Kyoto", "₹120,000", 'includes "three" hotels, two trains'],
      ["Osaka", "", "day\ntrip to Nara"],
      ["Nara", "free", "deer\r\n"],
    ];
    expect(parseCsv(csvOf(columns, rows))).toEqual([columns, ...rows]);
  });
});
