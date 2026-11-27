"""Sol's disposition F1: the AI-decided look must be PROVEN on real model output, not declared. This pytest is
the deterministic gate over the recorded live transcript in evals/evidence/: the model (the operator's own
qwen4-max-preview, temperature 0) was REGISTERED the very SHOW_BLOCKS_SCHEMA this repo ships (forced tool
call, nothing in the harness nudges a look word), given complete chat turns, and its chosen words were kept
raw. Here: the teaching is hash-pinned to this tree, every verdict is recomputed from the recorded reply, and
the per-case bar plus the variety the contract demands are asserted. The captured miss (one revenue run said
no palette) stays in the evidence — a 2-of-3 bar keeps it visible, honest failures are never re-rolled away.
"""

import hashlib
import importlib
import importlib.util
import json

from conftest import ROOT, load_plugin_package

load_plugin_package()
tools = importlib.import_module("hermes_genui.tools.show_blocks")


def _runner():
    spec = importlib.util.spec_from_file_location("model_choice", ROOT / "evals" / "model_choice.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EVIDENCE = json.loads((ROOT / "evals" / "evidence" / "model-choice-living-2026-11-19.json").read_text(encoding="utf-8"))


def test_the_transcript_was_taken_against_this_tree_teaching():
    """If a schema edit moves the teaching, the evidence stops proving it until the transcript is recaptured."""
    sha = hashlib.sha256(
        json.dumps(tools.SHOW_BLOCKS_SCHEMA, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    assert EVIDENCE["schema_sha256"] == sha


def test_the_transcript_is_a_real_live_capture():
    assert EVIDENCE["model"] == "qwen4-max-preview"       # the operator's configured authoring model
    assert EVIDENCE["temperature"] == 0
    assert EVIDENCE["endpoint_host"] == "token-plan.maas.qwencloudapi.com"
    assert EVIDENCE["runs_per_case"] == 3
    assert len(EVIDENCE["rows"]) == 3 * len(EVIDENCE["criteria"])


def test_every_recorded_choice_recomputes_to_the_recorded_verdict():
    """Tamper-proof: verdicts here come from the raw reply through the runner's own judges, never from a
    hand-written expectation. Harness-fault rows (truncation, empty replies) would redden this whole gate;
    the capture was screened to contain none."""
    m = _runner()
    by_id = {c["id"]: c for c in m.CASES}
    for row in EVIDENCE["rows"]:
        case = by_id[row["case"]]
        spec = m.parse_spec(row["raw"]) if row["tool_call"] else m.extract_json(row["raw"])
        verdict = m.judge(case, spec)
        assert verdict["said"] == row["said"], row["case"]
        assert verdict["pass"] == row["pass"], row["case"]
        assert "harness fault" not in verdict["why"], row["case"]


def test_the_model_picks_the_look_the_content_calls_for_in_every_scenario():
    """Bar: each scenario's criterion is met in at least 2 of the 3 independent runs (a genuine 1-in-3 silence
    is reported, not hidden; a systematic miss would fail here)."""
    by_case = {}
    for row in EVIDENCE["rows"]:
        by_case.setdefault(row["case"], []).append(row)
    assert sorted(by_case) == sorted(c["id"] for c in EVIDENCE["criteria"])
    for case_id, rows in by_case.items():
        passed = sum(1 for r in rows if r["pass"])
        assert passed >= 2, f"{case_id}: model met the criterion in {passed}/{len(rows)} — {rows}"


def test_the_choices_are_varied_not_one_answer_for_everything():
    """Sol's F1: the transcript must show the model actually adapting — compact for the dense console against
    comfortable-or-unsaid for the story; BOTH cool and warm palettes on their subjects; the reduced-motion
    word said for the calm wall board; and the plain number left on its safe defaults."""
    said = {}
    for row in EVIDENCE["rows"]:
        said.setdefault(row["case"], set()).add(repr(row["said"]))
    assert said["ops_dashboard"] == {"'compact'"}
    assert said["kyoto_story"] <= {"None", "'comfortable'"}
    assert "cool" in " ".join(said["revenue_board"]) and "warm" in " ".join(said["grid_alerts"])
    assert said["grid_alerts"] == {"'warm'"}
    assert said["wall_dashboard"] == {"'reduced'"}
    for reply in said["mrr_answer"]:
        assert "compact" not in reply and "cool" not in reply and "warm" not in reply and "reduced" not in reply


def test_the_model_lives_its_boards_update_link_or_draw_fresh_by_its_own_judgement():
    """Living Boards v1, the same disposition as F1 for the NEW choice: from the shipped teaching alone, the
    model must UPDATE the addressed board when its content is extended ('add NVDA... to that board'), reach
    BACK by address when a comparison names a prior board, and stay CREATIVE-FRESH (no target, no links) on
    an unrelated ask in the same chat. The #7 lesson holds: this is real recorded output — the bar is the
    same at least 2 of 3 independent runs, judged by the runner's own recomputable verdicts."""
    by_case = {}
    for row in EVIDENCE["rows"]:
        by_case.setdefault(row["case"], []).append(row)
    upd = by_case["update_portfolio"]
    assert sum(1 for r in upd if r["pass"] and r["said"] == "a1b2c3d4") >= 2
    fresh = by_case["fresh_topic"]
    assert sum(1 for r in fresh if r["pass"] and not r["said"]) >= 2
    link = by_case["reach_back_q3"]
    assert sum(1 for r in link if r["pass"] and "b2c3d4e5" in (r["said"] or "")) >= 2
