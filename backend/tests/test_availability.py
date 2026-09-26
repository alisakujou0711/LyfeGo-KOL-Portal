from datetime import datetime, timedelta

import pytest

from app.availability import Session, evaluate_availability

# All times are naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)


def session(session_id=1, *, starts_in=timedelta(days=1), slots=3, accepted=0, cancelled=False):
    return Session(
        id=session_id,
        starts_at=NOW + starts_in,
        creator_slots=slots,
        accepted_count=accepted,
        is_cancelled=cancelled,
    )


def sessions(overrides_per_session):
    return [session(i, **overrides) for i, overrides in enumerate(overrides_per_session)]


def test_live_opportunity_with_a_future_session_with_free_slots_is_open():
    result = evaluate_availability("Live", [session(slots=3, accepted=1)], now=NOW)

    assert result.state == "open"
    [only] = result.sessions
    assert only.state == "available"
    assert only.slots_left == 2


@pytest.mark.parametrize("accepted", [3, 4], ids=["exactly full", "over-accepted"])
def test_session_is_filled_once_accepted_count_reaches_creator_slots(accepted):
    result = evaluate_availability("Live", [session(slots=3, accepted=accepted)], now=NOW)

    [only] = result.sessions
    assert only.state == "filled"
    assert only.slots_left == 0


@pytest.mark.parametrize(
    "starts_in, expected",
    [
        (timedelta(hours=-1), "expired"),
        (timedelta(0), "expired"),
        (timedelta(minutes=1), "available"),
    ],
    ids=["already started", "starts exactly now", "starts in a minute"],
)
def test_session_expires_exactly_at_its_start_time(starts_in, expected):
    result = evaluate_availability("Live", [session(starts_in=starts_in)], now=NOW)

    [only] = result.sessions
    assert only.state == expected


@pytest.mark.parametrize(
    "overrides, expected",
    [
        (dict(cancelled=True), "cancelled"),
        (dict(cancelled=True, accepted=3), "cancelled"),
        (dict(cancelled=True, starts_in=timedelta(hours=-1)), "cancelled"),
        (dict(cancelled=True, accepted=3, starts_in=timedelta(hours=-1)), "cancelled"),
        (dict(accepted=3, starts_in=timedelta(hours=-1)), "expired"),
    ],
    ids=[
        "cancelled",
        "cancelled beats filled",
        "cancelled beats expired",
        "cancelled beats expired and filled",
        "expired beats filled",
    ],
)
def test_session_state_precedence_is_cancelled_then_expired_then_filled(overrides, expected):
    result = evaluate_availability("Live", [session(slots=3, **overrides)], now=NOW)

    [only] = result.sessions
    assert only.state == expected


AVAILABLE = dict(slots=3, accepted=0)
FILLED = dict(slots=3, accepted=3)
EXPIRED = dict(slots=3, accepted=0, starts_in=timedelta(days=-1))
CANCELLED = dict(slots=3, accepted=0, cancelled=True)


@pytest.mark.parametrize(
    "publishing_status, session_overrides, expected",
    [
        ("Live", [FILLED, AVAILABLE], "open"),
        ("Live", [FILLED, FILLED, EXPIRED, CANCELLED], "fully_booked"),
        ("Live", [EXPIRED, CANCELLED], "closed"),
        ("Live", [], "closed"),
        ("Closed", [AVAILABLE], "closed"),
        ("Draft", [AVAILABLE], "draft"),
    ],
    ids=[
        "live with an available session",
        "live with every future non-cancelled session filled",
        "live with only expired and cancelled sessions",
        "live with no sessions",
        "closed despite available sessions",
        "draft",
    ],
)
def test_opportunity_state(publishing_status, session_overrides, expected):
    result = evaluate_availability(
        publishing_status,
        sessions(session_overrides),
        now=NOW,
    )

    assert result.state == expected


@pytest.mark.parametrize(
    "publishing_status, session_overrides, expected",
    [
        ("Live", [dict(slots=1)], True),
        ("Live", [dict(slots=3, accepted=2), dict(slots=2, accepted=1), FILLED], True),
        ("Live", [dict(slots=3)], False),
        ("Live", [dict(slots=2, accepted=1), dict(slots=2, accepted=0)], False),
        (
            "Live",
            [
                dict(slots=1),
                dict(slots=5, starts_in=timedelta(days=-1)),
                dict(slots=5, cancelled=True),
            ],
            True,
        ),
        ("Closed", [dict(slots=1)], False),
        ("Draft", [dict(slots=1)], False),
    ],
    ids=[
        "one slot left",
        "two slots left across available sessions",
        "three slots left",
        "three slots left across available sessions",
        "expired and cancelled slots don't count",
        "not when closed",
        "not when draft",
    ],
)
def test_limited_spots_when_open_with_two_or_fewer_slots_left(
    publishing_status, session_overrides, expected
):
    result = evaluate_availability(
        publishing_status,
        sessions(session_overrides),
        now=NOW,
    )

    assert result.limited_spots is expected


def test_next_available_session_is_the_soonest_available_one_and_further_count_excludes_it():
    result = evaluate_availability(
        "Live",
        [
            session(1, starts_in=timedelta(days=3)),
            session(2, starts_in=timedelta(hours=2), accepted=3),  # filled
            session(3, starts_in=timedelta(hours=1), cancelled=True),
            session(4, starts_in=timedelta(days=2)),
            session(5, starts_in=timedelta(hours=-1)),  # expired
            session(6, starts_in=timedelta(days=5)),
        ],
        now=NOW,
    )

    assert result.next_available_session.session.id == 4
    assert result.more_sessions_count == 2


def test_single_available_session_has_no_further_sessions():
    result = evaluate_availability("Live", [session(7)], now=NOW)

    assert result.next_available_session.session.id == 7
    assert result.more_sessions_count == 0


@pytest.mark.parametrize(
    "publishing_status, session_overrides",
    [
        ("Live", [FILLED]),
        ("Live", [EXPIRED, CANCELLED]),
        ("Closed", [AVAILABLE]),
        ("Draft", [AVAILABLE]),
    ],
    ids=["fully booked", "closed by time", "closed", "draft"],
)
def test_no_next_available_session_unless_open(publishing_status, session_overrides):
    result = evaluate_availability(
        publishing_status,
        sessions(session_overrides),
        now=NOW,
    )

    assert result.next_available_session is None
    assert result.more_sessions_count == 0


def test_unknown_publishing_status_is_rejected():
    with pytest.raises(ValueError):
        evaluate_availability("live", [session()], now=NOW)
