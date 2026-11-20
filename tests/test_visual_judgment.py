"""The shipped visual-judgment recipe: how it registers, and the judgment it must teach.

The recipe is the plugin's judgment layer for its drawing tools as the 0.4 menu architecture offers them:
awareness of what the live tools actually name, form that follows the conversation, the judgment guiding a
recipe's prescribed layout, "may" and never "must", and learned reader taste — all under a spine of purpose
and restraint (plain is often the best form). These tests pin the spine and the pillars, so watering them
down later is a deliberate edit, not drift.
"""

import importlib
import json
import os
import subprocess
from pathlib import Path

import pytest

from conftest import ROOT, load_plugin_package

plugin = load_plugin_package()
recipes = importlib.import_module("hermes_genui.core.recipes")
prompt = importlib.import_module("hermes_genui.hooks.prompt_section")

RECIPE = ROOT / "recipes" / "visual-judgment" / "SKILL.md"
PROBE = Path(__file__).resolve().parent / "support" / "real_registry_probe.py"


def _lower():
    return RECIPE.read_text(encoding="utf-8").lower()


def test_the_recipe_ships_in_the_plugin():
    assert "visual-judgment" in [r.name for r in recipes.shipped()]


def test_the_recipe_registers_as_a_plugin_skill():
    """The path skill_view("hermes-genui:visual-judgment") takes: register() hands Hermes the recipe's name,
    its SKILL.md and its frontmatter description as a read-only plugin skill."""

    class Ctx:
        def __init__(self):
            self.skills = []

        def register_tool(self, **kwargs):
            pass

        def register_hook(self, *args):
            pass

        def register_skill(self, name, path, description="", **kwargs):
            self.skills.append((name, str(path), description))

        def register_system_prompt_section(self, *args, **kwargs):
            pass

        def dispatch_tool(self, *args, **kwargs):
            pass

        def get_config(self, key, default=None):
            return default

    ctx = Ctx()
    plugin.register(ctx)
    hit = [s for s in ctx.skills if s[0] == "visual-judgment"]
    assert len(hit) == 1, "registered exactly once, by its folder name"
    assert hit[0][1] == str(RECIPE)
    head = recipes.frontmatter(RECIPE.read_text(encoding="utf-8"))
    assert head["name"] == "visual-judgment"
    assert hit[0][2] == head["description"], "the skill's description is the frontmatter's"


def test_the_spine_levers_serve_the_message_only():
    text = _lower()
    assert "purpose, not decoration" in text
    assert "plain is not a failure" in text
    assert "never decorate" in text
    assert "lightest form" in text
    assert "one-line answer stays" in text


def test_pillar_1_awareness_reads_the_live_schema():
    text = _lower()
    assert "read the live schema" in text
    assert "block_guide" in text, "0.4: the fields and examples of the blocks you are about to draw"
    assert "menu" in text, "the show_blocks menu is the model's one line per block"
    assert "automatically" in text, "contributor additions surface without editing this file"
    assert "never invent" in text
    assert "are not levers this version offers" in text, "no promise of align/palette/motion, which main lacks"
    assert "reader-facing controls" in text
    for lever in ("block_guide", "columns", "highlight", "callout", "kpis", "include", "find_photos",
                  "image_generate", "market_history", "dashboard"):
        assert lever in text, lever


def test_image_levers_are_discovered_from_available_tools_and_prefer_the_real():
    """Awareness reads the tools AVAILABLE IN THE SESSION, not only block parameters, and the imagery choice
    is purpose-conditioned under the spine — generated imagery only for what no camera can show, the real
    searched photo as the honest source everywhere else."""
    text = _lower()
    assert "tools available in this session" in text
    assert "no camera can show" in text
    assert "honest source" in text


def test_pillar_1_covers_image_generation_purposefully():
    # image_generate is what main actually allowlists (hooks/tool_photos.py PHOTO_TOOLS), and show_blocks is
    # what refuses an image URL no tool returned (the provenance gate).
    text = _lower()
    assert "image_generate" in text, "the tool by name, so the model can look for it in its toolset"
    assert "provenance gate" in text, "only tool-returned images reach the board — inventing one fails"
    assert "never generate to decorate" in text, "the spine governs this lever too"
    assert "the lever is simply off" in text, "availability-gated: no tool, no promise"


def test_the_judgment_guides_the_recipe_layout():
    """The precedence rule: when a recipe's prescribed block order buries the highlight, judgment wins.
    (The stock-dashboard recipe puts its verdict callout fourth of five blocks — bottom of a full board.)"""
    text = _lower()
    assert "recipes prescribe" in text, "names the conflict: prescribed layouts vs judgment"
    assert "judgment wins" in text, "the precedence itself"
    assert "lead with" in text
    assert "focal point" in text
    assert "left-aligned at the bottom" in text, "the exact failure shape the owner caught"
    assert "overrides order and prominence only" in text, "narrow: the rest of the recipe still applies"


def test_pillar_read_the_room():
    text = _lower()
    for intent in ("story", "data", "decision", "celebration", "quick answer"):
        assert intent in text, intent


def test_pillar_guidance_never_a_mandate():
    text = _lower()
    assert "never a mandate" in text
    assert "may, never must" in text
    assert "consider" in text


def test_pillar_preference_memory_is_consulted_and_updated():
    text = _lower()
    assert "preferences" in text
    assert "memory" in text
    assert "update" in text
    assert "preference memory" in text


def test_accessibility_outranks_every_look():
    text = _lower()
    assert "accessibility beats" in text
    assert "readability and contrast come before" in text


def test_plain_stays_a_first_class_choice():
    assert "zero styling decisions" in _lower()


def test_the_recipe_is_listed_within_the_prompt_budget():
    """Listing a recipe is free guidance; the always-on drawing rule is what has a budget. The new name must
    be enumerable in it, and the whole rule must still fit under MAX_CHARS — the recipe adds no other
    always-on cue."""
    rule = prompt.draw_rule(recipes.shipped())
    assert len(rule) <= prompt.MAX_CHARS, f"prompt budget bust: {len(rule)} > {prompt.MAX_CHARS}"
    assert "visual-judgment" in rule, "the model is told to load it when one fits"


# — the registration criterion, run for real —————————————————————————————————————————
#
# The seam test above proves register() hands Hermes the right tuple. This one proves the claim that tuple
# stands behind: skill_view("hermes-genui:visual-judgment") resolving through the REAL Hermes plugin registry
# (hermes_cli.plugins discovery + tools.skills_tool serving + the plugin's own register() running under the
# real PluginContext). It runs in a subprocess with a THROWAWAY HERMES_HOME whose only plugin is a symlink to
# this checkout — the live plugin copies are neither read nor written, and nothing is installed anywhere.
#
# External prerequisite, stated concretely: a Hermes Agent checkout importable by its own interpreter at
# $HERMES_AGENT_HOME or ~/.hermes/hermes-agent (with venv/bin/python3), i.e. the machine runs Hermes from
# source. Without it the test SKIPS (loudly, with this reason) — every part of the criterion that runs
# without Hermes keeps running in the fake-context seam test above.


def _hermes_python() -> tuple[Path, Path] | None:
    """(interpreter, checkout root) for a Hermes that can import its own registry, or None."""
    roots = []
    env_root = (os.environ.get("HERMES_AGENT_HOME") or "").strip()
    if env_root:
        roots.append(Path(env_root))
    roots.append(Path.home() / ".hermes" / "hermes-agent")
    for root in roots:
        py = root / "venv" / "bin" / "python3"
        if py.exists() and (root / "hermes_cli").is_dir() and (root / "tools").is_dir():
            return py, root
    return None


def test_skill_view_resolves_the_recipe_in_the_real_hermes_registry(tmp_path):
    loc = _hermes_python()
    if loc is None:
        pytest.skip(
            "real-registry resolution needs a Hermes checkout (its own venv) at $HERMES_AGENT_HOME "
            "or ~/.hermes/hermes-agent — the machine must run Hermes from source; the seam this "
            "substitutes for is pinned by test_the_recipe_registers_as_a_plugin_skill"
        )
    py, hermes_root = loc
    home = tmp_path / "hermes-home"
    home.mkdir()
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "HERMES_HOME", "HERMES_HOME_OVERRIDE")}
    env.update(HERMES_HOME=str(home), PYTHONPATH=str(hermes_root))
    proc = subprocess.run(
        [str(py), str(PROBE), str(ROOT), str(home)],
        capture_output=True, text=True, env=env, cwd=str(hermes_root), timeout=240,
    )
    lines = [ln for ln in proc.stdout.splitlines() if ln.startswith("{")]
    assert lines, f"probe printed no JSON (exit {proc.returncode}):\n{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}"
    payload = json.loads(lines[-1])
    if payload.get("prerequisite"):
        pytest.skip(f"Hermes registry not importable by its own interpreter: {payload['prerequisite']}")
    assert proc.returncode == 0, f"probe failed: {payload.get('failure')}\n{payload.get('trace', '')[-800:]}"
    assert payload["plugin_loaded"] is True, f"the real loader could not enable this checkout: {payload}"
    assert "visual-judgment" in payload["registered_skills"]
    served = payload["served"]
    assert served.get("success") is True, f"skill_view refused: {served}"
    assert served["name"] == "hermes-genui:visual-judgment"
    assert served["readiness_status"] == "available"
    raw = RECIPE.read_text(encoding="utf-8")
    assert raw.strip() in served["content"], "skill_view serves THIS file — the checkout's SKILL.md, verbatim"
    assert served["description"].startswith("Decide how a drawn board should look")
    assert "block_guide" in served["content"], "what the model loads is the 0.4 recipe, not a stale levers list"
