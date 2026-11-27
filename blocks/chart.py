"""chart: line, bar, area, stacked, hbar, combo, pie, donut, scatter or histogram."""

from .common import change_chip, fmt_num, is_number, safe_text

CHART_KINDS = ("line", "bar", "area", "stacked", "hbar", "combo", "pie", "donut", "scatter", "histogram", "gauge", "bullet", "funnel", "pareto", "waterfall", "radar", "control", "bubble", "box", "treemap")
KIND_ALIASES = {"doughnut": "donut", "stackedbar": "stacked", "horizontalbar": "hbar", "barh": "hbar",
                "hist": "histogram", "dial": "gauge", "speedometer": "gauge", "bulletgraph": "bullet"}


def chart_kind(name: object) -> str:
    """The kind the drawing side will use for the name written (the same rule as the web reader).

    "Donut" → "donut";  "stacked_bar" → "stacked";  "scatter" → "scatter";  "hist" → "histogram";  None → "line"
    """
    if not isinstance(name, str):
        return "line"
    plain = "".join(ch for ch in name.lower() if ch not in " _-")
    if plain in CHART_KINDS:
        return plain
    return KIND_ALIASES.get(plain, "line")


def check_chart(block: dict, path: str) -> list[tuple[str, str]]:
    """x labels; 1-3 series (stacked and area up to 6); every series as long as x, holding numbers or null gaps;
    at least one number, and for a pie or donut at least one positive one. A histogram needs no x: it bins the
    numbers of its one series itself, and any x left on it is ignored.

    x = ["Mon", "Tue", "Wed"], series[0].data = [1, 2] → [("0.series.0", "data has 2 values but x has 3 labels")]
    a line chart with 4 series → [("0", "a line chart takes 1-3 series")]
    The optional tone is checked last (_check_tone).
    """
    kind = chart_kind(block.get("kind"))
    if kind == "gauge":
        return _check_gauge(block, path)
    if kind == "box":
        return _check_box(block, path)
    if kind == "histogram":
        return _check_histogram(block, path)
    x = block.get("x")
    series = block.get("series")
    if not isinstance(x, list) or not x:
        return [(path, "chart needs x labels")]
    if not isinstance(series, list) or not series:
        return [(path, "chart needs 1-6 series")]
    most = 6 if kind in ("stacked", "area") else 2 if kind in ("bullet", "bubble") else 1 if kind in ("funnel", "pareto", "waterfall", "control", "treemap") else 3
    if len(series) > most:
        return [(path, f"a {kind} chart takes 1-{most} series")]
    problems = []
    numbers: list[float] = []
    for i, s in enumerate(series):
        data = s.get("data") if isinstance(s, dict) else None
        if not isinstance(data, list):
            problems.append((f"{path}.series.{i}", "series needs a data list"))
        elif len(data) != len(x):
            problems.append((f"{path}.series.{i}", f"data has {len(data)} values but x has {len(x)} labels"))
        elif not all(v is None or is_number(v) for v in data):
            problems.append((f"{path}.series.{i}", "data must be numbers (null for a gap)"))
        else:
            numbers += [v for v in data if v is not None]
    if problems:
        return problems
    if not numbers:
        return [(path, "chart needs at least one number")]
    if kind in ("pie", "donut", "treemap") and not any(v > 0 for v in numbers):
        return [(path, f"a {kind} needs at least one positive value")]
    return _check_tone(block, kind, len(series), path)


def _check_tone(block: dict, kind: str, series_count: int, path: str) -> list[tuple[str, str]]:
    """The optional tone: only "change" (one line, green above its first value and orange below), only on a line
    chart with one series.

    {"tone": "change"} on a one-series line → [];  {"tone": "green"} → [("0", 'tone can only be "change"')]
    """
    if "tone" not in block:
        return []
    if block["tone"] != "change":
        return [(path, 'tone can only be "change"')]
    if kind != "line" or series_count != 1:
        return [(path, 'tone "change" is for a one-series line chart')]
    return []


def _check_histogram(block: dict, path: str) -> list[tuple[str, str]]:
    """A histogram needs no x (the web reader makes the bins the labels); its one series' data list must hold
    numbers or null gaps, at least one of them a number. Any x left on the block is ignored, not refused.

    {"series": [{"data": [5, None]}]} → [];  two series → [("0", "a histogram bins the values of one series")]
    """
    series = block.get("series")
    if not isinstance(series, list) or not series:
        return [(path, "chart needs 1-6 series")]
    if len(series) > 1:
        return [(path, "a histogram bins the values of one series")]
    data = series[0].get("data") if isinstance(series[0], dict) else None
    if not isinstance(data, list):
        return [(f"{path}.series.0", "series needs a data list")]
    if not all(v is None or is_number(v) for v in data):
        return [(f"{path}.series.0", "data must be numbers (null for a gap)")]
    if not any(is_number(v) for v in data):
        return [(path, "chart needs at least one number")]
    return _check_tone(block, "histogram", 1, path)


def _series_line(series: dict) -> str:
    """One series, first value to last: {"name": "Revenue", "data": [67087, None, 72275]}
    → "Revenue 67,087 → 72,275 (▲ 7.7%)". No % when the first value is 0."""
    data = [v for v in series.get("data", []) if is_number(v)]
    if not data:
        return ""
    name = safe_text(series.get("name"))
    first, last = data[0], data[-1]
    line = f"{name} {fmt_num(first)} → {fmt_num(last)}".strip()
    if first:
        line += " " + change_chip(round((last - first) / abs(first) * 100, 1))
    return line


def _slices(x: list, series: dict, top: int = 4) -> str:
    """A pie or donut as its biggest slices with their shares: "A 50%, B 20%, C 15%, D 10%, +1 more"."""
    data = series.get("data", [])
    parts = [(safe_text(label), v) for label, v in zip(x, data, strict=False) if is_number(v) and v > 0]
    total = sum(v for _, v in parts)
    if not total:
        return ""
    parts.sort(key=lambda part: part[1], reverse=True)
    shown = [f"{label} {round(v / total * 100)}%".strip() for label, v in parts[:top]]
    if len(parts) > top:
        shown.append(f"+{len(parts) - top} more")
    return ", ".join(shown)


def _points_line(series: dict) -> str:
    """One scatter series, spread rather than trend: {"name": "Samples", "data": [10, 14, 12]}
    → "Samples 3 points, y 10 → 14"."""
    data = [v for v in series.get("data", []) if is_number(v)]
    if not data:
        return ""
    name = safe_text(series.get("name"))
    line = f"{name} " if name else ""
    return f"{line}{len(data)} points, y {fmt_num(min(data))} → {fmt_num(max(data))}"


def _histogram_line(values: list) -> str:
    """The values a histogram bins, said plainly: [3, 40, 40, 70] → "4 values, 3 → 70, median 40"."""
    data = sorted(v for v in values if is_number(v))
    if not data:
        return ""
    mid = data[len(data) // 2] if len(data) % 2 else (data[len(data) // 2 - 1] + data[len(data) // 2]) / 2
    return f"{len(data)} values, {fmt_num(data[0])} → {fmt_num(data[-1])}, median {fmt_num(mid)}"


def text_chart(block: dict) -> str:
    """One line: the title (and unit), then each series first → last, a pie's top slices, a histogram's spread
    of its values, or a scatter's point count and y range.

    → "**Revenue vs profit** (₹Cr): Revenue 67,087 → 72,275 (▲ 7.7%); Net profit 10,720 → 13,420 (▲ 25.2%)"
    """
    series = [s for s in block.get("series", []) if isinstance(s, dict)]
    if not series:
        return ""
    kind = chart_kind(block.get("kind"))
    if kind == "gauge":
        return _gauge_text(block, series[0])
    if kind == "bullet":
        return _bullet_text(block, series)
    if kind == "histogram":
        body = _histogram_line(series[0].get("data") or [])
    elif kind in ("funnel", "pareto"):
        body = " · ".join(f"{safe_text(label)} {fmt_num(v)}" for label, v in zip(block.get("x") or [], series[0].get("data") or []) if is_number(v))
    elif kind == "waterfall":
        data = [v for v in (series[0].get("data") or []) if is_number(v)]
        body = f"net {fmt_num(sum(data))}" if data else ""
    elif kind == "radar":
        body = "; ".join(f"{safe_text(s.get('name')) or 'Series'} " + " / ".join(fmt_num(v) for v in (s.get("data") or []) if is_number(v)) for s in series[:3])
    elif kind == "control":
        vals = [v for v in (series[0].get("data") or []) if is_number(v)]
        body = f"mean {fmt_num(sum(vals) / len(vals))}, n {len(vals)}" if vals else ""
    elif kind == "bubble":
        body = "; ".join(line for line in (_points_line(s) for s in series[:1]) if line)
    elif kind == "box":
        parts = []
        for s in series[:8]:
            vals = sorted(v for v in (s.get("data") or []) if is_number(v))
            if vals:
                med = vals[len(vals) // 2] if len(vals) % 2 else (vals[len(vals) // 2 - 1] + vals[len(vals) // 2]) / 2
                parts.append(f"{safe_text(s.get('name')) or 'Group'} median {fmt_num(med)}")
        body = " · ".join(parts)
    elif kind == "treemap":
        data = series[0].get("data") or []
        pairs = [(safe_text(l), v) for l, v in zip(block.get("x") or [], data) if is_number(v) and v > 0]
        total = sum(v for _, v in pairs) or 1
        pairs.sort(key=lambda p: p[1], reverse=True)
        body = " · ".join(f"{l} {fmt_num(v)} ({round(v / total * 100)}%)" for l, v in pairs[:6])
    elif kind == "scatter":
        body = "; ".join(line for line in (_points_line(s) for s in series[:3]) if line)
    elif kind in ("pie", "donut"):
        body = _slices(block.get("x") or [], series[0])
    else:
        body = "; ".join(line for line in (_series_line(s) for s in series[:6]) if line)
    if not body:
        return ""
    unit = safe_text(block.get("unit"), 20)
    title = f"**{safe_text(block.get('title')) or 'Chart'}**" + (f" ({unit})" if unit else "")
    return f"{title}: {body}"


def _check_gauge(block: dict, path: str) -> list[tuple[str, str]]:
    """A gauge: one series holding one number, optional numeric min/max/target, and max above min.

    {"series": [{"data": [68]}], "min": 0, "max": 100, "target": 75} → []
    {"series": [{"data": ["x"]}]} → [(".series.0", "a gauge needs one number")]
    """
    series = block.get("series")
    if not isinstance(series, list) or len(series) != 1:
        return [(path, "a gauge takes one series")]
    data = series[0].get("data") if isinstance(series[0], dict) else None
    if not isinstance(data, list) or not data:
        return [(f"{path}.series.0", "series needs a data list")]
    if not is_number(data[0]):
        return [(f"{path}.series.0", "a gauge needs one number")]
    problems = []
    for key in ("min", "max", "target"):
        if key in block and not is_number(block[key]):
            problems.append((path, f"{key} must be a number"))
    mn, mx = block.get("min"), block.get("max")
    if is_number(mn) and is_number(mx) and mx <= mn:
        problems.append((path, "max must be greater than min"))
    return problems


def _gauge_text(block: dict, series: dict) -> str:
    data = series.get("data") or []
    value = data[0] if data else None
    if not is_number(value):
        return ""
    unit = safe_text(block.get("unit"), 20)
    title = f"**{safe_text(block.get('title')) or 'Gauge'}**" + (f" ({unit})" if unit else "")
    reading = fmt_num(value) + ("%" if unit == "%" else (f" {unit}" if unit else ""))
    target = block.get("target")
    if is_number(target):
        reading += f" (target {fmt_num(target)})"
    return f"{title}: {reading}"


def _bullet_text(block: dict, series: list) -> str:
    """Each row as "label actual/target", or just the actual when no target is given."""
    x = block.get("x") if isinstance(block.get("x"), list) else []
    actual = series[0].get("data") if series and isinstance(series[0], dict) else []
    targets = series[1].get("data") if len(series) > 1 and isinstance(series[1], dict) else []
    cells = []
    for i, label in enumerate(x):
        seg = safe_text(label)
        v = actual[i] if i < len(actual) else None
        t = targets[i] if i < len(targets) else None
        if is_number(v):
            seg += f" {fmt_num(v)}"
        if is_number(t):
            seg += f"/{fmt_num(t)}"
        if seg:
            cells.append(seg)
    if not cells:
        return ""
    unit = safe_text(block.get("unit"), 20)
    title = f"**{safe_text(block.get('title')) or 'Bullet'}**" + (f" ({unit})" if unit else "")
    return f"{title}: " + " · ".join(cells)


def _check_box(block: dict, path: str) -> list[tuple[str, str]]:
    """A box plot: 1-8 groups, each a series whose data list holds that group's raw numbers.

    {"series": [{"name": "A", "data": [1, 2, 3]}, {"name": "B", "data": [2, 4]}]} → []
    {"series": [{"name": "A", "data": ["x"]}]} → [(".series.0", "group data must be numbers")]
    """
    series = block.get("series")
    if not isinstance(series, list) or not 1 <= len(series) <= 8:
        return [(path, "a box plot takes 1-8 groups")]
    problems = []
    for i, s in enumerate(series):
        data = s.get("data") if isinstance(s, dict) else None
        if not isinstance(data, list) or not data:
            problems.append((f"{path}.series.{i}", "group needs a data list"))
        elif not all(is_number(v) for v in data):
            problems.append((f"{path}.series.{i}", "group data must be numbers"))
    return problems
