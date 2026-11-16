# UPSTREAM — three reviewed enhancements, one combined local candidate

For the hermes-genui maintainer. This documents three small changes a daily user runs locally on top of
upstream `main` @ `5f223c2`. Each is independent, tested, and adoptable on its own; the combined branch is
offered as a convenience. Nothing here changes Hermes itself: no host/app change, no new runtime
dependency, no new network call, no new block type, no catalog/prompt-text change.

Baseline: `5f223c2` · Branch: `combined-candidate` · Owner of this build: leosgarza (daily user, plugin owner approval on file).

| # | Change | Commit (combined) | Original | Adoption path |
|---|--------|-------------------|----------|---------------|
| 1 | tiles: decision reason readable at a glance | `cb4f9e5` | `0ea1a80` on `leosgarza/hermes-genui` branch `tiles-readability-fix` | already opened as [PR #12](https://github.com/sagarmainkar/hermes-genui/pull/12) |
| 2 | images: draw tool-generated local files | `956d9dd` | `35078bf` (local-only) | candidate PR for the direction discussed in [issue #11](https://github.com/sagarmainkar/hermes-genui/issues/11) |
| 3 | BlockTag: hide a block that cannot load | `10b8d52` | same commit (new) | new proposal — see trade-off below |
| — | rebuilt bundle for all three | `d49c5da` | — | rebuild after taking any subset |

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
- No new runtime dependency (the build still bundles only `web/src`), no new network call, no Hermes
  host/app change, no new block type, no `catalog.json`/prompt-size change (`tests/fixtures/describe.txt`
  untouched; the description-budget test passes).
