"""Recurring Schedules on several weekdays: generating their Sessions, keeping an
open-ended one's eight-week window topped up, and changing or switching them
without harming Sessions that have Applications (Admin ticket 07)."""

from datetime import date, datetime, timedelta

import pytest

from tests.factories import add_application, add_opportunity, add_schedule, add_session
from tests.test_admin_save_opportunity import FILLED_FORM, create, created, editing, form_of, save

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)  # a Wednesday

TUE_AND_SAT = {"days": ["Tue", "Sat"], "start": "20:00", "end": "21:00",
               "startDate": "2026-09-23", "endDate": "", "slots": "3"}

# Eight weeks of Tuesdays and Saturdays after NOW: up to Wednesday 18 Nov.
SATURDAYS = ["2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17",
             "2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14"]
TUESDAYS = ["2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20",
            "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17"]


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def weekly_form(recurring=TUE_AND_SAT, **changes):
    """A form that passes the Live checks with a Recurring Schedule and no one-off Sessions."""
    return {**FILLED_FORM, "scheduleType": "recurring", "recurring": recurring, "sessions": [],
            "publishingStatus": "Live", **changes}


def resave(client, loaded, **changes):
    """Save `loaded` (as the edit page loaded it) with `changes`."""
    response = save(client, loaded["id"], {**form_of(loaded), **changes, "version": loaded["version"]})
    assert response.status_code == 200, response.json()
    return response.json()


def detail(client, opportunity_id):
    response = client.get(f"/api/opportunities/{opportunity_id}")
    assert response.status_code == 200
    return response.json()


def weekly_sessions(client, opportunity_id):
    """The listed Sessions of the Opportunity's only weekly class, as (date, start, slotsLeft)."""
    [weekly] = detail(client, opportunity_id)["weeklyClasses"]
    return [(s["date"], s["start"], s["slotsLeft"]) for s in weekly["sessions"]]


def stored_sessions(db, opportunity_id):
    """Every stored Session of the Opportunity as (date, start, slots, cancelled, generated)."""
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor(dictionary=True)
    cursor.execute("""SELECT SessionDate, StartTime, CreatorSlots, IsCancelled, RecurrenceID FROM Session
                       WHERE OpportunityID = %s ORDER BY SessionDate, StartTime""", (opportunity_id,))
    return [(row["SessionDate"].isoformat(), str(row["StartTime"])[:-3].zfill(5), row["CreatorSlots"],
             bool(row["IsCancelled"]), row["RecurrenceID"] is not None) for row in cursor.fetchall()]


def generated_session_id(db, opportunity_id, day: str):
    db.commit()
    cursor = db.cursor()
    cursor.execute("""SELECT SessionID FROM Session
                       WHERE OpportunityID = %s AND SessionDate = %s AND RecurrenceID IS NOT NULL""",
                   (opportunity_id, day))
    [(session_id,)] = cursor.fetchall()
    return session_id


def test_a_two_weekday_schedule_without_an_end_date_gets_eight_weeks_of_sessions_on_both_days(
        client, db, signed_in):
    saved = created(client, weekly_form())

    body = detail(client, saved["id"])

    [weekly] = body["weeklyClasses"]
    assert (weekly["days"], weekly["start"], weekly["end"]) == (["Tuesday", "Saturday"], "20:00", "21:00")
    assert [(s["date"], s["slotsLeft"]) for s in weekly["sessions"]] == [
        (day, 3) for day in sorted(SATURDAYS + TUESDAYS)]
    assert body["sessions"] == []
    [card] = client.get("/api/opportunities").json()
    assert card["weeklyClasses"] == [{"days": ["Tuesday", "Saturday"], "start": "20:00", "end": "21:00"}]
    assert saved["sessions"] == []  # generated Sessions aren't the form's one-off rows


def test_generation_stops_at_the_end_date(client, db, signed_in):
    saved = created(client, weekly_form({**TUE_AND_SAT, "endDate": "2026-10-10"}))

    assert [day for day, _, _ in weekly_sessions(client, saved["id"])] == [
        "2026-09-26", "2026-09-29", "2026-10-03", "2026-10-06", "2026-10-10"]


def test_generation_starts_at_the_start_date(client, db, signed_in):
    saved = created(client, weekly_form({**TUE_AND_SAT, "startDate": "2026-10-04"}))

    assert weekly_sessions(client, saved["id"])[0][0] == "2026-10-06"


def test_a_session_later_today_is_generated_and_one_that_has_started_is_not(client, db, signed_in, at):
    at(datetime(2026, 9, 26, 12, 0))  # a Saturday
    later_today = created(client, weekly_form({**TUE_AND_SAT, "startDate": "2026-09-26"}))
    at(datetime(2026, 9, 26, 20, 30))
    started = created(client, weekly_form({**TUE_AND_SAT, "startDate": "2026-09-26"}))

    assert stored_sessions(db, later_today["id"])[0][0] == "2026-09-26"
    assert stored_sessions(db, started["id"])[0][0] == "2026-09-29"


def test_reading_tops_an_open_ended_schedule_back_up_to_eight_weeks_without_duplicates(client, db, signed_in, at):
    saved = created(client, weekly_form())
    at(NOW + timedelta(weeks=1))

    client.get("/api/opportunities")  # Discover's read tops it up
    stored = stored_sessions(db, saved["id"])
    client.get(f"/api/opportunities/{saved['id']}")
    client.get("/api/admin/opportunities")
    client.get(f"/api/admin/opportunities/{saved['id']}")

    later = date(2026, 11, 21), date(2026, 11, 24)
    assert [day for day, *_ in stored] == sorted(SATURDAYS + TUESDAYS + [d.isoformat() for d in later])
    assert stored_sessions(db, saved["id"]) == stored  # reading again adds nothing
    assert len(weekly_sessions(client, saved["id"])) == 16  # the two past ones aren't listed


@pytest.mark.parametrize("path", ["/api/opportunities/{id}", "/api/admin/opportunities",
                                  "/api/admin/opportunities/{id}"])
def test_the_detail_and_admin_reads_top_up_too(client, db, signed_in, at, path):
    saved = created(client, weekly_form())
    at(NOW + timedelta(weeks=1))

    client.get(path.format(id=saved["id"]))

    assert stored_sessions(db, saved["id"])[-1][0] == "2026-11-24"


def test_a_schedule_with_an_end_date_is_not_topped_up_past_it(client, db, signed_in, at):
    saved = created(client, weekly_form({**TUE_AND_SAT, "endDate": "2026-10-10"}))
    at(NOW + timedelta(weeks=1))

    client.get("/api/opportunities")

    assert stored_sessions(db, saved["id"])[-1][0] == "2026-10-10"


def test_a_legacy_weekly_schedule_falls_on_its_start_dates_weekday_and_is_topped_up(client, db):
    opp = add_opportunity(db)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0), until=None)
    add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)

    [weekly] = detail(client, opp)["weeklyClasses"]

    assert weekly["days"] == ["Saturday"]
    assert [s["date"] for s in weekly["sessions"]] == SATURDAYS


def test_changing_the_time_regenerates_future_sessions_without_applications_only(client, db, signed_in, at):
    saved = created(client, weekly_form())
    accepted = generated_session_id(db, saved["id"], "2026-10-03")
    add_application(db, saved["id"], accepted, status="Accepted")
    declined = generated_session_id(db, saved["id"], "2026-10-06")
    add_application(db, saved["id"], declined, status="Declined")
    at(datetime(2026, 9, 27, 12, 0))  # Saturday 26 Sep has passed
    loaded = editing(client, saved["id"])

    resave(client, loaded, recurring={**TUE_AND_SAT, "start": "19:00", "end": "20:00", "slots": "5"})

    stored = stored_sessions(db, saved["id"])
    assert stored[0] == ("2026-09-26", "20:00", 3, False, True)  # past: never changed
    assert ("2026-10-03", "20:00", 3, False, True) in stored  # has an Application: untouched
    assert ("2026-10-06", "20:00", 3, False, True) in stored
    assert {(start, slots) for day, start, slots, *_ in stored if day not in (
        "2026-09-26", "2026-10-03", "2026-10-06")} == {("19:00", 5)}
    sessions = weekly_sessions(client, saved["id"])
    assert sessions[:4] == [("2026-09-29", "19:00", 5), ("2026-10-03", "19:00", 5),
                            ("2026-10-03", "20:00", 2), ("2026-10-06", "19:00", 5)]


def test_changing_the_weekdays_removes_the_dropped_days_sessions_without_applications(client, db, signed_in):
    saved = created(client, weekly_form())
    applied = generated_session_id(db, saved["id"], "2026-10-06")
    add_application(db, saved["id"], applied, status="New")
    loaded = editing(client, saved["id"])

    resave(client, loaded, recurring={**TUE_AND_SAT, "days": ["Sat"]})

    [weekly] = detail(client, saved["id"])["weeklyClasses"]
    assert weekly["days"] == ["Saturday"]
    assert [s["date"] for s in weekly["sessions"]] == sorted(SATURDAYS + ["2026-10-06"])


def test_saving_an_unchanged_schedule_keeps_every_session(client, db, signed_in):
    saved = created(client, weekly_form())
    before = [s["id"] for s in detail(client, saved["id"])["weeklyClasses"][0]["sessions"]]

    resave(client, editing(client, saved["id"]))

    assert [s["id"] for s in detail(client, saved["id"])["weeklyClasses"][0]["sessions"]] == before


def test_switching_to_specific_dates_keeps_sessions_with_applications_and_deletes_the_rest(client, db, signed_in):
    saved = created(client, weekly_form())
    applied = generated_session_id(db, saved["id"], "2026-10-03")
    add_application(db, saved["id"], applied, status="Accepted")
    loaded = editing(client, saved["id"])

    switched = resave(client, loaded, scheduleType="specific", sessions=[
        {"date": "2026-10-08", "start": "10:00", "end": "11:00", "slots": "4"}])

    assert (switched["scheduleType"], switched["recurring"]) == ("specific", None)
    # The kept Session is now a one-off Session, so the Admin can see and remove it.
    assert [(s["id"], s["date"]) for s in switched["sessions"]] == [
        (str(applied), "2026-10-03"), (switched["sessions"][1]["id"], "2026-10-08")]
    assert stored_sessions(db, saved["id"]) == [("2026-10-03", "20:00", 3, False, False),
                                                ("2026-10-08", "10:00", 4, False, False)]
    [application] = client.get("/api/admin/applications").json()["applications"]
    assert application["status"] == "Accepted"
    body = detail(client, saved["id"])
    assert body["weeklyClasses"] == []
    assert [s["date"] for s in body["sessions"]] == ["2026-10-03", "2026-10-08"]


def test_switching_to_recurring_cancels_a_removed_one_off_session_with_applications(client, db, signed_in):
    opp = add_opportunity(db, PublishingStatus="Draft")
    applied = add_session(db, opp, datetime(2026, 9, 30, 10, 0))
    add_application(db, opp, applied, status="Reviewing")
    loaded = editing(client, opp)

    switched = resave(client, loaded, scheduleType="recurring", recurring=TUE_AND_SAT, sessions=[])

    stored = stored_sessions(db, opp)
    assert [(s["id"], s["cancelled"]) for s in switched["sessions"]] == [(str(applied), True)]
    assert ("2026-09-30", "10:00", 3, True, False) in stored
    assert len([session for session in stored if session[4]]) == 16
    [application] = client.get("/api/admin/applications").json()["applications"]
    assert application["status"] == "Reviewing"


def test_a_weekly_class_and_a_one_off_session_both_survive_a_save(client, db, signed_in):
    # Like Tennis: Saturdays 8–9pm and a one-off Tuesday 7–8pm (to_ask.md B6).
    saved = created(client, weekly_form(
        {**TUE_AND_SAT, "days": ["Sat"]},
        sessions=[{"date": "2026-09-29", "start": "19:00", "end": "20:00", "slots": "3"}]))
    loaded = editing(client, saved["id"])
    weekly_ids = [s["id"] for s in detail(client, saved["id"])["weeklyClasses"][0]["sessions"]]

    resaved = resave(client, loaded)

    assert resaved["scheduleType"] == "recurring"
    assert resaved["recurring"]["days"] == ["Sat"]
    assert [(s["id"], s["date"], s["start"]) for s in resaved["sessions"]] == [
        (loaded["sessions"][0]["id"], "2026-09-29", "19:00")]
    body = detail(client, saved["id"])
    assert [s["id"] for s in body["weeklyClasses"][0]["sessions"]] == weekly_ids
    assert [s["date"] for s in body["sessions"]] == ["2026-09-29"]


def test_a_new_one_off_session_can_t_repeat_a_generated_one(client, db, signed_in):
    response = create(client, weekly_form(
        sessions=[{"date": "2026-09-29", "start": "20:00", "end": "21:00", "slots": "3"}]))

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessions.0.date": "The weekly class already has this date and time"}


def test_a_stored_one_off_session_on_a_new_weekly_date_is_kept_and_not_repeated(client, db, signed_in):
    saved = created(client, weekly_form(
        {**TUE_AND_SAT, "days": ["Sat"]},
        sessions=[{"date": "2026-09-29", "start": "20:00", "end": "21:00", "slots": "2"}]))
    loaded = editing(client, saved["id"])

    resave(client, loaded, recurring=TUE_AND_SAT)

    body = detail(client, saved["id"])
    assert [(s["date"], s["slotsLeft"]) for s in body["sessions"]] == [("2026-09-29", 2)]
    assert "2026-09-29" not in [s["date"] for s in body["weeklyClasses"][0]["sessions"]]


def test_a_recurring_schedule_publishes_once_its_sessions_are_generated(client, db, signed_in):
    saved = created(client, weekly_form())

    assert saved["publishingStatus"] == "Live"
    assert [card["id"] for card in client.get("/api/opportunities").json()] == [saved["id"]]


def test_a_schedule_with_no_future_dates_can_t_publish(client, db, signed_in):
    response = create(client, weekly_form({**TUE_AND_SAT, "startDate": "2026-09-01", "endDate": "2026-09-20"}))

    assert response.status_code == 422
    assert response.json()["errors"] == {"recurring": "This schedule has no future sessions yet"}


def test_an_end_date_more_than_a_year_after_the_start_date_is_refused(client, db, signed_in):
    response = create(client, weekly_form({**TUE_AND_SAT, "endDate": "2027-09-24"}, publishingStatus="Draft"))
    within_a_year = create(client, weekly_form({**TUE_AND_SAT, "endDate": "2027-09-23"}, publishingStatus="Draft"))

    assert response.status_code == 422
    assert response.json()["errors"] == {"recurring.endDate": "End date must be within a year of the start date"}
    assert within_a_year.status_code == 201, within_a_year.json()


def test_the_window_ends_eight_weeks_from_now_even_on_one_of_the_schedules_days(client, db, signed_in, at):
    at(datetime(2026, 9, 26, 12, 0))  # a Saturday, before the class
    saved = created(client, weekly_form({**TUE_AND_SAT, "days": ["Sat"], "startDate": "2026-09-26"}))

    # Today's class and the next seven: the eighth Saturday ahead starts after now + eight weeks.
    assert [day for day, *_ in stored_sessions(db, saved["id"])] == ["2026-09-26", *SATURDAYS[1:]]


def test_switching_to_specific_dates_never_changes_past_sessions(client, db, signed_in, at):
    saved = created(client, weekly_form())
    at(datetime(2026, 9, 27, 12, 0))  # Saturday 26 Sep has passed
    loaded = editing(client, saved["id"])

    resave(client, loaded, scheduleType="specific", sessions=[
        {"date": "2026-10-08", "start": "10:00", "end": "11:00", "slots": "3"}])

    assert stored_sessions(db, saved["id"])[0] == ("2026-09-26", "20:00", 3, False, True)


def test_the_year_limit_on_the_end_date_counts_from_today_once_the_start_date_has_passed(client, db, signed_in):
    started_long_ago = {**TUE_AND_SAT, "startDate": "2025-01-04"}

    within_a_year = create(client, weekly_form({**started_long_ago, "endDate": "2027-09-23"}, publishingStatus="Draft"))
    too_late = create(client, weekly_form({**started_long_ago, "endDate": "2027-09-24"}, publishingStatus="Draft"))

    assert within_a_year.status_code == 201, within_a_year.json()
    assert too_late.json()["errors"] == {"recurring.endDate": "End date must be within a year from today"}
