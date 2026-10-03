"""Publishing rules: Draft → Live → Closed and Closed → Live again, the check-only
save the confirmation pop-ups run first, and Delete Draft (Admin ticket 09)."""

from datetime import datetime

import pytest

from tests.factories import add_application, add_deliverable, add_info, add_opportunity, add_schedule, add_session
from tests.test_admin_save_opportunity import EMPTY_FORM, FILLED_FORM, create, editing, form_of, save

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)  # a Wednesday
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)

LIVE_TO_DRAFT = "A Live opportunity can't go back to Draft"
CLOSED_TO_DRAFT = "A Closed opportunity can only be reopened to Live"
DRAFT_TO_CLOSED = "A Draft has to go Live before it can be closed"
NEW_AS_CLOSED = "A new opportunity can only be saved as Draft or Live"
CANT_DELETE = "Only a Draft that has never been Live or had an application can be deleted. Close it instead."


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def ready(db, **columns):
    """An Opportunity that passes the Live checks: a deliverable and a future Session."""
    opp = add_opportunity(db, **columns)
    add_deliverable(db, opp, "1 × Reel")
    add_session(db, opp, TOMORROW_10AM)
    return opp


def row(client, opportunity_id):
    rows = client.get("/api/admin/opportunities").json()["opportunities"]
    return next((r for r in rows if r["id"] == str(opportunity_id)), None)


def discover_ids(client):
    return [card["id"] for card in client.get("/api/opportunities").json()]


def resave_as(client, opportunity_id, status, *, check=False):
    loaded = editing(client, opportunity_id)
    path = f"/api/admin/opportunities/{opportunity_id}" + ("?check=true" if check else "")
    return client.put(path, json={**form_of(loaded), "publishingStatus": status, "version": loaded["version"]})


# Allowed moves


@pytest.mark.parametrize("current, new, message", [
    ("Live", "Draft", LIVE_TO_DRAFT),
    ("Closed", "Draft", CLOSED_TO_DRAFT),
    ("Draft", "Closed", DRAFT_TO_CLOSED),
])
def test_a_move_the_publishing_rules_dont_allow_is_refused_and_changes_nothing(
        client, db, signed_in, current, new, message):
    opp = ready(db, PublishingStatus=current)
    before = editing(client, opp)

    response = resave_as(client, opp, new)

    assert response.status_code == 422
    assert response.json()["errors"] == {"publishingStatus": message}
    assert editing(client, opp) == before


@pytest.mark.parametrize("current, new", [
    ("Draft", "Draft"), ("Draft", "Live"),
    ("Live", "Live"), ("Live", "Closed"),
    ("Closed", "Closed"), ("Closed", "Live"),
])
def test_every_allowed_move_saves(client, db, signed_in, current, new):
    opp = ready(db, PublishingStatus=current)

    response = resave_as(client, opp, new)

    assert response.status_code == 200, response.json()
    assert response.json()["publishingStatus"] == new


def test_a_refused_move_is_listed_with_the_other_errors(client, db, signed_in):
    opp = ready(db, PublishingStatus="Live")
    loaded = editing(client, opp)

    response = save(client, opp, {**form_of(loaded), "title": "x" * 300, "publishingStatus": "Draft",
                                  "version": loaded["version"]})

    assert response.json()["errors"] == {
        "title": "Title must be 255 characters or fewer",
        "publishingStatus": LIVE_TO_DRAFT,
    }


def test_a_new_opportunity_can_be_saved_as_draft_or_live_but_not_closed(client, db, signed_in):
    assert create(client, EMPTY_FORM).status_code == 201
    assert create(client, {**FILLED_FORM, "publishingStatus": "Live"}).status_code == 201

    response = create(client, {**EMPTY_FORM, "publishingStatus": "Closed"})

    assert response.status_code == 422
    assert response.json()["errors"] == {"publishingStatus": NEW_AS_CLOSED}
    assert len(client.get("/api/admin/opportunities").json()["opportunities"]) == 2


# Reopen Opportunity: the menu's Publish on a Closed Opportunity


def test_reopening_a_closed_opportunity_makes_it_live_on_discover(client, db, signed_in):
    opp = ready(db, PublishingStatus="Closed")

    response = client.post(f"/api/admin/opportunities/{opp}/publish")

    assert response.status_code == 200
    assert response.json()["publishingStatus"] == "Live"
    assert discover_ids(client) == [str(opp)]


def test_reopening_runs_the_live_checks_and_a_failing_one_keeps_it_closed(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Closed", AreaNeighbourhood="")
    add_deliverable(db, opp, "1 × Reel")
    add_session(db, opp, datetime(2026, 9, 22, 10, 0))  # yesterday

    response = client.post(f"/api/admin/opportunities/{opp}/publish")

    assert response.status_code == 422
    assert response.json()["errors"] == {
        "sessions": "Add at least one future session",
        "area": "Area / neighbourhood is required",
    }
    assert row(client, opp)["publishingStatus"] == "Closed"


def test_reopening_as_draft_is_gone(client, db, signed_in):
    opp = ready(db, PublishingStatus="Closed")

    assert client.post(f"/api/admin/opportunities/{opp}/reopen").status_code == 404
    assert row(client, opp)["publishingStatus"] == "Closed"


# The check-only save the pop-ups run before asking


def test_a_check_only_save_that_passes_stores_nothing(client, db, signed_in):
    opp = ready(db, PublishingStatus="Draft")
    before = editing(client, opp)

    response = resave_as(client, opp, "Live", check=True)

    assert response.status_code == 204
    assert response.content == b""
    assert editing(client, opp) == before
    assert discover_ids(client) == []


def test_a_check_only_save_returns_the_live_checks_errors(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Draft", AreaNeighbourhood="")

    response = resave_as(client, opp, "Live", check=True)

    assert response.status_code == 422
    assert response.json()["errors"] == {
        "deliverables": "Add at least one deliverable",
        "sessions": "Add at least one future session",
        "area": "Area / neighbourhood is required",
    }


def test_a_check_only_save_refuses_a_stale_version(client, db, signed_in):
    opp = ready(db, PublishingStatus="Draft")
    loaded = editing(client, opp)
    assert resave_as(client, opp, "Draft").status_code == 200

    response = client.put(f"/api/admin/opportunities/{opp}?check=true",
                          json={**form_of(loaded), "publishingStatus": "Live", "version": loaded["version"]})

    assert response.status_code == 409


def test_a_check_only_create_stores_nothing(client, db, signed_in):
    passing = client.post("/api/admin/opportunities?check=true", json={**FILLED_FORM, "publishingStatus": "Live"})
    failing = client.post("/api/admin/opportunities?check=true", json={**EMPTY_FORM, "publishingStatus": "Live"})

    assert passing.status_code == 204
    assert failing.status_code == 422
    assert failing.json()["errors"]["title"] == "Opportunity title is required"
    assert client.get("/api/admin/opportunities").json()["opportunities"] == []


def test_a_check_only_reopen_stores_nothing(client, db, signed_in):
    opp = ready(db, PublishingStatus="Closed")
    before = editing(client, opp)

    response = client.post(f"/api/admin/opportunities/{opp}/publish?check=true")

    assert response.status_code == 204
    assert editing(client, opp) == before


def test_a_check_only_save_doesnt_generate_a_recurring_schedules_sessions(client, db, signed_in):
    weekly = {"days": ["Sat"], "start": "20:00", "end": "21:00", "startDate": "2026-09-26",
              "endDate": "2026-10-31", "slots": "3"}
    form = {**FILLED_FORM, "scheduleType": "recurring", "recurring": weekly, "sessions": [],
            "publishingStatus": "Live"}

    assert client.post("/api/admin/opportunities?check=true", json=form).status_code == 204

    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor()
    cursor.execute("SELECT COUNT(*) FROM Session")
    assert cursor.fetchone()[0] == 0


# Delete Draft


def test_deleting_a_never_published_draft_removes_it_with_everything_it_has(client, db, signed_in):
    opp = ready(db, PublishingStatus="Draft")
    add_schedule(db, opp, datetime(2026, 9, 26, 20, 0))
    add_info(db, opp, "Equipment", "Shoes provided")
    kept = ready(db, PublishingStatus="Draft")

    response = client.delete(f"/api/admin/opportunities/{opp}")

    assert response.status_code == 204
    assert client.get(f"/api/admin/opportunities/{opp}").status_code == 404
    assert [r["id"] for r in client.get("/api/admin/opportunities").json()["opportunities"]] == [str(kept)]
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor()
    for table in ("Session", "RecurringSchedule", "DeliverableItems", "AdditionalInformation"):
        cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE OpportunityID = %s", (opp,))
        assert cursor.fetchone()[0] == 0, table


@pytest.mark.parametrize("columns, application", [
    ({"PublishingStatus": "Draft", "PublishedAt": datetime(2026, 9, 1, 9, 0)}, None),
    ({"PublishingStatus": "Draft"}, "Declined"),
    ({"PublishingStatus": "Live"}, None),
    ({"PublishingStatus": "Closed"}, None),
])
def test_anything_but_a_never_published_draft_without_applications_cant_be_deleted(
        client, db, signed_in, columns, application):
    opp = add_opportunity(db, **columns)
    session = add_session(db, opp, TOMORROW_10AM)
    if application:
        add_application(db, opp, session, status=application)

    response = client.delete(f"/api/admin/opportunities/{opp}")

    assert response.status_code == 409
    assert response.json()["detail"] == CANT_DELETE
    assert client.get(f"/api/admin/opportunities/{opp}").status_code == 200


def test_deleting_an_unknown_opportunity_is_not_found(client, db, signed_in):
    assert client.delete("/api/admin/opportunities/999").status_code == 404
    assert client.delete("/api/admin/opportunities/abc").status_code == 404


def test_deleting_needs_a_signed_in_admin(client, db):
    opp = add_opportunity(db, PublishingStatus="Draft")

    assert client.delete(f"/api/admin/opportunities/{opp}").status_code == 401


def test_list_rows_say_whether_a_draft_can_be_deleted(client, db, signed_in):
    deletable = add_opportunity(db, PublishingStatus="Draft")
    was_live = add_opportunity(db, PublishingStatus="Draft", PublishedAt=datetime(2026, 9, 1, 9, 0))
    applied = add_opportunity(db, PublishingStatus="Draft")
    add_application(db, applied, add_session(db, applied, TOMORROW_10AM))
    live = add_opportunity(db, PublishingStatus="Live")

    can_delete = {r["id"]: r["canDelete"] for r in client.get("/api/admin/opportunities").json()["opportunities"]}

    assert can_delete == {str(deletable): True, str(was_live): False, str(applied): False, str(live): False}
