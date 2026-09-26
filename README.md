# LyfeGo KOL Portal — Creator Portal

Creator-facing portal where KOLs browse Sport / Lifestyle collaborations with LyfeGo partners and register for a session.

**Stack:** React 18 · JavaScript (JSX) · Vite 5 · Tailwind CSS 3 · React Router 6 — backed by a Python FastAPI service over MySQL (`backend/`).

## Setup

1. **Install MySQL 8** (e.g. MySQL Installer / MySQL Configurator on Windows, `brew install mysql` on macOS) and make sure the server is running. Note the user and password you set.
2. **Install Node 18+ and Python 3.11+.**
3. **Install dependencies** from the repo root:

   ```bash
   npm install
   python -m venv backend/.venv
   ```

   Activate the venv (`backend\.venv\Scripts\activate` on Windows, `source backend/.venv/bin/activate` on macOS/Linux), then:

   ```bash
   pip install -r backend/requirements.txt
   ```

   Keep the venv activated in any terminal where you run `npm run dev` or the tests — the scripts call `python`.
4. **Create the env file:** copy `backend/.env.example` to `backend/.env` and fill in your MySQL details. `backend/.env` is git-ignored; the API and its tests read database credentials only from this file.
5. **Reset and seed the database:** `npm run db:reset` drops the database named in `backend/.env` (normally `lyfego`), recreates its tables and seeds the demo data (see `backend/app/seed.py`). **It deletes everything in that database.** It uses only `backend/.env` (no prompts) and is safe to run as often as you like: run it whenever you want a fresh demo, and after pulling schema changes.
   - **Discover shows nine Opportunities, in the design's order:** Tennis, Pilates, Boxing, Bouldering, Coffee, Recovery, Activewear, Dining and Wellness Product. Two more are reachable only by link: `/opportunity/10`, Yoga Flow with Sublime (fully booked), and `/opportunity/11`, Padel Session (Closed).
   - **Every creator-facing situation is covered:** a weekly class (Tennis, Saturdays 8–9pm), Limited Spots, a Filled Session beside open ones, a cancelled Session, Paid with and without a perk, and Applications in all four statuses.
   - **Session dates are relative to the day you reset** (Singapore Time). Discover's order matches the design for about a week after a reset, so reset again before a demo.
   - **To create missing tables without deleting any data,** run `python backend/create_lyfego_db.py`. It also reads `backend/.env`, and asks for credentials only if that file is missing or incomplete.
   - **Registering doesn't fill a Session.** A submitted Application is stored in the `Application` table with Status New. Only **Accepted** Applications take up a Creator Slot, and a Session shows as Filled once its Accepted Applications equal its Creator Slots. Until the Admin Portal exists, review and accept Applications directly in MySQL (e.g. MySQL Workbench) by setting `Status = 'Accepted'` and `AcceptedAt`.
6. **Run the portal:** `npm run dev` starts the frontend (http://localhost:5173) and the API (port 8000) together. The frontend dev server proxies `/api` to the API — check http://localhost:5173/api/health. Discover lists the seeded Opportunities from the database.
7. **Run the tests:** `npm test` runs both suites; `npm run test:web` (Vitest + React Testing Library) and `npm run test:api` (pytest) run one each. The API tests use the MySQL server from `backend/.env` but drop and recreate a separate `lyfego_test` database — your `lyfego` data is never touched.

`npm run build` produces a static bundle in `dist/` (git-ignored); `npm run preview` serves it.

## Folder structure

```
index.html                 # entry HTML (Vite requires this at the root)
pages/                     # one file per route
  OpportunitiesPage.jsx        /
  OpportunityDetailPage.jsx    /opportunity/:id
  RegisterPage.jsx             /opportunity/:id/register
  ConfirmationPage.jsx         /opportunity/:id/confirmation
  NotFoundPage.jsx             everything else
javascript/                # all non-page JS / JSX
  main.jsx                     mounts <App /> into #root
  App.jsx                      router — maps routes to pages
  components/                  Layout, FilterBar, DateFilter, OpportunityCard, SessionPicker, OpportunityLoadError, FormField, Button, Badge, Icons, …
  context/                     RegistrationContext — chosen session + form draft (sessionStorage-backed), last submission (memory only)
  hooks/                       useDiscoverList — loads Discover from the API; useOpportunity — loads one Opportunity; useFilters — filter state ⇄ URL search params, filter logic
  lib/                         api (the only module that calls the API), format (dates/times/payment), validation (form rules)
  test/                        renderRoute (render routes with stubbed API responses), Vitest setup
css/
  index.css                  Tailwind entry + base styles / utilities
public/images/             # served as-is: the header logo and the Tennis hero image
backend/                   # FastAPI service, everything under /api
  app/                         main (routes), opportunities (DB rows → API shape), applications (create an
                               Application: validation, revalidation, snapshot, idempotency), availability
                               (pure rules), clock (SGT "now"), seed (reset + demo data), config (reads backend/.env), db
  tests/                       pytest suite against the lyfego_test database
  create_lyfego_db.py          the schema (table DDL), reused by the reset command and tests
  reset_db.py                  npm run db:reset
  requirements.txt, .env.example
vite.config.js, tailwind.config.js, postcss.config.js, package.json
```

Import convention: pages reach into `../javascript/...`; `javascript/App.jsx` reaches into `../pages/...`.

## Pages

| Route | Page |
| --- | --- |
| `/` | Discover — open Opportunities from the API, with Category, Compensation, Area, Date, Collaboration type and Deliverables filters (state lives in the URL) |
| `/opportunity/:id` | Detail page from the API — hero, about, compensation, deliverables, session picker, location, sticky sidebar (mobile: sticky bottom CTA); Fully booked / Closed links explain themselves, Draft or unknown ids show the 404 |
| `/opportunity/:id/register` | Registration form with inline validation; rechecks the chosen Session on entry (offering a retry if that fails) and submits the Application to the API (retries are idempotent; a Session that filled meanwhile keeps the typed values and asks for another) |
| `/opportunity/:id/confirmation` | Shown only right after a successful submit; a refresh goes back to the Opportunity |
| anything else | 404 |

## Tests

- **Frontend** — `*.test.jsx` next to the code. Render real routes with `renderRoute(path, { api })` from `javascript/test/renderRoute.jsx`; `api` maps `"METHOD /path"` to a stubbed response, and any unstubbed request fails the test.
- **API** — `backend/tests/`. The `client` fixture is a FastAPI `TestClient` wired to the freshly recreated `lyfego_test` database; `db` empties every table first and `tests/factories.py` inserts rows; `at(datetime(...))` freezes the API's "now" (naive SGT).
