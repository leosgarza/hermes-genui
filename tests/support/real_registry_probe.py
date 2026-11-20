"""Real-registry probe for tests/test_visual_judgment.py — run by Hermes's OWN interpreter, never live state.

Registers this checkout exactly the way a user install would, but inside a THROWAWAY HERMES_HOME: the repo is
symlinked in as the only plugin, the temp config enables it, and the recipe is then resolved through the real
hermes_cli.plugins loader + tools.skills_tool.skill_view path. Nothing is written to, or read from, the live
plugin copies.

argv: <repo root> <temp hermes home>
Prints one JSON line. Exit 0 = answered (payload describes the outcome); 75 = external prerequisite missing
(this interpreter cannot import Hermes); 1 = unexpected failure.
"""

import json
import sys
import traceback
from pathlib import Path
from typing import NoReturn


def out(payload: dict, code: int) -> NoReturn:
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)


try:
    from hermes_cli.plugins import discover_plugins, get_plugin_manager
    from tools.skills_tool import skill_view
except Exception as exc:  # the interpreter must be Hermes's own (importable checkout on PYTHONPATH)
    out({"prerequisite": f"Hermes import failed for {sys.executable}: {exc}"}, 75)

try:
    repo = Path(sys.argv[1]).resolve()
    home = Path(sys.argv[2]).resolve()
    plugins_dir = home / "plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    link = plugins_dir / "hermes-genui"
    if not link.exists():
        link.symlink_to(repo, target_is_directory=True)
    (home / "config.yaml").write_text("plugins:\n  enabled:\n    - hermes-genui\n", encoding="utf-8")

    discover_plugins(force=True)
    pm = get_plugin_manager()
    loaded = {p["name"]: p for p in pm.list_plugins()}
    plugin = loaded.get("hermes-genui")
    served = json.loads(skill_view("hermes-genui:visual-judgment"))
    out(
        {
            "prerequisite": None,
            "plugin_loaded": bool(plugin) and not plugin.get("error"),
            "plugin_error": (plugin or {}).get("error"),
            "registered_skills": pm.list_plugin_skills("hermes-genui"),
            "served": served,
        },
        0,
    )
except Exception as exc:
    out({"prerequisite": None, "failure": f"{exc}", "trace": traceback.format_exc()[-1500:]}, 1)
