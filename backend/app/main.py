from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from mysql.connector.abstracts import MySQLConnectionAbstract

from app import admin_routes
from app.admins import signed_in_admin
from app.applications import ID_RE, Conflict, Invalid, NotFound, create_application
from app.clock import now_sgt
from app.config import Settings, get_settings
from app.db import get_db
from app.opportunities import get_detail, list_discover
from app.schedule import top_up_rolling_windows
from app.uploads import UPLOADS_URL, uploaded_file

app = FastAPI(title="LyfeGo API")


@app.exception_handler(Invalid)
def invalid_fields(request: Request, invalid: Invalid):
    return JSONResponse(
        status_code=422, content={"detail": "Please check the highlighted fields.", "errors": invalid.errors},
    )


@app.exception_handler(NotFound)
def not_found(request: Request, error: NotFound):
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(Conflict)
def conflict(request: Request, error: Conflict):
    return JSONResponse(status_code=409, content={"detail": str(error)})


app.include_router(admin_routes.sign_in_router)
app.include_router(admin_routes.router)


@app.get("/api/health")
def health(db: MySQLConnectionAbstract = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT DATABASE()")
    (database,) = cursor.fetchone()
    return {"status": "ok", "database": database}


@app.get("/api/opportunities")
def discover(
    db: MySQLConnectionAbstract = Depends(get_db), now: datetime = Depends(now_sgt)
):
    top_up_rolling_windows(db, now=now)
    return list_discover(db, now=now)


@app.get("/api/opportunities/{opportunity_id}")
def opportunity_detail(
    opportunity_id: str,
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
    admin: dict | None = Depends(signed_in_admin),
):
    """An Opportunity's detail. A signed-in Admin also gets a Draft, to preview it (to_ask.md D2)."""
    # A malformed id is as unknown as a missing one: not found, not a validation error.
    detail = None
    if ID_RE.fullmatch(opportunity_id):
        top_up_rolling_windows(db, now=now, opportunity_ids=[int(opportunity_id)])
        detail = get_detail(db, int(opportunity_id), now=now, include_draft=admin is not None)
    if detail is None:
        raise NotFound("Opportunity not found")
    return detail


@app.get(UPLOADS_URL + "/{name}")
def uploaded_image(name: str, settings: Settings = Depends(get_settings)):
    """A cover image uploaded from the Admin form; public, as the Creator Portal shows it."""
    found = uploaded_file(settings.uploads_dir, name)
    if found is None:
        raise HTTPException(status_code=404, detail="Image not found")
    path, media_type = found
    # Every upload gets a new name, so a stored one never changes.
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.post("/api/applications", status_code=201)
def submit_application(
    submission: dict,
    response: Response,
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    application_id, created = create_application(db, submission, now=now)
    if not created:
        response.status_code = 200  # a resent submission: the original Application
    return {"id": application_id}
