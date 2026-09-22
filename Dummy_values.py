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

        # Fetch OpportunityIDs for linking
        cursor.execute("SELECT OpportunityID FROM Opportunity ORDER BY OpportunityID")
        opp_ids = [row[0] for row in cursor.fetchall()]

        # Retrieve standard deliverable IDs
        cursor.execute("SELECT StandardDeliverableItemID FROM StandardDeliverableItems ORDER BY StandardDeliverableItemID")
        standard_deliverable_ids = [row[0] for row in cursor.fetchall()]

        # Link every opportunity with every standard deliverable
        opportunity_deliverable_links = []
        for opp_id in opp_ids:
            for std_deliv_id in standard_deliverable_ids:
                opportunity_deliverable_links.append((opp_id, std_deliv_id))

        cursor.executemany("""
            INSERT INTO OpportunityDeliverableTemplates (OpportunityID, StandardDeliverableItemID) VALUES (%s, %s)
        """, opportunity_deliverable_links)
        db.commit()
        print("Inserted OpportunityDeliverableTemplates data.")

        # AdditionalInformation (2 per opportunity)
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

        # Sessions data
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

        # Recurring schedule (example)
        cursor.execute("""
            INSERT INTO RecurringSchedule (OpportunityID, StartDate, EndDate, DayFrequency, StartTime, EndTime, DefaultCreatorSlots)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (opp_ids[1], '2026-09-23', None, 'Weekly', '19:00:00', '20:00:00', 12))
        db.commit()
        print("Inserted RecurringSchedule data.")

        # Fetch sessions for applications
        cursor.execute("SELECT SessionID FROM Session ORDER BY SessionID")
        session_ids = [row[0] for row in cursor.fetchall()]

        # Applications 
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
             '{"Title":"Reformer Pilates Experience","PartnerBrandName":"CARVE Pilates Studio","Category":"Sport","CompensationType":"Barter"}', None, datetime(2026,9,9)),

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
