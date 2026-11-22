# Living Boards — scroll-up re-anchor fix (document order)

**Status:** implemented, independently reviewed, and live on the owner's Hermes Desktop install.
**Layer:** Hermes Desktop app host (not the `hermes-genui` plugin). This complements the plugin-side Living Boards work in [sagarmainkar/hermes-genui#55](https://github.com/sagarmainkar/hermes-genui/pull/55).

## What it fixes

In a long conversation, scrolling back up can lazy-mount an *earlier* occurrence of a board tag after the latest one is already on screen. The previous follow-along anchor picked the winner by **mount order**, so the board could appear to stay at the older reply while the newest reply showed only the muted marker.

This patch chooses the anchor by **transcript document order** instead: the last occurrence in the conversation wins, regardless of which React mount happened first. Earlier occurrences stay as quiet, clickable "↓ this board was updated below" markers.

## Files

| File | Purpose |
|---|---|
| `living-boards-docorder-anchor.patch` | The host-side source patch (5 files: anchor logic, transcript directive, tests). |
| `before-scrollup.png` / `after-scrollup.png` | Sandbox placement captures. **Honesty note:** the fixture board host is empty in this harness, so these prove *marker/anchor placement* via the transcript, not a populated board render. |
| `trace-base.json` / `trace-fix.json` | DOM traces from the same strict scroll-up journey. Base ends with the card **not** in the last occurrence; fixed ends with the card **in** the last occurrence. |

## Patch identity

- Patch SHA-256: `76d6a2eabdb0fcce1973630e797ea4959b26d21c183c7dd4ffca50409db35ac3`
- Reviewed candidate commit: `e069063d63b34a4ea54c79af85015c702f8a7b02`
- Base it applies to: `91d815b114876e5b8f5f0b52541ca8cc8112dd6f` (the host branch that already carries the follow-along re-anchor feature).
- **Compatibility:** this is an increment on the host follow-along feature, not a standalone patch against upstream `main`. The follow-along precursor must be present for it to apply cleanly.

## Verification

- Focused UI tests: 4 files / 46 passed (reviewer re-ran independently).
- Same-start lazy-mount journey: base and fixed both start latest-only; base reproduces the stranded board, fixed keeps the board at the final reply.
- Two pinned-clock builds: 1,117-file manifests byte-identical.
- Live apply verified: install stamp `e069063d63`, code signature OK, fix chunk hash matches the reviewed build.

## Offer

Shared publicly as the completed host-side complement to Living Boards. Happy to adapt it into whatever shape fits the app's architecture, or to fold it into a larger follow-along PR if the maintainers want the whole feature together.
