import json
from datetime import date, datetime

import pytest

from app.db import connect
from app.seed import reset_database

TODAY = date(2026, 9, 23)  # a Wednesday
NOW = datetime(2026, 9, 23, 8, 0)

# The design's nine Opportunities, in the design's order.
DISCOVER_ORDER = [
    "Tennis Group Class",
    "Reformer Pilates Experience",
    "Boxing Class Creator Experience",
    "Bouldering Experience",
    "Specialty Coffee Experience for Two",
    "Recovery Experience",
    "Activewear Creator Campaign",
    "Healthy Dining Experience for Two",
    "Wellness Product Creator Campaign",
]

# Not attended in person, so no Venue Name or Full Address.
NOT_PHYSICAL = {"Activewear Creator Campaign", "Wellness Product Creator Campaign"}


@pytest.fixture
def seeded(client, test_settings, at):
    """The demo dataset reset for TODAY, viewed at NOW; returns Opportunity ids by title."""
    reset_database(test_settings, today=TODAY)
    at(NOW)
    return {row["Title"]: row["OpportunityID"] for row in _query(
        test_settings, "SELECT OpportunityID, Title FROM Opportunity")}


def _query(settings, sql, params=()):
    """Reads the seeded database directly; the `db` fixture would empty it first."""
    conn = connect(settings)
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params)
        return cursor.fetchall()
    finally:
        conn.close()


def _detail(client, ids, title):
    response = client.get(f"/api/opportunities/{ids[title]}")
    assert response.status_code == 200
    return response.json()


def _titles(client):
    return [card["title"] for card in client.get("/api/opportunities").json()]


def _cards(client):
    return {card["title"]: card for card in client.get("/api/opportunities").json()}


def test_reset_can_run_repeatedly(client, test_settings, at):
    reset_database(test_settings, today=TODAY)
    reset_database(test_settings, today=TODAY)
    at(NOW)

    assert _titles(client) == DISCOVER_ORDER


def test_discover_shows_the_nine_design_opportunities_in_order_and_the_extras_only_by_link(client, seeded):
    assert _titles(client) == DISCOVER_ORDER
    assert _detail(client, seeded, "Yoga Flow with Sublime")["availability"] == "fully_booked"
    assert _detail(client, seeded, "Padel Session")["availability"] == "closed"


def test_tennis_has_a_saturday_weekly_class_and_a_one_off_tuesday(client, seeded, test_settings):
    tennis = _detail(client, seeded, "Tennis Group Class")
    [weekly] = tennis["weeklyClasses"]
    [schedule] = _query(test_settings, "SELECT * FROM RecurringSchedule WHERE OpportunityID = %s",
                        (seeded["Tennis Group Class"],))
    generated = _query(test_settings, "SELECT CreatorSlots FROM Session WHERE RecurrenceID = %s",
                       (schedule["RecurrenceID"],))

    assert _cards(client)["Tennis Group Class"]["weeklyClasses"] == [
        {"day": "Saturday", "start": "20:00", "end": "21:00"},
    ]
    assert [s["date"] for s in weekly["sessions"]] == [
        "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17",
        "2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14",
    ]
    assert [s["status"] for s in weekly["sessions"]][:3] == ["available", "filled", "available"]
    assert [(s["date"], s["start"], s["end"]) for s in tennis["sessions"]] == [("2026-09-29", "19:00", "20:00")]
    assert schedule["EndDate"] is None
    assert {row["CreatorSlots"] for row in generated} == {schedule["DefaultCreatorSlots"]}


def test_sessions_fall_on_the_weekdays_the_design_shows(client, seeded):
    def weekdays(title):
        return [date.fromisoformat(s["date"]).strftime("%a") for s in _detail(client, seeded, title)["sessions"]]

    assert weekdays("Reformer Pilates Experience") == ["Sat", "Sat", "Sat"]
    assert weekdays("Boxing Class Creator Experience") == ["Sat", "Sun", "Sat"]
    assert weekdays("Bouldering Experience") == ["Sun", "Sun", "Sat"]


def test_seed_covers_every_creator_facing_situation(client, seeded, test_settings):
    cards = _cards(client)
    recovery_sessions = _query(test_settings, "SELECT IsCancelled FROM Session WHERE OpportunityID = %s",
                               (seeded["Recovery Experience"],))

    assert cards["Tennis Group Class"]["limitedSpots"] is False
    assert cards["Specialty Coffee Experience for Two"]["limitedSpots"] is True
    assert [s["status"] for s in _detail(client, seeded, "Boxing Class Creator Experience")["sessions"]] == [
        "available", "available", "filled",
    ]
    assert sorted(bool(row["IsCancelled"]) for row in recovery_sessions) == [False, True]
    assert len(_detail(client, seeded, "Recovery Experience")["sessions"]) == 1  # the cancelled one is hidden


def test_paid_values_come_from_the_teammates_data(client, seeded):
    paid = {title: card["payment"] for title, card in _cards(client).items() if card["compensationType"] == "Paid"}

    assert {title: (p["currency"], p["amount"], p["basis"], p["note"]) for title, p in paid.items()} == {
        "Tennis Group Class": ("SGD", 150, "Per completed collaboration", None),
        "Boxing Class Creator Experience": (
            "SGD", 100, "Per completed collaboration", "Complimentary boxing class"),
        "Activewear Creator Campaign": (
            "SGD", 200, "Per completed collaboration", "Activewear set (yours to keep)"),
        "Wellness Product Creator Campaign": (
            "SGD", 150, "Per completed collaboration", "Wellness product bundle (yours to keep)"),
    }


def test_every_live_opportunity_has_the_fields_live_requires(client, seeded):
    for card in client.get("/api/opportunities").json():
        detail = _detail(client, seeded, card["title"])
        for field in ("title", "partner", "category", "heroImage", "aboutExperience", "collaborationType",
                      "deliverableType", "deliverables", "experienceLevels", "area"):
            assert detail[field], f"{card['title']} is missing {field}"
        if card["title"] in NOT_PHYSICAL:
            assert (detail["area"], detail["venueName"], detail["fullAddress"]) == ("Singapore", None, None)
        else:
            assert detail["venueName"] and detail["fullAddress"], card["title"]
        if detail["compensationType"] == "Paid":
            payment = detail["payment"]
            assert payment["currency"] and payment["amount"] and payment["basis"], card["title"]
        else:
            assert detail["whatCreatorReceives"], card["title"]


def test_the_tennis_hero_points_at_the_image_in_public(client, seeded):
    assert _detail(client, seeded, "Tennis Group Class")["heroImage"] == "/images/tennis-hero.jpg"


def test_sessions_are_small_and_applications_span_statuses_within_their_own_opportunity(seeded, test_settings):
    slots = [row["CreatorSlots"] for row in _query(test_settings, "SELECT CreatorSlots FROM Session")]
    applications = _query(test_settings, """
        SELECT a.Status, a.OpportunityID, o.OpportunityID AS OriginalOwner, c.OpportunityID AS CurrentOwner
          FROM Application a
          JOIN Session o ON o.SessionID = a.OriginalSessionID
          JOIN Session c ON c.SessionID = a.CurrentSessionID""")

    assert all(1 <= s <= 5 for s in slots)
    assert {a["Status"] for a in applications} == {"New", "Reviewing", "Accepted", "Declined"}
    assert all(a["OpportunityID"] == a["OriginalOwner"] == a["CurrentOwner"] for a in applications)


def test_seeded_applications_look_like_submitted_ones(seeded, test_settings):
    applications = _query(test_settings, """
        SELECT Status, SubmissionSnapshot, ReviewingAt, AcceptedAt, DeclinedAt FROM Application""")

    for application in applications:
        snapshot = json.loads(application["SubmissionSnapshot"])
        assert set(snapshot) == {"opportunity", "compensation", "collaboration", "requirements", "session",
                                 "location", "creator"}
        assert snapshot["collaboration"]["deliverables"]
        assert (application["ReviewingAt"] is not None) == (application["Status"] != "New")
        assert (application["AcceptedAt"] is not None) == (application["Status"] == "Accepted")
        assert (application["DeclinedAt"] is not None) == (application["Status"] == "Declined")


@pytest.mark.parametrize("today, first_saturday", [
    (date(2027, 1, 10), "2027-01-16"),  # a Sunday
    (date(2026, 9, 26), "2026-10-03"),  # a Saturday: its own Sessions would start too soon
])
def test_seed_dates_and_order_follow_the_day_it_is_run(client, test_settings, at, today, first_saturday):
    reset_database(test_settings, today=today)
    at(datetime.combine(today, datetime.max.time()))

    cards = client.get("/api/opportunities").json()

    assert [card["title"] for card in cards] == DISCOVER_ORDER
    assert cards[0]["nextSession"]["date"] == first_saturday  # Tennis's weekly class
