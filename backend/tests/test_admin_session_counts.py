"""Per-Session counts on the edit page, cancelling and reopening Sessions, a
weekly class Session's own Creator Slots, and "No available sessions" on the
Opportunities list (Admin ticket 12)."""

from datetime import datetime, timedelta

import pytest

from tests.factories import add_application, add_deliverable, add_opportunity, add_session
from tests.test_admin_recurring_schedules import generated_session_id, stored_sessions, weekly_form
from tests.test_admin_save_opportunity import created, editing, form_of, save

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)  # a Wednesday
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)

# Saturdays 8-9pm up to 10 Oct: 26 Sep, 3 Oct and 10 Oct.
SATURDAYS = {"days": ["Sat"], "start": "20:00", "end": "21:00",
             "startDate": "2026-09-23", "endDate": "2026-10-10", "slots": "3"}


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def live_opportunity(db):
    """A Live Opportunity that passes the Live checks, with no Sessions yet."""
    opp = add_opportunity(db)
    add_deliverable(db, opp, "1 × Reel")
    return opp


def weekly_class(client):
    """A Live Opportunity with the SATURDAYS weekly class, as the edit page loads it."""
    return editing(client, created(client, weekly_form(SATURDAYS))["id"])


def resave(client, loaded, **changes):
    return save(client, loaded["id"], {**form_of(loaded), **changes, "version": loaded["version"]})


def resaved(client, loaded, **changes):
    response = resave(client, loaded, **changes)
    assert response.status_code == 200, response.json()
    return response.json()


def weekly_changed(loaded, day, **change):
    """The edit page's weekly class Sessions, with the one on `day` changed."""
    return [{**s, **change} if s["date"] == day else s for s in loaded["weeklySessions"]]


def rows_changed(loaded, session_id, **change):
    """The edit page's one-off Session rows, with the one for `session_id` changed."""
    return [{**s, **change} if s["id"] == str(session_id) else s for s in loaded["sessions"]]


def counts(sessions):
    return [(s["date"], s["slots"], s["cancelled"], s["acceptedCount"], s["applicationsCount"], s["undecidedCount"])
            for s in sessions]


def detail_dates(client, opportunity_id):
    """The dates of the Available Sessions the creator detail page lists."""
    body = client.get(f"/api/opportunities/{opportunity_id}").json()
    listed = [*body["sessions"], *(s for weekly in body["weeklyClasses"] for s in weekly["sessions"])]
    return sorted(s["date"] for s in listed if s["status"] == "available")


def discover_ids(client):
    return [card["id"] for card in client.get("/api/opportunities").json()]


def listed_availability(client, opportunity_id):
    rows = client.get("/api/admin/opportunities").json()["opportunities"]
    [row] = [row for row in rows if row["id"] == str(opportunity_id)]
    return row["publishingStatus"], row["availability"]


# Counts (FS-ADM-SES-023, LST-006)

def test_each_one_off_session_shows_accepted_slots_and_application_counts(client, db, signed_in):
    opp = live_opportunity(db)
    full = add_session(db, opp, TOMORROW_10AM, slots=2)
    other = add_session(db, opp, TOMORROW_10AM + timedelta(days=1), slots=3)
    for status in ("Accepted", "Accepted", "New", "Reviewing", "Declined"):
        add_application(db, opp, full, status=status)
    # Counted where it is now, not where it applied.
    add_application(db, opp, full, status="New", CurrentSessionID=other)

    loaded = editing(client, opp)

    assert loaded["sessions"] == [
        {"id": str(full), "date": "2026-09-24", "start": "10:00", "end": "11:00", "slots": 2, "cancelled": False,
         "acceptedCount": 2, "applicationsCount": 5, "undecidedCount": 2},
        {"id": str(other), "date": "2026-09-25", "start": "10:00", "end": "11:00", "slots": 3, "cancelled": False,
         "acceptedCount": 0, "applicationsCount": 1, "undecidedCount": 1},
    ]
    assert loaded["weeklySessions"] == []


def test_the_weekly_class_lists_its_future_sessions_with_their_counts(client, db, signed_in):
    loaded = weekly_class(client)
    saturday = generated_session_id(db, loaded["id"], "2026-10-03")
    add_application(db, loaded["id"], saturday, status="Accepted")
    add_application(db, loaded["id"], saturday, status="Reviewing")

    reloaded = editing(client, loaded["id"])

    assert reloaded["sessions"] == []  # its generated Sessions aren't one-off rows
    assert [(s["date"], s["start"], s["end"]) for s in reloaded["weeklySessions"]] == [
        ("2026-09-26", "20:00", "21:00"), ("2026-10-03", "20:00", "21:00"), ("2026-10-10", "20:00", "21:00"),
    ]
    assert counts(reloaded["weeklySessions"]) == [
        ("2026-09-26", 3, False, 0, 0, 0), ("2026-10-03", 3, False, 1, 2, 1), ("2026-10-10", 3, False, 0, 0, 0),
    ]
    assert reloaded["weeklySessions"][1]["id"] == str(saturday)


# A weekly class Session's own Creator Slots (FS-ADM-SES-007, -014)

def test_changing_one_weekly_sessions_slots_saves_it_and_a_later_schedule_save_keeps_it(client, db, signed_in):
    loaded = weekly_class(client)

    changed = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", slots="5"))
    assert counts(changed["weeklySessions"]) == [
        ("2026-09-26", 3, False, 0, 0, 0), ("2026-10-03", 5, False, 0, 0, 0), ("2026-10-10", 3, False, 0, 0, 0),
    ]
    # New default slots and a new time regenerate the others; the changed one stays as it is (to_ask.md D12).
    rescheduled = resaved(client, changed, recurring={**SATURDAYS, "start": "19:00", "end": "20:00", "slots": "4"})

    assert [(s["date"], s["start"], s["slots"]) for s in rescheduled["weeklySessions"]] == [
        ("2026-09-26", "19:00", 4), ("2026-10-03", "19:00", 4), ("2026-10-03", "20:00", 5), ("2026-10-10", "19:00", 4),
    ]


def test_a_weekly_sessions_slots_cant_go_below_its_accepted_count(client, db, signed_in):
    loaded = weekly_class(client)
    saturday = generated_session_id(db, loaded["id"], "2026-10-03")
    add_application(db, loaded["id"], saturday, status="Accepted")
    add_application(db, loaded["id"], saturday, status="Accepted")
    loaded = editing(client, loaded["id"])

    refused = resave(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", slots="1"))

    assert refused.status_code == 422
    assert refused.json()["errors"] == {
        "weeklySessions.1.slots": "Creator Slots can't be lower than the 2 creators already accepted",
    }
    assert counts(editing(client, loaded["id"])["weeklySessions"])[1] == ("2026-10-03", 3, False, 2, 2, 0)


def test_raising_a_full_sessions_slots_makes_it_available_on_discover_again(client, db, signed_in):
    opp = live_opportunity(db)
    full = add_session(db, opp, TOMORROW_10AM, slots=1)
    add_application(db, opp, full, status="Accepted")
    assert str(opp) not in discover_ids(client)
    loaded = editing(client, opp)

    resaved(client, loaded, sessions=rows_changed(loaded, full, slots="2"))

    assert str(opp) in discover_ids(client)


def test_raising_a_full_weekly_sessions_slots_lists_it_again(client, db, signed_in):
    loaded = weekly_class(client)
    saturday = generated_session_id(db, loaded["id"], "2026-10-03")
    for _ in range(3):
        add_application(db, loaded["id"], saturday, status="Accepted")
    assert detail_dates(client, loaded["id"]) == ["2026-09-26", "2026-10-10"]
    loaded = editing(client, loaded["id"])

    resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", slots="4"))

    assert detail_dates(client, loaded["id"]) == ["2026-09-26", "2026-10-03", "2026-10-10"]


# Cancelling and reopening (FS-ADM-SES-012, -013)

def test_cancelling_a_weekly_session_with_applications_keeps_it_and_them(client, db, signed_in):
    loaded = weekly_class(client)
    saturday = generated_session_id(db, loaded["id"], "2026-10-03")
    add_application(db, loaded["id"], saturday, status="Reviewing")
    loaded = editing(client, loaded["id"])

    cancelled = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", cancelled=True))

    assert counts(cancelled["weeklySessions"])[1] == ("2026-10-03", 3, True, 0, 1, 1)
    assert detail_dates(client, loaded["id"]) == ["2026-09-26", "2026-10-10"]
    [application] = client.get("/api/admin/applications").json()["applications"]
    assert application["status"] == "Reviewing"
    # A schedule save doesn't bring the date back.
    resaved(client, cancelled, recurring={**SATURDAYS, "slots": "4"})
    assert detail_dates(client, loaded["id"]) == ["2026-09-26", "2026-10-10"]


def test_a_cancelled_weekly_session_stays_cancelled_as_the_rolling_window_moves_on(client, db, signed_in, at):
    saved = created(client, weekly_form({**SATURDAYS, "endDate": ""}))
    loaded = editing(client, saved["id"])

    resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", cancelled=True))
    at(NOW + timedelta(days=7))

    assert "2026-10-03" not in detail_dates(client, saved["id"])
    assert [row for row in stored_sessions(db, saved["id"]) if row[0] == "2026-10-03"] == [
        ("2026-10-03", "20:00", 3, True, True),
    ]


def test_reopening_a_cancelled_weekly_session_lists_it_again(client, db, signed_in):
    loaded = weekly_class(client)
    cancelled = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", cancelled=True))

    reopened = resaved(client, cancelled, weeklySessions=weekly_changed(cancelled, "2026-10-03", cancelled=False))

    assert counts(reopened["weeklySessions"])[1] == ("2026-10-03", 3, False, 0, 0, 0)
    assert detail_dates(client, loaded["id"]) == ["2026-09-26", "2026-10-03", "2026-10-10"]


def test_reopening_is_refused_when_the_session_is_full(client, db, signed_in):
    loaded = weekly_class(client)
    saturday = generated_session_id(db, loaded["id"], "2026-10-03")
    for _ in range(3):
        add_application(db, loaded["id"], saturday, status="Accepted")
    loaded = editing(client, loaded["id"])
    cancelled = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", cancelled=True))

    refused = resave(client, cancelled, weeklySessions=weekly_changed(cancelled, "2026-10-03", cancelled=False))
    with_room = resave(client, cancelled,
                       weeklySessions=weekly_changed(cancelled, "2026-10-03", cancelled=False, slots="4"))

    assert refused.status_code == 422
    assert refused.json()["errors"] == {
        "weeklySessions.1.slots": "This session is full. Raise its Creator Slots to reopen it.",
    }
    assert with_room.status_code == 200, with_room.json()
    assert counts(with_room.json()["weeklySessions"])[1] == ("2026-10-03", 4, False, 3, 3, 0)


def test_reopening_is_refused_unless_the_opportunity_is_live(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Closed")
    add_deliverable(db, opp, "1 × Reel")
    add_session(db, opp, TOMORROW_10AM)
    cancelled = add_session(db, opp, TOMORROW_10AM + timedelta(days=1), cancelled=True)
    add_application(db, opp, cancelled, status="New")
    loaded = editing(client, opp)

    refused = resave(client, loaded, sessions=rows_changed(loaded, cancelled, cancelled=False))
    reopened = resave(client, loaded, sessions=rows_changed(loaded, cancelled, cancelled=False),
                      publishingStatus="Live")

    assert refused.status_code == 422
    assert refused.json()["errors"] == {"sessions.1.date": "Sessions can only be reopened on a Live opportunity"}
    assert reopened.status_code == 200, reopened.json()
    assert counts(reopened.json()["sessions"]) == [
        ("2026-09-24", 3, False, 0, 0, 0), ("2026-09-25", 3, False, 0, 1, 1),
    ]


def test_reopening_is_refused_when_another_session_has_its_date_and_time(client, db, signed_in):
    opp = live_opportunity(db)
    cancelled = add_session(db, opp, TOMORROW_10AM, cancelled=True)
    add_application(db, opp, cancelled, status="New")
    add_session(db, opp, TOMORROW_10AM)  # its date and time used again (to_ask.md D10)
    loaded = editing(client, opp)
    assert [s["cancelled"] for s in loaded["sessions"]] == [True, False]

    refused = resave(client, loaded, sessions=rows_changed(loaded, cancelled, cancelled=False))

    assert refused.status_code == 422
    assert refused.json()["errors"] == {"sessions.0.date": "Session 2 already has this date and time"}


def test_reopening_a_weekly_session_is_refused_when_a_one_off_session_has_its_date_and_time(client, db, signed_in):
    loaded = weekly_class(client)
    cancelled = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", cancelled=True))
    with_one_off = resaved(client, cancelled, sessions=[
        {"date": "2026-10-03", "start": "20:00", "end": "21:00", "slots": "2"},
    ])

    refused = resave(client, with_one_off,
                     weeklySessions=weekly_changed(with_one_off, "2026-10-03", cancelled=False))

    assert refused.status_code == 422
    assert refused.json()["errors"] == {"weeklySessions.1": "Another session already has this date and time"}


def test_reopening_a_weekly_session_is_refused_when_the_new_settings_drop_its_date_and_time(client, db, signed_in):
    loaded = weekly_class(client)
    cancelled = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-10-03", cancelled=True))

    refused = resave(client, cancelled, recurring={**SATURDAYS, "start": "19:00", "end": "20:00"},
                     weeklySessions=weekly_changed(cancelled, "2026-10-03", cancelled=False))

    assert refused.status_code == 422
    assert refused.json()["errors"] == {"weeklySessions.1": "The schedule's new settings don't include this session"}


def test_a_session_that_has_started_cant_be_cancelled_or_reopened(client, db, signed_in, at):
    loaded = weekly_class(client)
    cancelled = resaved(client, loaded, weeklySessions=weekly_changed(loaded, "2026-09-26", cancelled=True))
    at(datetime(2026, 9, 26, 20, 30))

    reopen = resave(client, cancelled, weeklySessions=weekly_changed(cancelled, "2026-09-26", cancelled=False))
    cancel = resave(client, cancelled, weeklySessions=weekly_changed(cancelled, "2026-10-03", cancelled=True))
    unchanged = resave(client, cancelled)

    assert reopen.status_code == 422
    assert reopen.json()["errors"] == {"weeklySessions.0": "This session has already started, so it can't be changed"}
    assert cancel.status_code == 200, cancel.json()
    assert unchanged.status_code == 409  # the cancel above saved meanwhile
    assert [s["date"] for s in editing(client, loaded["id"])["weeklySessions"]] == ["2026-10-03", "2026-10-10"]


def test_a_one_off_sessions_remove_works_as_before(client, db, signed_in):
    opp = live_opportunity(db)
    kept = add_session(db, opp, TOMORROW_10AM)
    applied = add_session(db, opp, TOMORROW_10AM + timedelta(days=1))
    add_application(db, opp, applied, status="Declined")
    loaded = editing(client, opp)

    removed = resaved(client, loaded, sessions=[s for s in loaded["sessions"] if s["id"] == str(kept)])

    # The cancelled one is listed again, greyed out, so it can be reopened.
    assert counts(removed["sessions"]) == [("2026-09-24", 3, False, 0, 0, 0), ("2026-09-25", 3, True, 0, 1, 0)]


def test_switching_to_specific_dates_keeps_cancelled_weekly_sessions_with_applications_as_one_off_rows(
        client, db, signed_in):
    loaded = weekly_class(client)
    saturday = generated_session_id(db, loaded["id"], "2026-10-03")
    add_application(db, loaded["id"], saturday, status="New")
    loaded = editing(client, loaded["id"])
    cancelled = resaved(client, loaded, weeklySessions=[{**s, "cancelled": s["date"] != "2026-09-26"}
                                                        for s in loaded["weeklySessions"]])

    switched = resaved(client, cancelled, scheduleType="specific", publishingStatus="Live",
                       sessions=[{"date": "2026-10-01", "start": "10:00", "end": "11:00", "slots": "3"}])

    assert switched["weeklySessions"] == []
    assert counts(switched["sessions"]) == [("2026-10-01", 3, False, 0, 0, 0), ("2026-10-03", 3, True, 0, 1, 1)]
    assert len(stored_sessions(db, loaded["id"])) == 2  # the cancelled ones without Applications are gone


# "No available sessions" on the Opportunities list (FS-ADM-SES-020, -021, LST-004)

def test_a_live_opportunity_with_no_available_session_says_so_until_a_future_session_is_added(client, db, signed_in):
    opp = live_opportunity(db)
    full = add_session(db, opp, TOMORROW_10AM, slots=1)
    add_application(db, opp, full, status="Accepted")
    add_session(db, opp, NOW - timedelta(days=1))
    add_session(db, opp, TOMORROW_10AM + timedelta(days=1), cancelled=True)

    assert listed_availability(client, opp) == ("Live", "fully_booked")
    assert str(opp) not in discover_ids(client)
    loaded = editing(client, opp)
    resaved(client, loaded, sessions=[*loaded["sessions"],
                                      {"date": "2026-09-30", "start": "10:00", "end": "11:00", "slots": "3"}])

    assert listed_availability(client, opp) == ("Live", "open")
    assert str(opp) in discover_ids(client)


def test_each_listed_opportunity_carries_its_derived_availability(client, db, signed_in):
    past_only = live_opportunity(db)
    add_session(db, past_only, NOW - timedelta(days=1))
    draft = add_opportunity(db, PublishingStatus="Draft")
    add_session(db, draft, TOMORROW_10AM)
    closed = add_opportunity(db, PublishingStatus="Closed")
    add_session(db, closed, TOMORROW_10AM)

    assert listed_availability(client, past_only) == ("Live", "closed")
    assert listed_availability(client, draft) == ("Draft", "draft")
    assert listed_availability(client, closed) == ("Closed", "closed")
    # Still counted and filtered as Live.
    body = client.get("/api/admin/opportunities?status=Live").json()
    assert body["counts"]["live"] == 1
    assert [row["id"] for row in body["opportunities"]] == [str(past_only)]
