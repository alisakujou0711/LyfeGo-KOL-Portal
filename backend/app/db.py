from collections.abc import Iterator

import mysql.connector
from fastapi import Depends
from mysql.connector.abstracts import MySQLConnectionAbstract

from app.config import Settings, get_settings


def connect(settings: Settings, *, select_database: bool = True) -> MySQLConnectionAbstract:
    """Connect to the configured database, or just the server when `select_database` is False.

    The session time zone is Singapore Time, so TIMESTAMP columns (e.g.
    `Application.SubmittedAt`) are written and read as SGT whatever the server's
    own zone is.
    """
    return mysql.connector.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name if select_database else None,
        time_zone="+08:00",
    )


def get_db(settings: Settings = Depends(get_settings)) -> Iterator[MySQLConnectionAbstract]:
    """FastAPI dependency: one connection per request."""
    conn = connect(settings)
    try:
        yield conn
    finally:
        conn.close()
