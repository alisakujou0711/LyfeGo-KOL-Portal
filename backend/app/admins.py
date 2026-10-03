"""Admin accounts and sign-in sessions (FS-ADM-AUTH-001..003).

Every Admin has the same permissions. Accounts are added and removed by
`backend/manage_admins.py`, never in the portal. Signing in creates a session
whose random token lives only in the Admin's cookie; the database keeps its
SHA-256, so a leaked table can't be used to sign in.
"""

import hashlib
import hmac
import secrets

from fastapi import Depends, HTTPException, Request
from mysql.connector import errorcode
from mysql.connector.abstracts import MySQLConnectionAbstract
from mysql.connector.errors import IntegrityError

from app.db import get_db

COOKIE = "lyfego_admin"
SIGN_IN_FAILED = "Incorrect email or password."
NOT_SIGNED_IN = "Sign in as an Admin to continue."
MIN_PASSWORD_LENGTH = 8

# scrypt's cost settings (the standard library's slow password hash).
_N, _R, _P = 2**14, 8, 1


class AdminExists(Exception):
    """An Admin with that email already exists."""


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def _password_matches(password: str, stored: str) -> bool:
    _, n, r, p, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p))
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


# Checked against when the email is unknown, so both failures take as long.
_UNKNOWN_ADMIN_HASH = hash_password(secrets.token_hex(16))


def _normalised(email: str) -> str:
    return email.strip().lower()


def add_admin(conn: MySQLConnectionAbstract, *, email: str, password: str, name: str) -> None:
    """Store a new Admin; raises AdminExists if the email is taken."""
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO AdminUser (Email, PasswordHash, Name) VALUES (%s, %s, %s)",
            (_normalised(email), hash_password(password), name.strip()),
        )
    except IntegrityError as error:
        conn.rollback()
        if error.errno == errorcode.ER_DUP_ENTRY:
            raise AdminExists(email) from error
        raise
    conn.commit()


def remove_admin(conn: MySQLConnectionAbstract, email: str) -> bool:
    """Delete the Admin and end their sessions; False if there was no such Admin."""
    cursor = conn.cursor()
    cursor.execute("DELETE FROM AdminUser WHERE Email = %s", (_normalised(email),))
    conn.commit()
    return cursor.rowcount == 1


def sign_in(conn: MySQLConnectionAbstract, email: str, password: str) -> tuple[str, dict] | None:
    """A new session token and the Admin, or None when the email or password is wrong."""
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT AdminUserID, Email, Name, PasswordHash FROM AdminUser WHERE Email = %s",
                   (_normalised(email),))
    row = cursor.fetchone()
    matches = _password_matches(password, row["PasswordHash"] if row else _UNKNOWN_ADMIN_HASH)
    if row is None or not matches:
        conn.commit()
        return None
    token = secrets.token_urlsafe(32)
    cursor.execute("INSERT INTO AdminSession (TokenHash, AdminUserID) VALUES (%s, %s)",
                   (token_hash(token), row["AdminUserID"]))
    conn.commit()
    return token, _admin(row)


def admin_for_token(conn: MySQLConnectionAbstract, token: str) -> dict | None:
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """SELECT u.Email, u.Name FROM AdminSession s
             JOIN AdminUser u ON u.AdminUserID = s.AdminUserID
            WHERE s.TokenHash = %s""",
        (token_hash(token),),
    )
    row = cursor.fetchone()
    conn.commit()  # end the read's implicit transaction
    return None if row is None else _admin(row)


def signed_in_admin(request: Request, db: MySQLConnectionAbstract = Depends(get_db)) -> dict | None:
    """FastAPI dependency: the signed-in Admin, or None, for public endpoints that
    show Admins more (e.g. a Draft's preview)."""
    token = request.cookies.get(COOKIE)
    return admin_for_token(db, token) if token else None


def current_admin(admin: dict | None = Depends(signed_in_admin)) -> dict:
    """FastAPI dependency: the signed-in Admin, or 401."""
    if admin is None:
        raise HTTPException(status_code=401, detail=NOT_SIGNED_IN)
    return admin


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _admin(row: dict) -> dict:
    return {"email": row["Email"], "name": row["Name"]}
