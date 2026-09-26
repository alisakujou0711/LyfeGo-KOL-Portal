"""Creates Applications submitted from the Creator Portal."""

import json
import re
from datetime import datetime

from mysql.connector import errorcode
from mysql.connector.abstracts import MySQLConnectionAbstract
from mysql.connector.errors import IntegrityError

from app.availability import OpportunityState, SessionState
from app.opportunities import get_detail, listed_sessions

OPPORTUNITY_UNAVAILABLE = "This opportunity is no longer accepting registrations."
SESSION_FILLED = "This session is now full. Please choose another session."
SESSION_UNAVAILABLE = "This session is no longer available. Please choose another session."

# The same email and phone patterns as javascript/lib/validation.js. The server also
# enforces what the form can't: column lengths, the note limit, and handles sent
# without the @ (the form strips it).
EMAIL_RE = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}")
PHONE_RE = re.compile(r"\+?[0-9\s()-]{8,20}")
ID_RE = re.compile(r"[0-9]{1,10}")
MAX_NOTE_LENGTH = 5000


class Conflict(Exception):
    """The Opportunity or Session can no longer be applied for; the message is creator-readable."""


class Invalid(Exception):
    """The submission has invalid fields: `errors` maps each field to a creator-readable message."""

    def __init__(self, errors: dict[str, str]):
        super().__init__(errors)
        self.errors = errors


def create_application(
    conn: MySQLConnectionAbstract, body: dict, *, now: datetime
) -> tuple[str, bool]:
    """Store a New Application for the chosen Session; returns (its id, whether it was created).

    Idempotent by submission key: a key already used returns that Application's
    id and creates nothing, whatever else was resent and even if its Session
    has since become unavailable. Otherwise raises Invalid for invalid fields,
    then revalidates, in the same transaction as the insert, that the
    Opportunity is Live (not Draft or closed) and the Session is one of its
    Available Sessions; raises Conflict if not.
    """
    key = body.get("submissionKey")
    existing = _application_with_key(conn, key.strip()) if isinstance(key, str) else None
    if existing is not None:
        return existing, False
    submission = _validated(body)
    try:
        return _insert_application(conn, submission, now=now), True
    except IntegrityError as error:
        # A concurrent request with the same key inserted first.
        if error.errno != errorcode.ER_DUP_ENTRY:
            raise
        return _application_with_key(conn, submission["submissionKey"]), False


def _validated(body: dict) -> dict:
    """The submission's fields, trimmed, or Invalid. A non-string counts as missing."""
    values = {
        field: value.strip() if isinstance(value, str) else ""
        for field, value in ((f, body.get(f)) for f in (
            "opportunityId", "sessionId", "fullName", "instagram", "tiktok",
            "email", "phone", "note", "submissionKey",
        ))
    }
    errors = {}

    if not ID_RE.fullmatch(values["opportunityId"]):
        errors["opportunityId"] = "Unknown opportunity"
    if not ID_RE.fullmatch(values["sessionId"]):
        errors["sessionId"] = "Please choose a session"

    if not values["fullName"]:
        errors["fullName"] = "Full name is required"
    elif len(values["fullName"]) > 255:
        errors["fullName"] = "Full name must be 255 characters or fewer"

    for field, required in (("instagram", True), ("tiktok", False)):
        handle = values[field]
        if not handle:
            if required:
                errors[field] = "Instagram handle is required"
        elif handle.startswith("@"):
            errors[field] = "Enter your handle without the @"
        elif re.search(r"\s", handle):
            errors[field] = "Handles cannot contain spaces"
        elif len(handle) > 255:
            errors[field] = "Handles must be 255 characters or fewer"

    if not values["email"]:
        errors["email"] = "Email address is required"
    elif len(values["email"]) > 255 or not EMAIL_RE.fullmatch(values["email"]):
        errors["email"] = "Please enter a valid email address"

    if not values["phone"]:
        errors["phone"] = "Mobile number is required"
    elif not PHONE_RE.fullmatch(values["phone"]) or len(re.sub(r"[^0-9]", "", values["phone"])) < 8:
        errors["phone"] = "Please enter a valid mobile number"

    if len(values["note"]) > MAX_NOTE_LENGTH:
        errors["note"] = f"Note must be {MAX_NOTE_LENGTH} characters or fewer"

    if not values["submissionKey"]:
        errors["submissionKey"] = "Submission key is required"
    elif len(values["submissionKey"]) > 64:
        errors["submissionKey"] = "Submission key must be 64 characters or fewer"

    if errors:
        raise Invalid(errors)
    return values


def _application_with_key(conn, submission_key: str) -> str | None:
    cursor = conn.cursor()
    cursor.execute("SELECT ApplicationID FROM Application WHERE SubmissionKey = %s", (submission_key,))
    row = cursor.fetchone()
    conn.commit()  # end this read's implicit transaction, so the insert starts a fresh one
    return None if row is None else str(row[0])


def _insert_application(conn, submission: dict, *, now: datetime) -> str:
    conn.start_transaction()
    try:
        # Lock the chosen Session so it can't change (e.g. be cancelled) between
        # the check and the insert; later reads see its latest committed state.
        cursor = conn.cursor()
        cursor.execute(
            "SELECT SessionID FROM Session WHERE SessionID = %s FOR UPDATE",
            (submission["sessionId"],),
        )
        cursor.fetchall()
        detail, session = _chosen_session(conn, submission, now=now)
        creator = {
            "fullName": submission["fullName"],
            "instagram": submission["instagram"],
            "tiktok": submission["tiktok"] or None,
            "email": submission["email"],
            "phone": submission["phone"],
            "note": submission["note"] or None,
        }
        cursor.execute(
            """INSERT INTO Application
                   (OpportunityID, OriginalSessionID, CurrentSessionID, Status, FullName,
                    InstagramHandle, TikTokHandle, EmailAddress, MobileWhatsAppNumber, CreatorNote,
                    SubmissionSnapshot, SubmittedAt, SubmissionKey)
               VALUES (%s, %s, %s, 'New', %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                detail["id"], session["id"], session["id"], creator["fullName"], creator["instagram"],
                creator["tiktok"], creator["email"], creator["phone"], creator["note"],
                json.dumps(historical_snapshot(detail, session, creator)), now, submission["submissionKey"],
            ),
        )
        conn.commit()
        return str(cursor.lastrowid)
    except BaseException:
        conn.rollback()
        raise


def _chosen_session(conn, submission: dict, *, now: datetime) -> tuple[dict, dict]:
    """The Opportunity's detail and the chosen Session, if that Session can be applied for."""
    detail = get_detail(conn, int(submission["opportunityId"]), now=now)
    if detail is None or detail["availability"] == OpportunityState.CLOSED:
        raise Conflict(OPPORTUNITY_UNAVAILABLE)
    listed = listed_sessions(detail)
    session = next((s for s in listed if s["id"] == submission["sessionId"]), None)
    if session is None:
        raise Conflict(SESSION_UNAVAILABLE)
    if session["status"] != SessionState.AVAILABLE:  # listed Sessions are available or filled
        raise Conflict(SESSION_FILLED)
    return detail, session


def historical_snapshot(detail: dict, session: dict, creator: dict) -> dict:
    """The Historical Snapshot (HIS-001): the creator-facing terms as shown, plus the creator's details."""
    return {
        "opportunity": {key: detail[key] for key in ("title", "partner", "category", "subcategory")},
        "compensation": {
            "type": detail["compensationType"],
            "whatCreatorReceives": detail["whatCreatorReceives"],
            "payment": detail["payment"],
        },
        "collaboration": {
            key: detail[key]
            for key in ("collaborationType", "deliverableType", "deliverableNote", "deliverables")
        },
        "requirements": {key: detail[key] for key in ("experienceLevels", "additionalInfo")},
        "session": {key: session[key] for key in ("date", "start", "end")},
        "location": {key: detail[key] for key in ("venueName", "fullAddress", "area")},
        "creator": creator,
    }
