"""Rows for the progress dashboard (claude.ai artifact "התקדמות StudySpot"):
per-wave task counts from docs/ROADMAP.md, and the summary from
knowledge/progress.json. Run at the end of every wave, then upload the two
files to the dashboard (see knowledge/how-to.md).

Usage: python3 knowledge/progress_export.py <out-dir>
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TASK = re.compile(r"^\| (\d+)\.(\d+) \| (.*)$")


def task_counts(roadmap: str) -> dict[int, list[float]]:
    counts: dict[int, list[float]] = {}
    for line in roadmap.splitlines():
        row = TASK.match(line)
        if not row:
            continue
        wave = int(row[1])
        done = 1.0 if row[3].startswith("**גמור") else 0.5 if row[3].startswith("**חצי") else 0.0
        c = counts.setdefault(wave, [0.0, 0])
        c[0] += done
        c[1] += 1
    return counts


def main(out: Path) -> None:
    counts = task_counts((ROOT / "docs/ROADMAP.md").read_text())
    progress = json.loads((ROOT / "knowledge/progress.json").read_text())
    waves = [
        {"n": w["n"], "title": w["title"], "status": w["status"],
         "done": counts.get(w["n"], [0, 0])[0], "total": counts.get(w["n"], [0, 0])[1]}
        for w in progress["waves"]
    ]
    done = sum(w["done"] for w in waves)
    total = sum(w["total"] for w in waves)
    summary = [{
        "current_wave": progress["current_wave"], "total_waves": progress["total_waves"],
        "done": done, "total": total, "share": round(done / total, 4) if total else 0,
        "estimate": progress["estimate_finish"], "next": progress["next_step"],
        "waiting": " | ".join(progress["waiting_for_user"]), "updated": progress["updated"],
    }]
    out.mkdir(parents=True, exist_ok=True)
    (out / "waves.json").write_text(json.dumps(waves, ensure_ascii=False, indent=1))
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"{done}/{total} tasks, {len(waves)} waves")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
