"""Voids probe results where the agent refused the planted loan at plant time (runs recorded before the engine fix)."""
from __future__ import annotations

import json
import sys
from pathlib import Path


def void(run_dir: Path) -> int:
    path = run_dir / "trace.jsonl"
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    plants = {r["payload"]["probe_id"]: r for r in records if r["kind"] == "probe_plant"}
    refused: set[str] = set()
    for pid, plant in plants.items():
        slots = plant["payload"].get("slots") or {}
        npc = str(slots.get("npc_id") or plant["payload"].get("npc") or "").lower()
        if slots.get("plant_channel", "meeting") != "meeting" or not npc or slots.get("negative"):
            continue
        for r in records:
            if r["kind"] != "plan" or not (plant["t"] <= r["t"] <= plant["t"] + 2):
                continue
            plan = r["payload"].get("plan", r["payload"])
            for talk in plan.get("talk", []) or []:
                if str(talk.get("to") or "").lower() == npc and talk.get("intent") == "refuse":
                    refused.add(pid)
    changed = 0
    for r in records:
        if r["kind"] == "probe_result" and r["payload"].get("probe_id") in refused and r["payload"].get("passed") is not None:
            r["payload"].update(passed=None, ok=None, label="declined at plant · not counted", action="declined_at_plant")
            changed += 1
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n")
    return changed


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        print(arg, "voided", void(Path(arg)))
