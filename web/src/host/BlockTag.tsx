// What `::blocks{id="..."}` turns into inside a reply: a placeholder while the reply streams in, then the stored
// blocks fetched by id and drawn. A block that cannot load draws nothing — a stray id in a reply stays silent
// rather than printing an error note. Never raw JSON.
// Alignment has three voices: the board's own default (the stored envelope's align), a block's own ask (readBlocks
// reads it into the block), and the reader's — the small line of chips above the board, which outranks both and is
// remembered per board on this device until the reader gives it back to the model with Auto.
import { useContext, useEffect, useState } from "react";
import { Blocks } from "../core/Blocks";
import { align as alignWord, type Align } from "../core/fields";
import { readBlocksNoted } from "../core/readBlocks";
import type { Block } from "../registry";
import { BlockActions } from "./actions";

const ID_PATTERN = /^[0-9a-f]{8}$/;

type State = {
  kind: "loading";
} | {
  kind: "drawn"; blocks: Block[]; boardAlign?: Align; boardAsOf?: string; boardLive?: boolean;
} | { kind: "failed" };

/**
 * load fetches the stored JSON for an id (in the app: the plugin's REST route).
 *   streaming → "drawing…" (no fetch yet: the tag may still be arriving)
 *   id "zzz" → nothing (never fetched)
 *   fetch fails, or nothing in it can be drawn → nothing
 * The blocks drawn get the app's actions (send, fill, rest) with this tag's id added, so a checklist saves its ticks
 * with this board. The reader's alignment choice for this board comes along too, and is saved back under it.
 */
export function BlockTag({ id, streaming, load }: { id: string | undefined; streaming: boolean; load: (id: string) => Promise<unknown> }) {
  const validId = typeof id === "string" && ID_PATTERN.test(id);
  const actions = useContext(BlockActions);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [userAlign, setUserAlign] = useState<Align | undefined>(() => (validId ? readUserAlign(id as string) : undefined));

  useEffect(() => {
    setUserAlign(validId && !streaming ? readUserAlign(id as string) : undefined);
    if (streaming || !validId) return;
    let live = true;
    load(id)
      .then((data) => {
        const { blocks, align: boardAlign, asOf: boardAsOf, live: boardLive } = readBlocksNoted(data);
        if (live) setState(blocks.length ? { kind: "drawn", blocks, boardAlign, boardAsOf, boardLive } : { kind: "failed" });
      })
      .catch(() => {
        if (live) setState({ kind: "failed" });
      });
    return () => {
      live = false;
    };
  }, [id, streaming, validId]);

  if (!validId && !streaming) return null;
  if (streaming || state.kind === "loading") return <Note text="drawing…" pulse />;
  if (state.kind === "failed") return null;

  const choose = (a: Align | "auto") => {
    const value = a === "auto" ? undefined : a;
    setUserAlign(value);
    saveUserAlign(id as string, value);
  };
  return (
    <BlockActions.Provider value={{ ...actions, blockId: id }}>
      <AlignControl value={userAlign ?? "auto"} onChoose={choose} />
      <Blocks blocks={state.blocks} boardAlign={state.boardAlign} userAlign={userAlign}
        boardAsOf={state.boardAsOf} boardLive={state.boardLive} />
    </BlockActions.Provider>
  );
}

// The reader's own choice, one per stored board, on this device only: it is how this reader wants to look at the
// blocks, not part of what the model drew, so it lives in localStorage rather than beside the board.
const CHOICES: readonly (Align | "auto")[] = ["auto", "left", "center", "right"];
const LABEL: Record<Align | "auto", string> = { auto: "Auto", left: "Left", center: "Center", right: "Right" };

function userAlignKey(id: string): string {
  return `hermes-genui-align-${id}`;
}

/** The saved word, checked on the way in; a broken storage simply means "the model's choice". */
function readUserAlign(id: string): Align | undefined {
  try {
    return alignWord(localStorage.getItem(userAlignKey(id)) ?? "");
  } catch {
    return undefined;
  }
}

function saveUserAlign(id: string, value: Align | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(userAlignKey(id));
    else localStorage.setItem(userAlignKey(id), value);
  } catch {
    /* no storage on this device: the choice still works for as long as the reply is open */
  }
}

function AlignControl({ value, onChoose }: { value: Align | "auto"; onChoose: (a: Align | "auto") => void }) {
  return (
    <div className="hb-align" role="group" aria-label="Alignment">
      {CHOICES.map((a) => (
        <button key={a} type="button" className="hb-align-btn" aria-pressed={a === value} onClick={() => onChoose(a)}>
          {LABEL[a]}
        </button>
      ))}
    </div>
  );
}

function Note({ text, pulse = false }: { text: string; pulse?: boolean }) {
  return <div className={pulse ? "hb-state hb-pulse" : "hb-state"}>{text}</div>;
}
