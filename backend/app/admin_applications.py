"""The Admin's view of Applications: the list, one Application's detail, and
changing its Application Status, correcting the creator's contact details and
moving it to another Session (FS-ADM-APP-005..033). There are no Internal
Notes (APP-013) and no creator skill level (FLD-006).

Only Accepted Applications consume Creator Slots (ADR-0002), so accepting and
moving an Accepted Application are the changes checked for room: in one
transaction that holds the Session's row lock, so two Admins can never both
take its last slot.
"""

import json
from datetime import datetime

from mysql.connector.abstracts import MySQLConnectionAbstract

from app.applications import ID_RE, Conflict, Invalid, NotFound, choose_one_of, contact_errors
from app.availability import SessionState, evaluate_session
from app.db import contains_pattern, transaction, update
from app.opportunities import ACCEPTED_COUNT, lock_session, session_from_row, session_times

STATUSES = ("New", "Reviewing", "Accepted", "Declined")

# The column each status's time is stamped in; New has none.
_STATUS_TIMESTAMP_COLUMNS = {"Reviewing": "ReviewingAt", "Accepted": "AcceptedAt", "Declined": "DeclinedAt"}

_CANNOT_ACCEPT = {
    SessionState.FILLED: "Can't accept: this session is already full.",
    SessionState.EXPIRED: "Can't accept: this session has already started.",
    SessionState.CANCELLED: "Can't accept: this session has been cancelled.",
}

# Moving to another Session (FS-ADM-APP-026..030). A full one refuses only an Accepted Application.
_CANNOT_MOVE = {
    SessionState.EXPIRED: "Can't move: that session has already started.",
    SessionState.CANCELLED: "Can't move: that session has been cancelled.",
}
SESSION_FULL = "That session is full. Choose another or add slots first."
OTHER_OPPORTUNITY = "Can't move: that session belongs to another opportunity."
UNKNOWN_SESSION = "Choose one of this opportunity's sessions"
NOT_FOUND = "Application not found"

_APPLICATIONS = """
    SELECT a.*, o.Title, o.PartnerBrandName, o.Category, o.CompensationType,
           s.SessionDate, s.StartTime, s.EndTime,
           os.SessionDate AS OriginalDate, os.StartTime AS OriginalStart, os.EndTime AS OriginalEnd
      FROM Application a
      JOIN Opportunity o ON o.OpportunityID = a.OpportunityID
      JOIN Session s ON s.SessionID = a.CurrentSessionID
      JOIN Session os ON os.SessionID = a.OriginalSessionID
"""

# The fields a PATCH may send.
_CHANGES = ("status", "contact", "sessionId")


def list_applications(
    conn: MySQLConnectionAbstract, *, search: str = "", opportunity_id: str = "", partner: str = "",
    status: str = "", category: str = "",
) -> dict:
    """Every Application matching the search (creator name, Instagram or TikTok
    handle, as corrected or as submitted, Opportunity title or Partner, ignoring
    case) and every given filter, newest submitted first; the status counts,
    which always cover every Application; and the Opportunity and Partner filter
    options. Rows show the creator's details with any correction.
    """
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT Status, COUNT(*) AS Count FROM Application GROUP BY Status")
    by_status = {row["Status"]: row["Count"] for row in cursor.fetchall()}
    counts = {"all": sum(by_status.values()), **{status.lower(): by_status.get(status, 0) for status in STATUSES}}

    cursor.execute("SELECT OpportunityID, Title FROM Opportunity ORDER BY OpportunityID")
    opportunities = [{"id": str(row["OpportunityID"]), "title": row["Title"]} for row in cursor.fetchall()]
    cursor.execute("SELECT DISTINCT PartnerBrandName FROM Opportunity ORDER BY PartnerBrandName")
    partners = [row["PartnerBrandName"] for row in cursor.fetchall()]

    conditions, params = [], []
    if ID_RE.fullmatch(opportunity_id):
        conditions.append("a.OpportunityID = %s")
        params.append(opportunity_id)
    elif opportunity_id:
        conditions.append("FALSE")  # not an id: matches nothing, like any unknown filter value
    for column, value in (("o.PartnerBrandName", partner), ("a.Status", status), ("o.Category", category)):
        if value:
            conditions.append(f"{column} = %s")
            params.append(value)
    if search.strip():
        text = contains_pattern(search.strip())
        # Handles are stored without the @ that the list shows.
        handle = contains_pattern(search.strip().lstrip("@") or search.strip())
        conditions.append(
            r"""(a.FullName LIKE %s ESCAPE '\\' OR a.CorrectedFullName LIKE %s ESCAPE '\\'
                 OR o.Title LIKE %s ESCAPE '\\' OR o.PartnerBrandName LIKE %s ESCAPE '\\'
                 OR a.InstagramHandle LIKE %s ESCAPE '\\' OR a.CorrectedInstagramHandle LIKE %s ESCAPE '\\'
                 OR a.TikTokHandle LIKE %s ESCAPE '\\' OR a.CorrectedTikTokHandle LIKE %s ESCAPE '\\')""")
        params += [text, text, text, text, handle, handle, handle, handle]
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    cursor.execute(_APPLICATIONS + where + " ORDER BY a.SubmittedAt DESC, a.ApplicationID DESC", params)
    rows = cursor.fetchall()
    conn.commit()  # end the reads' implicit transaction

    return {
        "counts": counts,
        "options": {"opportunities": opportunities, "partners": partners},
        "applications": [
            {
                "id": str(row["ApplicationID"]),
                **{field: value for field, value in _current_contact(row).items() if field != "phone"},
                "opportunity": {
                    "id": str(row["OpportunityID"]), "title": row["Title"], "partner": row["PartnerBrandName"],
                },
                "session": session_times(row),
                "submittedOn": row["SubmittedAt"].date().isoformat(),
                "status": row["Status"],
            }
            for row in rows
        ],
    }


def get_application(conn: MySQLConnectionAbstract, application_id: str, *, now: datetime) -> dict:
    """One Application as the detail panel shows it; raises NotFound. Reading it changes nothing.

    `contact` is the creator's details as they are now, with any correction;
    `original` is what they submitted. `snapshot` is the Historical Snapshot's
    groups (HIS-001), leaving out any an older snapshot lacks. `otherSessions`
    are the Opportunity's other future, non-cancelled Sessions, soonest first,
    which the Application can be moved to.
    """
    row = None
    if ID_RE.fullmatch(application_id):
        cursor = conn.cursor(dictionary=True)
        cursor.execute(_APPLICATIONS + " WHERE a.ApplicationID = %s", (application_id,))
        row = cursor.fetchone()
        other_sessions = []
        if row is not None:
            cursor.execute(
                f"""SELECT SessionID, SessionDate, StartTime, EndTime, CreatorSlots, {ACCEPTED_COUNT}
                     FROM Session s
                    WHERE OpportunityID = %s AND SessionID <> %s AND NOT IsCancelled
                      AND TIMESTAMP(SessionDate, StartTime) > %s
                    ORDER BY SessionDate, StartTime, SessionID""",
                (row["OpportunityID"], row["CurrentSessionID"], now),
            )
            other_sessions = [
                {**_session(session["SessionID"], session), "slots": session["CreatorSlots"], "accepted": session["AcceptedCount"]}
                for session in cursor.fetchall()
            ]
        conn.commit()  # end the reads' implicit transaction
    if row is None:
        raise NotFound(NOT_FOUND)
    original = _original_contact(row)
    return {
        "id": str(row["ApplicationID"]),
        "status": row["Status"],
        "contact": _current_contact(row),
        "original": original,
        "note": row["CreatorNote"],
        "submittedOn": row["SubmittedAt"].date().isoformat(),
        "opportunity": {
            "id": str(row["OpportunityID"]),
            "title": row["Title"],
            "partner": row["PartnerBrandName"],
            "category": row["Category"],
            "compensationType": row["CompensationType"],
        },
        "session": _session(row["CurrentSessionID"], row),
        "originalSession": {
            "id": str(row["OriginalSessionID"]),
            **session_times({"SessionDate": row["OriginalDate"], "StartTime": row["OriginalStart"],
                             "EndTime": row["OriginalEnd"]}),
        },
        "snapshot": _snapshot(row["SubmissionSnapshot"]),
        "otherSessions": other_sessions,
    }


# Each contact field and the columns holding its submitted and corrected values.
_CONTACT_COLUMNS = {
    "fullName": ("FullName", "CorrectedFullName"),
    "instagram": ("InstagramHandle", "CorrectedInstagramHandle"),
    "tiktok": ("TikTokHandle", "CorrectedTikTokHandle"),
    "email": ("EmailAddress", "CorrectedEmailAddress"),
    "phone": ("MobileWhatsAppNumber", "CorrectedMobileWhatsAppNumber"),
}

# The Historical Snapshot's groups the panel shows; its "creator" group is `original`.
_SNAPSHOT_GROUPS = ("opportunity", "compensation", "collaboration", "requirements", "session", "location")


def _corrections(row: dict, contact: dict) -> dict:
    """The Corrected... columns for `contact`: NULL where it matches the submission,
    so setting a field back to the original clears its correction."""
    return {
        corrected: None if contact[field] == (row[submitted] or "") else contact[field]
        for field, (submitted, corrected) in _CONTACT_COLUMNS.items()
    }


def _original_contact(row: dict) -> dict:
    return {field: row[submitted] or None for field, (submitted, _) in _CONTACT_COLUMNS.items()}


def _current_contact(row: dict) -> dict:
    """The contact details with each correction in place of the submitted value. A
    correction of '' (a removed TikTok handle) shows as None."""
    return {
        field: (row[submitted] if row[corrected] is None else row[corrected]) or None
        for field, (submitted, corrected) in _CONTACT_COLUMNS.items()
    }


def _session(session_id: int, row: dict) -> dict:
    return {"id": str(session_id), **session_times(row)}


def _snapshot(stored: str) -> dict:
    try:
        snapshot = json.loads(stored)
    except (TypeError, ValueError):
        return {}
    if not isinstance(snapshot, dict):
        return {}
    return {group: snapshot[group] for group in _SNAPSHOT_GROUPS if snapshot.get(group)}


def update_application(conn: MySQLConnectionAbstract, application_id: str, body: dict, *, now: datetime) -> dict:
    """Change any of the Application Status, the creator's contact details and the
    Current Session, together, and return the updated detail.

    Raises NotFound, Invalid for a bad or unknown field, or Conflict when accepting
    into a Current Session that is full, has started or is Cancelled, or when the
    new Session has started, is Cancelled, belongs to another Opportunity or, for
    an Accepted Application, is full. Moving away from Accepted frees the slot
    with no check, and a move frees the old slot as it takes the new one. The
    Original Session never changes, and the creator isn't told. Each change of
    status stamps its time, and every save stamps UpdatedAt, in SGT.
    """
    changes = _validated(body)
    if not ID_RE.fullmatch(application_id):
        raise NotFound(NOT_FOUND)
    # READ COMMITTED: once the Session's lock is ours, the Accepted Count sees
    # every accept committed before it, however long the lock took.
    with transaction(conn, isolation_level="READ COMMITTED"):
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT Status, OpportunityID, CurrentSessionID, {', '.join(submitted for submitted, _ in _CONTACT_COLUMNS.values())}
                  FROM Application WHERE ApplicationID = %s FOR UPDATE""",
            (application_id,),
        )
        application = cursor.fetchone()
        if application is None:
            raise NotFound(NOT_FOUND)
        columns = {"UpdatedAt": now}
        if "contact" in changes:
            columns.update(_corrections(application, changes["contact"]))
        status = changes.get("status", application["Status"])
        current = application["CurrentSessionID"]
        destination = changes.get("sessionId", current)
        if destination != current:
            # Both Sessions, lowest id first, so two moves between them can't deadlock.
            for session_id in sorted((current, destination)):
                lock_session(cursor, session_id)
            _check_move(cursor, application["OpportunityID"], destination, accepted=status == "Accepted", now=now)
            columns["CurrentSessionID"] = destination
        elif status == "Accepted" and application["Status"] != "Accepted":
            lock_session(cursor, current)
            state = _session_state(cursor, current, now=now)[1]
            if state in _CANNOT_ACCEPT:
                raise Conflict(_CANNOT_ACCEPT[state])
        if status != application["Status"]:
            columns["Status"] = status
            if status in _STATUS_TIMESTAMP_COLUMNS:
                columns[_STATUS_TIMESTAMP_COLUMNS[status]] = now
        update(cursor, "Application", columns, where="ApplicationID", key=application_id)
    return get_application(conn, application_id, now=now)


def _session_state(cursor, session_id: int, *, now: datetime) -> tuple[int, SessionState] | None:
    """The Session's Opportunity id and state, or None when there's no such Session.

    Read after its lock, in a separate non-locking read, so waiting for the lock
    never also locks other Applications, and (READ COMMITTED) the Accepted Count
    sees every accept committed before the lock was ours.
    """
    cursor.execute(
        f"""SELECT SessionID, OpportunityID, SessionDate, StartTime, CreatorSlots, IsCancelled, {ACCEPTED_COUNT}
              FROM Session s WHERE SessionID = %s""",
        (session_id,),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return row["OpportunityID"], evaluate_session(session_from_row(row), now).state


def _check_move(cursor, opportunity_id: int, session_id: int, *, accepted: bool, now: datetime) -> None:
    """Raise Invalid or Conflict unless the Application, Accepted or not, can move to the (locked) Session."""
    found = _session_state(cursor, session_id, now=now)
    if found is None:
        raise Invalid({"sessionId": UNKNOWN_SESSION})
    session_opportunity, state = found
    if session_opportunity != opportunity_id:
        raise Conflict(OTHER_OPPORTUNITY)
    if state in _CANNOT_MOVE:
        raise Conflict(_CANNOT_MOVE[state])
    if accepted and state == SessionState.FILLED:
        raise Conflict(SESSION_FULL)


def _validated(body: dict) -> dict:
    """The changes the body asks for, validated, or Invalid. It must ask for at least one,
    and nothing else."""
    errors = {field: "This can't be changed here" for field in body if field not in _CHANGES}
    changes = {}
    if "status" in body:
        if body["status"] in STATUSES:
            changes["status"] = body["status"]
        else:
            errors["status"] = choose_one_of(STATUSES)
    if "contact" in body:
        contact = body["contact"]
        if isinstance(contact, dict):
            # A missing or non-text field counts as empty, as on the register form.
            values = {field: contact[field].strip() if isinstance(contact.get(field), str) else ""
                      for field in _CONTACT_COLUMNS}
            errors.update({f"contact.{field}": message for field, message in contact_errors(values).items()})
            changes["contact"] = values
        else:
            errors["contact"] = "Send the contact details as fullName, instagram, tiktok, email and phone"
    if "sessionId" in body:
        session_id = body["sessionId"]
        is_id = isinstance(session_id, (str, int)) and not isinstance(session_id, bool)
        if is_id and ID_RE.fullmatch(str(session_id)):
            changes["sessionId"] = int(session_id)
        else:
            errors["sessionId"] = UNKNOWN_SESSION
    if not errors and not changes:
        errors["status"] = "Send the status, contact details or session to change"
    if errors:
        raise Invalid(errors)
    return changes
