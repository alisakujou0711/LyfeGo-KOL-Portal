from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.clock import now_sgt
from app.config import get_settings, load_settings
from app.db import connect
from app.main import app
from create_lyfego_db import TABLES, create_tables

# Hard-coded so a misconfigured env file can never point the drop below at the
# real database.
TEST_DB_NAME = "lyfego_test"


@pytest.fixture(scope="session")
def test_settings():
    """Settings from backend/.env, pointed at a freshly recreated test database."""
    settings = replace(load_settings(), db_name=TEST_DB_NAME)
    conn = connect(settings, select_database=False)
    try:
        cursor = conn.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{TEST_DB_NAME}`")
        cursor.execute(f"CREATE DATABASE `{TEST_DB_NAME}`")
        cursor.execute(f"USE `{TEST_DB_NAME}`")
        create_tables(cursor)
    finally:
        conn.close()
    return settings


@pytest.fixture
def db(test_settings):
    """A connection to the test database, with every table emptied first."""
    conn = connect(test_settings)
    try:
        cursor = conn.cursor()
        for table_name, _ in reversed(TABLES):
            cursor.execute(f"DELETE FROM `{table_name}`")
        conn.commit()
        yield conn
    finally:
        conn.close()


@pytest.fixture
def client(test_settings):
    app.dependency_overrides[get_settings] = lambda: test_settings
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def at():
    """Freeze the API's clock: `at(datetime(...))` sets "now" (naive SGT) for later requests."""

    def freeze(now):
        app.dependency_overrides[now_sgt] = lambda: now

    return freeze
