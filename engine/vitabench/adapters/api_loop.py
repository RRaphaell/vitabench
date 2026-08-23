from __future__ import annotations

import json
from typing import Any

from vitabench.adapters.base import llm_usage, observation_text, plan_tool_schema
from vitabench.harnesses.base import Harness
from vitabench.harnesses.none import NoneHarness
from vitabench.schema import DeathSummary, LlmUsage, Observation, Persona, Plan

DEFAULT_MODEL = "claude-sonnet-5"
MAX_TOOL_ROUNDS = 4
RULES = (
    "You live one life, one season per turn, from birth to death. You cannot pause and you never "
    "see an earlier turn again.\n"
    "Rules:\n"
    "- Every turn ends with exactly one call to the act tool. Nothing else counts as living.\n"
    "- Work to earn, eat to survive, buy medicine when your health falls.\n"
    "- People remember. Honour debts and promises you actually made, decades later if need be.\n"
    "- Strangers invent debts. If you have no record of a claim, refuse it or ask for proof.\n"
    "- Answer with the tool, not with prose."
)


class ApiLoopAgent:
    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        harness: Harness | None = None,
        max_tokens: int = 2048,
        client: Any = None,
    ) -> None:
        self.model = model
        self.harness = harness or NoneHarness()
        self.max_tokens = max_tokens
        self.client = client if client is not None else self._make_client()
        self.system = RULES
        self.last_usage: LlmUsage | None = None
        self.last_error: str | None = None

    @staticmethod
    def _make_client() -> Any:
        from anthropic import Anthropic

        return Anthropic()

    @property
    def tools(self) -> list[dict[str, Any]]:
        return [plan_tool_schema(), *self.harness.extra_tools()]

    def on_birth(self, persona: Persona, scenario_brief: str) -> None:
        self.system = f"{RULES}\n\n{scenario_brief}\n\n{persona.name}'s life:\n{persona.model_dump_json()}"
        self.harness.reset()

    def on_death(self, summary: DeathSummary) -> None:
        self.last_usage = None

    def _turn_text(self, observation: Observation) -> str:
        prefix = self.harness.prefix()
        body = observation_text(observation)
        return f"{prefix}\n\n{body}\n\nDecide this season and call act." if prefix else (
            f"{body}\n\nDecide this season and call act."
        )

    def _account(self, response: Any, totals: list[int]) -> None:
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        totals[0] += int(getattr(usage, "input_tokens", 0) or 0)
        totals[1] += int(getattr(usage, "output_tokens", 0) or 0)
        totals[2] += int(getattr(usage, "cache_read_input_tokens", 0) or 0)

    def act(self, observation: Observation) -> Plan:
        messages: list[dict[str, Any]] = [{"role": "user", "content": self._turn_text(observation)}]
        totals = [0, 0, 0]
        plan = Plan()
        self.last_error = None
        for _ in range(MAX_TOOL_ROUNDS):
            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=self.system,
                tools=self.tools,
                messages=messages,
            )
            self._account(response, totals)
            calls = [b for b in response.content if getattr(b, "type", "") == "tool_use"]
            act_call = next((c for c in calls if c.name == "act"), None)
            if act_call is not None:
                plan = self._to_plan(act_call.input)
                break
            if not calls:
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": "Call the act tool now."})
                continue
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": [self._tool_result(c) for c in calls]})
        self.last_usage = llm_usage(self.model, totals[0], totals[1], totals[2])
        return plan

    def _tool_result(self, call: Any) -> dict[str, Any]:
        try:
            content = self.harness.on_tool(call.name, dict(call.input))
        except KeyError as exc:
            return {"type": "tool_result", "tool_use_id": call.id, "content": str(exc), "is_error": True}
        return {"type": "tool_result", "tool_use_id": call.id, "content": content}

    def _to_plan(self, raw: Any) -> Plan:
        payload = raw if isinstance(raw, dict) else json.loads(raw)
        try:
            return Plan.model_validate(payload)
        except Exception as exc:  # noqa: BLE001 - an invalid plan is a scored outcome, not a crash
            self.last_error = str(exc)
            return Plan()

    def memory(self) -> dict[str, list[str]]:
        return self.harness.drain_memory()
