from __future__ import annotations

import logging
import os
from typing import Any

from vitabench.npcs import CLASS_FLAVOUR, NPC, REPLY_TEMPLATES
from vitabench.schema import Activity, LlmUsage, Observation

log = logging.getLogger(__name__)

MOTHER_LINES = (
    "Eat, you look thin.",
    "Your father would have wanted you settled by now.",
    "The priest asked after you again.",
    "Do not lend to men who smile too much.",
)

DIALOGUE_MODEL = "claude-haiku-4-5"
PRICE_IN_PER_MTOK = 1.0
PRICE_OUT_PER_MTOK = 5.0
MAX_TOKENS = 80

SYSTEM = (
    "You rephrase one line of speech for a townsperson in medieval Venice. "
    "Keep the meaning identical, keep it under 22 words, one sentence, no quotation marks around the "
    "whole line, no modern words, no narration about yourself."
)


def mother_line(t: int) -> str:
    return MOTHER_LINES[t % len(MOTHER_LINES)]


def render_observation(world: Any, obs: Observation) -> str:
    s = obs.self
    lines = [
        f"{obs.date}. You are {obs.age}, at {world.place_name(s.at)}.",
        f"Money {s.money} {world.spec.currency} · health {s.health} · energy {s.energy} · "
        f"hunger {s.hunger} · work: {s.job or 'none'}.",
    ]
    if s.assets:
        lines.append("You own: " + ", ".join(s.assets) + ".")
    if s.debts:
        owed = "; ".join(
            f"{d.amount} to {d.to} (due {d.due_year}{', overdue' if d.overdue else ''})" for d in s.debts
        )
        lines.append(f"Debts: {owed}.")
    if obs.events:
        lines.append("Venice: " + " ".join(obs.events))
    lines += [f"Word on the street: {news}" for news in obs.news]
    for v in obs.visitors:
        opts = f" [{'/'.join(v.options)}]" if v.options else ""
        lines.append(f'Caller — {v.name} the {v.role}: "{v.says}"{opts}')
    lines += [f'{c.npc.replace("_", " ").title()} says: "{c.says}"' for c in obs.conversations]
    if obs.nearby:
        lines.append("Nearby: " + ", ".join(f"{n.name} ({n.role})" for n in obs.nearby) + ".")
    lines.append("Market: " + " · ".join(f"{k} {v}" for k, v in sorted(obs.market.items())) + ".")
    lines.append("You still want to: " + "; ".join(obs.goals) + ".")
    return "\n".join(lines)


def activity_for(world: Any) -> Activity:
    plan = world.last_plan
    if not world.alive:
        return Activity(icon="🪦", text="at rest")
    if world.state.health < 35 or world.in_plague():
        return Activity(icon="🛏", text="abed with fever")
    if plan is None:
        return Activity(icon="🚶", text="walking the calle")
    if plan.main.value == "work" and world.state.job:
        job = world.jobs.get(world.state.job)
        return Activity(icon="🔨", text=f"working at {world.place_name(job.place) if job else 'work'}")
    if plan.moves:
        return Activity(icon="⚓", text=f"crossing to {world.place_name(plan.moves[-1])}")
    if plan.eat == "good":
        return Activity(icon="🍷", text="feasting well")
    if plan.talk:
        npc = world.roster.get(plan.talk[0].to)
        return Activity(icon="🗣", text=f"talking to {npc.name if npc else plan.talk[0].to}")
    return Activity(icon="😴", text="resting at home")


def template_line(npc: NPC, intent: str, context: dict[str, Any] | None = None) -> str:
    ctx = context or {}
    options = REPLY_TEMPLATES.get(intent, REPLY_TEMPLATES["chat"])
    idx = (len(npc.id) + len(intent)) % len(options)
    line = options[idx].format(
        name=npc.name,
        where=str(ctx.get("where", "market")),
        you=str(ctx.get("hero", "friend")),
    )
    tail = CLASS_FLAVOUR.get(npc.class_)
    return f"{line} {tail}" if tail and intent == "chat" else line


def _prompt(npc: NPC, intent: str, context: dict[str, Any], base: str) -> str:
    facts = ", ".join(f"{k}={v}" for k, v in sorted(context.items()) if k != "where")
    return (
        f"Speaker: {npc.name}, a {npc.role} of the {npc.class_} class in Venice.\n"
        f"Intent: {intent}. Facts: {facts or 'none'}.\n"
        f"Line to rephrase: {base}"
    )


def phrase_with_usage(
    npc: NPC,
    intent: str,
    context: dict[str, Any] | None = None,
    model: str | None = None,
) -> tuple[str, LlmUsage | None]:
    base = template_line(npc, intent, context)
    if not model or not os.environ.get("ANTHROPIC_API_KEY"):
        return base, None
    try:
        from anthropic import Anthropic

        response = Anthropic().messages.create(
            model=model,
            max_tokens=MAX_TOKENS,
            temperature=0,
            system=SYSTEM,
            messages=[{"role": "user", "content": _prompt(npc, intent, context or {}, base)}],
        )
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            return base, None
        usage = LlmUsage(
            model=model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cost_usd=(
                response.usage.input_tokens * PRICE_IN_PER_MTOK
                + response.usage.output_tokens * PRICE_OUT_PER_MTOK
            )
            / 1_000_000,
            purpose="dialogue",
        )
        return text, usage
    except Exception:
        log.warning("dialogue phrasing failed for %s; using template", npc.id, exc_info=True)
        return base, None


def phrase(
    npc: NPC,
    intent: str,
    context: dict[str, Any] | None = None,
    model: str | None = None,
) -> str:
    return phrase_with_usage(npc, intent, context, model)[0]
