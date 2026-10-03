"""Opportunity fields as the FS: Creator Slots, Payment, Experience / Skill Levels
and the cover image (Admin ticket 10)."""

import json
from datetime import datetime

import pytest

from tests.factories import BARTER, add_opportunity, add_session
from tests.test_admin_save_opportunity import EMPTY_FORM, FILLED_FORM, create, created, editing, form_of, save

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)  # a Wednesday
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)

LIVE = {**FILLED_FORM, "publishingStatus": "Live"}
SATURDAYS = {"days": ["Sat"], "start": "20:00", "end": "21:00", "startDate": "2026-09-26", "endDate": "",
             "slots": ""}


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def errors_of(response):
    assert response.status_code == 422, response.json()
    return response.json()["errors"]


def stored(db, column, opportunity_id):
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor()
    cursor.execute(f"SELECT {column} FROM Opportunity WHERE OpportunityID = %s", (opportunity_id,))
    return cursor.fetchone()[0]


# Creator Slots

def test_publishing_needs_creator_slots_on_every_session_row(client, db, signed_in):
    sessions = [{**FILLED_FORM["sessions"][0], "slots": ""}, FILLED_FORM["sessions"][1]]

    assert errors_of(create(client, {**LIVE, "sessions": sessions})) == {"sessions.0.slots": "Enter Creator Slots"}


def test_publishing_needs_a_recurring_schedules_default_creator_slots(client, db, signed_in):
    form = {**LIVE, "scheduleType": "recurring", "recurring": SATURDAYS, "sessions": []}

    assert errors_of(create(client, form)) == {"recurring.slots": "Enter Creator Slots per session"}


def test_creator_slots_are_a_whole_number_from_1_with_no_unlimited(client, db, signed_in):
    sessions = [{**FILLED_FORM["sessions"][0], "slots": "0"}]

    assert errors_of(create(client, {**EMPTY_FORM, "sessions": sessions})) == {
        "sessions.0.slots": "Enter a whole number from 1 to 10000"}


def test_a_draft_saves_with_blank_slots_payment_and_cover_image(client, db, signed_in):
    form = {
        **FILLED_FORM, "heroImage": "", "paymentAmount": "", "paymentBasis": None,
        "sessions": [{**FILLED_FORM["sessions"][0], "slots": ""}],
        "scheduleType": "recurring", "recurring": SATURDAYS,
    }

    saved = created(client, form)

    assert saved["sessions"][0]["slots"] is None
    assert saved["recurring"]["slots"] is None
    assert (saved["heroImage"], saved["paymentAmount"], saved["paymentBasis"]) == ("", None, None)


def test_a_session_without_creator_slots_is_never_available(client, db):
    # Only a Draft can have one, but a Live one stored before ticket 10 isn't on Discover.
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM, slots=None)

    assert client.get("/api/opportunities").json() == []
    [session] = client.get(f"/api/opportunities/{opp}").json()["sessions"]
    assert (session["status"], session["slotsLeft"]) == ("filled", 0)


# Payment

def test_publishing_a_paid_opportunity_needs_an_amount_and_a_payment_basis(client, db, signed_in):
    form = {**LIVE, "compensationType": "Paid", "paymentAmount": "", "paymentBasis": None}

    assert errors_of(create(client, form)) == {
        "paymentAmount": "Payment amount is required",
        "paymentBasis": "Choose a payment basis",
    }


def test_a_barter_opportunity_publishes_without_an_amount_or_basis(client, db, signed_in):
    form = {**LIVE, "compensationType": "Barter", "whatCreatorReceives": "A free class",
            "paymentAmount": "", "paymentBasis": None}

    assert created(client, form)["publishingStatus"] == "Live"


def test_a_hidden_invalid_amount_or_basis_doesnt_stop_a_barter_save(client, db, signed_in):
    # The form keeps the Paid fields while Barter is chosen, but hides them.
    form = {**FILLED_FORM, "compensationType": "Barter", "whatCreatorReceives": "A free class",
            "paymentAmount": "abc", "paymentBasis": "Per hour"}

    saved = created(client, form)

    assert (saved["paymentAmount"], saved["paymentBasis"]) == (None, None)


@pytest.mark.parametrize("amount, expected", [
    ("150", 150), (150, 150), ("150.5", 150.5), ("150.50", 150.5), (" 80.25 ", 80.25), (99.9, 99.9),
    ("99999999.99", 99999999.99),
])
def test_the_payment_amount_is_a_number_with_up_to_2_decimals(client, db, signed_in, amount, expected):
    assert created(client, {**FILLED_FORM, "paymentAmount": amount})["paymentAmount"] == expected


@pytest.mark.parametrize("amount", ["0", "0.00", "-5", "150.555", "1,000", "S$150", "abc", "100000000", True, 0])
def test_an_invalid_payment_amount_is_refused(client, db, signed_in, amount):
    assert errors_of(create(client, {**FILLED_FORM, "paymentAmount": amount})) == {
        "paymentAmount": "Enter an amount, e.g. 150"}


def test_the_payment_is_stored_as_currency_amount_and_basis(client, db, signed_in):
    saved = created(client, {**FILLED_FORM, "currency": "USD", "paymentAmount": "150.5",
                             "paymentBasis": "Per completed collaboration"})

    assert str(stored(db, "PaidAmount", saved["id"])) == "150.50"
    assert stored(db, "PaidPaymentBasis", saved["id"]) == "Per completed collaboration"
    assert stored(db, "PaidCurrency", saved["id"]) == "USD"


def test_the_edit_page_loads_and_saves_the_payment(client, db, signed_in):
    saved = created(client, FILLED_FORM)
    loaded = editing(client, saved["id"])
    assert {key: loaded[key] for key in ("currency", "paymentAmount", "paymentBasis", "paymentNotes")} == {
        "currency": "USD", "paymentAmount": 150, "paymentBasis": "Per post", "paymentNotes": "Paid within 14 days"}

    response = save(client, saved["id"], {**form_of(loaded), "currency": "SGD", "paymentAmount": "99.90",
                                          "paymentBasis": "Flat fee", "paymentNotes": "", "version": loaded["version"]})

    assert response.status_code == 200, response.json()
    reloaded = editing(client, saved["id"])
    assert {key: reloaded[key] for key in ("currency", "paymentAmount", "paymentBasis", "paymentNotes")} == {
        "currency": "SGD", "paymentAmount": 99.9, "paymentBasis": "Flat fee", "paymentNotes": ""}


def test_discover_the_detail_and_the_admin_list_show_the_structured_payment(client, db, signed_in):
    saved = created(client, {**LIVE, "currency": "SGD", "paymentNotes": "Activewear set"})
    payment = {"currency": "SGD", "amount": 150, "basis": "Per post", "note": "Activewear set"}

    [card] = client.get("/api/opportunities").json()
    assert card["payment"] == payment
    assert client.get(f"/api/opportunities/{saved['id']}").json()["payment"] == payment
    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["payment"] == payment


def test_a_new_applications_snapshot_stores_the_structured_payment(client, db, signed_in):
    saved = created(client, {**LIVE, "paymentNotes": ""})
    session = saved["sessions"][0]["id"]

    response = client.post("/api/applications", json={
        "opportunityId": saved["id"], "sessionId": session, "fullName": "Jamie Tan",
        "instagram": "jamie.moves", "email": "jamie@example.com", "phone": "+65 9123 4567",
        "submissionKey": "3f1c2d7e-0000-4000-8000-000000000010",
    })

    assert response.status_code == 201, response.json()
    db.commit()
    cursor = db.cursor()
    cursor.execute("SELECT SubmissionSnapshot FROM Application")
    [(snapshot,)] = cursor.fetchall()
    assert json.loads(snapshot)["compensation"]["payment"] == {
        "currency": "USD", "amount": 150, "basis": "Per post", "note": None}


# Experience / Skill Levels

def test_several_skill_levels_save_in_order_and_show_on_the_creator_portal(client, db, signed_in):
    saved = created(client, {**LIVE, "experienceLevels": ["Advanced", "Beginner"]})

    assert saved["experienceLevels"] == ["Beginner", "Advanced"]
    assert stored(db, "ExperienceSkillLevel", saved["id"]) == "Beginner,Advanced"
    assert client.get(f"/api/opportunities/{saved['id']}").json()["experienceLevels"] == ["Beginner", "Advanced"]


@pytest.mark.parametrize("levels", [["All Levels", "Beginner"], ["Not Applicable", "All Levels"],
                                    ["Advanced", "Not Applicable"]])
def test_all_levels_and_not_applicable_go_on_their_own(client, db, signed_in, levels):
    assert errors_of(create(client, {**EMPTY_FORM, "experienceLevels": levels})) == {
        "experienceLevels": "All Levels and Not Applicable can't be combined with other levels"}


@pytest.mark.parametrize("levels, message", [
    ([], "Choose at least one level"),
    (None, "Choose at least one level"),
    (["Expert"], "Choose Beginner, Intermediate, Advanced, All Levels or Not Applicable"),
])
def test_at_least_one_known_level_is_picked(client, db, signed_in, levels, message):
    assert errors_of(create(client, {**EMPTY_FORM, "experienceLevels": levels})) == {"experienceLevels": message}


def test_an_older_rows_unknown_levels_load_as_all_levels(client, db, signed_in):
    opp = add_opportunity(db, BARTER, ExperienceSkillLevel="Expert")

    assert editing(client, opp)["experienceLevels"] == ["All Levels"]


# Cover image

def test_publishing_needs_a_cover_image(client, db, signed_in):
    assert errors_of(create(client, {**LIVE, "heroImage": "  "})) == {"heroImage": "Add a cover image"}
