import mysql.connector
import getpass


### please make sure you tick "add path" when u download python, set up MySQL and run "pip install -r backend/requirements.txt", before u run this file
### run it with: python backend/create_lyfego_db.py
### credentials come from backend/.env (see backend/.env.example); you're only asked for them if that file is missing or incomplete
### to wipe and re-seed the database instead, use: npm run db:reset


### table name -> CREATE TABLE statement, in creation order (tables referenced by a foreign key come first).
### the API's reset command and tests reuse these, so this is the one place the schema lives.
TABLES = [
    ### a Paid Opportunity's Payment is PaidCurrency, PaidAmount and PaidPaymentBasis (FLD-002); a Draft may leave them NULL
    ### ExperienceSkillLevel lists its levels comma-separated, e.g. "Beginner,Advanced" (FLD-005)
    ('Opportunity', """
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
    """),

    ('DeliverableItems', """
        CREATE TABLE DeliverableItems (
            DeliverableItemID INT AUTO_INCREMENT PRIMARY KEY,
            OpportunityID INT NOT NULL,
            ItemDescription VARCHAR(500) NOT NULL,
            FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
        );
    """),

    ('AdditionalInformation', """
        CREATE TABLE AdditionalInformation (
            InfoID INT AUTO_INCREMENT PRIMARY KEY,
            OpportunityID INT NOT NULL,
            Label VARCHAR(255) NOT NULL,
            Value VARCHAR(500) NOT NULL,
            FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
        );
    """),

    ### CreatorSlots NULL means not set yet, which only a Draft may have (SES-004): such a Session is never Available
    ### SlotsOverridden: Admin changed this weekly class Session's CreatorSlots on its own (SES-007), so a schedule save keeps it
    ('Session', """
        CREATE TABLE Session (
            SessionID INT AUTO_INCREMENT PRIMARY KEY,
            OpportunityID INT NOT NULL,
            SessionDate DATE NOT NULL,
            StartTime TIME NOT NULL,
            EndTime TIME NOT NULL,
            CreatorSlots INT,
            AvailabilityStatus ENUM('Available', 'Filled', 'Cancelled', 'Expired') NOT NULL DEFAULT 'Available',
            IsCancelled BOOLEAN NOT NULL DEFAULT FALSE,
            SlotsOverridden BOOLEAN NOT NULL DEFAULT FALSE,
            CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            RecurrenceID INT,
            FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
        );
    """),

    ### DefaultCreatorSlots NULL means not set yet, which only a Draft may have (SES-006)
    ('RecurringSchedule', """
        CREATE TABLE RecurringSchedule (
            RecurrenceID INT AUTO_INCREMENT PRIMARY KEY,
            OpportunityID INT NOT NULL,
            StartDate DATE NOT NULL,
            EndDate DATE,
            DayFrequency VARCHAR(50) NOT NULL,
            StartTime TIME NOT NULL,
            EndTime TIME NOT NULL,
            DefaultCreatorSlots INT,
            FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE
        );
    """),

    ### ExperienceSkillLevel is nullable: the creator form doesn't collect it (FLD-006); the Opportunity's level goes in SubmissionSnapshot
    ### SubmissionKey makes submitting idempotent (ERR-005): a resent key returns the original Application; NULL for rows not created by the Creator Portal
    ### Corrected... hold Admin's corrections (APP-022..025); NULL = not corrected, '' = corrected to empty (TikTok)
    ('Application', """
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
            ExperienceSkillLevel VARCHAR(100),
            SubmittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ReviewingAt TIMESTAMP NULL,
            AcceptedAt TIMESTAMP NULL,
            DeclinedAt TIMESTAMP NULL,
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            SubmissionKey VARCHAR(64) NULL UNIQUE,
            FOREIGN KEY (OpportunityID) REFERENCES Opportunity(OpportunityID) ON DELETE CASCADE,
            FOREIGN KEY (OriginalSessionID) REFERENCES Session(SessionID),
            FOREIGN KEY (CurrentSessionID) REFERENCES Session(SessionID)
        );
    """),

    ### Admin accounts (AUTH-001..003): created and removed by backend/manage_admins.py, never in the portal
    ### Email is stored trimmed and lower-case; PasswordHash is a salted scrypt hash, never the password
    ('AdminUser', """
        CREATE TABLE AdminUser (
            AdminUserID INT AUTO_INCREMENT PRIMARY KEY,
            Email VARCHAR(255) NOT NULL UNIQUE,
            PasswordHash VARCHAR(255) NOT NULL,
            Name VARCHAR(255) NOT NULL,
            CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """),

    ### one row per sign-in; TokenHash is the SHA-256 of the cookie's token, so the table alone can't sign anyone in
    ('AdminSession', """
        CREATE TABLE AdminSession (
            TokenHash CHAR(64) PRIMARY KEY,
            AdminUserID INT NOT NULL,
            CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (AdminUserID) REFERENCES AdminUser(AdminUserID) ON DELETE CASCADE
        );
    """),
]


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

def create_tables(cursor): ### creates every table in the currently selected database
    for table_name, create_sql in TABLES:
        create_table_if_not_exists(cursor, table_name, create_sql)

def connection_details(): ### from backend/.env; asks only if that file is missing or incomplete
    from app.config import load_settings
    try:
        s = load_settings()
        return dict(host=s.db_host, port=s.db_port, user=s.db_user, password=s.db_password), s.db_name
    except RuntimeError as err:
        print(f"{err}\nEnter the MySQL details instead.")
        user = input("MySQL user [root]: ") or 'root'
        password = getpass.getpass("MySQL password: ")### ur MySQL password
        return dict(host='localhost', user=user, password=password), 'lyfego'

def create_lyfego_tables():
    connect_args, db_name = connection_details()
    try:
        ### connecting python to MySQL
        db = mysql.connector.connect(**connect_args)
        cursor = db.cursor()

        create_database_if_not_exists(cursor, db_name)
        cursor.execute(f"USE {db_name}")

        #### creating Tables
        create_tables(cursor)

        cursor.close()
        db.close()
        print("\nChecked and created tables where necessary successfully.")

    except mysql.connector.Error as err:
        print(f"Error: {err}")

if __name__ == "__main__":
    create_lyfego_tables()
