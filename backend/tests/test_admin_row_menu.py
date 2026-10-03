"""The Opportunities list's row-menu actions: publish, close, duplicate, and
previewing a Draft (Admin ticket 08). Reopening and Delete Draft are in
test_admin_publishing_rules (Admin ticket 09)."""

from datetime import datetime, timedelta

import pytest

from tests.admin_api import admin_row, discover_ids, editing
from tests.factories import (
    NOW, PAID, TOMORROW_10AM, add_application, add_deliverable, add_info, add_opportunity, add_ready_opportunity,
    add_schedule, add_session,
)


pytestmark = pytest.mark.usefixtures("frozen_now")


def act(client, opportunity_id, action):
    return client.post(f"/api/admin/opportunities/{opportunity_id}/{action}")


def ready_draft(db, **columns):
    """A Draft that passes the Live checks, with a future Session."""
    return add_ready_opportunity(db, session_at=TOMORROW_10AM, **{"PublishingStatus": "Draft", **columns})


def apply(client, opportunity_id, session_id, key):
    return client.post("/api/applications", json={
        "opportunityId": str(opportunity_id), "sessionId": str(session_id), "fullName": "Jamie Tan",
        "instagram": "jamie.moves", "email": "jamie@example.com", "phone": "+65 9123 4567",
        "submissionKey": f"3f1c2d7e-0000-4000-8000-00000000000{key}",
    })


@pytest.mark.parametrize("action", ["publish", "close", "duplicate"])
def test_row_menu_actions_need_a_signed_in_admin(client, db, action):
    opp = add_opportunity(db)

    assert act(client, opp, action).status_code == 401


@pytest.mark.parametrize("action", ["publish", "close", "duplicate"])
def test_row_menu_actions_on_an_unknown_opportunity_are_not_found(client, db, signed_in, action):
    assert act(client, 999, action).status_code == 404
    assert act(client, "abc", action).status_code == 404


def test_publish_makes_a_ready_draft_live_on_discover(client, db, signed_in):
    opp = ready_draft(db, UpdatedAt=datetime(2026, 9, 20, 9, 0))

    response = act(client, opp, "publish")

    assert response.status_code == 200
    assert response.json()["publishingStatus"] == "Live"
    assert discover_ids(client) == [str(opp)]
    assert admin_row(client, opp)["lastUpdated"] == "2026-09-23"


def test_publish_refuses_a_draft_that_fails_the_live_checks_and_it_stays_a_draft(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Draft", AreaNeighbourhood="")

    response = act(client, opp, "publish")

    assert response.status_code == 422
    assert response.json()["errors"] == {
        "deliverables": "Add at least one deliverable",
        "sessions": "Add at least one future session",
        "area": "Area / neighbourhood is required",
    }
    assert admin_row(client, opp)["publishingStatus"] == "Draft"
    assert discover_ids(client) == []


def test_close_takes_it_off_discover_and_keeps_its_sessions_and_applications(client, db, signed_in):
    opp = add_opportunity(db)
    accepted_session = add_session(db, opp, TOMORROW_10AM)
    other_session = add_session(db, opp, TOMORROW_10AM + timedelta(days=1))
    add_application(db, opp, accepted_session, status="Accepted")
    add_application(db, opp, other_session, status="Reviewing")
    sessions_before = editing(client, opp)["sessions"]

    response = act(client, opp, "close")

    assert response.status_code == 200
    assert response.json()["publishingStatus"] == "Closed"
    assert discover_ids(client) == []
    assert admin_row(client, opp)["applicationsCount"] == 2
    assert editing(client, opp)["sessions"] == sessions_before
    statuses = [a["status"] for a in client.get("/api/admin/applications").json()["applications"]]
    assert sorted(statuses) == ["Accepted", "Reviewing"]


def test_close_stops_new_applications_at_once(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    assert apply(client, opp, session, 1).status_code == 201

    act(client, opp, "close")

    response = apply(client, opp, session, 2)
    assert response.status_code == 409
    assert response.json()["detail"] == "This opportunity is no longer accepting registrations."


@pytest.mark.parametrize("action, status", [
    ("publish", "Live"),
    ("close", "Draft"), ("close", "Closed"),
])
def test_an_action_for_another_status_is_refused_and_changes_nothing(client, db, signed_in, action, status):
    """E.g. another Admin changed it since the list was loaded."""
    opp = ready_draft(db, PublishingStatus=status)

    response = act(client, opp, action)

    assert response.status_code == 409
    assert response.json()["detail"] == (
        f"This opportunity is {status} now. Reload the page to see its current status."
    )
    assert admin_row(client, opp)["publishingStatus"] == status


def test_close_moves_the_version_on_so_an_open_edit_page_cant_overwrite_it(client, db, signed_in):
    opp = add_opportunity(db)
    add_deliverable(db, opp, "1 × Reel")
    add_session(db, opp, TOMORROW_10AM)
    loaded = editing(client, opp)

    act(client, opp, "close")

    form = {key: value for key, value in loaded.items() if key != "id"}
    response = client.put(f"/api/admin/opportunities/{opp}", json=form)
    assert response.status_code == 409
    assert admin_row(client, opp)["publishingStatus"] == "Closed"


def test_duplicate_creates_a_draft_with_the_same_fields_and_no_sessions_or_applications(client, db, signed_in):
    opp = add_opportunity(db, PAID, Subcategory="Activewear", DeliverableNote="Agreed later",
                          ExperienceSkillLevel="Advanced")
    add_deliverable(db, opp, "1 × Reel")
    add_deliverable(db, opp, "3 × Stories")
    add_info(db, opp, "Equipment", "Shoes provided")
    session = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, session, status="Accepted")
    original = editing(client, opp)

    response = act(client, opp, "duplicate")

    assert response.status_code == 201
    copy = response.json()
    assert copy["id"] != str(opp)
    assert copy["publishingStatus"] == "Draft"
    assert copy["sessions"] == []
    assert copy["recurring"] is None
    same = ("id", "version", "sessions", "publishingStatus")
    assert {k: v for k, v in copy.items() if k not in same} == {k: v for k, v in original.items() if k not in same}
    assert admin_row(client, copy["id"])["applicationsCount"] == 0
    assert admin_row(client, copy["id"])["schedule"] is None
    assert client.get(f"/api/opportunities/{copy['id']}").json()["payment"]["basis"] == "Flat fee"
    assert discover_ids(client) == [str(opp)]


def test_duplicate_keeps_the_recurring_schedule_and_generates_its_sessions(client, db, signed_in):
    opp = add_opportunity(db)
    add_deliverable(db, opp, "1 × Reel")
    first = datetime(2026, 9, 26, 20, 0)  # a Saturday
    schedule = add_schedule(db, opp, first, slots=4, until=first.date() + timedelta(weeks=1), days="Tue,Sat")
    for starts_at in (first, datetime(2026, 9, 29, 20, 0), first + timedelta(weeks=1)):
        add_session(db, opp, starts_at, slots=4, recurrence_id=schedule)
    add_session(db, opp, TOMORROW_10AM)  # one-off

    copy = act(client, opp, "duplicate").json()

    assert copy["recurring"] == {"days": ["Tue", "Sat"], "start": "20:00", "end": "21:00",
                                 "startDate": "2026-09-26", "endDate": "2026-10-03", "slots": 4}
    assert copy["sessions"] == []
    assert act(client, copy["id"], "publish").status_code == 200
    detail = client.get(f"/api/opportunities/{copy['id']}").json()
    assert detail["sessions"] == []
    [weekly] = detail["weeklyClasses"]
    assert [s["date"] for s in weekly["sessions"]] == ["2026-09-26", "2026-09-29", "2026-10-03"]


def test_duplicate_stamps_new_timestamps_and_lists_the_copy_last(client, db, signed_in, at):
    opp = add_opportunity(db, UpdatedAt=datetime(2026, 9, 1, 9, 0), PublishedAt=datetime(2026, 9, 1, 9, 0))
    at(NOW + timedelta(days=2))

    copy = act(client, opp, "duplicate").json()

    rows = client.get("/api/admin/opportunities").json()["opportunities"]
    assert [r["id"] for r in rows] == [str(opp), copy["id"]]
    assert rows[1]["lastUpdated"] == "2026-09-25"
    assert rows[0]["lastUpdated"] == "2026-09-01"


def test_a_signed_in_admin_can_preview_a_draft_but_not_register_for_it(client, db, signed_in):
    opp = ready_draft(db)
    [session] = editing(client, opp)["sessions"]

    response = client.get(f"/api/opportunities/{opp}")

    assert response.status_code == 200
    detail = response.json()
    assert (detail["title"], detail["availability"]) == ("Tennis Group Class", "draft")
    assert [s["id"] for s in detail["sessions"]] == [session["id"]]
    assert discover_ids(client) == []
    refused = apply(client, opp, session["id"], 1)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "This opportunity is no longer accepting registrations."


def test_a_draft_is_not_found_for_a_signed_out_visitor(client, db):
    opp = ready_draft(db)

    assert client.get(f"/api/opportunities/{opp}").status_code == 404
