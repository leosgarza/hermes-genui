// CSV: the table block's own data, told the way every spreadsheet reads it (RFC 4180). A cell is quoted exactly
// when it cannot travel bare — it holds a comma, a double quote or a line break — and a doubled "" keeps every
// quote inside. Records end CRLF, including the last, as the spec says. No dependency, no parsing: a writer.
// And a writer that refuses to hand the reader a surprise: a cell whose TEXT leads with a character a
// spreadsheet takes as the start of a formula (= + - @, or a tab/CR) carries the board's words, not the
// reader's intent — left bare, opening the file in formula-evaluating settings can EXECUTE them (CWE-1236).
// Such a cell is neutralized with the leading apostrophe the major readers consume as "this is text".
// The rule takes EVERY leading trigger, with no numeric exception: a stored "-42" is still a word that
// leads the way formulas lead, and the agreed rule (raised on #75) neutralizes it like any other text.
/** One cell, quoted only where bare text could not hold it together, apostrophe-first wherever a leading
 *  trigger character could make bare text read as a formula. */
export function csvCell(value: string): string {
  const safe = isRiskText(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Text a spreadsheet could mistake for a formula: any cell leading with a trigger character. */
function isRiskText(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value);
}

/** A whole table: headers first, then every row in the order it was stored, one CRLF-terminated record each. */
export function csvOf(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((line) => line.map(csvCell).join(",") + "\r\n").join("");
}
