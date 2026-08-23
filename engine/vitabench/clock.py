from __future__ import annotations

from vitabench.schema import SEASONS, WEEKS_PER_SEASON, season_label

SEASONS_PER_YEAR = len(SEASONS)


def year_of(start_year: int, t: int) -> int:
    return start_year + t // SEASONS_PER_YEAR


def season_of(t: int) -> int:
    return t % SEASONS_PER_YEAR


def season_name(t: int) -> str:
    return SEASONS[season_of(t)]


def label(start_year: int, t: int) -> str:
    return season_label(start_year, t)


def t_of(start_year: int, year: int, season: int) -> int:
    return (year - start_year) * SEASONS_PER_YEAR + season


def age_at(born: int, start_year: int, t: int) -> int:
    return year_of(start_year, t) - born


def life_seasons(max_years: int) -> int:
    return max_years * SEASONS_PER_YEAR


def absolute_week(t: int, week: int) -> int:
    return t * WEEKS_PER_SEASON + week


def is_year_end(t: int) -> bool:
    return season_of(t) == SEASONS_PER_YEAR - 1


def interpolate_index(index: dict[int, float], year: int) -> float:
    if not index:
        return 1.0
    years = sorted(index)
    if year <= years[0]:
        return index[years[0]]
    if year >= years[-1]:
        return index[years[-1]]
    for lo, hi in zip(years, years[1:], strict=False):
        if lo <= year <= hi:
            span = hi - lo
            if span == 0:
                return index[lo]
            f = (year - lo) / span
            return index[lo] + (index[hi] - index[lo]) * f
    return 1.0
