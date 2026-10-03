"""Add or remove an Admin (FS-ADM-AUTH-003: accounts are managed outside the portal).

    npm run admin -- add someone@lyfego.com "Their Name"    (asks for the password)
    npm run admin -- remove someone@lyfego.com               (also ends their sessions)

Uses the database named in backend/.env.
"""

import getpass
import sys

from app.admins import MIN_PASSWORD_LENGTH, AdminExists, add_admin, remove_admin
from app.config import Settings, load_settings
from app.db import connect

USAGE = 'usage: npm run admin -- add EMAIL "NAME"  |  npm run admin -- remove EMAIL'


def main(argv: list[str], *, settings: Settings | None = None, ask_password=getpass.getpass) -> int:
    """Run the command in `argv`; returns the exit code."""
    if argv[:1] == ["add"] and len(argv) == 3:
        _, email, name = argv
        password = ask_password(f"Password for {email}: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"The password must be at least {MIN_PASSWORD_LENGTH} characters.")
            return 1
        return _with_db(settings, lambda conn: _add(conn, email, password, name))
    if argv[:1] == ["remove"] and len(argv) == 2:
        return _with_db(settings, lambda conn: _remove(conn, argv[1]))
    print(USAGE)
    return 2


def _add(conn, email, password, name) -> int:
    try:
        add_admin(conn, email=email, password=password, name=name)
    except AdminExists:
        print(f"An Admin with the email {email} already exists.")
        return 1
    print(f"Added Admin {email}.")
    return 0


def _remove(conn, email) -> int:
    if not remove_admin(conn, email):
        print(f"There is no Admin with the email {email}.")
        return 1
    print(f"Removed Admin {email}.")
    return 0


def _with_db(settings, command) -> int:
    conn = connect(settings or load_settings())
    try:
        return command(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
