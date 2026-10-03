"""Publishing and editing Live Opportunities from the Admin form (Admin ticket 05)."""

import json
from datetime import timedelta

import pytest

from tests.admin_api import (
    EMPTY_FORM, FILLED_FORM, create, created, discover_ids, editing, form_of, resaved, save,
)
from tests.factories import NOW, TOMORROW_10AM, add_application, add_deliverable, add_opportunity, add_session


pytestmark = pytest.mark.usefixtures("frozen_now")


def published_at(db, opportunity_id):
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor()
    cursor.execute("SELECT PublishedAt FROM Opportunity WHERE OpportunityID = %s", (opportunity_id,))
    return cursor.fetchone()[0]


def snapshot(db):
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor()
    cursor.execute("SELECT SubmissionSnapshot FROM Application")
    [(stored,)] = cursor.fetchall()
    return json.loads(stored)


def test_publishing_an_empty_form_is_refused_with_every_missing_field(client, db, signed_in):
    response = create(client, {**EMPTY_FORM, "publishingStatus": "Live"})

    assert response.status_code == 422
    assert response.json()["errors"] == {
        "title": "Opportunity title is required",
        "partner": "Partner / brand name is required",
        "heroImage": "Add a cover image",
        "aboutExperience": "About the experience is required",
        "whatCreatorReceives": "Specify what the creator receives",
        "deliverables": "Add at least one deliverable",
        "sessions": "Add at least one future session",
        "area": "Area / neighbourhood is required",
    }
    assert client.get("/api/admin/opportunities").json()["opportunities"] == []


def test_a_paid_opportunity_needs_its_payment_amount_to_publish(client, db, signed_in):
    form = {**FILLED_FORM, "compensationType": "Paid", "paymentAmount": "  ", "publishingStatus": "Live"}

    response = create(client, form)

    assert response.status_code == 422
    assert response.json()["errors"] == {"paymentAmount": "Payment amount is required"}


@pytest.mark.parametrize("sessions, errors", [
    ([{"date": "2026-09-30", "start": "18:00", "end": "19:00", "slots": "3"},
      {"date": "2026-10-01", "start": "10:00", "end": "10:00", "slots": "3"}],
     {"sessions.1.end": "End time must be after the start time"}),
    ([{"date": "2026-09-22", "start": "10:00", "end": "11:00", "slots": "3"},  # yesterday
      {"date": "2026-09-23", "start": "12:00", "end": "13:00", "slots": "3"}],  # starting now
     {"sessions.0.date": "Choose a date and time in the future",
      "sessions.1.date": "Choose a date and time in the future",
      "sessions": "Add at least one future session"}),
])
def test_publishing_needs_sessions_that_end_after_they_start_and_one_in_the_future(
        client, db, signed_in, sessions, errors):
    response = create(client, {**FILLED_FORM, "publishingStatus": "Live", "sessions": sessions})

    assert response.status_code == 422
    assert response.json()["errors"] == errors


@pytest.mark.parametrize("recurring, errors", [
    ({"days": [], "start": "", "end": "", "startDate": "", "endDate": "", "slots": ""}, {
        "recurring.days": "Choose at least one day of the week",
        "recurring.start": "Enter a start time",
        "recurring.end": "Enter an end time",
        "recurring.startDate": "Enter a start date",
        "recurring.slots": "Enter Creator Slots per session",
    }),
    ({"days": ["Sat"], "start": "21:00", "end": "20:00", "startDate": "2026-09-26", "endDate": "2026-09-25",
      "slots": "3"}, {
        "recurring.end": "End time must be after the start time",
        "recurring.endDate": "End date can't be before the start date",
    }),
])
def test_publishing_needs_a_complete_recurring_schedule(client, db, signed_in, recurring, errors):
    form = {**FILLED_FORM, "publishingStatus": "Live", "scheduleType": "recurring", "recurring": recurring}

    response = create(client, form)

    assert response.status_code == 422
    assert response.json()["errors"] == errors


def test_a_draft_or_closed_save_skips_the_live_checks(client, db, signed_in):
    assert create(client, EMPTY_FORM).status_code == 201
    live = add_opportunity(db, AreaNeighbourhood="")  # no area, deliverable or Session
    loaded = editing(client, live)

    resaved(client, loaded, publishingStatus="Closed")


def test_publishing_a_new_opportunity_makes_it_live_on_discover_at_once(client, db, signed_in):
    saved = created(client, {**FILLED_FORM, "publishingStatus": "Live"})

    assert saved["publishingStatus"] == "Live"
    assert published_at(db, saved["id"]) == NOW
    assert discover_ids(client) == [saved["id"]]
    assert client.get(f"/api/opportunities/{saved['id']}").json()["title"] == "Bouldering Experience"


def test_publishing_a_draft_sets_published_at_only_the_first_time_it_goes_live(client, db, signed_in, at):
    draft = created(client, FILLED_FORM)
    assert published_at(db, draft["id"]) is None
    at(NOW + timedelta(hours=1))

    live = resaved(client, draft, publishingStatus="Live")
    at(NOW + timedelta(hours=2))
    closed = resaved(client, live, publishingStatus="Closed")
    resaved(client, closed, publishingStatus="Live")

    assert published_at(db, draft["id"]) == NOW + timedelta(hours=1)
    assert discover_ids(client) == [draft["id"]]


def test_publishing_an_incomplete_draft_is_refused_and_it_stays_a_draft(client, db, signed_in):
    draft = created(client, {**FILLED_FORM, "area": ""})

    response = save(client, draft["id"], {**form_of(draft), "publishingStatus": "Live", "version": draft["version"]})

    assert response.status_code == 422
    assert response.json()["errors"] == {"area": "Area / neighbourhood is required"}
    assert editing(client, draft["id"])["publishingStatus"] == "Draft"
    assert published_at(db, draft["id"]) is None
    assert discover_ids(client) == []


def test_an_existing_opportunity_publishes_with_its_stored_future_sessions(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Closed")
    add_deliverable(db, opp, "1 × Reel")
    add_session(db, opp, TOMORROW_10AM)
    loaded = editing(client, opp)

    resaved(client, loaded, publishingStatus="Live")

    assert discover_ids(client) == [str(opp)]


def test_reopening_an_opportunity_without_future_sessions_as_live_is_refused(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Closed")
    add_deliverable(db, opp, "1 × Reel")
    add_session(db, opp, NOW - timedelta(days=1))
    add_session(db, opp, TOMORROW_10AM, cancelled=True)
    loaded = editing(client, opp)

    response = save(client, opp, {**form_of(loaded), "publishingStatus": "Live", "version": loaded["version"]})

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions": "Add at least one future session"}
    assert editing(client, opp)["publishingStatus"] == "Closed"


def test_edits_to_a_live_opportunity_reach_the_creator_portal_without_changing_snapshots(client, db, signed_in):
    opp = add_opportunity(db)
    add_deliverable(db, opp, "1 × Reel")
    session = add_session(db, opp, TOMORROW_10AM)
    submitted = client.post("/api/applications", json={
        "opportunityId": str(opp), "sessionId": str(session), "fullName": "Jamie Tan",
        "instagram": "jamie.moves", "email": "jamie@example.com", "phone": "+65 9123 4567",
        "submissionKey": "3f1c2d7e-0000-4000-8000-000000000001",
    })
    assert submitted.status_code == 201
    snapshot_before = snapshot(db)
    loaded = editing(client, opp)

    resaved(client, loaded, title="Tennis for Two", whatCreatorReceives="Two classes", publishingStatus="Live")

    [card] = client.get("/api/opportunities").json()
    assert card["title"] == "Tennis for Two"
    detail = client.get(f"/api/opportunities/{opp}").json()
    assert (detail["title"], detail["whatCreatorReceives"]) == ("Tennis for Two", "Two classes")
    assert snapshot(db) == snapshot_before
    assert snapshot_before["opportunity"]["title"] == "Tennis Group Class"


def test_closing_takes_it_off_discover_and_keeps_its_sessions_and_applications(client, db, signed_in):
    status = "Closed"
    opp = add_opportunity(db)
    add_deliverable(db, opp, "1 × Reel")
    session = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, session, status="Accepted")
    loaded = editing(client, opp)

    resaved(client, loaded, publishingStatus=status)

    assert discover_ids(client) == []
    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert (row["publishingStatus"], row["applicationsCount"]) == (status, 1)
    assert editing(client, opp)["sessions"] == loaded["sessions"]
    [application] = client.get("/api/admin/applications").json()["applications"]
    assert application["status"] == "Accepted"
