// The Hermes Desktop half: claims the `::blocks{id="..."}` tag and draws the stored blocks inside the reply. Buttons,
// tiles and forms in them act through the app's composer; checklists save their ticks through the plugin's REST routes.
// It also stands a Library entry in the host's chat.empty slot — the same area the app itself registers its new-chat
// content into — so a BRAND-NEW chat, with no board drawn anywhere, can still open the shelf and reattach a saved
// board into the composer the user is typing in (review round 2: reattach-to-a-new-chat has to be possible there).
import { host, CHAT_EMPTY_AREA, TRANSCRIPT_DIRECTIVE_AREA } from "@hermes/plugin-sdk";
import { BlockActions, composerActions, type Rest, type SendOptions } from "./host/actions";
import { BlockTag } from "./host/BlockTag";
import { LibraryEntry } from "./host/LibraryChrome";
import css from "./styles";

const ID = "hermes-genui";
const STYLE_ID = "hermes-genui-css";

/** Adds the plugin's stylesheet once; on a hot reload the same element gets the new rules. */
function injectStyles(): void {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default {
  id: ID,
  name: "Hermes GenUI",
  register(ctx: any) {
    injectStyles();
    const load = (blockId: string) => ctx.rest(`/blocks/${blockId}`);
    const rest: Rest = (path, init) => ctx.rest(path, init);
    // host.composer is looked up on each tap, not once here, so a composer the app sets up later is still found.
    // opts rides along: a block that forces its own message (a ticked table selection) must not lose that at this seam.
    const send = (text: string, opts?: SendOptions) => composerActions(host?.composer).send(text, opts);
    const fill = (text: string) => composerActions(host?.composer).fill(text);
    ctx.register({
      id: "hermes-genui-tag",
      area: TRANSCRIPT_DIRECTIVE_AREA,
      data: {
        name: "blocks",
        render: ({ attrs, sessionId, streaming }:
          { attrs: Record<string, string>; sessionId?: string; streaming: boolean }) => (
          <BlockActions.Provider value={{ send, fill, rest, blockId: attrs?.id, sessionScope: sessionId }}>
            <BlockTag id={attrs?.id} streaming={Boolean(streaming)} load={load} />
          </BlockActions.Provider>
        ),
      },
    });
    // The new-chat shelf. The host renders every chat.empty registration with {sessionId}; the send the
    // rows fire is the same seam every block uses — the composer the user is typing in (null targets this
    // chat, which on this slot is the new one). No board id here: the entry stands with its rows and its
    // dialog only — there is nothing drawn to pin.
    ctx.register({
      id: "hermes-genui-shelf",
      area: CHAT_EMPTY_AREA,
      data: {
        render: () => (
          <BlockActions.Provider value={{ send, fill, rest }}>
            <LibraryEntry />
          </BlockActions.Provider>
        ),
      },
    });
  },
};
