"""Derived Session and Opportunity availability (ADR-0002).

Pure: no database, no clock. Callers pass Accepted Counts and "now" in.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

LIMITED_SPOTS_THRESHOLD = 2


class PublishingStatus(StrEnum):
    DRAFT = "Draft"
    LIVE = "Live"
    CLOSED = "Closed"


class SessionState(StrEnum):
    AVAILABLE = "available"
    FILLED = "filled"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class OpportunityState(StrEnum):
    OPEN = "open"
    FULLY_BOOKED = "fully_booked"
    CLOSED = "closed"
    DRAFT = "draft"


@dataclass(frozen=True)
class Session:
    id: int
    starts_at: datetime
    creator_slots: int
    accepted_count: int
    is_cancelled: bool


@dataclass(frozen=True)
class SessionAvailability:
    session: Session
    state: SessionState
    slots_left: int


@dataclass(frozen=True)
class OpportunityAvailability:
    state: OpportunityState
    sessions: tuple[SessionAvailability, ...]
    limited_spots: bool
    next_available_session: SessionAvailability | None
    more_sessions_count: int


def evaluate_availability(
    publishing_status: str, sessions: Iterable[Session], *, now: datetime
) -> OpportunityAvailability:
    """Evaluate an Opportunity's Sessions at `now` (naive SGT, like `Session.starts_at`).

    Per-Session state ignores Publishing Status; only an `open` Opportunity has a
    next Available Session, further Sessions or Limited Spots.
    Raises ValueError for an unknown Publishing Status.
    """
    status = PublishingStatus(publishing_status)
    evaluated = tuple(_evaluate_session(s, now) for s in sessions)
    state = _opportunity_state(status, evaluated)
    available = sorted(
        (s for s in evaluated if s.state == SessionState.AVAILABLE),
        key=lambda s: (s.session.starts_at, s.session.id),
    ) if state == OpportunityState.OPEN else []
    slots_left = sum(s.slots_left for s in available)
    return OpportunityAvailability(
        state=state,
        sessions=evaluated,
        limited_spots=bool(available) and slots_left <= LIMITED_SPOTS_THRESHOLD,
        next_available_session=available[0] if available else None,
        more_sessions_count=max(len(available) - 1, 0),
    )


def _opportunity_state(
    status: PublishingStatus, sessions: tuple[SessionAvailability, ...]
) -> OpportunityState:
    if status == PublishingStatus.DRAFT:
        return OpportunityState.DRAFT
    if status == PublishingStatus.CLOSED:
        return OpportunityState.CLOSED
    upcoming = [s for s in sessions if s.state in (SessionState.AVAILABLE, SessionState.FILLED)]
    if not upcoming:
        return OpportunityState.CLOSED
    if any(s.state == SessionState.AVAILABLE for s in upcoming):
        return OpportunityState.OPEN
    return OpportunityState.FULLY_BOOKED


def _evaluate_session(session: Session, now: datetime) -> SessionAvailability:
    slots_left = max(session.creator_slots - session.accepted_count, 0)
    if session.is_cancelled:
        state = SessionState.CANCELLED
    elif session.starts_at <= now:
        state = SessionState.EXPIRED
    elif slots_left == 0:
        state = SessionState.FILLED
    else:
        state = SessionState.AVAILABLE
    return SessionAvailability(session, state, slots_left)
