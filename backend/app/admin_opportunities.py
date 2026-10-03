"""The Admin's Create / Edit Opportunity form: loading an Opportunity for editing,
and saving the whole form with its Publishing Status (FS-ADM-OPP-002..-010, -017, -018).

A Draft may be incomplete, so every save checks only what the database needs:
known choices, text lengths, whole-number Creator Slots, and Sessions and
Recurring Schedules complete enough to store (to_ask.md D9). A save as Live
also runs the Live checks (FS-ADM-OPP-005, to_ask.md B2, B10). The Publishing
Status moves only Draft → Live → Closed, and Closed → Live again (FS §2.1,
FS-ADM-OPP-010, -011, to_ask.md A4, A8); a new Opportunity is a Draft or Live.
Closing keeps its Sessions and Applications. A check-only save runs every
check and stores nothing, so the form can ask "Are you sure?" only once the
save would pass (FS-ADM-OPP-006, -008). The form's one-off Session
rows and its Recurring Schedule are saved through the schedule module
(app.schedule), which generates the Recurring Schedule's Sessions. The rows are
saved whatever the schedule type, as an Opportunity may have both (to_ask.md B6);
Specific Dates removes the Recurring Schedule. The form also lists each future
Session with how full it is, and saves cancelling or reopening one and a weekly
class Session's own Creator Slots (FS-ADM-SES-007, -013, -023).

The Opportunities list's row menu reopens a Closed Opportunity (through the
same save, so the same Live checks), closes, duplicates and deletes a Draft
that has never been Live or had an Application (FS §4.4, FS-ADM-OPP-013).

The version token is the Opportunity's `UpdatedAt`. Every save moves it on by
at least a second, so two saves never share a token, even within one second.
"""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import partial

from mysql.connector.abstracts import MySQLConnectionAbstract

from app.applications import ID_RE, Conflict, Invalid
from app.opportunities import (
    SHORT_WEEKDAYS, experience_levels, payment_amount, schedule_weekdays, session_from_row, session_times,
)
from app.schedule import ENTER_SLOTS, SESSION_GONE, plan_schedule

CATEGORIES = ("Sport", "Lifestyle")
COMPENSATION_TYPES = ("Barter", "Paid")
CURRENCIES = ("SGD", "USD")
PAYMENT_BASES = ("Per completed collaboration", "Per post", "Flat fee")
COLLABORATION_TYPES = ("One-off", "One-off or Ongoing", "Ongoing")
DELIVERABLE_TYPES = ("Fixed", "Flexible")
EXPERIENCE_LEVELS = ("Beginner", "Intermediate", "Advanced", "All Levels", "Not Applicable")
LEVELS_ON_THEIR_OWN = ("All Levels", "Not Applicable")
SCHEDULE_TYPES = ("specific", "recurring")
PUBLISHING_STATUSES = ("Draft", "Live", "Closed")
WEEKDAYS = SHORT_WEEKDAYS

MAX_ROWS = 10  # Deliverable Items and Additional Information rows
MAX_SESSIONS = 100  # one-off Sessions in one save (our choice: neither source limits them)
MAX_WEEKLY_SESSIONS = 1000  # weekly class Sessions listed; a year of daily ones fits (to_ask.md D11)
MAX_SLOTS = 10000
MAX_AMOUNT = Decimal("99999999.99")  # PaidAmount is DECIMAL(10,2)
LONG_TEXT = 5000  # descriptions (TEXT columns)

# Each text field's column, its label for error messages and its length limit:
# the column's width for short text, LONG_TEXT for descriptions (FS-ADM-FLD-012).
_TEXT_FIELDS = {
    "title": ("Title", "Title", 255),
    "partner": ("PartnerBrandName", "Partner / Brand Name", 255),
    "subcategory": ("Subcategory", "Subcategory", 255),
    "heroImage": ("HeroImageURL", "Image URL", 500),
    "aboutExperience": ("AboutExperience", "About the Experience", LONG_TEXT),
    "whatCreatorReceives": ("BarterDescription", "What the Creator Receives", LONG_TEXT),
    "paymentNotes": ("PaidCompensationNote", "Payment Conditions / Notes", LONG_TEXT),
    "deliverableNote": ("DeliverableNote", "Note above deliverables", LONG_TEXT),
    "venueName": ("VenueName", "Venue Name", 255),
    "fullAddress": ("FullAddress", "Full Address", 500),
    "area": ("AreaNeighbourhood", "Area / Neighbourhood", 255),
}
# NOT NULL columns, stored as "" when blank; the other text columns store NULL.
_REQUIRED_COLUMNS = {"Title", "PartnerBrandName", "AboutExperience", "AreaNeighbourhood"}

# Each choice's column and options.
_CHOICES = {
    "category": ("Category", CATEGORIES),
    "compensationType": ("CompensationType", COMPENSATION_TYPES),
    "currency": ("PaidCurrency", CURRENCIES),
    "collaborationType": ("CollaborationType", COLLABORATION_TYPES),
    "deliverableType": ("DeliverableType", DELIVERABLE_TYPES),
    "publishingStatus": ("PublishingStatus", PUBLISHING_STATUSES),
}

ITEM_LENGTH, LABEL_LENGTH, VALUE_LENGTH = 500, 255, 500

STALE_VERSION = (
    "Someone else saved this opportunity after you opened it. "
    "Reload the page to see their changes, then make yours again."
)
STATUS_CHANGED = "This opportunity is {status} now. Reload the page to see its current status."
CANT_DELETE = "Only a Draft that has never been Live or had an application can be deleted. Close it instead."

# The Publishing Statuses each one can be saved as (None: a new Opportunity),
# and why any other is refused.
_ALLOWED_MOVES = {
    None: ("Draft", "Live"),
    "Draft": ("Draft", "Live"),
    "Live": ("Live", "Closed"),
    "Closed": ("Closed", "Live"),
}
_REFUSED_MOVE = {
    None: "A new opportunity can only be saved as Draft or Live",
    "Draft": "A Draft has to go Live before it can be closed",
    "Live": "A Live opportunity can't go back to Draft",
    "Closed": "A Closed opportunity can only be reopened to Live",
}

_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
# The order the form shows its fields in, so errors list top to bottom.
_FIELD_ORDER = (
    "title", "partner", "category", "subcategory", "heroImage", "aboutExperience",
    "compensationType", "whatCreatorReceives", "currency", "paymentAmount", "paymentBasis", "paymentNotes",
    "collaborationType", "deliverableType", "deliverableNote", "deliverables",
    "experienceLevels", "additionalInfo", "scheduleType", "recurring", "weeklySessions", "sessions",
    "venueName", "fullAddress", "area", "publishingStatus",
)

# The Figma's messages for the Live checks' required fields.
_REQUIRED_TO_PUBLISH = {
    "title": "Opportunity title is required",
    "partner": "Partner / brand name is required",
    "heroImage": "Add a cover image",  # FS §5.1, to_ask.md A6
    "aboutExperience": "About the experience is required",
    "area": "Area / neighbourhood is required",
}
NO_FUTURE_SESSION = "Add at least one future session"
NO_FUTURE_GENERATED_SESSION = "This schedule has no future sessions yet"
ENDS_BEFORE_START = "End time must be after the start time"

_TIME_RE = re.compile(r"([01][0-9]|2[0-3]):[0-5][0-9]")
_SLOTS_RE = re.compile(r"[0-9]+")
_AMOUNT_RE = re.compile(r"[0-9]+(\.[0-9]{1,2})?")


class NotFound(Exception):
    """No Opportunity has that id."""


def get_for_editing(conn: MySQLConnectionAbstract, opportunity_id: str, *, now: datetime) -> dict:
    """Every form field of an Opportunity, its future one-off Sessions, its Recurring
    Schedule's settings and future Sessions (cancelled ones too, so they can be
    reopened) and its version token; raises NotFound."""
    if not ID_RE.fullmatch(opportunity_id):
        raise NotFound(opportunity_id)
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Opportunity WHERE OpportunityID = %s", (opportunity_id,))
    opp = cursor.fetchone()
    if opp is None:
        conn.commit()
        raise NotFound(opportunity_id)
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
    cursor.execute(
        "SELECT * FROM RecurringSchedule WHERE OpportunityID = %s ORDER BY RecurrenceID", (opportunity_id,)
    )
    schedules = cursor.fetchall()
    cursor.execute(
        """SELECT s.*,
                  (SELECT COUNT(*) FROM Application a
                    WHERE a.CurrentSessionID = s.SessionID AND a.Status = 'Accepted') AS AcceptedCount,
                  (SELECT COUNT(*) FROM Application a WHERE a.CurrentSessionID = s.SessionID) AS ApplicationsCount,
                  (SELECT COUNT(*) FROM Application a
                    WHERE a.CurrentSessionID = s.SessionID AND a.Status IN ('New', 'Reviewing')) AS UndecidedCount
             FROM Session s WHERE s.OpportunityID = %s""",
        (opportunity_id,),
    )
    future = sorted(
        (row for row in cursor.fetchall() if session_from_row(row).starts_at > now),
        key=lambda row: (row["SessionDate"], row["StartTime"], row["SessionID"]),
    )
    conn.commit()  # end the reads' implicit transaction

    schedule_ids = {schedule["RecurrenceID"] for schedule in schedules}
    # The form's Recurring Schedule is the Opportunity's first.
    weekly_id = schedules[0]["RecurrenceID"] if schedules else None
    return {
        "id": str(opp["OpportunityID"]),
        "version": _version(opp["UpdatedAt"]),
        **{field: opp[column] or "" for field, (column, _, _) in _TEXT_FIELDS.items()},
        **{field: opp[column] for field, (column, _) in _CHOICES.items()},
        "currency": opp["PaidCurrency"] if opp["PaidCurrency"] in CURRENCIES else "SGD",
        "paymentAmount": payment_amount(opp["PaidAmount"]),
        "paymentBasis": opp["PaidPaymentBasis"],
        "experienceLevels": _form_levels(opp["ExperienceSkillLevel"]),
        "deliverables": deliverables,
        "additionalInfo": additional_info,
        "scheduleType": "recurring" if schedules else "specific",
        "sessions": [_form_session(row) for row in future if row["RecurrenceID"] not in schedule_ids],
        "recurring": _recurring_settings(schedules[0]) if schedules else None,
        "weeklySessions": [_form_session(row) for row in future
                           if weekly_id is not None and row["RecurrenceID"] == weekly_id],
        "publishingStatus": opp["PublishingStatus"],
    }


def create_opportunity(conn: MySQLConnectionAbstract, body: dict, *, now: datetime,
                       check: bool = False) -> str | None:
    """Store the form as a new Opportunity, with its Sessions or Recurring Schedule,
    in the Publishing Status it asks for; returns its id. Raises Invalid for a bad
    field, a status other than Draft or Live or, when it asks for Live, a failed
    Live check. With `check`, only checks: stores nothing and returns None."""
    stamp = now.replace(microsecond=0)
    conn.commit()  # end any earlier read, so the transaction below starts fresh
    conn.start_transaction()
    try:
        cursor = conn.cursor()
        form = _validated(body, now=now, plan_schedule=partial(plan_schedule, cursor, None, now=now),
                          current_status=None)
        if check:
            conn.rollback()
            return None
        columns = {**form["columns"], "CreatedAt": stamp, "UpdatedAt": stamp}
        if columns["PublishingStatus"] == "Live":
            columns["PublishedAt"] = stamp
        cursor.execute(
            f"INSERT INTO Opportunity ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})",
            list(columns.values()),
        )
        opportunity_id = cursor.lastrowid
        _store_rows(cursor, opportunity_id, form)
        form["schedule"].apply(cursor, opportunity_id)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return str(opportunity_id)


def update_opportunity(conn: MySQLConnectionAbstract, opportunity_id: str, body: dict, *, now: datetime,
                       check: bool = False) -> None:
    """Store the form over an existing Opportunity in the Publishing Status it asks
    for. Raises NotFound, Conflict when `body["version"]` isn't the current
    version (someone else saved since it was loaded), or Invalid for a bad field,
    a move the publishing rules don't allow or, when it asks for Live, a failed
    Live check. With `check`, only checks: stores nothing.

    Edits to a Live Opportunity reach the Creator Portal at once; Historical
    Snapshots never change. The form's Session rows replace its future one-off
    Sessions, and its Recurring Schedule regenerates its future Sessions without
    Applications (app.schedule); its Applications are kept.
    """
    if not ID_RE.fullmatch(opportunity_id):
        raise NotFound(opportunity_id)
    conn.commit()  # end any earlier read, so the transaction below starts fresh
    # READ COMMITTED: once the schedule module has locked the Sessions, its
    # Accepted Counts see every accept committed before, however long that took.
    conn.start_transaction(isolation_level="READ COMMITTED")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT PublishingStatus, UpdatedAt, PublishedAt FROM Opportunity WHERE OpportunityID = %s FOR UPDATE",
            (opportunity_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise NotFound(opportunity_id)
        if body.get("version") != _version(row["UpdatedAt"]):
            raise Conflict(STALE_VERSION)
        form = _validated(body, now=now,
                          plan_schedule=partial(plan_schedule, cursor, int(opportunity_id), now=now),
                          current_status=row["PublishingStatus"])
        if check:
            conn.rollback()
            return
        stamp = _next_stamp(row["UpdatedAt"], now)
        columns = {**form["columns"], "UpdatedAt": stamp}
        if columns["PublishingStatus"] == "Live" and row["PublishedAt"] is None:
            columns["PublishedAt"] = stamp
        cursor.execute(
            f"UPDATE Opportunity SET {', '.join(f'{column} = %s' for column in columns)} WHERE OpportunityID = %s",
            [*columns.values(), opportunity_id],
        )
        cursor.execute("DELETE FROM DeliverableItems WHERE OpportunityID = %s", (opportunity_id,))
        cursor.execute("DELETE FROM AdditionalInformation WHERE OpportunityID = %s", (opportunity_id,))
        _store_rows(cursor, opportunity_id, form)
        form["schedule"].apply(cursor, opportunity_id)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def publish_opportunity(conn: MySQLConnectionAbstract, opportunity_id: str, *, now: datetime,
                        check: bool = False) -> None:
    """The row menu's Reopen Opportunity: save a Closed (or Draft) Opportunity as
    it is stored, as Live, so it runs the same Live checks as the form
    (FS-ADM-OPP-011). Raises NotFound, Conflict when it is Live already, or
    Invalid with the Live checks' errors keyed as the edit page shows them. With
    `check`, only checks: stores nothing."""
    loaded = get_for_editing(conn, opportunity_id, now=now)
    if loaded["publishingStatus"] == "Live":
        raise Conflict(STATUS_CHANGED.format(status="Live"))
    form = {key: value for key, value in loaded.items() if key != "id"}
    update_opportunity(conn, opportunity_id, {**form, "publishingStatus": "Live"}, now=now, check=check)


def close_opportunity(conn: MySQLConnectionAbstract, opportunity_id: str, *, now: datetime) -> None:
    """Close a Live Opportunity: it stops taking Applications at once and keeps
    every Session, Application and Application Status (FS-ADM-OPP-012)."""
    _change_status(conn, opportunity_id, "Live", "Closed", now=now)


def delete_draft(conn: MySQLConnectionAbstract, opportunity_id: str) -> None:
    """Delete a Draft that has never been Live and has no Applications, with its
    Sessions, Recurring Schedule, Deliverable Items and Additional Information
    (FS-ADM-OPP-013). Raises NotFound, or Conflict for any other Opportunity."""
    if not ID_RE.fullmatch(opportunity_id):
        raise NotFound(opportunity_id)
    conn.commit()  # end any earlier read, so the transaction below starts fresh
    conn.start_transaction()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT PublishingStatus, PublishedAt FROM Opportunity WHERE OpportunityID = %s FOR UPDATE",
            (opportunity_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise NotFound(opportunity_id)
        # Lock its Sessions, so an Application being submitted for one finishes first.
        cursor.execute("SELECT SessionID FROM Session WHERE OpportunityID = %s FOR UPDATE", (opportunity_id,))
        cursor.fetchall()
        cursor.execute("SELECT COUNT(*) AS applications FROM Application WHERE OpportunityID = %s", (opportunity_id,))
        applications = cursor.fetchone()["applications"]
        if row["PublishingStatus"] != "Draft" or row["PublishedAt"] is not None or applications:
            raise Conflict(CANT_DELETE)
        # Its Sessions, Recurring Schedule and rows go with it (ON DELETE CASCADE).
        cursor.execute("DELETE FROM Opportunity WHERE OpportunityID = %s", (opportunity_id,))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def duplicate_opportunity(conn: MySQLConnectionAbstract, opportunity_id: str, *, now: datetime) -> str:
    """Copy an Opportunity into a new Draft with the same title and fields, its Deliverable Items,
    Additional Information and Recurring Schedule, which generates its Sessions
    as a save does. It copies no one-off Sessions, Applications or timestamps
    (FS-ADM-OPP-014). Returns the copy's id; raises NotFound."""
    if not ID_RE.fullmatch(opportunity_id):
        raise NotFound(opportunity_id)
    stamp = now.replace(microsecond=0)
    conn.commit()  # end any earlier read, so the transaction below starts fresh
    conn.start_transaction()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Opportunity WHERE OpportunityID = %s", (opportunity_id,))
        opp = cursor.fetchone()
        if opp is None:
            raise NotFound(opportunity_id)
        columns = {
            **{column: value for column, value in opp.items() if column not in ("OpportunityID", "PublishedAt")},
            "PublishingStatus": "Draft", "CreatedAt": stamp, "UpdatedAt": stamp,
        }
        cursor.execute(
            f"INSERT INTO Opportunity ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})",
            list(columns.values()),
        )
        copy_id = cursor.lastrowid
        cursor.execute(
            """INSERT INTO DeliverableItems (OpportunityID, ItemDescription)
               SELECT %s, ItemDescription FROM DeliverableItems WHERE OpportunityID = %s ORDER BY DeliverableItemID""",
            (copy_id, opportunity_id),
        )
        cursor.execute(
            """INSERT INTO AdditionalInformation (OpportunityID, Label, Value)
               SELECT %s, Label, Value FROM AdditionalInformation WHERE OpportunityID = %s ORDER BY InfoID""",
            (copy_id, opportunity_id),
        )
        # The form's Recurring Schedule: the Opportunity's first.
        cursor.execute(
            "SELECT * FROM RecurringSchedule WHERE OpportunityID = %s ORDER BY RecurrenceID LIMIT 1", (opportunity_id,)
        )
        schedule = cursor.fetchone()
        recurring = None if schedule is None else {
            **_recurring_settings(schedule), "startDate": schedule["StartDate"], "endDate": schedule["EndDate"],
        }
        plan_schedule(cursor, None, [], recurring, {}, now=now).apply(cursor, copy_id)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return str(copy_id)


def _change_status(conn: MySQLConnectionAbstract, opportunity_id: str, current: str, new: str, *,
                   now: datetime) -> None:
    """Move an Opportunity from Publishing Status `current` to `new`, as a save
    does: its version moves on. Raises NotFound, or Conflict when it isn't
    `current` (e.g. another Admin changed it since the list was loaded)."""
    if not ID_RE.fullmatch(opportunity_id):
        raise NotFound(opportunity_id)
    conn.commit()  # end any earlier read, so the transaction below starts fresh
    conn.start_transaction()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT PublishingStatus, UpdatedAt FROM Opportunity WHERE OpportunityID = %s FOR UPDATE",
            (opportunity_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise NotFound(opportunity_id)
        if row["PublishingStatus"] != current:
            raise Conflict(STATUS_CHANGED.format(status=row["PublishingStatus"]))
        # Wait for any Application being submitted for its Sessions to finish, as
        # submitting locks the Session; one submitted after this commits sees the change.
        cursor.execute("SELECT SessionID FROM Session WHERE OpportunityID = %s FOR UPDATE", (opportunity_id,))
        cursor.fetchall()
        cursor.execute(
            "UPDATE Opportunity SET PublishingStatus = %s, UpdatedAt = %s WHERE OpportunityID = %s",
            (new, _next_stamp(row["UpdatedAt"], now), opportunity_id),
        )
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def _next_stamp(updated_at: datetime, now: datetime) -> datetime:
    """A save's new `UpdatedAt`: now, but at least a second after the last, so it's a new version."""
    return max(now.replace(microsecond=0), updated_at + timedelta(seconds=1))


def _version(updated_at: datetime) -> str:
    return updated_at.isoformat()


def _form_levels(stored: str) -> list[str]:
    """The stored Experience / Skill Levels the form knows, or its default, All Levels, when none."""
    return [level for level in experience_levels(stored) if level in EXPERIENCE_LEVELS] or ["All Levels"]


def _form_session(row: dict) -> dict:
    """A future Session as the edit page lists it, with how full it is (FS-ADM-SES-023,
    LST-006): its Accepted Count, its Applications and those still New or Reviewing."""
    return {
        "id": str(row["SessionID"]),
        **session_times(row),
        "slots": row["CreatorSlots"],
        "cancelled": bool(row["IsCancelled"]),
        "acceptedCount": row["AcceptedCount"],
        "applicationsCount": row["ApplicationsCount"],
        "undecidedCount": row["UndecidedCount"],
    }


def _recurring_settings(schedule: dict) -> dict:
    days = [WEEKDAYS[weekday] for weekday in schedule_weekdays(schedule)]
    times = session_times({**schedule, "SessionDate": schedule["StartDate"]})
    return {
        "days": days,
        "start": times["start"],
        "end": times["end"],
        "startDate": schedule["StartDate"].isoformat(),
        "endDate": schedule["EndDate"].isoformat() if schedule["EndDate"] else None,
        "slots": schedule["DefaultCreatorSlots"],
    }


def _store_rows(cursor, opportunity_id, form: dict) -> None:
    for item in form["deliverables"]:
        cursor.execute(
            "INSERT INTO DeliverableItems (OpportunityID, ItemDescription) VALUES (%s, %s)",
            (opportunity_id, item),
        )
    for info in form["additionalInfo"]:
        cursor.execute(
            "INSERT INTO AdditionalInformation (OpportunityID, Label, Value) VALUES (%s, %s, %s)",
            (opportunity_id, info["label"], info["value"]),
        )


def _validated(body: dict, *, now: datetime, plan_schedule, current_status: str | None) -> dict:
    """The form as it will be stored, or Invalid with an error per field, listed
    in the form's order. A save as Live also runs the Live checks.
    `current_status` is the stored Publishing Status (None: a new Opportunity),
    which limits the status it can be saved as.

    `plan_schedule(rows, recurring, errors, weekly_sessions=, live=)` plans
    saving the Session rows, the Recurring Schedule (None: none) and its weekly
    class Sessions over the stored Sessions (app.schedule), adding its rules'
    errors; the form's "schedule" is that plan.

    Errors for list rows are keyed by position, e.g. "sessions.0.date" or
    "additionalInfo.1.label".
    """
    errors = {}

    def text(value, key, label, limit):
        if value is None:
            return ""
        if not isinstance(value, str):
            errors[key] = f"{label} must be text"
            return ""
        value = value.strip()
        if len(value) > limit:
            errors[key] = f"{label} must be {limit} characters or fewer"
        return value

    def rows(key, label, limit=MAX_ROWS):
        value = body.get(key)
        if value is None:
            return []
        if not isinstance(value, list):
            errors[key] = f"Send the {label} as a list"
            return []
        if len(value) > limit:
            errors[key] = f"Add up to {limit} {label}"
        return value

    columns = {}
    for field, (column, label, limit) in _TEXT_FIELDS.items():
        value = text(body.get(field), field, label, limit)
        columns[column] = value if value or column in _REQUIRED_COLUMNS else None
    for field, (column, options) in _CHOICES.items():
        value = body.get(field)
        if value not in options:
            errors[field] = f"Choose {', '.join(options[:-1])} or {options[-1]}"
        columns[column] = value
    # The form keeps the Payment while Barter is chosen, but hides it: then a value
    # that isn't valid is dropped rather than refused.
    payment_errors = errors if columns["CompensationType"] == "Paid" else {}
    columns["PaidAmount"] = _amount(body.get("paymentAmount"), payment_errors)
    columns["PaidPaymentBasis"] = _payment_basis(body.get("paymentBasis"), payment_errors)
    columns["ExperienceSkillLevel"] = _levels(body.get("experienceLevels"), errors)
    publishing_status = columns["PublishingStatus"]
    if "publishingStatus" not in errors and publishing_status not in _ALLOWED_MOVES[current_status]:
        errors["publishingStatus"] = _REFUSED_MOVE[current_status]

    deliverables = []
    for index, item in enumerate(rows("deliverables", "deliverables")):
        item = text(item, f"deliverables.{index}", "A deliverable", ITEM_LENGTH)
        if item:
            deliverables.append(item)

    additional_info = []
    for index, info in enumerate(rows("additionalInfo", "requirements")):
        if not isinstance(info, dict):
            errors[f"additionalInfo.{index}"] = "Send each requirement as a label and a value"
            continue
        label = text(info.get("label"), f"additionalInfo.{index}.label", "A label", LABEL_LENGTH)
        value = text(info.get("value"), f"additionalInfo.{index}.value", "A value", VALUE_LENGTH)
        if label or value:
            additional_info.append({"label": label, "value": value})

    schedule_type = body.get("scheduleType")
    if schedule_type not in SCHEDULE_TYPES:
        errors["scheduleType"] = "Choose Specific Dates / Sessions or Recurring Schedule"

    recurring = _recurring(body.get("recurring"), errors, today=now.date()) if schedule_type == "recurring" else None
    # A Recurring Schedule that can't be stored generates nothing; the save fails anyway.
    storable = recurring is not None and not any(key.startswith("recurring") for key in errors)

    sessions = []
    for index, session in enumerate(rows("sessions", "sessions", MAX_SESSIONS)):
        session = _session(session, f"sessions.{index}", errors)
        if session is not None:
            sessions.append({**session, "index": index})
    weekly_sessions = []
    for index, entry in enumerate(rows("weeklySessions", "weekly class sessions", MAX_WEEKLY_SESSIONS)):
        entry = _weekly_session(entry, f"weeklySessions.{index}", errors)
        if entry is not None:
            weekly_sessions.append({**entry, "index": index})
    schedule_plan = plan_schedule(sessions, recurring if storable else None, errors,
                                  weekly_sessions=weekly_sessions, live=publishing_status == "Live")

    if publishing_status == "Live":
        _check_live(columns, deliverables, schedule_type, sessions, recurring, errors,
                    future_sessions=schedule_plan.future_sessions)

    if errors:
        order = {field: index for index, field in enumerate(_FIELD_ORDER)}
        raise Invalid(dict(sorted(errors.items(), key=lambda error: order.get(error[0].split(".")[0], len(order)))))
    return {
        "columns": columns,
        "deliverables": deliverables,
        "additionalInfo": additional_info,
        "schedule": schedule_plan,
    }


def _check_live(columns: dict, deliverables: list, schedule_type, sessions: list, recurring: dict | None,
                errors: dict, *, future_sessions: int) -> None:
    """Add the Live checks' errors (FS-ADM-OPP-005, to_ask.md B2) to `errors`.
    `future_sessions` counts the Opportunity's future Sessions once saved."""
    for field, message in _REQUIRED_TO_PUBLISH.items():
        if not columns[_TEXT_FIELDS[field][0]]:
            errors.setdefault(field, message)
    if columns["CompensationType"] == "Barter" and not columns["BarterDescription"]:
        errors.setdefault("whatCreatorReceives", "Specify what the creator receives")
    if columns["CompensationType"] == "Paid":
        if columns["PaidAmount"] is None:
            errors.setdefault("paymentAmount", "Payment amount is required")
        if columns["PaidPaymentBasis"] is None:
            errors.setdefault("paymentBasis", "Choose a payment basis")
    if not deliverables:
        errors.setdefault("deliverables", "Add at least one deliverable")

    for session in sessions:
        if session["start"] and session["end"] and session["end"] <= session["start"]:
            errors.setdefault(f"sessions.{session['index']}.end", ENDS_BEFORE_START)
        # There's no unlimited: every Session needs Creator Slots (FS-ADM-SES-004, to_ask.md A1).
        if session["slots"] is None:
            errors.setdefault(f"sessions.{session['index']}.slots", ENTER_SLOTS)

    if schedule_type == "recurring":
        if recurring is None:
            # All blank: a Recurring Schedule needs its weekdays, times and Start Date.
            recurring = _recurring({"days": [], "start": None, "end": None, "startDate": None}, errors,
                                   required=True)
        if recurring["start"] and recurring["end"] and recurring["end"] <= recurring["start"]:
            errors.setdefault("recurring.end", ENDS_BEFORE_START)
        if recurring["startDate"] and recurring["endDate"] and recurring["endDate"] < recurring["startDate"]:
            errors.setdefault("recurring.endDate", "End date can't be before the start date")
        if recurring["slots"] is None:
            errors.setdefault("recurring.slots", "Enter Creator Slots per session")

    if not future_sessions and schedule_type in SCHEDULE_TYPES:
        if schedule_type == "specific":
            errors.setdefault("sessions", NO_FUTURE_SESSION)
        elif not any(key.startswith("recurring") for key in errors):
            # E.g. its End Date has passed, or its Start Date is beyond the rolling window.
            errors["recurring"] = NO_FUTURE_GENERATED_SESSION


def _session(session, key: str, errors: dict) -> dict | None:
    """A one-off Session row to store, or None when it's blank. A Draft may be
    incomplete, but a Session needs its date and times to be stored (to_ask.md D9).
    A row with an `id` is a stored Session; blanking the row removes that Session.
    `cancelled` keeps a stored Session Cancelled, and leaving it out reopens one."""
    if not isinstance(session, dict):
        errors[key] = "Send each session as a date, start and end time and Creator Slots"
        return None
    values = {field: session.get(field) for field in ("date", "start", "end", "slots")}
    if all(value in (None, "") for value in values.values()):
        return None
    session_id = session.get("id")
    if session_id in (None, ""):
        session_id = None
    elif isinstance(session_id, str) and ID_RE.fullmatch(session_id):
        session_id = int(session_id)
    else:
        errors[f"{key}.date"] = SESSION_GONE
        session_id = None
    return {
        "id": session_id,
        "date": _date(values["date"], f"{key}.date", "a date", errors, required=True),
        "start": _time(values["start"], f"{key}.start", "a start time", errors),
        "end": _time(values["end"], f"{key}.end", "an end time", errors),
        "slots": _slots(values["slots"], f"{key}.slots", errors),
        "cancelled": session.get("cancelled") is True,
    }


def _weekly_session(entry, key: str, errors: dict) -> dict | None:
    """A weekly class Session as the form sends it back: its id, its Creator Slots
    and whether it's Cancelled; None when it can't be read."""
    if not isinstance(entry, dict):
        errors[key] = "Send each weekly class session as its id, Creator Slots and whether it's cancelled"
        return None
    session_id = entry.get("id")
    if not (isinstance(session_id, str) and ID_RE.fullmatch(session_id)):
        errors[key] = SESSION_GONE
        return None
    return {
        "id": int(session_id),
        "slots": _slots(entry.get("slots"), f"{key}.slots", errors),
        "cancelled": entry.get("cancelled") is True,
    }


def _recurring(recurring, errors: dict, *, required: bool = False, today: date | None = None) -> dict | None:
    """The Recurring Schedule's settings to store, or None when they're all blank
    and not `required`. Its End Date can be at most a year after its Start Date,
    or after `today` once the Start Date has passed."""
    if recurring is None and not required:
        return None
    if not isinstance(recurring, dict):
        errors["recurring"] = "Send the recurring schedule's settings"
        return None
    days = recurring.get("days") or []
    others = [recurring.get(field) for field in ("start", "end", "startDate", "endDate", "slots")]
    if not days and all(value in (None, "") for value in others) and not required:
        return None
    if not isinstance(days, list) or not days or any(day not in WEEKDAYS for day in days):
        errors["recurring.days"] = "Choose at least one day of the week"
        days = []
    start_date = _date(recurring.get("startDate"), "recurring.startDate", "a start date", errors, required=True)
    end_date = _date(recurring.get("endDate"), "recurring.endDate", "an end date", errors, required=False)
    if start_date and end_date:
        # Every Session up to the End Date is generated as it's saved (to_ask.md D11).
        if today is not None and start_date < today:
            if end_date > _a_year_after(today):
                errors["recurring.endDate"] = "End date must be within a year from today"
        elif end_date > _a_year_after(start_date):
            errors["recurring.endDate"] = "End date must be within a year of the start date"
    return {
        "days": [day for day in WEEKDAYS if day in days],
        "start": _time(recurring.get("start"), "recurring.start", "a start time", errors),
        "end": _time(recurring.get("end"), "recurring.end", "an end time", errors),
        "startDate": start_date,
        "endDate": end_date,
        "slots": _slots(recurring.get("slots"), "recurring.slots", errors),
    }


def _a_year_after(day: date) -> date:
    """The same date a year later; 28 February for 29 February."""
    try:
        return day.replace(year=day.year + 1)
    except ValueError:
        return day.replace(year=day.year + 1, day=28)


def _date(value, key: str, what: str, errors: dict, *, required: bool) -> date | None:
    if value in (None, "") and not required:
        return None
    try:
        if isinstance(value, str) and _DATE_RE.fullmatch(value):
            return date.fromisoformat(value)
    except ValueError:
        pass
    errors[key] = f"Enter {what}"
    return None


def _time(value, key: str, what: str, errors: dict) -> str | None:
    if isinstance(value, str) and _TIME_RE.fullmatch(value):
        return value
    errors[key] = f"Enter {what}"
    return None


def _slots(value, key: str, errors: dict) -> int | None:
    """Creator Slots: a whole number of at least 1, or None when blank, which only
    a Draft may be (to_ask.md A1, D9)."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, str) and _SLOTS_RE.fullmatch(value.strip()):
        value = int(value.strip())
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_SLOTS:
        errors[key] = f"Enter a whole number from 1 to {MAX_SLOTS}"
        return None
    return value


def _amount(value, errors: dict) -> Decimal | None:
    """A Paid Opportunity's Payment Amount: more than 0, with up to 2 decimals, up
    to MAX_AMOUNT (FS-ADM-FLD-002); None when blank, which only a Draft may be."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    if isinstance(value, str) and _AMOUNT_RE.fullmatch(value.strip()):
        amount = Decimal(value.strip())
        if 0 < amount <= MAX_AMOUNT:
            return amount
    errors["paymentAmount"] = "Enter an amount, e.g. 150"
    return None


def _payment_basis(value, errors: dict) -> str | None:
    """A Paid Opportunity's Payment Basis (FS-ADM-FLD-002); None when none is
    picked, which only a Draft may be."""
    if value in (None, ""):
        return None
    if value not in PAYMENT_BASES:
        errors["paymentBasis"] = f"Choose {', '.join(PAYMENT_BASES[:-1])} or {PAYMENT_BASES[-1]}"
        return None
    return value


def _levels(value, errors: dict) -> str:
    """The Experience / Skill Levels as stored: a comma-separated list in the
    order of EXPERIENCE_LEVELS. One or more of Beginner, Intermediate and
    Advanced, or All Levels or Not Applicable on its own (FS-ADM-FLD-005)."""
    if not isinstance(value, list) or not value:
        errors["experienceLevels"] = "Choose at least one level"
        return ""
    if any(not isinstance(level, str) or level not in EXPERIENCE_LEVELS for level in value):
        errors["experienceLevels"] = f"Choose {', '.join(EXPERIENCE_LEVELS[:-1])} or {EXPERIENCE_LEVELS[-1]}"
        return ""
    if len(set(value)) > 1 and set(value) & set(LEVELS_ON_THEIR_OWN):
        errors["experienceLevels"] = "All Levels and Not Applicable can't be combined with other levels"
        return ""
    return ",".join(level for level in EXPERIENCE_LEVELS if level in value)
