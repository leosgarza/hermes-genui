# Real-browser regression for the model's adaptive-look words (enhancement #7).
#
# jsdom never lays anything out and never resolves a var() fill to a colour, so the three things this build
# promises — that `density: compact` measurably tightens the rhythm, that `palette: cool/warm` measurably
# recolours chart series while the app's ink/accent stay put, and that `motion: reduced` stills CSS animation
# WITHOUT the reader's own prefers-reduced-motion ask ever being taken away — can only be proven in real
# Chrome. The page feeds Chrome the repo's own stylesheets with the DOM the frozen renderer draws (the same
# method test_layout_alignment.py established) and measures geometry, computed tokens, SVG fills, computed
# colour and computed animation. The page is run twice: once as a reader with no system ask, once with
# --force-prefers-reduced-motion. Across the two runs the four motion cells must read:
#
#                        no system ask        reader asks reduce
#   full / unsaid board  animates (today)     stills   <- the floor, never overridden
#   reduced board        stills                        stills
#
# and the negative-control board wears data-density="tight" — a word the renderer never grows — to prove the
# CSS keys on the exact value, not the mere presence of the attribute.
import html
import os
import re
import subprocess
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "web" / "src"
CSS = [
    SRC / "styles" / "tokens.css",
    SRC / "styles" / "shared.css",
    SRC / "blocks" / "chart" / "chart.css",
]

CHROME_CANDIDATES = [
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/usr/bin/google-chrome"),
    Path("/usr/bin/chromium"),
    Path("/usr/bin/chromium-browser"),
]


def find_chrome() -> Path | None:
    env = os.environ.get("HB_CHROME")
    if env and Path(env).exists():
        return Path(env)
    for name in ("chrome", "google-chrome", "chromium", "chromium-browser"):
        found = subprocess.run(["which", name], capture_output=True, text=True).stdout.strip()
        if found:
            return Path(found)
    return next((p for p in CHROME_CANDIDATES if p.exists()), None)


CHROME = find_chrome()


def cards(base: str) -> str:
    """Three blocks with the DOM the frozen renderer gives a board: two cards around a line of prose, so the
    gap between every neighbour pair and the padding inside both cards are measurable. The value word carries
    data-word, like every measured word in the alignment suite."""
    return (f'<div class="hb-card hb-kpi" id="{base}-one"><div class="hb-kpi-label">Revenue</div>'
            f'<div class="hb-kpi-value" id="{base}-word" data-word>12.4M</div></div>'
            f'<div class="hb-text" id="{base}-prose">A prose line, long enough to fill the column.</div>'
            f'<div class="hb-card hb-kpi" id="{base}-two"><div class="hb-kpi-label">Cost</div>'
            f'<div class="hb-kpi-value" id="{base}-word2" data-word>9.7M</div></div>')


def bars(base: str) -> str:
    """A chart's two first series, filled exactly the way the frozen renderer fills them: the palette words
    var(--hb-chart-N) as attributes on .hb-chart-bar paths (ColumnMarks.tsx via partColour)."""
    return (f'<figure class="hb-card hb-chart" id="{base}-fig">'
            f'<svg width="160" height="80">'
            f'<path class="hb-chart-bar" id="{base}-s1" fill="var(--hb-chart-1)" d="M10 80 L10 30 L40 30 L40 80 Z"/>'
            f'<path class="hb-chart-bar" id="{base}-s2" fill="var(--hb-chart-2)" d="M60 80 L60 45 L90 45 L90 80 Z"/>'
            f'</svg></figure><span class="hb-chip hb-chip-soft" id="{base}-ink">ink</span>')


def appear(base: str) -> str:
    """The moving markup as it ships: an appearing panel and a pill that glides."""
    return (f'<div class="hb-appear" id="{base}-appear"><span id="{base}-words">Quiet panel</span></div>'
            f'<button class="hb-pill" id="{base}-pill" type="button">Send</button>')


MEASURE = """
const out = [];
const rel = (r, b) => (r.left - b.left).toFixed(3);
for (const root of document.querySelectorAll("[data-root]")) {
  const id = root.id;
  const kids = [...root.children];
  if (kids.length >= 3) {  // rhythm: the REAL gap two neighbours measure, and the padding a word sits in
    out.push(`${id}-gapA ${kids[1].getBoundingClientRect().top - kids[0].getBoundingClientRect().bottom}`);
    out.push(`${id}-gapB ${kids[2].getBoundingClientRect().top - kids[1].getBoundingClientRect().bottom}`);
    const card = kids[0].getBoundingClientRect();
    const word = root.querySelector("[data-word]").getBoundingClientRect();
    out.push(`${id}-pad ${rel(word, card)}`);
    // pady from the card's FIRST content (the label above the value): border + padding, nothing else.
    const first = kids[0].firstElementChild.getBoundingClientRect();
    out.push(`${id}-pady ${(first.top - card.top).toFixed(3)}`);
  }
  const st = getComputedStyle(root);
  out.push(`${id}-tok ${st.getPropertyValue("--hb-gap").trim()}|${st.getPropertyValue("--hb-margin").trim()}|` +
    `${st.getPropertyValue("--hb-card-pad-x").trim()}|${st.getPropertyValue("gap")}`);
  for (const s of ["s1", "s2"]) {
    const p = root.querySelector(`[id$="-${s}"]`);
    if (p) out.push(`${id}-${s} ${getComputedStyle(p).fill.replace(/\\s+/g, "")}`);
  }
  const ink = root.querySelector("[id$='-ink']");
  if (ink) out.push(`${id}-ink ${getComputedStyle(ink).color.replace(/\\s+/g, "")}`);
  for (const m of [["appear", "animationName"], ["appear", "animationDuration"], ["pill", "transitionDuration"]]) {
    const el = root.querySelector(`[id$="-${m[0]}"]`);
    if (el) out.push(`${id}-${el.id.split("-")[1]}-${m[1]} ${getComputedStyle(el)[m[1]]}`);
  }
}
document.getElementById("out").textContent = out.join("\\n");
"""


def fixture_html() -> str:
    css = "\n".join(p.read_text() for p in CSS)
    roots = f"""
    <div class="hb-blocks" data-root id="plain">{cards("plain")}</div>
    <div class="hb-blocks" data-root id="comfortable">{cards("comfortable")}</div>
    <div class="hb-blocks" data-density="compact" data-root id="compact">{cards("compact")}</div>
    <div class="hb-blocks" data-density="tight" data-root id="unknowndensity">{cards("unknowndensity")}</div>
    <div class="hb-blocks" data-root id="paldefault">{bars("paldefault")}</div>
    <div class="hb-blocks" data-palette="cool" data-root id="palcool">{bars("palcool")}</div>
    <div class="hb-blocks" data-palette="warm" data-root id="palwarm">{bars("palwarm")}</div>
    <div class="hb-blocks" data-root id="motionfull">{appear("motionfull")}</div>
    <div class="hb-blocks" data-motion="reduced" data-root id="motionreduced">{appear("motionreduced")}</div>
    """
    return ("<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{css}</style></head>"
            f"<body style='margin:0;width:1200px'>{roots}<pre id='out' style='display:none'></pre>"
            f"<script>{MEASURE}</script></body></html>")


def run_page(extra_flags: list[str]) -> dict[str, str]:
    """Chrome the fixture once and return probe lines: key → single field after the key."""
    with tempfile.TemporaryDirectory() as work:
        page = Path(work) / "probe.html"
        page.write_text(fixture_html())
        profile = Path(work) / "profile"
        profile.mkdir()
        cmd = [str(CHROME), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
               "--force-device-scale-factor=1", f"--user-data-dir={profile}", "--virtual-time-budget=2000",
               "--dump-dom", *extra_flags, f"file://{page}"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        m = re.search(r"<pre id=\"out\"[^>]*>(.*?)</pre>", proc.stdout, re.S)
        assert m, f"probe never reported; chrome said: {proc.stderr[-400:]}"
        text = html.unescape(m.group(1)).strip()
    out: dict[str, str] = {}
    for line in text.splitlines():
        key, _, field = line.partition(" ")
        out[key] = field
    return out


@pytest.fixture(scope="module")
def plain_page():
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    return run_page([])


@pytest.fixture(scope="module")
def reduced_page():
    if CHROME is None:
        pytest.skip("no Chrome/Chromium binary on this machine")
    return run_page(["--force-prefers-reduced-motion"])


def near(a: str | float, b: float, eps: float = 1.0) -> bool:
    return abs(float(a) - b) <= eps


class TestDensity:
    def test_compact_measurably_tightens_every_gap(self, plain_page):
        # Real neighbour spacing, as Chrome lays it out: comfortable draws today's 10px, compact halves the
        # air. The probe reads geometry between rects, not classes.
        for key in ("comfortable-gapA", "comfortable-gapB", "plain-gapA", "plain-gapB",
                    "unknowndensity-gapA"):
            assert near(plain_page[key], 10.0), (key, plain_page[key])
        for key in ("compact-gapA", "compact-gapB"):
            assert near(plain_page[key], 5.0), (key, plain_page[key])

    def test_compact_measurably_tightens_card_padding(self, plain_page):
        # The word inside a card sits 16+1px from its edge comfortable, 12+1px compact, and 14+1 vs 9+1 from
        # the top. A board whose rhythm changed only its class would show identical pixels; these do not.
        assert near(plain_page["comfortable-pad"], 17.0), plain_page["comfortable-pad"]
        assert near(plain_page["compact-pad"], 13.0), plain_page["compact-pad"]
        assert near(plain_page["comfortable-pady"], 15.0), plain_page["comfortable-pady"]
        assert near(plain_page["compact-pady"], 10.0), plain_page["compact-pady"]
        assert float(plain_page["comfortable-pad"]) - float(plain_page["compact-pad"]) >= 3.5

    def test_absent_and_comfortable_words_measure_identically(self, plain_page):
        # No regression to existing boards: an unsaid board and a comfortable board are the same page down to
        # the token cascade — the renderer grows no attribute, and the tokens are exactly what shipped before.
        assert plain_page["plain-tok"] == plain_page["comfortable-tok"]
        assert plain_page["plain-gapA"] == plain_page["comfortable-gapA"]
        assert plain_page["plain-tok"].startswith("10px|8px|16px|10px"), plain_page["plain-tok"]

    def test_negative_control_an_unknown_density_word_is_as_unsaid(self, plain_page):
        # data-density="tight" — a word the renderer NEVER grows (the web reader drops it) — must not move a
        # pixel: the CSS keys on the exact value "compact", not on the attribute's presence.
        assert near(plain_page["unknowndensity-gapA"], 10.0), plain_page["unknowndensity-gapA"]
        assert near(plain_page["unknowndensity-pad"], 17.0), plain_page["unknowndensity-pad"]


class TestPalette:
    def test_palette_recolours_chart_series(self, plain_page):
        assert plain_page["paldefault-s1"] == "rgb(79,124,255)"   # var() resolves in real Chrome, house set
        assert plain_page["paldefault-s2"] == "rgb(245,158,11)"
        assert plain_page["palcool-s2"] == "rgb(13,148,136)"      # teal replaces the amber
        assert plain_page["palwarm-s1"] == "rgb(239,68,68)"       # red replaces the blue
        assert plain_page["palcool-s1"] == plain_page["paldefault-s1"]  # cool keeps the house blue first
        assert plain_page["palwarm-s2"] == plain_page["paldefault-s2"]  # warm's amber is the house amber

    def test_palette_never_touches_the_ink(self, plain_page):
        # Themes and inherited accent stay: the soft chip's colour (accent-derived) reads identical in every
        # palette. If a palette sheet ever grew an --hb-accent/--hb-ink override, this reddens.
        assert plain_page["paldefault-ink"] == plain_page["palcool-ink"] == plain_page["palwarm-ink"]

    def test_absent_palette_word_draws_the_house_set(self, plain_page):
        # The board that never spoke the word: house set, and measurably not the recoloured ones.
        assert plain_page["paldefault-s1"] == "rgb(79,124,255)"
        assert plain_page["paldefault-s2"] == "rgb(245,158,11)"
        assert plain_page["paldefault-s1"] != plain_page["palwarm-s1"]


class TestMotion:
    def test_reduced_word_stills_css_animation_for_its_board(self, plain_page):
        assert plain_page["motionfull-appear-animationName"] != "none"     # today's board animates
        assert plain_page["motionreduced-appear-animationName"] == "none"  # the word stills it
        assert plain_page["motionreduced-appear-animationDuration"] == "0s"
        def dur(line):
            return [float(t.strip().rstrip("s")) for t in line.split(",")]
        assert max(dur(plain_page["motionfull-pill-transitionDuration"])) > 0  # today's pill glides
        assert max(dur(plain_page["motionreduced-pill-transitionDuration"])) == 0.0  # the word stops it

    def test_reader_floor_overrides_every_word(self, reduced_page):
        # The cell that matters most: with the reader's own ask on, even the full (unsaid) board stills.
        # The model's word can add stillness but never remove it — both rows are "none" under the floor.
        assert reduced_page["motionfull-appear-animationName"] == "none"
        assert reduced_page["motionreduced-appear-animationName"] == "none"

    def test_floor_page_still_lays_out_and_colours(self, reduced_page, plain_page):
        # The floor stills motion; it must not disturb geometry or colour (the pages differ only there).
        assert reduced_page["compact-gapA"] == plain_page["compact-gapA"]
        assert reduced_page["palcool-s2"] == plain_page["palcool-s2"]
