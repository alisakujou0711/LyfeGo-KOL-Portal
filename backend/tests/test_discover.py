from datetime import datetime, timedelta

import pytest

from tests.factories import PAID, add_application, add_opportunity, add_schedule, add_session

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def discover(client):
    response = client.get("/api/opportunities")
    assert response.status_code == 200
    return response.json()


def titles(client):
    return [card["title"] for card in discover(client)]


def test_a_barter_opportunity_is_listed_as_a_card_summary(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM, slots=3)

    assert discover(client) == [{
        "id": str(opp),
        "title": "Tennis Group Class",
        "partner": "Kallang Tennis Centre",
        "category": "Sport",
        "subcategory": "Tennis",
        "compensationType": "Barter",
        "whatCreatorReceives": "Complimentary group tennis class (1 hour)",
        "payment": None,
        "area": "Kallang",
        "heroImage": "https://images.example/tennis.jpg",
        "nextSession": {"date": "2026-09-24", "start": "10:00", "end": "11:00"},
        "moreSessionsCount": 0,
        "slotsLeft": 3,
        "limitedSpots": False,
        "experienceLevels": ["Beginner", "Intermediate"],
        "deliverableType": "Fixed",
        "collaborationType": "One-off",
        "availableDates": ["2026-09-24"],
        "weeklyClasses": [],
    }]


def test_a_card_lists_the_distinct_dates_of_its_available_sessions_in_order(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM + timedelta(days=3))
    add_session(db, opp, TOMORROW_10AM)
    add_session(db, opp, TOMORROW_10AM + timedelta(hours=4))
    add_session(db, opp, TOMORROW_10AM + timedelta(days=1), cancelled=True)
    add_session(db, opp, NOW - timedelta(hours=1))
    filled = add_session(db, opp, TOMORROW_10AM + timedelta(days=2), slots=1)
    add_application(db, opp, filled, status="Accepted")

    [card] = discover(client)

    assert card["availableDates"] == ["2026-09-24", "2026-09-27"]


def test_a_card_lists_the_weekly_classes_that_still_have_an_available_session(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM)
    sundays = add_schedule(db, opp, datetime(2026, 9, 27, 9, 0))
    add_session(db, opp, datetime(2026, 9, 27, 9, 0), recurrence_id=sundays)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0))
    add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)
    fridays = add_schedule(db, opp, datetime(2026, 9, 25, 18, 0))
    filled = add_session(db, opp, datetime(2026, 9, 25, 18, 0), slots=1, recurrence_id=fridays)
    add_application(db, opp, filled, status="Accepted")
    add_session(db, opp, datetime(2026, 10, 2, 18, 0), recurrence_id=fridays, cancelled=True)

    [card] = discover(client)

    assert card["weeklyClasses"] == [
        {"day": "Saturday", "start": "20:00", "end": "21:00"},
        {"day": "Sunday", "start": "09:00", "end": "10:00"},
    ]


def test_a_paid_opportunity_card_discloses_its_payment(client, db):
    opp = add_opportunity(db, PAID)
    add_session(db, opp, TOMORROW_10AM)

    [card] = discover(client)

    assert card["compensationType"] == "Paid"
    assert card["whatCreatorReceives"] is None
    assert card["payment"] == {
        "currency": "SGD",
        "amount": 150,
        "basis": "Flat fee",
        "note": "Plus an activewear set to keep",
    }


def test_only_open_opportunities_are_listed(client, db):
    add_session(db, add_opportunity(db, Title="Open"), TOMORROW_10AM)
    add_session(db, add_opportunity(db, Title="Draft", PublishingStatus="Draft"), TOMORROW_10AM)
    add_session(db, add_opportunity(db, Title="Closed", PublishingStatus="Closed"), TOMORROW_10AM)
    fully_booked = add_opportunity(db, Title="Fully booked")
    add_application(db, fully_booked, add_session(db, fully_booked, TOMORROW_10AM, slots=1),
                    status="Accepted")
    add_session(db, add_opportunity(db, Title="All expired"), NOW - timedelta(hours=1))
    add_session(db, add_opportunity(db, Title="All cancelled"), TOMORROW_10AM, cancelled=True)
    add_opportunity(db, Title="No sessions")

    assert titles(client) == ["Open"]


def test_a_session_starting_right_now_no_longer_counts(client, db):
    add_session(db, add_opportunity(db, Title="Starting now"), NOW)
    add_session(db, add_opportunity(db, Title="Starting in a minute"), NOW + timedelta(minutes=1))

    assert titles(client) == ["Starting in a minute"]


def test_an_opportunity_with_many_sessions_appears_once_with_its_next_available_session(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, NOW - timedelta(days=1))
    add_session(db, opp, NOW + timedelta(days=5))
    add_session(db, opp, TOMORROW_10AM + timedelta(hours=9))
    add_session(db, opp, TOMORROW_10AM, cancelled=True)
    filled = add_session(db, opp, NOW + timedelta(hours=2), slots=1)
    add_application(db, opp, filled, status="Accepted")

    [card] = discover(client)

    assert card["nextSession"] == {"date": "2026-09-24", "start": "19:00", "end": "20:00"}
    assert card["moreSessionsCount"] == 1


def test_opportunities_are_ordered_by_soonest_next_available_session(client, db):
    later = add_opportunity(db, Title="Later")
    add_session(db, later, NOW + timedelta(days=3))
    sooner = add_opportunity(db, Title="Sooner")
    add_session(db, sooner, NOW + timedelta(days=1))
    # Its earliest Session is Filled, so it is ordered by its second one.
    filled_first = add_opportunity(db, Title="Filled first")
    add_application(db, filled_first, add_session(db, filled_first, NOW + timedelta(hours=1), slots=1),
                    status="Accepted")
    add_session(db, filled_first, NOW + timedelta(days=2))

    assert titles(client) == ["Sooner", "Filled first", "Later"]


def test_slots_left_count_only_accepted_applications(client, db):
    opp = add_opportunity(db)
    first = add_session(db, opp, TOMORROW_10AM, slots=4)
    second = add_session(db, opp, TOMORROW_10AM + timedelta(days=1), slots=3)
    for status in ("New", "Reviewing", "Declined", "Accepted"):
        add_application(db, opp, first, status=status)
    add_application(db, opp, second, status="Accepted")

    [card] = discover(client)

    assert card["slotsLeft"] == 3 + 2


def test_an_application_consumes_a_slot_of_its_current_session_only(client, db):
    opp = add_opportunity(db)
    original = add_session(db, opp, TOMORROW_10AM, slots=1)
    current = add_session(db, opp, TOMORROW_10AM + timedelta(days=1), slots=2)
    application = add_application(db, opp, original, status="Accepted")
    db.cursor().execute(
        "UPDATE Application SET CurrentSessionID = %s WHERE ApplicationID = %s", (current, application)
    )
    db.commit()

    [card] = discover(client)

    assert card["nextSession"]["date"] == "2026-09-24"
    assert card["slotsLeft"] == 1 + 1


@pytest.mark.parametrize("accepted, limited", [(2, False), (3, True)], ids=["3 left", "2 left"])
def test_limited_spots_when_two_or_fewer_slots_remain(client, db, accepted, limited):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM, slots=5)
    for _ in range(accepted):
        add_application(db, opp, session, status="Accepted")

    [card] = discover(client)

    assert card["limitedSpots"] is limited
