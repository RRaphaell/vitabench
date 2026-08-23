from __future__ import annotations

import re
from typing import Any

import numpy as np

from vitabench.schema import (
    DeathSummary,
    Intent,
    Main,
    Observation,
    Persona,
    Plan,
    TalkItem,
    Visitor,
    WorkItem,
)

POLICIES = ("sensible", "random", "goldfish")
STOPWORDS = {
    "that", "this", "your", "with", "from", "they", "them", "will", "have", "said", "says",
    "ducats", "father", "mother", "always", "family", "owes", "owed", "when", "pay", "back",
    "you", "me", "the", "and", "for", "his", "her", "their", "must", "still", "never",
}
NAME_MIN = 4
CLAIM_OPTIONS = {"ask_proof"}
OFFER_OVERLAP = 2


def _intent(name: str) -> Intent:
    try:
        return Intent(name.lower())
    except ValueError:
        return Intent.chat


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{3,}", text.lower()) if w not in STOPWORDS and len(w) >= NAME_MIN}


def _amount(text: str) -> int | None:
    found = re.findall(r"\d+", text)
    return int(found[0]) if found else None


class MockAgent:
    def __init__(self, policy: str = "sensible", seed: int = 0) -> None:
        if policy not in POLICIES:
            raise ValueError(f"unknown policy {policy!r}, expected one of {POLICIES}")
        self.policy = policy
        self.rng = np.random.default_rng(seed)
        self.facts: list[dict[str, Any]] = []
        self.persona: Persona | None = None
        self.job: str | None = None
        self.last_usage = None

    def on_birth(self, persona: Persona, scenario_brief: str) -> None:
        self.persona = persona
        self.job = persona.job
        for debt in persona.debts:
            self._remember(0, debt.to, debt.to, f"owe {debt.amount} ducats to {debt.to}", debt.amount)

    def on_death(self, summary: DeathSummary) -> None:
        self.facts.clear()

    def _remember(self, t: int, npc: str, name: str, text: str, amount: int | None) -> None:
        self.facts.append(
            {
                "t": t,
                "npc": npc,
                "keys": _tokens(f"{npc} {name}"),
                "content": _tokens(text),
                "text": text,
                "amount": amount,
            }
        )

    def _ingest(self, observation: Observation) -> None:
        for visitor in observation.visitors:
            if not CLAIM_OPTIONS & {o.lower() for o in visitor.options}:
                self._remember(observation.t, visitor.npc, visitor.name, visitor.says, _amount(visitor.says))
        for talk in observation.conversations:
            self._remember(observation.t, talk.npc, talk.npc, talk.says, _amount(talk.says))
        for line in observation.news:
            self._remember(observation.t, "news", "news", line, _amount(line))

    def _match_demand(self, visitor: Visitor) -> dict[str, Any] | None:
        claim_keys = _tokens(f"{visitor.says} {visitor.npc} {visitor.name}")
        claim_amount = _amount(visitor.says)
        candidates = [f for f in self.facts if f["keys"] & claim_keys]
        if not candidates:
            return None
        if claim_amount is None:
            return candidates[-1]
        tolerance = max(1.0, 0.1 * claim_amount)
        exact = [f for f in candidates if f["amount"] and abs(f["amount"] - claim_amount) <= tolerance]
        return exact[-1] if exact else None

    def _match_offer(self, visitor: Visitor) -> dict[str, Any] | None:
        claim = _tokens(f"{visitor.says} {visitor.npc} {visitor.name}")
        for fact in reversed(self.facts):
            if fact["keys"] & claim or len(fact["content"] & claim) >= OFFER_OVERLAP:
                return fact
        return None

    def _answer_visitor(self, visitor: Visitor, money: int) -> TalkItem:
        options = [o.lower() for o in visitor.options]
        if "pay" in options:
            fact = self._match_demand(visitor)
            if fact is not None:
                amount = fact["amount"] or _amount(visitor.says) or 0
                return TalkItem(
                    to=visitor.npc, intent=Intent.pay, amount=min(amount, money), say="I remember."
                )
            intent = Intent.ask_proof if "ask_proof" in options else Intent.refuse
            return TalkItem(to=visitor.npc, intent=intent, say="I know of no such debt.")
        if "ask_proof" in options:
            if self._match_offer(visitor) is not None:
                return TalkItem(to=visitor.npc, intent=Intent.refuse, say="I remember why not.")
            return TalkItem(to=visitor.npc, intent=Intent.agree, say="Agreed.")
        if "agree" in options:
            return TalkItem(to=visitor.npc, intent=Intent.agree, say="I will.")
        if options:
            return TalkItem(to=visitor.npc, intent=_intent(options[0]), say="")
        return TalkItem(to=visitor.npc, intent=Intent.chat, say="")

    def _sensible(self, observation: Observation) -> Plan:
        me = observation.self
        buy: list[str] = []
        if me.health < 50 and "medicine" in observation.market:
            buy.append("medicine")
        if me.hunger < 40 and "bread" in observation.market:
            buy.append("bread")
        job = me.job or self.job
        working = bool(job) and me.energy > 20 and me.health > 20
        talk = [self._answer_visitor(v, me.money) for v in observation.visitors]
        answers = [
            {"question_id": q.id, "answer": self._recall(q.text)}
            for q in observation.questions
        ]
        return Plan(
            main=Main.work if working else Main.rest,
            work=WorkItem(job=job, weeks=10) if working else None,
            eat="plain",
            buy=buy,
            talk=talk,
            rest_weeks=3 if working else 13,
            answers=answers,  # type: ignore[arg-type]
            diary=f"{observation.date}: {'worked' if working else 'rested'}.",
        )

    def _recall(self, question: str) -> str:
        keys = _tokens(question)
        hits = [f for f in self.facts if f["keys"] & keys]
        return hits[-1]["text"] if hits else "I do not know."

    def _random(self, observation: Observation) -> Plan:
        market = list(observation.market)
        talk = [
            TalkItem(
                to=v.npc,
                intent=_intent(str(self.rng.choice(v.options))) if v.options else Intent.chat,
                say="",
            )
            for v in observation.visitors
        ]
        return Plan(
            main=Main(str(self.rng.choice(["work", "rest", "seek_job", "travel"]))),
            work=WorkItem(job=observation.self.job or self.job, weeks=int(self.rng.integers(0, 11))),
            eat=str(self.rng.choice(["poor", "plain", "good"])),  # type: ignore[arg-type]
            buy=[str(self.rng.choice(market))] if market and self.rng.random() < 0.5 else [],
            talk=talk,
            rest_weeks=int(self.rng.integers(0, 4)),
            answers=[{"question_id": q.id, "answer": "yes"} for q in observation.questions],  # type: ignore[arg-type]
            diary="",
        )

    def act(self, observation: Observation) -> Plan:
        if self.policy == "goldfish":
            self.facts.clear()
            return self._sensible(observation)
        plan = self._random(observation) if self.policy == "random" else self._sensible(observation)
        self._ingest(observation)
        return plan
