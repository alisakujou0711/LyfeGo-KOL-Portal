"""Drop, recreate and seed the database named in backend/.env: npm run db:reset"""

from app.clock import now_sgt
from app.config import load_settings
from app.seed import OPPORTUNITIES, reset_database

if __name__ == "__main__":
    settings = load_settings()
    today = now_sgt().date()
    reset_database(settings, today=today)
    print(f"\nReset '{settings.db_name}' and seeded {len(OPPORTUNITIES)} Opportunities dated from {today} (SGT).")
    if settings.admin_email and settings.admin_password:
        print(f"Created the demo Admin {settings.admin_email}: sign in at /admin.")
    else:
        print("No demo Admin: add ADMIN_EMAIL and ADMIN_PASSWORD to backend/.env (see .env.example) and reset again.")
