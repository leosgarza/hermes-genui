# Roadmap — leosgarza/hermes-genui

A friendly fork of [sagarmainkar/hermes-genui](https://github.com/sagarmainkar/hermes-genui) —
the generative-UI plugin that draws charts, tables, plans, calculators and explainers right inside
Hermes Desktop chat replies.

## Why this fork exists

We use hermes-genui every day and want it to keep getting better for real work. This fork is where we
build and test enhancements at our own pace, then **offer each finished, independently-reviewed
increment upstream** as a small, focused pull request. Sagar, the maintainer, decides what fits the
main project — nothing here is meant to pressure that decision. If an enhancement isn't taken
upstream, it still lives here and works for us.

## How we work

1. **Build** one enhancement in isolation, on the latest accepted tree.
2. **Review** independently — a separate reviewer re-runs the full tests and real-browser checks.
3. **Promote** to our local install only after review passes.
4. **Offer upstream** as one small, tested PR per enhancement, linked below.

## The pipeline

| # | Enhancement | Why it matters | Local status | Upstream |
|---|-------------|----------------|--------------|----------|
| 1 | Provenance footer (source · as-of · snapshot badge) | Trust: AI-rendered data should say where it came from and when | ✅ done | not yet offered |
| 2 | Expand / full-screen board | Big, dense visuals need room | ✅ done | not yet offered |
| 3 | Interactive table (filter / search / select, tap-to-send) | Tables become conversational, not just static | ✅ done | not yet offered |
| 4 | Chart drill-down + true scatter / histogram | Explore a point; see distributions honestly | ✅ done | not yet offered |
| 5 | Follow-up suggestions strip | One tap continues the conversation | ✅ done | not yet offered |
| — | AI-decided alignment | The model places text for best effect; no reader fiddling | ✅ done | not yet offered |
| 6 | Export PNG / CSV / Markdown | The bridge from chat to decks, reports and messages | ✅ done | not yet offered |
| 7 | AI-adaptive density / palette / motion | The model tunes presentation to content & audience — no reader panel | 🔨 building | — |
| 8 | Pin / save boards to a Library | Reuse dashboards as durable assets | ✅ done | not yet offered |
| 9 | Refresh / stale indicator | Know when data is old | 📋 planned | — |
| 10 | Motion + form-validation polish | Accessibility and feel | 📋 planned | — |

## Already upstream 🎉

- **#16** — graceful hiding of stray / unloadable `::blocks` tags (no more grey error boxes). *Merged.*
- **#12** — readable tile text (full reasons, no hover needed). *Merged.*
- **#50** *(open)* — a design note offering local-file image rendering for `image_generate`, for Sagar to consider.

## Avoiding duplicate work

If you're thinking of building something similar, please open an issue or PR on the
[main project](https://github.com/sagarmainkar/hermes-genui) — that's where the community coordinates.
This roadmap shows what we're already working on so we don't cross wires. We watch the main project's
open PRs and issues for the same reason.

---

*Status key: ✅ done (built, reviewed, installed locally) · 🔨 building · 📋 planned.
"Upstream" tracks whether an increment has been offered to the main project as a PR.*