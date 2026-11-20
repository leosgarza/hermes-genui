// Reading stored blocks: JSON from the plugin's store → blocks the drawing code can draw. Each type has its own reader
// in blocks/<type>/read.ts, with a comment and a worked example, listed in registry.tsx. The rule throughout: drop what
// doesn't fit and note why; never show broken data.
import { REGISTRY, type Block } from "../registry";
import { actsBeforeTheModel, align, boardId, density, firstText, keepFirst, motion, NO_SEND, palette, str,
  Trail, version, type Align, type Density, type Diagnostic, type Motion, type Palette } from "./fields";

/** Every block type that can be drawn, containers included. */
export const BLOCK_TYPES: string[] = Object.keys(REGISTRY);

/** One tappable follow-up below the board: the short words shown on the pill, and the message a tap sends to
 *  the chat as the reader's own. */
export type FollowUp = { label: string; run: string };

/** One living-board link (enhancement #9): another board by address, and the AI's one-line suggestion of
 *  how the two connect. The address names a stored board; the drawer fetches it from the door when asked —
 *  reach-back without redrawing. */
export type BoardLink = { id: string; note?: string };

/**
 * Stored JSON → its blocks, notes on what was dropped, and the board's own words from the stored envelope: its
 * alignment default (where the cards sit) and its text default (how the words inside them read), and provenance —
 * asOf (when the data is from, one short line) and live (true: the figures update; false: a snapshot; undefined:
 * the board didn't say) — plus followUps, the quiet strip of taps the board offers under itself. A lone block
 * object is a list of one, and the store's {blocks: [...]} envelope is unwrapped (it may say align, text_align,
 * as_of, live or follow_ups beside blocks). Anything else gives no blocks.
 *   [{type: "heading", text: "Day 1"}, {type: "weather"}]
 *   → {blocks: [{type: "heading", text: "Day 1"}], dropped: [{path: "1", why: 'unknown type "weather"'}]}
 */
export function readBlocksNoted(data: unknown): {
  blocks: Block[]; dropped: Diagnostic[]; align?: Align; textAlign?: Align; asOf?: string; live?: boolean;
  followUps?: FollowUp[]; density?: Density; palette?: Palette; motion?: Motion;
  version?: number; updatedAt?: string; links?: BoardLink[];
} {
  let list: unknown = data;
  let board: Align | undefined;
  let boardText: Align | undefined;
  let asOf: string | undefined;
  let live: boolean | undefined;
  let followUps: FollowUp[] | undefined;
  let boardDensity: Density | undefined;
  let boardPalette: Palette | undefined;
  let boardMotion: Motion | undefined;
  let boardVersion: number | undefined;
  let boardUpdatedAt: string | undefined;
  let boardLinks: BoardLink[] | undefined;
  const top = new Trail();
  if (isObject(list) && Array.isArray((list as any).blocks)) {
    // The envelope's own words are the board's defaults. A block that merely spells its children `blocks` (a
    // section with `blocks: [...]` on its own line — drawn unwrapped, as it has always been) is not an envelope:
    // its align is the block's own ask, not a board default, and its as_of is none of the board's business.
    if (typeof (list as any).type !== "string") {
      board = align((list as any).align);
      boardText = align((list as any).text_align);  // the same three words; they move the reading, not the card
      boardDensity = density((list as any).density);  // the board's look words (enhancement #7): how it packs,
      boardPalette = palette((list as any).palette);  // which colours its charts draw, how much it moves
      boardMotion = motion((list as any).motion);
      asOf = str((list as any).as_of, 80);  // the date line, cut the way every shown string is; junk gives nothing
      live = typeof (list as any).live === "boolean" ? (list as any).live : undefined;
      followUps = readFollowUps((list as any).follow_ups, top.at("follow_ups"));
      boardVersion = version((list as any).version);  // the living-board words (enhancement #9): which version
      boardUpdatedAt = str((list as any).updated_at, 40);  // this drawing is, when it was written, and what it
      boardLinks = readBoardLinks((list as any).links, top.at("links"));  // connects to, each by address
    }
    list = (list as any).blocks;
  }
  if (isObject(list) && typeof (list as any).type === "string") list = [list];
  const blocks: Block[] = [];
  if (Array.isArray(list)) {
    list.forEach((raw, i) => {
      blocks.push(...readOne(raw, top.at(i), 0));
    });
  }
  return { blocks, dropped: top.dropped, align: board, textAlign: boardText, asOf, live, followUps,
    density: boardDensity, palette: boardPalette, motion: boardMotion,
    version: boardVersion, updatedAt: boardUpdatedAt, links: boardLinks };
}

/** Just the blocks to draw. */
export function readBlocks(data: unknown): Block[] {
  return readBlocksNoted(data).blocks;
}

/** Where a block's own spec asked to be drawn, read by the board (core/Blocks.tsx); undefined when it didn't say.
 *  A drawing never reads it: placement is the board's business, kept off each block's props. */
export function alignOf(block: Block): Align | undefined {
  return (block as { align?: Align }).align;
}

/** How a block's own spec asked its words to read (text_align, the same three words as align); undefined when it
 *  didn't say. Like placement, only the board reads it — a drawing never does. */
export function textAlignOf(block: Block): Align | undefined {
  return (block as { text_align?: Align }).text_align;
}

/** The envelope's follow_ups, read like a row of action buttons: both halves needed (aliases included, the way
 *  `actions` takes them), a message Hermes acts on before the model is dropped with the note buttons have always
 *  carried, and at most four taps. The words themselves are kept WHOLE: the writer stored the entire prompt, and
 *  a tap that sent a cut version would be a different message than the board offered (and a cut label is a
 *  clipped label — length is the row's business to wrap, not the reader's to amputate). Nothing usable is
 *  nothing said: undefined, and the board draws no strip. */
function readFollowUps(value: unknown, here: Trail): FollowUp[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: FollowUp[] = [];
  value.forEach((item, i) => {
    const label = firstText([item?.label, item?.text], Infinity);
    const run = firstText([item?.run, item?.ask, item?.message], Infinity);
    if (!label || !run) {
      here.at(i).drop("button needs a label and a run message");
      return;
    }
    if (actsBeforeTheModel(run)) {
      here.at(i).drop(NO_SEND);
      return;
    }
    items.push({ label, run });
  });
  const kept = keepFirst(items, 4, here, "follow-ups");
  return kept.length ? kept : undefined;
}

function isObject(v: unknown): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** The envelope's links to other boards, read like the follow-ups row: at most three, each either a bare
 *  address or {id, note}. A link that names no address is dropped with the note-trail's reason (the writer
 *  refused it at show_blocks too; the reader never shows what it cannot open). The note — the AI's one-line
 *  suggestion of how the boards connect — is kept whole the way every shown word that carries the point is.
 *  Nothing usable is nothing said: undefined, and the board draws no links row. */
function readBoardLinks(value: unknown, here: Trail): BoardLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: BoardLink[] = [];
  value.forEach((item, i) => {
    const id = boardId(typeof item === "string" ? item : item?.id);
    if (!id) {
      here.at(i).drop("a link must name a board by its address");
      return;
    }
    const note = typeof item === "object" && item !== null ? str(item.note, 80) : undefined;
    if (note === undefined && typeof item === "object" && item !== null && "note" in item && item.note !== undefined
      && typeof item.note !== "string") here.at(i).drop("the link's note must be one line of text");
    items.push(note ? { id, note } : { id });
  });
  const kept = keepFirst(items, 3, here, "links");
  return kept.length ? kept : undefined;
}

/** One item (top level or a container's child) → zero, one or several blocks (a flattened container gives its
 *  children). `depth` counts the containers above it. */
function readOne(raw: unknown, here: Trail, depth: number): Block[] {
  if (!isObject(raw)) {
    here.drop("not a block object");
    return [];
  }
  const kind = (raw as any).type;
  const entry = Object.hasOwn(REGISTRY, kind) ? REGISTRY[kind as Block["type"]] : undefined;
  if (!entry) {
    here.drop(`unknown type "${kind}"`);
    return [];
  }
  const read = entry.read(raw, here, depth, readOne);
  if (!read) return [];
  const blocks = Array.isArray(read) ? read : [read];
  // An ask the drawing didn't want for itself belongs to it: a row drawn as a stack places every block of the
  // stack where the row said, and reads its words the way the row said. (Blocks drawn inside a container that
  // survives are placed by the container, not here.)
  const asked = align((raw as any).align);
  if (asked) for (const block of blocks) if (alignOf(block) === undefined) Object.assign(block, { align: asked });
  const askedText = align((raw as any).text_align);
  if (askedText) for (const block of blocks) if (textAlignOf(block) === undefined) Object.assign(block, { text_align: askedText });
  return blocks;
}
