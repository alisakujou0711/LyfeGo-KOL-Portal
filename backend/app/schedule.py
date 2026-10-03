"""The schedule module: every change to an Opportunity's Sessions goes through here.

Its interface is two calls: `plan_schedule` plans saving the Admin form's
schedule over the stored Sessions, as of now, and `top_up_rolling_windows`
generates what open-ended Recurring Schedules are missing, as of now.

The form's "SESSION N" rows are the Opportunity's future, non-cancelled one-off
Sessions. Saving them is planned against the stored Sessions first, so every
rule's error can be shown with the form's other errors, then applied:

- a row without an id is a new Session, and a row with one changes that Session
- a stored Session with no row is removed: deleted when it has no Applications,
  otherwise Cancelled, keeping them (FS-ADM-SES-012)
- Creator Slots can't go below the Session's Accepted Count (FS-ADM-SES-014);
  raising or clearing them reopens a Filled Session, as availability is derived
- the same date, start and end twice is refused; overlaps are fine (FS-ADM-SES-022)
- a new or changed Session must start in the future (FS-ADM-SES-010)
- past Sessions are never changed (FS-ADM-SES-011), including one that started
  after the form was loaded

The form's Recurring Schedule generates Sessions on each of its weekdays from its
Start Date up to its End Date, or ROLLING_WINDOW ahead without one, each with its
default Creator Slots (FS-ADM-SES-006..-008). Only future Sessions are generated.
Saving it (FS-ADM-SES-009):

- regenerates its future Sessions without Applications from the settings,
  keeping those already at a date and time the settings give
- leaves its future Sessions with Applications exactly as they are
- never changes its past Sessions
- skips a date and time an unchanged one-off Session already has, but refuses a
  new or changed one-off row at a weekly class's date and time (to_ask.md D10)

Saving without one (Specific Dates) removes the Recurring Schedule: its future
Sessions without Applications are deleted, and the rest become one-off Sessions,
which the form lists as rows, so removing one Cancels it. An Opportunity may
have a Recurring Schedule and one-off Sessions together (to_ask.md B6).

The form also lists the Recurring Schedule's future Sessions (Admin ticket 12):

- each can be given Creator Slots of its own (FS-ADM-SES-007), not below its
  Accepted Count; it is then kept as it is by later saves, as if it had
  Applications (`Session.SlotsOverridden`, to_ask.md D12)
- each can be Cancelled, keeping its Applications; a Cancelled one at a date and
  time the settings still give stays, and the schedule skips that date and time
- a one-off row marked Cancelled stays Cancelled; unmarking it reopens it
- reopening needs the Session not to have started, a Live Opportunity, no other
  Session at its date and time, and a free slot (FS-ADM-SES-013)
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from app.db import insert, placeholders, transaction, update
from app.opportunities import (
    ACCEPTED_COUNT, SHORT_WEEKDAYS, hhmm, lock_opportunity_sessions, schedule_weekdays, session_times,
)

# A Recurring Schedule without an End Date keeps this window of future Sessions (FS-ADM-SES-008).
ROLLING_WINDOW = timedelta(weeks=8)

SESSION_GONE = "This session no longer exists. Reload the page to see the current sessions."
SESSION_STARTED = "This session has already started, so it can't be changed"
SESSION_LISTED_TWICE = "This session is already listed as Session {number}"
NOT_IN_FUTURE = "Choose a date and time in the future"
DUPLICATE_OF_ROW = "Session {number} already has this date and time"
DUPLICATE_OF_WEEKLY_CLASS = "The weekly class already has this date and time"
DUPLICATE_OF_SESSION = "Another session already has this date and time"
REOPEN_NOT_LIVE = "Sessions can only be reopened on a Live opportunity"
REOPEN_FULL = "This session is full. Raise its Creator Slots to reopen it."
REOPEN_NOT_IN_SCHEDULE = "The schedule's new settings don't include this session"
ENTER_SLOTS = "Enter Creator Slots"

_INSERT_SESSION = """INSERT INTO Session (OpportunityID, SessionDate, StartTime, EndTime, CreatorSlots, RecurrenceID)
                     VALUES (%s, %s, %s, %s, %s, %s)"""

# A Session's date, start and end ("HH:MM"): two Sessions with the same are duplicates.
Times = tuple[date, str, str]


@dataclass
class SchedulePlan:
    """What saving the form's schedule does, once `errors` is empty."""

    inserts: list[dict] = field(default_factory=list)
    updates: list[dict] = field(default_factory=list)
    deletes: list[int] = field(default_factory=list)
    cancels: list[int] = field(default_factory=list)
    # The Recurring Schedule's settings as stored (None: it has none), the id of
    # the stored one, the Sessions to generate and the generated Sessions whose
    # Creator Slots become the new default.
    schedule: dict | None = None
    schedule_id: int | None = None
    generate: list[Times] = field(default_factory=list)
    reslot: list[int] = field(default_factory=list)
    # The weekly class Sessions given Creator Slots of their own, as (id, slots), and those reopened.
    overrides: list[tuple[int, int]] = field(default_factory=list)
    reopens: list[int] = field(default_factory=list)
    # Without a Recurring Schedule: its future Sessions with Applications, which become one-off Sessions.
    detach: list[int] = field(default_factory=list)
    # The Opportunity's future, non-cancelled Sessions once applied (for the Live checks).
    future_sessions: int = 0

    def apply(self, cursor, opportunity_id) -> None:
        for session in self.inserts:
            cursor.execute(_INSERT_SESSION, (opportunity_id, session["date"], session["start"], session["end"],
                                             session["slots"], None))
        for session in self.updates:
            cursor.execute(
                """UPDATE Session SET SessionDate = %s, StartTime = %s, EndTime = %s, CreatorSlots = %s,
                                      IsCancelled = FALSE
                    WHERE SessionID = %s""",
                (session["date"], session["start"], session["end"], session["slots"], session["id"]),
            )
        _for_sessions(cursor, "UPDATE Session SET IsCancelled = TRUE", self.cancels)
        _for_sessions(cursor, "UPDATE Session SET IsCancelled = FALSE", self.reopens)
        for session_id, slots in self.overrides:
            cursor.execute("UPDATE Session SET CreatorSlots = %s, SlotsOverridden = TRUE WHERE SessionID = %s",
                           (slots, session_id))
        _for_sessions(cursor, "DELETE FROM Session", self.deletes)

        if self.schedule is None:
            if self.schedule_id is not None:
                # Its past Sessions keep their RecurrenceID, which then counts as one-off.
                _for_sessions(cursor, "UPDATE Session SET RecurrenceID = NULL", self.detach)
                cursor.execute("DELETE FROM RecurringSchedule WHERE RecurrenceID = %s", (self.schedule_id,))
            return
        schedule_id = self.schedule_id
        if schedule_id is None:
            schedule_id = insert(cursor, "RecurringSchedule", {**self.schedule, "OpportunityID": opportunity_id})
        else:
            update(cursor, "RecurringSchedule", self.schedule, where="RecurrenceID", key=schedule_id)
        slots = self.schedule["DefaultCreatorSlots"]
        _for_sessions(cursor, "UPDATE Session SET CreatorSlots = %s", self.reslot, slots)
        if self.generate:
            cursor.executemany(_INSERT_SESSION, [(opportunity_id, *times, slots, schedule_id) for times in self.generate])


def _for_sessions(cursor, statement: str, session_ids: list[int], *params) -> None:
    """Run `statement` (an UPDATE or DELETE on Session, with `params`) on every Session in `session_ids` at once."""
    if session_ids:
        cursor.execute(f"{statement} WHERE SessionID IN ({placeholders(session_ids)})", [*params, *session_ids])


def generated_times(weekdays: list[int], start: str, end: str, start_date: date, end_date: date | None, *,
                    now: datetime) -> list[Times]:
    """The future dates and times a Recurring Schedule has Sessions at as of `now`,
    soonest first: on its `weekdays` (date.weekday()) from `start_date` up to
    `end_date`, or up to ROLLING_WINDOW after `now` without one. Empty when it
    doesn't end after it starts."""
    if end <= start:
        return []
    day = max(start_date, now.date())
    last = end_date or (now + ROLLING_WINDOW).date()
    times = []
    while day <= last:
        starts_at = _starts_at(day, start)
        if day.weekday() in weekdays and now < starts_at and (end_date or starts_at <= now + ROLLING_WINDOW):
            times.append((day, start, end))
        day += timedelta(days=1)
    return times


def plan_schedule(cursor, opportunity_id, rows: list[dict], recurring: dict | None, errors: dict, *,
                  now: datetime, weekly_sessions: list[dict] | None = None, live: bool = False) -> SchedulePlan:
    """Plan saving the form's Session `rows`, its Recurring Schedule and its weekly
    class Sessions over an Opportunity's stored Sessions (none when
    `opportunity_id` is None, for a new Opportunity), adding each rule's error to
    `errors` under its row, e.g. "sessions.1.slots" or "weeklySessions.0".

    Each row is `{"index", "id", "date", "start", "end", "slots", "cancelled"}`, as
    parsed from the form: `index` is its position in the form, and a field that
    failed to parse already has its error. `recurring` is `{"days", "start", "end",
    "startDate", "endDate", "slots"}` with the days named as in SHORT_WEEKDAYS, or
    None to have no Recurring Schedule. Each of `weekly_sessions` is `{"index",
    "id", "slots", "cancelled"}` for a Session of the Recurring Schedule; they're
    ignored without one. `live`: the Opportunity is saved as Live, so Sessions can
    be reopened. Call it inside the save's READ COMMITTED transaction, after
    locking the Opportunity: it locks the Opportunity's Sessions, so no
    Application can be accepted into them, or submitted for them, until the save ends.
    """
    stored = _stored_sessions(cursor, opportunity_id) if opportunity_id is not None else {}
    schedule_id = _schedule_id(cursor, opportunity_id) if opportunity_id is not None else None
    current = {session_id: session for session_id, session in stored.items() if not session["IsCancelled"]}
    editable = {session_id: session for session_id, session in current.items()
                if session["startsAt"] > now and session["RecurrenceID"] is None}
    # The Recurring Schedule's future Sessions, Cancelled ones too.
    weekly = {session_id: session for session_id, session in stored.items()
              if session["startsAt"] > now and session["RecurrenceID"] is not None
              and session["RecurrenceID"] == schedule_id}
    plan = SchedulePlan(schedule_id=schedule_id)
    targets: set[Times] = set()
    if recurring is not None:
        plan.schedule = {
            "StartDate": recurring["startDate"],
            "EndDate": recurring["endDate"],
            "DayFrequency": ",".join(recurring["days"]),
            "StartTime": recurring["start"],
            "EndTime": recurring["end"],
            "DefaultCreatorSlots": recurring["slots"],
        }
        weekdays = [SHORT_WEEKDAYS.index(day) for day in recurring["days"]]
        targets = set(generated_times(weekdays, recurring["start"], recurring["end"], recurring["startDate"],
                                      recurring["endDate"], now=now))

    changes = _weekly_changes(stored, schedule_id, (weekly_sessions or []) if recurring is not None else [], errors,
                              now=now, live=live)
    for session_id, change in changes.items():
        session = stored[session_id]
        if change["slots"] != session["CreatorSlots"]:
            plan.overrides.append((session_id, change["slots"]))
        if change["cancelled"] and not session["IsCancelled"]:
            plan.cancels.append(session_id)
        elif session["IsCancelled"] and not change["cancelled"]:
            plan.reopens.append(session_id)

    listed = {}  # stored Session id: the number of the row listing it
    kept = []  # the rows that store a Session
    for row in rows:
        key = f"sessions.{row['index']}"
        session_id = row["id"]
        if session_id is None and row["cancelled"]:
            continue  # nothing to cancel
        if session_id is not None:
            if session_id in listed:
                errors.setdefault(f"{key}.date", SESSION_LISTED_TWICE.format(number=listed[session_id]))
                continue
            listed[session_id] = row["index"] + 1
            session = stored.get(session_id)
            if session is None or session["RecurrenceID"] is not None:
                errors.setdefault(f"{key}.date", SESSION_GONE)
                continue
            if session["startsAt"] <= now:
                if (_times(row) != _times(session) or row["slots"] != session["CreatorSlots"]
                        or row["cancelled"] != bool(session["IsCancelled"])):
                    errors.setdefault(f"{key}.date", SESSION_STARTED)
                continue  # a past Session stays as it is
            if row["cancelled"]:
                # A Cancelled Session keeps its date, times and slots.
                if not session["IsCancelled"]:
                    plan.cancels.append(session_id)
                continue
            if session["IsCancelled"]:
                if not live:
                    errors.setdefault(f"{key}.date", REOPEN_NOT_LIVE)
                    continue
                row = {**row, "reopen": True}
            if row["slots"] is not None and row["slots"] < session["AcceptedCount"]:
                errors.setdefault(f"{key}.slots", _below_accepted(session["AcceptedCount"]))
            elif row.get("reopen") and row["slots"] is not None and row["slots"] <= session["AcceptedCount"]:
                errors.setdefault(f"{key}.slots", REOPEN_FULL)
        if any(error == key or error.startswith(f"{key}.") for error in errors):
            continue
        if _starts_at(row["date"], row["start"]) <= now:
            errors.setdefault(f"{key}.date", NOT_IN_FUTURE)
            continue
        kept.append(row)
        (plan.updates if session_id is not None else plan.inserts).append(row)

    # Each weekly class Session's state once saved. Those with Applications, or
    # whose Creator Slots were changed on their own, stay as they are, and
    # without the Recurring Schedule they become one-off Sessions.
    cancelled = {session_id for session_id, session in weekly.items()
                 if (changes[session_id]["cancelled"] if session_id in changes else session["IsCancelled"])}
    staying = {session_id: session for session_id, session in weekly.items()
               if session["HasApplications"] or session["SlotsOverridden"]
               or (session_id in changes and changes[session_id]["slots"] != session["CreatorSlots"])}
    # A Cancelled one stays at a date and time the settings still give, which the
    # schedule then skips; a new Session can use it (to_ask.md D10).
    for session_id in cancelled:
        times = _times(weekly[session_id])
        if session_id not in staying and times not in targets:
            plan.deletes.append(session_id)
        targets.discard(times)
    others = {session_id: session for session_id, session in current.items()
              if session_id not in editable and session_id not in weekly}
    open_staying = [session for session_id, session in staying.items() if session_id not in cancelled]
    taken: dict[Times, str] = {}  # each date and time taken so far, with what a row repeating it is told
    for session in [*others.values(), *open_staying]:
        weekly_class = session["RecurrenceID"] is not None and (
            recurring is not None or session["RecurrenceID"] != schedule_id)
        taken.setdefault(_times(session), DUPLICATE_OF_WEEKLY_CLASS if weekly_class else DUPLICATE_OF_SESSION)
    # Reopened rows last, so a Session already at their date and time keeps it.
    for row in sorted(kept, key=lambda row: row.get("reopen", False)):
        times = _times(row)
        if times in taken:
            errors.setdefault(f"sessions.{row['index']}.date", taken[times])
            continue
        if times in targets:
            if row["id"] is not None and not row.get("reopen") and times == _times(stored[row["id"]]):
                targets.discard(times)  # an unchanged one-off Session keeps its date and time
            else:
                errors.setdefault(f"sessions.{row['index']}.date", DUPLICATE_OF_WEEKLY_CLASS)
                continue
        taken[times] = DUPLICATE_OF_ROW.format(number=row["index"] + 1)
    # A reopened weekly class Session needs its date and time free (FS-ADM-SES-013).
    for session_id in plan.reopens:
        times = _times(stored[session_id])
        if any(_times(session) == times for session in [*others.values(), *kept]) or any(
                other_id != session_id and other_id not in cancelled and _times(other) == times
                for other_id, other in weekly.items()):
            errors.setdefault(changes[session_id]["key"], DUPLICATE_OF_SESSION)

    for session_id, session in editable.items():
        if session_id not in listed:
            (plan.cancels if session["HasApplications"] else plan.deletes).append(session_id)
    # A date and time a Session of another Recurring Schedule has is skipped, as the top-up does.
    targets -= {_times(session) for session in [*staying.values(), *others.values()]}
    if recurring is None:
        plan.detach = list(staying)
    regenerated = 0  # the Recurring Schedule's Sessions without Applications it keeps
    for session_id, session in weekly.items():
        if session_id in staying or session_id in cancelled:
            continue
        if _times(session) in targets:
            targets.discard(_times(session))
            regenerated += 1
            if session["CreatorSlots"] != recurring["slots"]:
                plan.reslot.append(session_id)
        elif session_id in plan.reopens:
            # Reopening it would only delete it (FS-ADM-SES-013: its configuration must remain valid).
            errors.setdefault(changes[session_id]["key"], REOPEN_NOT_IN_SCHEDULE)
        else:
            plan.deletes.append(session_id)
    plan.generate = sorted(targets)
    plan.future_sessions = (sum(1 for session in others.values() if session["startsAt"] > now)
                            + len(kept) + len(open_staying) + regenerated + len(plan.generate))
    return plan


def _weekly_changes(stored: dict, schedule_id, weekly_sessions: list[dict], errors: dict, *,
                    now: datetime, live: bool) -> dict[int, dict]:
    """The weekly class Sessions the form changes, keyed by id: each one's
    `{"slots", "cancelled", "key"}` once saved, with `key` its error key. Adds
    each rule's error to `errors`: a started Session never changes (FS-ADM-SES-011),
    Creator Slots can't go below the Accepted Count (FS-ADM-SES-014), and
    reopening needs a Live Opportunity and a free slot (FS-ADM-SES-013)."""
    changes = {}
    for entry in weekly_sessions:
        key = f"weeklySessions.{entry['index']}"
        if any(error == key or error.startswith(f"{key}.") for error in errors):
            continue
        session = stored.get(entry["id"])
        if session is None or session["RecurrenceID"] is None or session["RecurrenceID"] != schedule_id:
            errors[key] = SESSION_GONE
            continue
        slots, accepted = entry["slots"], session["AcceptedCount"]
        reopen = bool(session["IsCancelled"]) and not entry["cancelled"]
        if slots == session["CreatorSlots"] and entry["cancelled"] == bool(session["IsCancelled"]):
            continue
        if session["startsAt"] <= now:
            errors[key] = SESSION_STARTED
        elif slots is None:
            errors[f"{key}.slots"] = ENTER_SLOTS
        elif slots < accepted:
            errors[f"{key}.slots"] = _below_accepted(accepted)
        elif reopen and not live:
            errors[key] = REOPEN_NOT_LIVE
        elif reopen and slots <= accepted:
            errors[f"{key}.slots"] = REOPEN_FULL
        else:
            changes[entry["id"]] = {"slots": slots, "cancelled": entry["cancelled"], "key": key}
    return changes


def _below_accepted(accepted: int) -> str:
    return f"Creator Slots can't be lower than the {accepted} creator{'' if accepted == 1 else 's'} already accepted"


def top_up_rolling_windows(conn, *, now: datetime, opportunity_ids: list[int] | None = None) -> None:
    """Generate the Sessions each open-ended Recurring Schedule is missing as of
    `now`, so it keeps ROLLING_WINDOW of future Sessions without a cron job
    (FS-ADM-SES-008). Idempotent: call it before any read of Sessions, limited to
    `opportunity_ids` when the read covers only those. A date and time another
    non-cancelled Session of the Opportunity has is skipped, and so is one the
    Recurring Schedule has a Cancelled Session at."""
    cursor = conn.cursor(dictionary=True)
    missing = _missing_sessions(cursor, now, opportunity_ids)
    conn.commit()  # end the read's implicit transaction
    if not missing:
        return
    opportunity_ids = sorted({session[0] for session in missing})
    with transaction(conn, isolation_level="READ COMMITTED"):
        # Lock the Opportunities first, as a save does, so a save and a top-up wait for each other.
        cursor.execute(
            f"SELECT OpportunityID FROM Opportunity WHERE OpportunityID IN ({placeholders(opportunity_ids)})"
            " ORDER BY OpportunityID FOR UPDATE",
            opportunity_ids,
        )
        cursor.fetchall()
        missing = _missing_sessions(cursor, now, opportunity_ids)
        if missing:
            cursor.executemany(_INSERT_SESSION, missing)


def _missing_sessions(cursor, now: datetime, opportunity_ids: list[int] | None = None) -> list[tuple]:
    """The Sessions open-ended Recurring Schedules are missing, as rows for _INSERT_SESSION."""
    query = "SELECT * FROM RecurringSchedule WHERE EndDate IS NULL"
    if opportunity_ids is not None:
        query += f" AND OpportunityID IN ({placeholders(opportunity_ids)})"
    cursor.execute(query + " ORDER BY RecurrenceID", opportunity_ids or ())
    schedules = cursor.fetchall()
    if not schedules:
        return []
    ids = sorted({schedule["OpportunityID"] for schedule in schedules})
    cursor.execute(
        f"""SELECT OpportunityID, SessionDate, StartTime, EndTime, IsCancelled, RecurrenceID FROM Session
             WHERE SessionDate >= %s AND OpportunityID IN ({placeholders(ids)})""",
        [now.date(), *ids],
    )
    taken = defaultdict(set)  # Opportunity id: the dates and times its non-cancelled Sessions have
    cancelled = defaultdict(set)  # RecurrenceID: the dates and times it has Cancelled Sessions at
    for session in cursor.fetchall():
        if session["IsCancelled"]:
            cancelled[session["RecurrenceID"]].add(_times(session))
        else:
            taken[session["OpportunityID"]].add(_times(session))
    missing = []
    for schedule in schedules:
        for times in generated_times(schedule_weekdays(schedule), hhmm(schedule["StartTime"]),
                                     hhmm(schedule["EndTime"]), schedule["StartDate"], None, now=now):
            if times not in taken[schedule["OpportunityID"]] and times not in cancelled[schedule["RecurrenceID"]]:
                taken[schedule["OpportunityID"]].add(times)
                missing.append((schedule["OpportunityID"], *times, schedule["DefaultCreatorSlots"],
                                schedule["RecurrenceID"]))
    return missing


def form_schedule(cursor, opportunity_id) -> dict | None:
    """The Opportunity's Recurring Schedule the form edits, its first, as a dictionary row; None when it has none."""
    cursor.execute("SELECT * FROM RecurringSchedule WHERE OpportunityID = %s ORDER BY RecurrenceID LIMIT 1",
                   (opportunity_id,))
    return cursor.fetchone()


def _schedule_id(cursor, opportunity_id) -> int | None:
    schedule = form_schedule(cursor, opportunity_id)
    return None if schedule is None else schedule["RecurrenceID"]


def _stored_sessions(cursor, opportunity_id) -> dict[int, dict]:
    """Every Session of the Opportunity, locked, with its Accepted Count and whether
    any Application names it, keyed by id. A RecurrenceID with no Recurring Schedule
    behind it counts as one-off (it has no foreign key)."""
    lock_opportunity_sessions(cursor, opportunity_id)
    # Read after the lock, in a separate non-locking read, so the counts see every
    # Application committed before it (READ COMMITTED).
    cursor.execute(
        f"""SELECT s.SessionID, s.SessionDate, s.StartTime, s.EndTime, s.CreatorSlots, s.IsCancelled,
                  s.SlotsOverridden,
                  (SELECT r.RecurrenceID FROM RecurringSchedule r
                    WHERE r.RecurrenceID = s.RecurrenceID AND r.OpportunityID = s.OpportunityID) AS RecurrenceID,
                  {ACCEPTED_COUNT},
                  EXISTS (SELECT 1 FROM Application a
                           WHERE a.CurrentSessionID = s.SessionID OR a.OriginalSessionID = s.SessionID)
                    AS HasApplications
             FROM Session s WHERE s.OpportunityID = %s""",
        (opportunity_id,),
    )
    sessions = {}
    for session in cursor.fetchall():
        times = session_times(session)
        sessions[session["SessionID"]] = {**session, **times, "startsAt": _starts_at(session["SessionDate"], times["start"])}
    return sessions


def _starts_at(day: date, start: str) -> datetime:
    return datetime.combine(day, time.fromisoformat(start))


def _times(session: dict) -> Times:
    """A form row's or a stored Session's date, start and end."""
    if "SessionDate" in session:
        times = session_times(session)
        return session["SessionDate"], times["start"], times["end"]
    return session["date"], session["start"], session["end"]

