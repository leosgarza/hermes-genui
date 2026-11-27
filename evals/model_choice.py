"""Model-choice evals for enhancement #7: does the model, reading only the show_blocks teaching, pick an
appropriate density / palette / motion for given content — and stay on safe defaults when the content says
nothing? This is the live-model harness the behavioural Chrome tests cannot be: it asks a real model to author
a real board spec and judges the words it chose.

Deterministic by design at temperature 0; the evidence it writes is checked in (evals/evidence/) and pinned:
a pytest (tests/evals/test_model_choice_evidence.py) recomputes every verdict from the recorded raw outputs and
refuses if the repo's schema text has moved away from the one the model was shown.

Run live (needs an API key in the environment, nothing is ever written into the repo):
    set -a && . ~/.hermes/.env && set +a
    python3 evals/model_choice.py --model qwen4-max-preview --runs 3 \
        --out evals/evidence/model-choice-2026-11-19.json
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.util
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def load_schema() -> dict:
    """Import the plugin the way Hermes (and tests/conftest.py) does, and hand back SHOW_BLOCKS_SCHEMA — the
    exact text a real model reads, so the eval teaches nothing the product does not."""
    if "hermes_genui" not in sys.modules:
        spec = importlib.util.spec_from_file_location(
            "hermes_genui", REPO / "__init__.py", submodule_search_locations=[str(REPO)]
        )
        assert spec and spec.loader
        package = importlib.util.module_from_spec(spec)
        sys.modules["hermes_genui"] = package
        spec.loader.exec_module(package)
    tools = importlib.import_module("hermes_genui.tools.show_blocks")
    return tools.SHOW_BLOCKS_SCHEMA


# Each case is a complete chat turn: the data sits in the user's own words, so the teaching's "use only
# numbers a tool returned" discipline never blocks the drawing — what remains, and what the model must decide,
# is the LOOK. Criteria mirror the teaching text: "a data-dense dashboard or tracker usually reads better
# compact; a story, plan or first-glance answer better comfortable"; "cool suits money and operations, warm
# suits alerts and energy"; "reduced suits a quiet dashboard". UNSAID counts as the default it names.
CASES = [
    {
        "id": "ops_dashboard",
        "field": "density", "allow": ["compact"],
        "prompt": "Draw the freight ops console for the dispatch desk from the numbers just pulled off the feed: "
                  "On-time 91.2% (target 93), Cost/mile $2.41 (was $2.28), Loads/day 1,842, Lines active 214, "
                  "Driver hours left 6,113, Claims/month 27. Plus two charts: lane lateness [ATL-DAL 6.1%, "
                  "CHI-NYC 4.8%, LAX-SEA 3.9%, MIA-ATL 7.4%] and cost per mile by region [South 2.55, Midwest "
                  "2.31, West 2.48, Northeast 2.29]. Everything should fit one screen the desk watches all day.",
    },
    {
        "id": "kyoto_story",
        "field": "density", "allow": [None, "comfortable"],
        "prompt": "Turn this into a board my family can enjoy reading before the Kyoto trip: Day 1 — Fushimi "
                  "Inari early, Nishiki market lunch, evening stroll along the Kamo river. Day 2 — Arashiyama "
                  "bamboo grove, monkey park, tea house stop, ramen night. Day 3 — Kinkaku-ji, Ryoan-ji rocks, "
                  "train museum for the kids, farewell izakaya. Note: walk everywhere day one, take the bus days "
                  "two and three.",
    },
    {
        "id": "revenue_board",
        "field": "palette", "allow": ["cool"],
        "prompt": "Board pack slide from these audited figures — revenue 41.2, 48.9, 57.4; cost 33.0, 37.1, "
                  "41.9; margin 19.9%, 24.1%, 27.0% for FY24, FY25, FY26. Draw the money story as a chart with "
                  "the figures beside it.",
    },
    {
        "id": "grid_alerts",
        "field": "palette", "allow": ["warm"],
        "prompt": "Show this week's grid picture: load by region [North 3.1GW, South 4.6GW, East 2.8GW, West "
                  "3.9GW] next to the outage alerts — 14 alerts Tuesday peak, 9 Thursday, 3 today, with two "
                  "feeders still down. Draw the energy picture as a board.",
    },
    {
        "id": "wall_dashboard",
        "field": "motion", "allow": ["reduced"],
        "prompt": "The plant uptime board for the wall screen in the control room, from the shift feed: uptime "
                  "99.3%, stoppages 2 (17 min, 4 min), OEE 86.4%, queue 38. People glance at it all shift — "
                  "it should stay calm and never dance.",
    },
    {
        "id": "mrr_answer",
        "field": None,  # a first-glance number: every look word must stay on its safe default (said or unsaid)
        "allow": {None, "comfortable", "default", "full"},
        "prompt": "Subscriptions just renewed: MRR is $482k. Give me the number on a small board with a "
                  "one-line note.",
    },
    # Living Boards v1 (enhancement #9): the model decides UPDATE vs CREATE vs REACH-BACK from the teaching
    # alone. The addresses are plain tokens of the board-id shape; the judge reads only the words the model
    # chose (target/links present, absent, or naming the right address) — no board execution is needed, and
    # the prompts never nudge the answer past the product's own rules.
    {
        "id": "update_portfolio",
        "field": "target", "allow": {"a1b2c3d4"},
        "board": [{"type": "heading", "text": "Portfolio · Q4"},
                  {"type": "table", "columns": ["Name", "Gain"],
                   "rows": [["AAPL", "+8.1%"], ["MSFT", "+15.2%"], ["GOOGL", "+6.7%"]]}],
        "prompt": "Earlier in this chat you drew my portfolio board and my reply showed the tag "
                  '::blocks{id="a1b2c3d4"}. Now I say: Add NVDA (+34.0%) to that board and tighten it up — '
                  "it should fit one screen.",
    },
    {
        "id": "fresh_topic",
        "field": "fresh", "allow": {None},
        "board": [{"type": "heading", "text": "Portfolio · Q4"}],
        "prompt": "Earlier in this chat you drew my portfolio board (the reply carried its ::blocks tag). "
                  "Now I ask something unrelated: draw me a plan board for a 3-day Kyoto trip — day one "
                  "Fushimi Inari and Nishiki market, day two Arashiyama, day three Kinkaku-ji.",
    },
    {
        "id": "reach_back_q3",
        "field": "links", "allow": {"b2c3d4e5"},
        "board": [{"type": "heading", "text": "Portfolio · Q3"},
                  {"type": "table", "columns": ["Name", "Gain"],
                   "rows": [["AAPL", "+5.0%"], ["MSFT", "+11.0%"], ["GOOGL", "+4.0%"]]}],
        "prompt": 'My Library holds my Q3 portfolio board at address "b2c3d4e5" (saved Oct 12). Now I ask: '
                  "draw my Q4 board — AAPL +8.1%, MSFT +15.2%, GOOGL +6.7%, total +12.4% — and show it "
                  "against last quarter so I can see the comparison.",
    },
]

WORDS = {"density": ["comfortable", "compact"], "palette": ["default", "cool", "warm"],
         "motion": ["full", "reduced"]}

SYSTEM_NOTE = (
    "You are answering a chat in Hermes Desktop. Where the answer reads better drawn than written, author the "
    "board with the show_blocks tool."
)


def extract_json(text: str) -> dict | None:
    """First complete top-level JSON object in the reply (fences and chatter tolerated, then rejected if the
    object itself is not a board spec). Used when a model answers in text instead of calling the tool."""
    cleaned = re.sub(r"```(json)?", "", text)
    depth = start = -1
    for i, ch in enumerate(cleaned):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    obj = json.loads(cleaned[start:i + 1])
                    if isinstance(obj, dict):
                        return obj
                except ValueError:
                    start = -1
                    continue
    return None


def read_word(spec: dict, field: str) -> str | None:
    """Lenient, like the renderer: only a word the schema taught counts; anything else is unsaid."""
    value = spec.get(field)
    return value if isinstance(value, str) and value in WORDS[field] else None


def parse_spec(arguments: str) -> dict | None:
    """Tool-call arguments as the endpoint delivered them. The token-plan compatible mode sometimes strings
    nested arrays ({"blocks": "[...]"}); normalize that leniently — the look words themselves are plain
    strings and ride the top level. Recomputed identically by the pinned-evidence pytest."""
    try:
        spec = json.loads(arguments)
    except ValueError:
        return None
    if not isinstance(spec, dict):
        return None
    blocks = spec.get("blocks")
    if isinstance(blocks, str):
        try:
            spec["blocks"] = json.loads(blocks)
        except ValueError:
            pass
    return spec


def _address(v: object) -> str | None:
    """A board address as the teaching says to write it, read leniently the way the tool does: trimmed,
    lower-cased, an optional leading #. Anything else names nothing."""
    if not isinstance(v, str):
        return None
    word = v.strip().lower().lstrip("#")
    return word if re.fullmatch(r"[0-9a-f]{8}", word) else None


def _link_addresses(raw: object) -> set[str]:
    """Every address the model's links word names (bare or {id, note}); {} when it said no links."""
    if not isinstance(raw, list):
        return set()
    out = set()
    for item in raw:
        addr = _address(item if isinstance(item, str) else (item.get("id") if isinstance(item, dict) else None))
        if addr:
            out.add(addr)
    return out


def judge_living(case: dict, spec: dict) -> dict:
    """The update-vs-create-vs-reach-back verdict, recomputable from the raw reply."""
    field = case["field"]
    allow = set(map(str, case["allow"]))
    if field == "target":
        said = _address(spec.get("target"))
        return {"said": said, "pass": said in allow,
                "why": f"target={said!r}, allowed {sorted(allow)}"}
    if field == "links":
        said = _link_addresses(spec.get("links"))
        wanted = next(iter(allow))
        return {"said": " ".join(sorted(said)) or None, "pass": wanted in said,
                "why": f"links={sorted(said)} wanted {wanted!r}"}
    # fresh: a board drawn new — neither the update word nor a reach-back word may be said.
    strays = {}
    if (t := _address(spec.get("target"))) is not None:
        strays["target"] = t
    if (ls := _link_addresses(spec.get("links"))):
        strays["links"] = sorted(ls)
    return {"said": strays or None, "pass": not strays,
            "why": "no target, no links — drew fresh" if not strays else f"lived-board words {strays}"}


def judge(case: dict, spec: dict | None) -> dict:
    """The recorded verdict, recomputable from the raw reply at any time."""
    if spec is None:
        return {"said": None, "pass": False, "why": "no JSON board spec in the reply"}
    if case["field"] in ("target", "links", "fresh"):
        return judge_living(case, spec)
    if case["field"] is not None:
        said = read_word(spec, case["field"])
        ok = said in case["allow"]
        return {"said": said, "pass": ok,
                "why": f"{case['field']}={said!r}, allowed {case['allow']!r}"}
    # mrr_answer: EVERY look word must be said-and-default or unsaid; any styling decision is a fail here.
    said_map = {f: read_word(spec, f) for f in WORDS}
    strays = {f: v for f, v in said_map.items() if v is not None and v not in case["allow"]}
    return {"said": said_map, "pass": not strays,
            "why": "look words all default-or-unsaid" if not strays else f"non-default words {strays}"}


def ask(client: dict, schema: dict, case: dict) -> dict:
    """Production shape: the tool is REGISTERED (tools + forced tool_choice) carrying the very schema a live
    authoring turn ships; the recorded choice is the tool-call arguments the host would draw. Nothing here
    nudges the look words — the teaching text alone must decide them."""
    body = {
        "model": client["model"], "temperature": 0, "max_tokens": 1600,
        "messages": [{"role": "system", "content": SYSTEM_NOTE}, {"role": "user", "content": case["prompt"]}],
        "tools": [{"type": "function", "function": schema}],
        "tool_choice": {"type": "function", "function": {"name": schema["name"]}},
    }
    req = urllib.request.Request(
        f"{client['base_url']}/chat/completions", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {client['api_key']}"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    choice = payload["choices"][0]
    message = choice["message"]
    # A truncated or reasoning-starved reply is a HARNESS fault, never a model-choice verdict; say so loudly.
    stop = choice.get("finish_reason") or ""
    calls = message.get("tool_calls") or []
    if calls:
        raw = calls[0]["function"].get("arguments") or ""
        spec = parse_spec(raw)
    else:
        raw = message.get("content") or ""
        spec = extract_json(raw)
    verdict = judge(case, spec)
    if stop == "length":
        verdict = {"said": verdict.get("said"), "pass": False,
                   "why": f"reply truncated at max_tokens (harness fault): {verdict['why']}"}
    elif not calls and not raw:
        verdict = {"said": verdict.get("said"), "pass": False,
                   "why": f"empty reply, finish_reason={stop!r} (harness/provider fault)"}
    return {"case": case["id"], "raw": raw, "spec": spec, "finish_reason": stop,
            "tool_call": bool(calls), **verdict}


def main() -> int:
    if sys.version_info < (3, 10):  # noqa: UP036 — intentional: plain `python3` on macOS is 3.9 and must
        # fail with instructions, not mid-import; the plugin package itself is 3.10+ (PEP 604 in signatures)
        sys.exit("evals/model_choice.py needs Python >= 3.10 — the same interpreter the fork's pytest runs on "
                 "(e.g. `uv run --no-project python3 evals/model_choice.py ...` or a python3.11+ binary)")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", default="qwen4-max-preview")
    ap.add_argument("--base-url", default="https://token-plan.maas.qwencloudapi.com/compatible-mode/v1")
    ap.add_argument("--key-env", default="DASHSCOPE_API_KEY")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--out", default=str(REPO / "evals" / "evidence" / "model-choice.json"))
    args = ap.parse_args()

    key = os.environ.get(args.key_env, "")
    if not key:
        print(f"no API key in ${args.key_env}; this runner never stores one", file=sys.stderr)
        return 2
    schema = load_schema()
    client = {"model": args.model, "base_url": args.base_url, "api_key": key}
    rows = []
    for run in range(args.runs):
        for case in CASES:
            row = ask(client, schema, case)
            row["run"] = run
            rows.append(row)
            print(f"[{run}] {row['case']:<14} {'PASS' if row['pass'] else 'FAIL'}  {row['why']}")
    evidence = {
        "harness": "evals/model_choice.py",
        "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "schema_sha256": hashlib.sha256(
            json.dumps(schema, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest(),
        "model": args.model,
        "endpoint_host": re.sub(r"^https?://", "", args.base_url).split("/")[0],
        "temperature": 0,
        "runs_per_case": args.runs,
        "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),  # noqa: UP017 — datetime.UTC
        # is 3.11+, this runner still has to work on 3.10 where the guard above would let it through
        "criteria": [{"id": c["id"], "field": c["field"], "allow": sorted(map(str, (
            c["allow"] if isinstance(c["allow"], set) else c["allow"])))} for c in CASES],
        "rows": rows,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(evidence, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    passed = sum(1 for r in rows if r["pass"])
    print(f"\n{passed}/{len(rows)} passed -> {out}")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
