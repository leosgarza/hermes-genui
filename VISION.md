# Vision — hermes-genui as a living-interaction partner

*Prepared 2026-11-22 for Leo's fork (leosgarza/hermes-genui) by a Mixture-of-Agents council
(GPT-6.2-sol · DeepSeek-v4.1-flash · Qwen4-max, aggregated on Qwen4-max). Strategic direction,
not a build plan: implementation stays on the gated worker → independent-reviewer route, and
upstream offers remain small, tested, maintainer-led increments.*

**The north star (Leo's words):** the future is the *living interaction* between a person and the
Hermes system — being a **partner** with the system instead of just chatting; immersing yourself in
the project; feeling part of the project and the chat. More meaningful interactions matter more than
a growing transcript. The boards are the surface where that partnership happens.

**Horizons:** one month · six months · one year.

---

> 🔍 The real gap, in one line: living boards gave Hermes a memory. They did not yet give Leo a place to write. Every board today holds only the AI's voice; his decisions live scattered in the transcript. Partnership starts when his mark sticks to the board, signed, and the board tells him what changed and what needs him.

## Three directions

### SAFE — Boards that remember you
Does for Leo: every saved board opens with "what changed / why / what's still open," and his corrections stick. He resumes tomorrow without rereading the thread. Chat stays home.
Breaks: "each reply should stand alone; the reader's only input is the chat box."
Cheapest test: hand-write a changed/why/open note on one saved board. Can he pick up the task next day without opening the chat?

### BOLD — The shared decision table
Does for Leo: he marks a concern, corrects an assumption, or records a decision right on the board. Hermes proposes revisions visibly; it cannot quietly turn its suggestion into his decision. The next view shows what his action changed. A project gets a Front Page linking its boards, a standing goal, and a short "needs you" list.
Breaks: "the conversation is the container, and meaningful human input must arrive as a chat message."
Cheapest test: paper mock-up of board actions on one real decision, hand-simulating Hermes's reply, compared against doing it in chat.

### WILD — The board leaves the chat
Does for Leo: a project opens board-first, on a phone or browser, with no transcript needed. A colleague or second agent can mark it. He becomes editor-in-chief of boards other hands touch. Flywheel is the natural host.
Breaks: "one person, one conversation, one host; boards are private property of a thread."
Cheapest test: hand someone a static board-first project view who never saw the thread. Can they say what's decided, what's open, and what they'd ask Hermes next?

## Recommendation
**BOLD, entered through SAFE's parts, scoped to one loop.**
Build the decision loop, not the workspace. One board type Leo opens weekly, one recurring decision (the Update Brief's adopt / wait / investigate is ideal). His marks + point-and-ask + a "since you last looked" strip are the building blocks; proposal-then-accept is what makes them partnership rather than annotation. Simultaneously declare one real project's Front Page from existing Library + link + update-in-place — a zero-build probe of the container idea.
Why not SAFE alone: it improves continuity but leaves Leo talking about the work instead of acting on it. Why not WILD now: it bets the partnership on a new product, host, and audience at once. BOLD isolates the load-bearing question — does acting on the board make his contribution clearer and the work easier to resume? SAFE's primitives are unavoidable prerequisites for BOLD and WILD anyway, so nothing is wasted if the bet fails.

## Dissent (preserved)
*Strongest objection to the recommendation:*
The felt shift from reader to partner may come only from the container inversion — board as home, chat as commentary. A month spent on marks could produce a very good output while leaving the relationship unchanged; marking up a board he opens once a week is decoration with extra steps. If the Front Page probe shows he naturally opens the board before typing, reprioritize toward the container, not the marks.
Second objection, from the product's own constitution: "the AI decides, the reader has no settings panel." Marks are one honest step from becoming a settings panel by accretion. Hold the line — marks express intent about content ("this number is wrong," "this is decided"), never configuration of presentation (color, density, layout). If a proposed mark would survive being described as a preference, it does not belong.

## Red-team
Over-weighted: immersion and novelty. The wow decays in about two weeks. The durable measure is returned-to, not admired — sessions started on a board, marks per week, how little he re-explains. Not taps, not time spent, not how alive it looks.
Under-weighted: (1) Stateful features are promises. A board that loses his marks across an upgrade breaks trust worse than never offering them; he is his own only reviewer. (2) Every fork-only feature widens the gap against upstream's 0.4 block catalog. PR #55 is philosophical, so it has the largest rejection surface — split it into boring, independently defensible slices: stable IDs, then history, then links. (3) A beautiful board reads as verified. A living board can silently change a number he already exported into a deck; "as-of" must attach to each update, not just the board. (4) The maintenance trap is giving every block its own buttons, approval rules, and mobile exceptions.
Where plain chat wins: thinking out loud, ambiguity, negotiating what he even wants, one-off questions, sensitive nuance. Boards impose shape; premature shape is a real cost. KISS guard: a board earns existence only if it will be looked at twice. Everything else stays prose.
Do not design for a phone that does not exist — build the joint, not the app. Multi-person or multi-agent editing is a whole product (identity, permissions, conflict), not a one-month feature.

## Systems / first principles
The durable asset is not the components. It is three boring things:
1. A board document, not a picture: stable name, current version, sources and freshness, links, history. Export already proves the document is separable from the view — the joint is half-built.
2. Two layers that never overwrite each other: Hermes's content, and Leo's signed marks and decisions. A change log that only adds, never erases, yields history, the "what changed" strip, and decision provenance for free.
3. A tiny set of board actions any screen can send: ask about this, mark decided, mark wrong, keep, compare. A new host renders blocks and sends these actions; it does not reimplement behavior. That is why a phone can be a full partner with a fraction of the UI — phone is the return surface (glance, approve, flag, ask); Desktop is the work surface.
Boundary: the plugin owns meaning (blocks, marks, actions, provenance, the wrapper holding identity/history/links). The host owns rendering, navigation/follow-along, identity/permissions, storage/sync. Ask the host for exactly two hooks: store/fetch a board by ID, and deliver a board action into the turn. Two hooks is a sellable ask; a new architecture is not.
Catalog strategy: keep blocks dumb and catalog-shaped; keep the living magic in the wrapper above the blocks. Catalog churn then cannot destroy the capstone, and upstream can accept blocks piecemeal without endorsing the philosophy.
Generic vs Leo-specific: document, marks, actions, provenance, history, container, blocks are generic. His repos, verdict vocabulary, morning cadence, taste presets, project templates are data — content packs, never forked code paths. Test for every feature: would Sagar accept this with Leo's content removed? If not, it belongs in a pack, which Flywheel then consumes.
Trust invariant, one sentence: Hermes proposes, Leo disposes; fresh data never silently refreshes an old decision. If someone acts on an older version, show what changed first. Bounded history is for comparison, not a permanent audit trail.
Build now: document + marks layer + delta strip + one decision loop + action set + two-hook ask + Front Page from existing parts. Defer: sync, multi-user, universal canvas, phone editing, every layout.

## Lateral analogies
Patient chart: the hallway conversation is not the source of truth; the chart is. Many hands write, entries are signed and timed, nobody erases another's note — they add an addendum. That is the two-layer, never-overwrite model, and why it is a trust requirement, not a nicety.
Pull request: a proposal is not an acceptance. Hermes proposes, Leo merges. That separation is what makes a board a shared decision space instead of a pretty output.
Figma comments: the atomic unit of collaboration is not a message; it is a remark pinned to a location, with an owner and a resolved state. The cheapest known mechanism for turning an artifact into a shared working space — exactly what boards lack.

## The single cheapest de-risking experiment
The paper decision-loop comparison. No build. Take three pairs of comparable real update decisions. Same evidence, same board visuals. In one version Leo steers through chat; in the other he marks the board and a reviewer plays Hermes by hand. Next day, before opening the thread, ask him to name what he decided, why, and what's still open. Guard against authorship pride: have one other real human read a shared board during the week and say whether they felt part of it or merely shown it.
GO — in at least two of three, board-first makes the decision easier to steer or resume without making the other task harder, and he can always distinguish his decisions from Hermes's proposals. Build the one-month plan.
FIX-FIRST — he wants to act on the board but misreads what an action does, who made a change, or whether the evidence is current. Fix the cues and repeat the same test. Do not build the workspace yet.
PAUSE — chat plus a clear change note works as well or better in at least two of three, or the board action adds a step without changing the work. Ship the SAFE improvement instead, and re-run the container probe on a different project before adding features.

## Milestones
One month: prove one decision loop on one weekly board type. Marks + point-and-ask + delta strip there and on one more. Front Page assembled from existing parts as the container probe. Split PR #55 into boring slices; register one existing block as catalog-shaped; write the one-page plugin/host boundary with the two-hook ask. Watch one number: does he open a board before typing?
Six months: Library graduates into Projects (linked boards, standing goal, open decisions). Proposal mode with accept/reject and decision provenance, proven on a second board type before calling it general. A capped "needs you" lane (max 3) on the Update Brief's cadence. Phone as read-and-one-tap return surface when the host exists. One board rendering with no Hermes present — the Flywheel proof, content pack separated. Three to five blocks catalog-shaped. Upstream receives small reviewed PRs of the reusable interaction, not the philosophy.
One year: the workspace is home and chat is commentary. The same board IDs and marks follow him Desktop → phone → web. A second contributor, person or agent, is possible only if the trust primitives held. Flywheel ships on the same core with Hermes as one host among several. Upstream identity decided on purpose: either the wrapper is accepted and Leo stewards a standard, or the fork is a clean superset with a documented adapter. Do not drift into either.

## End state
From "I ask, it answers" to "we keep a place together, and it tends the place while I'm away." Leo sets direction and makes the calls; Hermes keeps evidence and open questions organized, proposes changes, and helps him pick up where they left off. He stops being a reader of replies and becomes editor-in-chief of a living workspace. A longer transcript is neither the goal nor the measure. Meaningful interactions, returned-to, and re-explanation saved are.
