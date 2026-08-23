from __future__ import annotations

from typing import Any

from numpy.random import Generator

from .director import STREAM_PROBES, rng_for
from .probe_slots import ProbeError, build_probe, delay_label, plant_time, slots_for
from .schema import Conversation, DebtState, Persona, Probe, ScenarioSpec, Visitor

POSITIVES_PER_BUCKET = 2
NEGATIVE_COUNT = 3
NEGATIVE_DELAYS = (4, 40, 100)
ACCEPTING_INTENTS = ("pay", "agree", "lend")
SEASONS_PER_YEAR = 4


def plan_probes(
    spec: ScenarioSpec,
    persona: Persona,
    rng: Generator | int,
    max_seasons: int | None = None,
    roster: list[Any] | None = None,
) -> list[Probe]:
    if not spec.probes:
        raise ProbeError(f"scenario '{spec.id}' defines no probe templates")
    if not isinstance(rng, Generator):
        rng = rng_for(spec.id, int(rng), STREAM_PROBES)
    if max_seasons is None:
        max_seasons = spec.max_years * SEASONS_PER_YEAR
    buckets = sorted({d for template in spec.probes for d in template.delays})
    probes: list[Probe] = []
    index = 0
    for delay in buckets:
        for _ in range(POSITIVES_PER_BUCKET):
            template = spec.probes[index % len(spec.probes)]
            plant_t = plant_time(rng, delay, max_seasons)
            payoff_t = min(plant_t + delay, max_seasons - 1)
            slots = slots_for(spec, persona, rng, roster, plant_t)
            probes.append(build_probe(f"p_{index:02d}", template, slots, plant_t, payoff_t, negative=False))
            index += 1
    twins = [t for t in spec.probes if t.negative_twin]
    if len(twins) < NEGATIVE_COUNT:
        raise ProbeError(f"scenario '{spec.id}' has {len(twins)} negative twins, need {NEGATIVE_COUNT}")
    for n in range(NEGATIVE_COUNT):
        template = twins[n % len(twins)]
        delay = NEGATIVE_DELAYS[n % len(NEGATIVE_DELAYS)]
        plant_t = plant_time(rng, delay, max_seasons)
        payoff_t = min(plant_t + delay, max_seasons - 1)
        slots = slots_for(spec, persona, rng, roster, plant_t)
        probes.append(build_probe(f"p_{index:02d}", template, slots, plant_t, payoff_t, negative=True))
        index += 1
    return probes


def _amount(value: Any, slots: dict[str, Any]) -> int:
    if isinstance(value, bool):
        return int(slots["amount"])
    if isinstance(value, int):
        return value
    token = str(value).strip()
    sign = -1 if token.startswith("-") else 1
    key = token.lstrip("+-")
    if key in slots:
        return sign * int(slots[key])
    if key.isdigit():
        return sign * int(key)
    raise ProbeError(f"probe effect '{value}' does not resolve to a number")


def _debt_ledger(world: Any) -> list[DebtState]:
    ledger = getattr(world.state, "debts", None)
    return ledger if ledger is not None else world.debts


def _apply_effects(world: Any, probe: Probe) -> None:
    for key, value in dict(probe.slots.get("plant_effects") or {}).items():
        delta = _amount(value, probe.slots)
        if key == "money":
            world.state.money = max(0, world.state.money + delta)
        elif key == "health":
            world.state.health = max(0, min(100, world.state.health + delta))
        elif key == "debt":
            _debt_ledger(world).append(
                DebtState(to=probe.slots["npc_id"], amount=abs(delta), due_year=int(probe.slots["year"]) + 4)
            )


def record_for(kind: str, probe: Probe, **over: Any) -> dict[str, Any]:
    negative = bool(probe.slots.get("negative"))
    label = delay_label(probe.delay_seasons)
    if kind == "result":
        if negative:
            verdict = "refused" if probe.passed else "believed"
        else:
            verdict = "remembered" if probe.passed else "forgot"
        label = f"{verdict} · {label}"
    base = {
        "kind": kind,
        "moment_kind": "plant" if kind == "plant" else ("negative" if negative else "payoff"),
        "probe_id": probe.id,
        "template_id": probe.template_id,
        "type": probe.type,
        "t": probe.plant_t if kind == "plant" else probe.payoff_t,
        "who": probe.slots["plant_who"] if kind == "plant" else probe.slots["payoff_who"],
        "role": probe.slots.get("npc_role", ""),
        "claim": probe.plant_text if kind == "plant" else probe.payoff_text,
        "action": probe.action_taken or "",
        "ok": probe.passed,
        "passed": probe.passed,
        "npc": probe.npc or "",
        "retrieved": None,
        "label": label,
        "delay_seasons": probe.delay_seasons,
    }
    return base | over


def plant_due(world: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for probe in world.probes:
        if probe.planted or probe.slots["negative"] or probe.plant_t > world.t:
            continue
        probe.planted = True
        channel = probe.slots["plant_channel"]
        if channel == "meeting":
            world.pending_visitors.append(
                Visitor(
                    id=probe.slots["plant_visitor_id"],
                    npc=probe.slots["npc_id"],
                    name=probe.slots["npc"],
                    role=probe.slots["npc_role"],
                    says=probe.plant_text,
                    options=["agree", "refuse"],
                )
            )
        elif channel == "mother":
            world.pending_conversations.append(Conversation(npc="mother", says=probe.plant_text))
        else:
            world.pending_news.append(probe.plant_text)
        _apply_effects(world, probe)
        out.append(record_for("plant", probe, t=world.t, channel=channel))
    return out


def payoff_due(world: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for probe in world.probes:
        if probe.slots.get("payoff_delivered") or probe.resolved or probe.payoff_t > world.t:
            continue
        probe.slots["payoff_delivered"] = True
        channel = probe.slots["payoff_channel"]
        actor = probe.slots["payoff_actor"]
        if channel == "visitor" and actor:
            world.pending_visitors.append(
                Visitor(
                    id=probe.slots["payoff_visitor_id"],
                    npc=probe.npc,
                    name=actor,
                    role="stranger" if probe.slots["negative"] else "kin",
                    says=probe.payoff_text,
                    options=probe.options,
                )
            )
        else:
            world.pending_news.append(probe.payoff_text)
        out.append(record_for("payoff", probe, t=world.t, channel=channel))
    return out


def _targets(probe: Probe) -> set[str]:
    values = [probe.npc, probe.slots.get("payoff_visitor_id"), probe.slots.get("payoff_actor")]
    return {str(v).lower() for v in values if v}


def _expected(probe: Probe) -> list[str]:
    expected = probe.expected
    return [expected] if isinstance(expected, str) else list(expected)


def _hit(entry: dict[str, Any], probe: Probe, intents: list[str]) -> bool:
    target = str(entry.get("target") or "").lower()
    if probe.slots["check_kind"] == "goal_action":
        return target in {str(e).lower() for e in intents}
    if target not in _targets(probe):
        return False
    intent = str(entry.get("intent", ""))
    if intent not in intents:
        return False
    if intent == "pay" and probe.amount:
        amount = entry.get("amount")
        tolerance = float(probe.slots["amount_tolerance"]) * probe.amount
        if amount is not None and abs(float(amount) - probe.amount) > tolerance:
            return False
    return True


def _resolve(probe: Probe, passed: bool, action: str) -> dict[str, Any]:
    probe.resolved = True
    probe.passed = passed
    probe.action_taken = action
    return record_for("result", probe)


def check_due(world: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for probe in world.probes:
        if probe.resolved or not probe.slots.get("payoff_delivered"):
            continue
        window = probe.payoff_t + int(probe.slots["within_seasons"])
        entries = [e for e in world.action_log if probe.payoff_t <= int(e.get("t", -1)) <= window]
        expected = _expected(probe)
        hit = next((e for e in entries if _hit(e, probe, expected)), None)
        if hit is not None:
            action = str(hit.get("intent") or hit.get("target") or "acted")
            out.append(_resolve(probe, True, action))
            continue
        if probe.slots["negative"]:
            wrong = next((e for e in entries if _hit(e, probe, list(ACCEPTING_INTENTS))), None)
            if wrong is not None:
                out.append(_resolve(probe, False, str(wrong.get("intent") or "accepted")))
                continue
        if world.t > window:
            taken = next((e for e in entries if str(e.get("target") or "").lower() in _targets(probe)), None)
            action = str(taken.get("intent") or "none") if taken else "none"
            out.append(_resolve(probe, bool(probe.slots["negative"]), action))
    return out
