from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SEASONS = ("Spring", "Summer", "Autumn", "Winter")
WEEKS_PER_SEASON = 13


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ---------- scenario files ----------


class WaterLine(Strict):
    kind: Literal["canal"] = "canal"
    axis: Literal["x", "z"]
    at: int


class District(Strict):
    id: str
    name: str
    tiles: tuple[tuple[int, int], tuple[int, int]]


class Place(Strict):
    id: str
    kind: Literal["home", "work", "market", "church", "tavern", "dock", "hills", "notary"]
    district: str
    xz: tuple[int, int]
    name: str
    price_mult: float = 1.0


class Landmark(Strict):
    id: str
    kind: Literal["basilica", "campanile", "bridge", "arsenale", "furnace", "fountain"]
    xz: tuple[int, int]


class MapSpec(Strict):
    size: dict[Literal["cols", "rows"], int]
    water: list[WaterLine]
    districts: list[District]
    places: list[Place]
    landmarks: list[Landmark] = []


class Job(Strict):
    id: str
    title: str
    place: str
    wage_week: int
    health_week: int = 0
    energy_week: int = -6
    requires: dict[str, int] = {}


class Item(Strict):
    id: str
    price: int
    effects: dict[str, Any] = {}


class EconomySpec(Strict):
    jobs: list[Job]
    items: list[Item]
    price_index: dict[int, float]


class HistoryEvent(Strict):
    year: int
    season: int
    id: str
    kind: Literal["plague", "war", "politics", "flood", "famine", "festival", "market"]
    text: str
    effects: dict[str, Any] = {}
    duration_seasons: int = 1


class RoleSpec(Strict):
    role: str
    count: int
    routine: list[str]
    name_pool: str
    class_: str = Field(alias="class")
    home_district: str | None = None
    dialogue_persona: str = ""


class CastSpec(Strict):
    roles: list[RoleSpec]
    name_pools: dict[str, list[str]]


class Goal(Strict):
    id: str
    text: str
    check: dict[str, Any]


class Debt(Strict):
    to: str
    amount: int
    due_year: int


class Relationship(Strict):
    npc: str
    trust: float


class Persona(Lenient):
    id: str
    name: str
    born: int
    sex: Literal["male", "female"]
    job: str
    home: str
    district: str
    money: int
    health: int
    energy: int
    hunger: int
    family: dict[str, Any] = {}
    traits: dict[str, float] = {}
    skills: dict[str, float] = {}
    hobbies: list[str] = []
    fears: list[str] = []
    languages: list[str] = []
    religion: str = ""
    goals: list[Goal] = []
    debts: list[Debt] = []
    secrets: list[str] = []
    relationships: list[Relationship] = []
    backstory: str = ""
    features: dict[str, Any] = {}


ProbeType = Literal["ledger", "promise", "person", "lesson", "fact", "news", "negative", "quiz"]
Channel = Literal["meeting", "mother", "news", "letter", "visitor"]


class ProbeSide(Strict):
    channel: Channel
    text: str
    effects: dict[str, Any] = {}
    options: list[str] = []


class ProbeCheck(Strict):
    kind: Literal["action", "answer", "goal_action"]
    expected: str | list[str]
    amount_tolerance: float = 0.1
    within_seasons: int = 2


class ProbeTemplate(Strict):
    id: str
    type: ProbeType
    plant: ProbeSide
    payoff: ProbeSide
    check: ProbeCheck
    delays: list[int]
    negative_twin: dict[str, Any] | None = None


class ScenarioSpec(Strict):
    id: str
    city: str
    start_year: int
    max_years: int
    currency: str
    start_age_default: int = 22
    hazards: dict[str, float] = {}
    map: MapSpec
    economy: EconomySpec
    events: list[HistoryEvent]
    cast: CastSpec
    personas: list[Persona]
    probes: list[ProbeTemplate]


# ---------- runtime ----------


class Probe(Strict):
    id: str
    template_id: str
    type: ProbeType
    plant_t: int
    payoff_t: int
    delay_seasons: int
    slots: dict[str, Any]
    plant_text: str
    payoff_text: str
    options: list[str]
    expected: str | list[str]
    amount: int | None = None
    npc: str | None = None
    planted: bool = False
    resolved: bool = False
    passed: bool | None = None
    action_taken: str | None = None


class DebtState(Strict):
    to: str
    amount: int
    due_year: int
    overdue: bool = False


class SelfState(Strict):
    at: str
    job: str | None
    money: int
    health: int
    energy: int
    hunger: int
    assets: list[str] = []
    debts: list[DebtState] = []


class Visitor(Strict):
    id: str
    npc: str
    name: str
    role: str
    says: str
    options: list[str] = []


class Conversation(Strict):
    npc: str
    says: str


class Nearby(Strict):
    npc: str
    name: str
    role: str
    trust: float


class Question(Strict):
    id: str
    text: str


class Observation(Strict):
    t: int
    date: str
    year: int
    season: int
    age: int
    self: SelfState
    news: list[str] = []
    events: list[str] = []
    visitors: list[Visitor] = []
    conversations: list[Conversation] = []
    market: dict[str, int] = {}
    nearby: list[Nearby] = []
    goals: list[str] = []
    questions: list[Question] = []
    text: str


class Main(StrEnum):
    work = "work"
    rest = "rest"
    seek_job = "seek_job"
    travel = "travel"


class Intent(StrEnum):
    chat = "chat"
    agree = "agree"
    refuse = "refuse"
    pay = "pay"
    ask_proof = "ask_proof"
    promise = "promise"
    lend = "lend"
    borrow = "borrow"


class WorkItem(Lenient):
    job: str | None = None
    weeks: int = Field(default=10, ge=0, le=WEEKS_PER_SEASON)


class TalkItem(Lenient):
    to: str
    intent: Intent = Intent.chat
    say: str = ""
    amount: int | None = None


class Answer(Lenient):
    question_id: str
    answer: str


class Plan(Lenient):
    main: Main = Main.rest
    work: WorkItem | None = None
    moves: list[str] = []
    eat: Literal["poor", "plain", "good"] = "plain"
    buy: list[str] = []
    talk: list[TalkItem] = []
    rest_weeks: int = Field(default=0, ge=0, le=WEEKS_PER_SEASON)
    answers: list[Answer] = []
    diary: str = ""


class DeathSummary(Strict):
    t: int
    age: int
    cause: str
    money: int
    goals_met: list[str]
    years_lived: int


TraceKind = Literal[
    "birth", "observation", "plan", "plan_invalid", "event", "npc", "talk",
    "probe_plant", "probe_payoff", "probe_result", "llm", "memory", "death", "score",
]


class TraceRecord(Strict):
    seq: int
    run_id: str
    t: int
    kind: TraceKind
    payload: dict[str, Any]
    wall_ms: int | None = None
    cost_usd: float | None = None


class LlmUsage(Strict):
    model: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int = 0
    cost_usd: float
    purpose: Literal["agent", "dialogue", "judge"]


# ---------- viewer frames ----------


class Activity(Strict):
    icon: str
    text: str


class HeroFrame(Strict):
    xz: tuple[int, int]
    to: str | None
    age: int
    money: int
    health: int
    energy: int
    activity: Activity
    alive: bool = True


class PersonFrame(Strict):
    id: str
    xz: tuple[int, int]
    to: str | None
    alive: bool = True
    talking: bool = False


class EventFrame(Strict):
    id: str
    kind: str
    active: bool
    text: str = ""
    district: str | None = None


class MemoryFrame(Strict):
    wrote: list[str] = []
    retrieved: list[str] = []


class RelationFrame(Strict):
    id: str
    name: str
    role: str
    world: bool
    agent: bool


class RosterEntry(Strict):
    id: str
    name: str
    role: str
    class_: str = Field(alias="class")
    model: str
    home: str
    routine: list[str]


class HelloFrame(Strict):
    type: Literal["hello"] = "hello"
    run_id: str
    scenario: MapSpec
    scenario_id: str
    start_year: int
    max_years: int
    persona: Persona
    roster: list[RosterEntry]
    harness: str
    model: str
    seed: int


class Frame(Strict):
    type: Literal["frame"] = "frame"
    t: int
    date: str
    hero: HeroFrame
    people: list[PersonFrame]
    events: list[EventFrame] = []
    news: str = ""
    memory: MemoryFrame = MemoryFrame()
    relations: list[RelationFrame] = []


class MomentFrame(Strict):
    type: Literal["moment"] = "moment"
    t: int
    probe_id: str
    kind: Literal["plant", "payoff", "negative", "quiz"]
    who: str
    role: str = ""
    claim: str
    retrieved: str | None = None
    action: str = ""
    ok: bool | None = None
    label: str = ""
    delay_seasons: int = 0


class EndFrame(Strict):
    type: Literal["end"] = "end"
    t: int
    age: int
    cause: str
    scores: dict[str, Any]
    cost_usd: float


AnyFrame = HelloFrame | Frame | MomentFrame | EndFrame


def season_label(start_year: int, t: int) -> str:
    return f"{SEASONS[t % 4]} {start_year + t // 4}"
