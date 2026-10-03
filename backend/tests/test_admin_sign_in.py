from dataclasses import replace
from datetime import date

import pytest

from app.admins import add_admin
from app.main import app
from app.seed import reset_database
from manage_admins import main as manage_admins

EMAIL = "staff@lyfego.test"
PASSWORD = "correct horse battery"
SIGN_IN_FAILED = {"detail": "Incorrect email or password."}


@pytest.fixture
def admin(db):
    add_admin(db, email=EMAIL, password=PASSWORD, name="Staff Member")


def _sign_in(client, email=EMAIL, password=PASSWORD):
    return client.post("/api/admin/session", json={"email": email, "password": password})


def test_signing_in_returns_the_admin_and_sets_a_browser_session_cookie(client, admin):
    response = _sign_in(client)

    assert response.status_code == 200
    assert response.json() == {"email": EMAIL, "name": "Staff Member"}
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Max-Age" not in cookie and "expires" not in cookie.lower()  # ends when the browser closes


def test_the_email_is_matched_ignoring_case_and_surrounding_spaces(client, admin):
    assert _sign_in(client, email="  Staff@LyfeGo.test ").status_code == 200


@pytest.mark.parametrize("email, password", [
    (EMAIL, "wrong password"),
    ("nobody@lyfego.test", PASSWORD),
    ("", ""),
])
def test_a_wrong_email_or_password_gets_the_same_error(client, admin, email, password):
    response = _sign_in(client, email=email, password=password)

    assert response.status_code == 401
    assert response.json() == SIGN_IN_FAILED
    assert "set-cookie" not in response.headers


def test_a_malformed_sign_in_gets_the_same_error(client, admin):
    response = client.post("/api/admin/session", json={"email": ["x"], "password": None})

    assert response.status_code == 401
    assert response.json() == SIGN_IN_FAILED


def test_the_session_endpoint_needs_a_signed_in_admin(client, admin):
    assert client.get("/api/admin/session").status_code == 401

    _sign_in(client)  # the TestClient keeps the cookie

    response = client.get("/api/admin/session")
    assert response.status_code == 200
    assert response.json() == {"email": EMAIL, "name": "Staff Member"}


def test_a_made_up_session_cookie_is_refused(client, admin):
    client.cookies.set("lyfego_admin", "not-a-real-token")

    assert client.get("/api/admin/session").status_code == 401


def test_every_admin_endpoint_refuses_a_visitor_who_is_not_signed_in(client):
    admin_routes = [
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/admin/")
        for method in operations
        if (method, path) != ("post", "/api/admin/session")
    ]
    assert admin_routes, "expected at least one guarded Admin endpoint"

    for method, path in admin_routes:
        response = client.request(method, path.replace("{", "").replace("}", ""), json={})
        assert response.status_code == 401, f"{method} {path}"


def test_the_creator_endpoints_stay_public(client):
    assert client.get("/api/opportunities").status_code == 200


def test_the_script_adds_and_removes_an_admin(client, db, test_settings):
    added = manage_admins(["add", "new@lyfego.test", "New Admin"], settings=test_settings,
                          ask_password=lambda prompt: "a long enough password")
    assert added == 0
    assert _sign_in(client, "new@lyfego.test", "a long enough password").status_code == 200

    removed = manage_admins(["remove", "new@lyfego.test"], settings=test_settings)
    assert removed == 0
    assert _sign_in(client, "new@lyfego.test", "a long enough password").status_code == 401
    assert client.get("/api/admin/session").status_code == 401  # their session ended too


def test_the_script_refuses_a_duplicate_email_a_short_password_and_an_unknown_admin(db, test_settings):
    def add(password):
        return manage_admins(["add", EMAIL, "Staff"], settings=test_settings, ask_password=lambda prompt: password)

    assert add("short") == 1
    assert add(PASSWORD) == 0
    assert add(PASSWORD) == 1
    assert manage_admins(["remove", "nobody@lyfego.test"], settings=test_settings) == 1


def test_a_database_reset_creates_the_demo_admin_from_the_env_file(client, test_settings):
    settings = replace(test_settings, admin_email="demo@lyfego.test", admin_password="demo password 1")

    reset_database(settings, today=date(2026, 9, 23))

    assert _sign_in(client, "demo@lyfego.test", "demo password 1").status_code == 200
