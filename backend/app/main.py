import re
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from mysql.connector.abstracts import MySQLConnectionAbstract

from app.applications import Conflict, Invalid, create_application
from app.clock import now_sgt
from app.db import get_db
from app.opportunities import get_detail, list_discover

app = FastAPI(title="LyfeGo API")


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
    return list_discover(db, now=now)


@app.get("/api/opportunities/{opportunity_id}")
def opportunity_detail(
    opportunity_id: str,
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    # A malformed id is as unknown as a missing one: not found, not a validation error.
    is_id = re.fullmatch(r"[0-9]+", opportunity_id)
    detail = get_detail(db, int(opportunity_id), now=now) if is_id else None
    if detail is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return detail


@app.post("/api/applications", status_code=201)
def submit_application(
    submission: dict,
    response: Response,
    db: MySQLConnectionAbstract = Depends(get_db),
    now: datetime = Depends(now_sgt),
):
    try:
        application_id, created = create_application(db, submission, now=now)
    except Invalid as invalid:
        return JSONResponse(
            status_code=422,
            content={"detail": "Please check the highlighted fields.", "errors": invalid.errors},
        )
    except Conflict as conflict:
        raise HTTPException(status_code=409, detail=str(conflict))
    if not created:
        response.status_code = 200  # a resent submission: the original Application
    return {"id": application_id}
