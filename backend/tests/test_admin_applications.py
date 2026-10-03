import json
import threading
import time
from datetime import datetime, timedelta

import pytest

from app.db import connect
from tests.factories import PAID, add_application, add_opportunity, add_session

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)  # a Wednesday
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)
SATURDAY_8PM = datetime(2026, 9, 26, 20, 0)


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def admin_list(client, **params):
    response = client.get("/api/admin/applications", params=params)
    assert response.status_code == 200
    return response.json()


def names(client, **params):
    return [row["fullName"] for row in admin_list(client, **params)["applications"]]


def detail(client, application_id):
    response = client.get(f"/api/admin/applications/{application_id}")
    assert response.status_code == 200
    return response.json()


def update(client, application_id, **body):
    return client.patch(f"/api/admin/applications/{application_id}", json=body)


def stamps(db, application_id):
    """The Application's status and last-updated times, which no endpoint shows."""
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT ReviewingAt, AcceptedAt, DeclinedAt, UpdatedAt FROM Application WHERE ApplicationID = %s",
                   (application_id,))
    return cursor.fetchone()


def submitted(days_ago):
    return NOW - timedelta(days=days_ago)


# --- Signing in ---------------------------------------------------------------

def test_every_applications_endpoint_needs_a_signed_in_admin(client, db, sign_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    assert client.get("/api/admin/applications").status_code == 401
    assert client.get(f"/api/admin/applications/{application}").status_code == 401
    assert update(client, application, status="Accepted").status_code == 401

    sign_in()
    assert detail(client, application)["status"] == "New"


# --- The list -----------------------------------------------------------------

def test_a_row_shows_what_the_admin_table_needs(client, db, signed_in):
    opp = add_opportunity(db, Title="Tennis Group Class", PartnerBrandName="The Best Group")
    session = add_session(db, opp, SATURDAY_8PM)
    application = add_application(
        db, opp, session, status="Reviewing", FullName="Marcus Lim", EmailAddress="marcus.lim@gmail.com",
        InstagramHandle="marcuslim.sg", TikTokHandle="marcuslim", SubmittedAt=datetime(2026, 9, 11, 23, 30),
    )

    [row] = admin_list(client)["applications"]

    assert row == {
        "id": str(application),
        "fullName": "Marcus Lim",
        "email": "marcus.lim@gmail.com",
        "instagram": "marcuslim.sg",
        "tiktok": "marcuslim",
        "opportunity": {"id": str(opp), "title": "Tennis Group Class", "partner": "The Best Group"},
        "session": {"date": "2026-09-26", "start": "20:00", "end": "21:00"},
        "submittedOn": "2026-09-11",  # the SGT date
        "status": "Reviewing",
    }


def test_rows_show_the_current_session_not_the_original_one(client, db, signed_in):
    opp = add_opportunity(db)
    original = add_session(db, opp, TOMORROW_10AM)
    current = add_session(db, opp, SATURDAY_8PM)
    add_application(db, opp, original, CurrentSessionID=current)

    [row] = admin_list(client)["applications"]

    assert row["session"] == {"date": "2026-09-26", "start": "20:00", "end": "21:00"}


def test_rows_are_newest_submitted_first(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, session, FullName="Oldest", SubmittedAt=submitted(3))
    add_application(db, opp, session, FullName="Newest", SubmittedAt=submitted(1))
    add_application(db, opp, session, FullName="Middle", SubmittedAt=submitted(2))

    assert names(client) == ["Newest", "Middle", "Oldest"]


def test_the_counts_cover_every_application_however_the_list_is_filtered(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=10)
    for status in ("New", "New", "Reviewing", "Accepted", "Accepted", "Accepted", "Declined"):
        add_application(db, opp, session, status=status)

    expected = {"all": 7, "new": 2, "reviewing": 1, "accepted": 3, "declined": 1}
    assert admin_list(client)["counts"] == expected
    assert admin_list(client, status="Declined", search="nobody")["counts"] == expected


def test_the_filter_options_list_every_opportunity_and_partner(client, db, signed_in):
    tennis = add_opportunity(db, Title="Tennis Group Class", PartnerBrandName="The Best Group")
    draft = add_opportunity(db, Title="Bouldering Experience", PartnerBrandName="Boulder Movement",
                            PublishingStatus="Draft")
    boxing = add_opportunity(db, Title="Boxing Class", PartnerBrandName="Box Office Fitness")
    add_opportunity(db, Title="Tennis Drills", PartnerBrandName="The Best Group")

    options = admin_list(client)["options"]

    assert options["opportunities"][:3] == [
        {"id": str(tennis), "title": "Tennis Group Class"},
        {"id": str(draft), "title": "Bouldering Experience"},
        {"id": str(boxing), "title": "Boxing Class"},
    ]
    assert options["partners"] == ["Boulder Movement", "Box Office Fitness", "The Best Group"]


@pytest.fixture
def three_applications(db):
    """Tennis (Sport, The Best Group): Sarah Tan (Accepted) and Marcus Lim (New);
    Coffee (Lifestyle, Kurasu Singapore): Ben Koh (Reviewing). Returns the Opportunity ids."""
    tennis = add_opportunity(db, Title="Tennis Group Class", PartnerBrandName="The Best Group")
    coffee = add_opportunity(db, Title="Specialty Coffee", PartnerBrandName="Kurasu Singapore",
                             Category="Lifestyle")
    tennis_session = add_session(db, tennis, TOMORROW_10AM)
    coffee_session = add_session(db, coffee, TOMORROW_10AM)
    add_application(db, tennis, tennis_session, status="Accepted", FullName="Sarah Tan",
                    InstagramHandle="sarahtan.fit", TikTokHandle="sarah_on_tiktok", SubmittedAt=submitted(3))
    add_application(db, tennis, tennis_session, FullName="Marcus Lim", InstagramHandle="marcuslim.sg",
                    SubmittedAt=submitted(2))
    add_application(db, coffee, coffee_session, status="Reviewing", FullName="Ben Koh",
                    InstagramHandle="benkoh.sg", SubmittedAt=submitted(1))
    return {"tennis": tennis, "coffee": coffee}


@pytest.mark.parametrize("search, expected", [
    ("sarah", ["Sarah Tan"]),                       # creator name, ignoring case
    ("MARCUSLIM.SG", ["Marcus Lim"]),               # Instagram handle
    ("@benkoh", ["Ben Koh"]),                       # a handle typed with its @
    ("on_tiktok", ["Sarah Tan"]),                   # TikTok handle
    ("tennis group", ["Marcus Lim", "Sarah Tan"]),  # Opportunity title
    ("kurasu", ["Ben Koh"]),                        # Partner
    ("  .sg ", ["Ben Koh", "Marcus Lim"]),
    ("%", []),                                      # wildcards are text
    ("", ["Ben Koh", "Marcus Lim", "Sarah Tan"]),
])
def test_search_matches_creator_name_handles_opportunity_or_partner(
        client, db, signed_in, three_applications, search, expected):
    assert names(client, search=search) == expected


@pytest.mark.parametrize("param, value, expected", [
    ("partner", "The Best Group", ["Marcus Lim", "Sarah Tan"]),
    ("status", "Accepted", ["Sarah Tan"]),
    ("category", "Lifestyle", ["Ben Koh"]),
    ("status", "Archived", []),
    ("opportunityId", "abc", []),
])
def test_each_filter_narrows_the_list(client, db, signed_in, three_applications, param, value, expected):
    assert names(client, **{param: value}) == expected


def test_the_opportunity_filter_takes_an_opportunity_id(client, db, signed_in, three_applications):
    assert names(client, opportunityId=str(three_applications["coffee"])) == ["Ben Koh"]


def test_filters_and_search_combine(client, db, signed_in, three_applications):
    tennis = str(three_applications["tennis"])

    assert names(client, opportunityId=tennis, category="Sport", status="New") == ["Marcus Lim"]
    assert names(client, partner="The Best Group", search="sarah") == ["Sarah Tan"]
    assert names(client, opportunityId=tennis, search="kurasu") == []


# --- The detail -----------------------------------------------------------------

def test_the_detail_shows_everything_the_panel_needs(client, db, signed_in):
    opp = add_opportunity(db, PAID, Title="Activewear Campaign", PartnerBrandName="FullOut Activewear")
    session = add_session(db, opp, SATURDAY_8PM)
    application = add_application(
        db, opp, session, status="Reviewing", FullName="Sarah Tan", InstagramHandle="sarahtan.fit",
        TikTokHandle="sarahtan.tt", EmailAddress="sarah.tan@gmail.com", MobileWhatsAppNumber="+65 9111 2233",
        CreatorNote="I love outdoor sessions.", SubmittedAt=datetime(2026, 9, 10, 9, 0),
    )
    contact = {
        "fullName": "Sarah Tan", "instagram": "sarahtan.fit", "tiktok": "sarahtan.tt",
        "email": "sarah.tan@gmail.com", "phone": "+65 9111 2233",
    }
    session_shown = {"id": str(session), "date": "2026-09-26", "start": "20:00", "end": "21:00"}

    assert detail(client, application) == {
        "id": str(application),
        "status": "Reviewing",
        "contact": contact,
        "original": contact,
        "note": "I love outdoor sessions.",
        "submittedOn": "2026-09-10",
        "opportunity": {
            "id": str(opp), "title": "Activewear Campaign", "partner": "FullOut Activewear",
            "category": "Lifestyle", "compensationType": "Paid",
        },
        "session": session_shown,
        "originalSession": session_shown,
        "snapshot": {},
        "otherSessions": [],
    }


def test_the_detail_leaves_out_nothing_when_optional_fields_are_empty(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    shown = detail(client, application)

    assert (shown["contact"]["tiktok"], shown["original"]["tiktok"], shown["note"]) == (None, None, None)


def test_the_detail_has_no_internal_notes_or_skill_level(client, db, signed_in):
    # FS-ADM-APP-013, FLD-006; to_ask.md A3, B3.
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM), ExperienceSkillLevel="Advanced")

    shown = detail(client, application)

    assert "internalNotes" not in shown
    assert "skillLevel" not in shown
    assert "Advanced" not in str(shown)


def test_opening_an_application_never_changes_it(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))
    before = stamps(db, application)

    shown = detail(client, application)
    admin_list(client)

    assert detail(client, application) == shown
    assert stamps(db, application) == before


@pytest.mark.parametrize("application_id", ["999999", "abc"])
def test_an_unknown_application_is_not_found(client, db, signed_in, application_id):
    assert client.get(f"/api/admin/applications/{application_id}").status_code == 404
    assert update(client, application_id, status="Reviewing").status_code == 404


# --- Status changes -------------------------------------------------------------

@pytest.mark.parametrize("before, after", [
    ("New", "Reviewing"), ("New", "Accepted"), ("New", "Declined"),
    ("Accepted", "New"), ("Declined", "Accepted"), ("Accepted", "Declined"), ("Reviewing", "New"),
])
def test_any_status_can_be_set(client, db, signed_in, before, after):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM), status=before)

    response = update(client, application, status=after)

    assert response.status_code == 200
    assert response.json()["status"] == after
    assert detail(client, application)["status"] == after


def test_an_unknown_status_is_refused(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    response = update(client, application, status="Waitlisted")

    assert response.status_code == 422
    assert detail(client, application)["status"] == "New"


def test_each_status_change_is_stamped_in_sgt(client, db, signed_in, at):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    update(client, application, status="Reviewing")
    at(NOW + timedelta(hours=1))
    update(client, application, status="Accepted")
    at(NOW + timedelta(hours=2))
    update(client, application, status="Declined")

    row = stamps(db, application)
    assert row["ReviewingAt"] == NOW
    assert row["AcceptedAt"] == NOW + timedelta(hours=1)
    assert row["DeclinedAt"] == NOW + timedelta(hours=2)
    assert row["UpdatedAt"] == NOW + timedelta(hours=2)


def test_saving_the_same_status_keeps_its_stamp(client, db, signed_in, at):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))
    update(client, application, status="Reviewing")

    at(NOW + timedelta(hours=1))
    update(client, application, status="Reviewing")

    row = stamps(db, application)
    assert row["ReviewingAt"] == NOW
    assert row["UpdatedAt"] == NOW + timedelta(hours=1)


# --- Capacity, timing and cancellation -------------------------------------------

def test_accepting_into_a_full_session_is_refused(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=1)
    add_application(db, opp, session, status="Accepted")
    waiting = add_application(db, opp, session, status="Reviewing")

    response = update(client, waiting, status="Accepted")

    assert response.status_code == 409
    assert response.json()["detail"] == "Can't accept: this session is already full."
    assert detail(client, waiting)["status"] == "Reviewing"
    assert stamps(db, waiting)["AcceptedAt"] is None


def test_accepting_is_refused_once_the_session_has_started(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, NOW - timedelta(minutes=1)))

    response = update(client, application, status="Accepted")

    assert response.status_code == 409
    assert response.json()["detail"] == "Can't accept: this session has already started."
    assert detail(client, application)["status"] == "New"


def test_accepting_is_refused_while_the_session_is_cancelled(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM, cancelled=True))

    response = update(client, application, status="Accepted")

    assert response.status_code == 409
    assert response.json()["detail"] == "Can't accept: this session has been cancelled."


def test_a_session_without_creator_slots_has_no_room_to_accept_into(client, db, signed_in):
    # Only a Draft can have one (to_ask.md A1, D9).
    opp = add_opportunity(db, PublishingStatus="Draft")
    session = add_session(db, opp, TOMORROW_10AM, slots=None)
    application = add_application(db, opp, session)

    assert update(client, application, status="Accepted").status_code == 409


def test_the_last_slot_can_be_taken(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=2)
    add_application(db, opp, session, status="Accepted")
    application = add_application(db, opp, session)

    assert update(client, application, status="Accepted").status_code == 200


def test_an_accepted_application_can_still_be_saved_when_its_session_is_full_or_started(client, db, signed_in):
    opp = add_opportunity(db)
    full = add_session(db, opp, TOMORROW_10AM, slots=1)
    started = add_session(db, opp, NOW - timedelta(hours=1))
    for session in (full, started):
        application = add_application(db, opp, session, status="Accepted")

        response = update(client, application, status="Accepted")

        assert response.status_code == 200
        assert detail(client, application)["status"] == "Accepted"


def test_moving_away_from_accepted_never_needs_a_check(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, NOW - timedelta(hours=1), cancelled=True),
                                  status="Accepted")

    assert update(client, application, status="Declined").status_code == 200


@pytest.mark.parametrize("publishing_status", ["Draft", "Closed"])
def test_a_draft_or_closed_opportunity_does_not_block_processing(client, db, signed_in, publishing_status):
    opp = add_opportunity(db, PublishingStatus=publishing_status)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    assert update(client, application, status="Accepted").status_code == 200


def test_un_accepting_frees_the_slot_at_once(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=1)
    accepted = add_application(db, opp, session, status="Accepted")
    waiting = add_application(db, opp, session)
    assert client.get("/api/opportunities").json() == []  # fully booked: not on Discover

    assert update(client, accepted, status="Reviewing").status_code == 200

    [card] = client.get("/api/opportunities").json()
    assert (card["id"], card["slotsLeft"]) == (str(opp), 1)
    assert update(client, waiting, status="Accepted").status_code == 200


def test_new_reviewing_and_declined_applications_are_left_alone_when_a_session_fills(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=1)
    others = [add_application(db, opp, session, status=status) for status in ("New", "Reviewing", "Declined")]
    last = add_application(db, opp, session)

    update(client, last, status="Accepted")

    assert [detail(client, other)["status"] for other in others] == ["New", "Reviewing", "Declined"]


def test_two_admins_racing_for_the_last_slot_cannot_both_win(client, db, signed_in, test_settings):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=1)
    first, second = add_application(db, opp, session), add_application(db, opp, session)

    # Hold the Session's row lock so both requests reach the capacity check
    # and wait there, then let them race.
    blocker = connect(test_settings)
    try:
        blocker.start_transaction()
        cursor = blocker.cursor()
        cursor.execute("SELECT SessionID FROM Session WHERE SessionID = %s FOR UPDATE", (session,))
        cursor.fetchall()
        responses = {}
        threads = [
            threading.Thread(target=lambda a=a: responses.__setitem__(a, update(client, a, status="Accepted")))
            for a in (first, second)
        ]
        for thread in threads:
            thread.start()
        _wait_for_lock_waits(blocker, 2)
    finally:
        blocker.rollback()
        blocker.close()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(r.status_code for r in responses.values()) == [200, 409]
    assert sorted(detail(client, a)["status"] for a in (first, second)) == ["Accepted", "New"]


def _wait_for_lock_waits(conn, expected, timeout=10.0):
    """Waits until `expected` transactions are blocked on a row lock."""
    deadline = time.monotonic() + timeout
    cursor = conn.cursor()
    while time.monotonic() < deadline:
        cursor.execute("SELECT COUNT(*) FROM information_schema.INNODB_TRX WHERE trx_state = 'LOCK WAIT'")
        if cursor.fetchone()[0] >= expected:
            return
        # InnoDB refreshes INNODB_TRX only when it was last read over 0.1s ago.
        time.sleep(0.2)
    raise AssertionError(f"expected {expected} requests waiting on the Session's lock")


# --- What a save takes -----------------------------------------------------------

@pytest.mark.parametrize("field, value", [("internalNotes", "Strong fit"), ("skillLevel", "Advanced")])
def test_internal_notes_and_skill_level_are_refused(client, db, signed_in, field, value):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    response = update(client, application, status="Reviewing", **{field: value})

    assert response.status_code == 422
    assert field in response.json()["errors"]
    assert detail(client, application)["status"] == "New"


def test_a_save_with_nothing_to_change_is_refused(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    assert update(client, application).status_code == 422


# --- Correcting contact details (FS-ADM-APP-022..025) ----------------------------

SUBMITTED = {
    "fullName": "Sarah Tan", "instagram": "sarahtan.fit", "tiktok": "sarahtan.tt",
    "email": "sarah.tan@gmail.com", "phone": "+65 9111 2233",
}


def add_sarah(db, opp, session, **columns):
    return add_application(
        db, opp, session, FullName="Sarah Tan", InstagramHandle="sarahtan.fit", TikTokHandle="sarahtan.tt",
        EmailAddress="sarah.tan@gmail.com", MobileWhatsAppNumber="+65 9111 2233", **columns,
    )


def test_correcting_a_phone_number_changes_only_this_application_and_keeps_the_original(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    application = add_sarah(db, opp, session)
    other = add_sarah(db, opp, session)

    response = update(client, application, contact={**SUBMITTED, "phone": "+65 9999 0000"})

    assert response.status_code == 200
    assert response.json()["contact"] == {**SUBMITTED, "phone": "+65 9999 0000"}
    assert response.json()["original"] == SUBMITTED
    assert detail(client, application)["contact"]["phone"] == "+65 9999 0000"
    assert detail(client, other)["contact"] == SUBMITTED
    assert stamps(db, application)["UpdatedAt"] == NOW


def test_corrections_are_trimmed_and_a_handle_may_be_removed(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))

    shown = update(client, application, contact={**SUBMITTED, "fullName": "  Sarah Tan Li Ying ", "tiktok": " "}).json()

    assert shown["contact"] == {**SUBMITTED, "fullName": "Sarah Tan Li Ying", "tiktok": None}
    assert shown["original"]["tiktok"] == "sarahtan.tt"


def test_setting_a_field_back_to_the_original_clears_its_correction(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))
    update(client, application, contact={**SUBMITTED, "email": "sarah@new.sg", "tiktok": ""})

    shown = update(client, application, contact=SUBMITTED).json()

    assert shown["contact"] == shown["original"] == SUBMITTED


def test_the_list_shows_the_corrected_details(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))

    update(client, application, contact={**SUBMITTED, "fullName": "Sarah Lim", "email": "sarah@lim.sg",
                                         "instagram": "sarahlim", "tiktok": ""})

    [row] = admin_list(client)["applications"]
    assert (row["fullName"], row["email"], row["instagram"], row["tiktok"]) == (
        "Sarah Lim", "sarah@lim.sg", "sarahlim", None)


@pytest.mark.parametrize("search", ["sarah lim", "sarahlim", "Sarah Tan", "sarahtan.fit", "sarahtan.tt"])
def test_search_matches_the_corrected_and_the_original_details(client, db, signed_in, search):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))
    update(client, application, contact={**SUBMITTED, "fullName": "Sarah Lim", "instagram": "sarahlim", "tiktok": ""})

    assert names(client, search=search) == ["Sarah Lim"]


@pytest.mark.parametrize("field, value, message", [
    ("fullName", "  ", "Full name is required"),
    ("instagram", "", "Instagram handle is required"),
    ("instagram", "@sarahtan", "Enter your handle without the @"),  # the panel strips it, as the form does
    ("tiktok", "sarah tan", "Handles cannot contain spaces"),
    ("email", "sarah.tan@gmail", "Please enter a valid email address"),
    ("phone", "123", "Please enter a valid mobile number"),
    ("phone", None, "Mobile number is required"),
])
def test_an_invalid_correction_is_refused_with_the_register_forms_rules(
        client, db, signed_in, field, value, message):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))

    response = update(client, application, status="Reviewing", contact={**SUBMITTED, field: value})

    assert response.status_code == 422
    assert response.json()["errors"] == {f"contact.{field}": message}
    shown = detail(client, application)
    assert (shown["status"], shown["contact"]) == ("New", SUBMITTED)


def test_contact_details_must_be_sent_as_an_object(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))

    response = update(client, application, contact="Sarah Tan")

    assert response.status_code == 422
    assert "contact" in response.json()["errors"]


def test_the_status_and_a_correction_save_together(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_sarah(db, opp, add_session(db, opp, TOMORROW_10AM))

    shown = update(client, application, status="Reviewing", contact={**SUBMITTED, "phone": "+65 8888 1111"}).json()

    assert (shown["status"], shown["contact"]["phone"]) == ("Reviewing", "+65 8888 1111")


# --- The Opportunity at submission (FS-ADM-APP-010, HIS-001) --------------------

def test_the_detail_shows_the_opportunity_as_it_was_when_the_creator_applied(client, db, signed_in):
    opp = add_opportunity(db, PAID, Title="Activewear Campaign")
    session = add_session(db, opp, SATURDAY_8PM)
    submitted = client.post("/api/applications", json={
        "opportunityId": str(opp), "sessionId": str(session), "fullName": "Jamie Tan", "instagram": "jamie",
        "email": "jamie@example.com", "phone": "+65 9123 4567", "submissionKey": "snapshot-check",
    })
    db.cursor().execute("UPDATE Opportunity SET Title = 'Renamed', PaidAmount = 999 WHERE OpportunityID = %s", (opp,))
    db.commit()

    snapshot = detail(client, submitted.json()["id"])["snapshot"]

    assert list(snapshot) == ["opportunity", "compensation", "collaboration", "requirements", "session", "location"]
    assert snapshot["opportunity"]["title"] == "Activewear Campaign"
    assert snapshot["compensation"]["payment"] == {
        "currency": "SGD", "amount": 150, "basis": "Flat fee", "note": "Plus an activewear set to keep",
    }
    assert snapshot["session"] == {"date": "2026-09-26", "start": "20:00", "end": "21:00"}
    assert snapshot["location"]["area"] == "Tanjong Pagar"


def test_groups_an_older_snapshot_lacks_are_left_out(client, db, signed_in):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM), SubmissionSnapshot=json.dumps({
        "opportunity": {"title": "Tennis Group Class"}, "session": {"date": "2026-09-24"},
        "creator": {"fullName": "Test Creator"},
    }))

    assert detail(client, application)["snapshot"] == {
        "opportunity": {"title": "Tennis Group Class"}, "session": {"date": "2026-09-24"},
    }


# --- Sessions the Application can move to ----------------------------------------

def test_the_detail_lists_the_other_future_sessions_with_their_accepted_counts(client, db, signed_in):
    opp = add_opportunity(db)
    current = add_session(db, opp, TOMORROW_10AM)
    saturday = add_session(db, opp, SATURDAY_8PM, slots=3)
    sunday = add_session(db, opp, SATURDAY_8PM + timedelta(days=1), slots=1)
    add_session(db, opp, NOW - timedelta(hours=1))                          # started
    add_session(db, opp, SATURDAY_8PM + timedelta(days=2), cancelled=True)  # cancelled
    other_opp = add_opportunity(db)
    add_session(db, other_opp, SATURDAY_8PM)
    for status in ("Accepted", "Accepted", "Reviewing"):
        add_application(db, opp, saturday, status=status)
    add_application(db, opp, sunday, status="Accepted")
    application = add_application(db, opp, current)

    assert detail(client, application)["otherSessions"] == [
        {"id": str(saturday), "date": "2026-09-26", "start": "20:00", "end": "21:00", "slots": 3, "accepted": 2},
        {"id": str(sunday), "date": "2026-09-27", "start": "20:00", "end": "21:00", "slots": 1, "accepted": 1},
    ]


# --- Moving to another Session (FS-ADM-APP-026..030) -----------------------------

def accepted_counts(client, application_id):
    """Each other Session's id and Accepted Count, as the detail lists them."""
    return {s["id"]: s["accepted"] for s in detail(client, application_id)["otherSessions"]}


def test_moving_an_accepted_application_frees_the_old_slot_and_fills_the_new_one(client, db, signed_in):
    opp = add_opportunity(db)
    old = add_session(db, opp, TOMORROW_10AM, slots=1)
    new = add_session(db, opp, SATURDAY_8PM, slots=2)
    application = add_application(db, opp, old, status="Accepted")
    watcher = add_application(db, opp, add_session(db, opp, SATURDAY_8PM + timedelta(days=1)))
    assert accepted_counts(client, watcher) == {str(old): 1, str(new): 0}

    response = update(client, application, sessionId=str(new))

    assert response.status_code == 200
    shown = response.json()
    assert shown["session"] == {"id": str(new), "date": "2026-09-26", "start": "20:00", "end": "21:00"}
    assert shown["originalSession"]["id"] == str(old)
    assert shown["status"] == "Accepted"
    assert accepted_counts(client, watcher) == {str(old): 0, str(new): 1}
    [row] = [r for r in admin_list(client)["applications"] if r["id"] == str(application)]
    assert row["session"]["date"] == "2026-09-26"


def test_the_original_session_never_changes(client, db, signed_in):
    opp = add_opportunity(db)
    first, second, third = (add_session(db, opp, TOMORROW_10AM + timedelta(days=d)) for d in (0, 1, 2))
    application = add_application(db, opp, first)

    update(client, application, sessionId=second)
    shown = update(client, application, sessionId=third).json()

    assert (shown["originalSession"]["id"], shown["session"]["id"]) == (str(first), str(third))


def test_an_application_that_is_not_accepted_can_move_into_a_full_session(client, db, signed_in):
    opp = add_opportunity(db)
    full = add_session(db, opp, SATURDAY_8PM, slots=1)
    add_application(db, opp, full, status="Accepted")
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM), status="Reviewing")

    assert update(client, application, sessionId=str(full)).status_code == 200


def test_moving_an_accepted_application_into_a_full_session_is_refused(client, db, signed_in):
    opp = add_opportunity(db)
    old = add_session(db, opp, TOMORROW_10AM)
    full = add_session(db, opp, SATURDAY_8PM, slots=1)
    add_application(db, opp, full, status="Accepted")
    application = add_application(db, opp, old, status="Accepted")

    response = update(client, application, sessionId=str(full))

    assert response.status_code == 409
    assert response.json()["detail"] == "That session is full. Choose another or add slots first."
    assert detail(client, application)["session"]["id"] == str(old)


@pytest.mark.parametrize("destination, message", [
    ("started", "Can't move: that session has already started."),
    ("cancelled", "Can't move: that session has been cancelled."),
    ("other opportunity", "Can't move: that session belongs to another opportunity."),
])
def test_moving_into_a_started_cancelled_or_other_opportunitys_session_is_refused(
        client, db, signed_in, destination, message):
    opp = add_opportunity(db)
    old = add_session(db, opp, TOMORROW_10AM)
    sessions = {
        "started": add_session(db, opp, NOW - timedelta(minutes=1)),
        "cancelled": add_session(db, opp, SATURDAY_8PM, cancelled=True),
        "other opportunity": add_session(db, add_opportunity(db), SATURDAY_8PM),
    }
    application = add_application(db, opp, old, status="Reviewing")

    response = update(client, application, status="Accepted", sessionId=str(sessions[destination]))

    assert response.status_code == 409
    assert response.json()["detail"] == message
    shown = detail(client, application)
    assert (shown["status"], shown["session"]["id"]) == ("Reviewing", str(old))


@pytest.mark.parametrize("session_id", ["999999", "abc", 12.5, None])
def test_moving_to_an_unknown_session_is_refused(client, db, signed_in, session_id):
    opp = add_opportunity(db)
    application = add_application(db, opp, add_session(db, opp, TOMORROW_10AM))

    response = update(client, application, sessionId=session_id)

    assert response.status_code == 422
    assert response.json()["errors"] == {"sessionId": "Choose one of this opportunity's sessions"}


def test_accepting_while_moving_checks_the_new_session(client, db, signed_in):
    opp = add_opportunity(db)
    full_old = add_session(db, opp, TOMORROW_10AM, slots=1)
    add_application(db, opp, full_old, status="Accepted")
    new = add_session(db, opp, SATURDAY_8PM, slots=1)
    application = add_application(db, opp, full_old, status="Reviewing")

    response = update(client, application, status="Accepted", sessionId=str(new))

    assert response.status_code == 200
    shown = response.json()
    assert (shown["status"], shown["session"]["id"]) == ("Accepted", str(new))
    assert stamps(db, application)["AcceptedAt"] == NOW


def test_moving_to_the_current_session_changes_nothing(client, db, signed_in):
    opp = add_opportunity(db)
    full = add_session(db, opp, TOMORROW_10AM, slots=1)
    application = add_application(db, opp, full, status="Accepted")

    response = update(client, application, sessionId=str(full))

    assert response.status_code == 200
    assert response.json()["session"]["id"] == str(full)


def test_two_admins_moving_accepted_applications_into_the_last_slot_cannot_both_win(
        client, db, signed_in, test_settings):
    opp = add_opportunity(db)
    target = add_session(db, opp, SATURDAY_8PM, slots=1)
    first = add_application(db, opp, add_session(db, opp, TOMORROW_10AM), status="Accepted")
    second = add_application(db, opp, add_session(db, opp, TOMORROW_10AM + timedelta(hours=2)), status="Accepted")

    # Hold the target Session's row lock so both moves wait there, then let them race.
    blocker = connect(test_settings)
    try:
        blocker.start_transaction()
        cursor = blocker.cursor()
        cursor.execute("SELECT SessionID FROM Session WHERE SessionID = %s FOR UPDATE", (target,))
        cursor.fetchall()
        responses = {}
        threads = [
            threading.Thread(
                target=lambda a=a: responses.__setitem__(a, update(client, a, sessionId=str(target))))
            for a in (first, second)
        ]
        for thread in threads:
            thread.start()
        _wait_for_lock_waits(blocker, 2)
    finally:
        blocker.rollback()
        blocker.close()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(r.status_code for r in responses.values()) == [200, 409]
    assert sorted(detail(client, a)["session"]["id"] == str(target) for a in (first, second)) == [False, True]
