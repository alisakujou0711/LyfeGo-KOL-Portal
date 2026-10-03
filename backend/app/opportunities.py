"""Reads Opportunities from the database and shapes them for the Creator Portal and the Admin list (ADR-0001)."""

from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

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
from app.db import contains_pattern

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

# The Discover card fields an Admin list row shares.
_ADMIN_ROW_FIELDS = ("id", "title", "partner", "heroImage", "category", "compensationType",
                     "whatCreatorReceives", "payment", "collaborationType")

_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
# How RecurringSchedule.DayFrequency names them.
SHORT_WEEKDAYS = tuple(day[:3] for day in _WEEKDAYS)


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
            opp["PublishingStatus"], (session_from_row(row) for row in rows.values()), now=now
        )
        if availability.state != OpportunityState.OPEN:
            continue
        card = _card(opp, rows, schedules, availability)
        starts_at = availability.next_available_session.session.starts_at
        open_cards.append(((starts_at, opp["OpportunityID"]), card))

    return [card for _, card in sorted(open_cards, key=lambda pair: pair[0])]


def get_detail(
    conn: MySQLConnectionAbstract, opportunity_id: int, *, now: datetime, include_draft: bool = False
) -> dict | None:
    """Full detail of a Live or Closed Opportunity, or of a Draft when
    `include_draft` (an Admin's preview, to_ask.md D2); None otherwise or when it
    doesn't exist.

    Lists upcoming, non-cancelled Sessions soonest first, except for a Closed
    Opportunity, which offers none. A Draft's availability is `draft`, so nobody
    can register for it.
    """
    statuses = ("Live", "Closed", "Draft") if include_draft else ("Live", "Closed")
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        f"SELECT * FROM Opportunity WHERE OpportunityID = %s AND PublishingStatus IN ({', '.join(['%s'] * len(statuses))})",
        (opportunity_id, *statuses),
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
        opp["PublishingStatus"], (session_from_row(row) for row in rows.values()), now=now
    )
    listed = _soonest_first(
        s for s in availability.sessions if s.state in _LISTED_SESSION_STATES
    ) if opp["PublishingStatus"] != PublishingStatus.CLOSED else []
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


def list_for_admin(
    conn: MySQLConnectionAbstract, *, now: datetime, search: str = "", status: str = "",
    category: str = "", compensation: str = "", collaboration_type: str = "",
) -> dict:
    """The Admin Opportunities list: every Opportunity matching the search (title or
    Partner, ignoring case) and every given filter, oldest first, plus the summary
    counts, which always cover every Opportunity and Application.
    """
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT COUNT(*) AS total,
               COALESCE(SUM(PublishingStatus = 'Live'), 0) AS live,
               COALESCE(SUM(PublishingStatus = 'Draft'), 0) AS draft,
               COALESCE(SUM(PublishingStatus = 'Closed'), 0) AS closed,
               (SELECT COUNT(*) FROM Application) AS applications
          FROM Opportunity""")
    counts = {key: int(value) for key, value in cursor.fetchone().items()}

    conditions, params = [], []
    for column, value in (("PublishingStatus", status), ("Category", category),
                          ("CompensationType", compensation), ("CollaborationType", collaboration_type)):
        if value:
            conditions.append(f"o.{column} = %s")
            params.append(value)
    if search.strip():
        conditions.append(r"(o.Title LIKE %s ESCAPE '\\' OR o.PartnerBrandName LIKE %s ESCAPE '\\')")
        pattern = contains_pattern(search.strip())
        params += [pattern, pattern]
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    cursor.execute(f"""
        SELECT o.*, (SELECT COUNT(*) FROM Application a
                      WHERE a.OpportunityID = o.OpportunityID) AS ApplicationsCount
          FROM Opportunity o{where}
         ORDER BY o.OpportunityID""", params)
    opportunities = cursor.fetchall()

    ids = [opp["OpportunityID"] for opp in opportunities]
    sessions_by_opportunity, schedules = defaultdict(list), {}
    if ids:
        placeholders = ", ".join(["%s"] * len(ids))
        cursor.execute(_SESSIONS_WITH_ACCEPTED_COUNT + f" WHERE s.OpportunityID IN ({placeholders})", ids)
        for row in cursor.fetchall():
            sessions_by_opportunity[row["OpportunityID"]].append(row)
        cursor.execute(f"SELECT * FROM RecurringSchedule WHERE OpportunityID IN ({placeholders})", ids)
        schedules = {row["RecurrenceID"]: row for row in cursor.fetchall()}

    listed = []
    for opp in opportunities:
        session_rows = {row["SessionID"]: row for row in sessions_by_opportunity[opp["OpportunityID"]]}
        # Per-Session states ignore Publishing Status, so Drafts and Closed
        # Opportunities get a schedule too.
        availability = evaluate_availability(
            opp["PublishingStatus"], (session_from_row(row) for row in session_rows.values()), now=now
        )
        upcoming = [s for s in availability.sessions if s.state in _LISTED_SESSION_STATES]
        fields = _card_fields(opp)
        listed.append({
            **{key: fields[key] for key in _ADMIN_ROW_FIELDS},
            "schedule": _schedule_fields(upcoming, session_rows, schedules) if upcoming else None,
            "applicationsCount": opp["ApplicationsCount"],
            "publishingStatus": opp["PublishingStatus"],
            # Derived, not a Publishing Status: a Live row that isn't `open` has no
            # Available Session left (FS-ADM-SES-020, LST-004).
            "availability": availability.state.value,
            # Delete Draft: only a Draft that has never been Live or had an Application (FS-ADM-OPP-013).
            "canDelete": opp["PublishingStatus"] == "Draft" and opp["PublishedAt"] is None
                         and not opp["ApplicationsCount"],
            "lastUpdated": opp["UpdatedAt"].date().isoformat(),
        })
    return {"counts": counts, "opportunities": listed}


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
        **session_times(rows[s.session.id]),
        "slotsLeft": s.slots_left,
        "status": s.state.value,
    }


def _recurrence_id(row: dict, schedules: dict) -> int | None:
    """The Session's Recurring Schedule, or None for a one-off Session. `Session.RecurrenceID`
    has no foreign key, so one pointing at a missing schedule counts as one-off.
    """
    return row["RecurrenceID"] if row["RecurrenceID"] in schedules else None


def _weekly_class(schedule: dict) -> dict:
    """A Recurring Schedule's weekdays in full, Monday first, e.g. ["Tuesday", "Saturday"] (to_ask.md D5)."""
    return {
        "days": [_WEEKDAYS[weekday] for weekday in schedule_weekdays(schedule)],
        "start": _hhmm(schedule["StartTime"]),
        "end": _hhmm(schedule["EndTime"]),
    }


def schedule_weekdays(schedule: dict) -> list[int]:
    """The weekdays (date.weekday(), Monday first) a RecurringSchedule row falls on.

    `DayFrequency` lists them, e.g. "Tue,Sat". Older schedules store "Weekly":
    they fall on their Start Date's weekday.
    """
    stored = {day.strip() for day in schedule["DayFrequency"].split(",")}
    return [weekday for weekday, day in enumerate(SHORT_WEEKDAYS) if day in stored] or [
        schedule["StartDate"].weekday()]


def _card(opp: dict, rows: dict, schedules: dict, availability: OpportunityAvailability) -> dict:
    """The Discover card fields; the next-Session fields are empty unless `open`.

    Its weekly classes are the Recurring Schedules with an Available Session,
    soonest first.
    """
    is_open = availability.state == OpportunityState.OPEN
    # Per-Session states ignore Publishing Status, so a Closed Opportunity's
    # Sessions can still evaluate as available.
    available = [
        s for s in availability.sessions if s.state == SessionState.AVAILABLE
    ] if is_open else []
    return {
        **_card_fields(opp),
        **_schedule_fields(available, rows, schedules),
        "moreSessionsCount": availability.more_sessions_count,
        "slotsLeft": availability.slots_left,
        "limitedSpots": availability.limited_spots,
    }


def _schedule_fields(sessions, rows: dict, schedules: dict) -> dict:
    """What a schedule line is worded from (the Discover card's and the Admin list's):
    the soonest of `sessions`, their distinct dates, and the Recurring Schedules
    they belong to, soonest first.
    """
    ordered = _soonest_first(sessions)
    _, by_schedule = _split_by_schedule(ordered, rows, schedules)
    return {
        "nextSession": session_times(rows[ordered[0].session.id]) if ordered else None,
        "availableDates": sorted({s.session.starts_at.date().isoformat() for s in ordered}),
        "weeklyClasses": [_weekly_class(schedules[recurrence_id]) for recurrence_id in by_schedule],
    }


def experience_levels(stored: str) -> list[str]:
    """The multi-select is stored as a comma-separated list."""
    return [level.strip() for level in stored.split(",") if level.strip()]


def payment_amount(stored: Decimal | None) -> int | float | None:
    """`PaidAmount` as a JSON number, without decimals when it's whole: 150, 150.5."""
    if stored is None:
        return None
    return int(stored) if stored == stored.to_integral_value() else float(stored)


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
            "amount": payment_amount(opp["PaidAmount"]),
            "basis": opp["PaidPaymentBasis"],
            "note": opp["PaidCompensationNote"],
        } if paid else None,
        "area": opp["AreaNeighbourhood"],
        "heroImage": opp["HeroImageURL"],
        "experienceLevels": experience_levels(opp["ExperienceSkillLevel"]),
        "deliverableType": opp["DeliverableType"],
        "collaborationType": opp["CollaborationType"],
    }


def session_from_row(row: dict) -> Session:
    """A Session row, with its `AcceptedCount`, as the availability rules take it."""
    return Session(
        id=row["SessionID"],
        starts_at=datetime.combine(row["SessionDate"], datetime.min.time()) + row["StartTime"],
        creator_slots=row["CreatorSlots"],
        accepted_count=row["AcceptedCount"],
        is_cancelled=bool(row["IsCancelled"]),
    )


def session_times(row: dict) -> dict:
    return {
        "date": row["SessionDate"].isoformat(),
        "start": _hhmm(row["StartTime"]),
        "end": _hhmm(row["EndTime"]),
    }


def _hhmm(time_of_day: timedelta) -> str:
    """mysql-connector returns TIME columns as timedeltas since midnight."""
    minutes = int(time_of_day.total_seconds()) // 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
