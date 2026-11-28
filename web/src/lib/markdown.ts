// A board as readable Markdown, host-side: the faithful twin of hooks/text_fallback.py and the text_<type>
// renderers it walks (blocks/*.py), down to every cap, escape, rounding and skipped block. The chat fallback and a
// board FILE must say the same words about the same blocks — so this is not an inspiration, it is a port, and
// tests/hooks/test_export_markdown_corpus.py + markdown.test.ts pin it: a corpus of boards (every type, nested
// containers, flow-referencing steps, quirk and edge fields) is serialized by the REAL Python serializer and by
// this one, and both are held against the same golden bytes.
//
// The one deliberate difference, and it is the export's whole reason: no LIMIT. The chat fits one message and cuts
// between blocks with a note; a file is not a message — an export that silently drops blocks is a different board
// than the one drawn. blocksAsMarkdown is text_fallback.blocks_as_text(blocks, limit=None).
//
// Reads RAW stored blocks (the envelope's own JSON), exactly what store.blocks_of hands the Python serializer —
// never the reader-normalized blocks — so the two sides always look at the same words.
import { evaluate, parseFormula, type Node } from "./formula";

// text_fallback.py's constants.
const MAX_DEPTH = 6;

// common.py: caps and marks.
const MAX_STRING = 300;
const MAX_URL = 500;
const MAX_CELL = 80;

// C0/C1 control characters (but newline and tab), zero-width marks and bidi overrides — the same class Python
// strips. Written as escapes so this file holds no invisible characters.
const CONTROL = new RegExp("[\\x00-\\x08\\x0b-\\x1f\\x7f-\\x9f\\u200b\\u200c\\u200e\\u200f" +
  "\\u202a-\\u202e\\u2060-\\u2064\\u2066-\\u2069\\ufeff]", "g");
const CONTROL_TEST = new RegExp(CONTROL.source);

// blocks/layout.py
const LAYOUT_TYPES = ["row", "section", "grid", "columns", "tabs"];

/** common.is_number: a real number (never a bool — JS booleans are not "number" to begin with). */
export function isNum(v: unknown): v is number {
  return typeof v === "number";
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isDict(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isList(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** common.first_list: the first of several fields that is a list, else []. */
function firstList(block: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const k of keys) if (isList(block[k])) return block[k];
  return [];
}

/** common.first_of: the first of several fields that gives safe text. */
function firstOf(block: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const t = safeText(block[k]);
    if (t) return t;
  }
  return "";
}

/** Python's `a or b` on two block fields: the second answers when the first is falsy THE PYTHON WAY — and in
 *  Python that includes {} and []. JS would take a truthy empty object; this is what .get() or .get() means. */
function orField(block: Record<string, unknown>, first: string, second: string): unknown {
  const v = block[first];
  if (isPyFalsy(v)) return block[second];
  return v;
}

function isPyFalsy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === "" || v === 0 || (typeof v === "number" && Number.isNaN(v))) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isDict(v)) return Object.keys(v).length === 0;
  return false;
}

/** Python's `block.get(key, default)`: the default answers only when the KEY IS ABSENT — a stored null is the
 *  block's own word (and null then fails the number check downstream), not a missing one. */
function pick(block: Record<string, unknown>, key: string, dflt: unknown): unknown {
  return key in block ? block[key] : dflt;
}

/**
 * common.fmt_num — a number as people read it, to the digit and the comma:
 * 72275 → "72,275"; 18.6 → "18.6"; 7200.0 → "7,200"; 1234.5678 → "1,234.57"; 0.004567 → "0.00457".
 * Python rounds decimals half-to-even on the exact binary value; roundHalfEven reproduces that, and the corpus
 * pins it (0.125 → "0.12", 2.675 → "2.67", 7.5 → "8"). JS numbers lose integer precision past 2^53 where
 * Python ints do not — a stored board cannot carry bigger JSON numbers than that through the same parse anyway.
 */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return groupInt(v);
  if (Math.abs(v) >= 1) return fixed2(v);
  return g3(v);
}

/** f"{v:,.2f}" then the zero/dot strip Python does: 1234.5678 → "1,234.57"; 1000.00… → "1,000"; -0.001 → "-0". */
function fixed2(v: number): string {
  const s = roundHalfEven(v, 2).toFixed(2);
  const [intPart, fracPart] = s.split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  let frac = fracPart;
  while (frac.endsWith("0")) frac = frac.slice(0, -1);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${frac ? `.${frac}` : ""}`;
}

/** f"{v:.3g}" for |v| < 1 — three significant digits, half-to-even, trailing zeros gone, exponent form only
 *  when the decimal exponent leaves [-4, 3) (so 0.0001 stays "0.0001" but 1e-05 is "1e-05"), and the exponent
 *  carries Python's two digits. */
function g3(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  let e = Math.floor(Math.log10(a));
  let m = a / 10 ** e;  // [1, 10), within rounding fuzz
  if (m >= 10) { m /= 10; e += 1; } else if (m < 1) { m *= 10; e -= 1; }
  let rm = roundHalfEven(m, 2);  // three significant digits on the mantissa
  if (rm >= 10) { rm /= 10; e += 1; }
  const digits = String(rm).replace(".", "").replace(/0+$/, "") || "0";
  if (e < -4) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${mant}e-${String(-e).padStart(2, "0")}`;
  }
  if (e < 0) return `${sign}0.${"0".repeat(-e - 1)}${digits}`;
  return `${sign}${digits}${"0".repeat(e)}`;
}

/** f"{v:,}" for an integer value. */
function groupInt(v: number): string {
  const sign = v < 0 ? "-" : "";
  const digits = String(Math.abs(Math.trunc(v)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Python's round(x, digits): half-to-even on the EXACT decimal value of the double — 2.675 is really
 *  2.67499998… so it rounds to 2.67, while 12.5 (a dyadic exact half) goes to the even 12. Multiplying by a power
 *  of ten would turn non-halves into false halves, so this examines the double's exact rational M·2^E instead:
 *  numerator and denominator (a power of two) as BigInts, remainder against half — every tie is real. */
export function roundHalfEven(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  if (digits < 0) {  // never asked for by the text side; keep it honest anyway
    const shifted = roundHalfEven(x / 10 ** -digits, 0);
    return shifted * 10 ** -digits;
  }
  if (Number.isInteger(x)) return x;  // already whole at 10^0, and a non-integer's scaled form keeps its exactness
  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = Math.abs(x);
  const bits = new DataView(buf).getBigUint64(0, true);  // little-endian, as Float64Array wrote it
  let m = Number(bits & (2n ** 52n - 1n));
  let e = ((Number(bits >> 52n) & 0x7ff) - 1075);
  if (bits >> 52n === 0n) e = -50; else m += 2 ** 52;  // |x| = m · 2^e, exactly
  // A non-integer is always e < 0.  |x|·10^digits = m·10^digits / 2^-e, remainder against half of 2^-e.
  const num = BigInt(m) * 10n ** BigInt(digits);
  const den = 1n << BigInt(-e);
  const floor = num / den;
  const rem = num % den;
  const half = den >> 1n;
  const up = rem > half || (rem === half && floor % 2n !== 0n);
  const n = up ? floor + 1n : floor;
  const v = Number(n) / 10 ** digits;
  return x < 0 ? -v : v;
}

const MARKDOWN_MARKS = /([\\\[\]<>])/g;

/** common.md_escape */
export function mdEscape(text: string): string {
  return text.replace(MARKDOWN_MARKS, "\\$1");
}

/** common.safe_text */
export function safeText(value: unknown, limit: number = MAX_STRING, inline: boolean = true): string {
  if (isNum(value)) return fmtNum(value);
  if (!isStr(value)) return "";
  let text = value.replace(CONTROL, "").replaceAll("\t", " ");
  if (inline) text = text.replaceAll("\n", " ");
  text = text.trim();
  return mdEscape(text.length <= limit ? text : `${text.slice(0, limit - 1)}…`);
}

/** common.safe_url */
export function safeUrl(value: unknown, httpsOnly: boolean = false): string {
  if (!isStr(value)) return "";
  let url = value.replace(CONTROL, "").trim();
  if (url.length > MAX_URL) return "";
  const lower = url.toLowerCase();
  if (!(httpsOnly ? lower.startsWith("https://") : lower.startsWith("https://") || lower.startsWith("http://"))) return "";
  for (const [raw, safe] of [[" ", "%20"], ["(", "%28"], [")", "%29"], ["<", "%3C"], [">", "%3E"], ["\n", ""]] as const) {
    url = url.split(raw).join(safe);
  }
  return url;
}

/** common.md_link */
function mdLink(text: string, url: string): string {
  return url ? `[${text}](${url})` : text;
}

/** common.with_unit — a % sits tight. */
function withUnit(value: string, unit: string): string {
  if (!unit) return value;
  return unit === "%" ? `${value}${unit}` : `${value} ${unit}`;
}

/** common.change_chip */
function changeChip(change: unknown, unit: unknown = "%"): string {
  if (!isNum(change)) return "";
  const arrow = change < 0 ? "▼" : "▲";
  return `(${arrow} ${fmtNum(Math.abs(change))}${safeText(unit, 8) || "%"})`;
}

// kpis.py: a figure's chip is the CARD's print, not the chart's — one decimal always, an arrow only when it
// moved, "pt" spaced off its number, and the number worked out from `previous` when the block gives one.
const MAX_CHIP = 1e15;

/** kpis._tenths — one decimal, half away from zero on the stored double (toFixed rounds exactly that way). */
function tenths(v: number): string {
  return v.toFixed(1);
}

/** kpis._written_unit: the change unit the figure asks for, or the one its kind defaults to. */
function writtenUnit(item: Record<string, unknown>, fallback: string): string {
  const unit = item.change_unit;
  return unit === "%" || unit === "pt" ? unit : fallback;
}

/** kpis._chip_number: a change a chip can print, else none. */
function chipNumber(v: unknown, unit: string): [number, string] | null {
  return isNum(v) && Number.isFinite(v) && Math.abs(v) < MAX_CHIP ? [v, unit] : null;
}

/** kpis._change: `previous` wins over a written change; points on a "%" figure, a share elsewhere; a zero base
 *  or an unusable side has no answer from which to draw a chip. */
function figureChange(item: Record<string, unknown>): [number, string] | null {
  if ("previous" in item) {
    const unit = writtenUnit(item, item.unit === "%" ? "pt" : "%");
    const before = item.previous, value = item.value;
    if (!isNum(before) || !Number.isFinite(before) || !isNum(value) || !Number.isFinite(value)) return null;
    if (unit === "pt") return chipNumber(value - before, "pt");
    return before === 0 ? null : chipNumber(((value - before) / Math.abs(before)) * 100, "%");
  }
  return chipNumber(item.change, writtenUnit(item, "%"));
}

/** kpis._chip */
function figureChip(item: Record<string, unknown>): string {
  const found = figureChange(item);
  if (!found) return "";
  const [change, unit] = found;
  const arrow = change < 0 ? "▼ " : change > 0 ? "▲ " : "";
  return `(${arrow}${tenths(Math.abs(change))}${unit === "pt" ? " " : ""}${unit})`;
}

/** common.out_of */
function outOf(label: string, value: unknown, goal: unknown, unit: unknown): string {
  if (!label || !isNum(value) || !isNum(goal)) return "";
  return `${label}: ${fmtNum(value)} / ${withUnit(fmtNum(goal), safeText(unit, 20))}`;
}

/** common.table_cell */
function tableCell(value: unknown): string {
  return safeText(value, MAX_CELL).replaceAll("|", "\\|");
}

/** common.md_table — every row padded to the header's width. */
function mdTable(header: string[], rows: string[][]): string[] {
  const width = header.length;
  const lines = ["| " + header.join(" | ") + " |", "| " + Array(width).fill("---").join(" | ") + " |"];
  for (const row of rows) {
    lines.push("| " + [...row, ...Array(Math.max(0, width - row.length)).fill("")].slice(0, width).join(" | ") + " |");
  }
  return lines;
}

// --- the tree walk (text_fallback._flow_labels / _pieces / _fit) ----------------------------------------------

/** check.child_lists, on raw dicts: a container's children, or each tab's children. */
function childLists(block: unknown): unknown[][] {
  if (!isDict(block)) return [];
  if (isList(block.children)) return [block.children];
  if (block.type !== "tabs" || !isList(block.tabs)) return [];
  const out: unknown[][] = [];
  for (const tab of block.tabs) {
    if (isDict(tab) && isList(tab.children)) out.push(tab.children);
  }
  return out;
}

/** text_fallback._flow_labels: each flow's node labels by flow id, from anywhere (containers and tabs too). */
function flowLabels(blocks: unknown[], depth: number = 0): Record<string, Record<string, string>> {
  let found: Record<string, Record<string, string>> = {};
  if (depth > MAX_DEPTH) return found;
  for (const block of blocks) {
    if (!isDict(block)) continue;
    if (block.type === "flow" && isStr(block.id) && isList(block.nodes)) {
      const nodes = block.nodes.filter(isDict);
      const map: Record<string, string> = {};
      for (const n of nodes) if (isStr(n.id) && isStr(n.label)) map[n.id] = n.label;
      found[block.id] = map;
    }
    for (const children of childLists(block)) {
      const deeper = flowLabels(children, depth + 1);
      found = { ...deeper, ...found };  // the same precedence the Python walk gives: what is nearer wins
    }
  }
  return found;
}

// --- one block as text (text_fallback._render and every text_<type>) ------------------------------------------

type Labels = Record<string, Record<string, string>>;

const F = (v: unknown): Record<string, unknown> => (isDict(v) ? v : {});

// atoms.py: heading and text need text; image fields, in the drawing's own order.
const IMAGE_URL_FIELDS = ["url", "src", "image"];

function textHeading(block: Record<string, unknown>): string {
  const text = safeText(block.text);
  return text ? `**${text}**` : "";
}

function textText(block: Record<string, unknown>): string {
  return safeText(block.text, MAX_STRING, false);
}

function textDivider(): string {
  return "---";
}

function textBadge(block: Record<string, unknown>): string {
  const text = firstOf(block, "text", "label");
  return text ? `[${text}]` : "";
}

function textLink(block: Record<string, unknown>): string {
  const text = firstOf(block, "text", "label");
  const url = safeUrl(orField(block, "url", "href"), true);
  return mdLink(text || mdEscape(url), url);
}

function textImage(block: Record<string, unknown>): string {
  let url = "";
  for (const k of IMAGE_URL_FIELDS) {
    url = safeUrl(block[k]);
    if (url) break;
  }
  const caption = firstOf(block, "caption", "alt", "title");
  if (!url) return caption;
  return `![${caption || "image"}](${url})`;
}

function textBar(block: Record<string, unknown>): string {
  return outOf(firstOf(block, "label", "title"), block.value, pick(block, "max", 100), block.unit);
}

// callout.py
function textCallout(block: Record<string, unknown>): string {
  const title = safeText(block.title);
  const text = safeText(block.text, MAX_STRING, false);
  const lines = (title ? [`**${title}**`] : []).concat(text.split("\n").filter((l) => l.trim()));
  return lines.map((l) => `> ${l}`).join("\n");
}

// source.py
function textSource(block: Record<string, unknown>): string {
  const text = safeText(block.text);
  return text ? `_Source: ${mdLink(text, safeUrl(block.url))}_` : "";
}

// table.py
const MAX_TABLE_ROWS = 12;

function textTable(block: Record<string, unknown>): string {
  const names = block.columns, rows = block.rows;
  if (!isList(names) || !names.length || !isList(rows) || !rows.length) return "";
  const headerNames = names.slice(0, 8);
  const columns = headerNames.map(tableCell);
  const cells: string[][] = [];
  for (const row of rows.slice(0, MAX_TABLE_ROWS)) {
    if (isDict(row)) {
      cells.push(headerNames.map((name) => (isStr(name) ? tableCell(row[name]) : "")));
    } else if (isList(row)) {
      cells.push(row.map(tableCell));
    }
  }
  const caption = safeText(orField(block, "caption", "title"));
  const lines = (caption ? [`**${caption}**`] : []).concat(mdTable(columns, cells));
  if (rows.length > MAX_TABLE_ROWS) lines.push(`_(${rows.length - MAX_TABLE_ROWS} more rows)_`);
  return lines.join("\n");
}

// list.py
function textListBlock(block: Record<string, unknown>): string {
  const items = firstList(block, "items", "rows");
  const lines: string[] = [];
  for (const item of items.slice(0, 12)) {
    const row = isStr(item) ? { title: item } : item;
    const name = isDict(row) ? firstOf(row, "title", "name", "label", "text") : "";
    if (!name) continue;
    const r = F(row);
    const subtitle = safeText(r.subtitle);
    const value = safeText(r.value, 40);
    const mark = block.ranked ? `${lines.length + 1}.` : "-";
    lines.push(`${mark} ${name}${subtitle ? ` — ${subtitle}` : ""}${value ? ` · ${value}` : ""}`);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}

// checklist.py
function textChecklist(block: Record<string, unknown>): string {
  const items = isList(block.items) ? block.items : [];
  const lines: string[] = [];
  for (const item of items.slice(0, 40)) {
    const text = safeText(isDict(item) ? item.text : item);
    if (text) lines.push(`- [ ] ${text}`);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}

// tiles.py
function textTiles(block: Record<string, unknown>): string {
  const items = isList(block.items) ? block.items : [];
  const lines: string[] = [];
  for (const item of items.slice(0, 8)) {
    const t = isDict(item) ? safeText(item.title) : "";
    const subtitle = t ? safeText(F(item).subtitle) : "";
    if (t) lines.push(subtitle ? `- ${t}: ${subtitle}` : `- ${t}`);
  }
  return lines.join("\n");
}

// streak.py
function textStreak(block: Record<string, unknown>): string {
  const count = block.count;
  if (!isNum(count)) return "";
  const label = safeText(block.label) || "Current streak";
  return `${label}: ${fmtNum(count)} ${safeText(block.unit, 20) || "days"}`;
}

// progress.py
function textProgress(block: Record<string, unknown>): string {
  return outOf(firstOf(block, "title", "label"), block.value, block.goal, block.unit);
}

// kpis.py (_figure serves stat and kpis alike)
function figure(item: Record<string, unknown>): string {
  const label = firstOf(item, "label", "title");
  if (!label) return "";
  const raw = item.value;
  const shown = raw === null || raw === undefined ? "" : safeText(raw);
  const value = shown ? withUnit(shown, safeText(item.unit, 20)) : "no data";
  const line = `${label}: ${value}`;
  const chip = figureChip(item);
  return chip ? `${line} ${chip}` : line;
}

function textStat(block: Record<string, unknown>): string {
  return figure(block);
}

function textKpis(block: Record<string, unknown>): string {
  const items = isList(block.items) ? block.items : [];
  return items.filter(isDict).map(figure).filter(Boolean).join("\n");
}

// chart.py
const CHART_KINDS = ["line", "bar", "area", "stacked", "hbar", "combo", "pie", "donut", "scatter", "histogram"];
const KIND_ALIASES: Record<string, string> = {
  doughnut: "donut", stackedbar: "stacked", horizontalbar: "hbar", barh: "hbar", hist: "histogram",
};

/** chart.chart_kind — the same lenient word the drawing side reads. */
export function chartKind(name: unknown): string {
  if (!isStr(name)) return "line";
  const plain = name.toLowerCase().replace(/[ _-]/g, "");
  return CHART_KINDS.includes(plain) ? plain : (Object.hasOwn(KIND_ALIASES, plain) ? KIND_ALIASES[plain] : "line");
}

function seriesLine(series: Record<string, unknown>, labels: unknown[]): string {
  const raw = dataOf(series);
  const data = raw.filter(isNum);
  if (!data.length) return "";
  const name = safeText(series.name);
  const first = data[0], last = data[data.length - 1];
  let line = `${name} ${fmtNum(first)} → ${fmtNum(last)}`.trim();
  if (first) line += " " + changeChip(roundHalfEven(((last - first) / Math.abs(first)) * 100, 1));
  // Slots holding no value are named: the reader of the text must see the same holes the drawing breaks at.
  const missing: string[] = [];
  for (let i = 0; i < Math.min(labels.length, raw.length); i++) {
    if (raw[i] === null) missing.push(safeText(labels[i], 24));
  }
  if (missing.length) {
    const shown = missing.filter(Boolean).slice(0, 3);
    let named = shown.length ? shown.join(", ") : "unlabelled";
    if (missing.length > shown.length) named += ` and ${missing.length - shown.length} more`;
    line += `, ${missing.length} gap${missing.length === 1 ? "" : "s"} (${named})`;
  }
  return line;
}

function slices(x: unknown[], series: Record<string, unknown>, top = 4): string {
  const data = dataOf(series);
  const parts: [string, number][] = [];
  for (let i = 0; i < Math.min(x.length, data.length); i++) {
    const v = data[i];
    if (isNum(v) && v > 0) parts.push([safeText(x[i]), v]);
  }
  const total = parts.reduce((s, [, v]) => s + v, 0);
  if (!total) return "";
  parts.sort((a, b) => b[1] - a[1]);  // JS sort is stable since ES2019, as Python's is
  const shown = parts.slice(0, top).map(([label, v]) => `${label} ${roundHalfEven((v / total) * 100, 0)}`.trim() + "%");
  if (parts.length > top) shown.push(`+${parts.length - top} more`);
  return shown.join(", ");
}

/** chart._bins_line — a histogram read left to right: the count, then the bins with their counts (8 at most), or
 *  for a long one just where the most fell. A bin with no count is not counted and isn't named. */
function binsLine(x: unknown[], series: Record<string, unknown>): string {
  const data = dataOf(series);
  const pairs: [string, number][] = [];
  for (let i = 0; i < Math.min(x.length, data.length); i++) {
    const v = data[i];
    if (isNum(v) && v >= 0) pairs.push([safeText(x[i]), v]);
  }
  if (!pairs.length) return "";
  const total = pairs.reduce((s, [, v]) => s + v, 0);
  const head = `${fmtNum(total)} counted in ${pairs.length} bin${pairs.length === 1 ? "" : "s"}`;
  if (pairs.length > 8) {
    const [name, most] = pairs.reduce((a, b) => (b[1] > a[1] ? b : a));  // Python's max keeps the FIRST on a tie
    return `${head}, most in ${name} (${fmtNum(most)})`;
  }
  return `${head}: ` + pairs.map(([label, v]) => `${label} ${fmtNum(v)}`.trim()).join(", ");
}

// chart.py: a title that puts one measure against another names a scatter's two axes.
const AGAINST = /^(.+?)\s+(?:against|by|vs\.?)\s+(.+)$/i;
const MAX_LABEL = 40;

/** chart._axis_word */
function axisWord(text: string): string {
  return text.trim().toLowerCase().replace(/[\s:,.?!]+$/, "");
}

/** chart._axis_names — (bottom, side), "x"/"y" when the title names neither. */
function axisNames(title: string): [string, string] {
  const match = AGAINST.exec(title.trim());
  if (!match) return ["x", "y"];
  const across = axisWord(match[2]), up = axisWord(match[1]);
  return across && up ? [across, up] : ["x", "y"];
}

/** chart._count */
function count(n: number): string {
  return `${n} point${n === 1 ? "" : "s"}`;
}

/** chart._drawn_points — a scatter series' points with a number on both scales, in the order written. */
function drawnPoints(series: Record<string, unknown>): Record<string, unknown>[] {
  const points = isList(series.points) ? series.points : [];
  return points.filter((p): p is Record<string, unknown> => isDict(p) && isNum(p.x) && isNum(p.y));
}

/** chart._scatter_line — the highest point, or each group's range when there are several. */
function scatterLine(series: Record<string, unknown>[], title: string): string {
  const [across, up] = axisNames(title);
  const groups = series.slice(0, 2)
    .map((s) => [safeText(s.name, MAX_LABEL), drawnPoints(s)] as const)
    .filter(([, points]) => points.length > 0);
  if (!groups.length) return "";
  if (groups.length > 1) {
    return groups.map(([name, points]) => {
      const xs = points.map((p) => p.x as number);
      return `${name || "Series"} ${count(points.length)}, ${across} ${fmtNum(Math.min(...xs))} to ${fmtNum(Math.max(...xs))}`;
    }).join("; ");
  }
  const points = groups[0][1];
  const xs = points.map((p) => p.x as number), ys = points.map((p) => p.y as number);
  const top = points.reduce((a, b) => (b.y! > a.y! || (b.y === a.y && (b.x as number) < (a.x as number)) ? b : a));
  const line = `${count(points.length)}; ${across} ${fmtNum(Math.min(...xs))} to ${fmtNum(Math.max(...xs))}, ` +
    `${up} ${fmtNum(Math.min(...ys))} to ${fmtNum(Math.max(...ys))}; highest ${fmtNum(top.y as number)} at ${fmtNum(top.x as number)}`;
  const label = safeText(top.label, MAX_LABEL);
  return label ? `${line} (${label})` : line;
}

function textChart(block: Record<string, unknown>): string {
  const series = (isList(block.series) ? block.series : []).filter(isDict);
  if (!series.length) return "";
  const kind = chartKind(block.kind);
  const labels = isList(block.x) ? block.x : [];
  let body = "";
  if (kind === "histogram") {
    body = binsLine(labels, series[0]);
  } else if (kind === "scatter") {
    body = scatterLine(series, safeText(block.title, 80));
  } else if (kind === "pie" || kind === "donut") {
    body = slices(labels, series[0]);
  } else {
    body = series.slice(0, 6).map((s) => seriesLine(s, labels)).filter(Boolean).join("; ");
  }
  if (!body) return "";
  const unit = safeText(block.unit, 20);
  const title = `**${safeText(block.title) || "Chart"}**` + (unit ? ` (${unit})` : "");
  return `${title}: ${body}`;
}

// images.py — a local path, or a web URL.
const LOCAL_PATH = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/;

function isLocalPath(v: unknown): boolean {
  if (!isStr(v) || v.length === 0 || v.length > MAX_URL || CONTROL_TEST.test(v)) return false;
  return LOCAL_PATH.test(v);
}

/** Python's `series.get("data", [])` where the list is then walked: a stored null/number/bool is a TypeError over
 *  there — the whole block is skipped by _render_safely — so it is thrown here too, never quietly ignored. */
function dataOf(series: Record<string, unknown>): unknown[] {
  return walkable(series, "data", true);
}

/** A field walked as a sequence. Python raises TypeError on a stored null/number/bool — and _render_safely drops
 *  the whole block there — so this throws the same way; strings and dicts walk their characters and keys, as they
 *  do over there; a missing field gives the default. */
function walkable(block: Record<string, unknown>, key: string, missingDefault = false): unknown[] {
  const v = missingDefault ? pick(block, key, []) : block[key];
  if (v === undefined && missingDefault) return [];
  if (isList(v)) return v;
  if (isStr(v)) return [...v];
  if (isDict(v)) return Object.keys(v);
  if (v === undefined && !missingDefault) return [];
  throw new Error(key);
}

function textImages(block: Record<string, unknown>): string {
  const photos = isList(block.images) ? block.images : [];
  const lines: string[] = [];
  for (const photo of photos.slice(0, 12)) {
    if (!isDict(photo)) continue;
    if (isLocalPath(photo.url)) {
      const caption = safeText(photo.caption);
      lines.push(caption ? `${caption} (generated image)` : "Generated image");
      continue;
    }
    const line = textImage(photo);
    const source = safeText(photo.source);
    if (line) lines.push(source ? `${line} [${source}]` : line);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}

// include.py: show_blocks swapped it for its board long before storing — a stored one has no text.
function textInclude(): string {
  return "";
}

// flip.py
function textFlip(block: Record<string, unknown>): string {
  const cards = isList(block.cards) ? block.cards : [];
  const lines: string[] = [];
  for (const card of cards.slice(0, 12)) {
    if (!isDict(card)) continue;
    const front = firstOf(card, "front", "question");
    const back = firstOf(card, "back", "answer");
    if (front && back) lines.push(`- Q: ${front} — A: ${back}`);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}

// actions.py
function nextSteps(labels: string[]): string {
  const kept = labels.filter(Boolean);
  return kept.length ? "Next: " + kept.join(" · ") : "";
}

function textButton(block: Record<string, unknown>): string {
  const label = safeText(block.label);
  return nextSteps([label ? mdLink(label, safeUrl(block.url, true)) : ""]);
}

function textActions(block: Record<string, unknown>): string {
  const items = isList(block.items) ? block.items : [];
  return nextSteps(items.filter(isDict).map((it) => safeText(F(it).label)));
}

// layers.py
const LAYERS_MAX = 12;
const L_TITLE = 80, L_CAPTION = 200, L_LABEL = 24, L_NOTE = 280;

function textLayers(block: Record<string, unknown>): string {
  const layers = firstList(block, "layers").slice(0, LAYERS_MAX).filter((x) => isDict(x) && safeText(x.label));
  const lines: string[] = [];
  layers.forEach((layer, i) => {
    const l = F(layer);
    const label = safeText(l.label, L_LABEL);
    const note = safeText(l.note, L_NOTE);
    lines.push(note ? `${i + 1}. ${label} — ${note}` : `${i + 1}. ${label}`);
  });
  if (!lines.length) return "";
  const title = safeText(block.title, L_TITLE);
  const caption = safeText(block.caption, L_CAPTION);
  return (title ? [`**${title}**`] : []).concat(caption ? [caption] : []).concat(lines).join("\n");
}

// timeline.py
function stopsOf(block: Record<string, unknown>): unknown[] {
  if (isList(block.groups)) return block.groups;
  const flat = firstList(block, "items", "events", "stops", "steps");
  return [{ items: flat }];
}

function textTimeline(block: Record<string, unknown>): string {
  const title = safeText(block.title);
  const lines: string[] = title ? [`**${title}**`] : [];
  for (const group of stopsOf(block).slice(0, 14)) {
    if (!isDict(group) || !isList(group.items)) continue;
    const label = safeText(group.label);
    const stops: string[] = [];
    for (const item of (group.items as unknown[]).slice(0, 12)) {
      const name = isDict(item) ? safeText(item.title) : "";
      if (!name) continue;
      const it = F(item);
      const time = safeText(it.time, 40);
      const place = safeText(it.place);
      stops.push("- " + (time ? `${time} · ` : "") + name + (place ? ` (${place})` : ""));
    }
    if (stops.length) {
      if (label) lines.push(`**${label}**`);
      lines.push(...stops);
    }
  }
  return lines.length > (title ? 1 : 0) ? lines.join("\n") : "";
}

// heatmap.py
function textHeatmap(block: Record<string, unknown>): string {
  const rows = block.rows, cols = block.cols, values = block.values;
  if (!isList(rows) || !rows.length || !isList(cols) || !cols.length || !isList(values) || !values.length) return "";
  const columns = cols.slice(0, 12);
  const body: string[][] = [];
  rows.slice(0, 12).forEach((label, i) => {
    const line = isList(values[i]) ? (values[i] as unknown[]).slice(0, columns.length) : [];
    body.push([tableCell(label), ...line.map(tableCell)]);
  });
  const title = safeText(block.title);
  const unit = safeText(block.unit, 20);
  const head = title || unit ? `**${title || "Heatmap"}**` + (unit ? ` (${unit})` : "") : "";
  return (head ? [head] : []).concat(mdTable(["", ...columns.map(tableCell)], body)).join("\n");
}

// flow.py
const FL_TITLE = 80, FL_LABEL = 40, FL_NOTE = 280, FL_GROUP = 40;
const FL_MAX_NODES = 10, FL_MAX_GROUPS = 3, FL_MIN_COUNT = 2, FL_MAX_COUNT = 100;
const CHIP = 16, MAX_CHIPS = 10;

function chipsText(chips: unknown): string {
  if (!isList(chips)) return "";
  return chips.slice(0, MAX_CHIPS)
    .map((c) => safeText(isDict(c) ? c.text : c, CHIP))
    .filter(Boolean).join(", ");
}

function isCount(value: unknown, low: number, high: number): boolean {
  return isNum(value) && Number.isInteger(value) && value >= low && value <= high;
}

function textFlow(block: Record<string, unknown>): string {
  const nodes = firstList(block, "nodes").slice(0, FL_MAX_NODES)
    .filter((n) => isDict(n) && safeText(n.label));
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const n = F(node);
    const label = safeText(n.label, FL_LABEL);
    const note = safeText(n.note, FL_NOTE);
    const holds = chipsText(n.holds);
    let line = note ? `${i + 1}. ${label} — ${note}` : `${i + 1}. ${label}`;
    if (holds) line = `${line} (holds: ${holds})`;
    lines.push(line);
  });
  if (!lines.length) return "";
  const numbers = new Map<string, number>();
  nodes.forEach((node, i) => {
    const id = F(node).id;
    if (isStr(id)) numbers.set(id, i + 1);
  });
  for (const group of firstList(block, "groups").slice(0, FL_MAX_GROUPS)) {
    const label = isDict(group) ? safeText(group.label, FL_GROUP) : "";
    if (!label) continue;
    const g = F(group);
    const at = walkable(g, "nodes")
      .filter((k): k is string => isStr(k) && numbers.has(k))
      .map((k) => numbers.get(k)!);
    if (!at.length) continue;
    const span = at.length === 1 ? `step ${at[0]}` : `steps ${Math.min(...at)}-${Math.max(...at)}`;
    const times = isCount(g.count, FL_MIN_COUNT, FL_MAX_COUNT) ? ` × ${g.count}` : "";
    lines.push(`_${label}${times}: ${span}_`);
  }
  const title = safeText(block.title, FL_TITLE);
  return (title ? [`**${title}**`] : []).concat(lines).join("\n");
}

// steps.py
const S_TITLE = 80, S_TEXT = 600, S_MAX_ITEMS = 12, S_MAX_TICK = 20;

function changeLines(item: Record<string, unknown>, labels: Record<string, string>): string[] {
  const holds = isDict(item.holds) ? (item.holds as Record<string, unknown>) : {};
  const lines: string[] = [];
  for (const [node, chips] of Object.entries(holds).slice(0, FL_MAX_NODES)) {
    const named = Object.hasOwn(labels, node) ? labels[node] : undefined;
    const name = safeText(named, S_TITLE) || safeText(node, 24);
    const held = chipsText(chips);
    if (name && held) lines.push(`${name} now holds: ${held}`);
  }
  if (isCount(item.tick, 1, S_MAX_TICK)) lines.push(`The repeated part runs ${item.tick} more times.`);
  return lines;
}

function textSteps(block: Record<string, unknown>, labels?: Labels): string {
  const items = firstList(block, "items").slice(0, S_MAX_ITEMS)
    .filter((it) => isDict(it) && safeText(it.title));
  const flowId = isStr(block.for) ? block.for : "";
  const forLabels: Record<string, string> = labels && flowId && Object.hasOwn(labels, flowId) ? labels[flowId] : {};
  const parts: string[] = [];
  items.forEach((item, i) => {
    const it = F(item);
    const head = `**Step ${i + 1} of ${items.length} · ${safeText(it.title, S_TITLE)}**`;
    const lines = [head, safeText(it.text, S_TEXT), ...changeLines(it, forLabels)].filter(Boolean);
    parts.push(lines.join("\n"));
  });
  if (!parts.length) return "";
  const title = safeText(block.title, S_TITLE);
  return (title ? [`**${title}**`] : []).concat(parts).join("\n\n");
}

// calculator.py — a formula worked out the way text_fallback's arithmetic() does: names, numbers, + - * / ( )
// and unary minus, and nothing else. Helper calls, comparisons and (without `powers`) ^ are NOT simple formulas:
// arithmetic gives None there, and the words say so ("open in Hermes Desktop", "–"). The PARSE is the drawing
// side's own (lib/formula.ts) — this is the shipped reader with the drawing's extra grammar refused, not a
// second evaluator.
const INPUT_ID = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;

export function arithmetic(formula: unknown, names: Map<string, number>, powers: boolean = false): number | null {
  if (!isStr(formula) || formula.length > MAX_STRING) return null;
  let tree: Node;
  try {
    tree = parseFormula(formula);
  } catch {
    return null;
  }
  if (!simpleTree(tree, powers)) return null;
  return evaluate(tree, names);
}

function simpleTree(node: Node, powers: boolean): boolean {
  switch (node.kind) {
    case "number": case "name": return true;
    case "negate": return simpleTree(node.arg, powers);
    case "binary": {
      const ops = ["+", "-", "*", "/"];
      if (node.op === "^") return powers;
      if (!ops.includes(node.op)) return false;  // a comparison is not a simple arithmetic formula here
      return simpleTree(node.left, powers) && simpleTree(node.right, powers);
    }
    case "call": return false;  // helpers play in Hermes Desktop, never in a text line
  }
}

function textCalculator(block: Record<string, unknown>): string {
  const inputs = walkable(block, "inputs").slice(0, 6).filter((it) => isDict(it) && isStr(it.id));
  const names = new Map<string, number>();
  const shown: string[] = [];
  for (const item of inputs) {
    const it = F(item);
    const start = [it.value, it.min].find(isNum) ?? 0;
    names.set(it.id as string, start);
    const label = firstOf(it, "label", "id");
    shown.push(`${label} ${withUnit(fmtNum(start), safeText(it.unit, 20))}`);
  }
  const lines: string[] = [];
  for (const out of walkable(block, "outputs").slice(0, 6)) {
    const label = isDict(out) ? safeText(out.label) : "";
    if (!label) continue;
    const value = arithmetic(F(out).formula, names);
    lines.push(value === null
      ? `- ${label}: open in Hermes Desktop for the live calculator`
      : `- ${label}: ${withUnit(fmtNum(value), safeText(F(out).unit, 20))}`);
  }
  if (!lines.length) return "";
  return (shown.length ? [`With ${shown.join(", ")}:`] : []).concat(lines).join("\n");
}

// simulate.py
const SIM_TITLE = 80, SIM_UNIT = 12, SIM_MAX_PILES = 3, SIM_ROWS = 5;

function isName(v: unknown): v is string {
  return isStr(v) && INPUT_ID.test(v);
}

/** simulate._times: five evenly spaced times from 0 to `to`, each on a step. */
function timesOf(to: number, step: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < SIM_ROWS; k++) out.push(Math.floor((to * k) / (SIM_ROWS - 1) / step + 0.5) * step);
  return out;
}

/** simulate._amount: 214358.88 → "214,359"; 12.3456 → "12.35"; 0.004567 → "0.00457". */
function amount(v: number): string {
  if (Math.abs(v) >= 100) return fmtNum(roundHalfEven(v, 0));
  if (Math.abs(v) >= 1) return fmtNum(roundHalfEven(v, 2));
  return fmtNum(v);
}

function textSimulate(block: Record<string, unknown>): string {
  const t = block.t, view = block.view;
  if (!isDict(t) || !isDict(view) || !isName(t.name)) return "";
  const to = t.to, step = pick(t, "step", 1);
  const pilesRaw = Object.hasOwn(view, "piles") ? view.piles : view.series;
  if (!isNum(to) || !isNum(step) || to <= 0 || step <= 0 || !isList(pilesRaw)) return "";
  const piles = pilesRaw.slice(0, SIM_MAX_PILES).filter((p) => isDict(p) && safeText(p.name));
  if (!piles.length) return "";
  const names = new Map<string, number>();
  if (isDict(block.values)) {
    for (const [k, v] of Object.entries(block.values)) if (isName(k) && isNum(v)) names.set(k, v);
  }
  const shown: string[] = [];
  const inputs = isList(block.inputs) ? block.inputs : [];
  for (const item of inputs) {
    if (!isDict(item)) continue;
    const it = F(item);
    const key = pick(it, "name", it.id);
    if (!isName(key)) continue;
    const start = [it.value, it.min].find(isNum) ?? 0;
    names.set(key, start);
    const value = withUnit(fmtNum(start), safeText(it.unit, SIM_UNIT));
    shown.push(`${firstOf(it, "label", "name", "id")} ${value}`);
  }
  const unit = safeText(block.unit, SIM_UNIT);
  const rows: string[][] = [];
  for (const when of timesOf(to, step)) {
    const withTime = new Map(names);
    withTime.set(t.name, when);
    const cells = piles.map((p) => {
      const v = arithmetic(F(p).formula, withTime, true);
      return v === null ? "–" : withUnit(amount(v), unit);
    });
    rows.push([fmtNum(when), ...cells]);
  }
  const header = [tableCell(t.unit) || (t.name as string), ...piles.map((p) => tableCell(F(p).name))];
  const title = safeText(block.title, SIM_TITLE);
  const lead = (title ? [`**${title}**`] : []).concat(shown.length ? [`With ${shown.join(", ")}:`] : []);
  return lead.concat(mdTable(header, rows)).join("\n");
}

// form.py
const FORM_NOTE = 80, FORM_GROUP = 40;

function choice(value: unknown): string {
  if (isList(value)) return value.slice(0, 12).map(choice).filter(Boolean).join(", ");
  if (isDict(value)) return firstOf(value, "label", "value");
  return safeText(value, 60);
}

function optionText(option: unknown): string {
  const name = choice(option);
  const note = isDict(option) && name ? safeText(option.note, FORM_NOTE) : "";
  return note ? `${name} — ${note}` : name;
}

function chosen(field: Record<string, unknown>, options: unknown[]): string {
  const value = field.value;
  for (const option of options) {
    if (isDict(option) && !Array.isArray(value) && option.value === value) return choice(option);
  }
  return choice(value);
}

function textForm(block: Record<string, unknown>): string {
  const fields = isList(block.fields) ? block.fields : [];
  const lines: string[] = [];
  let group = "";
  for (const field of fields.slice(0, 12)) {
    if (!isDict(field)) continue;
    const f = F(field);
    const label = firstOf(f, "label", "id");
    if (!label) continue;
    const heading = safeText(f.group, FORM_GROUP);
    if (heading && heading !== group) lines.push(`${heading}:`);
    group = heading;
    const options = isList(f.options) ? (f.options as unknown[]) : [];
    const picked = chosen(f, options);
    const value = picked ? withUnit(picked, safeText(f.unit, 20)) : "";
    const listed = options.slice(0, 12).map(optionText).filter(Boolean).join(" / ");
    lines.push(`- ${label}${value ? `: ${value}` : ""}${listed ? ` (${listed})` : ""}`);
  }
  if (!lines.length) return "";
  const title = safeText(block.title);
  return (title ? [`**${title}**`] : []).concat(lines, ["(answer in a message)"]).join("\n");
}

// text_fallback.RENDERERS — every type but the layout ones. Unknown types give nothing, as over the wire.
// (steps takes the flow-label map as its second word, like text_steps does over there.)
const RENDERERS: Record<string, (block: Record<string, unknown>, labels?: Labels) => string> = {
  heading: textHeading, text: textText, divider: () => textDivider(), badge: textBadge, link: textLink,
  image: textImage, bar: textBar, callout: textCallout, source: textSource, table: textTable,
  list: textListBlock, checklist: textChecklist, tiles: textTiles, streak: textStreak, progress: textProgress,
  stat: textStat, kpis: textKpis, chart: textChart, images: textImages, include: textInclude, flip: textFlip,
  button: textButton, actions: textActions, layers: textLayers, timeline: textTimeline, heatmap: textHeatmap,
  flow: textFlow, calculator: textCalculator, simulate: textSimulate, form: textForm, steps: textSteps,
};

const SIMPLE: Record<string, (block: Record<string, unknown>, depth: number, labels: Labels) => string> = {};
for (const [kind, fn] of Object.entries(RENDERERS)) {
  SIMPLE[kind] = (block, _depth, labels) => fn(block, labels);
}

function layoutPieces(block: Record<string, unknown>, depth: number, labels: Labels): string[] {
  if (block.type === "tabs") {
    const out: string[] = [];
    for (const tab of isList(block.tabs) ? block.tabs : []) {
      const children = isDict(tab) && isList(tab.children) ? (tab.children as unknown[]) : [];
      const inside = pieces(children, depth + 1, labels);
      const label = inside.length ? safeText(F(tab).label) : "";
      if (label) out.push(`**${label}**`);
      out.push(...inside);
    }
    return out;
  }
  const children = isList(block.children) ? block.children : [];
  const title = block.type === "section" ? safeText(block.title) : "";
  const inside = pieces(children, depth + 1, labels);
  return (title && inside.length ? [`**${title}**`] : []).concat(inside);
}

/** text_fallback._render: one block as text pieces (a container gives one per child). */
function renderBlock(block: unknown, depth: number, labels: Labels): string[] {
  if (!isDict(block) || depth > MAX_DEPTH) return [];
  const kind = block.type;
  if (LAYOUT_TYPES.includes(kind as string)) return layoutPieces(block, depth, labels);
  const renderer = isStr(kind) && Object.hasOwn(SIMPLE, kind) ? SIMPLE[kind] : undefined;
  const text = renderer ? renderer(block, depth, labels) : "";
  return text ? [text] : [];
}

/** text_fallback._render_safely: a malformed block is skipped — an export must still go out. */
function renderSafely(block: unknown, depth: number, labels: Labels): string[] {
  try {
    return renderBlock(block, depth, labels);
  } catch {
    return [];
  }
}

function pieces(blocks: unknown[], depth: number, labels: Labels): string[] {
  const out: string[] = [];
  for (const block of blocks) out.push(...renderSafely(block, depth, labels));
  return out;
}

/** text_fallback.blocks_as_text(blocks, limit=None): a whole board as Markdown, uncapped. "" when nothing in it
 *  can be shown as text. */
export function blocksAsMarkdown(blocks: unknown): string {
  if (!isList(blocks)) return "";
  let labels: Labels = {};
  try {
    labels = flowLabels(blocks);
  } catch {  // odd ids only cost the labels, as over the wire
    labels = {};
  }
  return pieces(blocks, 0, labels).join("\n\n");
}
