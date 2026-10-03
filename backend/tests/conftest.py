import secrets
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.admins import COOKIE, hash_password, token_hash
from app.clock import now_sgt
from app.config import get_settings, load_settings
from app.db import connect
from app.main import app
from create_lyfego_db import TABLES, create_tables
from tests.factories import NOW

# Hard-coded so a misconfigured env file can never point the drop below at the
# real database.
TEST_DB_NAME = "lyfego_test"


@pytest.fixture(scope="session")
def test_settings(tmp_path_factory):
    """Settings from backend/.env, pointed at a freshly recreated test database and
    an empty uploads folder."""
    settings = replace(load_settings(), db_name=TEST_DB_NAME, uploads_dir=tmp_path_factory.mktemp("uploads"))
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


@pytest.fixture
def frozen_now(at):
    """Freeze the API's clock at factories.NOW; a module opts in with
    `pytestmark = pytest.mark.usefixtures("frozen_now")`."""
    at(NOW)


@pytest.fixture(scope="session")
def admin_password_hash():
    # Hashed once per run: the password hash is slow on purpose. test_admin_sign_in
    # covers signing in itself.
    return hash_password("correct horse battery")


@pytest.fixture
def sign_in(client, test_settings, admin_password_hash):
    """`sign_in()` adds an Admin and signs `client` in as them, as signing in does:
    a session row and its token in the cookie."""

    def sign_in_as_admin():
        token = secrets.token_urlsafe(32)
        conn = connect(test_settings)
        try:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO AdminUser (Email, PasswordHash, Name) VALUES (%s, %s, %s)",
                           ("staff@lyfego.test", admin_password_hash, "Staff"))
            cursor.execute("INSERT INTO AdminSession (TokenHash, AdminUserID) VALUES (%s, %s)",
                           (token_hash(token), cursor.lastrowid))
            conn.commit()
        finally:
            conn.close()
        client.cookies.set(COOKIE, token, domain="testserver.local", path="/api")

    return sign_in_as_admin


@pytest.fixture
def signed_in(db, sign_in):
    """Signs `client` in as an Admin (after `db` has emptied the tables)."""
    sign_in()
