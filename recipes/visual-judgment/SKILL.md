---
name: visual-judgment
description: "Decide how a drawn board should look: which block leads, what the live tools actually offer, and why plain is often the best answer. Guidance, never a mandate; read it before styling a board."
version: 0.1.0
platforms: [linux, macos, windows]
---
# Visual judgment

A drawn board decides what the eye lands on first, what sits beside what, and which numbers get the big type.
This recipe is about **when** any of that helps — never how often. It is guidance, never a mandate: every
choice below is a *may*, and the model alone decides them; readers get no controls.

## The spine: purpose, not decoration

- Before using a lever, answer one question in your head: *what does this change do for this reader's
  understanding or feeling?* If you can't answer it in a sentence, don't do it.
- Plain is not a failure to enhance; often it is the best form. A genuine one-line answer stays a one-line answer:
  no board, nothing to place.
- Emphasis and colour are punctuation: a few deliberate marks beat many random ones. Never decorate to look
  busy, and never use a lever just to prove you can.
- Choose the lightest form that fits the message — prose, then a plain board, then a shaped one — moving up only
  when the step below it wouldn't communicate.

## 1. Know your levers (read the live schema, not memory)

The `show_blocks` menu, the fields and examples `block_guide` returns for the blocks you are about to draw, and
the tools available in this session are your ground truth, so anything a contributor or a newer Hermes adds
shows up there for you automatically. Read what the tools actually offer — menu lines, fields, tool names —
never invent a lever they don't name. Today's toolkit:

- **Block choice** — every block's `for` and `use_when` in the menu is its own guidance. The big ones: `kpis` or
  a `stat` for the headline number, a `callout` for a verdict (one per reply, the menu says), `table` when the
  same attributes compare options, `chart` for a trend, `list` for ranked rows, `actions` to offer the next step.
- **Order** — the first block is what the eye lands on; `block_guide` ends by telling you to draw all blocks in
  order. Order is the layout lever: lead with the answer, and put the `source` line last.
- **Composition** — `columns` sets a figure beside a table, `row` lines up small cards, `tabs` group
  alternatives, `include` folds in a board a data tool already drew (like a `market_history` price board).
- **Emphasis** — a `table`'s `highlight` marks the winning row; a `callout`'s tone marks a tip, warning or
  verdict; `change` chips carry a number's direction.
- **Photos** — real pictures from `find_photos`; `images` draws them with captions.
- **Generated imagery** — where the session offers an image-generation tool (`image_generate`), you may generate
  a picture and draw it in an `image` or `images` block. Only the reference the tool returns passes the
  provenance gate, so a picture no tool produced never reaches a board; use exactly what the tool handed back.
  Consider it when the message needs an image of something no camera can show — an imagined scene for a story,
  an illustration of an idea — and a real photo is not the point; for real people, places and products,
  `find_photos` is the honest source. Like every lever it must earn its keep: never generate to decorate, and
  when the tool isn't available, the lever is simply off.
- **Keeping it** — the `dashboard` tool puts an assembly of these blocks on the Today page (see the today-page
  recipe); that is a different promise, not a way to decorate a reply.

Fonts, placement and colour schemes are not levers this version offers (the reader's app sets its own look).
If the live menu or `block_guide` ever names one, it joins the list above automatically, under the same spine.
There are no reader-facing controls: you decide, from the message.

## 2. Read the room (the conversation picks the form)

- **A story or plan to enjoy** → prose reads first; a `timeline` or `checklist` only where it earns its place;
  a photo only where it adds atmosphere.
- **Data for work** (a report, a tracker, an ops feed) → `kpis` on top for the headline numbers; the menu's
  table-versus-chart rule; a `heatmap` for a grid of values; `actions` for what the reader will do next.
- **A decision** (a comparison, a verdict) → make the deciding number the first thing the eye lands on: one
  opening `stat` or `kpis`, or the `callout` that carries the verdict; `highlight` the stronger row; leave the
  rest plain.
- **A celebration** → the headline and the number of the moment sit up top, big; that's the whole decoration.
- **A quick answer** → text. A small board only when the answer already is one.

## 3. The judgment guides the recipe

Recipes prescribe layouts; this recipe prescribes judgment, and judgment wins. When a recipe's prescribed block
order buries the highlight — its verdict or answer lands below the charts, left-aligned at the bottom of a
full board — move it up: lead with the verdict/answer block. Put the highlight first: prominent, the
focal point of the board (centered too wherever the live schema names a placement lever; today main offers
none, so first and big is the form), and never leave it small at the bottom. Everything else in the recipe
stays as written: this overrides order and prominence only, and the spine still governs how much you style
in the first place.

## 4. Judge, don't force (may, never must)

- Every lever is yours to *consider*; a board with zero styling decisions is not a missed opportunity, it is a
  legitimate answer.
- One or two purposeful touches read as design. Five unrelated ones read as noise.
- If the reason for a touch is "for variety" or "because it looks nice", that is decoration. Stop.

## 5. Learn the reader's taste

- **Before** shaping a board for someone you have history with, check what you know of their visual preferences
  in memory for this user ("wants the verdict first", "found dashboards too busy").
- Known taste wins over the defaults in this recipe — inside the hard rules below. Apply it without being asked.
- **After** feedback on the look ("the answer was buried", "too much table"), update that memory: one short
  sentence per taste, replace the stale one instead of stacking duplicates. This is preference memory,
  not model training: it shapes presentation, nothing else.

## Layout example (a decision the eye should make)

The Q3 number is what the meeting is about, so it leads: the verdict opens the board right under the title, the
stat carries its number, and the details come after — plain, because the top two lines are the point.

```json
[
  {"type": "heading", "text": "Launch review · Q3"},
  {"type": "callout", "tone": "tip", "title": "Verdict",
   "text": "Q3 beat the plan by 18%, and the Q4 pipeline is already half covered."},
  {"type": "stat", "label": "New revenue", "value": "$1.2M", "change": 18},
  {"type": "text", "text": "Quarters, costs and the full metrics table follow, from the finance export."}
]
```

## Rules

- Blocks only: never an HTML page, a `::preview` widget or a code block in place of a board (the plugin's
  standing rule).
- Numbers and photo URLs only from tools, search or the user.
- **Accessibility beats every preference above**: a board the reader can't parse at a glance fails whatever
  else it does — readability and contrast come before any look, and never let colour carry a meaning alone.
- This recipe ships with the plugin as a read-only skill; a personal recipe the user saved through
  `save_recipe` overrides the parts of it that conflict — follow theirs.
