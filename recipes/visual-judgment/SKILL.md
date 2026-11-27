---
name: visual-judgment
description: "Decide how a drawn board should look: the visual levers the block tools offer, when using one serves the message, and why plain is often the best answer. Guidance, never a mandate; read it before styling a board."
version: 0.1.0
platforms: [linux, macos, windows]
---
# Visual judgment

The block tools can do more than draw. Cards can place and read with intent, boards can pack tighter or looser,
charts can pick a palette, motion can settle, tables can go interactive, photos can come in. This recipe is about
**when** any of that helps — never how often. It is guidance, never a mandate: every lever below is a *may*, and
the model alone decides them; readers get no controls.

## The spine: purpose, not decoration

- Before using a lever, answer one question in your head: *what does this change do for this reader's
  understanding or feeling?* If you can't answer it in a sentence, don't do it.
- Plain is not a failure to enhance; often it is the best form. A genuine one-line answer stays a one-line answer:
  no board, no styling, nothing to place.
- Emphasis, colour and motion are punctuation: a few deliberate marks beat many random ones. Never decorate to
  look busy, and never use a lever just to prove you can.
- Choose the lightest form that fits the message — prose, then a plain board, then a styled one — moving up only
  when the step below it wouldn't communicate.

## 1. Know your levers (read the live schema, not memory)

The `show_blocks` parameter descriptions, the block catalog and the tools available in this session are your
ground truth, so anything a contributor or a newer Hermes adds shows up there for you automatically. Read what
the tools actually offer — parameters, catalog entries, tool names — never invent a lever they don't name.
Today's toolkit:

- **`align`** — where a card sits (or the whole board): left (the default) | center | right.
- **`text_align`** — how the words in the board's text blocks read: left | center | right.
- **`density`** — `comfortable` (airier, the default) | `compact` (fit a lot of figures on one screen).
- **`palette`** — `default` (the house set) | `cool` | `warm`; recolours chart series only.
- **`motion`** — `full` (the default) | `reduced` (settles at once).
- **Block choice** — every block type's `for` and `use_when` in the catalog is its own guidance. The big ones: an
  interactive table (`interactive: true` lets the reader search and pick rows), photos from `find_photos`,
  `follow_ups` prompts under the board, `as_of` and `live` in the footer.
- **Generated imagery** — where the session offers an image-generation tool (`image_generate`), you may generate
  a picture and draw it in an `image` or `tiles` block. Only the reference the tool returns — an https URL or a
  local path — passes `show_blocks`' provenance gate, so a picture no tool produced never reaches a board; use
  exactly what the tool handed back. Consider it when the message needs an image of something no camera can show
  — an imagined scene for a story, an illustration of an idea, the mood of a place under reconstruction — and a
  real photo is not the point; for real people, places and products, `find_photos` is the honest source. Like
  every lever it must earn its keep: never generate to decorate, and when the tool isn't available,
  the lever is simply off.

Fonts are not a lever (the reader's app sets its own), and there are no reader-facing controls: you decide,
from the message.

## 2. Read the room (the conversation picks the form)

- **A story or plan to enjoy** → comfortable; prose reads left; a photo only where it adds atmosphere.
- **Data for work** (a dashboard, a tracker, an ops feed) → usually compact; `cool` for money and operations;
  `reduced` when people watch it all day; an interactive table when the reader will search or pick rows.
- **A decision** (a comparison, a verdict) → make the deciding number the first thing the eye lands on: one
  centered `stat` or `heading`; leave the rest plain.
- **A celebration** → the headline and the number of the moment may sit centered; that's the whole decoration.
- **A quick answer** → text. A small default board only when the answer already is one.

## 3. Judge, don't force (may, never must)

- Every lever is yours to *consider*; a board with zero styling decisions is not a missed opportunity, it is a
  legitimate answer.
- One or two purposeful touches read as design. Five unrelated ones read as noise.
- If the reason for a touch is "for variety" or "because it looks nice", that is decoration. Stop.

## 4. Learn the reader's taste

- **Before** styling a board for someone you have history with, check what you know of their visual preferences
  in memory for this user ("likes compact dashboards", "asked to cut animations", "wants the verdict first").
- Known taste wins over the defaults in this recipe — inside the hard rules below. Apply it without being asked.
- **After** feedback on the look ("too cramped", "center that", "no colour for me"), update that memory: one
  short sentence per taste, replace the stale one instead of stacking duplicates. This is preference memory,
  not model training: it shapes presentation, nothing else.

## Where a lever earns its keep

Heuristics you may borrow:

- A centered `heading` or `stat` makes it the first thing read; keep prose left — never center a paragraph.
- Place a card off-center on purpose: a right-placed note reads as an aside; a centered one reads as the point.
- `compact` when the reader scans; `comfortable` when the reader reads.
- `cool` for money and operations, `warm` for alerts and energy; keep `default` when a colour already carries
  meaning on its own or nothing special fits the subject.
- `reduced` for a quiet or wall-mounted board and anything meant for reading; `full` only when the animation
  itself makes a point (an explainer that builds step by step).

## Layout example (a decision the eye should make)

The Q3 number is what the meeting is about, so the headline and the stat ask for center once; the note below
stays left, the way notes do. Nothing else is styled.

```json
[
  {"type": "heading", "text": "Launch review · Q3", "align": "center", "text_align": "center"},
  {"type": "stat", "label": "New revenue", "value": "$1.2M", "change": 18, "align": "center"},
  {"type": "text", "text": "Q3 beat the plan by 18%, and the Q4 pipeline is already half covered. Details below, plain, because the number above is the whole point."}
]
```

## Rules

- Blocks only: never an HTML page, a `::preview` widget or a code block in place of a board (the plugin's
  standing rule).
- Numbers and photo URLs only from tools, search or the user.
- **Accessibility beats every preference above**: a device that asks for less motion always gets less, whatever
  you set; readability and contrast come before any look.
- This recipe ships with the plugin and users may edit it — follow their version of it, and a saved personal
  recipe overrides the relevant parts of yours.
