import json
from datetime import datetime, timedelta

import pytest

from tests.factories import (
    PAID,
    add_application,
    add_deliverable,
    add_info,
    add_opportunity,
    add_schedule,
    add_session,
)

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def submission(opportunity_id, session_id, **overrides):
    return {
        "opportunityId": str(opportunity_id),
        "sessionId": str(session_id),
        "fullName": "Jamie Tan",
        "instagram": "jamie.moves",
        "tiktok": "jamiemoves",
        "email": "jamie@example.com",
        "phone": "+65 9123 4567",
        "note": "I post weekly tennis content.",
        "submissionKey": "3f1c2d7e-0000-4000-8000-000000000001",
        **overrides,
    }


def applications(db):
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Application ORDER BY ApplicationID")
    return cursor.fetchall()


def test_a_valid_submission_stores_one_new_application(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)

    response = client.post("/api/applications", json=submission(opp, session))

    assert response.status_code == 201
    [row] = applications(db)
    assert response.json() == {"id": str(row["ApplicationID"])}
    assert row["OpportunityID"] == opp
    assert row["OriginalSessionID"] == session
    assert row["CurrentSessionID"] == session
    assert row["Status"] == "New"
    assert row["FullName"] == "Jamie Tan"
    assert row["InstagramHandle"] == "jamie.moves"
    assert row["TikTokHandle"] == "jamiemoves"
    assert row["EmailAddress"] == "jamie@example.com"
    assert row["MobileWhatsAppNumber"] == "+65 9123 4567"
    assert row["CreatorNote"] == "I post weekly tennis content."
    assert row["SubmittedAt"] == NOW
    assert row["ExperienceSkillLevel"] is None
    assert row["SubmissionKey"] == "3f1c2d7e-0000-4000-8000-000000000001"


def test_the_snapshot_holds_the_terms_at_submission_and_ignores_later_edits(client, db):
    opp = add_opportunity(db, PAID, DeliverableNote="Content must be original.")
    add_deliverable(db, opp, "Post 1 × Instagram Reel")
    add_deliverable(db, opp, "Tag @lyfego.sg in your caption")
    add_info(db, opp, "Attire", "Bring your own mat")
    session = add_session(db, opp, TOMORROW_10AM)

    client.post("/api/applications", json=submission(opp, session, tiktok="", note=""))
    cursor = db.cursor()
    cursor.execute("UPDATE Opportunity SET Title = 'Renamed', PaidAmount = 999 WHERE OpportunityID = %s", (opp,))
    cursor.execute("DELETE FROM DeliverableItems WHERE OpportunityID = %s", (opp,))
    db.commit()

    [row] = applications(db)
    assert json.loads(row["SubmissionSnapshot"]) == {
        "opportunity": {
            "title": "Activewear Campaign",
            "partner": "FullOut Activewear",
            "category": "Lifestyle",
            "subcategory": "Activewear",
        },
        "compensation": {
            "type": "Paid",
            "whatCreatorReceives": None,
            "payment": {
                "currency": "SGD",
                "amount": 150,
                "basis": "Flat fee",
                "note": "Plus an activewear set to keep",
            },
        },
        "collaboration": {
            "collaborationType": "One-off",
            "deliverableType": "Fixed",
            "deliverableNote": "Content must be original.",
            "deliverables": ["Post 1 × Instagram Reel", "Tag @lyfego.sg in your caption"],
        },
        "requirements": {
            "experienceLevels": ["Beginner", "Intermediate"],
            "additionalInfo": [{"label": "Attire", "value": "Bring your own mat"}],
        },
        "session": {"date": "2026-09-24", "start": "10:00", "end": "11:00"},
        "location": {
            "venueName": "Kallang Tennis Centre",
            "fullAddress": "Stadium Road, Singapore 397630",
            "area": "Tanjong Pagar",
        },
        "creator": {
            "fullName": "Jamie Tan",
            "instagram": "jamie.moves",
            "tiktok": None,
            "email": "jamie@example.com",
            "phone": "+65 9123 4567",
            "note": None,
        },
    }
    assert row["TikTokHandle"] is None
    assert row["CreatorNote"] is None


def test_a_barter_snapshot_records_what_the_creator_receives(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)

    client.post("/api/applications", json=submission(opp, session))

    snapshot = json.loads(applications(db)[0]["SubmissionSnapshot"])
    assert snapshot["compensation"] == {
        "type": "Barter",
        "whatCreatorReceives": "Complimentary group tennis class (1 hour)",
        "payment": None,
    }
    assert snapshot["creator"]["tiktok"] == "jamiemoves"
    assert snapshot["creator"]["note"] == "I post weekly tennis content."


SESSION_UNAVAILABLE = "This session is no longer available. Please choose another session."


def conflict(client, body):
    response = client.post("/api/applications", json=body)
    assert response.status_code == 409
    return response.json()["detail"]


def test_a_filled_session_is_a_conflict(client, db):
    opp = add_opportunity(db)
    filled = add_session(db, opp, TOMORROW_10AM, slots=1)
    add_session(db, opp, TOMORROW_10AM + timedelta(days=1))
    add_application(db, opp, filled, status="Accepted")

    assert conflict(client, submission(opp, filled)) == (
        "This session is now full. Please choose another session."
    )
    assert len(applications(db)) == 1


def test_a_creator_can_apply_for_a_weekly_class_session(client, db):
    opp = add_opportunity(db)
    saturdays = add_schedule(db, opp, TOMORROW_10AM)
    session = add_session(db, opp, TOMORROW_10AM, recurrence_id=saturdays)

    response = client.post("/api/applications", json=submission(opp, session))

    assert response.status_code == 201
    [row] = applications(db)
    assert row["CurrentSessionID"] == session
    assert json.loads(row["SubmissionSnapshot"])["session"] == {
        "date": "2026-09-24", "start": "10:00", "end": "11:00",
    }


def test_accepted_applications_fill_a_weekly_class_session_like_any_session(client, db):
    opp = add_opportunity(db)
    saturdays = add_schedule(db, opp, TOMORROW_10AM, slots=2)
    filled = add_session(db, opp, TOMORROW_10AM, slots=2, recurrence_id=saturdays)
    add_session(db, opp, TOMORROW_10AM + timedelta(weeks=1), slots=2, recurrence_id=saturdays)
    add_application(db, opp, filled, status="Accepted")
    add_application(db, opp, filled, status="Accepted")
    add_application(db, opp, filled, status="Reviewing")

    assert conflict(client, submission(opp, filled)) == (
        "This session is now full. Please choose another session."
    )
    assert len(applications(db)) == 3


@pytest.mark.parametrize("starts_at, cancelled", [
    (NOW, False),
    (NOW - timedelta(days=1), False),
    (TOMORROW_10AM, True),
], ids=["starting now", "expired", "cancelled"])
def test_an_expired_or_cancelled_session_is_a_conflict(client, db, starts_at, cancelled):
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM + timedelta(days=1))
    chosen = add_session(db, opp, starts_at, cancelled=cancelled)

    assert conflict(client, submission(opp, chosen)) == SESSION_UNAVAILABLE
    assert applications(db) == []


def test_a_session_from_another_opportunity_is_a_conflict(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM)
    other = add_opportunity(db, Title="Boxing")
    elsewhere = add_session(db, other, TOMORROW_10AM)

    assert conflict(client, submission(opp, elsewhere)) == SESSION_UNAVAILABLE
    assert conflict(client, submission(opp, "999999")) == SESSION_UNAVAILABLE
    assert applications(db) == []


@pytest.mark.parametrize("publishing_status", ["Draft", "Closed"])
def test_a_non_live_opportunity_is_a_conflict(client, db, publishing_status):
    opp = add_opportunity(db, PublishingStatus=publishing_status)
    session = add_session(db, opp, TOMORROW_10AM)

    assert conflict(client, submission(opp, session)) == (
        "This opportunity is no longer accepting registrations."
    )
    assert conflict(client, submission("999999", session)) == (
        "This opportunity is no longer accepting registrations."
    )
    assert applications(db) == []


def test_resending_a_submission_key_returns_the_original_application(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=1)
    first = client.post("/api/applications", json=submission(opp, session))
    # Even after the Session fills, a retry of the same submission isn't a conflict.
    db.cursor().execute("UPDATE Application SET Status = 'Accepted'")
    db.commit()

    # A resent key returns the original even if the resent fields differ or are invalid.
    retry = client.post("/api/applications", json=submission(opp, session, fullName="", email="x"))

    assert retry.status_code == 200
    assert retry.json() == first.json()
    [row] = applications(db)
    assert row["FullName"] == "Jamie Tan"


def test_the_same_person_can_apply_again_with_a_new_submission_key(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    other_session = add_session(db, opp, TOMORROW_10AM + timedelta(days=1))

    ids = [
        client.post("/api/applications", json=submission(opp, chosen, submissionKey=key)).json()["id"]
        for chosen, key in [(session, "key-1"), (session, "key-2"), (other_session, "key-3")]
    ]

    assert len(set(ids)) == 3
    assert [row["CurrentSessionID"] for row in applications(db)] == [session, session, other_session]


def validation_errors(client, body):
    response = client.post("/api/applications", json=body)
    assert response.status_code == 422
    return response.json()["errors"]


def test_missing_required_fields_are_reported_per_field(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    body = submission(opp, session, fullName="  ", instagram="", email="", phone="")
    del body["submissionKey"]

    assert validation_errors(client, body) == {
        "fullName": "Full name is required",
        "instagram": "Instagram handle is required",
        "email": "Email address is required",
        "phone": "Mobile number is required",
        "submissionKey": "Submission key is required",
    }
    assert applications(db) == []


def test_malformed_fields_are_reported_per_field(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    body = submission(
        opp, session,
        instagram="@jamie.moves", tiktok="jamie moves", email="jamie@example", phone="12-34",
    )

    assert validation_errors(client, body) == {
        "instagram": "Enter your handle without the @",
        "tiktok": "Handles cannot contain spaces",
        "email": "Please enter a valid email address",
        "phone": "Please enter a valid mobile number",
    }
    assert validation_errors(client, submission(opp, "", fullName="x" * 256, note="x" * 5001)) == {
        "sessionId": "Please choose a session",
        "fullName": "Full name must be 255 characters or fewer",
        "note": "Note must be 5000 characters or fewer",
    }
    assert validation_errors(client, submission(3.5, session, phone=91234567, tiktok=None)) == {
        "opportunityId": "Unknown opportunity",
        "phone": "Mobile number is required",
    }
    assert applications(db) == []


def test_values_are_stored_trimmed_and_optional_fields_may_be_omitted(client, db):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    body = submission(opp, session, fullName="  Jamie Tan ", email=" jamie@example.com ")
    del body["tiktok"], body["note"]

    assert client.post("/api/applications", json=body).status_code == 201

    [row] = applications(db)
    assert (row["FullName"], row["EmailAddress"]) == ("Jamie Tan", "jamie@example.com")
    assert (row["TikTokHandle"], row["CreatorNote"]) == (None, None)
