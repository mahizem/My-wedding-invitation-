# Habesha Orthodox Wedding Invitation (full project)

Needs **Node.js 22.5 or newer** (https://nodejs.org). No `npm install` is needed.

## Run it
    ADMIN_PASSWORD=choose-a-strong-password node server.js
(Windows PowerShell:  `$env:ADMIN_PASSWORD="choose-a-strong-password"; node server.js`)
Open http://localhost:3000   |  Admin: http://localhost:3000/admin

## What to edit (all wedding info is in 2 files)
- `public/js/weddingConfig.js`: names, date, time, timezone, venue, map, phone, music file, Our Story text.
- `public/js/weddingProgram.js`: the wedding program (add / delete / reorder lines, replace "--:--" with real times).
- The Amharic invitation text is in `public/index.html`, inside the `home` section.

## Music
Copy your mp3 to `public/music/wedding-song.mp3` (or use another name and set `music:` in weddingConfig.js).
Music starts when the guest taps "Open Invitation". If no file exists, the music button hides itself.

## Date / venue / map
- Date: change `date`, `time` (24h), `dateLabelEnglish`, `dateLabelAmharic`. Countdown, calendar grid, Google/Apple/Outlook buttons all follow.
- Venue: fill `venue.name`, `venue.address`, and either `latitude` + `longitude` (shows an exact map) and/or `googleMapsUrl` (paste the Google Maps "Share" link; used by "Get Directions"). Without coordinates, no map is shown and Directions does a Google Maps search of the address.

## Photos, wishes, RSVP (admin)
Open `/admin`, enter ADMIN_PASSWORD. Every guest photo and wish is **pending** until you press Approve. Reject hides it, Delete removes it (photo files are deleted too). RSVPs show totals and can be downloaded as CSV.

## How photos are stored
The guest's phone shrinks each photo (max 1600 px JPEG), the server re-checks it (JPEG type, size ≤ 5 MB, valid start/end bytes), saves it under a random name in `data/uploads/`, and records id, file, guest name, message, status and time in the SQLite database `data/wedding.db`. Image files are never stored inside the database. Only approved photos are served publicly.

## Database tables (SQLite, created automatically)
`photos(id,file,guest_name,message,status,created_at)`, `wishes(id,name,message,status,created_at)`, `rsvps(id,name,guests,attending,message,created_at)`.
You said you have no existing PostgreSQL project, so I used SQLite (a single file, easy backup). Back up the whole `data/` folder.

## API
Public: `GET /api/photos`, `GET /api/wishes` (approved only), `POST /api/photos`, `POST /api/wishes`, `POST /api/rsvp`.
Admin (header `x-admin-key`): `GET /api/admin/all`, `GET /api/admin/rsvps.csv`, `POST /api/admin/{photos|wishes|rsvps}/:id/{approve|reject|delete}`.

## QR code
`/photos` opens the same page; the QR encodes `window.location.origin + "/photos"`, so it updates by itself on your real domain. Use "Download / print QR" (1200 px PNG). Print it at least 4 cm wide.

## Security included
Server-side validation of all input, parameterised SQL, text cleaning (HTML characters removed, length limits), page shows user text safely (never as HTML), upload type/size/signature checks, per-IP rate limit (40 posts / 10 min), admin password with timing-safe compare, path-traversal protection. Use HTTPS (your host provides it) and a long ADMIN_PASSWORD.

## Deploy to your domain
This needs a host that runs Node and has a **persistent disk** (uploads + database live in `data/`). Static-only hosts (GitHub Pages, Netlify drop) will NOT work.
1. Upload the project to Render / Railway / Fly.io / a VPS.
2. Start command: `node server.js`. Set env `ADMIN_PASSWORD`, and `DATA_DIR` to the mounted disk path (e.g. `/var/data`).
3. Point your domain to it in the host's dashboard (HTTPS is automatic).
4. Open https://YOUR-DOMAIN/photos once to confirm, then download the QR.
