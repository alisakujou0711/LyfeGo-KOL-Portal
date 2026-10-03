# LyfeGo KOL Portal

Two portals over one shared backend: the **Creator Portal** (`creator-portal/`), where KOLs browse Sport / Lifestyle collaborations with LyfeGo partners and register for a session, and the **Admin Portal** (`admin-portal/`, under `/admin`, being built), where signed-in LyfeGo staff manage them. Both run in the same Vite app and dev server.

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
4. **Create the env file:** copy `backend/.env.example` to `backend/.env` and fill in your MySQL details and the demo Admin's `ADMIN_EMAIL` / `ADMIN_PASSWORD`. `backend/.env` is git-ignored; the API and its tests read credentials only from this file.
5. **Reset and seed the database:** `npm run db:reset` drops the database named in `backend/.env` (normally `lyfego`), recreates its tables and seeds the demo data (see `backend/app/seed.py`). **It deletes everything in that database.** It uses only `backend/.env` (no prompts) and is safe to run as often as you like: run it whenever you want a fresh demo, and after pulling schema changes.
   - **Discover shows nine Opportunities, in the design's order:** Tennis, Pilates, Boxing, Bouldering, Coffee, Recovery, Activewear, Dining and Wellness Product. Two more are reachable only by link: `/opportunity/10`, Yoga Flow with Sublime (fully booked), and `/opportunity/11`, Padel Session (Closed).
   - **Every creator-facing situation is covered:** a weekly class (Tennis, Saturdays 8–9pm), a weekly class on two weekdays (Padel, Tuesdays and Thursdays, Closed until an Admin reopens it), Limited Spots, a Filled Session beside open ones, a cancelled Session, Paid with and without a perk, and Applications in all four statuses.
   - **Session dates are relative to the day you reset** (Singapore Time). Discover's order matches the design for about a week after a reset, so reset again before a demo. A weekly class without an End Date keeps eight weeks of Sessions on its own: any page that reads Sessions generates the ones it's missing, so no reset or cron job is needed for that.
   - **It creates the demo Admin** from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env`, so you can sign in at http://localhost:5173/admin straight after a reset. Without both keys the reset skips the Admin.
   - **To create missing tables without deleting any data,** run `python backend/create_lyfego_db.py`. It also reads `backend/.env`, and asks for credentials only if that file is missing or incomplete.
   - **Registering doesn't fill a Session.** A submitted Application is stored in the `Application` table with Status New. Only **Accepted** Applications take up a Creator Slot, and a Session shows as Filled once its Accepted Applications equal its Creator Slots. Admins review and accept Applications on the Admin Portal's Applications page (`/admin/applications`); accepting is refused when the Session is full, has started or is Cancelled.
6. **Run the portal:** `npm run dev` starts the frontend (http://localhost:5173, Admin Portal at http://localhost:5173/admin) and the API (port 8000) together. The frontend dev server proxies `/api` to the API — check http://localhost:5173/api/health. Discover lists the seeded Opportunities from the database.
7. **Manage Admins:** `npm run admin -- add someone@lyfego.com "Their Name"` asks for a password (at least 8 characters) and adds an Admin; `npm run admin -- remove someone@lyfego.com` removes one and ends their sessions. Every Admin has the same permissions, and there is no sign-up or sign-out in the portal: a sign-in lasts until the browser closes.
8. **Run the tests:** `npm test` runs both suites; `npm run test:web` (Vitest + React Testing Library) and `npm run test:api` (pytest) run one each. The API tests use the MySQL server from `backend/.env` but drop and recreate a separate `lyfego_test` database — your `lyfego` data is never touched.

`npm run build` produces a static bundle in `dist/` (git-ignored); `npm run preview` serves it.

## Folder structure

```
index.html                 # entry HTML (Vite requires this at the root); loads creator-portal/javascript/main.jsx
creator-portal/            # the creator-facing frontend
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
admin-portal/              # the LyfeGo staff frontend under /admin (same layout as creator-portal/)
  pages/                     # one file per route
    SignInPage.jsx               /admin/login
    OpportunitiesPage.jsx        /admin/opportunities (also where /admin lands)
    CreateOpportunityPage.jsx    /admin/create-opportunity
    EditOpportunityPage.jsx      /admin/edit-opportunity/:id
    ApplicationsPage.jsx         /admin/applications
    ComingSoonPage.jsx           /admin/overview, /admin/creators
  javascript/
    AdminRoutes.jsx              the /admin routes, mounted by creator-portal/javascript/App.jsx
    components/                  AdminLayout (Figma sidebar, PageHeader), RequireAdmin (sign-in guard), AdminBadges,
                                 AdminControls (search, filters, list footer), ApplicationPanel (status, corrections, snapshot, session move),
                                 OpportunityForm (the seven-section Create / Edit form), RowMenu (the list's ⋯ menu),
                                 ConfirmDialog (the shared "Are you sure?" pop-up)
    hooks/                       useApiQuery
    lib/                         api (the only Admin module that calls the API), format
public/images/             # served as-is: the header logo and the Tennis hero image
backend/                   # FastAPI service shared by both portals, everything under /api
  app/                         main (routes), opportunities (DB rows → API shape), applications (create an
                               Application: validation, revalidation, snapshot, idempotency), availability
                               (pure rules), clock (SGT "now"), seed (reset + demo data), config (reads backend/.env), db,
                               admins (Admin accounts + sign-in sessions), admin_routes (everything under /api/admin), admin_applications (the Applications list, detail, status changes, contact corrections and moving to another Session),
                               admin_opportunities (the Create / Edit form: load for editing, save, check-only save, publishing rules, stale-edit check; the row menu's reopen, close, duplicate and Delete Draft),
                               schedule (every change to Sessions: one-off rows, Recurring Schedule generation, rolling top-up)
  tests/                       pytest suite against the lyfego_test database
  create_lyfego_db.py          the schema (table DDL), reused by the reset command and tests
  reset_db.py                  npm run db:reset
  manage_admins.py             npm run admin -- add | remove
  requirements.txt, .env.example
vite.config.js, tailwind.config.js, postcss.config.js, package.json
```

Import convention: inside each portal folder, pages reach into `../javascript/...` and `javascript/App.jsx` reaches into `../pages/...`. The Admin Portal may import small shared pieces (components, formatting, `ApiError`) from `creator-portal/javascript/`; the Creator Portal never imports from `admin-portal/`, except `App.jsx` mounting `AdminRoutes`.

## Pages (Creator Portal)

| Route | Page |
| --- | --- |
| `/` | Discover — open Opportunities from the API, with Category, Compensation, Area, Date, Collaboration type and Deliverables filters (state lives in the URL) |
| `/opportunity/:id` | Detail page from the API — hero, about, compensation, deliverables, session picker, location, sticky sidebar (mobile: sticky bottom CTA); Fully booked / Closed links explain themselves, Draft or unknown ids show the 404 |
| `/opportunity/:id/register` | Registration form with inline validation; rechecks the chosen Session on entry (offering a retry if that fails) and submits the Application to the API (retries are idempotent; a Session that filled meanwhile keeps the typed values and asks for another) |
| `/opportunity/:id/confirmation` | Shown only right after a successful submit; a refresh goes back to the Opportunity |
| anything else | 404 |

## Pages (Admin Portal)

Every page except sign-in needs a signed-in Admin; anyone else is sent to `/admin/login` and brought back afterwards. Every `/api/admin/*` endpoint except signing in answers 401 without the session cookie.

| Route | Page |
| --- | --- |
| `/admin/login` | Email + password sign-in (no Figma design); a wrong email or password gets one error that doesn't say which |
| `/admin` | Opens `/admin/opportunities` |
| `/admin/opportunities` | "Creator Opportunities" — summary counts, search and filters (worked out by the API), and every Opportunity oldest first with its schedule summary, "N received" (links to Applications for that Opportunity), Publishing Status and Last Updated |
| `/admin/applications` | Applications: status counts, search, filters and the detail panel (status, corrected details, snapshot, quick links, session move) |
| `/admin/overview`, `/admin/creators` | "Coming soon" placeholders, as in the Figma |

## Tests

- **Frontend** — `*.test.jsx` next to the code. Render real routes with `renderRoute(path, { api })` from `creator-portal/javascript/test/renderRoute.jsx`; `api` maps `"METHOD /path"` to a stubbed response, and any unstubbed request fails the test.
- **API** — `backend/tests/`. The `client` fixture is a FastAPI `TestClient` wired to the freshly recreated `lyfego_test` database; `db` empties every table first and `tests/factories.py` inserts rows; `at(datetime(...))` freezes the API's "now" (naive SGT).
