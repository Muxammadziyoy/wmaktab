# wMaktab - static version (HTML + CSS + JS + JSON)

Same app, same look, same features as the Flask version, but with **no server**.
Host it on GitHub Pages as-is.

## Deploy on GitHub Pages
1. Create a repository and upload **the contents of this folder** (index.html must be in the repo root).
2. Settings -> Pages -> Deploy from a branch -> `main` / `(root)`.
3. Open `https://<user>.github.io/<repo>/`.

Local test (needed because the browser must `fetch` data/db.json): `python3 -m http.server 8000` then open http://localhost:8000

## Demo accounts
| Role | Username | Password |
|---|---|---|
| Student | student | student123 |
| Teacher | teacher | teacher123 |
| Administrator | admin | admin123 |

## How it works
* `data/db.json` - the JSON database (users, grades, attendance, timetable, homework, news...).
* `js/backend.js` - replaces Flask/SQLite/C++: the same `/api/...` routes, validation, role permissions, lock-out after 5 failed logins and the statistics engine (means, medians, quality/success rates, quarter and year marks), all in the browser.
* `js/script.js`, `css/style.css`, `*.html` - your original front end, unchanged apart from paths.
* On first visit the JSON is copied into the browser's localStorage; every change (grades, attendance, users...) is saved there. Demo dates are shifted by whole weeks so "today" always has fresh data.
* **Changes are per browser and per device** (they are not shared between visitors). For the presentation use one browser/laptop.
* Reset the demo: login page -> "Reset demo data". Export the current data: run `WM.exportJSON()` in the browser console.
* Passwords are stored as salted SHA-256 hashes inside the JSON. This is not real security (anyone can read data/db.json) - fine for an MVP demo only.

## Rebuild the seed data (optional)
`python3 tools/gen_seed.py path/to/original/database.py` regenerates `data/db.json` using the original seeder.
