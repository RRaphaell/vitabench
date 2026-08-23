from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ValidationError

from .schema import (
    CastSpec,
    EconomySpec,
    HistoryEvent,
    MapSpec,
    Persona,
    ProbeTemplate,
    ScenarioSpec,
)

MAPPING_SECTIONS: dict[str, type[BaseModel]] = {"map": MapSpec, "economy": EconomySpec, "cast": CastSpec}
LIST_SECTIONS: dict[str, type[BaseModel]] = {
    "events": HistoryEvent,
    "personas": Persona,
    "probes": ProbeTemplate,
}
ROOT_FILE = "scenario.yaml"


class ScenarioError(ValueError):
    pass


def _read_yaml(path: Path) -> Any:
    if not path.exists():
        raise ScenarioError(f"{path}: file not found")
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ScenarioError(f"{path.name}: invalid YAML — {exc}") from exc


def _format_validation_error(name: str, exc: ValidationError) -> str:
    lines = [f"{name}: {exc.error_count()} validation error(s)"]
    for err in exc.errors()[:8]:
        where = ".".join(str(p) for p in err["loc"]) or "<root>"
        lines.append(f"  {where}: {err['msg']}")
    return "\n".join(lines)


def _validate_section(name: str, file_name: str, raw: Any) -> Any:
    if name in MAPPING_SECTIONS:
        if not isinstance(raw, dict):
            raise ScenarioError(f"{file_name}: expected a mapping at the top level, got {type(raw).__name__}")
        try:
            return MAPPING_SECTIONS[name].model_validate(raw)
        except ValidationError as exc:
            raise ScenarioError(_format_validation_error(file_name, exc)) from exc
    if not isinstance(raw, list):
        raise ScenarioError(f"{file_name}: expected a list at the top level, got {type(raw).__name__}")
    model = LIST_SECTIONS[name]
    out = []
    for i, entry in enumerate(raw):
        try:
            out.append(model.model_validate(entry))
        except ValidationError as exc:
            raise ScenarioError(_format_validation_error(f"{file_name}[{i}]", exc)) from exc
    return out


def _duplicates(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    dupes: list[str] = []
    for value in ids:
        if value in seen and value not in dupes:
            dupes.append(value)
        seen.add(value)
    return dupes


def _check_map(spec: ScenarioSpec, errors: list[str]) -> None:
    cols, rows = spec.map.size["cols"], spec.map.size["rows"]
    districts = {d.id for d in spec.map.districts}
    canals_x = {w.at for w in spec.map.water if w.axis == "x"}
    canals_z = {w.at for w in spec.map.water if w.axis == "z"}
    for dupe in _duplicates([p.id for p in spec.map.places]):
        errors.append(f"map.yaml: duplicate place id '{dupe}'")
    for dupe in _duplicates([d.id for d in spec.map.districts]):
        errors.append(f"map.yaml: duplicate district id '{dupe}'")
    for dupe in _duplicates([lm.id for lm in spec.map.landmarks]):
        errors.append(f"map.yaml: duplicate landmark id '{dupe}'")
    for place in spec.map.places:
        x, z = place.xz
        if not (0 <= x < cols and 0 <= z < rows):
            errors.append(f"map.yaml: place '{place.id}' at {list(place.xz)} is off the {cols}x{rows} grid")
        if x in canals_x or z in canals_z:
            errors.append(f"map.yaml: place '{place.id}' at {list(place.xz)} stands in a canal")
        if place.district not in districts:
            errors.append(f"map.yaml: place '{place.id}' names unknown district '{place.district}'")
    for landmark in spec.map.landmarks:
        x, z = landmark.xz
        if not (0 <= x < cols and 0 <= z < rows):
            errors.append(f"map.yaml: landmark '{landmark.id}' at {list(landmark.xz)} is outside the grid")


def _check_economy(spec: ScenarioSpec, errors: list[str]) -> None:
    places = {p.id for p in spec.map.places}
    for dupe in _duplicates([j.id for j in spec.economy.jobs]):
        errors.append(f"economy.yaml: duplicate job id '{dupe}'")
    for dupe in _duplicates([i.id for i in spec.economy.items]):
        errors.append(f"economy.yaml: duplicate item id '{dupe}'")
    for job in spec.economy.jobs:
        if job.place not in places:
            errors.append(f"economy.yaml: job '{job.id}' names unknown place '{job.place}'")
    if not spec.economy.price_index:
        errors.append("economy.yaml: price_index is empty")
    elif min(spec.economy.price_index) > spec.start_year:
        errors.append(f"economy.yaml: price_index starts after {spec.start_year}")


def _check_cast(spec: ScenarioSpec, errors: list[str]) -> None:
    places = {p.id for p in spec.map.places}
    districts = {d.id for d in spec.map.districts}
    for role in spec.cast.roles:
        if role.count < 1:
            errors.append(f"cast.yaml: role '{role.role}' has count {role.count}")
        if role.name_pool not in spec.cast.name_pools:
            errors.append(f"cast.yaml: role '{role.role}' names unknown name_pool '{role.name_pool}'")
        if role.home_district and role.home_district not in districts:
            errors.append(f"cast.yaml: role '{role.role}' names unknown district '{role.home_district}'")
        if not role.routine:
            errors.append(f"cast.yaml: role '{role.role}' has an empty routine")
        for step in role.routine:
            if step not in places:
                errors.append(f"cast.yaml: role '{role.role}' routine names unknown place '{step}'")


def _check_personas(spec: ScenarioSpec, errors: list[str]) -> None:
    places = {p.id for p in spec.map.places}
    districts = {d.id for d in spec.map.districts}
    jobs = {j.id for j in spec.economy.jobs}
    for dupe in _duplicates([p.id for p in spec.personas]):
        errors.append(f"personas.yaml: duplicate persona id '{dupe}'")
    if not spec.personas:
        errors.append("personas.yaml: no personas defined")
    for persona in spec.personas:
        if persona.home not in places:
            errors.append(f"personas.yaml: persona '{persona.id}' lives at unknown place '{persona.home}'")
        if persona.district not in districts:
            errors.append(f"personas.yaml: '{persona.id}' names unknown district '{persona.district}'")
        if persona.job not in jobs:
            errors.append(f"personas.yaml: persona '{persona.id}' holds unknown job '{persona.job}'")
        if persona.born > spec.start_year:
            errors.append(f"personas.yaml: persona '{persona.id}' is born after {spec.start_year}")


def _check_events_and_probes(spec: ScenarioSpec, errors: list[str]) -> None:
    for dupe in _duplicates([e.id for e in spec.events]):
        errors.append(f"events.yaml: duplicate event id '{dupe}'")
    for event in spec.events:
        if not 0 <= event.season <= 3:
            errors.append(f"events.yaml: event '{event.id}' has season {event.season}, expected 0-3")
        if event.year < spec.start_year:
            errors.append(f"events.yaml: event '{event.id}' happens before {spec.start_year}")
    for dupe in _duplicates([p.id for p in spec.probes]):
        errors.append(f"probes.yaml: duplicate probe template id '{dupe}'")
    for template in spec.probes:
        if not template.delays:
            errors.append(f"probes.yaml: template '{template.id}' has no delays")
        if any(d < 1 for d in template.delays):
            errors.append(f"probes.yaml: template '{template.id}' has a delay below one season")


def load_scenario(path: Path) -> ScenarioSpec:
    root_path = path / ROOT_FILE if path.is_dir() else path
    folder = root_path.parent
    root = _read_yaml(root_path)
    if not isinstance(root, dict):
        raise ScenarioError(f"{ROOT_FILE}: expected a mapping at the top level")
    includes = root.pop("includes", None)
    if not isinstance(includes, list) or not includes:
        raise ScenarioError(f"{ROOT_FILE}: 'includes' must list the section files")
    known = MAPPING_SECTIONS | LIST_SECTIONS
    for file_name in includes:
        section = Path(file_name).stem
        if section not in known:
            raise ScenarioError(f"{ROOT_FILE}: include '{file_name}' is not a known section {sorted(known)}")
        root[section] = _validate_section(section, file_name, _read_yaml(folder / file_name))
    missing = sorted(set(known) - set(root))
    if missing:
        raise ScenarioError(f"{ROOT_FILE}: includes is missing sections {missing}")
    try:
        spec = ScenarioSpec.model_validate(root)
    except ValidationError as exc:
        raise ScenarioError(_format_validation_error(ROOT_FILE, exc)) from exc
    errors: list[str] = []
    _check_map(spec, errors)
    _check_economy(spec, errors)
    _check_cast(spec, errors)
    _check_personas(spec, errors)
    _check_events_and_probes(spec, errors)
    if errors:
        raise ScenarioError(f"{folder.name}: {len(errors)} reference error(s)\n  " + "\n  ".join(errors))
    return spec


def validate_report(spec: ScenarioSpec) -> dict[str, int]:
    return {
        "districts": len(spec.map.districts),
        "places": len(spec.map.places),
        "landmarks": len(spec.map.landmarks),
        "jobs": len(spec.economy.jobs),
        "items": len(spec.economy.items),
        "events": len(spec.events),
        "roles": len(spec.cast.roles),
        "npcs": sum(role.count for role in spec.cast.roles),
        "personas": len(spec.personas),
        "probes": len(spec.probes),
    }
