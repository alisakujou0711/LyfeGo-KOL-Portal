"""Creating and editing Opportunities as Drafts from the Admin form (Admin ticket 04)."""

from datetime import datetime, timedelta

import pytest

from tests.admin_api import EMPTY_FORM, FILLED_FORM, create, created, editing, form_of, save
from tests.factories import (
    NOW, PAID, TOMORROW_10AM, add_application, add_deliverable, add_info, add_opportunity, add_schedule,
    add_session,
)


pytestmark = pytest.mark.usefixtures("frozen_now")


def as_entered(sessions):
    """Session rows as the form entered them: without the ids, Cancelled flags and counts the edit page adds."""
    return [{key: s[key] for key in ("date", "start", "end", "slots")} for s in sessions]


def test_creating_and_editing_need_a_signed_in_admin(client, db):
    opp = add_opportunity(db)

    assert create(client, EMPTY_FORM).status_code == 401
    assert client.get(f"/api/admin/opportunities/{opp}").status_code == 401
    assert save(client, opp, EMPTY_FORM).status_code == 401


def test_an_empty_form_saves_as_a_draft_listed_for_admins_but_not_on_discover(client, db, signed_in):
    saved = created(client, EMPTY_FORM)

    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["id"] == saved["id"]
    assert row["publishingStatus"] == "Draft"
    assert row["lastUpdated"] == "2026-09-23"
    assert client.get("/api/opportunities").json() == []
    client.cookies.clear()  # only a signed-in Admin can preview a Draft
    assert client.get(f"/api/opportunities/{saved['id']}").status_code == 404


def test_an_empty_draft_reloads_with_the_forms_defaults_and_no_blank_rows(client, db, signed_in):
    saved = created(client, EMPTY_FORM)

    assert form_of(editing(client, saved["id"])) == {
        **EMPTY_FORM, "deliverables": [], "sessions": [], "recurring": None, "weeklySessions": [],
    }


def test_a_draft_reloads_with_every_field_as_entered(client, db, signed_in):
    saved = created(client, FILLED_FORM)

    reloaded = editing(client, saved["id"])

    assert reloaded == saved
    assert {**form_of(reloaded), "sessions": as_entered(reloaded["sessions"])} == {
        **FILLED_FORM,
        "sessions": [
            {"date": "2026-09-30", "start": "18:00", "end": "19:30", "slots": 3},
            {"date": "2026-10-02", "start": "09:00", "end": "10:00", "slots": 4},
        ],
        "recurring": None,
        "weeklySessions": [],
    }


def test_a_new_drafts_sessions_are_its_sessions(client, db, signed_in):
    saved = created(client, FILLED_FORM)

    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["schedule"]["availableDates"] == ["2026-09-30", "2026-10-02"]
    assert [s["id"] for s in saved["sessions"]] == [s["id"] for s in editing(client, saved["id"])["sessions"]]


def test_a_recurring_schedule_saves_its_settings_with_the_weekdays_as_a_list(client, db, signed_in):
    form = {
        **EMPTY_FORM,
        "scheduleType": "recurring",
        "recurring": {"days": ["Sat", "Tue"], "start": "20:00", "end": "21:00",
                      "startDate": "2026-09-29", "endDate": "", "slots": "3"},
    }

    saved = created(client, form)

    assert saved["scheduleType"] == "recurring"
    assert saved["recurring"] == {"days": ["Tue", "Sat"], "start": "20:00", "end": "21:00",
                                  "startDate": "2026-09-29", "endDate": None, "slots": 3}
    assert saved["sessions"] == []  # its generated Sessions aren't one-off rows
    cursor = db.cursor()
    cursor.execute("SELECT DayFrequency FROM RecurringSchedule WHERE OpportunityID = %s", (saved["id"],))
    assert cursor.fetchone() == ("Tue,Sat",)


def test_the_paid_fields_are_kept_while_barter_is_chosen_and_the_reverse(client, db, signed_in):
    form = {**FILLED_FORM, "compensationType": "Barter", "whatCreatorReceives": "A free class"}

    saved = created(client, form)

    assert saved["compensationType"] == "Barter"
    assert saved["whatCreatorReceives"] == "A free class"
    assert (saved["paymentAmount"], saved["paymentBasis"]) == (150, "Per post")


def test_editing_returns_an_existing_opportunity_with_its_future_one_off_sessions_and_schedule(client, db, signed_in):
    opp = add_opportunity(db, PAID, ExperienceSkillLevel="Beginner")
    add_deliverable(db, opp, "1 × Reel")
    add_info(db, opp, "Equipment", "Racquets provided")
    add_session(db, opp, NOW - timedelta(days=1))  # past
    cancelled = add_session(db, opp, TOMORROW_10AM, cancelled=True)
    later = add_session(db, opp, TOMORROW_10AM + timedelta(days=5), slots=None)
    soon = add_session(db, opp, TOMORROW_10AM, slots=2)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0), slots=None, until=None)
    saturday = add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)

    loaded = editing(client, opp)

    assert loaded["title"] == "Activewear Campaign"
    assert loaded["compensationType"] == "Paid"
    assert (loaded["currency"], loaded["paymentAmount"], loaded["paymentBasis"], loaded["paymentNotes"]) == (
        "SGD", 150, "Flat fee", "Plus an activewear set to keep")
    assert loaded["experienceLevels"] == ["Beginner"]
    assert loaded["deliverables"] == ["1 × Reel"]
    assert loaded["additionalInfo"] == [{"label": "Equipment", "value": "Racquets provided"}]
    assert loaded["publishingStatus"] == "Live"
    # Both parts show (to_ask.md B6); a legacy "Weekly" schedule falls on its Start Date's weekday.
    assert loaded["scheduleType"] == "recurring"
    assert loaded["recurring"] == {"days": ["Sat"], "start": "20:00", "end": "21:00",
                                   "startDate": "2026-09-26", "endDate": None, "slots": None}
    no_applications = {"acceptedCount": 0, "applicationsCount": 0, "undecidedCount": 0}
    # A cancelled future Session is listed too, so it can be reopened (Admin ticket 12).
    assert loaded["sessions"] == [
        {"id": str(cancelled), "date": "2026-09-24", "start": "10:00", "end": "11:00", "slots": 3,
         "cancelled": True, **no_applications},
        {"id": str(soon), "date": "2026-09-24", "start": "10:00", "end": "11:00", "slots": 2,
         "cancelled": False, **no_applications},
        {"id": str(later), "date": "2026-09-29", "start": "10:00", "end": "11:00", "slots": None,
         "cancelled": False, **no_applications},
    ]
    # Then the rest of its eight-week window.
    assert loaded["weeklySessions"][0] == {"id": str(saturday), "date": "2026-09-26", "start": "20:00",
                                           "end": "21:00", "slots": 3, "cancelled": False, **no_applications}
    assert len(loaded["weeklySessions"]) == 8


def test_an_unknown_opportunity_is_not_found(client, db, signed_in):
    assert client.get("/api/admin/opportunities/999").status_code == 404
    assert client.get("/api/admin/opportunities/abc").status_code == 404
    assert save(client, 999, {**EMPTY_FORM, "version": "2026-09-23T12:00:00"}).status_code == 404


def test_save_draft_on_an_existing_draft_keeps_every_field(client, db, signed_in):
    saved = created(client, FILLED_FORM)
    loaded = editing(client, saved["id"])

    response = save(client, saved["id"], {**form_of(loaded), "version": loaded["version"], "publishingStatus": "Draft"})

    assert response.status_code == 200, response.json()
    resaved = response.json()
    assert resaved["publishingStatus"] == "Draft"
    assert form_of(resaved) == {**form_of(loaded), "publishingStatus": "Draft"}
    assert client.get("/api/opportunities").json() == []


def test_an_edit_replaces_the_fields_deliverables_and_requirements(client, db, signed_in):
    saved = created(client, FILLED_FORM)
    changes = {
        "title": "Bouldering for Two",
        "compensationType": "Barter",
        "whatCreatorReceives": "Two day passes",
        "deliverables": ["3 × Stories", "1 × TikTok"],
        "additionalInfo": [],
        "experienceLevels": ["Not Applicable"],
    }

    response = save(client, saved["id"], {**form_of(saved), **changes, "version": saved["version"]})

    assert response.status_code == 200, response.json()
    reloaded = editing(client, saved["id"])
    assert {key: reloaded[key] for key in changes} == changes


def test_an_edit_keeps_applications(client, db, signed_in):
    opp = add_opportunity(db, PAID)
    session = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, session)
    loaded = editing(client, opp)

    response = save(client, opp, {**form_of(loaded), "publishingStatus": "Closed", "version": loaded["version"]})

    assert response.status_code == 200, response.json()
    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["applicationsCount"] == 1


def test_an_edit_updates_the_recurring_schedules_settings(client, db, signed_in):
    opp = add_opportunity(db)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0))
    add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)
    loaded = editing(client, opp)
    recurring = {"days": ["Tue", "Sat"], "start": "19:00", "end": "20:00",
                 "startDate": "2026-09-26", "endDate": "2026-12-31", "slots": ""}

    response = save(client, opp, {**form_of(loaded), "recurring": recurring, "publishingStatus": "Closed",
                                  "version": loaded["version"]})

    assert response.status_code == 200, response.json()
    assert editing(client, opp)["recurring"] == {**recurring, "slots": None}


def test_last_updated_changes_only_on_a_successful_save(client, db, signed_in, at):
    saved = created(client, EMPTY_FORM)
    at(NOW + timedelta(days=2))

    editing(client, saved["id"])
    save(client, saved["id"], {**EMPTY_FORM, "title": "x" * 300, "version": saved["version"]})  # refused
    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["lastUpdated"] == "2026-09-23"

    save(client, saved["id"], {**EMPTY_FORM, "version": saved["version"]})
    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["lastUpdated"] == "2026-09-25"


def test_a_stale_version_is_refused_and_nothing_is_overwritten(client, db, signed_in):
    saved = created(client, FILLED_FORM)
    # Another Admin saves first, in the same second.
    assert save(client, saved["id"], {**form_of(saved), "title": "Theirs", "version": saved["version"]}).status_code == 200

    response = save(client, saved["id"], {**form_of(saved), "title": "Mine", "version": saved["version"]})

    assert response.status_code == 409
    assert "someone else" in response.json()["detail"].lower()
    assert editing(client, saved["id"])["title"] == "Theirs"


def test_a_save_without_a_version_is_refused(client, db, signed_in):
    saved = created(client, EMPTY_FORM)

    assert save(client, saved["id"], form_of(saved)).status_code == 409


def test_each_save_returns_a_new_version_for_the_next_save(client, db, signed_in):
    saved = created(client, EMPTY_FORM)

    first = save(client, saved["id"], {**form_of(saved), "version": saved["version"]}).json()
    second = save(client, saved["id"], {**form_of(first), "version": first["version"]})

    assert second.status_code == 200
    assert len({saved["version"], first["version"], second.json()["version"]}) == 3


@pytest.mark.parametrize("changes, field", [
    ({"title": "x" * 256}, "title"),
    ({"partner": "x" * 256}, "partner"),
    ({"aboutExperience": "x" * 5001}, "aboutExperience"),
    ({"whatCreatorReceives": "x" * 5001}, "whatCreatorReceives"),
    ({"heroImage": "x" * 501}, "heroImage"),
    ({"deliverables": ["x" * 501]}, "deliverables.0"),
    ({"additionalInfo": [{"label": "x" * 256, "value": "v"}]}, "additionalInfo.0.label"),
    ({"deliverables": ["d"] * 11}, "deliverables"),
    ({"additionalInfo": [{"label": "l", "value": "v"}] * 11}, "additionalInfo"),
    ({"category": "Music"}, "category"),
    ({"compensationType": "Equity"}, "compensationType"),
    ({"currency": "EUR"}, "currency"),
    ({"collaborationType": "Forever"}, "collaborationType"),
    ({"deliverableType": "Maybe"}, "deliverableType"),
    ({"experienceLevels": "Beginner"}, "experienceLevels"),
    ({"experienceLevels": []}, "experienceLevels"),
    ({"experienceLevels": ["Expert"]}, "experienceLevels"),
    ({"compensationType": "Paid", "paymentAmount": "S$150 per post"}, "paymentAmount"),
    ({"compensationType": "Paid", "paymentBasis": "Per hour"}, "paymentBasis"),
    ({"title": 42}, "title"),
    ({"sessions": [{"date": "2026-10-01", "start": "10:00", "end": "11:00", "slots": "0"}]}, "sessions.0.slots"),
    ({"sessions": [{"date": "2026-10-01", "start": "10:00", "end": "11:00", "slots": "2.5"}]}, "sessions.0.slots"),
    ({"sessions": [{"date": "2026-10-01", "start": "", "end": "11:00", "slots": ""}]}, "sessions.0.start"),
    ({"sessions": [{"date": "2026-02-30", "start": "10:00", "end": "11:00", "slots": ""}]}, "sessions.0.date"),
    ({"scheduleType": "recurring", "recurring": {**EMPTY_FORM["recurring"], "days": ["Mon"]}}, "recurring.start"),
    ({"scheduleType": "recurring", "recurring": {"days": ["Someday"], "start": "10:00", "end": "11:00",
                                                 "startDate": "2026-10-01", "endDate": "", "slots": ""}},
     "recurring.days"),
    ({"scheduleType": "recurring", "recurring": {"days": ["Mon"], "start": "10:00", "end": "11:00",
                                                 "startDate": "2026-10-01", "endDate": "", "slots": "-1"}},
     "recurring.slots"),
    ({"publishingStatus": "Published"}, "publishingStatus"),
])
def test_invalid_fields_are_refused_with_an_error_under_each(client, db, signed_in, changes, field):
    response = create(client, {**EMPTY_FORM, **changes})

    assert response.status_code == 422
    assert field in response.json()["errors"]
    assert client.get("/api/admin/opportunities").json()["opportunities"] == []


def test_slots_may_be_sent_as_whole_numbers(client, db, signed_in):
    form = {**EMPTY_FORM, "sessions": [{"date": "2026-10-01", "start": "10:00", "end": "11:00", "slots": 5}]}

    assert created(client, form)["sessions"][0]["slots"] == 5


def test_text_is_trimmed(client, db, signed_in):
    saved = created(client, {**EMPTY_FORM, "title": "  Padel  ", "deliverables": [" 1 × Reel ", "   "]})

    assert saved["title"] == "Padel"
    assert saved["deliverables"] == ["1 × Reel"]
