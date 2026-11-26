"""RED/GREEN behavioral witness for the #75 R7 slot-keeping merge gate.

    python tests/slot_pairing_witness.py base        # the accepted R6 bundle   — exports land on the WRONG file
    python tests/slot_pairing_witness.py candidate   # the frozen candidate     — every tap exports its own table

The three claims (top level, a tab panel, a section body) run tests/test_export_chrome.py's shared
run_pairing_case: the same user act (find the corner riding on the SECOND table, click it) and the same
file-byte assertion on both trees. It requires nothing the candidate adds: the draws-nothing block is an
image strip whose photos all fail — a block the reader KEEPS while its drawing disappears — and the rescan
is the same one a reader's scroll gives. So the accepted R6 does not fail on missing markup or a structural
timeout: it fails on the bug itself, one wrong file per container, and this script prints exactly what was
observed (the neighbor's bytes that actually landed). Exit 0 only when the run matches its tree's expected
truth: three observed wrong-export failures on base, none on candidate.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

CONTAINERS = ("top-level", "tab", "section")


def harness():  # the suite's own CDP/Chrome/click/wait machinery — imported inside so no import-order waiver
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import test_export_chrome as m
    return m


def main(argv: list[str]) -> int:
    tree = argv[1] if len(argv) > 1 else ""
    if tree not in ("base", "candidate"):
        print(__doc__)
        return 2
    m = harness()
    if m.CHROME is None:
        print("SKIP: no Chrome/Chromium binary on this machine")
        return 3
    driver = m.slot_free_driver()
    if tree == "base":
        work = Path(tempfile.mkdtemp(prefix="hb-r6-base-witness-"))
        root = work
        m.base_tree(work)
        js = m.bundle_in(work / "web", driver)
    else:
        root = m.REPO
        js = m.bundle_in(m.REPO / "web", driver)

    wrong = 0
    for container in CONTAINERS:
        board = m.pairing_board(container)
        try:
            with m.chrome_tree_page(board, js, root, ready_js="window.__ready === true") as (cdp, downloads):
                m.run_pairing_case(cdp, downloads, container)
            print(f"[{tree}] {container}: GREEN — the tapped table's own bytes exported (second.csv)")
        except AssertionError as e:
            wrong += 1
            print(f"[{tree}] {container}: {e}")

    expected_wrong = 3 if tree == "base" else 0
    if wrong != expected_wrong:
        print(f"UNEXPECTED: wanted {expected_wrong} wrong-export observations, saw {wrong}")
        return 1
    verdict = ("RED witness complete: all three containers exported the NEIGHBOUR table's file on R6"
               if tree == "base"
               else "GREEN witness complete: all three containers exported the TAPPED table's file")
    print(verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
