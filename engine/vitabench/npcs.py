from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

from vitabench.director import STREAM_NPC, rng_for
from vitabench.schema import WEEKS_PER_SEASON, Persona, Place, ScenarioSpec

MODEL_LETTERS = "abcdef"
DEFAULT_TRUST = 0.3

REPLY_TEMPLATES: dict[str, tuple[str, ...]] = {
    "chat": (
        "{name} shrugs. 'The lagoon stinks, the Doge taxes, life goes on.'",
        "{name} nods. 'Work is work. Come by the {where} sometime.'",
    ),
    "agree": ("{name} smiles. 'Good. I will hold you to it.'",),
    "refuse": ("{name} stiffens. 'As you like. I will remember.'",),
    "pay": ("{name} counts the coins twice. 'Settled, then.'",),
    "ask_proof": ("{name} spreads empty hands. 'Proof? My word is my ledger.'",),
    "promise": ("{name} touches your sleeve. 'A promise is a debt, {you}.'",),
    "lend": ("{name} takes the purse. 'You will have it back, on my mother's grave.'",),
    "borrow": ("{name} frowns, then relents. 'Pay me back when you can.'",),
}

CLASS_FLAVOUR = {
    "poor": "and goes back to hauling.",
    "merchant": "and returns to the ledgers.",
    "clergy": "and murmurs a blessing.",
    "noble": "and turns away without waiting.",
}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


@dataclass
class NPC:
    id: str
    name: str
    role: str
    class_: str
    sex: str
    model: str
    home: str
    routine: list[str]
    trust: float = DEFAULT_TRUST
    alive: bool = True
    death_t: int | None = None
    memory: list[str] = field(default_factory=list)


class Roster:
    def __init__(self, spec: ScenarioSpec, persona: Persona, seed: int) -> None:
        self.spec = spec
        self.places: dict[str, Place] = {p.id: p for p in spec.map.places}
        self.rng = rng_for(spec.id, seed, STREAM_NPC)
        self.npcs: list[NPC] = []
        self.by_id: dict[str, NPC] = {}
        self._build(spec, persona)

    # ---------- construction ----------

    def _homes(self, district: str | None) -> list[str]:
        homes = [p.id for p in self.spec.map.places if p.kind == "home"]
        if district:
            scoped = [p.id for p in self.spec.map.places if p.kind == "home" and p.district == district]
            if scoped:
                return scoped
        return homes or [p.id for p in self.spec.map.places]

    def _resolve_routine(self, tokens: list[str], home: str) -> list[str]:
        out: list[str] = []
        for token in tokens:
            if token == "home":
                out.append(home)
            elif token in self.places:
                out.append(token)
            else:
                matches = [p.id for p in self.spec.map.places if p.kind == token]
                out.append(matches[int(self.rng.integers(len(matches)))] if matches else home)
        return out or [home]

    def _trust_for(self, persona: Persona, npc_id: str, role: str, name: str) -> float:
        low = name.lower()
        for rel in persona.relationships:
            key = rel.npc.lower()
            if key in (npc_id, role) or key in low:
                return float(rel.trust)
        return DEFAULT_TRUST

    def _build(self, spec: ScenarioSpec, persona: Persona) -> None:
        pools = spec.cast.name_pools
        families = pools.get("families", ["Veneto"])
        used: set[str] = set()
        for role_spec in spec.cast.roles:
            pool = pools.get(role_spec.name_pool, ["Anon"])
            sex = "female" if "female" in role_spec.name_pool else "male"
            for _ in range(role_spec.count):
                given = pool[int(self.rng.integers(len(pool)))]
                family = families[int(self.rng.integers(len(families)))]
                name = f"{given} {family}"
                npc_id = slug(name)
                n = 2
                while npc_id in used:
                    npc_id = f"{slug(name)}_{n}"
                    n += 1
                used.add(npc_id)
                home = self._homes(role_spec.home_district)
                home_id = home[int(self.rng.integers(len(home)))]
                letter = MODEL_LETTERS[int(self.rng.integers(len(MODEL_LETTERS)))]
                self._add(
                    NPC(
                        id=npc_id,
                        name=name,
                        role=role_spec.role,
                        class_=role_spec.class_,
                        sex=sex,
                        model=f"character-{sex}-{letter}",
                        home=home_id,
                        routine=self._resolve_routine(role_spec.routine, home_id),
                        trust=self._trust_for(persona, npc_id, role_spec.role, name),
                    )
                )
        self._add_family(persona)

    def _add_family(self, persona: Persona) -> None:
        mother = persona.family.get("mother") if isinstance(persona.family, dict) else None
        if not isinstance(mother, dict) or not mother.get("alive", False):
            return
        name = str(mother.get("name", "Mother"))
        self._add(
            NPC(
                id="mother",
                name=name,
                role="mother",
                class_="family",
                sex="female",
                model="character-female-a",
                home=persona.home,
                routine=[persona.home] * 5,
                trust=self._trust_for(persona, "mother", "mother", name),
            )
        )

    def _add(self, npc: NPC) -> None:
        self.npcs.append(npc)
        self.by_id[npc.id] = npc

    # ---------- queries ----------

    def get(self, key: str) -> NPC | None:
        if key in self.by_id:
            return self.by_id[key]
        low = key.lower().strip()
        for npc in self.npcs:
            if npc.name.lower() == low or npc.role == low:
                return npc
        for npc in self.npcs:
            if low and low in npc.name.lower():
                return npc
        return None

    def position_at(self, npc_id: str, t: int, week: int = 0) -> str:
        npc = self.by_id.get(npc_id)
        if npc is None:
            return next(iter(self.places), "")
        if not npc.alive:
            return npc.home
        slot = (t * WEEKS_PER_SEASON + week) % len(npc.routine)
        return npc.routine[slot]

    def alive_npcs(self) -> list[NPC]:
        return [n for n in self.npcs if n.alive]

    def nearby(self, place: str, t: int, week: int = 0, limit: int = 4) -> list[NPC]:
        here = [n for n in self.alive_npcs() if self.position_at(n.id, t, week) == place]
        here.sort(key=lambda n: (-n.trust, n.id))
        return here[:limit]

    def kill(self, npc_id: str, t: int) -> None:
        npc = self.by_id.get(npc_id)
        if npc is not None and npc.alive:
            npc.alive = False
            npc.death_t = t

    def plague_deaths(self, rate: float, t: int, rng: np.random.Generator) -> list[str]:
        living = self.alive_npcs()
        if not living or rate <= 0:
            return []
        draws = rng.random(len(living))
        dead = [npc.id for npc, d in zip(living, draws.tolist(), strict=False) if d < rate]
        for npc_id in dead:
            self.kill(npc_id, t)
        return dead

    # ---------- speech ----------

    def reply(self, npc: NPC, intent: str, context: dict[str, object] | None = None) -> str:
        ctx = context or {}
        options = REPLY_TEMPLATES.get(intent, REPLY_TEMPLATES["chat"])
        idx = (len(npc.id) + len(intent)) % len(options)
        where = self.places[npc.routine[1 % len(npc.routine)]].name if self.places else "market"
        line = options[idx].format(name=npc.name, where=where, you=str(ctx.get("hero", "friend")))
        tail = CLASS_FLAVOUR.get(npc.class_)
        return f"{line} {tail}" if tail and intent == "chat" else line
