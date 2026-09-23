# LyfeGo KOL Portal — Frontend

Creator-facing portal where KOLs browse Sport / Lifestyle collaborations with LyfeGo partners and register for a session.

**Stack:** React 18 · JavaScript (JSX) · Vite 5 · Tailwind CSS 3 · React Router 6

## Run it

```bash
npm install
npm run dev
```

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
  components/                  Layout, FilterBar, OpportunityCard, SessionPicker, FormField, Button, Badge, Icons, …
  context/                     RegistrationContext — chosen session + form draft (sessionStorage-backed)
  hooks/                       useFilters — filter state ⇄ URL search params, filter logic
  lib/                         api (submit stub), format (dates/times), validation (form rules)
  data/                        opportunities.js — all opportunity content
css/
  index.css                  Tailwind entry + base styles / utilities
vite.config.js, tailwind.config.js, postcss.config.js, package.json
```

Import convention: pages reach into `../javascript/...`; `javascript/App.jsx` reaches into `../pages/...`.

## Pages

| Route | Page |
| --- | --- |
| `/` | Opportunity listing with category / collab / location / date / sport filters (state lives in the URL) |
| `/opportunity/:id` | Detail page — hero, about, deliverables, session picker, location, sticky sidebar (mobile: sticky bottom CTA) |
| `/opportunity/:id/register` | Registration form with inline validation |
| `/opportunity/:id/confirmation` | Success page |
| anything else | 404 |

## Hooking up the backend

Only two touch points:

1. **Data** — replace the static `opportunities` array in `javascript/data/opportunities.js` with a fetch. Keep the same field names (`sessions[].date` is an ISO `YYYY-MM-DD`, times are `HH:mm`).
2. **Submit** — replace the body of `submitRegistration()` in `javascript/lib/api.js`. The payload shape is documented at the top of that file. The form expects the promise to resolve with `{ ok, id }` or reject on failure.
