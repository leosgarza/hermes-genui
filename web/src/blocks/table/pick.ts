// The words behind an interactive table: what a query keeps, and what a pick sends to the chat.
// A row shows when the search reads a word in any of its cells; the picked message carries the column names
// once, so the chat knows what each value means:
//   pickedMessage("Phones under ₹50k", ["Phone", "Price"], [["Pixel 10a", "₹44,999"]], [0])
//   → "Phones under ₹50k:\nPhone | Price\nPixel 10a | ₹44,999"

/** True when the row carries the query somewhere, whatever the case; a blank query keeps every row. */
export function rowMatches(row: string[], query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  return row.some((cell) => cell.toLowerCase().includes(wanted));
}

/** The message a tap sends: where the rows came from, the column names, then each picked row in order. */
export function pickedMessage(
  caption: string | undefined,
  columns: string[],
  rows: string[][],
  picked: number[],
): string {
  const line = (cells: string[]) => cells.join(" | ");
  const order = [...picked].sort((a, b) => a - b);
  return [`${caption ? `${caption}:` : "Table:"}`, line(columns), ...order.map((r) => line(rows[r]))].join("\n");
}
