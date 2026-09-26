"""Reads Opportunities from the database and shapes them for the Creator Portal (ADR-0001)."""

from collections import defaultdict
from datetime import datetime, timedelta

from mysql.connector.abstracts import MySQLConnectionAbstract

from app.availability import (
    OpportunityAvailability,
    OpportunityState,
    PublishingStatus,
    Session,
    SessionAvailability,
    SessionState,
    evaluate_availability,
)

_SESSIONS_WITH_ACCEPTED_COUNT = """
    SELECT s.SessionID, s.OpportunityID, s.SessionDate, s.StartTime, s.EndTime,
           s.CreatorSlots, s.IsCancelled, s.RecurrenceID,
           (SELECT COUNT(*) FROM Application a
             WHERE a.CurrentSessionID = s.SessionID AND a.Status = 'Accepted') AS AcceptedCount
      FROM Session s
      JOIN Opportunity o ON o.OpportunityID = s.OpportunityID
"""

# Sessions a creator sees on the detail page: upcoming and not cancelled.
_LISTED_SESSION_STATES = (SessionState.AVAILABLE, SessionState.FILLED)

_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def list_discover(conn: MySQLConnectionAbstract, *, now: datetime) -> list[dict]:
    """Card summaries of `open` Opportunities, soonest next Available Session first."""
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Opportunity WHERE PublishingStatus = 'Live'")
    opportunities = cursor.fetchall()
    cursor.execute(_SESSIONS_WITH_ACCEPTED_COUNT + " WHERE o.PublishingStatus = 'Live'")
    sessions_by_opportunity = defaultdict(list)
    for row in cursor.fetchall():
        sessions_by_opportunity[row["OpportunityID"]].append(row)
    cursor.execute("""
        SELECT r.* FROM RecurringSchedule r
          JOIN Opportunity o ON o.OpportunityID = r.OpportunityID
         WHERE o.PublishingStatus = 'Live'""")
    schedules = {row["RecurrenceID"]: row for row in cursor.fetchall()}

    open_cards = []
    for opp in opportunities:
        rows = {row["SessionID"]: row for row in sessions_by_opportunity[opp["OpportunityID"]]}
        availability = evaluate_availability(
            opp["PublishingStatus"], (_session(row) for row in rows.values()), now=now
        )
        if availability.state != OpportunityState.OPEN:
            continue
        card = _card(opp, rows, schedules, availability)
        starts_at = availability.next_available_session.session.starts_at
        open_cards.append(((starts_at, opp["OpportunityID"]), card))

    return [card for _, card in sorted(open_cards, key=lambda pair: pair[0])]


def get_detail(conn: MySQLConnectionAbstract, opportunity_id: int, *, now: datetime) -> dict | None:
    """Full detail of a Live or Closed Opportunity; None when it is a Draft or doesn't exist.

    Lists upcoming, non-cancelled Sessions soonest first, except for a Closed
    Opportunity, which offers none.
    """
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM Opportunity WHERE OpportunityID = %s AND PublishingStatus IN ('Live', 'Closed')",
        (opportunity_id,),
    )
    opp = cursor.fetchone()
    if opp is None:
        return None
    cursor.execute(_SESSIONS_WITH_ACCEPTED_COUNT + " WHERE s.OpportunityID = %s", (opportunity_id,))
    rows = {row["SessionID"]: row for row in cursor.fetchall()}
    cursor.execute(
        "SELECT ItemDescription FROM DeliverableItems WHERE OpportunityID = %s ORDER BY DeliverableItemID",
        (opportunity_id,),
    )
    deliverables = [row["ItemDescription"] for row in cursor.fetchall()]
    cursor.execute(
        "SELECT Label, Value FROM AdditionalInformation WHERE OpportunityID = %s ORDER BY InfoID",
        (opportunity_id,),
    )
    additional_info = [{"label": row["Label"], "value": row["Value"]} for row in cursor.fetchall()]
    cursor.execute("SELECT * FROM RecurringSchedule WHERE OpportunityID = %s", (opportunity_id,))
    schedules = {row["RecurrenceID"]: row for row in cursor.fetchall()}

    availability = evaluate_availability(
        opp["PublishingStatus"], (_session(row) for row in rows.values()), now=now
    )
    listed = _soonest_first(
        s for s in availability.sessions if s.state in _LISTED_SESSION_STATES
    ) if opp["PublishingStatus"] == PublishingStatus.LIVE else []
    one_off, listed_by_schedule = _split_by_schedule(listed, rows, schedules)
    return {
        **_card(opp, rows, schedules, availability),
        "aboutExperience": opp["AboutExperience"],
        "deliverableNote": opp["DeliverableNote"],
        "deliverables": deliverables,
        "additionalInfo": additional_info,
        "venueName": opp["VenueName"],
        "fullAddress": opp["FullAddress"],
        "availability": availability.state.value,
        # Soonest first: `listed` is sorted, and dicts keep insertion order.
        "weeklyClasses": [
            {
                **_weekly_class(schedules[recurrence_id]),
                "id": str(recurrence_id),
                "sessions": [_listed_session(s, rows) for s in sessions],
            }
            for recurrence_id, sessions in listed_by_schedule.items()
        ],
        "sessions": [_listed_session(s, rows) for s in one_off],
    }


def listed_sessions(detail: dict) -> list[dict]:
    """Every Session a detail lists: its one-off Sessions and its weekly classes' Sessions."""
    return [*detail["sessions"], *(s for weekly in detail["weeklyClasses"] for s in weekly["sessions"])]


def _soonest_first(sessions) -> list[SessionAvailability]:
    return sorted(sessions, key=lambda s: (s.session.starts_at, s.session.id))


def _split_by_schedule(
    sessions: list[SessionAvailability], rows: dict, schedules: dict
) -> tuple[list[SessionAvailability], dict[int, list[SessionAvailability]]]:
    """The one-off Sessions, and the rest grouped by Recurring Schedule; both keep the given order."""
    by_schedule = defaultdict(list)
    for s in sessions:
        by_schedule[_recurrence_id(rows[s.session.id], schedules)].append(s)
    return by_schedule.pop(None, []), by_schedule


def _listed_session(s: SessionAvailability, rows: dict) -> dict:
    return {
        "id": str(s.session.id),
        **_session_times(rows[s.session.id]),
        "slotsLeft": s.slots_left,
        "status": s.state.value,
    }


def _recurrence_id(row: dict, schedules: dict) -> int | None:
    """The Session's Recurring Schedule, or None for a one-off Session. `Session.RecurrenceID`
    has no foreign key, so one pointing at a missing schedule counts as one-off.
    """
    return row["RecurrenceID"] if row["RecurrenceID"] in schedules else None


def _weekly_class(schedule: dict) -> dict:
    """A weekly Recurring Schedule falls on its Start Date's weekday."""
    return {
        "day": _WEEKDAYS[schedule["StartDate"].weekday()],
        "start": _hhmm(schedule["StartTime"]),
        "end": _hhmm(schedule["EndTime"]),
    }


def _card(opp: dict, rows: dict, schedules: dict, availability: OpportunityAvailability) -> dict:
    """The Discover card fields; the next-Session fields are empty unless `open`.

    Its weekly classes are the Recurring Schedules with an Available Session,
    soonest first.
    """
    is_open = availability.state == OpportunityState.OPEN
    # Per-Session states ignore Publishing Status, so a Closed Opportunity's
    # Sessions can still evaluate as available.
    available = _soonest_first(
        s for s in availability.sessions if s.state == SessionState.AVAILABLE
    ) if is_open else []
    _, available_by_schedule = _split_by_schedule(available, rows, schedules)
    next_session = availability.next_available_session
    return {
        **_card_fields(opp),
        "nextSession": _session_times(rows[next_session.session.id]) if next_session else None,
        "moreSessionsCount": availability.more_sessions_count,
        "slotsLeft": sum(s.slots_left for s in available),
        "limitedSpots": availability.limited_spots,
        "availableDates": sorted({s.session.starts_at.date().isoformat() for s in available}),
        "weeklyClasses": [_weekly_class(schedules[recurrence_id]) for recurrence_id in available_by_schedule],
    }


def _experience_levels(stored: str) -> list[str]:
    """The multi-select is stored as a comma-separated list."""
    return [level.strip() for level in stored.split(",") if level.strip()]


def _card_fields(opp: dict) -> dict:
    paid = opp["CompensationType"] == "Paid"
    return {
        "id": str(opp["OpportunityID"]),
        "title": opp["Title"],
        "partner": opp["PartnerBrandName"],
        "category": opp["Category"],
        "subcategory": opp["Subcategory"],
        "compensationType": opp["CompensationType"],
        "whatCreatorReceives": None if paid else opp["BarterDescription"],
        "payment": {
            "currency": opp["PaidCurrency"],
            "amount": None if opp["PaidAmount"] is None else float(opp["PaidAmount"]),
            "basis": opp["PaidPaymentBasis"],
            "note": opp["PaidCompensationNote"],
        } if paid else None,
        "area": opp["AreaNeighbourhood"],
        "heroImage": opp["HeroImageURL"],
        "experienceLevels": _experience_levels(opp["ExperienceSkillLevel"]),
        "deliverableType": opp["DeliverableType"],
        "collaborationType": opp["CollaborationType"],
    }


def _session(row: dict) -> Session:
    return Session(
        id=row["SessionID"],
        starts_at=datetime.combine(row["SessionDate"], datetime.min.time()) + row["StartTime"],
        creator_slots=row["CreatorSlots"],
        accepted_count=row["AcceptedCount"],
        is_cancelled=bool(row["IsCancelled"]),
    )


def _session_times(row: dict) -> dict:
    return {
        "date": row["SessionDate"].isoformat(),
        "start": _hhmm(row["StartTime"]),
        "end": _hhmm(row["EndTime"]),
    }


def _hhmm(time_of_day: timedelta) -> str:
    """mysql-connector returns TIME columns as timedeltas since midnight."""
    minutes = int(time_of_day.total_seconds()) // 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
