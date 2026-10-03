"""Uploading a cover image from the Admin form (Admin ticket 08, to_ask.md D3)."""

import pytest

from tests.admin_api import FILLED_FORM, created


MB = 1024 * 1024

# Just enough of each format for its signature.
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 100
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 100
WEBP = b"RIFF\x64\x00\x00\x00WEBPVP8 " + b"\x00" * 100

WRONG_TYPE = "Upload a JPEG, PNG or WebP image"
TOO_LARGE = "The image must be 5 MB or smaller"


pytestmark = pytest.mark.usefixtures("frozen_now")


def upload(client, content: bytes, content_type="application/octet-stream"):
    return client.post("/api/admin/uploads", content=content, headers={"Content-Type": content_type})


def test_uploading_needs_a_signed_in_admin(client, db):
    assert upload(client, JPEG, "image/jpeg").status_code == 401


@pytest.mark.parametrize("content, content_type, extension", [
    (JPEG, "image/jpeg", "jpg"),
    (PNG, "image/png", "png"),
    (WEBP, "image/webp", "webp"),
])
def test_an_uploaded_image_is_stored_and_served_to_anyone(client, db, signed_in, content, content_type, extension):
    response = upload(client, content)

    assert response.status_code == 201
    url = response.json()["url"]
    assert url.startswith("/api/uploads/") and url.endswith(f".{extension}")
    client.cookies.clear()  # creators aren't signed in
    served = client.get(url)
    assert served.status_code == 200
    assert served.content == content
    assert served.headers["content-type"] == content_type


def test_each_upload_gets_its_own_url(client, db, signed_in):
    assert upload(client, JPEG).json()["url"] != upload(client, JPEG).json()["url"]


@pytest.mark.parametrize("content, content_type", [
    (b"GIF89a" + b"\x00" * 100, "image/gif"),
    (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"),
    (b"not really a png", "image/png"),  # the type is read from the file, not the header
    (b"", "image/jpeg"),
])
def test_anything_but_a_jpeg_png_or_webp_is_refused(client, db, signed_in, content, content_type):
    response = upload(client, content, content_type)

    assert response.status_code == 422
    assert response.json()["detail"] == WRONG_TYPE


def test_an_image_up_to_5_mb_is_accepted_and_a_larger_one_refused(client, db, signed_in):
    assert upload(client, JPEG + b"\x00" * (5 * MB - len(JPEG))).status_code == 201

    response = upload(client, JPEG + b"\x00" * (5 * MB + 1 - len(JPEG)))

    assert response.status_code == 422
    assert response.json()["detail"] == TOO_LARGE


@pytest.mark.parametrize("name", ["missing.jpg", "..%2F.env", "abc.gif"])
def test_an_unknown_upload_is_not_found(client, db, name):
    assert client.get(f"/api/uploads/{name}").status_code == 404


def test_an_uploaded_image_saved_on_an_opportunity_shows_on_both_portals(client, db, signed_in):
    url = upload(client, PNG).json()["url"]

    saved = created(client, {**FILLED_FORM, "heroImage": url, "publishingStatus": "Live"})

    assert saved["heroImage"] == url
    [row] = client.get("/api/admin/opportunities").json()["opportunities"]
    assert row["heroImage"] == url
    [card] = client.get("/api/opportunities").json()
    assert card["heroImage"] == url
