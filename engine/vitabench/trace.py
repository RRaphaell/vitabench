from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from vitabench.recall import MemoryLog, memory_file_lines
from vitabench.schema import AnyFrame, EndFrame, Frame, HelloFrame, MemoryFrame, MomentFrame, TraceRecord

TRACE_NAME = "trace.jsonl"
META_NAME = "meta.json"
FRAMES_NAME = "frames.json"
PROBE_KINDS = ("probe_plant", "probe_payoff", "probe_result")


def llm_cost(records: Iterable[TraceRecord]) -> float:
    total = 0.0
    for record in records:
        if record.kind == "llm":
            total += float(record.cost_usd or record.payload.get("cost_usd") or 0.0)
    return round(total, 6)


def new_run_id() -> str:
    return "r_" + uuid4().hex[:6]


def _plain(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    return str(value)


class TraceWriter:
    def __init__(self, run_dir: str | Path, run_id: str | None = None) -> None:
        self.run_dir = Path(run_dir)
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.run_id = run_id or new_run_id()
        self.path = self.run_dir / TRACE_NAME
        self.meta_path = self.run_dir / META_NAME
        self.cost_usd = 0.0
        self._seq = 0
        self._fh = self.path.open("w", encoding="utf-8")

    def write_meta(self, **fields: Any) -> dict[str, Any]:
        meta: dict[str, Any] = {"run_id": self.run_id, "started": datetime.now(UTC).isoformat()}
        if self.meta_path.exists():
            meta.update(json.loads(self.meta_path.read_text(encoding="utf-8")))
        meta.update({k: v for k, v in fields.items() if v is not None})
        self.meta_path.write_text(json.dumps(meta, indent=2, default=_plain), encoding="utf-8")
        return meta

    def write(
        self,
        kind: str,
        t: int,
        payload: dict[str, Any],
        wall_ms: int | None = None,
        cost_usd: float | None = None,
    ) -> TraceRecord:
        self._seq += 1
        record = TraceRecord(
            seq=self._seq,
            run_id=self.run_id,
            t=int(t),
            kind=kind,  # type: ignore[arg-type]
            payload=payload,
            wall_ms=wall_ms,
            cost_usd=cost_usd,
        )
        line = json.dumps(record.model_dump(), ensure_ascii=False, default=_plain)
        self._fh.write(line + "\n")
        self._fh.flush()
        if cost_usd:
            self.cost_usd += float(cost_usd)
        return record

    def close(self) -> None:
        if not self._fh.closed:
            self._fh.close()

    def __enter__(self) -> TraceWriter:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def read_trace(run_dir: str | Path) -> list[TraceRecord]:
    path = Path(run_dir)
    if path.is_dir():
        path = path / TRACE_NAME
    records: list[TraceRecord] = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(TraceRecord.model_validate_json(line))
    return records


def read_meta(run_dir: str | Path) -> dict[str, Any]:
    path = Path(run_dir) / META_NAME
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def hello_from_trace(records: Iterable[TraceRecord]) -> HelloFrame:
    for record in records:
        if record.kind == "birth":
            return HelloFrame.model_validate(record.payload)
    raise ValueError("trace has no birth record")


def delay_label(delay_seasons: int) -> str:
    years = delay_seasons // 4
    return f"{years} years" if years else f"{delay_seasons} seasons"


def _moment_kind(probe_type: str, record_kind: str) -> str:
    if record_kind == "probe_plant":
        return "plant"
    if probe_type == "quiz":
        return "quiz"
    return "negative" if probe_type == "negative" else "payoff"


def _moment_label(kind: str, ok: bool | None, delay_seasons: int) -> str:
    when = delay_label(delay_seasons)
    if kind == "plant":
        return f"planted · payoff in {when}"
    if kind == "negative":
        return "refused false claim" if ok else "confabulated"
    if ok is None:
        return f"asked · {when}"
    return f"remembered · {when}" if ok else f"forgot · {when}"



INTENT_WORDS = {
    "chat", "agree", "refuse", "pay", "ask_proof", "promise", "lend", "borrow",
    "none", "acted", "declined_at_plant",
}


def _card_role(p: dict[str, Any], slots: dict[str, Any]) -> str:
    channel = p.get("channel") or slots.get("payoff_channel")
    if channel == "news" or str(p.get("who") or "").lower().startswith("the criers"):
        return "news"
    if channel == "mother":
        return "mother"
    if p.get("type") == "negative" or slots.get("negative"):
        return "stranger"
    who = str(p.get("who") or "").split()
    kind = str(p.get("moment_kind") or p.get("kind") or "")
    if who and kind != "plant" and not str(p.get("role") or "").startswith("kin"):
        return f"{who[-1]} family"
    return str(p.get("role") or slots.get("role") or "")


def _card_action(action: str) -> str:
    if action in INTENT_WORDS or " " in action or not action:
        return action.replace("_", " ")
    return f"went to {action.replace('_', ' ')}"


def moment_from_payload(payload: dict[str, Any], t: int, record_kind: str = "probe_result") -> MomentFrame:
    p = payload
    probe_id = str(p.get("probe_id") or p.get("id") or "")
    probe_type = str(p.get("type") or "fact")
    kind = str(p.get("moment_kind") or _moment_kind(probe_type, record_kind))
    slots = p.get("slots") or {}
    who = p.get("who") or slots.get("npc_kin") or slots.get("stranger") or p.get("npc") or slots.get("npc")
    claim = p.get("claim") or (p.get("plant_text") if kind == "plant" else p.get("payoff_text")) or ""
    ok = p.get("ok", p.get("passed"))
    delay = int(p.get("delay_seasons") or 0)
    return MomentFrame(
        t=t,
        probe_id=probe_id,
        kind=kind,  # type: ignore[arg-type]
        who=str(who or "someone"),
        role=_card_role(p, slots),
        claim=str(claim),
        retrieved=p.get("retrieved"),
        action=_card_action(str(p.get("action") or p.get("action_taken") or "")),
        ok=ok,
        label=str(p.get("label") or _moment_label(kind, ok, delay)),
        delay_seasons=delay,
    )


def _moment(record: TraceRecord, superseded: set[str], log: MemoryLog) -> MomentFrame | None:
    payload = record.payload
    probe_id = str(payload.get("probe_id") or payload.get("id") or "")
    if record.kind == "probe_payoff" and probe_id in superseded:
        return None
    if record.kind != "probe_plant":
        claim_words = str(payload.get("claim") or "").replace("'", " ").split()
        claim_names = " ".join(w for w in claim_words if w[:1].isupper())
        retrieved, source = log.resolve(
            record.t, f"{payload.get('who') or ''} {claim_names}", str(payload.get("npc") or "")
        )
        if retrieved and (source != "recall" or not payload.get("retrieved")):
            payload = payload | {"retrieved": retrieved, "retrieved_source": source}
    return moment_from_payload(payload, record.t, record.kind)



def _enrich_frames(frames: list[AnyFrame], records: Sequence[TraceRecord]) -> list[AnyFrame]:
    """Attaches each season's plan and money/health deltas so the viewer can show what happened."""
    plans = {r.t: (r.payload.get("plan") or r.payload) for r in records if r.kind == "plan"}
    previous: Frame | None = None
    out: list[AnyFrame] = []
    for frame in frames:
        if isinstance(frame, Frame):
            plan = plans.get(frame.t - 1) or plans.get(frame.t) or {}
            deltas = {}
            if previous is not None:
                deltas = {
                    "money": frame.hero.money - previous.hero.money,
                    "health": frame.hero.health - previous.hero.health,
                    "energy": frame.hero.energy - previous.hero.energy,
                }
            frame = frame.model_copy(update={"plan": dict(plan), "deltas": deltas})
            previous = frame
        out.append(frame)
    return out


def frames_from_trace(
    records: Iterable[TraceRecord], hello: HelloFrame, meta: dict[str, Any] | None = None
) -> list[AnyFrame]:
    records = list(records)
    superseded = {
        str(r.payload.get("probe_id") or r.payload.get("id") or "")
        for r in records
        if r.kind == "probe_result"
    }
    log = MemoryLog(memory_file_lines((meta or {}).get("home")))
    memory_by_t: dict[int, MemoryFrame] = {}
    for record in records:
        if record.kind == "memory":
            wrote = [str(line) for line in record.payload.get("wrote") or []]
            retrieved = [str(line) for line in record.payload.get("retrieved") or []]
            memory_by_t[record.t] = MemoryFrame(wrote=wrote, retrieved=retrieved)
            log.add(record.t, wrote, retrieved)
    frames: list[AnyFrame] = [hello]
    death: dict[str, Any] = {}
    scores: dict[str, Any] = {}
    cost = 0.0
    last_t = 0
    for record in records:
        cost += record.cost_usd or 0.0
        last_t = max(last_t, record.t)
        if record.kind == "observation" and record.payload.get("frame"):
            season = Frame.model_validate(record.payload["frame"])
            remembered = memory_by_t.get(record.t)
            if remembered is not None:
                season = season.model_copy(update={"memory": remembered})
            frames.append(season)
        elif record.kind in PROBE_KINDS:
            moment = _moment(record, superseded, log)
            if moment is not None:
                frames.append(moment)
        elif record.kind == "death":
            death = record.payload
        elif record.kind == "score":
            scores = record.payload
    from vitabench.scoring import score_run

    frames = _enrich_frames(frames, records)
    scores = {**scores, **score_run(records)}
    frames.append(
        EndFrame(
            t=int(death.get("t", last_t)),
            age=int(death.get("age", 0)),
            cause=str(death.get("cause", "unknown")),
            scores=scores,
            cost_usd=llm_cost(records) or float(scores.get("cost_usd") or cost),
        )
    )
    return frames


def write_frames_json(run_dir: str | Path) -> Path:
    records = read_trace(run_dir)
    frames = frames_from_trace(records, hello_from_trace(records), read_meta(run_dir))
    path = Path(run_dir) / FRAMES_NAME
    payload = [f.model_dump(by_alias=True) for f in frames]
    path.write_text(json.dumps(payload, ensure_ascii=False, default=_plain), encoding="utf-8")
    return path
