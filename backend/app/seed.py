"""Drop, recreate and seed the database with the demo roster, dated relative to "today" (SGT).

The roster is the design's nine Opportunities, in the design's order, plus two
reachable only by link. Session days count from Day 0, the first Saturday after
"today", so every Session starts at least a day after "today", each Opportunity
keeps the weekdays the design shows, and Discover's soonest-first order matches
the design's order for the week after a reset, whatever day it runs. After Day
7's Sessions pass, the order drifts; reset again. The demo shows a weekly class,
Limited Spots, a Filled Session beside open ones, a cancelled Session, a fully
booked Opportunity and a Closed one.
"""

import json
from datetime import date, datetime, time, timedelta

from app.applications import historical_snapshot
from app.config import Settings
from app.db import connect
from app.opportunities import get_detail
from create_lyfego_db import create_tables


# A Recurring Schedule without an End Date exposes this window of future Sessions (FS-ADM-SES-008).
ROLLING_WINDOW = timedelta(weeks=8)

SATURDAY = 5  # date.weekday()

# Unsplash photos at the size the design uses.
_UNSPLASH = "https://images.unsplash.com/photo-{}?w=800&h=500&fit=crop&auto=format"


def _session(day, start, end, slots, application_statuses=(), *, cancelled=False):
    """A Session on Day `day` (Day 0 is the first Saturday after today) with `slots`
    Creator Slots and one Application per status.
    """
    return {"day": day, "start": start, "end": end, "slots": slots,
            "statuses": application_statuses, "cancelled": cancelled}


def _weekly(weekday, start, end, default_slots, application_statuses_by_week=None):
    """A weekly Recurring Schedule with no End Date; week `n`'s Session gets one Application per status."""
    return {"weekday": weekday, "start": start, "end": end, "slots": default_slots,
            "statuses": application_statuses_by_week or {}}


# Text, images, deliverables and "Who this is for" rows come from the design;
# compensation comes from the teammate's data (Dummy_values.py). Days are
# chosen so each Opportunity's next Available Session comes after the one
# before it: Day 0 is a Saturday, Day 1 a Sunday, Day 3 a Tuesday.
OPPORTUNITIES = [
    {
        "Title": "Tennis Group Class",
        "PartnerBrandName": "The Best Group",
        "Category": "Sport",
        "Subcategory": "Tennis",
        "HeroImageURL": "/images/tennis-hero.jpg",
        "AboutExperience": (
            "Join a beginner tennis class run by The Best Group — a friendly, welcoming session designed "
            "for creators who are brand-new to the game or have only played a handful of times. A qualified "
            "coach will take you through the fundamentals in a relaxed, supportive environment. Great for "
            "authentic content that shows your audience something genuinely new."
        ),
        "CompensationType": "Paid",
        "PaidCurrency": "SGD",
        "PaidAmount": 150,
        "PaidPaymentBasis": "Per completed collaboration",
        "CollaborationType": "One-off",
        "DeliverableType": "Fixed",
        "ExperienceSkillLevel": "Beginner",
        "AreaNeighbourhood": "Kallang",
        "VenueName": "Kallang Tennis Centre",
        "FullAddress": "52 Stadium Road, Singapore 397724",
        "deliverables": [
            "Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the experience",
            "Tag @lyfego.sg and @thebestgroup in your post and caption",
            "Content to be posted within 7 days of attending the session",
            "Story or feed post shared to your audience at the time of posting",
        ],
        "info": [("Equipment", "Racquets can be provided if needed")],
        # Saturdays 8–9pm from Day 0; the second Saturday is Filled.
        "weekly": [_weekly(SATURDAY, time(20), time(21), 2, {0: ["New"], 1: ["Accepted", "Accepted", "New"]})],
        "sessions": [
            _session(3, time(19), time(20), 3, ["Reviewing"]),
        ],
    },
    {
        "Title": "Reformer Pilates Experience",
        "PartnerBrandName": "CARVE Pilates Studio",
        "Category": "Sport",
        "Subcategory": "Pilates",
        "HeroImageURL": _UNSPLASH.format("1571019614242-c5c5dee9f50b"),
        "AboutExperience": (
            "CARVE offers one of Singapore's most-loved reformer pilates classes, known for its energetic "
            "coaches and full-body workouts. Join a group class and share the experience with your "
            "followers — strong visual content in a premium studio setting, ideal for fitness and "
            "lifestyle creators."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Complimentary reformer pilates class",
        "CollaborationType": "One-off",
        "DeliverableType": "Flexible",
        "ExperienceSkillLevel": "All Levels",
        "AreaNeighbourhood": "Tanjong Pagar",
        "VenueName": "CARVE Pilates Studio",
        "FullAddress": "1 Tras Link, #03-01, Singapore 078867",
        "deliverables": [
            "1 × Instagram Reel or TikTok featuring the reformer pilates class",
            "Tag @lyfego.sg and @carvepilates in your post and caption",
            "Stories or a feed post shared to your audience — either works",
        ],
        "info": [("Equipment", "Grip socks required (available to purchase at studio)")],
        "sessions": [
            _session(7, time(9), time(10), 4, ["Accepted", "New"]),
            _session(14, time(9), time(10), 5),
            _session(21, time(9), time(10), 5),
        ],
    },
    {
        "Title": "Boxing Class Creator Experience",
        "PartnerBrandName": "Box Office Fitness",
        "Category": "Sport",
        "Subcategory": "Boxing",
        "HeroImageURL": _UNSPLASH.format("1549719386-74dfcbf7dbed"),
        "AboutExperience": (
            "Box Office Fitness runs high-energy boxing classes for all levels. You'll learn proper "
            "technique, work through a structured session, and get a real workout — all in an environment "
            "that makes for great content. You'll be paid for your post and get to attend the class as "
            "part of the deal."
        ),
        "CompensationType": "Paid",
        "PaidCurrency": "SGD",
        "PaidAmount": 100,
        "PaidPaymentBasis": "Per completed collaboration",
        "PaidCompensationNote": "Complimentary boxing class",
        "CollaborationType": "One-off",
        "DeliverableType": "Fixed",
        "ExperienceSkillLevel": "All Levels",
        "AreaNeighbourhood": "Bugis",
        "VenueName": "Box Office Fitness",
        "FullAddress": "470 North Bridge Road, #02-19, Singapore 188735",
        "deliverables": [
            "1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the boxing class",
            "Tag @lyfego.sg and @boxofficefitness.sg in your post and caption",
            "Content to be posted within 7 days of attending the session",
            "Story or feed post shared to your audience at the time of posting",
        ],
        "info": [("Equipment", "Gloves and hand wraps provided")],
        # The second Saturday is Filled, so the open Saturday and Sunday read "Multiple dates available".
        "sessions": [
            _session(7, time(10), time(11), 4, ["Accepted", "New"]),
            _session(8, time(10), time(11), 5, ["Reviewing"]),
            _session(14, time(10), time(11), 3, ["Accepted", "Accepted", "Accepted", "Declined"]),
        ],
    },
    {
        "Title": "Bouldering Experience",
        "PartnerBrandName": "Boulder Movement",
        "Category": "Sport",
        "Subcategory": "Bouldering",
        "HeroImageURL": _UNSPLASH.format("1522163182402-834f871fd851"),
        "AboutExperience": (
            "Boulder Movement is one of Singapore's leading bouldering gyms, with creative problem-sets "
            "across a range of difficulty levels. Whether you're a first-timer or a regular climber, the "
            "gym offers a naturally photogenic setting and an experience that resonates with both sport "
            "and lifestyle audiences."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Complimentary day pass + intro session",
        "CollaborationType": "One-off",
        "DeliverableType": "Flexible",
        "ExperienceSkillLevel": "Beginner",
        "AreaNeighbourhood": "Farrer Road",
        "VenueName": "Boulder Movement — Farrer",
        "FullAddress": "1 Farrer Park Station Road, #04-14, Singapore 217562",
        "deliverables": [
            "1 × Instagram post, Reel or TikTok at Boulder Movement",
            "Tag @lyfego.sg and @bouldermovement.sg in your post and caption",
            "Content format and angle are up to you — authentic is best",
        ],
        "info": [("Equipment", "Climbing shoes and chalk provided")],
        "sessions": [
            _session(8, time(14), time(16), 3, ["New"]),
            _session(15, time(14), time(16), 3),
            _session(21, time(14), time(16), 4),
        ],
    },
    {
        "Title": "Specialty Coffee Experience for Two",
        "PartnerBrandName": "Kurasu Singapore",
        "Category": "Lifestyle",
        "Subcategory": "Coffee",
        "HeroImageURL": _UNSPLASH.format("1495474472287-4d71bcdd2085"),
        "AboutExperience": (
            "Kurasu is a specialty coffee roaster and café known for its single-origin coffees and quiet, "
            "thoughtful spaces. This experience covers specialty coffee for you and a guest — a relaxed, "
            "visually rich occasion ideal for creators with a coffee, food or lifestyle following."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Specialty coffee experience for two",
        "CollaborationType": "One-off",
        "DeliverableType": "Flexible",
        "ExperienceSkillLevel": "Not Applicable",
        "AreaNeighbourhood": "Keong Saik",
        "VenueName": "Kurasu Singapore",
        "FullAddress": "79 Neil Road, Singapore 088904",
        "deliverables": [
            "1 × Instagram feed post, Reel or TikTok featuring the coffee experience",
            "Tag @lyfego.sg and @kurasucoffee in your post and caption",
            "Authentic representation of the experience — no heavy staging required",
        ],
        "info": [
            ("For", "You and one guest"),
            ("Includes", "Two specialty coffees of your choice"),
        ],
        # 1 + 1 Creator Slots left: Limited Spots.
        "sessions": [
            _session(9, time(10), time(11), 2, ["Accepted", "Declined"]),
            _session(16, time(10), time(11), 3, ["Accepted", "Accepted", "New"]),
        ],
    },
    {
        "Title": "Recovery Experience",
        "PartnerBrandName": "RAPIDÉ Recovery Atelier",
        "Category": "Lifestyle",
        "Subcategory": "Recovery",
        "HeroImageURL": _UNSPLASH.format("1540555700478-4be289fbecef"),
        "AboutExperience": (
            "RAPIDÉ Recovery Atelier offers science-backed recovery sessions using compression therapy, "
            "infrared saunas and cold water immersion. Ideal for sport and wellness creators who want to "
            "showcase recovery as part of an active lifestyle — or simply experience something genuinely "
            "restorative."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Complimentary 60-min recovery session",
        "CollaborationType": "One-off",
        "DeliverableType": "Flexible",
        "ExperienceSkillLevel": "Not Applicable",
        "AreaNeighbourhood": "Orchard",
        "VenueName": "RAPIDÉ Recovery Atelier",
        "FullAddress": "540 Orchard Road, #02-01, Singapore 238884",
        "deliverables": [
            "1 × feed post or Reel featuring the recovery session",
            "Tag @lyfego.sg and @rapideatelier in your post and caption",
            "Stories documenting the session are encouraged but optional",
        ],
        "info": [
            ("Session type", "60-minute recovery session"),
            ("Includes", "Compression therapy, infrared sauna & cold immersion"),
        ],
        "sessions": [
            _session(4, time(11), time(12), 3, cancelled=True),
            _session(10, time(11), time(12), 3, ["Reviewing"]),
        ],
    },
    {
        "Title": "Activewear Creator Campaign",
        "PartnerBrandName": "FullOut Activewear",
        "Category": "Lifestyle",
        "Subcategory": "Activewear",
        "HeroImageURL": _UNSPLASH.format("1483721310020-03333e577078"),
        "AboutExperience": (
            "FullOut is a Singapore-based activewear brand built for movement — functional, well-fitted "
            "pieces designed for the gym and beyond. This is a paid content campaign: you'll receive an "
            "activewear set to keep and be compensated for a post featuring the product in action."
        ),
        "CompensationType": "Paid",
        "PaidCurrency": "SGD",
        "PaidAmount": 200,
        "PaidPaymentBasis": "Per completed collaboration",
        "PaidCompensationNote": "Activewear set (yours to keep)",
        "CollaborationType": "Ongoing",
        "DeliverableType": "Fixed",
        "ExperienceSkillLevel": "Not Applicable",
        # Not attended in person, so no Venue Name or Full Address.
        "AreaNeighbourhood": "Singapore",
        "deliverables": [
            "1 × Instagram Reel or TikTok wearing FullOut activewear in motion",
            "Tag @lyfego.sg and @fulloutactivewear in your post and caption",
            "Post to go live within 14 days of receiving the product",
            "Story or feed post shared to your audience at the time of posting",
        ],
        "info": [
            ("Min. following", "1,000+ on Instagram or TikTok"),
            ("Content niche", "Fitness, sport or active lifestyle"),
        ],
        "sessions": [
            _session(11, time(15), time(16), 4, ["Accepted", "Declined"]),
            _session(18, time(15), time(16), 3),
        ],
    },
    {
        "Title": "Healthy Dining Experience for Two",
        "PartnerBrandName": "Grain Traders",
        "Category": "Lifestyle",
        "Subcategory": "Food",
        "HeroImageURL": _UNSPLASH.format("1512621776951-a57141f2eefd"),
        "AboutExperience": (
            "Grain Traders brings together whole-food, globally inspired dishes in a relaxed fast-casual "
            "setting that photographs beautifully. This experience covers a meal for you and a guest — a "
            "genuine opportunity for food, lifestyle and wellness creators to create authentic content "
            "around a really good meal."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Complimentary dining experience for two",
        "CollaborationType": "One-off",
        "DeliverableType": "Flexible",
        "ExperienceSkillLevel": "Not Applicable",
        "AreaNeighbourhood": "Raffles Place",
        "VenueName": "Grain Traders",
        "FullAddress": "1 Market Street, #01-01, Singapore 048940",
        "deliverables": [
            "1 × feed post or Reel featuring the dining experience",
            "Tag @lyfego.sg and @graintraders.sg in your post and caption",
            "Content can cover the food, the setting or both",
        ],
        "info": [
            ("For", "You and one guest"),
            ("Includes", "Full dining experience for two"),
        ],
        "sessions": [
            _session(12, time(12, 30), time(13, 30), 2, ["New"]),
            _session(19, time(12, 30), time(13, 30), 3),
        ],
    },
    {
        "Title": "Wellness Product Creator Campaign",
        "PartnerBrandName": "Company of Wellness",
        "Category": "Lifestyle",
        "Subcategory": "Wellness",
        "HeroImageURL": _UNSPLASH.format("1556228578-8c89e6adf883"),
        "AboutExperience": (
            "Company of Wellness curates premium wellness products designed for everyday rituals — "
            "supplements, skincare and recovery essentials. This is a paid content campaign: you'll "
            "receive a product bundle to keep and be compensated for a post showcasing the products in "
            "your routine."
        ),
        "CompensationType": "Paid",
        "PaidCurrency": "SGD",
        "PaidAmount": 150,
        "PaidPaymentBasis": "Per completed collaboration",
        "PaidCompensationNote": "Wellness product bundle (yours to keep)",
        "CollaborationType": "Ongoing",
        "DeliverableType": "Fixed",
        "ExperienceSkillLevel": "Not Applicable",
        # Not attended in person, so no Venue Name or Full Address.
        "AreaNeighbourhood": "Singapore",
        "deliverables": [
            "1 × Instagram Reel or TikTok featuring the wellness products in your routine",
            "Tag @lyfego.sg and @companyofwellness in your post and caption",
            "Post to go live within 14 days of receiving the product bundle",
            "Story or feed post shared to your audience at the time of posting",
        ],
        "info": [
            ("Min. following", "1,000+ on Instagram or TikTok"),
            ("Content niche", "Wellness, health or lifestyle"),
        ],
        "sessions": [
            _session(13, time(16), time(17), 4, ["Reviewing"]),
            _session(20, time(16), time(17), 4),
        ],
    },
    {
        "Title": "Yoga Flow with Sublime",
        "PartnerBrandName": "Sublime Yoga Studio",
        "Category": "Lifestyle",
        "Subcategory": "Yoga",
        "HeroImageURL": _UNSPLASH.format("1545205597-3d9d02c29597"),
        "AboutExperience": (
            "Sublime Yoga Studio hosts a Sunday morning vinyasa flow in their light-filled Dempsey "
            "studio. Suitable for all levels, the class moves at a gentle pace with a focus on breath "
            "and mobility — followed by tea in the garden. A calm, aesthetic setting for wellness and "
            "lifestyle content."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Complimentary 75-minute vinyasa flow class",
        "CollaborationType": "One-off",
        "DeliverableType": "Fixed",
        "ExperienceSkillLevel": "All Levels",
        "AreaNeighbourhood": "Dempsey",
        "VenueName": "Sublime Yoga Studio",
        "FullAddress": "7 Dempsey Road, #01-05, Singapore 249671",
        "deliverables": [
            "Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the class",
            "Tag @lyfego.sg and @sublimeyoga in your post and caption",
            "Content to be posted within 7 days of attending the session",
        ],
        "info": [("Equipment", "Mats and props provided")],
        # Every Session Filled: fully booked, reachable only by link.
        "sessions": [
            _session(1, time(9), time(10, 15), 2, ["Accepted", "Accepted", "New"]),
            _session(8, time(9), time(10, 15), 1, ["Accepted"]),
        ],
    },
    {
        "Title": "Padel Session",
        "PartnerBrandName": "Rally Padel Club",
        "Category": "Sport",
        "Subcategory": "Padel",
        "HeroImageURL": _UNSPLASH.format("1646649853703-7645147474ba"),
        "AboutExperience": (
            "Try padel, the fast-growing racquet sport, with a coached doubles session at Rally Padel "
            "Club. You'll learn the basics of the serve, volley and wall play before a friendly match — "
            "quick rallies that make for energetic content."
        ),
        "CompensationType": "Barter",
        "BarterDescription": "Complimentary 90-minute coached padel session",
        "CollaborationType": "One-off",
        "DeliverableType": "Fixed",
        "ExperienceSkillLevel": "Beginner",
        "AreaNeighbourhood": "Kallang",
        "VenueName": "Rally Padel Club",
        "FullAddress": "Stadium Walk, Kallang, Singapore 397698",
        "deliverables": [
            "Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the session",
            "Tag @lyfego.sg and @rallypadel in your post and caption",
        ],
        "info": [("Equipment", "Racquets and balls provided")],
        # Closed by LyfeGo Admin: reachable only by link, whatever its Sessions say.
        "PublishingStatus": "Closed",
        "sessions": [
            _session(4, time(18), time(19, 30), 4, ["New"]),
        ],
    },
]


def reset_database(settings: Settings, *, today: date) -> None:
    """Drop and recreate `settings.db_name`, then seed it. Safe to run repeatedly."""
    conn = connect(settings, select_database=False)
    try:
        cursor = conn.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{settings.db_name}`")
        cursor.execute(f"CREATE DATABASE `{settings.db_name}`")
        cursor.execute(f"USE `{settings.db_name}`")
        create_tables(cursor)
        for opportunity in OPPORTUNITIES:
            _seed_opportunity(conn, opportunity, today)
        conn.commit()
    finally:
        conn.close()


def _seed_opportunity(conn, opportunity: dict, today: date) -> None:
    cursor = conn.cursor()
    nested = ("deliverables", "info", "sessions", "weekly")
    row = {"PublishingStatus": "Live", **{key: value for key, value in opportunity.items() if key not in nested}}
    opp_id = _insert(cursor, "Opportunity", row)
    for item in opportunity["deliverables"]:
        _insert(cursor, "DeliverableItems", {"OpportunityID": opp_id, "ItemDescription": item})
    for label, value in opportunity["info"]:
        _insert(cursor, "AdditionalInformation", {"OpportunityID": opp_id, "Label": label, "Value": value})
    day_zero = _first_after(today, SATURDAY)
    sessions = [{**session, "date": day_zero + timedelta(days=session["day"])}
                for session in opportunity["sessions"]]
    for schedule in opportunity.get("weekly", []):
        sessions += _insert_schedule(cursor, opp_id, schedule, today)
    session_ids = [
        _insert(cursor, "Session", {
            "OpportunityID": opp_id,
            "SessionDate": session["date"],
            "StartTime": session["start"],
            "EndTime": session["end"],
            "CreatorSlots": session["slots"],
            "IsCancelled": session["cancelled"],
            "RecurrenceID": session.get("recurrence_id"),
        })
        for session in sessions
    ]

    # Applications were submitted yesterday and decided later that day, against
    # the terms the Opportunity shows now.
    submitted_at = datetime.combine(today - timedelta(days=1), time(9))
    decided_at = submitted_at + timedelta(hours=8)
    detail = get_detail(conn, opp_id, now=submitted_at)
    for session_index, (session, session_id) in enumerate(zip(sessions, session_ids)):
        session_times = {
            "date": session["date"].isoformat(),
            "start": session["start"].strftime("%H:%M"),
            "end": session["end"].strftime("%H:%M"),
        }
        for application_index, status in enumerate(session["statuses"]):
            demo_id = f"{opp_id}{session_index}{application_index}"
            creator = {
                "fullName": f"Demo Creator {demo_id}",
                "instagram": f"democreator{demo_id}",
                "tiktok": None,
                "email": f"creator{demo_id}@example.com",
                "phone": "+65 9123 4567",
                "note": None,
            }
            _insert(cursor, "Application", {
                "OpportunityID": opp_id,
                "OriginalSessionID": session_id,
                "CurrentSessionID": session_id,
                "Status": status,
                "FullName": creator["fullName"],
                "InstagramHandle": creator["instagram"],
                "EmailAddress": creator["email"],
                "MobileWhatsAppNumber": creator["phone"],
                "SubmissionSnapshot": json.dumps(historical_snapshot(detail, session_times, creator)),
                "SubmittedAt": submitted_at,
                "ReviewingAt": None if status == "New" else decided_at,
                "AcceptedAt": decided_at if status == "Accepted" else None,
                "DeclinedAt": decided_at if status == "Declined" else None,
            })


def _insert_schedule(cursor, opp_id: int, schedule: dict, today: date) -> list[dict]:
    """Insert a weekly Recurring Schedule starting on its first weekday after today, and return
    its Sessions for the rolling window, each with its date, the schedule's default Creator Slots
    and its `recurrence_id`.
    """
    first = _first_after(today, schedule["weekday"])
    recurrence_id = _insert(cursor, "RecurringSchedule", {
        "OpportunityID": opp_id,
        "StartDate": first,
        "EndDate": None,
        "DayFrequency": "Weekly",
        "StartTime": schedule["start"],
        "EndTime": schedule["end"],
        "DefaultCreatorSlots": schedule["slots"],
    })
    weeks = range((today + ROLLING_WINDOW - first).days // 7 + 1)
    return [
        {"date": first + timedelta(weeks=week), "start": schedule["start"], "end": schedule["end"],
         "slots": schedule["slots"], "statuses": schedule["statuses"].get(week, ()), "cancelled": False,
         "recurrence_id": recurrence_id}
        for week in weeks
    ]


def _first_after(today: date, weekday: int) -> date:
    """The first date after `today` falling on `weekday`; a week later when `today` is that weekday."""
    return today + timedelta(days=(weekday - today.weekday() - 1) % 7 + 1)


def _insert(cursor, table: str, row: dict) -> int:
    columns = ", ".join(row)
    placeholders = ", ".join(["%s"] * len(row))
    cursor.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", list(row.values()))
    return cursor.lastrowid
