# UPSTREAM — five reviewed enhancements (three combined, alignment and provenance on branches off that tree)

For the hermes-genui maintainer. This documents three small changes a daily user runs locally on top of
upstream `main` @ `5f223c2`, a fourth — block alignment — built on the combined three and kept on its own
branch (`alignment`) so the first three stay untouched, and a fifth — the provenance footer — built on that
same tree and kept on its own branch (`feat/provenance-footer`) so alignment stays untouched. Each is independent, tested, and adoptable on its own; the combined branch is
offered as a convenience. Nothing here changes Hermes itself: no host/app change, no new runtime
dependency, no new network call, no new block type, no catalog/prompt-text change.

Baseline: `5f223c2` · Branch: `combined-candidate` · Owner of this build: leosgarza (daily user, plugin owner approval on file).

| # | Change | Commit (combined) | Original | Adoption path |
|---|--------|-------------------|----------|---------------|
| 1 | tiles: decision reason readable at a glance | `cb4f9e5` | `0ea1a80` on `leosgarza/hermes-genui` branch `tiles-readability-fix` | already opened as [PR #12](https://github.com/sagarmainkar/hermes-genui/pull/12) |
| 2 | images: draw tool-generated local files | `956d9dd` | `35078bf` (local-only) | candidate PR for the direction discussed in [issue #11](https://github.com/sagarmainkar/hermes-genui/issues/11) |
| 3 | BlockTag: hide a block that cannot load | `10b8d52` | same commit (new) | new proposal — see trade-off below |
| — | rebuilt bundle for all three | `d49c5da` | — | rebuild after taking any subset |
| 4 | alignment: AI-decided card position and text alignment (manual reader chips removed) | branch `alignment` @ `3fe1783` (off the combined three) | this card, test-first | proposal — see section 4 |
| 5 | provenance footer: `as_of` and a Live/Snapshot word beside the source line | branch `feat/provenance-footer` (off the alignment tree) | this card, test-first | proposal — see section 5 |

---

## 1. tiles — read the whole decision reason, never by hovering

**What & why.** A `tiles` decision card capped its subtitle (the tile's decision reason) at 80 characters,
clamped it to 2 lines at 88 % white over a saturated gradient, and kept the full wording only in the native
hover tooltip. A person saw a title plus a cut-off teaser and had to hover to read the choice — backwards
for a decision card.

**Mechanism** (renderer-only; `Tiles.tsx` unchanged, hover stays a supplement):
- `web/src/blocks/tiles/read.ts` — subtitle cap 80 → **300 = the protocol's own `MAX_STRING`** (the same
  ceiling as the tile's `ask`/`run`, other readers' long text, and the Python text fallback), cut at a word
  boundary (`cutAtWord`, the repo's `firstWords` pattern) so a 1–2 sentence reason passes whole.
- `web/src/blocks/tiles/tiles.css` — `-webkit-line-clamp` removed; text moves into flow so the card grows to
  fit; `min-height: 158px` preserves the old cover height; subtitle full white + `text-shadow` + firmer
  scrim; `:has(.hb-tile-icon)` guard keeps grown cards clear of the icon chip. `aspect-ratio` was removed
  after probing 7 variants that all clipped text.

**Tests.** `read.test.ts` (full-text reads, word-boundary cut) and `Tiles.test.tsx` (206-char single
sentence and 244-char two-sentence reason render fully at 343 px phone width; full white, no clamp,
grow-to-fit). Written first; RED on the old code. +9 vitest.

**Evidence.** Headless Chrome at phone width: worst card grows 157.5→219 px with text fully inside;
glyph-core brightness 255 on every subtitle line, light and dark; keyboard focus visible. Real-browser
screenshots in the PR.

**How to adopt.** **PR sagarmainkar/hermes-genui#12** (`tiles-readability-fix` @ `0ea1a80`) — cherry-pick or
merge as-is.

## 2. images — draw images `image_generate` saved to a local file

**What & why.** Hermes can generate images, but `show_blocks` only accepted https URLs that a photo tool
returned, so an `image_generate` result saved to a local file was refused even though it is real. This
follows the direction opened in **issue #11** ("let blocks show images Hermes already generates"),
extended to local files: the provenance rule stays — a picture is drawn only if a Hermes tool returned it.

**Mechanism:**
- `hooks/media_provenance.py` (new) — a `post_tool_call` observer notes the image references (https URL or
  absolute local path) that `image_generate` returns, into the existing provenance store
  (`core/store.py`, the same `photo-urls.txt` list). Relative names, `file://`/`data:` spellings and junk
  are ignored; the observer never raises.
- `__init__.py` + `plugin.yaml` — register and declare the `post_tool_call` hook.
- `blocks/images.py` / `blocks/common.py` — `check_images` now accepts an absolute local path *that
  provenance already saw* (the `show_blocks` refusal of any tool-never-returned photo is unchanged, which is
  what makes the path safe); `is_local_path` helper added.
- `web/src/blocks/images/localImage.ts` + `Images.tsx` — a local path is read by the Desktop host through
  its own file reader (`hermesDesktop.readFileDataUrl`) — the same call the chat already makes for a local
  `MEDIA` image — into a data URL. The host's guards are final: sensitive-file refusal, size cap or missing
  file fails the read and the photo hides, like a dead https link. **Deliberately no gateway fallback:** a
  second read route would undo the host's security decision and configured cap, and would be a new network
  call. https photos render exactly as before.
- `web/src/host/env.d.ts` — type declaration for the host reader already provided at runtime.
- Text-only chats get a `generated image` caption — the local path never leaks. `README.md` privacy section
  updated (the provenance list keeps last-500 references, local only).

**Tests.** `tests/hooks/test_media_provenance.py` (new, 128 lines), `tests/core/test_check.py`,
`tests/hooks/test_text_fallback.py`, `tests/test_register.py` (+15 pytest); `localImage.test.ts` (new),
`Images.test.tsx`, `images/read.test.ts` (+19 vitest). Written first; RED on the old code.

**Evidence.** Independently reviewed **PASS WITH NOTES** (card `t_ab84b3d3`); boards drawing generated
files verified in the real Desktop app.

**How to adopt.** The change lives as commit `35078bf` on baseline `5f223c2` — offerable as a candidate PR
against the direction of issue #11. Note it generalizes the issue proposal (provenance for local paths, not
only https URLs from tools); the `layout: "strip" | "grid"` idea from the issue is **not** included.

## 3. BlockTag — a block that cannot load draws nothing

**What & why.** A reply containing `::blocks{id="..."}` with a stray, truncated or pruned id rendered
"Couldn't load this block" in the middle of the answer. The dominant trigger is a stray/fake id the model
pasted from an old conversation, and the note gives the reader nothing actionable — it is noise around
otherwise good text.

**Mechanism** (`web/src/host/BlockTag.tsx`, two lines):
- malformed id when not streaming → `return null` (still never fetched);
- `state.kind === "failed"` (fetch rejected, or stored data has nothing drawable) → `return null`.
- Unchanged: the streaming/loading `drawing…` pulse, the drawn path, and the actions wiring.

**Tests.** `BlockTag.test.tsx`: the three failure cases now assert the container renders **empty**;
streaming still shows `drawing…`; a valid board still draws; the checklist still receives the tag id.
Written first (3 failed / 3 passed on the old code), then 6/6.

**Disclosed trade-off (the honest part).** A genuinely-failed board — e.g. a stored board deleted after the
reply was written — now disappears with no signal. This was deliberate: the failure paths are ones the
store itself refuses to create at save time, the surrounding reply text remains, and a silent gap beats a
recurring error note for the common stray-id case. If you would rather keep a signal, the middle ground is
hiding only the malformed-id case and keeping the note for failed fetches — one line either way. Happy to
send whichever you prefer as a PR; this one is a proposal, no PR opened yet.

---

## 4. alignment — AI-decided: card position AND text alignment, no manual control

**What & why.** Every block sat at the left of the chat column. A capped card (a lone calculator, a form, a
chart) could not center itself beside prose, and a board could not ask to sit centered. Owner's ask
(2026-11-18, v1): general placement control, model-side and manual-side. **Owner's revision (2026-11-18, v2,
"just do the auto for both"): the AI decides both where each card sits across the reply and how the words
inside it read, adaptively from the content — and the manual reader chips are removed.** The reader has no
alignment control anywhere; there is nothing to override.

**Mechanism.** Two semantic fields, the same three words, the same single resolution order — block, then
board, then left:
- `align: "left" | "center" | "right"` on any block spec says **where the card sits**;
  `text_align: "left" | "center" | "right"` says **how its words read**. Both are read once, centrally, by
  `core/readBlocks.ts` (`web/src/core/fields.ts`'s word reader serves both): trimmed and caseless, anything
  else ignored — the block still draws, sitting and reading left, exactly as an unknown callout tone becomes
  "info". No type's own reader or drawing was touched; the words ride beside the block, never into its
  props-to-DOM path.
- Board defaults in the stored envelope: `{"align": "center", "text_align": "right", "blocks": [...]}`.
  A board saved without words stays a plain list — the existing file shape is untouched, and old boards read
  exactly as before. `show_blocks` takes both words as optional parameters riding the same envelope as
  `as_of`/`live`; the REST route passes them through, includes and the text half take just the blocks
  (`core/store.py` gains `blocks_of` / `align_of` / `text_align_of`, both shapes, lenient as everywhere
  else).
- Placement draws a non-left block inside a `.hb-place` box — `display: flow-root`, filling the column or
  cell exactly as the block did — and shifts it with `margin-inline` across the free space. Block layout
  inside is the point: the block sizes as it sized unwrapped (a capped card stays its 720px cap; a
  `fit-content` table keeps hugging; prose, a long line and other full-width blocks have no free space and
  shift by nothing), and the auto margin only shares out what the block left over. Never auto-margin a
  block directly in a flex column: the margin stops the stretch and the block collapses to its content (a
  real Chrome regression in `tests/` pins this). Placement resolves recursively — `core/Blocks.tsx` hands
  containers the same drawing path, so a child's own word and the board's default both reach nested blocks,
  each placed within the cell the container already gave it (`layout.css` grows the cell rules so a placed
  card still fills and stretches as its unwrapped siblings do).
- The text voice is one class on the same wrapper (`.hb-ta-center` / `.hb-ta-right` in `tokens.css`;
  `data-text-align` marks it): `text-align` reaches the words by inheritance and moves no box. It is drawn
  **only for the four blocks whose whole draw is words — heading, text, stat, callout** (`TEXT_BEARING` in
  `core/Blocks.tsx`); charts, tables, images, layouts and containers ignore the ask completely, so no
  layout block can gain a node, a class or a reflow. A block asked for both voices gets the one wrapper
  carrying both. A board with no ask anywhere draws the DOM it always did: no wrappers, no new nodes,
  `widths.test.tsx` unchanged and passing.
- **A voice needs a line box (review round 2).** `text-align` only moves words that sit in a line box filling
  the available width — it is no property of a shrink-wrapped flex item. Every `TEXT_BEARING` kind is audited
  against that rule and measured at real word position in Chrome: heading and text are block boxes that
  already fill their column; a lone stat card fills its column and its label/value/change lines stretch
  across the card; only the callout kept its words in a non-growing body beside the fixed icon, and there a
  scoped rule (`.hb-ta-center .hb-callout-body`, `.hb-ta-right .hb-callout-body` → `flex: 1 1 auto`) opens
  that body to the row **only when a voice asks** — a callout nobody asked about keeps every rect it always
  had (hugging its words, exactly the old drawing). The icon never moves and the box never resizes; a
  centered callout centers its words in the line beside the icon, which is where the words live. A new
  text-bearing kind joins `TEXT_BEARING` only once its words measure at their voice in the same probe.
- **Removed in v2 (the manual path):** the host chip line above every drawn board (Auto | Left | Center |
  Right), its `localStorage` per-board override and its reader-beats-all resolution rank. `host/BlockTag.tsx`
  and `blockTag.css` lost the control, its styles and its storage reader/writer; `Blocks.tsx` lost the
  `userAlign` prop and the `user` voice from the placement context. No manual alignment control exists
  anywhere in the tree. A stale `hermes-genui-align-<id>` key left on a device by v1 is never read (pinned
  by a host test).

**What did not change.** Max-widths, light/dark theming, container geometry (grids, rows, columns, sections
and tabs keep every cell they had; only the blocks inside them gain a place or a voice), the text fallback's
words (placement, text alignment and provenance are drawing concerns — text is just blocks), the
`catalog.json`/`describe()` budget (both fields are documented in the `show_blocks` parameter descriptions,
not the pinned catalog text), `check_blocks` (only undrawable things are refused, house rule — a wrong word
is a layout default, not a broken block), the provenance footer's behavior.

**Tests** (behavior in vitest, real pixels in Chrome): vitest **572 passed / 72 files**, covering the two
words and their lenience, the envelope defaults, cascade (block beats board, board beats left, nothing else),
the four text-bearing types drawing the voice, layout types provably byte-identical under a `text_align`
ask, one wrapper shared between position and voice, nested resolution, and a host test that no alignment
control renders and no remembered key is read. pytest **726 passed** — behavior tests across both board
shapes end to end (save → include → REST → text) for each word, plus **20** real-browser layout regressions
(`tests/test_layout_alignment.py`, Chrome headless; the probe now feeds Chrome every stylesheet a text-bearing
block ships, callout/atoms/kpis included): measured rects prove a placed capped card stays exactly
720px at center and right, full-width prose and wide charts stay at the column width at every word, a
`fit-content` table keeps hugging while moving, nested grid cards match their unplaced twins, a row cell
stretches through a place; the `TestTextVoice` class pins the computed voice (center/right, box unmoved and
unresized; a plain placement never implies a voice), and the `TestVoiceWords` class measures the WORDS —
the first-line Range rect of every text-bearing kind at left/center/right with short words (the callout body
opens 55.9px → 745px beside its untouched 17px icon, its words travel 41.0 → 385.6 → 730.1px on an 800px
board; heading, text and stat words land at their voice's edge of a full-width line box), a wrapped long
note centered line by line, a no-ask callout measured against the pre-fix shape, and **three negative
controls**: the old flex-row shrink-wrap still measures broken; a `data-text-align` attribute without its
class still computes the left default; and the shipped callout under a scoped NOT-shipped hug still computes
"center" while its words do not move one pixel — the defect this round fixed, kept measurable forever.
`ruff` and `tsc --noEmit` clean; bundle `desktop/plugin.js` built twice byte-identical.

**Disclosed trade-offs.** (1) The reader can no longer restyle a board the model aligned badly — the fix for
a wrong ask is the model's next call, by owner's explicit decision ("just do the auto for both").
(2) A word on a flattened container (a row drawn as a stack) becomes the word of every block in the stack
unless a block asks otherwise — for both fields, same rule. (3) `text_align` reaches only the four blocks
whose draw is words; that boundary is the point — a chart's or a table's internal typography is its own
drawing's business, and the ask must not grow a wrapper around layout blocks.

---

## 5. provenance footer — `as_of` and the word Live or Snapshot, beside the source line

**What & why.** A board could already say *where* its data came from (a `source` block, a chart's `source`
field), but never *when* it was from, or whether its figures still move. A trend chart drawn on Monday read
the same on Sunday. Owner's ask (2026-11-18): a quiet provenance footer — source · as_of · a [Live] or
[Snapshot] badge — extending the attribution that exists, not a new source system.

**Mechanism.** Two more words in the envelope alignment already established, riding exactly like `align`:
- `show_blocks` gains optional `as_of` (one date/timestamp line, shown as written, never parsed; control
  characters stripped, cut to 80 chars) and `live` (a real bool: true = figures update, false = a snapshot —
  `false` is a word of its own and is kept; `blocks/common.py` adds `as_of_line` / `live_flag`). Anything
  missing or unusable is ignored and the board is stored plain, as every model word is.
- Stored shape unchanged for everyone else: `{as_of, live}` join the existing `{align, blocks}` envelope only
  when declared. `core/store.py` gains `as_of_of` / `live_of` (lenient, like `align_of`); the REST route
  passes both through beside `align`; includes and the text half still take just the blocks — provenance,
  like alignment, is a drawing concern.
- `web/src/core/readBlocks.ts` reads both words in the same envelope gate as `align` (`as_of` through the
  existing `str()` reader; `live` only as a real boolean), so old stored boards — plain lists or
  align-only envelopes — read with no provenance, exactly as before.
- `web/src/core/Blocks.tsx` draws the footer **only when a board declared one**: a quiet column under the
  blocks with only the parts given. The board's first top-level `source` block is absorbed — said once, not
  twice — and it gets its **own full-width row**, drawn **through `Placed`, the very same path as any block**
  (block's own `align` → board default → left). The row is a block context on purpose: a
  `.hb-place` only shares out the space a block context leaves over, so the same box squeezed as a child of
  the join line's flex row shrink-wraps to its content and every word lands back at the left edge (measured
  in Chrome: [8, 29.09] where an 800px board gives [8, 808]). As its own row the footer's source measures
  **exactly like the identical ask drawn by a board without provenance** — the very machinery the alignment
  wave proved, with nothing new beside it. Beside the row, one quiet flex line carries the rest: the `source`
  each top-level chart block carries, joined in draw order and deduped (against the block's own row too),
  while every chart **keeps its inline attribution** — the footer joins it, never replaces it. Then the
  as_of word, then the badge. The badge carries its **word** — "Live" or "Snapshot", plus `data-live` for
  theming — colour (the existing `--hb-good` green) only sits beside the word.
  All styling is existing theme tokens; a board that declares nothing grows zero new DOM nodes.

**What did not change.** The `source` block and the chart `source` field themselves (untouched readers,
untouched drawings); boards without provenance — byte-identical DOM, `widths.test.tsx` unchanged;
alignment behaviour and max-widths; the text fallback's words; the `catalog.json` / `describe()` budget
(the two fields are documented in the `show_blocks` parameter descriptions, not the pinned catalog text);
`check_blocks` (nothing new is refused — a junk word is simply not stored).

**Tests.** vitest **553 passed / 72 files** — 24 new (`core/provenance.test.tsx`: envelope read beside
align, `live:false` kept as a word, junk ignored, over-long cut, section-that-spells-blocks gate, footer
render order source · as_of · badge, Live vs Snapshot words, parts-only, link dropped to text, only the
first source absorbed, no-declaration DOM unchanged; plus the review reworks: the footer source keeps
its per-block / board placement (the reader-voice tests retired with the chips) — the reviewer's
`align:"right"` probe and its no-provenance
control — the placed row sits **beside** the join line, never inside its flex row, and chart sources join
deduped in draw order while the inline line stays). pytest **708 passed** — 13 new across the whole ride
(store shapes and leniency, `show_blocks` envelope with/without align, blank and junk words ignored,
`false` kept, 80-char cut, includes take no provenance, REST passes both and skips junk). Written first;
RED on the old code. And the real-browser bar the second review round set: `tests/test_layout_alignment.py`
grew `TestProvenancePlacement` (4 tests) — headless Chrome, the shipped stylesheets, the renderer's exact
footer DOM at the reviewer's 800px width — asserting every placed footer row spans the row and measures
word-for-word like the same asks on a no-provenance board (the reader-chip fixture retired with the chips), and a
**negative control** scoped to the fixture that re-measures the flex-row shrink-wrap ([8, 29.09]) the
defect produced, so the probe provably reads geometry, not classes. `ruff` and `tsc --noEmit` clean;
bundle `desktop/plugin.js` built twice byte-identical.

**Disclosed trade-offs.** (1) The footer joins only **top-level** attribution: the first top-level `source`
block and the `source` of top-level chart blocks. A source nested in a grid stays where it is drawn, and so
does a nested chart's inline line (the footer still shows what it can) — reaching inside containers for
attribution would redraw container logic this change deliberately leaves alone. (2) `as_of` is display
text, not a parsed timestamp: the renderer never claims the date is valid, and a wrong word is only a wrong
line, matching how every other model word is treated. (3) `live` is a claim by the model at draw time;
nothing re-checks it later — the badge records what the board said, and a board that didn't say gets no
badge. (4) Dedupe of joined chart sources is exact-text, in draw order: "BLS" and "Bureau of Labor
Statistics" are two truthful lines, not one.

---

## 6. expand — a full-screen view of the board (the reader's view, not a model word)

**What & why.** A board is drawn at a reading width inside a reply; sometimes the reader wants the whole
canvas — a wide chart, a long table, a dense plan. Owner's ask (2026-11-18, enhancement wave #2): an expand
control on every drawn board that opens the SAME board full-screen in a wider container, with Escape and a
close control back out. Deliberately **not** a stored word: the model still owns what the board says and
where cards sit (section 4); this is purely the reader's view, and it reuses the one overlay the plugin
already ships — the images strip's full-size photo dialog (`blocks/images/Images.tsx`) — raised to the board.
No new modal system, no new dependency, no network, no host/app change.

**Mechanism — one instance, moved not re-drawn.** `web/src/host/BlockTag.tsx` draws a loaded board inside a
`position:relative` `.hb-tag` shell carrying exactly one real `<button type="button">` (`.hb-expand`,
`aria-label="Expand board"`, `aria-haspopup="dialog"`), absolutely positioned at the corner and therefore
**out of flow**; the board itself sits in a `.hb-board-host` wrapper — a **plain block container at rest**,
so the inline `.hb-blocks` subtree stays byte-identical to what `<Blocks>` draws alone (a vitest equality on
`outerHTML` pins it; Chrome pins every rect). Expanding is a **layout state of that same element**: the
wrapper gains the `hb-board-overlay` class (the photo overlay's own numbers — fixed `inset:0`, same z-index,
same `hb-appear` animation, the scrim's 82% black) and the dialog attributes (`role="dialog"`,
`aria-modal="true"`, a label), and a close button mounts in front of the board. The board is **never
re-instantiated**: the blocks were already mounted, so a calculator's sliders, an unsent form draft, a lit
flow and every other live state survive open, close and reopen **in both directions** — the dialog shows the
inline board's state, an edit made in the dialog returns with it, and nothing is ever a second copy to fall
out of sync. (A stateless photo may be re-drawn at full size, as the images strip does; a stateful board
may not — that is the one honest correction the images pattern needed when it was raised to the board.)
The panel is the board's own box: one shipped rule — `.hb-board-overlay .hb-blocks` — lifts the 1100px
reading cap **inside the dialog only** and carries the themed paper (`min(1600px, 100%)`, 24px padding,
`var(--background)`), so full-width blocks ride the wider column (measured 1552px at a 2000px viewport)
while every `.hb-blocks > X` cap (the 720px cards, the `fit-content` table) is the board's own selector and
keeps its number in both views. Keyboard: opening moves focus into the dialog (the close button) and Tab is
trapped — but the trap walks the **eligible tabbable set**, recomputed per keypress: the focusable selectors
minus anything disabled (own `disabled` or a disabled `fieldset` — Steps/Layers end on a spent Next, a sent
form's Send sits behind its fieldset), minus negative-tabindex and hidden controls, minus (where layout is
real) zero-rect and invisible ones. Wrap lands on the real first/last control, so focus can never sit on a
dead end or leak out of the dialog; Escape closes — a photo opened from inside the dialog answers the
topmost layer first — and closing hands focus back to the expand control. The control sits quiet
(`opacity:0`) until the pointer is over the board or the key reaches it (`:focus-visible`).

**What did not change.** The inline `.hb-blocks` DOM and every inline rect (byte equality in vitest, paired
rect equality in Chrome — including the new plain wrapper, which measures the bare board); the stored
envelope, `show_blocks`, `catalog.json`, `describe()` — zero Python source change, this feature adds no
model word; the reader chips stay removed (section 4: placement remains the model's alone — the expand
control is a view, not an alignment ask, and the "no alignment control" test asserts every host button
except the expand control is still forbidden); boards that are never expanded render exactly what they
rendered before; theming (host vars with the same fallbacks the host states already use), a11y, provenance
behavior, alignment width semantics.

**Tests.** vitest **588 passed / 72 files** — 16 in the expand suites. Structural: the control is a real
button outside `.hb-blocks`; no control while streaming or on a failed board; inline byte-identity against
a bare `<Blocks>` draw; the dialog holds **the same element** (identity assertions, exactly one
`.hb-blocks` in the document); close and Escape return to inline with focus handed back; Tab wraps at both
ends; scrim clicks close while board clicks do not; placement, voice and the provenance footer all survive
expanded; the photo layer answers Escape first. Behavioral (the review round-1 contracts): a calculator
moved 40→70 inline shows **70** in the dialog on the same input node, an edit to 90 in the dialog shows 90
inline after close and **after reopen**; an unsent form draft survives the same round trip; the trap with a
disabled final button, a disabled-fieldset Send, a negative-tabindex input and a hidden button wraps
forward and reverse on the real ends and never lands focus on a dead control. The cascade itself: the same
board element computes `max-width: 1100px` inline, `none` while the dialog is open and 1100px again after
close, with the 720px card cap identical in all three states. pytest **738 passed** — 12 in
`tests/test_expand_fullscreen.py`: real headless Chrome (2000×1400, shipped stylesheets including
`blockTag.css`, renderer-equivalent DOM): every rect inside the wrapped board measures word-for-word what
the same blocks measure unwrapped and the plain wrapper itself fills the tag exactly as a bare div would,
and those numbers are the accepted alignment probe's own (1100 board, 720 caps, prose at the cap); the ONE
expanded board element measures the 1600px paper box with prose and the wide chart riding its 1552px column,
capped cards staying 720 and landing exactly centered/right in the wider column, the `fit-content` table
still hugging its old width, the provenance place spanning the whole wider row, and the close control
holding the viewport corner. **Two negative controls**, each scoped rules that are NOT shipped CSS, keep
both wrong implementations measurable forever: an overlay that forgot to lift the cap reads inline widths
in "full screen" (1100, prose never travels), and a widening that also loosened the caps inflates cards to
the full column — the shipped dialog matches neither shape. A swap experiment (the single shipped rule
commented out) turned the four expanded geometry tests **and** both negative-control comparisons RED while
all four inline-unchanged tests stayed GREEN. `ruff` and `tsc --noEmit` clean; bundle `desktop/plugin.js`
built twice byte-identical (`fbd222073f10…`). Truthful rendered evidence (program requirement):
`before.png` — the base tree drawing the board through the shared capture tool; `after.png` — the candidate
inline (control at its keyboard focus state; byte-identical to the accepted frame — the wrapper costs the
inline view nothing) beside the expanded dialog, which now honestly shows the inline slot emptied while the
one board rides the wider panel.

**Disclosed trade-offs.** (1) While expanded the wrapper is out of flow, so the inline slot is empty behind
the scrim (the images pattern's own behaviour, now for real: the board moved, it did not stay and duplicate)
— the scrim covers the page anyway and close restores the element to flow with its state intact. (2) The
tabbable filter's layout half (rects, visibility) only counts where layout is real; jsdom reports a zero
rect for every element, so there the attribute shape (`disabled`, `tabindex`, `hidden`, `fieldset`) governs
and Chrome plus the shipped renderers pin the rest. (3) The 1600px panel and the 1100px inline cap are
design numbers, pinned by the Chrome probe rather than by viewport math; a narrower viewport simply gives
the dialog its full `100%` minus scrim padding, and the board fills whatever it gets.

---

## 7. table — `interactive`: search the rows, tick them, send them to the chat (a model word)

**What & why.** Owner's ask (2026-11-18, enhancement wave #3): make the drawn table a work surface — a quiet
search that narrows the rows, the header sorting that already shipped ordering the survivors, checkboxes on
the rows, and one tap that posts the picked rows back into the conversation as context. Unlike expand
(section 6), this IS a model word: a table with `interactive: true` gets the controls. Every table without
it — and every board stored before this change — draws exactly what it drew before.

**Mechanism — the same table, with controls on top.** Nothing is rebuilt. `readTable`
(`web/src/blocks/table/read.ts`) keeps `interactive` only when it says exactly `true`, the same strict
convention as `collapsed` or `numbered`. `Table.tsx` then adds:

- a tools row (`.hb-table-tools`) between the caption and the rows: a `type=search` input
  (`aria-label="Filter rows"`), one shipped `.hb-pill` button, and a `role="status"` line that tells
  where the last tap went. The button reuses the plugin's tap-to-send mechanism — the one submit
  implementation in `host/actions.ts`, not a second one — with `force: true`: a picked selection is
  the reader's own message, written by ticking rows, so the length convention that holds a suggestion
  tap under `MAX_SENT` does not hold this one; the message is submitted to the chat whatever its
  length. The command/file guard holds either way (`actsBeforeTheModel` — text is about trust, not
  about who typed it): a pick that starts like a command or carries an `@-reference` is never
  auto-submitted; it lands in the composer for the user to read and send, as it always did. A submit
  the host refuses falls back to a draft the same way. And a word is only ever said AFTER the host
  has answered: `insertText` is a promise that can resolve false (no mounted surface took the text)
  or reject (the call died), and neither is a draft — the `role="status"` line names exactly what
  happened and nothing more. `Sent to chat.` (submit said yes), `In the composer — press Send.`
  (an acknowledged draft), `Blocked from sending — in the composer — press Send.` (the guard held an
  explicit send back and the composer acknowledged keeping it — the real reason, out loud, never a
  bare assumption of a draft), `Send failed — nothing was sent or kept.` (the insert refused or
  died: nothing is claimed, and the ticks stay put so the tap can be retried), `No chat here.` (no
  app composer around). A late answer from an older tap is dropped — only the last tap may label the
  row. The button's `title` shows the full message before the tap, the same hover-truth the action
  buttons already keep. And the word is written to be READ on any card: `white-space: normal` with
  `overflow-wrap: anywhere` lets it WRAP — no nowrap, no ellipsis, nothing that truncates — so a card
  hugging a narrow table grows taller rather than ever cutting off the recovery instructions; the
  region is `role="status"` plus an explicit `aria-live="polite"` — announced as well as shown.
- the seam (`web/src/host/actions.ts`) grows in place: `send(text, opts?)` now answers
  `Promise<"sent" | "drafted" | "blocked" | "failed" | "nowhere">` — and never rejects, so ignoring
  it stays safe. `"drafted"` and `"blocked"` are answered only once the insert has acknowledged
  (resolved true); a refused or dead insert answers `"failed"`. `opts.force` waives only the length
  convention, never the guard. Every existing caller keeps its exact behavior (one argument, return
  ignored — long suggestion taps still draft); the app wiring in `plugin.tsx` forwards the options
  so a block's `force` is not lost at the host seam.
- filtering: `rowMatches` (`table/pick.ts`) is a case-insensitive substring over any cell of the row's
  stored text. The visible rows are the shipped `sortedOrder(rows, sort)` narrowed by the query, so
  header clicks — up, down, back to as-written, with `aria-sort` — keep ordering whatever survived.
- selection: one added column (`.hb-pick`) with a checkbox labelled `Select row {first cell}` per row.
  Picks are keyed by the original row index, so ticks survive sorting and filtering; a tick on a row
  hidden by the query stays ticked when it returns.
- the message: `pickedMessage(caption, columns, rows, picked)` — `{caption}:` (or `Table:`), the column
  names once, then each picked row joined with ` | `, in table order. The names once are what let the
  chat tell a price from a rating; the shape follows the form block's sent-answer.
- the empty states: the shipped “No rows to show.” row for an empty table, and a clear
  `Nothing matches “{query}”.` row when a query excluded every row.

**fit-content, preserved by construction.** The card still hugs its table: the tools row is
`width: 0; min-width: 100%`, so it fills the card without ever contributing its own intrinsic width —
the only width opting in adds is the checkbox column itself. A dedicated real-Chrome regression
(`tests/test_table_interactive_width.py`, 19 tests, 2000×1400) measures it: the plain card equals its
table plus the border to 0.01px; the interactive card minus the plain card equals the tick column to
0.5px; the tools row measures exactly the card's content width and neither control crosses the card
edge; a one-row filtered table hugs just the same; and on that narrowest card with the status line
filled to its longest word (the after-tap state), the card still measures exactly what it measured in
silence — spoken feedback costs zero width. The same suite reads the words themselves: for every
shipped outcome (sent, drafted, blocked, failed) on the narrowest hugging card the span must have no
horizontal overflow AND every word's own laid-out range rect must sit fully inside the span's box —
layout truth, not markup (review round 3 caught `Blocked…` clipped to 174px of a 274px sentence, at
exactly the width the geometry tests had been calling perfect). Two negative controls keep both defect
shapes measurable forever: the same DOM with a NOT-shipped `width: auto` tools row inflates the card
~150px past the table it should hug, and the same narrow DOM restyled to the OLD clip rule truncates
mid-sentence while still hugging — proving the readability probes detect, not decorate.

**What did not change.** A table without the word draws the identical tree — no input, no tick column,
no send control; its only buttons are the header sorts (vitest guards both the absence and the always-
shipped sort cycle; the static default grows no status line either). `send` for callers that do not
pass `force` keeps the same host calls in the same order — the length convention, the guard, the
draft-on-refusal are all intact — with one honesty difference: the draft's caret now follows only an
acknowledged insert, and the result is a promise that never rejects, so a caller ignoring it is
unaffected. The new CSS is scoped to the new classes; `widths.test.tsx` passes untouched.
Python is untouched in behaviour: `check_table` refuses only undrawable things, and a miswritten
`interactive` is neither undrawable nor fatal — the drawer just falls back to static. `store.save`
keeps the word verbatim; old stored boards have none. The text fallback (`text_table`) is unchanged.

**How the model learns the word.** Not through the catalog: `describe()` sits at 12,985 of a pinned
13,000-character budget, so every byte of `catalog.json` is load-bearing. The `interactive` sentence
rides the `blocks` parameter description of `show_blocks` instead, and a schema test pins that it is
there (the same route proven by `align`, `text_align`, `as_of` and `live`).

**Tests.** vitest **624 passed / 75 files** (+36 over the accepted base: the strict reader word, 4
pure-helper cases, 8 component tests — filter narrows, sorting orders the survivors, the no-matches
row, selection sends the exact message, ticks survive the round trip through sort and filter, a11y
names on every added control, two old-table guards; 11 seam cases — the force path plus the honest
answers (an acknowledged draft, an insert that resolves false → `failed`, an insert that rejects →
`failed` without rejecting the send, guard-held ack → `blocked`, refused-but-acked fallback →
`drafted`); and 13 integration cases wiring `Table.tsx` to the REAL `composerActions` on a fake app
composer — a short pick submits, the 122-character three-row pick submits (the exact case review
round 1 caught silently drafting), a guarded pick is never submitted and the acked hold is NAMED as
blocked, a refused submit that lands in an acked draft says so, a draft the surface REFUSED or whose
insert REJECTED says `Send failed — nothing was sent or kept.` and keeps the ticks for a retry, a
late answer from an older tap cannot overwrite the newest word, no composer does nothing without
throwing, the word clears when the pick changes and a second tap posts afresh, and the status region
is pinned as an explicit polite live region. pytest **760 passed** (+22: 19 real-Chrome width tests —
the spoken-feedback test fills the live region with the LONGEST shipped word and the clip probe reads
every word's own laid-out rect on the narrowest card, across all four outcome words, with the old
clip rule restyled as the second negative control — checker tolerance, stored-verbatim, schema
documentation). `tsc --noEmit` and ruff clean; the Desktop bundle builds twice byte-identical.

**Disclosed trade-offs.** (1) On a very narrow hug the BUTTON's words wrap onto more lines inside the
pill (never clipped; the full name rides the accessible name and hover title too) — and the OUTCOME
words (what happened, what to do) wrap likewise: the card grows taller, never wider, and nothing the
reader needs to recover is ever cut off (review round 3). (2) The query and the ticks are per-render
view state, not stored: reopen the chat and the board is interactive again but freshly unfiltered, in
line with the rest of the plugin (no new persistence). (3) The filter matches the stored cell text, not
the displayed abbreviation: `44999` does not match a `₹44,999` cell (the comma is real), though it
matches `₹44,999` typed whole; a `44.9K` display shortening is display-only. (4) There is no
select-all: the wave asked for row ticks and one send, and an all-rows toggle raises "all visible or
all rows?" questions the smallest change should not answer. (5) The forced send adds no length cap of
its own — deliberate: a picked selection is the user's own message and the host's `submit` is the
authority. If it refuses, the text is drafted, and the word waits for the composer's acknowledgment —
an insert the surface refused or that died is said as a failure, never dropped and never faked. (6) A
pick that carries a command or file reference is never auto-submitted — the guard cannot tell "my row
happened to contain `@file:`" from "this is a command" — and when the composer acknowledges holding
it, the status line names the real reason: `Blocked from sending`. If the composer does NOT
acknowledge, it says the text was saved nowhere instead of claiming a draft. (7) The review of the
first cut caught that the plain `send` path silently drafted the ordinary three-row pick (122 chars >
`MAX_SENT`); the force path plus the real-seam integration tests are that fix, and the mocked unit
test that missed it is kept beside them, pinning the exact message, not the outcome. The review of
the second cut caught the deeper lie: `"drafted"` was answered the moment insertText was CALLED,
discarding the SDK's `Promise<boolean>` — a surface that answers false (nothing mounted) or rejects
was still told "In the composer — press Send." Acknowledged-only answers, the explicit `blocked`
and `failed` words, and the last-tap guard against stale overwrites are that fix, pinned branch by
branch on the real seam. (8) The review of the third cut caught that even a truthful word can be
unreadable: the narrowest hugging card CLIPPED `Blocked from sending…` mid-recovery-instruction under
a nowrap/ellipsis style, at a width the geometry tests had been certifying as a perfect hug. Words
that wrap instead of clip, the explicit polite live region, and the real-Chrome per-word rect probe
with the old clip rule as a standing negative control are that fix — and the general rule they pin:
outcome text never truncates, at any card width.

---

## 8. chart — drill-down on every drawing, plus scatter and histogram (enhancement #4, this card)

**What & why.** A chart could already be *looked at* (hover card, keyboard stepping) but not *read closely*: the
card fades with the pointer, its numbers share a 12.5 px line, and a model that wanted a point cloud or a value
distribution had no kind to ask for — `scatter` silently drew a line, and a histogram had no shape at all (no x
labels: refused; faked x labels: drawn as a line). This section stacks two small things on the accepted table
tree (`8fbe668a`): clicking a datum opens it, focused, over the window; and two chart kinds join the renderer
through its existing scales, axes and theming.

**Mechanism** (the existing chart block extended, not rebuilt):
- `chartData.ts` / `blocks/chart.py` — `scatter` and `histogram` join `CHART_KINDS` (alias `hist`); a histogram
  takes one series. `histogramBins(values)` counts the values into about six bins at round edges — the drawing's
  own `niceTicks` makes the edges, so bins land on numbers a reader can say out loud (`50–60`, `60–70`…).
- `read.ts` — a histogram's bins become its x labels and its counts its bars; any x left on it is ignored; the
  unit belongs to the values, so the count axis carries none. Everything else reads exactly as before.
- `layout.ts` — a scatter whose x labels are all numbers places dots by value (a real x scale); words space them
  evenly like a line. Its x labels thin by their real positions (crowds collapse, ends always show). Histogram
  bars stand on the zero baseline and write their counts, like any column chart.
- `ChartDetail.tsx` + `chart.css` — the drill-down: the images strip's full-size overlay (same scrim, same z,
  same host close control) showing one datum — its label, each series's FULL value, a note (a slice's share, a
  bin's count of the values, a line's change since its start) and the chart's own source. It mounts as the
  drawing's SIBLING, never inside the card: Chrome measures that a card which transforms or contains its own box
  (every entrance animation does) shrinks a fixed overlay mounted within it to the card. One dialog instance at
  a time; the chart behind is never re-instantiated, so its pick survives open, close and reopen.
- Open: a click that did not drag (8px), Enter/Space on the focused drawing (`pickKeys` gained `activate`), or a
  click on a slice/legend row/hbar row. Close: Escape (a photo above answers first, as the host's dialog already
  defers), the close control, the scrim. Focus lands on the close control, Tab stays there, and returns to the
  drawing on close; the dialog is `role="dialog"` `aria-modal`, and every drawing now says `aria-haspopup`.
- `blocks/chart.py` — a histogram needs no x (any x is ignored, not refused); its data must be numbers or null
  gaps, at least one number, one series; tone stays line-only. `text_chart` says a histogram's spread
  (`4 values, 3 → 70, median 40`) and a scatter's range (`Samples 3 points, y 10 → 14`).
- `tools/show_blocks.py` — the new kinds are documented in the blocks-parameter description, NOT in
  `catalog.json`: `describe()` sits 15 characters under its pinned cap, and the `interactive` table word already
  established this seam (and its test).

**Tests.** vitest **672 passed / 77 files** (+48, incl. the round-1 and round-2 review fixes below): scatter dots and no line; histogram bins (pure sums, reader,
drawing, headline of values); drill-down opens/closes and PRESERVES STATE — the same svg node object before,
during and after, the picked column still lit after close, the same datum on reopen; drag-scrub does not open;
a11y (dialog roles, focus in/out, Tab trap, `aria-haspopup`); pie slice and hbar row clicks. The old 624 all
pass untouched, and the stored-shape guard is kept: `chartKind("scatter")` used to fall back to line — the
change is the opt-in, and every old kind's drawing is asserted unchanged. pytest **782 passed** (+22: 7 checker
and text-fallback and schema-word tests, and 9 REAL-CHROME layout tests in
`tests/test_chart_drilldown_overlay.py` — with the dialog mounted the board measures its undrilled self
word-for-word (720 caps, the fit-content table hug, the pie, the board box), the dialog itself measures the
measured viewport (never an assumed `--window-size`), its card centres at the shipped `min(440px, 100%)`, the
close control holds the corner — and two NOT-shipped defect shapes stay measurable: a dialog that never left
the flow (band, board grows) and a dialog mounted inside a transformed card (shrinks to the card). The
reduced-motion gate on the dialog's own entrance is what lets the corner be read at rest, and the probe proves
it), plus 6 REAL-POINTER Chrome tests in `tests/test_chart_scatter_cluster_chrome.py` (round 2, below)). `tsc`
and ruff clean; the Desktop bundle builds twice byte-identical
(`b947269b…`). Truthful before/after PNGs (`captures/`): old bar chart pixel-identical (byte-identical PNGs,
sha `394375b5…` both sides); scatter before drew a line with a change chip, after draws dots; histogram before
drew NOTHING (the block was refused), after draws its bins; the drill frame shows the dialog over the board.

**Disclosed trade-offs.** (1) Old stored charts draw exactly as before — the DOM diff on a stored bar chart is
one added attribute, `aria-haspopup="dialog"` (invisible; the PNGs are byte-identical). (2) A pie slice's click
now opens its detail instead of toggling the fade; the fade itself still works on hover and the arrow keys, and
Escape still steps down — the card asked for segment clicks to drill, and a second click to unselect had a
wider use than a detail view never took away. (3) `kind: "scatter"` previously drew a line; a stored scatter
chart therefore changes appearance — that is the opt-in working, and the only stored-kind behaviour change.
(4) Histogram bins are the reader's call, not the model's: ~6 bins at round edges (niceTicks), always the same
for the same values; no bin controls, per the AI-decides rule. (5) A scatter with one repeated x value centres
its dots (a zero-width axis would put them all at the left edge); words as x labels fall back to even spacing.
(6) The dialog reuses the host's `.hb-overlay-close` styling (blockTag.css) — the capture frames therefore join
the host sheet, as the app ships it. (7) Two charts on one board can each hold a drill state; only one dialog
is ever on screen because the first covers the board — a second cannot be clicked through, and Tab stays in the
open dialog.

**Review corrections (round 1).** Two integration probes against the real components — the reviewer's, and the
tests this pass adds — pinned defects the unit view could not see:

- **One Escape collapsed two layers when nested.** The expanded board, the chart detail over it and the photo
  over both each listened on the window on its own; the board sniffed for an open photo and stood aside, and
  the detail sniffed the same — but nothing sniffed the detail. Escape on a detail opened inside an expanded
  board therefore closed the detail AND the board together, losing the view the reader had just come from.
  `core/overlays.ts` gives all three one LAYERED stack: an open layer takes the top, keys answer the topmost
  layer alone (it stops the event where it stands — one keypress steps the reader down exactly one layer, never
  two), and a closing layer hands focus back to what opened it: the detail returns it to the drawing it drilled
  from, pick intact; the board returns it to the expand control. The board's Tab trap sleeps while anything
  rides above it. Vitest now exercises the actual `BlockTag`: expand a board → drill a chart → Esc closes the
  detail only (board still up, focus and the picked point back on the drawing) → Esc closes the board (focus on
  the control); Tab and Shift+Tab wrap inside the topmost dialog alone, and the board's own trap demonstrably
  resumes underneath. The photo-above-board behaviour the accept phase shipped is now the stack answering the
  same key, unchanged from the reader's side.
- **A scatter with a repeated x drilled the wrong datum.** Two points sharing an x are drawn AT the same pixel
  (a value axis of width zero centres them), and the pick kept the LOWEST index on that tie — clicking the
  second of x `[1, 1]`, y `[10, 90]` opened Point 1 and said 10 where the reader aimed at 90. Wrong numbers,
  not wrong pixels. Each scatter dot now carries its own point index (`data-pt`) and the pick reads it from the
  element under the pointer: the detail is resolved from the clicked mark's identity, never from an x re-lookup
  (a pointer not on a dot still falls back to the nearest x label, as everywhere else; hovering a dot says that
  dot too). The detail also names the ordinal — "Point 2 of 2" — so even exact duplicates open their own, one
  each. Regression tests: a repeated x opens the SECOND point's value; exact duplicates each open their own; a
  repeated x across two series opens the clicked point's pair; an ordinary distinct-x control still opens the
  clicked point; and a negative control pins the wrongness the identity replaces — `nearestXIndex` on the same
  tie still returns the first point.

The refreeze rebuilt everything on these fixes: vitest 664/77 (+13 here), pytest 776 unchanged (the python side
and the Chrome geometry are untouched), `tsc`/ruff clean, the byte-identical bundle above, and captures drawn
again from the corrected tree — the old bar-chart pair is byte-identical still (dots carry their index; columns
never grew an attribute).

**Review corrections (round 2).** The round-1 identity fix keyed the pick off the dot under the pointer — true
of every point, except one shape the synthetic tests could not see: points that coincide EXACTLY (same x and
same y — duplicates, or two series crossing at one value) draw at one pixel, and SVG hit testing returns only
the last-painted circle. The reviewer proved it in a real browser: every coordinate over the spot hit the
topmost `data-pt` and never the point beneath, so that point simply had no way to be opened. `fireEvent` on a
held element reference bypasses the browser's own hit testing and could never have caught this — so round 2 is
pinned in real Chrome, and the mechanism follows from it:

- **A spot of several points is one cluster, walked one click at a time.** `dotSpots` groups the dots by their
  exact drawn position (equal labels and equal values compute equal floats, so coincidence is decided by the
  drawing itself, not by value comparison). A real click at the spot opens its FIRST point; each successive
  click at the same spot opens the next (wrapping); a click anywhere else resets it. The dots never move — no
  jitter, no re-stacking, the chart reads exactly as the data says — and the spot wears a small `×n` badge
  (`pointer-events: none`) so the reader can see several points live there. Hovering the spot previews exactly
  what a click commits: the point lit under the pointer is the one the NEXT click opens (during a cycle that is
  the dot beneath, not necessarily the one painted topmost — pinned in vitest). The detail names the position at
  the spot: "Point 2 of 5 — 1st of 2 here". Keyboard readers reach every coincident point one step at a time
  anyway (each has its own index; arrows + Enter open each own detail) — now verified with REAL key events.
- **A dialog's own close could no longer eat the pick.** The cycle must survive open→close→reopen, but in a
  real browser removing the dialog makes Chrome fire a delayed blur at the drawing a beat AFTER focus has been
  handed back, with nothing in `relatedTarget` — the old `pickKeys.onBlur` treated it as "left the drawing"
  and cleared the pick (and the cycle position) exactly then. That event does not exist in jsdom. A blur that
  hands focus somewhere still clears (real leaving); a blur with no target does not. Pinned both ways: in
  vitest and with real Chrome events (after Escape, the lit dot is still the lit dot).
- **Six REAL-POINTER regressions, no new dependencies.** `tests/test_chart_scatter_cluster_chrome.py` drives
  headless Chrome over the DevTools Protocol with a stdlib websocket client: real `Input.dispatchMouseEvent`
  clicks at measured coordinates against the checkout's own components (esbuild-bundled, nothing written into
  the tree), real `Input.dispatchKeyEvent` for the keyboard. The premise is pinned as the standing negative
  control — every coordinate over a twin spot (centre, four neighbours, four corners) returns ONLY the
  topmost dot, so a handler trusting the hit alone can never open the point beneath. Then: successive real
  clicks at ONE coordinate open "1st of 2 here", then "2nd of 2 here", then wrap — closing each dialog by
  really clicking its own close control; a coincident pair across two series opens each series's own values in
  turn; the real keyboard opens each point and keeps its pick across the close; and a control chart with no
  coincident dots shows no badge and never cycles (a second click reopens the same datum, as before).
  Vitest adds the same matrix at unit level (cycle, wrap, reset-elsewhere, cross-series pairs, the ordinal
  wording, badge presence/absence, the dot grouping itself) — 5 of its cluster tests and the blur pin were
  confirmed to FAIL against the reviewed bytes before the fix went in.

Only scatter drawings where two points share one exact pixel gain ink (the `×n` badge); every other chart's DOM
and pixels are untouched — the four existing capture frames were re-rendered from this tree byte-identical to
the reviewed set, and the old bar-chart pair still matches itself. The new cluster frames are truthful both
ways: BEFORE is the round-1 tree (no badge; a real click at the spot can only ever open the topmost point, and
its dialog frame shows exactly that), AFTER is this tree (badge, and a real click opening the spot's first
datum).

The refreeze rebuilt everything on these fixes: vitest **672/77 (+8 here — the 7 plus a pin that the cluster
hover PREVIEW equals what the next click commits: RED on the first round-2 cut, which lit the last-opened
datum instead)**, pytest 782 (+6 real-pointer), `tsc`/
ruff clean, the byte-identical bundle above, and all captures re-drawn from the corrected tree.

---

## 9. follow-ups — `follow_ups`: a quiet strip of tappable continuations under the board (enhancement #5, this card)

The board's envelope gains one more word, beside `align`, `text_align`, `as_of` and `live`: an optional
`follow_ups: [{label, run}]` of one to four prompts the AI offers beneath the board, so the reader can
continue the conversation in one tap. The presentation is AI-directed; the reader gets no controls.

- The write path (`tools/show_blocks.py`, `blocks/common.py`): the parameter is checked like the actions
  row is — every button needs both halves, a message Hermes would act on before the model (a command, a
  shell line, an @-reference) is refused with the same NO_SEND problem, and a board that says it well stores
  it in the envelope beside its words. `describe()` is untouched: like `interactive` before it, the model
  reads the documentation beside the parameter itself.
- The read path (`core/store.py` `follow_ups_of`, `dashboard/plugin_api.py`): served beside the blocks, as
  every board word is; an `include` still takes just the blocks.
- The web read (`core/readBlocks.ts`): the envelope word reads leniently like a row of action buttons
  (aliases included, NO_SEND items dropped with the note, at most four kept) — and both words are kept
  WHOLE: the writer stored the entire message, a read cut would send a different message than the board
  offered, and length is the row's business to wrap, not the reader's to amputate (round-2 correction: the
  generic 40/300 caps that quietly applied here are gone for follow-ups). Only from an envelope, never
  from a block that merely spells its children `blocks`.
- The drawing (`core/FollowUps.tsx`, `core/Blocks.tsx`, `tokens.css`): a flex row beneath the blocks — and
  beneath the provenance footer when there is one — built from the shipped `.hb-pill`. It costs a
  fit-content hug ZERO width (`width:0 + min-width:100%`, the interactive-table tools row's own trick),
  its pills wrap and its labels WRAP rather than clip (`white-space:normal; overflow-wrap:anywhere`, the
  round-3 lesson), long words wrap line for line at the narrowest hug with the status word on its own
  line beneath the pills, and it takes the board's placement (`center`/`right` classes only when asked; the
  default DOM is byte-identical to the board without the word).
- The send is the existing seam, not a new mechanism: a tap calls `send(run, { force: true })` —
  interactive-table #3's explicit route, so a prompt past MAX_SENT is POSTED whole (the tap showed it in
  full, title included) while the command/file guard still holds. The word on the row is only ever the
  host's own answer — sent / drafted / blocked / failed / no chat — and it belongs to the LAST tap; a new
  tap replaces the old word with a quiet "pending" mark the moment it starts, so a success never stands
  for a tap the host has not answered (round-2 correction). The vocabulary now lives once, exported as
  `SENT_WORDS` from `host/actions.ts` (the table's words moved there unchanged).
- Single-instance preserved: the strip is drawn inside the ONE `<Blocks>` the expand dialog moves (never a
  second instance), rides into the dialog and back with its state, and takes no layer of its own — a chart
  detail opened above still answers the first Escape, and the board steps down only on the second.

## Combined candidate

- Branch `combined-candidate` on baseline `5f223c2`; commits `cb4f9e5` (tiles) → `956d9dd` (images) →
  `10b8d52` (BlockTag) → `d49c5da` (rebuilt `desktop/plugin.js`).
- Source files are disjoint across the three changes; the only shared artifact is the built Desktop bundle
  `desktop/plugin.js`, regenerated once over all three and built twice to a byte-identical file.
  **SHA-256** `8e87fc005f5fe5cc7fab863ac9f9a2ee4681f0fa726a8f059fc8d17960b59274`.
- Full CONTRIBUTING checks on the combined tree: `pytest` **676 passed** · `ruff` (E,F,W,UP,PTH @ 120)
  clean · `vitest` **501 passed / 70 files** · `tsc --noEmit` clean. Baseline `5f223c2` was 661 pytest /
  473 vitest: tiles +9 vitest, images +15 pytest / +19 vitest, BlockTag renames 3 of its existing 6.
- Taking only some changes: cherry-pick the wanted subset and rerun `cd web && npm run build`; do not mix
  the combined bundle with a partial source tree.
- The alignment change (section 4) is on branch `alignment`, off the combined candidate (`3fe1783`), with its
  own rebuilt bundle; it assumes the combined three are in place and was tested there.
- The provenance change (section 5) and the AI-decided alignment rework (section 4's round 2) are stacked on
  that line; the expand change (section 6) sits on the accepted auto-alignment tree (`6a296f1`, tree
  `53a14b8e`) on branch `fullscreen-board`, with its own rebuilt bundle
  (`9c2c1010aee2…`); it assumes everything above it and was tested there.
- No new runtime dependency (the build still bundles only `web/src`), no new network call, no Hermes
  host/app change, no new block type, no `catalog.json`/prompt-size change (`tests/fixtures/describe.txt`
  untouched; the description-budget test passes).
