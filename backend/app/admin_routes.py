"""The Admin Portal's API. Everything under /api/admin needs a signed-in Admin,
except signing in itself."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from mysql.connector.abstracts import MySQLConnectionAbstract

from app import admin_opportunities
from app.admin_applications import NotFound, get_application, list_applications, update_application
from app.admins import COOKIE, SIGN_IN_FAILED, current_admin, sign_in
from app.clock import now_sgt
from app.config import Settings, get_settings
from app.db import get_db
from app.opportunities import list_for_admin
from app.schedule import top_up_rolling_windows
from app.uploads import MAX_BYTES, TOO_LARGE, Refused, store_upload

APPLICATION_NOT_FOUND = "Application not found"
OPPORTUNITY_NOT_FOUND = "Opportunity not found"

sign_in_router = APIRouter(prefix="/api/admin")

# Every other Admin endpoint goes on this router, so none can skip the check.
router = APIRouter(prefix="/api/admin", dependencies=[Depends(current_admin)])


@sign_in_router.post("/session")
def create_session(body: dict, response: Response, db: MySQLConnectionAbstract = Depends(get_db)):
    email, password = body.get("email"), body.get("password")
    signed_in = (
        sign_in(db, email, password) if isinstance(email, str) and isinstance(password, str) else None
    )
    if signed_in is None:
        raise HTTPException(status_code=401, detail=SIGN_IN_FAILED)
    token, admin = signed_in
    # No max_age or expires: the cookie lasts until the browser closes. There is no sign-out (C10).
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict", path="/api")
    return admin


@router.get("/session")
def get_session(admin: dict = Depends(current_admin)):
    return admin


@router.get("/opportunities")
def list_opportunities(
    search: str = "",
    status: str = "",
    category: str = "",
    compensation: str = "",
    collaborationType: str = "",
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    """Every Opportunity matching the search and filters, oldest first, with the summary counts."""
    top_up_rolling_windows(db, now=now)
    return list_for_admin(db, now=now, search=search, status=status, category=category,
                          compensation=compensation, collaboration_type=collaborationType)


@router.post("/opportunities", status_code=201)
def create_opportunity(
    body: dict, check: bool = False, db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    """Save the Create Opportunity form in the Publishing Status it asks for and return it as
    the edit page loads it. 422 for a bad field, a status other than Draft or Live, or a
    failed Live check (app.main's handler). With `?check=true`, only checks: 204, nothing stored."""
    opportunity_id = admin_opportunities.create_opportunity(db, body, now=now, check=check)
    if check:
        return Response(status_code=204)
    return admin_opportunities.get_for_editing(db, opportunity_id, now=now)


@router.get("/opportunities/{opportunity_id}")
def opportunity_for_editing(
    opportunity_id: str, db: MySQLConnectionAbstract = Depends(get_db), now: datetime = Depends(now_sgt),
):
    """Every field of one Opportunity for the edit page, with its version token."""
    top_up_rolling_windows(db, now=now)
    try:
        return admin_opportunities.get_for_editing(db, opportunity_id, now=now)
    except admin_opportunities.NotFound:
        raise HTTPException(status_code=404, detail=OPPORTUNITY_NOT_FOUND)


@router.put("/opportunities/{opportunity_id}")
def save_opportunity(
    opportunity_id: str,
    body: dict,
    check: bool = False,
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    """Save the edit form over an Opportunity in the Publishing Status it asks for and return
    it reloaded: 422 for a bad field, a move the publishing rules don't allow or a failed Live
    check, 409 when someone else saved it since `body["version"]` was loaded. With
    `?check=true`, only checks: 204, nothing stored."""
    try:
        admin_opportunities.update_opportunity(db, opportunity_id, body, now=now, check=check)
        if check:
            return Response(status_code=204)
        return admin_opportunities.get_for_editing(db, opportunity_id, now=now)
    except admin_opportunities.NotFound:
        raise HTTPException(status_code=404, detail=OPPORTUNITY_NOT_FOUND)


@router.post("/opportunities/{opportunity_id}/publish")
def publish_opportunity(
    opportunity_id: str, check: bool = False, db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    """The row menu's Reopen Opportunity: make a Closed Opportunity Live as it is stored
    and return it as the edit page loads it. 422 with the Live checks' errors, keyed as
    the edit page shows them; 409 when it's Live already or someone saved it meanwhile.
    With `?check=true`, only checks: 204, nothing stored."""
    top_up_rolling_windows(db, now=now)
    if check:
        try:
            admin_opportunities.publish_opportunity(db, opportunity_id, now=now, check=True)
        except admin_opportunities.NotFound:
            raise HTTPException(status_code=404, detail=OPPORTUNITY_NOT_FOUND)
        return Response(status_code=204)
    return _after(admin_opportunities.publish_opportunity, db, opportunity_id, now)


@router.post("/opportunities/{opportunity_id}/close")
def close_opportunity(
    opportunity_id: str, db: MySQLConnectionAbstract = Depends(get_db), now: datetime = Depends(now_sgt),
):
    """Close a Live Opportunity, keeping its Sessions and Applications; 409 when it isn't Live."""
    return _after(admin_opportunities.close_opportunity, db, opportunity_id, now)


@router.delete("/opportunities/{opportunity_id}", status_code=204)
def delete_opportunity(opportunity_id: str, db: MySQLConnectionAbstract = Depends(get_db)):
    """Delete a Draft that has never been Live or had an Application, with everything it
    has; 409 for any other Opportunity."""
    try:
        admin_opportunities.delete_draft(db, opportunity_id)
    except admin_opportunities.NotFound:
        raise HTTPException(status_code=404, detail=OPPORTUNITY_NOT_FOUND)
    return Response(status_code=204)


@router.post("/opportunities/{opportunity_id}/duplicate", status_code=201)
def duplicate_opportunity(
    opportunity_id: str, db: MySQLConnectionAbstract = Depends(get_db), now: datetime = Depends(now_sgt),
):
    """Copy an Opportunity into a new Draft and return the copy as the edit page loads it."""
    try:
        copy_id = admin_opportunities.duplicate_opportunity(db, opportunity_id, now=now)
    except admin_opportunities.NotFound:
        raise HTTPException(status_code=404, detail=OPPORTUNITY_NOT_FOUND)
    return admin_opportunities.get_for_editing(db, copy_id, now=now)


def _after(action, db, opportunity_id: str, now: datetime) -> dict:
    """Run a row-menu `action` on the Opportunity and return it as the edit page loads it."""
    try:
        action(db, opportunity_id, now=now)
        return admin_opportunities.get_for_editing(db, opportunity_id, now=now)
    except admin_opportunities.NotFound:
        raise HTTPException(status_code=404, detail=OPPORTUNITY_NOT_FOUND)


@router.post("/uploads", status_code=201)
async def upload_image(request: Request, settings: Settings = Depends(get_settings)):
    """Store a cover image sent as the request body and return its URL: 422 when it isn't
    a JPEG, PNG or WebP of at most 5 MB, with the reason as the detail."""
    try:
        if int(request.headers.get("content-length") or 0) > MAX_BYTES:
            raise Refused(TOO_LARGE)
        return {"url": await store_upload(request.stream(), settings.uploads_dir)}
    except Refused as refused:
        raise HTTPException(status_code=422, detail=str(refused))


@router.get("/applications")
def applications(
    search: str = "",
    opportunityId: str = "",
    partner: str = "",
    status: str = "",
    category: str = "",
    db: MySQLConnectionAbstract = Depends(get_db),
):
    """Every Application matching the search and filters, newest first, with the status counts."""
    return list_applications(db, search=search, opportunity_id=opportunityId, partner=partner,
                             status=status, category=category)


@router.get("/applications/{application_id}")
def application_detail(
    application_id: str, db: MySQLConnectionAbstract = Depends(get_db), now: datetime = Depends(now_sgt),
):
    """One Application for the detail panel, with the Sessions it can be moved to."""
    top_up_rolling_windows(db, now=now)
    try:
        return get_application(db, application_id, now=now)
    except NotFound:
        raise HTTPException(status_code=404, detail=APPLICATION_NOT_FOUND)


@router.patch("/applications/{application_id}")
def change_application(
    application_id: str,
    body: dict,
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    """Change any of the Application Status, contact details and Current Session: 422 for a
    bad or unknown field (app.main's handler), 409 when accepting or moving would overbook,
    or the Session has started, is Cancelled or belongs to another Opportunity."""
    try:
        return update_application(db, application_id, body, now=now)
    except NotFound:
        raise HTTPException(status_code=404, detail=APPLICATION_NOT_FOUND)
