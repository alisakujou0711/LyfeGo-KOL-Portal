import re
from collections.abc import Iterator
from contextlib import contextmanager

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


def contains_pattern(text: str) -> str:
    """A LIKE pattern, for use with ESCAPE '\\', matching values that contain
    `text` with its wildcard characters taken literally."""
    return "%" + re.sub(r"([\\%_])", r"\\\1", text) + "%"


@contextmanager
def transaction(conn: MySQLConnectionAbstract, *, isolation_level: str | None = None) -> Iterator[None]:
    """A transaction around the block: committed when it ends, rolled back when it
    raises. It first ends any earlier read's implicit transaction, so it starts fresh."""
    conn.commit()
    conn.start_transaction(isolation_level=isolation_level)
    try:
        yield
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def placeholders(values) -> str:
    """One %s per value, for an IN (...) list or a VALUES row."""
    return ", ".join(["%s"] * len(values))


def insert(cursor, table: str, row: dict) -> int:
    """Insert `row` (column: value) into `table`; returns its new id."""
    cursor.execute(f"INSERT INTO {table} ({', '.join(row)}) VALUES ({placeholders(row)})", list(row.values()))
    return cursor.lastrowid


def update(cursor, table: str, columns: dict, *, where: str, key) -> None:
    """Set `columns` (column: value) on the `table` row whose `where` column is `key`."""
    cursor.execute(
        f"UPDATE {table} SET {', '.join(f'{column} = %s' for column in columns)} WHERE {where} = %s",
        [*columns.values(), key],
    )
