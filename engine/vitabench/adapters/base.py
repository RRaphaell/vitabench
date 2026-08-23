from __future__ import annotations

import json
from typing import Protocol, runtime_checkable

from vitabench.schema import DeathSummary, LlmUsage, Observation, Persona, Plan, ScenarioSpec

PRICES_PER_MTOK: dict[str, tuple[float, float]] = {
    "opus-5": (5.0, 25.0),
    "opus-4-8": (5.0, 25.0),
    "opus-4-7": (5.0, 25.0),
    "opus-4-6": (5.0, 25.0),
    "opus": (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku": (1.0, 5.0),
}
CACHE_READ_FRACTION = 0.1


@runtime_checkable
class Agent(Protocol):
    def on_birth(self, persona: Persona, scenario_brief: str) -> None: ...

    def act(self, observation: Observation) -> Plan: ...

    def on_death(self, summary: DeathSummary) -> None: ...


def price_for(model: str) -> tuple[float, float]:
    name = model.lower()
    for key, price in PRICES_PER_MTOK.items():
        if key in name:
            return price
    return PRICES_PER_MTOK["sonnet"]


def usage_cost(model: str, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0) -> float:
    price_in, price_out = price_for(model)
    billed_in = input_tokens + cache_read_tokens * CACHE_READ_FRACTION
    return round((billed_in * price_in + output_tokens * price_out) / 1_000_000, 6)


def llm_usage(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    purpose: str = "agent",
) -> LlmUsage:
    return LlmUsage(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens,
        cost_usd=usage_cost(model, input_tokens, output_tokens, cache_read_tokens),
        purpose=purpose,  # type: ignore[arg-type]
    )


def persona_brief(persona: Persona) -> str:
    goals = "; ".join(g.text for g in persona.goals) or "none"
    debts = "; ".join(f"{d.amount} ducats to {d.to} (due {d.due_year})" for d in persona.debts) or "none"
    traits = ", ".join(f"{k} {v}" for k, v in persona.traits.items()) or "none"
    return (
        f"You are {persona.name}, born {persona.born}, {persona.sex}, a {persona.job} living at "
        f"{persona.home} in {persona.district}.\n"
        f"Traits: {traits}.\nGoals: {goals}.\nDebts: {debts}.\n"
        f"Backstory: {persona.backstory}"
    )


def scenario_brief(spec: ScenarioSpec) -> str:
    jobs = ", ".join(f"{j.title} ({j.wage_week}/week at {j.place})" for j in spec.economy.jobs)
    items = ", ".join(f"{i.id} {i.price}" for i in spec.economy.items)
    return (
        f"{spec.city}, {spec.start_year}. You will live up to {spec.max_years} years, one turn per season "
        f"(13 weeks). Money is {spec.currency}.\n"
        f"Jobs: {jobs}.\nItems: {items}.\n"
        "Each turn you receive an observation and must return one plan through the act tool. "
        "People remember what you promised; strangers sometimes claim debts that were never made."
    )


def plan_tool_schema() -> dict[str, object]:
    return {
        "name": "act",
        "description": "Submit the plan for this season. Exactly one call per observation.",
        "input_schema": Plan.model_json_schema(),
    }


def observation_text(observation: Observation) -> str:
    if observation.text:
        return observation.text
    return json.dumps(observation.model_dump(mode="json"), ensure_ascii=False)
