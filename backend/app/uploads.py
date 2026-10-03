"""Cover images uploaded from the Admin form (FS-ADM-FLD-009, to_ask.md D3).

An upload is a JPEG, PNG or WebP of at most 5 MB (our choice), told apart by its
first bytes, never by the name or type the browser sends. Each is stored under a
random name in the uploads folder (`Settings.uploads_dir`, git-ignored) and served
to anyone at UPLOADS_URL, as the Creator Portal shows it. The Opportunity stores
that URL like a pasted one.
"""

import re
import secrets
from collections.abc import AsyncIterator
from pathlib import Path

MAX_BYTES = 5 * 1024 * 1024
UPLOADS_URL = "/api/uploads"

WRONG_TYPE = "Upload a JPEG, PNG or WebP image"
TOO_LARGE = "The image must be 5 MB or smaller"

MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
_NAME_RE = re.compile(rf"[0-9a-f]{{32}}\.({'|'.join(MEDIA_TYPES)})")


class Refused(Exception):
    """Not an image the portal takes; the message says why, for the Admin."""


async def store_upload(chunks: AsyncIterator[bytes], directory: Path) -> str:
    """Store the uploaded bytes and return the URL that serves them; raises Refused."""
    content = bytearray()
    async for chunk in chunks:
        content += chunk
        if len(content) > MAX_BYTES:
            raise Refused(TOO_LARGE)
    extension = _extension(bytes(content[:12]))
    if extension is None:
        raise Refused(WRONG_TYPE)
    name = f"{secrets.token_hex(16)}.{extension}"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(content)
    return f"{UPLOADS_URL}/{name}"


def uploaded_file(directory: Path, name: str) -> tuple[Path, str] | None:
    """The stored upload called `name` and its media type, or None when there's none."""
    match = _NAME_RE.fullmatch(name)
    path = directory / name
    if match is None or not path.is_file():
        return None
    return path, MEDIA_TYPES[match.group(1)]


def _extension(head: bytes) -> str | None:
    """The file's format from its signature, or None when it isn't one the portal takes."""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None
