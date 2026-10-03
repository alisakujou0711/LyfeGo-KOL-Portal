# Admin Portal

The LyfeGo staff portal under `/admin`: sign-in, Opportunities, Applications, and the Overview and Creators placeholders. Built ticket by ticket; so far the sign-in, the Figma shell, the Opportunities list and the Applications page (list, detail panel, status changes, corrected contact details, the Historical Snapshot, quick links and moving to another Session) exist.

It runs in the same Vite app and dev server as the Creator Portal (`npm run dev`) and uses the same shared API in `backend/`, whose `/api/admin/*` endpoints need a signed-in Admin. Keep the same layout as `creator-portal/`: `pages/` for one file per route, and `javascript/` for components, hooks and lib. Admin routes are declared in `javascript/AdminRoutes.jsx`, which the app's router mounts at `admin/*`.
