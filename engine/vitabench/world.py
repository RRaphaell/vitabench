from __future__ import annotations

from typing import Any

from vitabench import economy
from vitabench.clock import age_at, is_year_end, label, life_seasons, year_of
from vitabench.dialogue import activity_for, mother_line, render_observation
from vitabench.director import STREAM_HAZARD, ScheduledEvent, build_script, rng_for
from vitabench.npcs import Roster
from vitabench.schema import (
    WEEKS_PER_SEASON,
    Activity,
    Conversation,
    DeathSummary,
    DebtState,
    Intent,
    Job,
    Main,
    Nearby,
    Observation,
    Persona,
    Plan,
    Probe,
    ScenarioSpec,
    SelfState,
    TalkItem,
    Visitor,
)


def _probe_hook(name: str):
    try:
        from vitabench import probes as probes_module
    except Exception:
        return None
    return getattr(probes_module, name, None)


class World:
    def __init__(
        self,
        spec: ScenarioSpec,
        persona_id: str,
        seed: int,
        probes: list[Probe] | None = None,
    ) -> None:
        self.spec = spec
        self.seed = seed
        self.persona = self._find_persona(persona_id)
        self.places = {p.id: p for p in spec.map.places}
        self.jobs = {j.id: j for j in spec.economy.jobs}
        self.items = {i.id: i for i in spec.economy.items}
        self.t = 0
        self.max_t = life_seasons(spec.max_years)
        self.alive = True
        self.cause = ""
        self.state = SelfState(
            at=self.persona.home,
            job=self.persona.job or None,
            money=self.persona.money,
            health=self.persona.health,
            energy=self.persona.energy,
            hunger=self.persona.hunger,
            assets=[],
            debts=[DebtState(to=d.to, amount=d.amount, due_year=d.due_year) for d in self.persona.debts],
        )
        self.roster = Roster(spec, self.persona, seed)
        self.script = build_script(spec, seed)
        self.active_events: list[ScheduledEvent] = []
        self.action_log: list[dict[str, Any]] = []
        self.memory_lines: list[str] = []
        self.pending_visitors: list[Visitor] = []
        self.pending_conversations: list[Conversation] = []
        self.pending_news: list[str] = []
        self.probes: list[Probe] = probes if probes is not None else []
        self.met: set[str] = set()
        self.last_plan: Plan | None = None
        self.season_events: list[dict[str, Any]] = []
        self.probe_records: list[dict[str, Any]] = []
        self.rng = rng_for(spec.id, seed, STREAM_HAZARD)
        self._enter_season()

    def _find_persona(self, persona_id: str) -> Persona:
        for p in self.spec.personas:
            if p.id == persona_id:
                return p
        raise KeyError(f"unknown persona {persona_id!r} in scenario {self.spec.id!r}")

    @property
    def debts(self) -> list[DebtState]:
        return self.state.debts

    @property
    def year(self) -> int:
        return year_of(self.spec.start_year, self.t)

    @property
    def age(self) -> int:
        return age_at(self.persona.born, self.spec.start_year, self.t)

    def event_mult(self, key: str) -> float:
        m = 1.0
        for ev in self.active_events:
            value = ev.effects.get(key)
            if isinstance(value, int | float):
                m *= float(value)
        return m

    def in_plague(self) -> bool:
        return any(ev.kind == "plague" for ev in self.active_events)

    def market(self) -> dict[str, int]:
        return economy.market_prices(
            self.items.values(), self.spec.economy.price_index, self.year, self.event_mult("price_mult")
        )

    def place_name(self, place_id: str) -> str:
        place = self.places.get(place_id)
        return place.name if place else place_id

    def observe(self) -> Observation:
        for debt in self.state.debts:
            debt.overdue = debt.due_year < self.year
        nearby = [
            Nearby(npc=n.id, name=n.name, role=n.role, trust=round(n.trust, 2))
            for n in self.roster.nearby(self.state.at, self.t)
        ]
        self.met.update(n.npc for n in nearby)
        self.met.update(v.npc for v in self.pending_visitors)
        obs = Observation(
            t=self.t,
            date=label(self.spec.start_year, self.t),
            year=self.year,
            season=self.t % 4,
            age=self.age,
            self=self.state.model_copy(deep=True),
            news=list(self.pending_news[:3]),
            events=[ev.text for ev in self.active_events],
            visitors=list(self.pending_visitors),
            conversations=self._conversations(),
            market=self.market(),
            nearby=nearby,
            goals=[g.text for g in self.persona.goals],
            questions=[],
            text="",
        )
        return obs.model_copy(update={"text": render_observation(self, obs)})

    def _conversations(self) -> list[Conversation]:
        convos = list(self.pending_conversations)
        mother = self.roster.by_id.get("mother")
        if mother and mother.alive and self.state.at == self.persona.home:
            if not any(c.npc == "mother" for c in convos):
                convos.append(Conversation(npc="mother", says=mother_line(self.t)))
        return convos

    def step_season(self, plan: Plan) -> list[dict[str, Any]]:
        if not self.alive:
            return []
        self.last_plan = plan
        if plan.diary.strip():
            self.memory_lines.append(plan.diary.strip())
        job = self._plan_job(plan)
        work_weeks = min(plan.work.weeks if plan.work else 0, WEEKS_PER_SEASON) if job else 0
        moves = [m for m in plan.moves if m in self.places][: WEEKS_PER_SEASON - work_weeks]
        rest_weeks = min(plan.rest_weeks, WEEKS_PER_SEASON - work_weeks - len(moves))
        if plan.main == Main.seek_job and job is not None:
            self.state.job = job.id
            self._log("seek_job", target=job.id)
        illness_p = float(self.spec.hazards.get("illness", 0.0)) * self.event_mult("illness_mult")
        wage_mult = self.event_mult("wage_mult") * self.event_mult("trade_mult")
        sick = [bool(self.rng.random() < illness_p) for _ in range(WEEKS_PER_SEASON)]
        wages, food = economy.run_weeks(
            self.state, job, work_weeks, moves, rest_weeks, economy.EAT_TIERS[plan.eat],
            self.market().get("bread", 1), wage_mult, sick, self.health_cap(),
        )
        if work_weeks and job is not None:
            self._log("work", target=job.id, amount=wages)
        for move in moves:
            self._log("move", target=move)
        if food:
            self._log("eat", target=plan.eat, amount=food)
        if rest_weeks:
            self._log("rest", amount=rest_weeks)
        self._buy(plan.buy)
        for item in plan.talk:
            self._talk(item)
        self._death_check()
        self._call_probe("check_due")
        events = self.season_events
        self.t += 1
        self.pending_visitors = []
        self.pending_conversations = []
        self.pending_news = []
        self._enter_season()
        return events

    def _plan_job(self, plan: Plan) -> Job | None:
        wanted = (plan.work.job if plan.work else None) or self.state.job
        job, failure = economy.pick_job(self.jobs, self.state, wanted)
        if failure and (failure.get("amount") is not None or plan.main in (Main.work, Main.seek_job)):
            self._log("work_failed", **failure)
        return job

    def _buy(self, buy: list[str]) -> None:
        for item_id, price in economy.buy_items(self.state, buy, self.items, self.market()):
            self._log("buy", target=item_id, amount=price)
        self._clamp()

    def _talk(self, item: TalkItem) -> None:
        npc = self.roster.get(item.to)
        creditor = any(d.to == item.to for d in self.state.debts)
        target = item.to if creditor or npc is None else npc.id
        amount = economy.apply_talk(self.state, target, item.intent, item.amount, self.year)
        if npc is not None:
            self.met.add(npc.id)
            delta = {Intent.pay: 0.1, Intent.agree: 0.05, Intent.refuse: -0.1, Intent.promise: 0.05}
            npc.trust = round(min(1.0, max(0.0, npc.trust + delta.get(item.intent, 0.01))), 3)
        self._log("talk", target=target, amount=amount, intent=item.intent.value)

    def health_cap(self) -> int:
        return economy.health_cap(self.age)

    def _clamp(self) -> None:
        economy.clamp(self.state, self.health_cap())

    def _sync_active(self) -> None:
        self.active_events = [ev for ev in self.script if ev.active_at(self.t)]

    def _fire(self, ev: ScheduledEvent) -> None:
        effects = ev.effects
        economy.apply_event_effects(self.state, effects)
        dead = self.roster.plague_deaths(float(effects.get("npc_death_rate", 0.0)), self.t, self.rng)
        self._clamp()
        self.pending_news.append(ev.text)
        self.season_events.append(
            {"t": self.t, "id": ev.id, "kind": ev.kind, "text": ev.text, "npc_deaths": dead}
        )

    def _enter_season(self) -> None:
        self.season_events = []
        self._sync_active()
        for ev in self.script:
            if ev.t == self.t:
                self._fire(ev)
        self._call_probe("plant_due")
        self._call_probe("payoff_due")

    def _call_probe(self, name: str) -> None:
        hook = _probe_hook(name)
        if hook is None:
            return
        records = hook(self)
        if records:
            self.probe_records.extend(records)

    def drain_probe_records(self) -> list[dict[str, Any]]:
        drained, self.probe_records = self.probe_records, []
        return drained

    def _death_check(self) -> None:
        if self.state.health <= 0:
            self._die("starvation" if self.state.hunger <= 0 else "illness")
            return
        if not is_year_end(self.t):
            return
        if self.rng.random() < economy.mortality_hazard(self.age, self.in_plague()):
            self._die("plague" if self.in_plague() else "old age")

    def _die(self, cause: str) -> None:
        self.alive = False
        self.cause = cause
        self.season_events.append({"t": self.t, "id": "death", "kind": "death", "text": cause})

    def _log(self, kind: str, target: str | None = None, amount: int | None = None,
             intent: str | None = None) -> None:
        self.action_log.append(
            {"t": self.t, "kind": kind, "target": target, "amount": amount, "intent": intent}
        )

    def goals_met(self) -> list[str]:
        return economy.goals_met(self.persona, self.state)

    def death_summary(self) -> DeathSummary:
        return DeathSummary(
            t=self.t,
            age=self.age,
            cause=self.cause or ("outlived the scenario" if self.t >= self.max_t else "unknown"),
            money=self.state.money,
            goals_met=self.goals_met(),
            years_lived=max(0, self.age - self.spec.start_age_default),
        )

    def hero_activity(self) -> Activity:
        return activity_for(self)
