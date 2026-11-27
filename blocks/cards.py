"""cards: 1-14 compact project cards — one block for a whole portfolio.

A single project today costs ~6 blocks; at 14 projects that overruns a board. One `cards` block holds the wall:
title, an optional id line, a status chip, a 4-segment lifecycle ring, up to three metrics, what needs the owner,
freshness, and one action — per card.
"""

from .common import NO_SEND, acts_before_the_model, has_text, safe_text

CARD_MAX = 14
METRIC_MAX = 3
STATUSES = ("active", "parked", "done", "archived")
TONES = ("good", "warn", "bad", "neutral")


def check_cards(block: dict, path: str) -> list[tuple[str, str]]:
    """1-14 cards, each with a title; the ring, metrics, needs and action are optional but, when present, must be well shaped.

    {"items": [{"title": "Mission Control"}]} → []
    {"items": []} → [("0", "cards needs 1-14 items")]
    {"items": [{"title": "X", "ring": {"stages": ["A", "B", "C"]}}]} → [("0.items.0.ring.stages", "...4...")]
    """
    items = block.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= CARD_MAX:
        return [(path, f"cards needs 1-{CARD_MAX} items")]
    problems = []
    columns = block.get("columns")
    if columns is not None and not (isinstance(columns, int) and not isinstance(columns, bool) and columns in (1, 2)):
        problems.append((path, "columns must be 1 or 2"))
    for i, item in enumerate(items):
        problems += _check_card(item, f"{path}.items.{i}")
    return problems


def _check_card(item: object, path: str) -> list[tuple[str, str]]:
    if not (isinstance(item, dict) and has_text(item.get("title"))):
        return [(path, "card needs a title")]
    problems = []
    status = item.get("status")
    if status is not None:
        if not (isinstance(status, str) and status.strip().lower() in STATUSES):
            problems.append((f"{path}.status", "status must be active, parked, done or archived"))
    ring = item.get("ring")
    if ring is not None:
        problems += _check_ring(ring, f"{path}.ring")
    metrics = item.get("metrics")
    if metrics is not None:
        if not isinstance(metrics, list) or not 0 <= len(metrics) <= METRIC_MAX:
            problems.append((f"{path}.metrics", f"metrics must be 0-{METRIC_MAX} items"))
        else:
            for j, metric in enumerate(metrics):
                if not (isinstance(metric, dict) and has_text(metric.get("label")) and metric.get("value") not in (None, "")):
                    problems.append((f"{path}.metrics.{j}", "metric needs a label and a value"))
    needs = item.get("needs")
    if needs is not None and not (isinstance(needs, dict) and has_text(needs.get("text"))):
        problems.append((f"{path}.needs", "needs must be {text, tone?}"))
    action = item.get("action")
    if action is not None:
        if not (isinstance(action, dict) and has_text(action.get("label"))):
            problems.append((f"{path}.action", "action needs a label"))
        elif acts_before_the_model(action.get("run")):
            problems.append((f"{path}.action", NO_SEND))
    return problems


def _check_ring(ring: object, path: str) -> list[tuple[str, str]]:
    if not isinstance(ring, dict):
        return [(path, "ring must be an object")]
    problems = []
    stages = ring.get("stages")
    if not isinstance(stages, list) or len(stages) != 4 or not all(has_text(s) for s in stages):
        problems.append((f"{path}.stages", "ring.stages must be exactly 4 non-empty labels"))
    at = ring.get("at")
    if at is not None and not (isinstance(at, int) and not isinstance(at, bool) and 0 <= at <= 3):
        problems.append((f"{path}.at", "ring.at must be an integer 0-3"))
    return problems


def _has_unknown(item: dict) -> bool:
    """True when any value the card would draw positively reports "unknown" (a ring centre word or a metric value).

    An unknown is a value, not an absence: a card carrying one must never read as a calm `clear`.
    """
    ring = item.get("ring")
    if isinstance(ring, dict) and _unknown_word(ring.get("label")):
        return True
    metrics = item.get("metrics")
    if isinstance(metrics, list):
        for metric in metrics:
            if isinstance(metric, dict) and _unknown_word(metric.get("value")):
                return True
    return False


def _unknown_word(value: object) -> bool:
    return isinstance(value, str) and value.strip().lower() == "unknown"


def text_cards(block: dict) -> str:
    """One card per paragraph: title/status, the ring line, metrics, the needs line and the action, as Markdown."""
    raw_items = block.get("items")
    items = raw_items if isinstance(raw_items, list) else []
    cards = []
    for item in items[:CARD_MAX]:
        if not isinstance(item, dict):
            continue
        title = safe_text(item.get("title"), 80)
        if not title:
            continue
        lines = [_head(title, item.get("status"))]
        ring = item.get("ring")
        if isinstance(ring, dict):
            line = _ring_line(ring)
            if line:
                lines.append(line)
        metrics = item.get("metrics")
        if isinstance(metrics, list) and metrics:
            cells = [f"{safe_text(m.get('label'), 40)} {safe_text(m.get('value'), 40)}"
                     for m in metrics if isinstance(m, dict) and has_text(m.get("label"))]
            if cells:
                lines.append(" · ".join(cells))
        needs = _needs_line(item)
        if needs:
            lines.append(needs)
        action = item.get("action")
        if isinstance(action, dict) and has_text(action.get("label")):
            lines.append(f"[{safe_text(action.get('label'), 40)}]")
        cards.append("\n".join(lines))
    return "\n\n".join(cards)


def _head(title: str, status: object) -> str:
    status_text = safe_text(status, 20) if has_text(status) else ""
    return f"**{title}** — {status_text}" if status_text else f"**{title}**"


def _ring_line(ring: dict) -> str:
    stages = ring.get("stages")
    if not isinstance(stages, list) or not stages:
        return ""
    labels = " · ".join(safe_text(s, 24) for s in stages[:4])
    at = ring.get("at")
    now = f" (now: {safe_text(stages[at], 24)})" if isinstance(at, int) and not isinstance(at, bool) and 0 <= at < len(stages) else ""
    centre = f" · {safe_text(ring.get('label'), 24)}" if has_text(ring.get("label")) else ""
    return f"{labels}{now}{centre}"


def _needs_line(item: dict) -> str:
    needs = item.get("needs")
    line = f"needs you: {safe_text(needs.get('text'), 120)}" if isinstance(needs, dict) and has_text(needs.get("text")) else ""
    if not line:
        line = "unknown" if _has_unknown(item) else "clear"
    freshness = safe_text(item.get("freshness"), 40) if has_text(item.get("freshness")) else ""
    return f"{line} · {freshness}" if freshness else line
