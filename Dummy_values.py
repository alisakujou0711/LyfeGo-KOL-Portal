import mysql.connector
import getpass
from datetime import datetime

def insert_full_dataset():
    user = 'root'  # Adjust if needed
    password = getpass.getpass("MySQL password: ") # ur MySQL 

    try:
        db = mysql.connector.connect(host='localhost', user=user, password=password, database='lyfego')
        cursor = db.cursor()

        # Insert Opportunities
        opportunities = [
            ('Reformer Pilates Experience', 'CARVE Pilates Studio', 'Sport', 'Pilates', None,
             "CARVE offers one of Singapore's most-loved reformer pilates classes, known for its energetic coaches and full-body workouts.",
             'Barter', None, None, None, None, "Complimentary reformer pilates class",
             'One-off', 'Fixed', None, 'All levels', 'Tanjong Pagar', 'CARVE Pilates Studio', '1 Tras Link, #03-01, Singapore 078867', 'Live'),

            ('Tennis Group Class', 'The Best Group', 'Sport', 'Tennis', None,
             "Join a beginner tennis class run by The Best Group — friendly for beginners.",
             'Paid', 'SGD', 150.00, 'Per completed collaboration', None, None,
             'One-off', 'Fixed', None, 'Beginner', 'Kallang', 'Kallang Tennis Centre', '52 Stadium Road, Singapore 397724', 'Live'),

            ('Boxing Class Creator Experience', 'Box Office Fitness', 'Sport', 'Boxing', None,
             "Box Office Fitness runs high-energy boxing classes for all levels. Get paid to post.",
             'Paid', 'SGD', 100.00, 'Per completed collaboration', 'Complimentary boxing class', None,
             'One-off', 'Fixed', None, 'All levels', 'Bugis', 'Box Office Fitness', '470 North Bridge Road, #02-19, Singapore 188735', 'Live'),

            ('Bouldering Experience', 'Boulder Movement', 'Sport', 'Bouldering', None,
             "Boulder Movement is one of Singapore's leading bouldering gyms for all levels.",
             'Barter', None, None, None, None, "Complimentary day pass + intro session",
             'One-off', 'Fixed', None, 'Beginner', 'Farrer Road', 'Boulder Movement — Farrer', '1 Farrer Park Station Road, #04-14, Singapore 217562', 'Draft'),

            ('Specialty Coffee Experience for Two', 'Kurasu Singapore', 'Lifestyle', 'Coffee', None,
             "Specialty coffee experience for you and a guest at Kurasu, a specialty coffee roaster and café.",
             'Barter', None, None, None, None, "Specialty coffee experience for two",
             'One-off', 'Flexible', None, 'Not Applicable', 'Keong Saik', 'Kurasu Singapore', '79 Neil Road, Singapore 088904', 'Live'),

            ('Recovery Experience', 'RAPIDÉ Recovery Atelier', 'Lifestyle', 'Recovery', None,
             "RAPIDÉ Recovery Atelier offers science-backed recovery sessions using compression therapy, infrared saunas and cold water immersion.",
             'Barter', None, None, None, None, "Complimentary 60-min recovery session",
             'One-off', 'Fixed', None, 'Not Applicable', 'Orchard', 'RAPIDÉ Recovery Atelier', '540 Orchard Road, #02-01, Singapore 238884', 'Closed'),

            ('Activewear Creator Campaign', 'FullOut Activewear', 'Lifestyle', 'Activewear', None,
             "FullOut is a Singapore-based activewear brand built for movement.",
             'Paid', 'SGD', 200.00, 'Per completed collaboration', 'Activewear set (yours to keep)', None,
             'Ongoing', 'Fixed', None, 'Not Applicable', '-', '-', '-', 'Draft'),

            ('Healthy Dining Experience for Two', 'Grain Traders', 'Lifestyle', 'Food', None,
             "Grain Traders brings together whole-food, globally inspired dishes in a relaxed fast-casual setting.",
             'Barter', None, None, None, None, "Complimentary dining experience for two",
             'One-off', 'Fixed', None, 'Not Applicable', 'Raffles Place', 'Grain Traders', '1 Market Street, #01-01, Singapore 048940', 'Live'),

            ('Wellness Product Creator Campaign', 'Company of Wellness', 'Lifestyle', 'Wellness', None,
             "Company of Wellness curates premium wellness products designed for everyday rituals.",
             'Paid', 'SGD', 150.00, 'Per completed collaboration', 'Wellness product bundle (yours to keep)', None,
             'Ongoing', 'Fixed', None, 'Not Applicable', '-', '-', '-', 'Live'),
        ]
        cursor.executemany("""
            INSERT INTO Opportunity 
            (Title, PartnerBrandName, Category, Subcategory, HeroImageURL, AboutExperience, CompensationType, PaidCurrency, PaidAmount, PaidPaymentBasis, PaidCompensationNote, BarterDescription,
             CollaborationType, DeliverableType, DeliverableNote, ExperienceSkillLevel, AreaNeighbourhood, VenueName, FullAddress, PublishingStatus)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """, opportunities)
        db.commit()
        print("Inserted Opportunities data.")
        # Fetch OpportunityIDs after insertion
        cursor.execute("SELECT OpportunityID FROM Opportunity ORDER BY OpportunityID")
        opp_ids = [row[0] for row in cursor.fetchall()]

        # Define detailed deliverables per opportunity index
        all_deliverables = {
            0: [  # for opp_ids[0] - Reformer Pilates Experience
                "1 × Instagram Reel or TikTok featuring the reformer pilates class",
                "Tag @lyfego.sg and @carvepilates in your post and caption",
                "Stories or a feed post shared to your audience — either works"
            ],
            1: [  # for opp_ids[1] - Tennis Group Class
                "Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the experience",
                "Tag @lyfego.sg and @thebestgroup in your post and caption",
                "Content to be posted within 7 days of attending the session",
                "Story or feed post shared to your audience at the time of posting"
            ],
            2: [  # for opp_ids[2] - Boxing Class Creator Experience
                "1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the boxing class",
                "Tag @lyfego.sg and @boxofficefitness.sg in your post and caption",
                "Content to be posted within 7 days of attending the session",
                "Story or feed post shared to your audience at the time of posting"
            ],
            3: [  # for opp_ids[3] - Bouldering Experience
                "1 × Instagram post, Reel or TikTok at Boulder Movement",
                "Tag @lyfego.sg and @bouldermovement.sg in your post and caption",
                "Content format and angle are up to you — authentic is best"
            ],
            4: [  # for opp_ids[4] - Specialty Coffee Experience for Two
                "1 × Instagram feed post, Reel or TikTok featuring the coffee experience",
                "Tag @lyfego.sg and @kurasucoffee in your post and caption",
                "Authentic representation of the experience — no heavy staging required"
            ],
            5: [  # for opp_ids[5] - Recovery Experience
                "1 × feed post or Reel featuring the recovery session",
                "Tag @lyfego.sg and @rapideatelier in your post and caption",
                "Stories documenting the session are encouraged but optional"
            ],
            6: [  # for opp_ids[6] - Activewear Creator Campaign
                "1 × Instagram Reel or TikTok wearing FullOut activewear in motion",
                "Tag @lyfego.sg and @fulloutactivewear in your post and caption",
                "Post to go live within 14 days of receiving the product",
                "Story or feed post shared to your audience at the time of posting"
            ],
            7: [  # for opp_ids[7] - Healthy Dining Experience for Two
                "1 × feed post or Reel featuring the dining experience",
                "Tag @lyfego.sg and @graintraders.sg in your post and caption",
                "Content can cover the food, the setting or both"
            ],
            8: [  # for opp_ids[8] - Wellness Product Creator Campaign
                "1 × Instagram Reel or TikTok featuring the wellness products in your routine",
                "Tag @lyfego.sg and @companyofwellness in your post and caption",
                "Post to go live within 14 days of receiving the product bundle",
                "Story or feed post shared to your audience at the time of posting"
            ],
        }

        # Build deliverables list for insertion
        deliverables = []
        for idx, opp_id in enumerate(opp_ids):
            items = all_deliverables.get(idx, [])
            for item in items:
                deliverables.append((opp_id, item))

        cursor.executemany("""
            INSERT INTO DeliverableItems (OpportunityID, ItemDescription) VALUES (%s, %s)
        """, deliverables)
        db.commit()
        print("Inserted DeliverableItems data.")

        # Insert AdditionalInformation (2 per opportunity)
        additional_info = []
        for opp_id in opp_ids:
            additional_info.extend([
                (opp_id, "Equipment", "Provided or bring your own"),
                (opp_id, "Skill Level", "Refer to opportunity details"),
            ])
        cursor.executemany("""
            INSERT INTO AdditionalInformation (OpportunityID, Label, Value) VALUES (%s, %s, %s)
        """, additional_info)
        db.commit()
        print("Inserted AdditionalInformation data.")

        # Insert Sessions
        sessions = [
            (opp_ids[0], '2026-09-27', '09:00:00', '10:00:00', 10, 'Available', False, None),
            (opp_ids[0], '2026-10-04', '09:00:00', '10:00:00', 10, 'Available', False, None),
            (opp_ids[0], '2026-10-11', '09:00:00', '10:00:00', 10, 'Available', False, None),

            (opp_ids[1], '2026-09-23', '19:00:00', '20:00:00', 12, 'Available', False, None),

            (opp_ids[2], '2026-09-27', '10:00:00', '11:00:00', 15, 'Available', False, None),
            (opp_ids[2], '2026-09-28', '10:00:00', '11:00:00', 15, 'Available', False, None),
            (opp_ids[2], '2026-10-04', '10:00:00', '11:00:00', 15, 'Available', False, None),

            (opp_ids[3], '2026-09-21', '14:00:00', '16:00:00', 10, 'Available', False, None),
            (opp_ids[3], '2026-09-28', '14:00:00', '16:00:00', 10, 'Available', False, None),
            (opp_ids[3], '2026-10-04', '14:00:00', '16:00:00', 10, 'Available', False, None),
        ]
        cursor.executemany("""
            INSERT INTO Session (OpportunityID, SessionDate, StartTime, EndTime, CreatorSlots, AvailabilityStatus, IsCancelled, RecurrenceID)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, sessions)
        db.commit()
        print("Inserted Sessions data.")

        # Insert RecurringSchedule example
        cursor.execute("""
            INSERT INTO RecurringSchedule (OpportunityID, StartDate, EndDate, DayFrequency, StartTime, EndTime, DefaultCreatorSlots)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (opp_ids[1], '2026-09-23', None, 'Weekly', '19:00:00', '20:00:00', 12))
        db.commit()
        print("Inserted RecurringSchedule data.")

        # Fetch Sessions for Applications
        cursor.execute("SELECT SessionID FROM Session ORDER BY SessionID")
        session_ids = [row[0] for row in cursor.fetchall()]

        # Insert Applications
        applications = [
            (opp_ids[1], session_ids[3], session_ids[3], 'Accepted', "Sarah Tan", "@sarahtan.fit", "@sarahtan.fit",
             "sarah.tan@gmail.com", "+65 9111 2233",
             "I've been playing tennis recreationally for 2 years and love photogenic outdoor court sessions.",
             None, None, None, None, None,
             '{"Title":"Tennis Group Class","PartnerBrandName":"The Best Group","Category":"Sport","CompensationType":"Paid"}', 'Intermediate', datetime(2026,9,10)),

            (opp_ids[1], session_ids[4], session_ids[4], 'Reviewing', "Marcus Lim", "@marcuslim.sg", None,
             "marcus.lim@gmail.com", "+65 8222 3344",
             "Tennis content performs really well on my feed.",
             None, None, None, None, None,
             '{"Title":"Tennis Group Class","PartnerBrandName":"The Best Group","Category":"Sport","CompensationType":"Paid"}', 'Beginner', datetime(2026,9,11)),

            (opp_ids[1], session_ids[5], session_ids[5], 'New', "Priya Nair", "@priyafitness", "@priyafitness",
             "priya.n@email.com", "+65 9333 4455",
             None,
             None, None, None, None, None,
             '{"Title":"Tennis Group Class","PartnerBrandName":"The Best Group","Category":"Sport"}', 'Beginner', datetime(2026,9,13)),

            (opp_ids[0], session_ids[0], session_ids[0], 'Accepted', "Natasha Lim", "@natasha.moves", "@natashamoves",
             "natasha.lim@gmail.com", "+65 9555 6677",
             "CARVE is one of my favourite studios.",
             None, None, None, None, None,
             '{"Title":"Reformer Pilates Experience","PartnerBrandName":"CARVE Pilates Studio","Category":"Sport","CompensationType":"Barter"}', "Beginner", datetime(2026,9,9)),

            (opp_ids[2], session_ids[6], session_ids[6], 'Accepted', "Ryan Tan", "@ryanboxes", "@ryanboxes",
             "ryan.tan@gmail.com", "+65 9123 0011",
             "I've done boxing before and my audience loves combat sport content.",
             None, None, None, None, None,
             '{"Title":"Boxing Class Creator Experience","PartnerBrandName":"Box Office Fitness","Category":"Sport","CompensationType":"Paid"}', 'Intermediate', datetime(2026,9,8)),
        ]
        cursor.executemany("""
            INSERT INTO Application
            (OpportunityID, OriginalSessionID, CurrentSessionID, Status, FullName, InstagramHandle, TikTokHandle,
             EmailAddress, MobileWhatsAppNumber, CreatorNote, CorrectedFullName, CorrectedInstagramHandle,
             CorrectedTikTokHandle, CorrectedEmailAddress, CorrectedMobileWhatsAppNumber,
             SubmissionSnapshot, ExperienceSkillLevel, SubmittedAt)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, applications)
        db.commit()
        print("Inserted Applications data.")
        cursor.close()
        db.close()
        print("\nFull rich dummy data inserted successfully. Ready for use!")

    except mysql.connector.Error as err:
        print(f"Error inserting data: {err}")

if __name__ == "__main__":
    insert_full_dataset()
