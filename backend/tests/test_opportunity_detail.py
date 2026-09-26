from datetime import datetime, timedelta

import pytest

from tests.factories import (
    PAID,
    add_application,
    add_deliverable,
    add_info,
    add_opportunity,
    add_schedule,
    add_session,
)

# Naive Singapore Time, as stored in the database.
NOW = datetime(2026, 9, 23, 12, 0)
TOMORROW_10AM = datetime(2026, 9, 24, 10, 0)


@pytest.fixture(autouse=True)
def frozen_now(at):
    at(NOW)


def detail(client, opportunity_id):
    response = client.get(f"/api/opportunities/{opportunity_id}")
    assert response.status_code == 200
    return response.json()


def test_an_open_barter_opportunity_returns_its_full_detail(client, db):
    opp = add_opportunity(db, DeliverableNote="Content must be original.")
    add_deliverable(db, opp, "Post 1 × Instagram Reel featuring the class")
    add_deliverable(db, opp, "Tag @lyfego.sg and @kallangtennis in your caption")
    add_info(db, opp, "Equipment", "Racquets can be provided")
    add_info(db, opp, "Attire", "Sports shoes")
    session = add_session(db, opp, TOMORROW_10AM, slots=3)

    assert detail(client, opp) == {
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
        "availableDates": ["2026-09-24"],
        "aboutExperience": "A group tennis class.",
        "collaborationType": "One-off",
        "deliverableType": "Fixed",
        "deliverableNote": "Content must be original.",
        "deliverables": [
            "Post 1 × Instagram Reel featuring the class",
            "Tag @lyfego.sg and @kallangtennis in your caption",
        ],
        "experienceLevels": ["Beginner", "Intermediate"],
        "additionalInfo": [
            {"label": "Equipment", "value": "Racquets can be provided"},
            {"label": "Attire", "value": "Sports shoes"},
        ],
        "venueName": "Kallang Tennis Centre",
        "fullAddress": "Stadium Road, Singapore 397630",
        "availability": "open",
        "weeklyClasses": [],
        "sessions": [{
            "id": str(session),
            "date": "2026-09-24",
            "start": "10:00",
            "end": "11:00",
            "slotsLeft": 3,
            "status": "available",
        }],
    }


def test_a_paid_opportunity_discloses_its_payment(client, db):
    opp = add_opportunity(db, PAID, DeliverableType="Flexible", ExperienceSkillLevel="All Levels")
    add_session(db, opp, TOMORROW_10AM)

    body = detail(client, opp)

    assert body["compensationType"] == "Paid"
    assert body["whatCreatorReceives"] is None
    assert body["payment"] == {
        "currency": "SGD",
        "amount": 150,
        "basis": "Flat fee",
        "note": "Plus an activewear set to keep",
    }
    assert body["deliverableType"] == "Flexible"
    assert body["deliverableNote"] is None
    assert body["experienceLevels"] == ["All Levels"]
    assert body["deliverables"] == []
    assert body["additionalInfo"] == []


def test_lists_only_upcoming_non_cancelled_sessions_soonest_first(client, db):
    opp = add_opportunity(db)
    later = add_session(db, opp, TOMORROW_10AM + timedelta(days=2), slots=4)
    add_session(db, opp, NOW - timedelta(hours=1))
    add_session(db, opp, NOW)
    add_session(db, opp, TOMORROW_10AM, cancelled=True)
    filled = add_session(db, opp, TOMORROW_10AM, slots=1)
    add_application(db, opp, filled, status="Accepted")
    for status in ("New", "Accepted", "Declined"):
        add_application(db, opp, later, status=status)

    sessions = detail(client, opp)["sessions"]

    assert [(s["id"], s["status"], s["slotsLeft"]) for s in sessions] == [
        (str(filled), "filled", 0),
        (str(later), "available", 3),
    ]


def test_an_opportunity_whose_upcoming_sessions_are_all_filled_is_fully_booked(client, db):
    opp = add_opportunity(db)
    for starts_at in (TOMORROW_10AM, TOMORROW_10AM + timedelta(days=1)):
        add_application(db, opp, add_session(db, opp, starts_at, slots=1), status="Accepted")

    body = detail(client, opp)

    assert body["availability"] == "fully_booked"
    assert [s["status"] for s in body["sessions"]] == ["filled", "filled"]
    assert body["nextSession"] is None
    assert body["slotsLeft"] == 0
    assert body["limitedSpots"] is False


def test_splits_listed_sessions_into_weekly_classes_and_one_off_sessions(client, db):
    opp = add_opportunity(db)
    saturday_8pm = datetime(2026, 9, 26, 20, 0)
    one_off = add_session(db, opp, datetime(2026, 9, 29, 19, 0))
    saturdays = add_schedule(db, opp, saturday_8pm)
    first = add_session(db, opp, saturday_8pm, recurrence_id=saturdays)
    filled = add_session(db, opp, saturday_8pm + timedelta(weeks=1), slots=1, recurrence_id=saturdays)
    add_application(db, opp, filled, status="Accepted")
    add_session(db, opp, saturday_8pm + timedelta(weeks=2), recurrence_id=saturdays, cancelled=True)
    sundays = add_schedule(db, opp, datetime(2026, 9, 27, 9, 0))
    sunday = add_session(db, opp, datetime(2026, 9, 27, 9, 0), recurrence_id=sundays)
    past_sundays = add_schedule(db, opp, datetime(2026, 9, 20, 9, 0))
    add_session(db, opp, datetime(2026, 9, 20, 9, 0), recurrence_id=past_sundays)

    body = detail(client, opp)

    assert [s["id"] for s in body["sessions"]] == [str(one_off)]
    assert body["weeklyClasses"] == [
        {
            "id": str(saturdays),
            "day": "Saturday",
            "start": "20:00",
            "end": "21:00",
            "sessions": [
                {"id": str(first), "date": "2026-09-26", "start": "20:00", "end": "21:00",
                 "slotsLeft": 3, "status": "available"},
                {"id": str(filled), "date": "2026-10-03", "start": "20:00", "end": "21:00",
                 "slotsLeft": 0, "status": "filled"},
            ],
        },
        {
            "id": str(sundays),
            "day": "Sunday",
            "start": "09:00",
            "end": "10:00",
            "sessions": [
                {"id": str(sunday), "date": "2026-09-27", "start": "09:00", "end": "10:00",
                 "slotsLeft": 3, "status": "available"},
            ],
        },
    ]


def test_a_session_whose_recurring_schedule_is_missing_is_listed_as_one_off(client, db):
    opp = add_opportunity(db)
    orphan = add_session(db, opp, TOMORROW_10AM, recurrence_id=999)

    body = detail(client, opp)

    assert [s["id"] for s in body["sessions"]] == [str(orphan)]
    assert body["weeklyClasses"] == []
    [card] = client.get("/api/opportunities").json()
    assert card["weeklyClasses"] == []


def test_a_closed_opportunity_is_closed_and_offers_no_sessions(client, db):
    opp = add_opportunity(db, PublishingStatus="Closed")
    add_session(db, opp, TOMORROW_10AM)

    body = detail(client, opp)

    assert body["availability"] == "closed"
    assert body["sessions"] == []
    assert body["nextSession"] is None


def test_a_live_opportunity_without_upcoming_sessions_is_closed(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, NOW - timedelta(days=1))
    add_session(db, opp, TOMORROW_10AM, cancelled=True)

    body = detail(client, opp)

    assert body["availability"] == "closed"
    assert body["sessions"] == []


def test_limited_spots_when_two_or_fewer_slots_remain(client, db):
    opp = add_opportunity(db)
    add_session(db, opp, TOMORROW_10AM, slots=1)
    add_session(db, opp, TOMORROW_10AM + timedelta(days=1), slots=1)

    assert detail(client, opp)["limitedSpots"] is True


def test_a_draft_opportunity_is_not_found(client, db):
    opp = add_opportunity(db, PublishingStatus="Draft")
    add_session(db, opp, TOMORROW_10AM)

    assert client.get(f"/api/opportunities/{opp}").status_code == 404


@pytest.mark.parametrize("opportunity_id", ["999999", "abc", "1.5", "²"])
def test_an_unknown_opportunity_is_not_found(client, db, opportunity_id):
    assert client.get(f"/api/opportunities/{opportunity_id}").status_code == 404
