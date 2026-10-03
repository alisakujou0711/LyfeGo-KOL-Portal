from datetime import datetime, timedelta

import pytest

from tests.factories import (
    NOW, PAID, TOMORROW_10AM, add_application, add_opportunity, add_schedule, add_session,
)


pytestmark = pytest.mark.usefixtures("frozen_now")


def admin_list(client, **params):
    response = client.get("/api/admin/opportunities", params=params)
    assert response.status_code == 200
    return response.json()


def titles(client, **params):
    return [row["title"] for row in admin_list(client, **params)["opportunities"]]


def test_the_list_needs_a_signed_in_admin(client, db):
    assert client.get("/api/admin/opportunities").status_code == 401


def test_a_row_shows_what_the_admin_table_needs(client, db, signed_in):
    opp = add_opportunity(db)
    session = add_session(db, opp, TOMORROW_10AM)
    add_application(db, opp, session, status="New")
    add_application(db, opp, session, status="Declined")
    db.cursor().execute("UPDATE Opportunity SET UpdatedAt = '2026-09-14 23:30:00' WHERE OpportunityID = %s", (opp,))
    db.commit()

    [row] = admin_list(client)["opportunities"]

    assert row == {
        "id": str(opp),
        "title": "Tennis Group Class",
        "partner": "Kallang Tennis Centre",
        "heroImage": "https://images.example/tennis.jpg",
        "category": "Sport",
        "compensationType": "Barter",
        "whatCreatorReceives": "Complimentary group tennis class (1 hour)",
        "payment": None,
        "collaborationType": "One-off",
        "schedule": {
            "nextSession": {"date": "2026-09-24", "start": "10:00", "end": "11:00"},
            "availableDates": ["2026-09-24"],
            "weeklyClasses": [],
        },
        "applicationsCount": 2,
        "publishingStatus": "Live",
        "availability": "open",
        "canDelete": False,
        "lastUpdated": "2026-09-14",  # the SGT date of the last save
    }


def test_a_paid_row_carries_its_payment(client, db, signed_in):
    add_opportunity(db, PAID)

    [row] = admin_list(client)["opportunities"]

    assert row["whatCreatorReceives"] is None
    assert row["payment"] == {
        "currency": "SGD", "amount": 150, "basis": "Flat fee",
        "note": "Plus an activewear set to keep",
    }


def test_every_opportunity_is_listed_whatever_its_status_oldest_first(client, db, signed_in):
    add_opportunity(db, Title="First", PublishingStatus="Closed")
    add_opportunity(db, Title="Second", PublishingStatus="Draft")
    add_opportunity(db, Title="Third", PublishingStatus="Live")  # no Sessions at all

    assert titles(client) == ["First", "Second", "Third"]


def test_the_counts_cover_every_opportunity_and_application_however_the_list_is_filtered(client, db, signed_in):
    live = add_opportunity(db, PublishingStatus="Live")
    add_opportunity(db, PublishingStatus="Live")
    draft = add_opportunity(db, PublishingStatus="Draft")
    closed = add_opportunity(db, PublishingStatus="Closed")
    for opp, statuses in ((live, ["New", "Accepted"]), (draft, []), (closed, ["Declined", "Reviewing", "New"])):
        session = add_session(db, opp, TOMORROW_10AM, slots=5)
        for status in statuses:
            add_application(db, opp, session, status=status)

    expected = {"total": 4, "live": 2, "draft": 1, "closed": 1, "applications": 5}
    assert admin_list(client)["counts"] == expected
    assert admin_list(client, status="Draft", search="nothing matches")["counts"] == expected


def test_search_matches_the_title_or_partner_ignoring_case(client, db, signed_in):
    add_opportunity(db, Title="Tennis Group Class", PartnerBrandName="Kallang Tennis Centre")
    add_opportunity(db, Title="Boxing Class", PartnerBrandName="Box Office Fitness")
    add_opportunity(db, Title="Specialty Coffee", PartnerBrandName="Kurasu Singapore")

    assert titles(client, search="class") == ["Tennis Group Class", "Boxing Class"]
    assert titles(client, search="KURASU") == ["Specialty Coffee"]
    assert titles(client, search="  office ") == ["Boxing Class"]
    assert titles(client, search="") == ["Tennis Group Class", "Boxing Class", "Specialty Coffee"]


def test_search_treats_wildcard_characters_as_text(client, db, signed_in):
    add_opportunity(db, Title="100% Recovery")
    add_opportunity(db, Title="Recovery_Lab")
    add_opportunity(db, Title="Recovery Lab")

    assert titles(client, search="%") == ["100% Recovery"]
    assert titles(client, search="y_L") == ["Recovery_Lab"]


@pytest.mark.parametrize("param, value, expected", [
    ("status", "Draft", ["Draft sport barter"]),
    ("status", "Closed", ["Closed lifestyle paid"]),
    ("category", "Lifestyle", ["Closed lifestyle paid", "Live lifestyle barter"]),
    ("compensation", "Paid", ["Closed lifestyle paid"]),
    ("collaborationType", "Ongoing", ["Live lifestyle barter"]),
    ("collaborationType", "One-off or Ongoing", ["Closed lifestyle paid"]),
])
def test_each_filter_narrows_the_list(client, db, signed_in, param, value, expected):
    add_opportunity(db, Title="Draft sport barter", PublishingStatus="Draft")
    add_opportunity(db, PAID, Title="Closed lifestyle paid", PublishingStatus="Closed",
                    CollaborationType="One-off or Ongoing")
    add_opportunity(db, Title="Live lifestyle barter", Category="Lifestyle", CollaborationType="Ongoing")

    assert titles(client, **{param: value}) == expected


def test_filters_and_search_combine(client, db, signed_in):
    add_opportunity(db, Title="Tennis Class", Category="Sport", PublishingStatus="Live")
    add_opportunity(db, Title="Tennis Drills", Category="Sport", PublishingStatus="Draft")
    add_opportunity(db, Title="Tennis Social", Category="Lifestyle", PublishingStatus="Live")
    add_opportunity(db, Title="Boxing Class", PartnerBrandName="Box Office Fitness",
                    Category="Sport", PublishingStatus="Live")

    assert titles(client, status="Live", category="Sport", search="tennis") == ["Tennis Class"]


def test_an_unknown_filter_value_matches_nothing(client, db, signed_in):
    add_opportunity(db)

    assert titles(client, status="Archived") == []


def test_the_schedule_covers_future_non_cancelled_sessions_including_filled_ones(client, db, signed_in):
    opp = add_opportunity(db)
    add_session(db, opp, NOW - timedelta(hours=1))  # started
    add_session(db, opp, TOMORROW_10AM, cancelled=True)
    filled = add_session(db, opp, TOMORROW_10AM + timedelta(days=2), slots=1)
    add_application(db, opp, filled, status="Accepted")
    add_session(db, opp, TOMORROW_10AM + timedelta(days=9))

    [row] = admin_list(client)["opportunities"]

    assert row["schedule"] == {
        "nextSession": {"date": "2026-09-26", "start": "10:00", "end": "11:00"},
        "availableDates": ["2026-09-26", "2026-10-03"],
        "weeklyClasses": [],
    }


def test_the_schedule_lists_weekly_classes_with_an_upcoming_session_soonest_first(client, db, signed_in):
    opp = add_opportunity(db)
    sundays = add_schedule(db, opp, datetime(2026, 9, 27, 9, 0))
    add_session(db, opp, datetime(2026, 9, 27, 9, 0), recurrence_id=sundays)
    saturdays = add_schedule(db, opp, datetime(2026, 9, 26, 20, 0))
    add_session(db, opp, datetime(2026, 9, 26, 20, 0), recurrence_id=saturdays)
    fridays = add_schedule(db, opp, datetime(2026, 9, 18, 18, 0))
    add_session(db, opp, datetime(2026, 9, 18, 18, 0), recurrence_id=fridays)  # past

    [row] = admin_list(client)["opportunities"]

    assert row["schedule"]["weeklyClasses"] == [
        {"days": ["Saturday"], "start": "20:00", "end": "21:00"},
        {"days": ["Sunday"], "start": "09:00", "end": "10:00"},
    ]


def test_drafts_and_closed_opportunities_still_show_their_schedule(client, db, signed_in):
    for status in ("Draft", "Closed"):
        opp = add_opportunity(db, PublishingStatus=status)
        add_session(db, opp, TOMORROW_10AM)

    rows = admin_list(client)["opportunities"]

    assert [row["schedule"]["availableDates"] for row in rows] == [["2026-09-24"], ["2026-09-24"]]


def test_the_schedule_is_empty_without_a_future_non_cancelled_session(client, db, signed_in):
    opp = add_opportunity(db)
    add_session(db, opp, NOW - timedelta(days=1))
    add_session(db, opp, TOMORROW_10AM, cancelled=True)
    add_opportunity(db)  # no Sessions at all

    rows = admin_list(client)["opportunities"]

    assert [row["schedule"] for row in rows] == [None, None]
