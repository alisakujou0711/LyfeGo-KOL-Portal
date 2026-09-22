import mysql.connector
import getpass


### please make sure you tick "add path" when u download python, set up MySQL and run "pip install mysql-connector-python" in Python MySQL adapter, before u run this file


def create_database_if_not_exists(cursor, db_name): ### to check pre-existing tables to prevent overwritting and loss of data
    cursor.execute(f"SHOW DATABASES LIKE '{db_name}'")
    if cursor.fetchone():
        print(f"Database '{db_name}' already exists.")
    else:
        cursor.execute(f"CREATE DATABASE {db_name}")
        print(f"Created database '{db_name}'.")

def create_table_if_not_exists(cursor, table_name, create_sql):  ### to check pre-existing tables to prevent overwritting and loss of data
    cursor.execute("""
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
    """, (table_name,))
    if cursor.fetchone()[0] == 1:
        print(f"Table '{table_name}' already exists.")
    else:
        cursor.execute(create_sql)
        print(f"Created table '{table_name}'.")

def create_lyfego_tables():
    user = 'root'  ### adjust or parametrize if needed
    password = getpass.getpass("MySQL password: ")### ur MySQL password
    db_name = 'lyfego'
    try:
        ### connecting python to MySQL
        db = mysql.connector.connect(host='localhost', user=user, password=password)
        cursor = db.cursor()
         
        create_database_if_not_exists(cursor, db_name)
        cursor.execute(f"USE {db_name}")
 
        #### creating Tables
        create_table_if_not_exists(cursor, 'Opportunity', """
            CREATE TABLE Opportunity (
                OpportunityID INT AUTO_INCREMENT PRIMARY KEY,
                Title VARCHAR(255) NOT NULL,
                PartnerBrandName VARCHAR(255) NOT NULL,
                Category ENUM('Sport', 'Lifestyle') NOT NULL,
                Subcategory VARCHAR(255),
                HeroImageURL VARCHAR(500),
                AboutExperience TEXT NOT NULL,
                CompensationType ENUM('Barter', 'Paid') NOT NULL,
                PaidCurrency VARCHAR(10),
                PaidAmount DECIMAL(10,2),
                PaidPaymentBasis ENUM('Per completed collaboration', 'Per post', 'Flat fee'),
                PaidCompensationNote TEXT,
                BarterDescription TEXT,
                CollaborationType ENUM('One-off', 'One-off or Ongoing', 'Ongoing') NOT NULL,
                DeliverableType ENUM('Fixed', 'Flexible') NOT NULL,
                DeliverableNote TEXT,
                ExperienceSkillLevel VARCHAR(100) NOT NULL,
                AreaNeighbourhood VARCHAR(255) NOT NULL,
                VenueName VARCHAR(255),
                FullAddress VARCHAR(500),
                PublishingStatus ENUM('Draft', 'Live', 'Closed') NOT NULL DEFAULT 'Draft',
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PublishedAt TIMESTAMP NULL
            );
        """)

        create_table_if_not_exists(cursor, 'DeliverableItems', """
            CREATE TABLE DeliverableItems (
                DeliverableItemID INT AUTO_INCREMENT PRIMARY KEY,
                OpportunityID INT NOT NULL,
                ItemDescription VARCHAR(500) NOT NULL,
                FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
            );
        """)

        create_table_if_not_exists(cursor, 'AdditionalInformation', """
            CREATE TABLE AdditionalInformation (
                InfoID INT AUTO_INCREMENT PRIMARY KEY,
                OpportunityID INT NOT NULL,
                Label VARCHAR(255) NOT NULL,
                Value VARCHAR(500) NOT NULL,
                FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
            );
        """)

        create_table_if_not_exists(cursor, 'Session', """
            CREATE TABLE Session (
                SessionID INT AUTO_INCREMENT PRIMARY KEY,
                OpportunityID INT NOT NULL,
                SessionDate DATE NOT NULL,
                StartTime TIME NOT NULL,
                EndTime TIME NOT NULL,
                CreatorSlots INT NOT NULL,
                AvailabilityStatus ENUM('Available', 'Filled', 'Cancelled', 'Expired') NOT NULL DEFAULT 'Available',
                IsCancelled BOOLEAN NOT NULL DEFAULT FALSE,
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                RecurrenceID INT,
                FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
            );
        """)

        create_table_if_not_exists(cursor, 'RecurringSchedule', """
            CREATE TABLE RecurringSchedule (
                RecurrenceID INT AUTO_INCREMENT PRIMARY KEY,
                OpportunityID INT NOT NULL,
                StartDate DATE NOT NULL,
                EndDate DATE,
                DayFrequency VARCHAR(50) NOT NULL,
                StartTime TIME NOT NULL,
                EndTime TIME NOT NULL,
                DefaultCreatorSlots INT NOT NULL,
                FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
            );
        """)

        create_table_if_not_exists(cursor, 'Application', """
            CREATE TABLE Application (
                ApplicationID INT AUTO_INCREMENT PRIMARY KEY,
                OpportunityID INT NOT NULL,
                OriginalSessionID INT NOT NULL,
                CurrentSessionID INT NOT NULL,
                Status ENUM('New', 'Reviewing', 'Accepted', 'Declined') NOT NULL DEFAULT 'New',
                FullName VARCHAR(255) NOT NULL,
                InstagramHandle VARCHAR(255) NOT NULL,
                TikTokHandle VARCHAR(255),
                EmailAddress VARCHAR(255) NOT NULL,
                MobileWhatsAppNumber VARCHAR(50) NOT NULL,
                CreatorNote TEXT,
                CorrectedFullName VARCHAR(255),
                CorrectedInstagramHandle VARCHAR(255),
                CorrectedTikTokHandle VARCHAR(255),
                CorrectedEmailAddress VARCHAR(255),
                CorrectedMobileWhatsAppNumber VARCHAR(50),
                SubmissionSnapshot LONGTEXT NOT NULL,
                SubmittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ReviewingAt TIMESTAMP NULL,
                AcceptedAt TIMESTAMP NULL,
                DeclinedAt TIMESTAMP NULL,
                UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE,
                FOREIGN KEY (OriginalSessionID) REFERENCES Session(SessionID),
                FOREIGN KEY (CurrentSessionID) REFERENCES Session(SessionID)
            );
        """)

        cursor.close()
        db.close()
        print("\nChecked and created tables where necessary successfully.")

    except mysql.connector.Error as err:
        print(f"Error: {err}")

if __name__ == "__main__":
    create_lyfego_tables()
