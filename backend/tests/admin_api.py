"""Calls to the Admin API that several test modules share: the Create / Edit
Opportunity form, saving it and reading back what it stored."""

# What the form sends when nothing has been typed: only its defaults.
EMPTY_FORM = {
    "title": "", "partner": "", "category": "Sport", "subcategory": "", "heroImage": "",
    "aboutExperience": "",
    "compensationType": "Barter", "whatCreatorReceives": "",
    "currency": "SGD", "paymentAmount": None, "paymentBasis": None, "paymentNotes": "",
    "collaborationType": "One-off",
    "deliverableType": "Fixed", "deliverableNote": "", "deliverables": [""],
    "experienceLevels": ["All Levels"], "additionalInfo": [],
    "scheduleType": "specific",
    "sessions": [{"date": "", "start": "", "end": "", "slots": ""}],
    "recurring": {"days": [], "start": "", "end": "", "startDate": "", "endDate": "", "slots": ""},
    "venueName": "", "fullAddress": "", "area": "",
    "publishingStatus": "Draft",
}

FILLED_FORM = {
    **EMPTY_FORM,
    "title": "Bouldering Experience",
    "partner": "Boulder Movement",
    "category": "Sport",
    "subcategory": "Bouldering",
    "heroImage": "https://images.example/boulder.jpg",
    "aboutExperience": "An intro bouldering session.",
    "compensationType": "Paid",
    "currency": "USD",
    "paymentAmount": 150,
    "paymentBasis": "Per post",
    "paymentNotes": "Paid within 14 days",
    "collaborationType": "One-off or Ongoing",
    "deliverableType": "Flexible",
    "deliverableNote": "Final deliverables agreed with the partner.",
    "deliverables": ["1 × Instagram Reel", "3 × Stories"],
    "experienceLevels": ["Intermediate"],
    "additionalInfo": [{"label": "Equipment", "value": "Climbing shoes provided"}],
    "sessions": [
        {"date": "2026-09-30", "start": "18:00", "end": "19:30", "slots": "3"},
        {"date": "2026-10-02", "start": "09:00", "end": "10:00", "slots": "4"},
    ],
    "venueName": "Boulder Movement Tai Seng",
    "fullAddress": "18 Tai Seng Street",
    "area": "Tai Seng",
}

# Tuesdays and Saturdays 8-9pm from NOW, with no End Date.
TUE_AND_SAT = {"days": ["Tue", "Sat"], "start": "20:00", "end": "21:00",
               "startDate": "2026-09-23", "endDate": "", "slots": "3"}


def weekly_form(recurring=TUE_AND_SAT, **changes):
    """A form that passes the Live checks with a Recurring Schedule and no one-off Sessions."""
    return {**FILLED_FORM, "scheduleType": "recurring", "recurring": recurring, "sessions": [],
            "publishingStatus": "Live", **changes}


def create(client, form):
    return client.post("/api/admin/opportunities", json=form)


def created(client, form):
    response = create(client, form)
    assert response.status_code == 201, response.json()
    return response.json()


def editing(client, opportunity_id):
    response = client.get(f"/api/admin/opportunities/{opportunity_id}")
    assert response.status_code == 200, response.json()
    return response.json()


def save(client, opportunity_id, form):
    return client.put(f"/api/admin/opportunities/{opportunity_id}", json=form)


def form_of(saved):
    """The form fields of a saved Opportunity, as the edit page sends them back: without
    its id and version, and with its Session rows' ids, so the save keeps those Sessions."""
    return {key: value for key, value in saved.items() if key not in ("id", "version")}


def resave(client, loaded, **changes):
    """Save `loaded` (as the edit page loaded it) again with `changes`."""
    return save(client, loaded["id"], {**form_of(loaded), **changes, "version": loaded["version"]})


def resaved(client, loaded, **changes):
    """`resave`, which must succeed; returns the Opportunity as saved."""
    response = resave(client, loaded, **changes)
    assert response.status_code == 200, response.json()
    return response.json()


def admin_row(client, opportunity_id):
    """The Opportunity's row on the Admin list, or None when it isn't listed."""
    rows = client.get("/api/admin/opportunities").json()["opportunities"]
    return next((r for r in rows if r["id"] == str(opportunity_id)), None)


def discover_ids(client):
    return [card["id"] for card in client.get("/api/opportunities").json()]


def stored_sessions(db, opportunity_id):
    """Every stored Session of the Opportunity as (date, start, slots, cancelled, generated)."""
    db.commit()  # end the connection's snapshot so the API's commits are visible
    cursor = db.cursor(dictionary=True)
    cursor.execute("""SELECT SessionDate, StartTime, CreatorSlots, IsCancelled, RecurrenceID FROM Session
                       WHERE OpportunityID = %s ORDER BY SessionDate, StartTime""", (opportunity_id,))
    return [(row["SessionDate"].isoformat(), str(row["StartTime"])[:-3].zfill(5), row["CreatorSlots"],
             bool(row["IsCancelled"]), row["RecurrenceID"] is not None) for row in cursor.fetchall()]


def generated_session_id(db, opportunity_id, day: str):
    """The id of the Session the Recurring Schedule generated on `day`."""
    db.commit()
    cursor = db.cursor()
    cursor.execute("""SELECT SessionID FROM Session
                       WHERE OpportunityID = %s AND SessionDate = %s AND RecurrenceID IS NOT NULL""",
                   (opportunity_id, day))
    [(session_id,)] = cursor.fetchall()
    return session_id
