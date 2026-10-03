"""Adding, changing and removing an existing Opportunity's one-off Sessions from
the Admin form (Admin ticket 06)."""

from datetime import datetime, timedelta

import pytest

from tests.factories import add_application, add_deliverable, add_opportunity, add_schedule, add_session
from tests.test_admin_save_opportunity import EMPTY_FORM, create, editing, form_of, save

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)  # a Wednesday
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def live_opportunity(db):
    """A Live Opportunity that passes the Live checks, with no Sessions yet."""
    opp = add_opportunity(db)
    add_deliverable(db, opp, "1 × Reel")
    return opp


def row(starts_at: datetime, *, hours=1, slots="3", session_id=None):
    """A Session row as the form sends it."""
    sent = {"date": starts_at.date().isoformat(), "start": starts_at.strftime("%H:%M"),
            "end": (starts_at + timedelta(hours=hours)).strftime("%H:%M"), "slots": slots}
    return sent if session_id is None else {"id": str(session_id), **sent}


def save_sessions(client, loaded, sessions, **changes):
    """Save `loaded` (as the edit page loaded it) with these Session rows."""
    return save(client, loaded["id"], {**form_of(loaded), "sessions": sessions, **changes,
                                       "version": loaded["version"]})


def saved_sessions(client, loaded, sessions, **changes):
    response = save_sessions(client, loaded, sessions, **changes)
    assert response.status_code == 200, response.json()
    return response.json()


def stored_session(db, session_id):
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Session WHERE SessionID = %s", (session_id,))
    return cursor.fetchone()


def detail_sessions(client, opportunity_id):
    return [(s["date"], s["start"], s["status"])
            for s in client.get(f"/api/opportunities/{opportunity_id}").json()["sessions"]]


def discover_ids(client):
    return [card["id"] for card in client.get("/api/opportunities").json()]


def test_adding_changing_and_removing_sessions_on_a_live_opportunity_reaches_discover_and_detail(
        client, db, signed_in):
    opp = live_opportunity(db)
    moved = add_session(db, opp, TOMORROW_10AM)
    removed = add_session(db, opp, TOMORROW_10AM + timedelta(days=1))
    loaded = editing(client, opp)

    resaved = saved_sessions(client, loaded, [
        row(datetime(2026, 9, 26, 9, 0), slots="5", session_id=moved),
        row(datetime(2026, 9, 28, 18, 0)),
    ], publishingStatus="Live")

    assert [(s["date"], s["start"], s["slots"]) for s in resaved["sessions"]] == [
        ("2026-09-26", "09:00", 5), ("2026-09-28", "18:00", 3),
    ]
    assert resaved["sessions"][0]["id"] == str(moved)
    assert stored_session(db, removed) is None  # it had no Applications
    assert detail_sessions(client, opp) == [("2026-09-26", "09:00", "available"),
                                            ("2026-09-28", "18:00", "available")]
    [card] = client.get("/api/opportunities").json()
    assert card["nextSession"]["date"] == "2026-09-26"


def test_removing_a_session_with_applications_cancels_it_and_keeps_them(client, db, signed_in):
    opp = live_opportunity(db)
    kept = add_session(db, opp, TOMORROW_10AM)
    applied = add_session(db, opp, TOMORROW_10AM + timedelta(days=1))
    add_application(db, opp, applied, status="Declined")
    loaded = editing(client, opp)

    resaved = saved_sessions(client, loaded, [row(TOMORROW_10AM, slots="3", session_id=kept)])

    # Listed again greyed out, so it can be reopened (Admin ticket 12).
    assert [(s["id"], s["cancelled"]) for s in resaved["sessions"]] == [(str(kept), False), (str(applied), True)]
    assert stored_session(db, applied)["IsCancelled"]
    [application] = client.get("/api/admin/applications").json()["applications"]
    assert application["status"] == "Declined"
    assert detail_sessions(client, opp) == [("2026-09-24", "10:00", "available")]


def test_slots_below_the_accepted_count_are_refused_on_the_right_row(client, db, signed_in):
    opp = live_opportunity(db)
    first = add_session(db, opp, TOMORROW_10AM)
    full = add_session(db, opp, TOMORROW_10AM + timedelta(days=1), slots=3)
    add_application(db, opp, full, status="Accepted")
    add_application(db, opp, full, status="Accepted")
    add_application(db, opp, full, status="Reviewing")  # only Accepted ones count
    loaded = editing(client, opp)

    refused = save_sessions(client, loaded, [row(TOMORROW_10AM, slots="3", session_id=first),
                                             row(TOMORROW_10AM + timedelta(days=1), slots="1", session_id=full)])
    assert stored_session(db, full)["CreatorSlots"] == 3
    lowered = save_sessions(client, loaded, [row(TOMORROW_10AM, slots="3", session_id=first),
                                             row(TOMORROW_10AM + timedelta(days=1), slots="2", session_id=full)])

    assert refused.status_code == 422
    assert refused.json()["errors"] == {
        "sessions.1.slots": "Creator Slots can't be lower than the 2 creators already accepted",
    }
    assert lowered.status_code == 200, lowered.json()
    assert stored_session(db, full)["CreatorSlots"] == 2


def test_raising_the_slots_of_a_filled_session_makes_it_available_again(client, db, signed_in):
    opp = live_opportunity(db)
    full = add_session(db, opp, TOMORROW_10AM, slots=2)
    add_application(db, opp, full, status="Accepted")
    add_application(db, opp, full, status="Accepted")
    assert discover_ids(client) == []  # Fully Booked
    loaded = editing(client, opp)

    saved_sessions(client, loaded, [row(TOMORROW_10AM, slots="3", session_id=full)])

    [session] = client.get(f"/api/opportunities/{opp}").json()["sessions"]
    assert (session["status"], session["slotsLeft"]) == ("available", 1)
    assert discover_ids(client) == [str(opp)]


def test_adding_a_session_to_a_live_opportunity_with_none_left_puts_it_back_on_discover(client, db, signed_in):
    opp = live_opportunity(db)
    past = add_session(db, opp, NOW - timedelta(days=1))
    assert discover_ids(client) == []
    loaded = editing(client, opp)
    assert loaded["sessions"] == []

    saved_sessions(client, loaded, [row(TOMORROW_10AM)], publishingStatus="Live")

    assert discover_ids(client) == [str(opp)]
    assert stored_session(db, past) is not None


def test_an_exact_duplicate_session_is_refused_and_an_overlapping_one_is_accepted(client, db, signed_in):
    opp = live_opportunity(db)
    existing = add_session(db, opp, TOMORROW_10AM)
    loaded = editing(client, opp)

    duplicate = save_sessions(client, loaded, [row(TOMORROW_10AM, session_id=existing), row(TOMORROW_10AM)])
    overlapping = save_sessions(client, loaded, [
        row(TOMORROW_10AM, session_id=existing),
        row(TOMORROW_10AM + timedelta(minutes=30)),  # starts during it
        row(TOMORROW_10AM, hours=2),  # same start, later end
    ])

    assert duplicate.status_code == 422
    assert duplicate.json()["errors"] == {"sessions.1.date": "Session 1 already has this date and time"}
    assert overlapping.status_code == 200, overlapping.json()
    assert len(overlapping.json()["sessions"]) == 3


def test_a_new_opportunitys_duplicate_session_is_refused(client, db, signed_in):
    sessions = [row(TOMORROW_10AM), row(TOMORROW_10AM + timedelta(days=1)), row(TOMORROW_10AM)]

    response = create(client, {**EMPTY_FORM, "sessions": sessions})

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions.2.date": "Session 1 already has this date and time"}


def test_a_session_can_t_duplicate_one_of_the_weekly_classes(client, db, signed_in):
    opp = live_opportunity(db)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0))
    add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)
    loaded = editing(client, opp)

    response = save_sessions(client, loaded, [row(datetime(2026, 9, 26, 20, 0))])

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions.0.date": "The weekly class already has this date and time"}


def test_a_cancelled_sessions_time_can_be_used_again(client, db, signed_in):
    opp = live_opportunity(db)
    add_session(db, opp, TOMORROW_10AM, cancelled=True)
    loaded = editing(client, opp)

    resaved = saved_sessions(client, loaded, [row(TOMORROW_10AM)])

    assert [(s["date"], s["cancelled"]) for s in resaved["sessions"]] == [("2026-09-24", True), ("2026-09-24", False)]


def test_a_session_that_has_started_since_the_page_loaded_is_never_changed_by_a_save(client, db, signed_in, at):
    opp = live_opportunity(db)
    starting = add_session(db, opp, NOW + timedelta(hours=1))
    later = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, starting, status="Accepted")
    loaded = editing(client, opp)
    at(NOW + timedelta(hours=2))

    unchanged = save_sessions(client, loaded, loaded["sessions"])
    changed = save_sessions(client, unchanged.json(), [
        {**loaded["sessions"][0], "slots": "5"}, *unchanged.json()["sessions"],
    ])
    removed = save_sessions(client, unchanged.json(), unchanged.json()["sessions"])

    assert unchanged.status_code == 200, unchanged.json()
    assert [s["id"] for s in unchanged.json()["sessions"]] == [str(later)]  # no longer editable
    assert changed.status_code == 422
    assert changed.json()["errors"] == {"sessions.0.date": "This session has already started, so it can't be changed"}
    assert removed.status_code == 200, removed.json()
    session = stored_session(db, starting)
    assert (session["CreatorSlots"], session["IsCancelled"]) == (3, 0)


def test_a_past_session_is_never_returned_for_editing_or_changed_by_a_save(client, db, signed_in):
    opp = live_opportunity(db)
    past = add_session(db, opp, NOW - timedelta(days=1))
    loaded = editing(client, opp)

    response = save_sessions(client, loaded, [row(NOW - timedelta(days=1), slots="9", session_id=past), row(TOMORROW_10AM)])

    assert loaded["sessions"] == []
    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions.0.date": "This session has already started, so it can't be changed"}
    assert stored_session(db, past)["CreatorSlots"] == 3


def test_a_session_can_t_be_moved_into_the_past_or_added_there(client, db, signed_in):
    opp = live_opportunity(db)
    accepted = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, accepted, status="Accepted")
    loaded = editing(client, opp)

    response = save_sessions(client, loaded, [
        row(NOW - timedelta(days=1), session_id=accepted),
        row(TOMORROW_10AM + timedelta(days=1)),
        row(NOW),  # starting now
    ])

    assert response.status_code == 422
    assert response.json()["errors"] == {
        "sessions.0.date": "Choose a date and time in the future",
        "sessions.2.date": "Choose a date and time in the future",
    }
    assert stored_session(db, accepted)["SessionDate"] == TOMORROW_10AM.date()


def test_the_same_session_listed_twice_is_refused(client, db, signed_in):
    opp = live_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    loaded = editing(client, opp)

    response = save_sessions(client, loaded, [row(TOMORROW_10AM, session_id=session),
                                              row(TOMORROW_10AM + timedelta(days=1), session_id=session)])

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions.1.date": "This session is already listed as Session 1"}


def test_a_session_from_another_opportunity_can_t_be_edited(client, db, signed_in):
    opp = live_opportunity(db)
    other = add_session(db, live_opportunity(db), TOMORROW_10AM)
    loaded = editing(client, opp)

    response = save_sessions(client, loaded, [row(TOMORROW_10AM, slots="9", session_id=other)], publishingStatus="Closed")

    assert response.status_code == 422
    assert response.json()["errors"] == {
        "sessions.0.date": "This session no longer exists. Reload the page to see the current sessions.",
    }
    assert stored_session(db, other)["CreatorSlots"] == 3


def test_publishing_counts_the_sessions_the_form_keeps(client, db, signed_in):
    opp = live_opportunity(db)
    only = add_session(db, opp, TOMORROW_10AM)
    loaded = editing(client, opp)

    response = save_sessions(client, loaded, [], publishingStatus="Live")

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions": "Add at least one future session"}
    assert stored_session(db, only) is not None


def test_the_one_off_sessions_of_an_opportunity_with_weekly_classes_are_edited_too(client, db, signed_in):
    opp = live_opportunity(db)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0))
    weekly = add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)
    tuesday = add_session(db, opp, datetime(2026, 9, 29, 20, 0))
    loaded = editing(client, opp)
    assert loaded["scheduleType"] == "recurring"

    resaved = saved_sessions(client, loaded, [row(datetime(2026, 9, 30, 20, 0), session_id=tuesday)])

    assert [(s["id"], s["date"]) for s in resaved["sessions"]] == [(str(tuesday), "2026-09-30")]
    assert stored_session(db, weekly) is not None
